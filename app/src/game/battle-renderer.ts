import { livingEnemies } from './battle-rules'
import { BASH_PRESETS } from './battle-config'
import { inAttackRange } from './attack-methods'
import { predictedEnemySequence } from './enemy-attack-methods'
import type { BattleStore } from './battle-store'
import type { AttackEffect, Coord, FlagKind } from './battle-types'

const COLORS = {
  bg: '#090909', cell: '#0D0D0D', grid: '#343434', wall: '#272727',
  white: '#F4F4F4', light: '#D8D8D8', muted: '#777777', faint: '#484848',
  blue: '#79BFFF', red: '#FF7070',
}

export class BattleRenderer {
  private ctx: CanvasRenderingContext2D
  private frame = 0
  private raf = 0
  private origin = { x: 0, y: 0 }
  private cell = 36
  private boardPx = 540
  private baseCell = 36
  private hover: Coord | null = null
  private unitSeen = new Map<string, string>()
  private movingUntil = new Map<string, number>()
  private effectQueue: AttackEffect[] = []
  private activeEffect: { effect: AttackEffect; started: number } | null = null
  private pointers = new Map<number, { x: number; y: number }>()
  private pinchStartDistance = 0
  private pinchStartZoom = 1
  private pinching = false
  private dragStart: { x: number; y: number; originX: number; originY: number; touch: boolean } | null = null
  private dragged = false
  private suppressClick = false
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
    this.resize()
    this.loop(0)
  }

  private onAttackEffect = (event: Event): void => {
    this.effectQueue.push((event as CustomEvent<AttackEffect>).detail)
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
        this.hover = null
        window.dispatchEvent(new CustomEvent('map-pan-changed', { detail: { ...this.origin } }))
        return
      }
    }
    this.hover = this.cellAt(event.clientX, event.clientY)
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
    this.hover = null
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

  private center(pos: Coord): Coord {
    return {
      x: this.origin.x + (pos.x + 0.5) * this.cell,
      y: this.origin.y + (pos.y + 0.5) * this.cell,
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
      ctx.font = `600 ${Math.max(10, s * 0.85)}px "JetBrains Mono", monospace`
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

  private drawEnemy(pos: Coord, id: string): void {
    const ctx = this.ctx
    const { x, y } = this.center(pos)
    const r = this.cell * 0.32
    ctx.strokeStyle = COLORS.light
    ctx.lineWidth = 1.6
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 6 + i * Math.PI / 3
      const px = x + Math.cos(angle) * r
      const py = y + Math.sin(angle) * r
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.stroke()
    this.line({ x: x - r * 0.35, y: y - r * 0.35 }, { x: x + r * 0.35, y: y + r * 0.35 }, COLORS.light, 1.5)
    ctx.fillStyle = COLORS.light
    ctx.font = `500 ${Math.max(8, this.cell * 0.22)}px "JetBrains Mono", monospace`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(id, x - r, y - r - 12)
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

  private drawActionSignature(effect: AttackEffect, progress: number, time: number): void {
    const origin = this.center(effect.origin)
    const target = this.center(effect.target)
    const color = effect.source === 'player' ? 'rgba(242,209,107,0.96)' : 'rgba(255,112,112,0.96)'
    const ctx = this.ctx
    const cell = this.cell
    const projectile = {
      x: origin.x + (target.x - origin.x) * progress,
      y: origin.y + (target.y - origin.y) * progress,
    }
    const dot = (pos: Coord, radius: number) => {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
    const diamond = (pos: Coord, radius: number, width = 1.5) => {
      this.line({ x: pos.x, y: pos.y - radius }, { x: pos.x + radius, y: pos.y }, color, width)
      this.line({ x: pos.x + radius, y: pos.y }, { x: pos.x, y: pos.y + radius }, color, width)
      this.line({ x: pos.x, y: pos.y + radius }, { x: pos.x - radius, y: pos.y }, color, width)
      this.line({ x: pos.x - radius, y: pos.y }, { x: pos.x, y: pos.y - radius }, color, width)
    }

    if (effect.presetId === 'vector') {
      if (effect.stepIndex === 0) {
        this.line(origin, projectile, color, 1.4)
        const r = cell * 0.36
        const l = cell * 0.16
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const cx = target.x + sx * r
          const cy = target.y + sy * r
          this.line({ x: cx - sx * l, y: cy }, { x: cx, y: cy }, color, 1.8)
          this.line({ x: cx, y: cy - sy * l }, { x: cx, y: cy }, color, 1.8)
        }
      } else if (effect.stepIndex === 1) {
        const elbow = { x: target.x, y: origin.y }
        if (progress <= 0.5) {
          const point = { x: origin.x + (elbow.x - origin.x) * progress * 2, y: origin.y }
          this.line(origin, point, color, 2.2)
          dot(point, 2.4)
        } else {
          const point = { x: elbow.x, y: elbow.y + (target.y - elbow.y) * (progress - 0.5) * 2 }
          this.line(origin, elbow, color, 2.2)
          this.line(elbow, point, color, 2.2)
          dot(point, 2.4)
        }
      } else if (effect.stepIndex === 2) {
        for (let y = effect.origin.y - effect.range; y <= effect.origin.y + effect.range; y++) {
          for (let x = effect.origin.x - effect.range; x <= effect.origin.x + effect.range; x++) {
            if ((x + y) % 2 !== 0 || !inAttackRange(effect.origin, { x, y }, {
              name: '', amount: 0, area: 'nearest', shape: 'square', range: effect.range,
            })) continue
            const point = this.center({ x, y })
            const size = cell * (0.08 + progress * 0.12)
            ctx.strokeStyle = color
            ctx.lineWidth = 1
            ctx.strokeRect(point.x - size, point.y - size, size * 2, size * 2)
          }
        }
        this.line(origin, projectile, color, 1.2, [2, 3])
      } else {
        this.line(origin, projectile, color, 3)
        const r = cell * (0.15 + progress * 0.35)
        this.line({ x: target.x - r, y: target.y - r }, { x: target.x + r, y: target.y + r }, color, 2.4)
        this.line({ x: target.x + r, y: target.y - r }, { x: target.x - r, y: target.y + r }, color, 2.4)
        ctx.strokeStyle = color
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(target.x, target.y, r * 1.25, 0, Math.PI * 2)
        ctx.stroke()
      }
      return
    }

    if (effect.presetId === 'cot') {
      if (effect.stepIndex === 0) {
        this.line(origin, projectile, color, 1.4, [2, 4])
        for (const [index, [dx, dy]] of [[0, -1], [1, 0], [0, 1], [-1, 0]].entries()) {
          if (Math.sin(time / 55 + index) > -0.25) dot({ x: target.x + dx * cell * 0.35, y: target.y + dy * cell * 0.35 }, 2.2)
        }
      } else if (effect.stepIndex === 1) {
        this.line(origin, projectile, color, 1.8)
        const r = cell * 0.35
        this.line({ x: target.x - r, y: target.y }, { x: target.x + r, y: target.y }, color, 1.6)
        this.line({ x: target.x, y: target.y - r }, { x: target.x, y: target.y + r }, color, 1.6)
        ctx.strokeStyle = color
        ctx.strokeRect(target.x - r * 0.45, target.y - r * 0.45, r * 0.9, r * 0.9)
      } else if (effect.stepIndex === 2) {
        const reach = effect.range * cell * progress
        this.line(origin, { x: origin.x + reach, y: origin.y }, color, 2)
        this.line(origin, { x: origin.x - reach, y: origin.y }, color, 2)
        this.line(origin, { x: origin.x, y: origin.y + reach }, color, 2)
        this.line(origin, { x: origin.x, y: origin.y - reach }, color, 2)
        ctx.strokeStyle = color
        ctx.strokeRect(target.x - cell * 0.16, target.y - cell * 0.16, cell * 0.32, cell * 0.32)
      } else {
        this.line(origin, projectile, color, 1.4)
        this.line({ x: origin.x + 4, y: origin.y }, { x: projectile.x + 4, y: projectile.y }, color, 1.4)
        diamond(target, cell * (0.18 + progress * 0.42), 2)
        diamond(target, cell * (0.32 + progress * 0.55), 1)
      }
      return
    }

    if (effect.shape === 'square') {
      this.line(origin, projectile, color, 1.6)
      const r = cell * (0.18 + progress * 0.42)
      ctx.strokeStyle = color
      ctx.lineWidth = 1.7
      ctx.strokeRect(target.x - r, target.y - r, r * 2, r * 2)
      this.line({ x: target.x - r, y: target.y - r }, { x: target.x + r, y: target.y + r }, color, 1.4)
    } else if (effect.shape === 'rectangle') {
      const bands = Math.max(1, effect.width ?? 1)
      for (let band = -bands; band <= bands; band++) {
        const offset = band * cell * 0.25
        this.line({ x: target.x - cell * 0.55, y: target.y + offset }, { x: target.x + cell * 0.55, y: target.y + offset }, color, band === 0 ? 2.2 : 1)
      }
      this.line(origin, projectile, color, 1.3, [4, 3])
    } else {
      this.line(origin, projectile, color, 1.5)
      const r = cell * (0.2 + progress * 0.35)
      this.line({ x: target.x - r, y: target.y }, { x: target.x + r, y: target.y }, color, 2)
      this.line({ x: target.x, y: target.y - r }, { x: target.x, y: target.y + r }, color, 2)
      diamond(target, r * 0.65, 1.2)
    }
  }

  private drawAttackEffect(time: number): void {
    const state = this.store.getSnapshot()
    const duration = state.reducedMotion ? 100 : 360
    if (!this.activeEffect && this.effectQueue.length) {
      this.activeEffect = { effect: this.effectQueue.shift()!, started: time }
    }
    if (!this.activeEffect) return
    const elapsed = time - this.activeEffect.started
    if (elapsed >= duration) {
      this.activeEffect = null
      return
    }
    const effect = this.activeEffect.effect
    const progress = Math.max(0, Math.min(1, elapsed / duration))
    const color = effect.source === 'player' ? '242,209,107' : '255,112,112'
    const ctx = this.ctx
    ctx.globalAlpha = 0.8 - progress * 0.45
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        if (!inAttackRange(effect.origin, { x, y }, {
          name: '', amount: 0, area: 'nearest', shape: effect.shape, range: effect.range, width: effect.width,
        })) continue
        const px = this.origin.x + x * this.cell
        const py = this.origin.y + y * this.cell
        ctx.fillStyle = `rgba(${color},0.16)`
        ctx.fillRect(px + 1, py + 1, this.cell - 2, this.cell - 2)
        ctx.strokeStyle = `rgba(${color},0.5)`
        ctx.lineWidth = 1
        ctx.strokeRect(px + 2.5, py + 2.5, this.cell - 5, this.cell - 5)
      }
    }
    this.drawActionSignature(effect, progress, time)
    ctx.globalAlpha = 1
  }

  private draw(time: number): void {
    const state = this.store.getSnapshot()
    const ctx = this.ctx
    const rect = this.canvas.getBoundingClientRect()
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, rect.width, rect.height)

    ctx.font = '10px "JetBrains Mono", monospace'
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

    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        const px = this.origin.x + x * this.cell
        const py = this.origin.y + y * this.cell
        ctx.fillStyle = state.walls[y][x] ? COLORS.wall : COLORS.cell
        ctx.fillRect(px, py, this.cell, this.cell)
        ctx.strokeStyle = COLORS.grid
        ctx.lineWidth = 0.75
        ctx.strokeRect(px + 0.5, py + 0.5, this.cell - 1, this.cell - 1)
        if (state.walls[y][x]) {
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
      const step = BASH_PRESETS[state.attackPreview.presetIndex].steps[state.attackPreview.stepIndex]
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

    if (state.enemyAttackPreview) {
      const preview = state.enemyAttackPreview
      const hit = predictedEnemySequence(state).find(candidate =>
        candidate.enemyId === preview.enemyId && candidate.stepIndex === preview.stepIndex)
      if (hit) {
        for (let y = 0; y < 15; y++) {
          for (let x = 0; x < 15; x++) {
            if (!inAttackRange(hit.origin, { x, y }, {
              name: '', amount: 0, area: 'nearest', shape: hit.shape, range: hit.range, width: hit.width,
            })) continue
            const px = this.origin.x + x * this.cell
            const py = this.origin.y + y * this.cell
            ctx.fillStyle = 'rgba(255,112,112,0.13)'
            ctx.fillRect(px + 1, py + 1, this.cell - 2, this.cell - 2)
            ctx.strokeStyle = 'rgba(255,112,112,0.45)'
            ctx.lineWidth = 0.9
            ctx.strokeRect(px + 2.5, py + 2.5, this.cell - 5, this.cell - 5)
          }
        }
      }
    }

    for (const enemy of livingEnemies(state)) {
      let previous = enemy.pos
      for (const pos of enemy.route) {
        this.line(this.center(previous), this.center(pos), COLORS.muted, 1.4, [4, 5])
        previous = pos
      }
      if (enemy.effectCell) {
        const px = this.origin.x + enemy.effectCell.x * this.cell
        const py = this.origin.y + enemy.effectCell.y * this.cell
        ctx.strokeStyle = COLORS.red
        ctx.lineWidth = 1.2
        ctx.setLineDash([2, 3])
        ctx.strokeRect(px + 3.5, py + 3.5, this.cell - 7, this.cell - 7)
        ctx.setLineDash([])
        this.line(this.center(previous), this.center(enemy.effectCell), COLORS.red, 1, [2, 4])
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

    this.drawAttackEffect(time)

    if (this.hover && state.phase === 'planning') {
      const px = this.origin.x + this.hover.x * this.cell
      const py = this.origin.y + this.hover.y * this.cell
      ctx.strokeStyle = COLORS.light
      ctx.lineWidth = 1
      ctx.strokeRect(px + 2.5, py + 2.5, this.cell - 5, this.cell - 5)
    }

    const units = [
      { id: 'P', pos: state.player.pos },
      ...livingEnemies(state).map(enemy => ({ id: enemy.id, pos: enemy.pos })),
    ]
    for (const unit of units) {
      const key = `${unit.pos.x},${unit.pos.y}`
      if (this.unitSeen.has(unit.id) && this.unitSeen.get(unit.id) !== key) {
        this.movingUntil.set(unit.id, time + 280)
      }
      this.unitSeen.set(unit.id, key)
      if ((this.movingUntil.get(unit.id) ?? 0) > time) {
        if (unit.id === 'P') this.drawPlayer(unit.pos)
        else this.drawEnemy(unit.pos, unit.id)
      } else {
        this.drawBreathingDot(unit.pos, unit.id === 'P' ? COLORS.blue : COLORS.red, time)
      }
    }
    if (route.length && state.phase === 'planning') {
      this.drawBreathingDot(this.store.plannedPosition(), COLORS.blue, time, true)
    }
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
    this.effectQueue = []
    this.activeEffect = null
  }
}
