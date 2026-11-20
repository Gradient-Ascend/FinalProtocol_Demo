import { bossOf, livingEnemies, sameCoord } from './battle-rules'
import { AttackFx } from './attack-fx'
import { inAttackRange } from './attack-methods'
import { desireInRange, predictedEnemyIntent, predictedEnemySequence } from './enemy-attack-methods'
import { disclosed } from './mechanics'
import type { BattleStore } from './battle-store'
import type { AttackEffect, BattleState, Coord, FlagKind } from './battle-types'
import type { Encounter, GodId } from './encounters'
import { MONO } from '../cinematic/display'
import { ROMAN, WITHHELD } from '../ui/battle-text'

const COLORS = {
  bg: '#090909', cell: '#0D0D0D', grid: '#343434', wall: '#272727',
  white: '#F4F4F4', light: '#D8D8D8', muted: '#777777', faint: '#484848',
  blue: '#79BFFF', red: '#FF7070',
}

// ── The sign under a campaign board ──────────────────────────────────────
// Every campaign map is fought on its god's sign. The points of the sign that
// are walls on this map are thin outlined squares with a dot in the middle;
// the rest of the sign is ghosted in as the four corners of the same square,
// so each map shows the whole of it. The prologue has no sign and none of
// this runs there.

export type SignLook = { hue: string; core: string; line: number }

// `hue` draws the lines, `core` the point in the middle. The Court's red is
// too dark to carry a hairline on black, so its lines run stronger.
export const SIGN_LOOKS: Record<GodId, SignLook | null> = {
  none: null,
  grove: { hue: '#9FCB6B', core: '#E4FF9A', line: 0.5 },
  court: { hue: '#C4162E', core: '#F3EDE2', line: 0.85 },
  carcosa: { hue: '#FFC857', core: '#FFF3C4', line: 0.46 },
}

export const BOARD_COLORS = COLORS

// Where the board sits in a canvas of this size at zoom 1, and how big a cell is.
export function boardFit(width: number, height: number): { cell: number; x: number; y: number } {
  // Reserve a second top row for the public incoming-Warp queue.
  const cell = Math.max(12, Math.floor(Math.min((width - 80) / 15, (height - 92) / 15)))
  return { cell, x: Math.round((width - cell * 15) / 2 + 10), y: Math.round((height - cell * 15) / 2 + 20) }
}

const rgb = (hex: string): string => `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`

// One point of the sign in the cell whose top-left is (px, py). `light` is
// how brightly it burns (1 at rest, more while a pulse passes); `seen` is 1
// where the sign shows and 0 where it has gone dark. A wall keeps a neutral
// outline even when its sign is dark: it is still a wall.
export function drawSignCell(ctx: CanvasRenderingContext2D, px: number, py: number, cell: number, look: SignLook, wall: boolean, light = 1, seen = 1, bare = false): void {
  const inset = Math.max(3, Math.round(cell * 0.2))
  const side = cell - inset * 2
  const hue = rgb(look.hue)
  const dot = Math.max(2, Math.round(cell * 0.06))
  if (wall) {
    ctx.fillStyle = `rgba(${hue},${(0.07 * light * seen).toFixed(3)})`
    ctx.fillRect(px + inset, py + inset, side, side)
    ctx.lineWidth = 1
    // `bare` is for display moments, where an unlit point of the sign is not there at all.
    if (!bare) {
      ctx.strokeStyle = 'rgba(244,244,244,0.14)'
      ctx.strokeRect(px + inset + 0.5, py + inset + 0.5, side - 1, side - 1)
    }
    if (seen > 0.01) {
      ctx.strokeStyle = `rgba(${hue},${Math.min(1, look.line * light * seen).toFixed(3)})`
      ctx.strokeRect(px + inset + 0.5, py + inset + 0.5, side - 1, side - 1)
      ctx.fillStyle = `rgba(${rgb(look.core)},${Math.min(1, 0.8 * light * seen).toFixed(3)})`
      ctx.fillRect(Math.round(px + cell / 2 - dot / 2), Math.round(py + cell / 2 - dot / 2), dot, dot)
    }
    return
  }
  if (seen <= 0.01) return
  // A ghost: the corners of the square that is a wall on another map.
  const size = Math.max(2, Math.round(dot * 0.8))
  ctx.fillStyle = `rgba(${hue},${Math.min(1, (0.26 + look.line * 0.3) * light * seen).toFixed(3)})`
  for (const [cx, cy] of [[inset, inset], [cell - inset, inset], [inset, cell - inset], [cell - inset, cell - inset]]) {
    ctx.fillRect(Math.round(px + cx - size / 2), Math.round(py + cy - size / 2), size, size)
  }
}

// The sign of an encounter as a 15 by 15 mask: 0 none, 1 ghost, 2 wall.
export function signMask(encounter: Encounter): Uint8Array {
  const mask = new Uint8Array(225)
  for (const [x, y] of encounter.sigil) mask[y * 15 + x] = 1
  for (const [x, y] of encounter.walls) if (mask[y * 15 + x]) mask[y * 15 + x] = 2
  return mask
}

// How long a pulse takes to cross one cell, and how long a point stays lit by it.
const PULSE_PER_CELL = 55
const PULSE_GLOW = 400
// On the last board the sign cannot be looked at: dark inside this many cells
// of the pointer, back by the second figure.
const GAZE_DARK = 2
const GAZE_SEEN = 3.2

export class BattleRenderer {
  private ctx: CanvasRenderingContext2D
  private frame = 0
  private raf = 0
  private origin = { x: 0, y: 0 }
  private cell = 36
  private boardPx = 540
  private baseCell = 36
  private hover: Coord | null = null
  private panelHoveredEnemyId: string | null = null
  private unitSeen = new Map<string, string>()
  private movingUntil = new Map<string, number>()
  private fx = new AttackFx()
  private pointers = new Map<number, { x: number; y: number }>()
  private pinchStartDistance = 0
  private pinchStartZoom = 1
  private pinching = false
  private dragStart: { x: number; y: number; originX: number; originY: number; touch: boolean } | null = null
  private dragged = false
  private suppressClick = false
  // Campaign boards only: the sign's mask for the encounter in play, the
  // pulse that leaves the boss when it strikes, and where the player is looking.
  private sign: { of: Encounter; mask: Uint8Array } | null = null
  private pulse: { at: number; from: Coord } | null = null
  private pulseDue: Coord | null = null
  private gaze: { x: number; y: number } | null = null
  private unseen = new Float32Array(225)
  private lastDraw = 0
  zoom = 1
  onZoomChange?: (zoom: number) => void

  constructor(private canvas: HTMLCanvasElement, private store: BattleStore) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is unavailable')
    this.ctx = ctx
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerleave', this.onPointerLeave)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerUp)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('battle-attack-effect', this.onAttackEffect)
    this.fx.attachOverlay(this.canvas.parentElement)
    this.resize()
    this.loop(0)
  }

  private onAttackEffect = (event: Event): void => {
    const effect = (event as CustomEvent<AttackEffect>).detail
    const state = this.store.getSnapshot()
    const boss = state.encounter.god !== 'none' ? bossOf(state) : null
    const bossGod = effect.source === 'enemy' && boss?.id === effect.presetId ? state.encounter.god : undefined
    const peers = effect.fx === 'high'
      ? livingEnemies(state)
        .filter(e => inAttackRange(effect.origin, e.pos, {
          name: '', amount: 0, area: 'all', shape: effect.shape, range: effect.range, width: effect.width,
        }))
        .map(e => ({ ...e.pos }))
      : undefined
    this.fx.play(effect, state.reducedMotion, bossGod, { walls: state.walls, peers })
    // The board answers its god: the sign pulses outward when the boss strikes.
    if (effect.source === 'enemy' && state.encounter.god !== 'none' && boss?.id === effect.presetId) {
      this.pulseDue = { ...effect.origin }
    }
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (this.pinching && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (distance > 0 && this.pinchStartDistance > 0) {
        this.zoomAt(this.pinchStartZoom * distance / this.pinchStartDistance, (a.x + b.x) / 2, (a.y + b.y) / 2)
      }
      this.hover = null
      return
    }
    if (this.dragStart && this.pointers.size === 1) {
      const dx = event.clientX - this.dragStart.x
      const dy = event.clientY - this.dragStart.y
      const threshold = this.dragStart.touch ? 10 : 6
      if (!this.dragged && Math.hypot(dx, dy) >= threshold) {
        this.dragged = true
        this.suppressClick = true
        this.canvas.style.cursor = 'grabbing'
      }
      if (this.dragged) {
        this.origin = this.clampOrigin({ x: this.dragStart.originX + dx, y: this.dragStart.originY + dy })
        this.setHover(null)
        window.dispatchEvent(new CustomEvent('map-pan-changed', { detail: { ...this.origin } }))
        return
      }
    }
    this.setHover(this.cellAt(event.clientX, event.clientY))
    // A finger is not a gaze: touch falls back to where the player's unit stands.
    if (event.pointerType === 'mouse') {
      const rect = this.canvas.getBoundingClientRect()
      this.gaze = { x: (event.clientX - rect.left - this.origin.x) / this.cell, y: (event.clientY - rect.top - this.origin.y) / this.cell }
    } else this.gaze = null
  }

  // The panel lights the card of the Geek under the cursor, so it is told
  // whenever the hovered Warp changes.
  private setHover(cell: Coord | null): void {
    const changed = cell?.x !== this.hover?.x || cell?.y !== this.hover?.y
    this.hover = cell
    if (changed) window.dispatchEvent(new CustomEvent('map-hover-changed', { detail: cell }))
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    try { this.canvas.setPointerCapture(event.pointerId) } catch { /* Synthetic verification pointers may not be capturable. */ }
    if (this.pointers.size === 1) {
      this.dragStart = {
        x: event.clientX, y: event.clientY,
        originX: this.origin.x, originY: this.origin.y,
        touch: event.pointerType === 'touch' || event.pointerType === 'pen',
      }
      this.dragged = false
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      this.pinchStartDistance = Math.hypot(a.x - b.x, a.y - b.y)
      this.pinchStartZoom = this.zoom
      this.pinching = true
      this.dragStart = null
      this.suppressClick = true
    }
  }

  private onPointerUp = (event: PointerEvent): void => {
    const wasPinching = this.pinching
    this.pointers.delete(event.pointerId)
    if (this.pointers.size < 2) this.pinching = false
    if (this.pointers.size === 0) {
      if (this.dragged || wasPinching || event.type === 'pointercancel') this.suppressClick = true
      this.dragStart = null
      this.dragged = false
      this.canvas.style.cursor = 'crosshair'
      // If the browser does not emit a click after a cancelled gesture, do not
      // suppress the next unrelated click indefinitely.
      window.setTimeout(() => { this.suppressClick = false }, 0)
    } else if (wasPinching) {
      this.dragStart = null
      this.dragged = true
      this.suppressClick = true
    }
  }

  private onPointerLeave = (): void => {
    this.setHover(null)
    this.gaze = null
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    this.zoomAt(this.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX, event.clientY)
  }

  resize = (): void => {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr))
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr))
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const width = rect.width
    const height = rect.height
    // Reserve a second top row for the public incoming-Warp queue.
    this.baseCell = Math.max(12, Math.floor(Math.min((width - 80) / 15, (height - 92) / 15)))
    this.applyZoom()
  }

  private clampOrigin(origin: Coord): Coord {
    const rect = this.canvas.getBoundingClientRect()
    const marginX = Math.min(rect.width / 2, this.cell)
    const marginY = Math.min(rect.height / 2, this.cell)
    return {
      x: Math.min(rect.width - marginX, Math.max(marginX - this.boardPx, origin.x)),
      y: Math.min(rect.height - marginY, Math.max(marginY - this.boardPx, origin.y)),
    }
  }

  private applyZoom(focal?: { x: number; y: number; gx: number; gy: number }): void {
    const rect = this.canvas.getBoundingClientRect()
    this.cell = Math.max(6, Math.round(this.baseCell * this.zoom))
    this.boardPx = this.cell * 15
    const baseOrigin = {
      x: Math.round((rect.width - this.boardPx) / 2 + 10),
      y: Math.round((rect.height - this.boardPx) / 2 + 20),
    }
    this.origin = this.clampOrigin(focal
      ? { x: focal.x - focal.gx * this.cell, y: focal.y - focal.gy * this.cell }
      : baseOrigin)
    this.onZoomChange?.(this.zoom)
  }

  zoomAt(next: number, clientX?: number, clientY?: number): void {
    const rect = this.canvas.getBoundingClientRect()
    const x = clientX === undefined ? rect.width / 2 : clientX - rect.left
    const y = clientY === undefined ? rect.height / 2 : clientY - rect.top
    const gx = (x - this.origin.x) / this.cell
    const gy = (y - this.origin.y) / this.cell
    this.zoom = Math.max(0.6, Math.min(2.4, next))
    this.applyZoom({ x, y, gx, gy })
  }

  zoomIn(): void { this.zoomAt(this.zoom * 1.2) }
  zoomOut(): void { this.zoomAt(this.zoom / 1.2) }
  resetZoom(): void { this.zoom = 1; this.applyZoom() }
  viewState(): { x: number; y: number; cell: number; zoom: number } {
    return { x: this.origin.x, y: this.origin.y, cell: this.cell, zoom: this.zoom }
  }
  vfxStats(): ReturnType<AttackFx['stats']> {
    return this.fx.stats()
  }
  setHoveredEnemy(enemyId: string | null): void {
    this.panelHoveredEnemyId = enemyId
  }
  consumeGesture(): boolean {
    const suppressed = this.suppressClick
    this.suppressClick = false
    return suppressed
  }

  cellAt(clientX: number, clientY: number): Coord | null {
    const rect = this.canvas.getBoundingClientRect()
    const x = Math.floor((clientX - rect.left - this.origin.x) / this.cell)
    const y = Math.floor((clientY - rect.top - this.origin.y) / this.cell)
    if (x < 0 || y < 0 || x >= 15 || y >= 15) return null
    return { x, y }
  }

  // Everything drawn in a cell rides the grid when an impact ripples it.
  private center(pos: Coord): Coord {
    const push = Number.isInteger(pos.x) && Number.isInteger(pos.y) ? this.fx.cellOffset(pos.x, pos.y) : { x: 0, y: 0 }
    return {
      x: this.origin.x + (pos.x + 0.5 + push.x) * this.cell,
      y: this.origin.y + (pos.y + 0.5 + push.y) * this.cell,
    }
  }

  private line(a: Coord, b: Coord, color: string, width = 1, dash: number[] = []): void {
    const ctx = this.ctx
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.setLineDash(dash)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.setLineDash([])
  }

  private drawFlag(kind: FlagKind, pos: Coord, size = 1): void {
    const ctx = this.ctx
    const { x, y } = this.center(pos)
    const s = this.cell * 0.38 * size
    ctx.strokeStyle = kind === 'blank' ? COLORS.muted : COLORS.white
    ctx.fillStyle = kind === 'blank' ? COLORS.muted : COLORS.white
    ctx.lineWidth = Math.max(1.2, this.cell * 0.045)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (kind === 'blank') {
      ctx.beginPath()
      ctx.arc(x, y, Math.max(1.4, this.cell * 0.045), 0, Math.PI * 2)
      ctx.fill()
      return
    }
    if (kind === 'bash') {
      ctx.font = `600 ${Math.max(10, s * 0.85)}px ${MONO}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('>_', x, y)
      return
    }
    if (kind === 'privilege') {
      ctx.beginPath()
      ctx.moveTo(x, y - s * 0.55)
      ctx.lineTo(x + s * 0.5, y - s * 0.35)
      ctx.lineTo(x + s * 0.42, y + s * 0.2)
      ctx.quadraticCurveTo(x + s * 0.22, y + s * 0.48, x, y + s * 0.55)
      ctx.quadraticCurveTo(x - s * 0.22, y + s * 0.48, x - s * 0.42, y + s * 0.2)
      ctx.lineTo(x - s * 0.5, y - s * 0.35)
      ctx.closePath()
      ctx.stroke()
      return
    }
    if (kind === 'core') {
      ctx.strokeRect(x - s * 0.42, y - s * 0.42, s * 0.84, s * 0.84)
      ctx.beginPath()
      ctx.arc(x, y, s * 0.1, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    ctx.beginPath()
    ctx.arc(x, y + s * 0.3, s * 0.52, Math.PI, Math.PI * 2)
    ctx.stroke()
    this.line({ x, y: y + s * 0.3 }, { x: x + s * 0.32, y: y - s * 0.42 }, COLORS.white, 1.5)
  }

  private drawPlayer(pos: Coord, ghost = false): void {
    const ctx = this.ctx
    const { x, y } = this.center(pos)
    const s = this.cell * 0.64
    ctx.strokeStyle = COLORS.white
    ctx.lineWidth = 1.6
    const l = s * 0.25
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = x + sx * s * 0.5
      const cy = y + sy * s * 0.5
      this.line({ x: cx - sx * l, y: cy }, { x: cx, y: cy }, COLORS.white, 1.6)
      this.line({ x: cx, y: cy - sy * l }, { x: cx, y: cy }, COLORS.white, 1.6)
    }
    if (!ghost) {
      ctx.fillStyle = COLORS.white
      ctx.beginPath()
      ctx.moveTo(x, y - s * 0.15)
      ctx.lineTo(x + s * 0.15, y)
      ctx.lineTo(x, y + s * 0.15)
      ctx.lineTo(x - s * 0.15, y)
      ctx.closePath()
      ctx.fill()
    }
  }

  private drawEnemy(pos: Coord, id: string, focused = false): void {
    const ctx = this.ctx
    const { x, y } = this.center(pos)
    if (focused) {
      const s = this.cell * 0.84
      const l = s * 0.22
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cx = x + sx * s * 0.5
        const cy = y + sy * s * 0.5
        this.line({ x: cx - sx * l, y: cy }, { x: cx, y: cy }, COLORS.white, 1.3)
        this.line({ x: cx, y: cy - sy * l }, { x: cx, y: cy }, COLORS.white, 1.3)
      }
    }
    const r = this.cell * (focused ? 0.34 : 0.32)
    ctx.strokeStyle = focused ? COLORS.white : COLORS.light
    ctx.lineWidth = focused ? 1.8 : 1.6
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 6 + i * Math.PI / 3
      const px = x + Math.cos(angle) * r
      const py = y + Math.sin(angle) * r
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    if (focused) {
      ctx.fillStyle = 'rgba(9,9,9,0.78)'
      ctx.fill()
    }
    ctx.stroke()
    this.line(
      { x: x - r * 0.36, y: y - r * 0.36 },
      { x: x + r * 0.36, y: y + r * 0.36 },
      focused ? COLORS.red : COLORS.light,
      focused ? 1.7 : 1.5,
    )
    const fontSize = Math.max(8, Math.round(this.cell * 0.23))
    ctx.font = `600 ${fontSize}px ${MONO}`
    if (focused) {
      const padX = 4
      const tagW = Math.ceil(ctx.measureText(id).width) + padX * 2
      const tagH = fontSize + 4
      const tagX = Math.round(x - tagW / 2)
      const tagY = pos.y > 0 ? Math.round(y - r - tagH - 3) : Math.round(y + r + 4)
      ctx.fillStyle = COLORS.bg
      ctx.fillRect(tagX, tagY, tagW, tagH)
      ctx.strokeStyle = COLORS.white
      ctx.lineWidth = 1
      ctx.strokeRect(tagX + 0.5, tagY + 0.5, tagW - 1, tagH - 1)
      ctx.fillStyle = COLORS.white
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(id, x, tagY + tagH / 2 + 0.5)
      return
    }
    ctx.fillStyle = COLORS.light
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(id, x - r, y - r - 12)
  }

  private drawThreatPill(origin: Coord, text: string, preferBelow = false): void {
    const ctx = this.ctx
    const { x, y } = this.center(origin)
    const fontSize = 9
    ctx.font = `600 ${fontSize}px ${MONO}`
    const padX = 5
    const width = Math.ceil(ctx.measureText(text).width) + padX * 2
    const height = fontSize + 6
    const rect = this.canvas.getBoundingClientRect()
    const rawX = Math.round(x - width / 2)
    const boxX = Math.max(6, Math.min(Math.round(rect.width) - width - 6, rawX))
    const wantBelow = preferBelow ? origin.y < 14 : origin.y === 0
    const rawY = wantBelow
      ? Math.round(y + this.cell * 0.52 + 2)
      : Math.round(y - this.cell * 0.52 - height - 2)
    const boxY = Math.max(6, Math.min(Math.round(rect.height) - height - 6, rawY))
    ctx.fillStyle = 'rgba(9,9,9,0.94)'
    ctx.fillRect(boxX, boxY, width, height)
    ctx.strokeStyle = COLORS.red
    ctx.lineWidth = 1
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, width - 1, height - 1)
    ctx.fillStyle = COLORS.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, boxX + width / 2, boxY + height / 2 + 0.5)
  }

  private drawBreathingDot(pos: Coord, color: string, time: number, ghost = false): void {
    const ctx = this.ctx
    const { x, y } = this.center(pos)
    const breath = 0.5 + Math.sin(time / 420) * 0.5
    const radius = this.cell * (0.1 + breath * 0.025)
    ctx.globalAlpha = ghost ? 0.45 : 0.65 + breath * 0.35
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = ghost ? 0.35 : 0.16 + breath * 0.12
    ctx.beginPath()
    ctx.arc(x, y, radius + this.cell * 0.1, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // The sign's mask for the encounter in play, and this frame's share of what
  // moves on it: a pulse that was asked for starts now, and on the last boss
  // the sign goes dark near where the player looks.
  private signOf(state: BattleState, time: number): Uint8Array {
    if (this.sign?.of !== state.encounter) {
      this.sign = { of: state.encounter, mask: signMask(state.encounter) }
      this.pulse = null
      this.pulseDue = null
      this.unseen.fill(0)
    }
    if (this.pulseDue) {
      this.pulse = { at: time, from: this.pulseDue }
      this.pulseDue = null
    }
    const dt = Math.min(0.1, Math.max(0, (time - this.lastDraw) / 1000))
    this.lastDraw = time
    const withheld = state.encounter.god === 'carcosa' && state.encounter.kind === 'boss'
    const look = withheld ? this.gaze ?? { x: state.player.pos.x + 0.5, y: state.player.pos.y + 0.5 } : null
    const ease = state.reducedMotion ? 1 : 1 - Math.exp(-dt / 0.16)
    const mask = this.sign.mask
    for (let i = 0; i < 225; i++) {
      if (!mask[i]) continue
      let goal = 0
      if (look) {
        const d = Math.hypot((i % 15) + 0.5 - look.x, Math.floor(i / 15) + 0.5 - look.y)
        goal = d <= GAZE_DARK ? 1 : d >= GAZE_SEEN ? 0 : (GAZE_SEEN - d) / (GAZE_SEEN - GAZE_DARK)
      }
      this.unseen[i] += (goal - this.unseen[i]) * ease
    }
    return mask
  }

  // 1 at rest; up to a fifth brighter while a pulse from the boss passes.
  private signLight(x: number, y: number, time: number, reduced: boolean): number {
    if (!this.pulse) return 1
    const since = time - this.pulse.at
    // Reduced motion: the whole sign answers at once, nothing travels.
    const reach = reduced ? 0 : Math.hypot(x - this.pulse.from.x, y - this.pulse.from.y) * PULSE_PER_CELL
    const k = (since - reach) / PULSE_GLOW
    if (k <= 0 || k >= 1) {
      if (since > 15 * 1.5 * PULSE_PER_CELL + PULSE_GLOW) this.pulse = null
      return 1
    }
    return 1 + 0.55 * Math.sin(Math.PI * k) ** 2
  }

  private draw(time: number): void {
    const state = this.store.getSnapshot()
    const ctx = this.ctx
    const rect = this.canvas.getBoundingClientRect()
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, rect.width, rect.height)
    this.fx.step(time)
    const shake = state.reducedMotion ? { x: 0, y: 0 } : this.fx.shakeOffset()
    ctx.save()
    ctx.translate(shake.x, shake.y)

    ctx.font = `10px ${MONO}`
    ctx.fillStyle = COLORS.muted
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const incomingY = -0.5 - Math.max(28, this.cell * 0.9) / this.cell
    for (let i = 0; i < 15; i++) {
      const label = i.toString(16).toUpperCase()
      ctx.fillText(label, this.origin.x + (i + 0.5) * this.cell, this.origin.y - 7)
      ctx.fillText(label, this.origin.x - 17, this.origin.y + (i + 0.5) * this.cell)
      ctx.globalAlpha = 0.65
      this.drawFlag(state.incoming[i][0], { x: i, y: incomingY }, 0.55)
      ctx.globalAlpha = 1
    }

    const look = SIGN_LOOKS[state.encounter.god]
    const mask = look ? this.signOf(state, time) : null
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        const push = this.fx.cellOffset(x, y)
        const px = this.origin.x + (x + push.x) * this.cell
        const py = this.origin.y + (y + push.y) * this.cell
        const signed = look && mask ? mask[y * 15 + x] : 0
        ctx.fillStyle = state.walls[y][x] && signed !== 2 ? COLORS.wall : COLORS.cell
        ctx.fillRect(px, py, this.cell, this.cell)
        ctx.strokeStyle = COLORS.grid
        ctx.lineWidth = 0.75
        ctx.strokeRect(px + 0.5, py + 0.5, this.cell - 1, this.cell - 1)
        if (look && signed) {
          drawSignCell(ctx, px, py, this.cell, look, signed === 2, this.signLight(x, y, time, state.reducedMotion), 1 - this.unseen[y * 15 + x])
        } else if (state.walls[y][x]) {
          this.line({ x: px + 7, y: py + this.cell - 7 }, { x: px + this.cell - 7, y: py + 7 }, COLORS.faint, 1)
        }
      }
    }

    for (const curtain of state.curtains) {
      for (let i = 0; i < 15; i++) {
        const pos = curtain.axis === 'column' ? { x: curtain.index, y: i } : { x: i, y: curtain.index }
        const px = this.origin.x + pos.x * this.cell
        const py = this.origin.y + pos.y * this.cell
        if (curtain.locked) {
          ctx.fillStyle = 'rgba(255,112,112,0.12)'
          ctx.fillRect(px + 1, py + 1, this.cell - 2, this.cell - 2)
          this.line({ x: px + 5, y: py + 5 }, { x: px + this.cell - 5, y: py + this.cell - 5 }, COLORS.red, 0.8)
          this.line({ x: px + this.cell - 5, y: py + 5 }, { x: px + 5, y: py + this.cell - 5 }, COLORS.red, 0.8)
        } else {
          ctx.strokeStyle = 'rgba(255,112,112,0.48)'
          ctx.lineWidth = 0.9
          ctx.setLineDash([2, 4])
          ctx.strokeRect(px + 2.5, py + 2.5, this.cell - 5, this.cell - 5)
          ctx.setLineDash([])
        }
      }
    }

    if (state.attackPreview) {
      const step = state.presets[state.attackPreview.presetIndex].steps[state.attackPreview.stepIndex]
      // Bash fires from where the route ends, which is also what the damage forecast uses.
      const attackOrigin = state.phase === 'planning' ? this.store.plannedPosition() : state.player.pos
      for (let y = 0; y < 15; y++) {
        for (let x = 0; x < 15; x++) {
          if (state.walls[y][x] || !inAttackRange(attackOrigin, { x, y }, step)) continue
          const px = this.origin.x + x * this.cell
          const py = this.origin.y + y * this.cell
          ctx.fillStyle = 'rgba(242,209,107,0.13)'
          ctx.fillRect(px + 1, py + 1, this.cell - 2, this.cell - 2)
          ctx.strokeStyle = 'rgba(242,209,107,0.3)'
          ctx.lineWidth = 0.8
          ctx.strokeRect(px + 2.5, py + 2.5, this.cell - 5, this.cell - 5)
        }
      }
    }

    const previewState = state.overloadArmed
      ? { ...state, player: { ...state.player, activeBash: 1 - state.player.activeBash, pos: this.store.plannedPosition() } }
      : state
    const stepsOverride = state.overloadArmed ? 4 : undefined
    const living = livingEnemies(state)
    const mapEnemy = this.hover ? living.find(enemy => sameCoord(enemy.pos, this.hover!)) ?? null : null
    const focusedEnemyId = state.enemyAttackPreview?.enemyId ?? this.panelHoveredEnemyId ?? mapEnemy?.id ?? null
    const focusedEnemy = focusedEnemyId ? living.find(enemy => enemy.id === focusedEnemyId) ?? null : null
    const focusedIntent = focusedEnemy && (state.phase === 'planning' || state.phase === 'resolving')
      ? predictedEnemyIntent(previewState, focusedEnemy.id, stepsOverride)
      : null
    let threatPill: { origin: Coord; text: string; below: boolean } | null = null

    if (state.enemyAttackPreview) {
      const preview = state.enemyAttackPreview
      const previewEnemy = living.find(enemy => enemy.id === preview.enemyId)
      const intentStep = previewEnemy
        ? predictedEnemyIntent(previewState, previewEnemy.id, stepsOverride)?.steps.find(s => s.stepIndex === preview.stepIndex)
        : undefined
      const seqHit = !intentStep
        ? predictedEnemySequence(state).find(candidate => candidate.enemyId === preview.enemyId && candidate.stepIndex === preview.stepIndex)
        : undefined
      const origin = intentStep?.origin ?? seqHit?.origin
      const step = intentStep?.step ?? (seqHit ? { amount: seqHit.damage, shape: seqHit.shape, range: seqHit.range, width: seqHit.width } : undefined)
      if (origin && step) {
        for (let y = 0; y < 15; y++) {
          for (let x = 0; x < 15; x++) {
            if (state.walls[y][x] || !desireInRange(origin, { x, y }, step)) continue
            const px = this.origin.x + x * this.cell
            const py = this.origin.y + y * this.cell
            ctx.fillStyle = 'rgba(255,112,112,0.14)'
            ctx.fillRect(px + 1, py + 1, this.cell - 2, this.cell - 2)
            ctx.strokeStyle = 'rgba(255,112,112,0.52)'
            ctx.lineWidth = 1
            ctx.strokeRect(px + 2.5, py + 2.5, this.cell - 5, this.cell - 5)
          }
        }
        const prefix = previewEnemy && !previewEnemy.hidden ? `${previewEnemy.id} ` : ''
        const amountLabel = previewEnemy && !disclosed(state, previewEnemy) ? WITHHELD : step.amount
        threatPill = {
          origin,
          text: `${prefix}${ROMAN[preview.stepIndex] ?? preview.stepIndex + 1}:${amountLabel}`,
          below: Boolean(previewEnemy && !previewEnemy.hidden && sameCoord(origin, previewEnemy.pos)),
        }
      }
    } else if (focusedEnemy && focusedIntent) {
      const armed = focusedIntent.steps.filter(step => step.armed)
      if (armed.length > 0) {
        for (let y = 0; y < 15; y++) {
          for (let x = 0; x < 15; x++) {
            if (state.walls[y][x]) continue
            let hitsHere = 0
            for (const candidate of armed) {
              if (desireInRange(focusedIntent.endpoint, { x, y }, candidate.step)) hitsHere++
            }
            if (!hitsHere) continue
            const px = this.origin.x + x * this.cell
            const py = this.origin.y + y * this.cell
            if (hitsHere === 1) {
              ctx.fillStyle = 'rgba(255,112,112,0.08)'
              ctx.fillRect(px + 1, py + 1, this.cell - 2, this.cell - 2)
              ctx.strokeStyle = 'rgba(255,112,112,0.36)'
              ctx.lineWidth = 0.85
              ctx.setLineDash([3, 3])
              ctx.strokeRect(px + 2.5, py + 2.5, this.cell - 5, this.cell - 5)
              ctx.setLineDash([])
            } else {
              ctx.fillStyle = `rgba(255,112,112,${Math.min(0.24, 0.1 + hitsHere * 0.06).toFixed(3)})`
              ctx.fillRect(px + 1, py + 1, this.cell - 2, this.cell - 2)
              ctx.strokeStyle = 'rgba(255,112,112,0.62)'
              ctx.lineWidth = 1
              ctx.strokeRect(px + 2.5, py + 2.5, this.cell - 5, this.cell - 5)
              this.line(
                { x: px + 4, y: py + this.cell - 4 },
                { x: px + this.cell - 4, y: py + 4 },
                'rgba(255,112,112,0.24)',
                0.85,
              )
            }
          }
        }
        const open = disclosed(state, focusedEnemy)
        const summary = armed.map(s => `${ROMAN[s.stepIndex] ?? s.stepIndex + 1}:${open ? s.step.amount : WITHHELD}`).join(' · ')
        const canCycle = mapEnemy?.id === focusedEnemy.id && !focusedEnemy.hidden && armed.length > 1
        threatPill = {
          origin: focusedIntent.endpoint,
          text: `${summary}${canCycle ? ' [CLICK]' : ''}`,
          below: !focusedEnemy.hidden && sameCoord(focusedIntent.endpoint, focusedEnemy.pos),
        }
      }
    }

    const orderedEnemies = focusedEnemy
      ? [...living.filter(enemy => enemy.id !== focusedEnemy.id), focusedEnemy]
      : living
    for (const enemy of orderedEnemies) {
      const isFocused = focusedEnemy?.id === enemy.id
      const dim = Boolean(focusedEnemy && !isFocused)
      const routeColor = isFocused ? COLORS.red : dim ? 'rgba(119,119,119,0.26)' : COLORS.muted
      const routeWidth = isFocused ? 1.9 : dim ? 1.1 : 1.4
      const routeDash = isFocused ? [5, 4] : [4, 5]
      let previous = enemy.pos
      for (const pos of enemy.route) {
        this.line(this.center(previous), this.center(pos), routeColor, routeWidth, routeDash)
        previous = pos
      }
      if (isFocused && enemy.route.length > 0) {
        const stop = focusedIntent?.endpoint ?? previous
        const { x: sx, y: sy } = this.center(stop)
        ctx.fillStyle = COLORS.bg
        ctx.fillRect(sx - 4, sy - 4, 8, 8)
        ctx.strokeStyle = COLORS.red
        ctx.lineWidth = 1.4
        ctx.strokeRect(sx - 4, sy - 4, 8, 8)
      }
      if (enemy.effectCell) {
        const px = this.origin.x + enemy.effectCell.x * this.cell
        const py = this.origin.y + enemy.effectCell.y * this.cell
        ctx.strokeStyle = dim ? 'rgba(255,112,112,0.35)' : COLORS.red
        ctx.lineWidth = isFocused ? 1.5 : 1.2
        ctx.setLineDash([2, 3])
        ctx.strokeRect(px + 3.5, py + 3.5, this.cell - 7, this.cell - 7)
        ctx.setLineDash([])
        this.line(this.center(previous), this.center(enemy.effectCell), dim ? 'rgba(255,112,112,0.35)' : COLORS.red, isFocused ? 1.3 : 1, [2, 4])
      }
    }

    if (state.playerTrail.length > 1) {
      let previous = state.playerTrail[0]
      for (const pos of state.playerTrail.slice(1)) {
        this.line(this.center(previous), this.center(pos), COLORS.faint, 1.6)
        previous = pos
      }
    }
    const route = state.phase === 'planning' ? state.actions.filter(action => action.type === 'move') : []
    let previous = state.player.pos
    for (const action of route) {
      this.line(this.center(previous), this.center(action.to), COLORS.white, 2.2)
      previous = action.to
    }

    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        if (!state.walls[y][x]) this.drawFlag(state.flags[y][x], { x, y }, 0.9)
      }
    }

    if (this.hover && state.phase === 'planning') {
      const px = this.origin.x + this.hover.x * this.cell
      const py = this.origin.y + this.hover.y * this.cell
      ctx.strokeStyle = COLORS.light
      ctx.lineWidth = 1
      ctx.strokeRect(px + 2.5, py + 2.5, this.cell - 5, this.cell - 5)
    }

    // A hidden Geek has no glyph and no label: its cell looks empty. Its route is drawn above like any other.
    const units = [
      { id: 'P', pos: state.player.pos },
      ...livingEnemies(state).filter(enemy => !enemy.hidden).map(enemy => ({ id: enemy.id, pos: enemy.pos })),
    ]
    for (const unit of units) {
      const key = `${unit.pos.x},${unit.pos.y}`
      if (this.unitSeen.has(unit.id) && this.unitSeen.get(unit.id) !== key) {
        this.movingUntil.set(unit.id, time + 280)
      }
      this.unitSeen.set(unit.id, key)
      const isFocusedEnemy = unit.id !== 'P' && focusedEnemy?.id === unit.id
      if (isFocusedEnemy) {
        this.drawEnemy(unit.pos, unit.id, true)
      } else if ((this.movingUntil.get(unit.id) ?? 0) > time) {
        if (unit.id === 'P') this.drawPlayer(unit.pos)
        else this.drawEnemy(unit.pos, unit.id)
      } else {
        this.drawBreathingDot(unit.pos, unit.id === 'P' ? COLORS.blue : COLORS.red, time)
      }
    }
    if (route.length && state.phase === 'planning') {
      this.drawBreathingDot(this.store.plannedPosition(), COLORS.blue, time, true)
    }
    if (threatPill) {
      this.drawThreatPill(threatPill.origin, threatPill.text, threatPill.below)
    }
    ctx.restore()
    this.fx.draw(ctx, { origin: this.origin, cell: this.cell, dpr: this.canvas.width / Math.max(1, rect.width) }, shake)
  }

  private loop = (time: number): void => {
    this.draw(time)
    this.raf = requestAnimationFrame(this.loop)
    this.frame++
    if (this.frame === 2) window.__GAME_READY__ = true
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    this.canvas.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('battle-attack-effect', this.onAttackEffect)
    this.fx.dispose()
  }
}
