import { livingEnemies } from './battle-rules'
import { BASH_PRESETS } from './battle-config'
import { inAttackRange } from './attack-methods'
import type { BattleStore } from './battle-store'
import type { Coord, FlagKind } from './battle-types'

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
  private hover: Coord | null = null
  private unitSeen = new Map<string, string>()
  private movingUntil = new Map<string, number>()

  constructor(private canvas: HTMLCanvasElement, private store: BattleStore) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is unavailable')
    this.ctx = ctx
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerleave', this.onPointerLeave)
    this.resize()
    this.loop(0)
  }

  private onPointerMove = (event: PointerEvent): void => {
    this.hover = this.cellAt(event.clientX, event.clientY)
  }

  private onPointerLeave = (): void => {
    this.hover = null
  }

  resize = (): void => {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr))
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr))
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const width = rect.width
    const height = rect.height
    this.cell = Math.max(12, Math.floor(Math.min((width - 66) / 15, (height - 66) / 15)))
    this.boardPx = this.cell * 15
    this.origin = {
      x: Math.round((width - this.boardPx) / 2 + 10),
      y: Math.round((height - this.boardPx) / 2 + 10),
    }
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
    for (let i = 0; i < 15; i++) {
      const label = i.toString(16).toUpperCase()
      ctx.fillText(label, this.origin.x + (i + 0.5) * this.cell, this.origin.y - 14)
      ctx.fillText(label, this.origin.x - 17, this.origin.y + (i + 0.5) * this.cell)
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

    if (state.attackPreview) {
      const step = BASH_PRESETS[state.attackPreview.presetIndex].steps[state.attackPreview.stepIndex]
      for (let y = 0; y < 15; y++) {
        for (let x = 0; x < 15; x++) {
          if (state.walls[y][x] || !inAttackRange(state.player.pos, { x, y }, step)) continue
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

    for (const enemy of livingEnemies(state)) {
      let previous = enemy.pos
      for (const pos of enemy.route) {
        this.line(this.center(previous), this.center(pos), COLORS.muted, 1.4, [4, 5])
        previous = pos
      }
    }

    const route = state.actions.filter(action => action.type === 'move')
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
  }
}
