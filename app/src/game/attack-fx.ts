import { MONO, allowFlash } from '../cinematic/display'
import { inAttackRange } from './attack-methods'
import type { AttackEffect, Coord, ResourcePopEffect } from './battle-types'
import type { GodId } from './encounters'
import { vfxQualityStore } from './vfx-quality'
import {
  CloudMode,
  DecalKind,
  LutRow,
  ParticleShape,
  RibbonStyle,
  SolidKind,
  VfxWebglEngine,
  WaveMode,
  type VfxStats,
} from './vfx-webgl'

// Attack effects are the one loud part of an otherwise minimal board: a
// synchronized WebGL2 2.5D VFX overlay above the orthographic 2D board renders
// distinct skill morphologies across discrete VECTOR solids/rays, continuous CoT
// volumetric mist/plumes, name-considered SPIKE/FLOOD/PROBE primitives, and
// multi-mip HDR bloom. LOW and reduced-motion degrade cleanly to Canvas 2D.

const SIZE = 15
const MAX_PARTICLES_2D = 768
const AMBER = ['#ffc857', '#fff3c4', '#ff9f43']
const CYAN = ['#5ee6ff', '#e2fbff', '#3aa8ff']
const RED = ['#ff5d73', '#ffd0d6', '#ff3fa4']
const VIOLET = ['#a78bfa', '#ffffff', '#5ee6ff']
const MAX_READOUT_POOL = 16

type Particle = {
  x: number; y: number; vx: number; vy: number
  life: number; max: number; size: number; color: string
  drag: number; grav: number; jit: number
  type: 'spark' | 'dot' | 'square' | 'triangle'
  home: Coord | null
}
type Burst = {
  n: number; speed: [number, number]; life: [number, number]; colors: string[]
  dir?: number; spread?: number; size?: number; drag?: number; grav?: number
  type?: Particle['type']
}
type Timed = { t: number; dur: number }
type Ring = Timed & { x: number; y: number; r0: number; r1: number; color: string; w: number }
type Beam = Timed & { a: Coord; b: Coord; color: string; w: number }
type Flash = Timed & { x: number; y: number; r: number }
type Line = Timed & { pts: Coord[]; color: string; w: number }
type Cell = Timed & { x: number; y: number; color: string; fill: number }
type Tag = Timed & { x: number; y: number; text: string; color: string }
type Num = Timed & { x: number; y: number; text: string; color: string; big: boolean }
type Shot = Timed & { a: Coord; b: Coord; tick: (x: number, y: number, f: number) => void; done: () => void }

export type BoardFxContext = {
  walls?: boolean[][]
  peers?: Coord[]
}

export type CellWarp = { x: number; y: number; scale: number; crest: number }
export type TimeFreezeState = { intensity: number; origin: Coord; stage: number }
type DistortWave = Timed & { x: number; y: number; r0: number; r1: number; amp: number; band: number }

type Ctx = {
  fx: AttackEffect
  p: Coord
  t: Coord
  col: string[]
  lut: LutRow
  bossGod?: GodId
  dir: number
  at: number
  board?: BoardFxContext
  suppressReadout?: boolean
}

export type FxView = { origin: Coord; cell: number; dpr: number }

// Amber is the colour of what the player sends out. The last amber words and
// numbers the board showed are kept (this page load only), because one
// display moment gives them back: see the third boss's entrance.
export type AmberMark = { x: number; y: number; text: string }
const amberShown: AmberMark[] = []
function rememberAmber(at: Coord, text: string): void {
  amberShown.push({ x: at.x, y: at.y, text })
  if (amberShown.length > 24) amberShown.shift()
}
export function amberMemory(): readonly AmberMark[] { return amberShown }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T>(list: T[]): T => list[(Math.random() * list.length) | 0]
const mid = (pos: Coord): Coord => ({ x: pos.x + 0.5, y: pos.y + 0.5 })
const lerp = (a: Coord, b: Coord, f: number): Coord => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f })

function lutForEffect(fx: AttackEffect, bossGod?: GodId): LutRow {
  if (fx.overload) return LutRow.Violet
  if (fx.source === 'enemy') {
    if (bossGod === 'grove') return LutRow.Grove
    if (bossGod === 'court') return LutRow.Court
    if (bossGod === 'carcosa') return LutRow.Carcosa
    return LutRow.Red
  }
  return fx.shape === 'cross' ? LutRow.Cyan : LutRow.Amber
}

function rangeCells(fx: AttackEffect): Coord[] {
  const cells: Coord[] = []
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (inAttackRange(fx.origin, { x, y }, { name: '', amount: 0, area: 'all', shape: fx.shape, range: fx.range, width: fx.width })) {
        cells.push({ x, y })
      }
    }
  }
  return cells
}

function bfsRangeCells(fx: AttackEffect, walls?: boolean[][]): Array<{ cell: Coord; dist: number }> {
  const seen = new Uint8Array(SIZE * SIZE)
  const queue: Array<{ cell: Coord; dist: number }> = [{ cell: fx.origin, dist: 0 }]
  seen[fx.origin.y * SIZE + fx.origin.x] = 1
  const reached: Array<{ cell: Coord; dist: number }> = []
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    if (cur.dist > 0) reached.push(cur)
    for (const [dx, dy] of dirs) {
      const nx = cur.cell.x + dx
      const ny = cur.cell.y + dy
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue
      const idx = ny * SIZE + nx
      if (seen[idx]) continue
      if (walls?.[ny]?.[nx]) continue
      if (!inAttackRange(fx.origin, { x: nx, y: ny }, { name: '', amount: 0, area: 'all', shape: fx.shape, range: fx.range, width: fx.width })) {
        continue
      }
      seen[idx] = 1
      queue.push({ cell: { x: nx, y: ny }, dist: cur.dist + 1 })
    }
  }
  return reached
}

function compactTimed<T extends Timed>(list: T[], dt: number): void {
  let write = 0
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    item.t += dt
    if (item.t < item.dur) list[write++] = item
  }
  list.length = write
}

// When an effect's hit lands and how long it then needs to play out, in ms.
// The battle paces itself on these, so damage is applied as the strike
// arrives and the next attack starts only once this one has finished.
export function effectTiming(fx: AttackEffect): { strike: number; settle: number } {
  if (fx.source === 'enemy') return { strike: 420, settle: 440 }
  if (fx.overload) return { strike: 120, settle: 380 }
  const steps = Math.abs(fx.target.x - fx.origin.x) + Math.abs(fx.target.y - fx.origin.y)
  switch (fx.fx) {
    case 'on': return { strike: 280, settle: 460 }
    case 'off': return { strike: 310, settle: 430 }
    case 'spike': return { strike: 170, settle: 480 }
    case 'manhattan': return { strike: Math.max(120, steps * 34), settle: 430 }
    case 'array': {
      const index = rangeCells(fx).findIndex(cell => cell.x === fx.target.x && cell.y === fx.target.y)
      return { strike: Math.max(120, index * 9), settle: 430 }
    }
    case 'flood': return { strike: Math.max(120, steps * 42), settle: 450 }
    case 'high': return { strike: 210, settle: 520 }
    case 'manifold':
    case 'zero': return { strike: Math.max(180, steps * 46), settle: 440 }
    case 'ultra': return { strike: 340, settle: 560 }
    case 'probe': return { strike: 520, settle: 380 }
    default: return { strike: 320, settle: 420 }
  }
}

export class AttackFx {
  private parts: Particle[] = []
  private rings: Ring[] = []
  private beams: Beam[] = []
  private flashes: Flash[] = []
  private lines: Line[] = []
  private cells: Cell[] = []
  private tags: Tag[] = []
  private nums: Num[] = []
  private shots: Shot[] = []
  private timers: { at: number; fn: () => void }[] = []
  private readonly dueScratch: Array<() => void> = []
  private readonly grid = Array.from({ length: SIZE * SIZE }, () => ({ ox: 0, oy: 0, vx: 0, vy: 0 }))
  private distortWaves: DistortWave[] = []
  private timeFreeze = 0
  private timeFreezeMax = 0.08
  private timeFreezeOrigin: Coord = { x: 7.5, y: 7.5 }
  private timeFreezeStage = 0
  private shakeAmp = 0
  private screenFlash = 0
  private hitStop = 0
  private now = 0
  private last = 0
  private lastStepDt = 0
  private nextStart = 0
  private lastOverload = -1e9
  private lastAreaStepKey = ''
  private lastAreaAt = -1e9
  private lastBatchKey = ''
  private lastBatchEmitAt = -1e9
  private lastBatchStart = 0
  private peakParticles2d = 0
  private totalFrames2d = 0

  // Lazy-allocated 2D fallback canvases (zero DOM creation in Node or until needed)
  private layer: HTMLCanvasElement | null = null
  private bloom: HTMLCanvasElement | null = null

  // Optional mounted 2.5D WebGL2 engine + post-bloom DOM text readout pool
  private gl: VfxWebglEngine | null = null
  private readoutHost: HTMLDivElement | null = null
  private readoutPool: HTMLSpanElement[] = []
  private readonly recordMemory: boolean

  constructor(options: { recordMemory?: boolean } = {}) {
    this.recordMemory = options.recordMemory ?? true
  }

  attachOverlay(stage: HTMLElement | null, options: { webgl?: boolean } = {}): void {
    if (!stage || typeof document === 'undefined') return
    this.disposeOverlay()

    if (options.webgl ?? true) {
      this.gl = VfxWebglEngine.create(stage)
    }
    const host = document.createElement('div')
    host.className = 'vfx-readout'
    host.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < MAX_READOUT_POOL; i++) {
      const span = document.createElement('span')
      span.className = 'vfx-pop'
      span.style.display = 'none'
      host.appendChild(span)
      this.readoutPool.push(span)
    }
    stage.appendChild(host)
    this.readoutHost = host
  }

  private disposeOverlay(): void {
    this.gl?.dispose()
    this.gl = null
    this.readoutHost?.remove()
    this.readoutHost = null
    this.readoutPool.length = 0
  }

  // One effect at a time. In a turn the battle already waits for each effect,
  // so this only queues an Overload: its opening cascade, then each Geek's
  // switched-deck sequence.
  play(effect: AttackEffect, reduced: boolean, bossGod?: GodId, board?: BoardFxContext): void {
    const timing = effectTiming(effect)
    const isAreaBatch =
      effect.source === 'player' &&
      !effect.overload &&
      (effect.fx === 'array' || effect.fx === 'high' || effect.fx === 'flood')
    const batchKey = isAreaBatch
      ? `${effect.presetId}:${effect.stepIndex}:${effect.fx}:${effect.origin.x},${effect.origin.y}:${effect.shape}`
      : ''
    let start: number
    if (isAreaBatch && batchKey === this.lastBatchKey && this.now - this.lastBatchEmitAt < 80) {
      start = this.lastBatchStart
    } else {
      start = Math.max(this.now, this.nextStart)
      if (effect.overload && !reduced && start - this.lastOverload > 1500) {
        this.timers.push({ at: start, fn: () => this.cascade(mid(effect.origin), reduced) })
        start += 700
      }
      if (isAreaBatch) {
        this.lastBatchKey = batchKey
        this.lastBatchEmitAt = this.now
        this.lastBatchStart = start
      } else {
        this.lastBatchKey = ''
      }
    }
    if (effect.overload) this.lastOverload = start
    this.nextStart = Math.max(
      this.nextStart,
      start + (reduced ? 60 : effect.overload ? 40 : timing.strike + timing.settle - 20),
    )
    this.timers.push({ at: start, fn: () => this.start(effect, reduced, timing.strike, bossGod, board) })
  }

  clear(): void {
    this.parts.length = 0
    this.rings.length = 0
    this.beams.length = 0
    this.flashes.length = 0
    this.lines.length = 0
    this.cells.length = 0
    this.tags.length = 0
    this.nums.length = 0
    this.shots.length = 0
    this.timers.length = 0
    this.dueScratch.length = 0
    this.nextStart = 0
    this.lastAreaStepKey = ''
    this.lastAreaAt = -1e9
    this.lastBatchKey = ''
    this.lastBatchEmitAt = -1e9
    this.lastBatchStart = 0
    this.hitStop = 0
    this.timeFreeze = 0
    this.timeFreezeStage = 0
    this.distortWaves.length = 0
    this.lastStepDt = 0
    this.grid.forEach(point => { point.ox = point.oy = point.vx = point.vy = 0 })
    this.shakeAmp = this.screenFlash = 0
    this.gl?.clear()
    for (const span of this.readoutPool) span.style.display = 'none'
  }

  dispose(): void {
    this.clear()
    this.disposeOverlay()
    this.layer = null
    this.bloom = null
  }

  private after(ms: number, fn: () => void): void {
    this.timers.push({ at: this.now + ms, fn })
  }

  private useGl(reduced: boolean): VfxWebglEngine | null {
    return !reduced && this.gl?.isWebglActive ? this.gl : null
  }

  private firstInAreaStep(fx: AttackEffect): boolean {
    const key = `${fx.overload ? 'ov' : 'st'}:${fx.stepIndex}:${fx.fx}:${fx.origin.x},${fx.origin.y}:${fx.shape}`
    if (key === this.lastAreaStepKey && this.now - this.lastAreaAt < 90) return false
    this.lastAreaStepKey = key
    this.lastAreaAt = this.now
    return true
  }

  private add(part: Partial<Particle> & Pick<Particle, 'x' | 'y' | 'life' | 'color'>): void {
    this.parts.push({ vx: 0, vy: 0, max: part.life, size: 2, drag: 0, grav: 0, jit: 0, type: 'spark', home: null, ...part })
    if (this.parts.length > MAX_PARTICLES_2D) this.parts.splice(0, this.parts.length - MAX_PARTICLES_2D)
    if (this.parts.length > this.peakParticles2d) this.peakParticles2d = this.parts.length
  }

  private burst(x: number, y: number, o: Burst): void {
    const count = Math.max(1, Math.round(o.n * 0.7))
    for (let i = 0; i < count; i++) {
      const angle = (o.dir ?? 0) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2)
      const speed = rnd(o.speed[0], o.speed[1])
      this.add({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rnd(o.life[0], o.life[1]),
        size: o.size ?? 2, color: pick(o.colors), drag: o.drag ?? 3.2, grav: o.grav ?? 0, type: o.type ?? 'spark',
      })
    }
  }

  private glBurst(
    gl: VfxWebglEngine,
    x: number,
    y: number,
    z: number,
    n: number,
    lut: LutRow,
    opts: {
      dir?: number
      spread?: number
      speed?: [number, number]
      vz?: [number, number]
      life?: [number, number]
      size?: number
      drag?: number
      gravZ?: number
      curl?: number
      bounce?: number
      shape?: ParticleShape
    } = {},
  ): void {
    const count = Math.max(1, Math.round(n * gl.densityScale))
    const baseDir = opts.dir ?? 0
    const spread = opts.spread ?? Math.PI * 2
    const speedRange = opts.speed ?? [2.0, 7.5]
    const vzRange = opts.vz ?? [1.2, 5.2]
    const lifeRange = opts.life ?? [0.28, 0.72]
    for (let i = 0; i < count; i++) {
      const angle = baseDir + (Math.random() - 0.5) * spread
      const spd = rnd(speedRange[0], speedRange[1])
      gl.spawnParticle({
        x: x + rnd(-0.1, 0.1),
        y: y + rnd(-0.1, 0.1),
        z: Math.max(0.02, z + rnd(-0.04, 0.16)),
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        vz: rnd(vzRange[0], vzRange[1]),
        life: rnd(lifeRange[0], lifeRange[1]),
        size: opts.size ?? rnd(2.2, 3.5),
        drag: opts.drag ?? 2.5,
        gravZ: opts.gravZ ?? -8.2,
        curl: opts.curl ?? 2.8,
        bounce: opts.bounce ?? 0.42,
        lut,
        shape: opts.shape ?? ParticleShape.Spark,
      })
    }
  }

  private glTriangleSpray(
    gl: VfxWebglEngine,
    x: number,
    y: number,
    n: number,
    lut: LutRow,
    dir = 0,
    spread = Math.PI * 2,
    speed: [number, number] = [2.8, 8.6],
  ): void {
    this.glBurst(gl, x, y, 0.34, n, lut, {
      dir,
      spread,
      speed,
      vz: [1.5, 4.6],
      life: [0.24, 0.48],
      size: 3.3,
      drag: 2.8,
      gravZ: -11.5,
      curl: 0.45,
      bounce: 0.44,
      shape: ParticleShape.Triangle,
    })
  }

  private implode(at: Coord, n: number, colors: string[], radius: number, dur: number): void {
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist = rnd(0.6, 1) * radius
      this.add({
        x: at.x + Math.cos(angle) * dist, y: at.y + Math.sin(angle) * dist,
        vx: -Math.cos(angle) * dist / dur, vy: -Math.sin(angle) * dist / dur, life: dur, size: 1.6, color: pick(colors),
      })
    }
  }

  private glImplode(
    gl: VfxWebglEngine,
    at: Coord,
    zTarget: number,
    n: number,
    lut: LutRow,
    radius: number,
    dur: number,
    shape: ParticleShape = ParticleShape.Mote,
  ): void {
    const count = Math.max(2, Math.round(n * gl.densityScale))
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist = rnd(0.55, 1) * radius
      const sx = at.x + Math.cos(angle) * dist
      const sy = at.y + Math.sin(angle) * dist
      const sz = rnd(0.15, zTarget + 1.8)
      gl.spawnParticle({
        x: sx,
        y: sy,
        z: sz,
        vx: ((at.x - sx) / dur) * 0.95 + Math.cos(angle + 1.4) * 1.9,
        vy: ((at.y - sy) / dur) * 0.95 + Math.sin(angle + 1.4) * 1.9,
        vz: ((zTarget - sz) / dur) * 0.9,
        life: dur,
        size: rnd(2.1, 3.2),
        drag: 0.35,
        gravZ: 0,
        curl: 2.2,
        bounce: 0,
        homeX: at.x,
        homeY: at.y,
        lut,
        shape,
      })
    }
  }

  private ring(at: Coord, r0: number, r1: number, dur: number, color: string, w = 3): void {
    this.rings.push({ x: at.x, y: at.y, r0, r1, dur, t: 0, color, w })
  }
  private beam(a: Coord, b: Coord, dur: number, color: string, w: number): void {
    this.beams.push({ a, b, dur, t: 0, color, w })
  }
  private flash(at: Coord, r: number, dur = 0.09): void {
    this.flashes.push({ x: at.x, y: at.y, r, dur, t: 0 })
  }
  private poly(pts: Coord[], dur: number, color: string, w = 1.5): void {
    this.lines.push({ pts, dur, t: 0, color, w })
  }
  private lit(x: number, y: number, color: string, fill: number, dur: number): void {
    this.cells.push({ x, y, t: 0, dur, color, fill })
  }
  private shot(a: Coord, b: Coord, dur: number, tick: Shot['tick'], done: Shot['done']): void {
    this.shots.push({ a, b, dur, t: 0, tick, done })
  }

  // The term the skill is named after, printed under the target. A new one
  // replaces whatever is already there.
  private tag(at: Coord, text: string, color: string, suppress = false): void {
    if (suppress) return
    this.tags = this.tags.filter(tag => tag.x !== at.x || tag.y !== at.y)
    this.tags.push({ x: at.x, y: at.y, text, color, t: 0, dur: 1.15 })
    if (this.recordMemory && color === AMBER[0]) rememberAmber(at, text)
  }

  // The interactions a hit triggered (PUSH, PINNED, BREACH, LIVE…), in white
  // on a second line under the term so they never read as one more number.
  private note(at: Coord, fx: AttackEffect): void {
    if (!fx.events?.length) return
    const y = at.y + 0.36
    this.tags = this.tags.filter(tag => tag.x !== at.x || tag.y !== y)
    this.tags.push({ x: at.x, y, text: fx.events.join(' · '), color: '#f4f4f4', t: 0, dur: 1.5 })
  }

  // The damage the hit does, popping above the target as it lands.
  private number(at: Coord, fx: AttackEffect, col: string[]): void {
    const dealt = fx.dealt ?? fx.amount ?? 0
    const text = dealt > 0 ? `−${dealt}` : fx.absorbed ? 'BLOCKED' : '−0'
    this.nums = this.nums.filter(num => num.x !== at.x || num.y !== at.y)
    this.nums.push({ x: at.x, y: at.y, text, color: dealt > 0 ? col[0] : '#8d8b85', big: dealt >= 5, t: 0, dur: 0.95 })
    if (this.recordMemory && dealt > 0 && col === AMBER) rememberAmber(at, text)
  }

  /** Displays a Privilege settlement or Core counter trigger pop over a unit cell. */
  playResourcePop(pop: ResourcePopEffect, reduced: boolean): void {
    const c = mid(pop.pos)
    const slot = pop.slotOffset ?? 0
    const yOffset = slot * 0.52
    const popAt = { x: c.x, y: c.y - yOffset }
    this.nums = this.nums.filter(num => Math.abs(num.x - popAt.x) > 0.05 || Math.abs(num.y - popAt.y) > 0.05)
    this.nums.push({
      x: popAt.x,
      y: popAt.y,
      text: pop.text,
      color: pop.color,
      big: false,
      t: 0,
      dur: 1.15,
    })
    if (pop.subtext && slot === 0) {
      this.tags = this.tags.filter(tag => Math.abs(tag.x - c.x) > 0.05 || Math.abs(tag.y - c.y) > 0.05)
      this.tags.push({ x: c.x, y: c.y, text: pop.subtext, color: '#d8d8d8', t: 0, dur: 1.05 })
    }
    if (reduced) return
    this.ring(c, 0.22, 1.05, 0.42, pop.color, 2.2)
    this.burst(c.x, c.y, {
      n: 10,
      dir: -Math.PI / 2,
      spread: Math.PI * 1.1,
      speed: [1.0, 3.2],
      life: [0.3, 0.58],
      colors: [pop.color, '#f5f5f5'],
      size: 2.2,
      drag: 2.8,
      type: 'dot',
    })
    const gl = this.useGl(reduced)
    if (gl) {
      const lut = pop.kind === 'focus' ? LutRow.Amber : pop.kind === 'repair' ? LutRow.Grove : LutRow.Cyan
      gl.spawnWave({
        x: c.x, y: c.y, z: 0.28, r0: 0.2, r1: 1.05,
        pitchX: 0.35, rollY: 0, thickness: 0.09, dur: 0.38, lut, mode: WaveMode.Shock,
      })
    }
  }

  private ripple(at: Coord, force: number, radius = 3.2): void {
    this.grid.forEach((point, index) => {
      const dx = (index % SIZE) + 0.5 - at.x
      const dy = Math.floor(index / SIZE) + 0.5 - at.y
      const dist = Math.hypot(dx, dy)
      if (dist > radius || dist < 0.01) return
      const push = force * 0.35 * (1 - dist / radius)
      point.vx += dx / dist * push
      point.vy += dy / dist * push
    })
  }

  private shake(amount: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount)
  }

  private triggerFlash(peak: number): void {
    if (allowFlash(this.now)) this.screenFlash = Math.max(this.screenFlash, peak)
  }

  // Hostile impact signature (used exclusively by enemy `swarm` hits).
  private enemyImpact(at: Coord, from: Coord, col: string[], lut: LutRow, power: number): void {
    const dir = Math.atan2(at.y - from.y, at.x - from.x)
    const gl = this.useGl(false)
    if (gl) {
      gl.spawnDecal({ x: at.x, y: at.y, radius: 2.2 + power * 1.6, dur: 0.52 + power * 0.24, lut, kind: DecalKind.Spill })
      if (power >= 0.4) {
        gl.spawnDecal({ x: at.x, y: at.y, radius: 1.05 + power * 0.65, rot: dir, dur: 0.5, lut, kind: DecalKind.Fracture })
      }
      gl.spawnWave({
        x: at.x, y: at.y, z: 0.25, r0: 0.2, r1: 1.35 + power * 1.25,
        pitchX: 0.58, rollY: -0.24, thickness: 0.16 + power * 0.12, dur: 0.46, lut, mode: WaveMode.Shock,
      })
      gl.spawnWave({
        x: at.x, y: at.y, z: 0.38, r0: 0.16, r1: 1.05 + power * 0.95,
        pitchX: -0.48, rollY: 0.38, thickness: 0.11, dur: 0.4, lut, mode: WaveMode.Slice,
      })
      this.glBurst(gl, at.x, at.y, 0.3, 32 + Math.round(power * 48), lut, {
        dir, spread: 2.1, speed: [3.2, 10 + power * 6.5], vz: [2.4, 6.8 + power * 3.5],
        life: [0.32, 0.72], size: 2.6, gravZ: -10.5, curl: 3.6, bounce: 0.48, shape: ParticleShape.Spark,
      })
      this.glBurst(gl, at.x, at.y, 0.42, 16 + Math.round(power * 18), lut, {
        speed: [0.6, 2.8], vz: [0.9, 3.6], life: [0.7, 1.35], size: 2.5,
        drag: 1.4, gravZ: -2.2, curl: 6.5, bounce: 0.28, shape: ParticleShape.Mote,
      })
      this.ripple(at, 2 + power * 5)
      return
    }

    this.flash(at, 0.3 + power * 0.25)
    this.ring(at, 0.2, 0.9 + power * 0.9, 0.42, col[0], 2 + power * 2)
    this.burst(at.x, at.y, { n: 10 + power * 18, dir, spread: 1.7, speed: [2, 7 + power * 5], life: [0.25, 0.6], colors: col })
    this.burst(at.x, at.y, { n: 6 + power * 8, speed: [0.3, 1.6], life: [0.7, 1.3], colors: col, size: 1.6, drag: 1.4, type: 'dot' })
    this.ripple(at, 2 + power * 5)
  }

  private dispatchPlayerSkill(fxId: string, c: Ctx): void {
    const signature: Record<string, (c: Ctx) => void> = {
      base: this.forwardPass,
      on: this.neuronOn,
      off: this.dropout,
      spike: this.spike,
      manhattan: this.manhattan,
      array: this.arrayScan,
      flood: this.floodFill,
      high: this.temperature,
      manifold: this.manifoldWave,
      zero: this.manifoldWave,
      ultra: this.ultra,
      probe: this.probe,
    }
    ;(signature[fxId] ?? this.forwardPass)(c)
  }

  private start(fx: AttackEffect, reduced: boolean, at: number, bossGod?: GodId, board?: BoardFxContext): void {
    const p = mid(fx.origin)
    const t = mid(fx.target)
    const col = fx.source === 'enemy' ? RED : fx.overload ? VIOLET : fx.shape === 'cross' ? CYAN : AMBER
    const lut = lutForEffect(fx, bossGod)
    const c: Ctx = { fx, p, t, col, lut, bossGod, dir: Math.atan2(t.y - p.y, t.x - p.x), at, board }
    // Reduced Motion swaps the whole effect for a single clean line and ring.
    if (reduced) {
      this.gl?.clear()
      this.poly([p, t], 0.12, col[0], 1.5)
      this.ring(t, 0.2, 0.7, 0.12, col[0], 2)
      this.number(t, fx, col)
      this.note(t, fx)
      return
    }
    const targetlessOverload = Boolean(
      fx.overload && fx.origin.x === fx.target.x && fx.origin.y === fx.target.y && !fx.overloadSteps?.length && (fx.amount ?? 0) === 0,
    )
    if (!targetlessOverload) {
      this.after(at, () => { this.number(t, fx, col); this.note(t, fx) })
    }
    if (fx.source === 'enemy') { this.swarm(c); return }
    if (fx.overload) {
      if (!targetlessOverload) this.overloadStrike(c)
      return
    }
    this.dispatchPlayerSkill(fx.fx ?? '', c)
  }

  // OVERLOAD Act I + Bg: Wuxia JiQi (集气) inward vortex (3 accelerating turbine revs + 3 battlefield chrono-pauses)
  // followed by 3 concentric background shockwaves producing traveling spatial distortion across the board.
  private cascade(p: Coord, reduced: boolean): void {
    const gl = this.useGl(reduced)
    const stageStarts = [0, 230, 460]
    const strikeAts = [150, 380, 610]
    const pauseDurs = [0.070, 0.075, 0.090]
    const shockAts = [700, 825, 950]

    if (gl) {
      stageStarts.forEach((stageStart, stage) => {
        const strikeAt = strikeAts[stage]
        const pauseDur = pauseDurs[stage]
        const lut = stage === 2 ? LutRow.Cyan : LutRow.Violet
        const outerR = 3.2 - stage * 0.3

        this.after(stageStart, () => {
          gl.spawnCloud({
            x: p.x, y: p.y, z: 0.14 + stage * 0.05,
            radius: outerR + 0.2, endRadius: 0.95, height: stage + 1,
            dur: 0.23, lut, mode: CloudMode.JiQiVortex,
          })
          const streamCount = 3 + stage
          for (let s = 0; s < streamCount; s++) {
            const ang = (s / streamCount) * Math.PI * 2 + stage * 0.72
            const ctrlAng = ang + 1.05
            gl.spawnRibbon({
              ax: p.x + Math.cos(ang) * outerR,
              ay: p.y + Math.sin(ang) * outerR,
              az: 0.18 + stage * 0.08,
              cx: p.x + Math.cos(ctrlAng) * outerR * 0.56,
              cy: p.y + Math.sin(ctrlAng) * outerR * 0.56,
              cz: 0.55 + stage * 0.12,
              bx: p.x, by: p.y, bz: 0.48,
              width: 0.18 + stage * 0.03, dur: 0.21, lut: LutRow.Violet, style: RibbonStyle.Trail,
            })
          }
          gl.spawnWave({
            x: p.x, y: p.y, z: 0.44, r0: 2.5 - stage * 0.25, r1: 0.38,
            pitchX: stage === 1 ? -0.45 : 0.42, rollY: (stage - 1) * 0.34,
            thickness: 0.11, dur: 0.20, lut, mode: WaveMode.Gimbal,
          })
          this.glImplode(gl, p, 0.85, 10 + stage * 2, LutRow.Violet, outerR - 0.2, 0.20, ParticleShape.Spark)
          this.ripple(p, -(3.2 + stage * 1.1), 5.8)
          if (stage === 2) {
            gl.spawnDome({ x: p.x, y: p.y, z: 0.56, r0: 0.22, r1: 0.58, dur: 0.28, lut: LutRow.Violet, voidOrb: true })
          }
        })

        this.after(strikeAt, () => {
          this.hitStop = Math.max(this.hitStop, pauseDur)
          this.timeFreeze = Math.max(this.timeFreeze, pauseDur)
          this.timeFreezeMax = pauseDur
          this.timeFreezeOrigin = p
          this.timeFreezeStage = stage + 1
          gl.spawnWave({
            x: p.x, y: p.y, z: 0.42, r0: 0.4, r1: 2.4 + stage * 0.9,
            pitchX: 0.25, rollY: 0, thickness: 0.07, dur: 0.16, lut: LutRow.Probe, mode: WaveMode.Slice,
          })
          this.shake(1.8 + stage * 0.9)
        })
      })

      shockAts.forEach((shockAt, w) => {
        this.after(shockAt, () => {
          this.distortWaves.push({
            x: p.x, y: p.y, r0: 0.35, r1: 13.8, t: 0, dur: 0.56,
            amp: 0.34 - w * 0.03, band: 1.05,
          })
          if (w === 0) {
            this.triggerFlash(0.10)
            gl.spawnDecal({ x: p.x, y: p.y, radius: 4.8, dur: 0.62, lut: LutRow.Violet, kind: DecalKind.Spill })
            this.glTriangleSpray(gl, p.x, p.y, 16, LutRow.Violet, 0, Math.PI * 2, [4.0, 11.5])
          }
          gl.spawnWave({
            x: p.x, y: p.y, z: 0.03, r0: 0.35, r1: 13.8,
            pitchX: 0, rollY: 0, thickness: 0.13, dur: 0.56,
            lut: w === 1 ? LutRow.Cyan : LutRow.Violet,
            mode: w === 2 ? WaveMode.Manifold : WaveMode.Shock,
          })
          this.ripple(p, 6.5 - w * 1.4, 11)
          this.shake(5.5 - w * 1.1)
        })
      })
      return
    }

    stageStarts.forEach((stageStart, stage) => {
      this.after(stageStart, () => {
        this.implode(p, 10 + stage * 4, VIOLET, 2.8 - stage * 0.25, 0.20)
        this.ripple(p, -(3.0 + stage), 5.5)
      })
      this.after(strikeAts[stage], () => {
        const pauseDur = pauseDurs[stage]
        this.hitStop = Math.max(this.hitStop, pauseDur)
        this.timeFreeze = Math.max(this.timeFreeze, pauseDur)
        this.timeFreezeMax = pauseDur
        this.timeFreezeOrigin = p
        this.timeFreezeStage = stage + 1
        this.shake(1.8 + stage * 0.9)
      })
    })
    shockAts.forEach((shockAt, w) => {
      this.after(shockAt, () => {
        this.distortWaves.push({
          x: p.x, y: p.y, r0: 0.35, r1: 13.8, t: 0, dur: 0.56,
          amp: 0.30 - w * 0.03, band: 1.05,
        })
        if (w === 0) this.triggerFlash(0.10)
        this.ring(p, 0.35, 13.8, 0.56, w === 1 ? VIOLET[2] : VIOLET[0], 3.4 - w * 0.6)
        this.ripple(p, 6.5 - w * 1.4, 11)
        this.shake(5.5 - w * 1.1)
        if (w === 0) this.burst(p.x, p.y, { n: 24, speed: [3, 11], life: [0.3, 0.65], colors: VIOLET, type: 'triangle' })
      })
    })
  }

  // OVERLOAD Act II (Main + Hit): heavy flashing multi-lane DataStream conduits & Cuboid packets slamming affected enemies.
  private overloadStrike = (c: Ctx): void => {
    const { p, t, col } = c
    const gl = this.useGl(false)
    const angle = Math.atan2(t.y - p.y, t.x - p.x)
    const nx = -Math.sin(angle)
    const ny = Math.cos(angle)
    const midPt = { x: (p.x + t.x) * 0.5, y: (p.y + t.y) * 0.5 }

    if (gl) {
      // Single wide 5-lane flashing Violet/Cyan DataStream conduit (zero additive overlap clipping)
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.38,
        cx: midPt.x + nx * 0.14, cy: midPt.y + ny * 0.14, cz: 0.64,
        bx: t.x, by: t.y, bz: 0.38,
        width: 0.76, dur: 0.44, lut: LutRow.Violet, style: RibbonStyle.DataStream,
      })

      // Hurtling wireframe data-packet monoliths & cuboids along the stream
      for (let k = 0; k < 5; k++) {
        this.after(k * 28, () => {
          const lat = ((k % 3) - 1) * 0.22
          const ox = nx * lat
          const oy = ny * lat
          const lut = k % 2 === 0 ? LutRow.Violet : LutRow.Cyan
          gl.spawnSolid({
            kind: SolidKind.Monolith,
            x0: p.x + ox, y0: p.y + oy, z0: 0.45,
            x1: t.x + ox * 0.4, y1: t.y + oy * 0.4, z1: 0.38,
            sx: 0.20, sy: 0.12, sz: 0.12, yaw: angle, spin: 8,
            dur: 0.16 + (k % 3) * 0.03, wireOnly: 0.62, lut,
          })
          gl.spawnParticle({
            x: p.x + ox * 0.6, y: p.y + oy * 0.6, z: 0.42,
            vx: Math.cos(angle) * 16, vy: Math.sin(angle) * 16, vz: 0.6,
            life: 0.18, size: 2.6, drag: 0.4, gravZ: 0, curl: 0, bounce: 0,
            homeX: t.x, homeY: t.y, lut, shape: ParticleShape.Cuboid,
          })
        })
      }

      this.after(c.at, () => {
        gl.spawnDecal({ x: t.x, y: t.y, radius: 0.82, dur: 0.38, lut: LutRow.Violet, kind: DecalKind.Fracture })
        gl.spawnSolid({
          kind: SolidKind.ScanPlane,
          x0: t.x, y0: t.y, z0: 1.08, x1: t.x, y1: t.y, z1: 0.04,
          sx: 1.12, sy: 1.12, sz: 1, dur: 0.24, lut: LutRow.Violet,
        })
        gl.spawnWave({
          x: t.x, y: t.y, z: 0.34, r0: 0.2, r1: 1.25,
          pitchX: 0.42, rollY: -0.22, thickness: 0.11, dur: 0.30, lut: LutRow.Violet, mode: WaveMode.Manifold,
        })
        this.glBurst(gl, t.x, t.y, 0.36, 12, LutRow.Cyan, {
          dir: c.dir, spread: 1.9, speed: [3.2, 8.8], shape: ParticleShape.Cuboid, size: 2.8,
        })
        this.glTriangleSpray(gl, t.x, t.y, 14, LutRow.Violet, c.dir, 2.0)
        this.hitStop = Math.max(this.hitStop, 0.03)
        this.ripple(t, 4.2)
        this.shake(4.0)
        this.tag(t, 'OVERLOAD', col[0])
      })
      return
    }

    this.beam(p, t, 0.32, col[0], 5)
    this.beam(p, t, 0.24, col[2], 2)
    this.after(c.at, () => {
      this.burst(t.x, t.y, { n: 18, dir: c.dir, spread: 1.8, speed: [2.5, 8], life: [0.22, 0.42], colors: col, type: 'square' })
      this.ripple(t, 4.2)
      this.shake(4.0)
      this.tag(t, 'OVERLOAD', col[0])
    })
  }

  // DESIRE (enemy attacks): arcing crimson/god-tinted motes curving through Z onto the Operator.
  private swarm = ({ p, t, col, lut, bossGod, at }: Ctx): void => {
    const gl = this.useGl(false)
    if (gl) {
      const n = Math.max(18, Math.round((bossGod ? 48 : 34) * gl.densityScale))
      for (let i = 0; i < n; i++) {
        this.after(i * 7, () => {
          const angle = Math.random() * Math.PI * 2
          const speed = rnd(3.2, 7.2)
          gl.spawnParticle({
            x: p.x, y: p.y, z: 0.3,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, vz: rnd(2.8, 6.0),
            life: 1.05, size: 2.5, drag: 1.65, gravZ: -4.2, curl: 6.8, bounce: 0,
            homeX: t.x, homeY: t.y, lut, shape: i % 3 === 0 ? ParticleShape.Mote : ParticleShape.Spark,
          })
        })
      }
      const nx = -(t.y - p.y)
      const ny = t.x - p.x
      const len = Math.hypot(nx, ny) || 1
      const arches = bossGod ? 3 : 2
      for (let a = 0; a < arches; a++) {
        const sign = a === 0 ? 1 : a === 1 ? -1 : 0
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 0.35,
          cx: (p.x + t.x) * 0.5 + (nx / len) * 1.65 * sign, cy: (p.y + t.y) * 0.5 + (ny / len) * 1.65 * sign, cz: bossGod ? 3.2 : 2.3,
          bx: t.x, by: t.y, bz: 0.25, width: bossGod ? 0.36 : 0.24, dur: at / 1000, lut, style: RibbonStyle.Trail,
        })
      }
      this.after(at, () => {
        this.enemyImpact(t, p, col, lut, bossGod ? 0.95 : 0.65)
        this.shake(bossGod ? 5 : 3.2)
      })
      return
    }

    for (let i = 0; i < 30; i++) this.after(i * 8, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = rnd(3, 7)
      this.add({ x: p.x, y: p.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.1, color: pick(col), drag: 1.8, home: t })
    })
    this.after(at, () => { this.enemyImpact(t, p, col, lut, 0.6); this.shake(3) })
  }

  // 1. BASE (VECTOR):
  //   Bg: faint basis-axis guide | Main: ONE surging light orb + comet wake | Hit: directional spray of small triangles.
  private forwardPass = (c: Ctx): void => {
    const { fx, p, t, col, lut, dir, at, suppressReadout } = c
    const gl = this.useGl(false)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))
    const dist = Math.max(1, Math.hypot(t.x - p.x, t.y - p.y))
    const bumped = fx.events?.includes('BUMP') ?? false
    const pushed = fx.events?.includes('PUSH') ?? false
    const dest = fx.movedTo ? mid(fx.movedTo) : t
    const travelSec = Math.max(0.18, at / 1000)

    if (gl) {
      // Optional faint background axis guide
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.14,
        cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.14,
        bx: t.x, by: t.y, bz: 0.14,
        width: 0.08, dur: travelSec + 0.06,
        lut, style: RibbonStyle.VectorRay, spin: Math.max(2, Math.round(dist)),
      })
      // Main effect: ONE surging light orb traveling smoothly to the Enemy
      const orbScale = 0.42 + slot * 0.06
      gl.spawnSolid({
        kind: SolidKind.Orb,
        x0: p.x, y0: p.y, z0: 0.44,
        x1: t.x, y1: t.y, z1: 0.42,
        sx: orbScale, sy: orbScale, sz: orbScale,
        scaleEnd: 1.25,
        dur: travelSec, lut,
      })
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.42,
        cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.54,
        bx: t.x, by: t.y, bz: 0.42,
        width: 0.24 + slot * 0.03, dur: travelSec + 0.05,
        lut, style: RibbonStyle.Trail,
      })
      this.after(at, () => {
        gl.spawnWave({
          x: t.x, y: t.y, z: 0.35, r0: 0.14, r1: 0.96 + slot * 0.08,
          pitchX: 0.42, rollY: -0.16, thickness: 0.11, dur: 0.28, lut, mode: WaveMode.Shock,
        })
        if (pushed) {
          gl.spawnDecal({ x: dest.x, y: dest.y, radius: 0.56, dur: 0.32, lut, kind: DecalKind.Tile })
        }
        if (bumped) {
          gl.spawnWave({
            x: t.x, y: t.y, z: 0.4, r0: 0.18, r1: 0.78,
            pitchX: 0.95, rollY: dir, thickness: 0.1, dur: 0.26, lut, mode: WaveMode.Slice,
          })
          this.glTriangleSpray(gl, t.x, t.y, 22 + slot * 3, lut, dir + Math.PI, 2.0, [2.8, 8.2])
          this.shake(3.0)
        } else {
          this.glTriangleSpray(gl, t.x, t.y, 18 + slot * 3, lut, dir, 1.55, [3.0, 8.8])
        }
        this.ripple(t, bumped ? 4.0 : 2.8)
        this.tag(t, 'FORWARD PASS', col[0], suppressReadout)
      })
      return
    }

    this.shot(p, t, travelSec, (x, y) => {
      this.add({ x, y, life: 0.06, size: 5 + slot, color: col[1], type: 'dot' })
    }, () => {})
    this.after(at, () => {
      this.ring(t, 0.15, 0.85, 0.28, col[0], 2)
      this.burst(t.x, t.y, { n: 16 + slot * 3, dir: bumped ? dir + Math.PI : dir, spread: 1.6, speed: [2.5, 7], life: [0.22, 0.44], colors: col, size: 4, type: 'triangle' })
      this.ripple(t, 3.0)
      this.tag(t, 'FORWARD PASS', col[0], suppressReadout)
    })
  }

  // 2. MANHATTAN (VECTOR):
  //   Bg: L-Bend square grid tracing | Main: crisp 90° orthogonal trace pulse | Hit: spray of small triangles.
  private manhattan = ({ fx, p, t, col, lut, at, suppressReadout }: Ctx): void => {
    const gl = this.useGl(false)
    const path: Coord[] = []
    const sx = Math.sign(fx.target.x - fx.origin.x)
    const sy = Math.sign(fx.target.y - fx.origin.y)
    for (let x = fx.origin.x + sx; sx && x !== fx.target.x + sx; x += sx) path.push({ x, y: fx.origin.y })
    for (let y = fx.origin.y + sy; sy && y !== fx.target.y + sy; y += sy) path.push({ x: fx.target.x, y })
    if (!path.length) path.push({ ...fx.target })
    const corner = sx && sy ? mid({ x: fx.target.x, y: fx.origin.y }) : null
    const gap = at / Math.max(1, path.length)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))

    if (gl) {
      // Background: L-Bend square grid tracing on Z = 0
      path.forEach((cell, i) => {
        this.after(i * gap, () => {
          const pt = mid(cell)
          gl.spawnDecal({ x: pt.x, y: pt.y, radius: 0.54, dur: 0.42, lut, kind: DecalKind.Tile })
        })
      })
      // Main: razor-sharp 90° L-Bend trace
      const rayDur = Math.max(0.26, at / 1000 + 0.14)
      if (corner) {
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 0.12, cx: (p.x + corner.x) * 0.5, cy: (p.y + corner.y) * 0.5, cz: 0.12,
          bx: corner.x, by: corner.y, bz: 0.12, width: 0.15, dur: rayDur,
          lut, style: RibbonStyle.VectorRay, spin: -1,
        })
        gl.spawnRibbon({
          ax: corner.x, ay: corner.y, az: 0.12, cx: (corner.x + t.x) * 0.5, cy: (corner.y + t.y) * 0.5, cz: 0.12,
          bx: t.x, by: t.y, bz: 0.12, width: 0.15, dur: rayDur,
          lut, style: RibbonStyle.VectorRay, spin: -1,
        })
      } else {
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 0.12, cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.12,
          bx: t.x, by: t.y, bz: 0.12, width: 0.15, dur: rayDur,
          lut, style: RibbonStyle.VectorRay, spin: -1,
        })
      }
      const from = path.length > 1 ? mid(path[path.length - 2]) : p
      const hitDir = Math.atan2(t.y - from.y, t.x - from.x)
      this.after(at, () => {
        gl.spawnDecal({ x: t.x, y: t.y, radius: 0.72, dur: 0.34, lut, kind: DecalKind.Tile })
        gl.spawnWave({
          x: t.x, y: t.y, z: 0.28, r0: 0.16, r1: 0.94 + Math.min(0.4, path.length * 0.06),
          pitchX: 0.4, rollY: 0.15, thickness: 0.11, dur: 0.3, lut, mode: WaveMode.Shock,
        })
        this.glTriangleSpray(gl, t.x, t.y, 18 + Math.min(12, path.length * 2) + slot * 2, lut, hitDir, Math.PI * 2, [2.6, 8.4])
        this.ripple(t, 2.8 + path.length * 0.4)
        this.tag(t, `L1 = ${path.length}`, col[0], suppressReadout)
      })
      return
    }

    const polyPts = corner ? [p, corner, t] : [p, t]
    this.poly(polyPts, Math.max(0.3, at / 1000 + 0.15), col[0], 2)
    path.forEach((cell, i) => {
      this.after(i * gap, () => {
        this.lit(cell.x, cell.y, col[0], 0.14, 0.38)
      })
    })
    this.after(at, () => {
      this.burst(t.x, t.y, { n: 18, speed: [2.4, 7], life: [0.2, 0.42], colors: col, size: 4, type: 'triangle' })
      this.ripple(t, 2.8 + path.length * 0.4)
      this.tag(t, `L1 = ${path.length}`, col[0], suppressReadout)
    })
  }

  // 3. ARRAY (VECTOR):
  //   Bg: Row-major square grid scan | Main: clean straight vector tractor gather | Hit: spray of small triangles.
  private arrayScan = ({ fx, p, t, col, lut, at, suppressReadout }: Ctx): void => {
    const gl = this.useGl(false)
    const cells = rangeCells(fx)
    const dest = fx.movedTo ? mid(fx.movedTo) : t
    const pulled = fx.events?.includes('PULL') ?? false
    const bumped = fx.events?.includes('BUMP') ?? false
    const slot = Math.max(0, Math.min(3, fx.stepIndex))

    if (gl) {
      // Background: Square Scan across the active footprint
      if (this.firstInAreaStep(fx)) {
        const rows = new Map<number, { minX: number; maxX: number; firstIdx: number }>()
        cells.forEach((cell, i) => {
          this.after(i * 9, () => {
            gl.spawnDecal({ x: cell.x + 0.5, y: cell.y + 0.5, radius: 0.52, dur: 0.28, lut, kind: DecalKind.Tile })
          })
          const cur = rows.get(cell.y)
          if (!cur) rows.set(cell.y, { minX: cell.x, maxX: cell.x, firstIdx: i })
          else {
            cur.minX = Math.min(cur.minX, cell.x)
            cur.maxX = Math.max(cur.maxX, cell.x)
          }
        })
        for (const [rowY, span] of rows.entries()) {
          this.after(span.firstIdx * 9, () => {
            gl.spawnRibbon({
              ax: span.minX + 0.15, ay: rowY + 0.5, az: 0.08,
              cx: (span.minX + span.maxX + 1) * 0.5, cy: rowY + 0.5, cz: 0.08,
              bx: span.maxX + 0.85, by: rowY + 0.5, bz: 0.08,
              width: 0.11, dur: 0.24, lut, style: RibbonStyle.VectorRay, spin: -1,
            })
          })
        }
        this.ripple(p, 2, 4)
      }

      // Main: straight dashed gather vector ray pulling toward SELF
      const dAng = Math.atan2(t.y - p.y, t.x - p.x)
      const railDur = Math.max(0.24, at / 1000 + 0.16)
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.38,
        cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.38,
        bx: t.x, by: t.y, bz: 0.38,
        width: 0.16, dur: railDur, lut, style: RibbonStyle.TractorDash,
      })

      this.after(at, () => {
        const hitPos = pulled ? dest : t
        if (pulled) {
          gl.spawnDecal({ x: t.x, y: t.y, radius: 0.54, dur: 0.32, lut, kind: DecalKind.Tile })
        }
        gl.spawnWave({
          x: hitPos.x, y: hitPos.y, z: 0.3, r0: 0.65, r1: 0.16,
          pitchX: 0.38, rollY: 0, thickness: 0.1, dur: 0.26, lut, mode: WaveMode.Slice,
        })
        this.glTriangleSpray(gl, hitPos.x, hitPos.y, 18 + slot * 3, lut, dAng + Math.PI, bumped ? 2.2 : 1.75, [3.2, 9.4])
        this.ripple(t, 2.5)
        this.tag(t, `[${fx.target.y.toString(16).toUpperCase()}][${fx.target.x.toString(16).toUpperCase()}]`, col[0], suppressReadout)
      })
      return
    }

    if (this.firstInAreaStep(fx)) {
      cells.forEach((cell, i) => this.after(i * 9, () => this.lit(cell.x, cell.y, col[0], 0.16, 0.22)))
      this.ripple(p, 2, 4)
    }
    this.beam(p, t, Math.max(0.24, at / 1000 + 0.12), col[0], 2)
    this.after(at, () => {
      this.burst(t.x, t.y, { n: 16, speed: [2, 6.5], life: [0.2, 0.4], colors: col, size: 4, type: 'triangle' })
      this.tag(t, `[${fx.target.y.toString(16).toUpperCase()}][${fx.target.x.toString(16).toUpperCase()}]`, col[0], suppressReadout)
    })
  }

  // 4. MANIFOLD (VECTOR, renamed from ZERO):
  //   Bg: phase-lattice floor spill | Main: spreading high-dimensional manifold waves | Hit: spray of small triangles.
  private manifoldWave = (c: Ctx): void => {
    const { fx, p, t, col, lut, dir, at, suppressReadout } = c
    const gl = this.useGl(false)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))
    const dist = Math.max(1.2, Math.hypot(t.x - p.x, t.y - p.y))
    const armored = (fx.securityBefore ?? 0) > 0 || (fx.absorbed ?? 0) > 0
    const breached = fx.events?.includes('BREACH') ?? false
    const waveDur = Math.max(0.24, at / 1000 + 0.12)

    if (gl) {
      // Subtle phase-lattice floor spill beneath SELF
      gl.spawnDecal({ x: p.x, y: p.y, radius: Math.min(3.5, dist + 0.8), dur: waveDur + 0.16, lut, kind: DecalKind.Spill })
      // Main: high-dimensional folded wavefronts spreading outward around SELF to strike Enemies
      const rings: Array<[number, number, number, number]> = [
        [0.24, -0.18, 0.42, 0.26],
        [-0.32, 0.28, 0.62, 0.20],
        ...(slot >= 2 ? [[0.14, 0.44, 0.82, 0.16] as [number, number, number, number]] : []),
      ]
      rings.forEach(([px, ry, z, thick], idx) => {
        this.after(idx * 45, () => {
          gl.spawnWave({
            x: p.x, y: p.y, z, r0: 0.28, r1: dist + 1.05 + idx * 0.22,
            pitchX: px, rollY: ry, thickness: thick, dur: waveDur, lut, mode: WaveMode.Manifold,
          })
        })
      })
      this.ripple(p, 2.4, Math.min(6, dist + 1.5))

      this.after(at, () => {
        gl.spawnWave({
          x: t.x, y: t.y, z: 0.45, r0: 0.18, r1: 1.25 + slot * 0.12,
          pitchX: 0.36, rollY: -0.22, thickness: 0.16, dur: 0.32, lut, mode: WaveMode.Manifold,
        })
        if (armored || breached) {
          const count = breached ? 6 : 2
          for (let k = 0; k < count; k++) {
            const ang = breached ? (k / 6) * Math.PI * 2 + 0.2 : dir + (k === 0 ? -1 : 1) * (Math.PI * 0.35)
            gl.spawnSolid({
              kind: SolidKind.HexPlate,
              x0: t.x + Math.cos(ang) * 0.28, y0: t.y + Math.sin(ang) * 0.28, z0: 0.46,
              x1: t.x + Math.cos(ang) * 1.25, y1: t.y + Math.sin(ang) * 1.25, z1: 0.08,
              sx: 0.44, sy: 0.44, sz: 0.35, scaleEnd: 0.5, yaw: ang, spin: 5.0,
              pitch0: 0.45, pitch1: 0.08, wireOnly: 0.72, dur: 0.38, lut: breached ? lut : LutRow.Probe,
            })
          }
        }
        this.glTriangleSpray(gl, t.x, t.y, 20 + slot * 3, lut, dir, Math.PI * 2, [3.0, 9.6])
        this.ripple(t, breached ? 4.4 : 3.2)
        this.tag(t, 'MANIFOLD', col[0], suppressReadout)
      })
      return
    }

    this.ring(p, 0.25, dist + 0.8, waveDur, col[0], 2.2)
    this.ring(p, 0.2, dist + 0.5, waveDur * 0.9, col[1], 1.4)
    this.after(at, () => {
      this.burst(t.x, t.y, { n: 20, speed: [2.5, 8], life: [0.22, 0.46], colors: col, size: 4, type: 'triangle' })
      this.ripple(t, 3.2)
      this.tag(t, 'MANIFOLD', col[0], suppressReadout)
    })
  }

  private spawnPlasmaPlume(
    gl: VfxWebglEngine,
    a: Coord,
    b: Coord,
    nomWid: number,
    dur: number,
    lut: LutRow,
    opts?: { flowStyle?: number; erosion?: number },
  ): void {
    const center = lerp(a, b, 0.5)
    const spanLen = Math.hypot(b.x - a.x, b.y - a.y) * 0.5 + 0.95
    const dir = Math.atan2(b.y - a.y, b.x - a.x)
    gl.spawnCloud({
      x: center.x,
      y: center.y,
      z: 0.04,
      radius: spanLen + 1.9,
      endRadius: nomWid + 2.1,
      height: dir,
      dur,
      lut,
      mode: CloudMode.PlasmaFlow,
      flowStyle: opts?.flowStyle ?? 0,
      erosion: opts?.erosion ?? 0,
      spanLen,
      nomWid,
    })
  }

  // First-version CoT step chain along the attack line (`9a29899` motif), anchored close to the trace.
  private coTLinkedSteps(gl: VfxWebglEngine, p: Coord, t: Coord, travelMs: number, lut: LutRow): void {
    const steps = 6
    for (let i = 1; i < steps; i++) {
      this.after((travelMs * i) / steps, () => {
        const a = lerp(p, t, (i - 1) / steps)
        const b = lerp(p, t, i / steps)
        gl.spawnRibbon({
          ax: a.x, ay: a.y, az: 0.13,
          cx: (a.x + b.x) * 0.5, cy: (a.y + b.y) * 0.5, cz: 0.13,
          bx: b.x, by: b.y, bz: 0.13,
          width: 0.22, dur: 0.36, lut, style: RibbonStyle.VectorRay, spin: -1,
        })
        gl.spawnRibbon({
          ax: a.x, ay: a.y, az: 0.14,
          cx: (a.x + b.x) * 0.5, cy: (a.y + b.y) * 0.5, cz: 0.14,
          bx: b.x, by: b.y, bz: 0.14,
          width: 0.09, dur: 0.36, lut: LutRow.Probe, style: RibbonStyle.VectorRay, spin: -1,
        })
        gl.spawnWave({
          x: b.x, y: b.y, z: 0.14, r0: 0.06, r1: 0.24,
          pitchX: 0.25, rollY: 0, thickness: 0.075, dur: 0.34, lut, mode: WaveMode.Shock,
        })
      })
    }
  }

  // 5. OFF (CoT):
  //   Bg: Liquid-Glass flowing plasma plume | Main: coaxial Beam + Probe VectorRay spine flanked by tight ±0.11 parallel units | Hit: low-Z shock ring + shards.
  private dropout = ({ fx, p, t, col, lut, dir, at, suppressReadout }: Ctx): void => {
    const gl = this.useGl(false)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))
    const units = Math.max(3, Math.min(6, fx.cap ?? (slot + 3)))
    const kept = Math.min(units, fx.amount ?? units)
    const order = Array.from({ length: units }, (_, i) => i).sort(() => Math.random() - 0.5)
    const dropped = new Set(order.slice(0, units - kept))
    const nx = -Math.sin(dir)
    const ny = Math.cos(dir)
    const dropTriggered = fx.events?.includes('DROP') ?? false
    const mx = (p.x + t.x) * 0.5
    const my = (p.y + t.y) * 0.5

    if (gl) {
      // Background: irregular domain-warped flowing plasma plume (cohesive liquid-glass droplets & islands)
      this.spawnPlasmaPlume(gl, p, t, 1.24, Math.max(0.56, at / 1000 + 0.30), lut, { flowStyle: 0, erosion: 0.05 })
      // Central coaxial trace carrier + bright inner spine
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.11,
        cx: mx, cy: my, cz: 0.12,
        bx: t.x, by: t.y, bz: 0.11,
        width: 0.32, dur: Math.max(0.24, at / 1000 + 0.10), lut, style: RibbonStyle.Beam,
      })
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.13,
        cx: mx, cy: my, cz: 0.13,
        bx: t.x, by: t.y, bz: 0.13,
        width: 0.12, dur: Math.max(0.26, at / 1000 + 0.12), lut: LutRow.Probe, style: RibbonStyle.VectorRay, spin: -1,
      })
      // Main: tight ±0.11 parallel discrete CoT unit rays & blocks
      for (let i = 0; i < units; i++) {
        const side = (i - (units - 1) / 2) * 0.11
        const a = { x: p.x + nx * side, y: p.y + ny * side }
        const b = { x: t.x + nx * side * 0.45, y: t.y + ny * side * 0.45 }
        const cutAt = rnd(0.34, 0.72)
        if (dropped.has(i)) {
          const dp = lerp(a, b, cutAt)
          gl.spawnRibbon({
            ax: a.x, ay: a.y, az: 0.13,
            cx: (a.x + dp.x) * 0.5 + nx * side * 0.15, cy: (a.y + dp.y) * 0.5 + ny * side * 0.15, cz: 0.15,
            bx: dp.x, by: dp.y, bz: 0.15,
            width: 0.15, dur: Math.max(0.14, (at / 1000) * cutAt + 0.04),
            lut: LutRow.Probe, style: RibbonStyle.VectorRay, spin: -1,
          })
          this.after(at * cutAt, () => {
            gl.spawnWave({
              x: dp.x, y: dp.y, z: 0.16, r0: 0.08, r1: 0.42,
              pitchX: 0.45, rollY: 0.25, thickness: 0.075, dur: 0.22, lut: LutRow.Probe, mode: WaveMode.Slice,
            })
            this.glBurst(gl, dp.x, dp.y, 0.18, 7, lut, {
              dir, spread: 1.4, speed: [1.4, 3.8], vz: [0.3, 1.2], life: [0.42, 0.72],
              size: 2.7, drag: 1.7, gravZ: -6, curl: 1.0, bounce: 0.35, shape: ParticleShape.Ash,
            })
          })
        } else {
          gl.spawnRibbon({
            ax: a.x, ay: a.y, az: 0.12,
            cx: (a.x + b.x) * 0.5 + nx * side * 0.16, cy: (a.y + b.y) * 0.5 + ny * side * 0.16, cz: 0.15,
            bx: b.x, by: b.y, bz: 0.13,
            width: 0.19, dur: Math.max(0.22, at / 1000 + 0.08),
            lut, style: RibbonStyle.Trail,
          })
          gl.spawnParticle({
            x: a.x, y: a.y, z: 0.15,
            vx: (b.x - a.x) / Math.max(0.16, at / 1000), vy: (b.y - a.y) / Math.max(0.16, at / 1000), vz: 0.08,
            life: Math.max(0.16, at / 1000), size: 3.6, drag: 0.2, gravZ: -0.4, curl: 0, bounce: 0,
            homeX: b.x, homeY: b.y, lut: i % 2 === 0 ? lut : LutRow.Probe, shape: ParticleShape.Cuboid,
          })
        }
      }
      this.after(at, () => {
        if (kept > 0) {
          gl.spawnWave({
            x: t.x, y: t.y, z: 0.18, r0: 0.18, r1: 0.76 + kept * 0.12,
            pitchX: 0.38, rollY: -0.16, thickness: 0.11, dur: 0.34, lut, mode: WaveMode.Shock,
          })
          this.glBurst(gl, t.x, t.y, 0.20, 6 + kept * 2, lut, {
            dir, spread: 1.8, speed: [2.2, 6.8], vz: [0.9, 3.0], life: [0.22, 0.48], size: 2.8, drag: 2.4, gravZ: -6.0, curl: 1.5, bounce: 0.3, shape: ParticleShape.Shard,
          })
          this.ripple(t, 1.4 + kept * 0.4)
        }
        if (dropTriggered) {
          gl.spawnWave({
            x: t.x, y: t.y, z: 0.22, r0: 0.85, r1: 0.22,
            pitchX: 0.44, rollY: 0, thickness: 0.08, dur: 0.32, lut: LutRow.Probe, mode: WaveMode.Gimbal,
          })
        }
        this.tag(t, `DROPOUT ${kept}/${units} KEPT`, kept ? col[0] : '#8d8b85', suppressReadout)
      })
      return
    }

    for (let i = 0; i < units; i++) {
      const side = (i - (units - 1) / 2) * 0.24
      const a = { x: p.x + nx * side, y: p.y + ny * side }
      const b = { x: t.x + nx * side * 0.38, y: t.y + ny * side * 0.38 }
      const cutAt = rnd(0.32, 0.7)
      let gone = false
      this.shot(a, b, (at - 10) / 1000, (x, y, f) => {
        if (dropped.has(i) && f > cutAt) {
          if (gone) return
          gone = true
          this.burst(x, y, { n: 4, speed: [0.5, 1.8], life: [0.25, 0.5], colors: ['#777777', '#555555'], drag: 2.4 })
          return
        }
        this.add({ x, y, life: 0.06, size: 2.2, color: col[0], type: 'spark' })
      }, () => {})
    }
    this.after(at, () => {
      if (kept) {
        this.ring(t, 0.15, 0.8 + kept * 0.12, 0.36, col[0], 2)
        this.burst(t.x, t.y, { n: 10, speed: [2, 6], life: [0.22, 0.44], colors: col, type: 'spark' })
      }
      this.tag(t, `DROPOUT ${kept}/${units} KEPT`, kept ? col[0] : '#8d8b85', suppressReadout)
    })
  }

  // 6. ON (CoT):
  //   Bg: Liquid-Glass flowing plasma | Main: immediate on-axis synaptic conduit + 7 planar relays (z = 0.11..0.15) -> dual-tone holding beam | Hit: low-Z Fresnel dome + gimbal + sparks.
  private neuronOn = (c: Ctx): void => {
    const { fx, p, t, col, lut, dir, at, suppressReadout } = c
    const gl = this.useGl(false)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))
    const mx = (p.x + t.x) * 0.5
    const my = (p.y + t.y) * 0.5
    const dealt = fx.dealt ?? fx.amount ?? 0
    const nodes = 7

    if (gl) {
      // Background: silky domain-warped S-curving Liquid-Glass flame plume
      this.spawnPlasmaPlume(gl, p, t, 1.15, 0.66, lut, { flowStyle: 0, erosion: -0.04 })
      // Immediate centralized synaptic conduit active throughout travel
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.11,
        cx: mx, cy: my, cz: 0.13,
        bx: t.x, by: t.y, bz: 0.12,
        width: 0.40 + slot * 0.04, dur: at / 1000 + 0.34, lut, style: RibbonStyle.Trail,
      })
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.14,
        cx: mx, cy: my, cz: 0.14,
        bx: t.x, by: t.y, bz: 0.14,
        width: 0.14, dur: at / 1000 + 0.36, lut: LutRow.Probe, style: RibbonStyle.VectorRay, spin: -1,
      })
      // Main: sequential planar synaptic relay nodes & segment beams locked onto trace
      for (let i = 1; i <= nodes; i++) {
        this.after((i * (at - 30)) / nodes, () => {
          const prevPt = lerp(p, t, (i - 1) / nodes)
          const pt = lerp(p, t, i / nodes)
          gl.spawnRibbon({
            ax: prevPt.x, ay: prevPt.y, az: 0.13,
            cx: (prevPt.x + pt.x) * 0.5, cy: (prevPt.y + pt.y) * 0.5, cz: 0.13,
            bx: pt.x, by: pt.y, bz: 0.13,
            width: 0.28, dur: 0.32, lut, style: RibbonStyle.Beam,
          })
          gl.spawnWave({
            x: pt.x, y: pt.y, z: 0.14, r0: 0.08, r1: 0.38,
            pitchX: 0.36, rollY: i * 0.32, thickness: 0.085, dur: 0.30,
            lut: i % 2 === 0 ? LutRow.Probe : lut, mode: WaveMode.Gimbal,
          })
          gl.spawnSolid({
            kind: SolidKind.Octahedron,
            x0: pt.x, y0: pt.y, z0: 0.14,
            sx: 0.19, sy: 0.19, sz: 0.19, spin: 4.2, dur: 0.30, lut: LutRow.Probe,
          })
        })
      }
      this.after(at, () => {
        // Straight dual-tone holding beam + inner white-steel core
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 0.13,
          cx: mx, cy: my, cz: 0.13,
          bx: t.x, by: t.y, bz: 0.13,
          width: 0.44 + slot * 0.04, dur: 0.38, lut, style: RibbonStyle.Beam,
        })
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 0.15,
          cx: mx, cy: my, cz: 0.15,
          bx: t.x, by: t.y, bz: 0.15,
          width: 0.16, dur: 0.42, lut: LutRow.Probe, style: RibbonStyle.Beam,
        })
        if (dealt > 0) {
          gl.spawnDome({ x: t.x, y: t.y, z: 0.20, r0: 0.2, r1: 0.78 + slot * 0.06, dur: 0.42, lut })
          gl.spawnWave({
            x: t.x, y: t.y, z: 0.28, r0: 1.25, r1: 0.38,
            pitchX: 0.54, rollY: -0.28, thickness: 0.12, dur: 0.42, lut, mode: WaveMode.Gimbal,
          })
          gl.spawnWave({
            x: t.x, y: t.y, z: 0.20, r0: 0.2, r1: 1.25,
            pitchX: -0.35, rollY: 0.32, thickness: 0.11, dur: 0.38, lut, mode: WaveMode.Shock,
          })
          this.glBurst(gl, t.x, t.y, 0.22, 18 + slot * 4, lut, {
            dir: dir + Math.PI, spread: 2.2, speed: [2.4, 7.6], vz: [1.0, 3.2], life: [0.24, 0.50], size: 2.5, drag: 2.2, curl: 3.0, bounce: 0.35, shape: ParticleShape.Spark,
          })
        } else {
          gl.spawnWave({
            x: t.x, y: t.y, z: 0.22, r0: 0.9, r1: 0.25,
            pitchX: 0.45, rollY: 0.15, thickness: 0.08, dur: 0.32, lut: LutRow.Probe, mode: WaveMode.Slice,
          })
        }
        this.ripple(t, 2.5)
        this.tag(t, dealt > 0 ? 'ACTIVE' : 'DAMPENED', col[0], suppressReadout)
      })
      return
    }

    this.beam(p, t, 0.36, col[0], 2.5)
    this.after(at, () => {
      if (dealt > 0) {
        this.ring(t, 0.22, 1.1, 0.45, col[0], 2)
        this.burst(t.x, t.y, { n: 14, speed: [1.8, 5.5], life: [0.25, 0.55], colors: col, size: 2, type: 'spark' })
      }
      this.ripple(t, 2.5)
      this.tag(t, dealt > 0 ? 'ACTIVE' : 'DAMPENED', col[0], suppressReadout)
    })
  }

  // 7. HIGH (CoT):
  //   Bg: single-quad smin Liquid-Glass Cross pool | Main: flat-anchored dual-tone Beam + Arc + single-pass SPREAD links | Hit: low-Z shockwave + compact overheating arcs & spark embers.
  private temperature = ({ fx, p, t, col, lut, at, board, suppressReadout }: Ctx): void => {
    const gl = this.useGl(false)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))
    const cells = rangeCells(fx)
    const mx = (p.x + t.x) * 0.5
    const my = (p.y + t.y) * 0.5

    if (gl) {
      // Background & single-pass SPREAD peer chain links (no N-times duplicate draws)
      if (this.firstInAreaStep(fx)) {
        const isCross = fx.shape === 'cross'
        const spanLen = isCross ? Math.max(2.8, fx.range + 0.6) : Math.max(2.2, fx.range + 0.75)
        const pad = spanLen + 1.85
        gl.spawnCloud({
          x: p.x,
          y: p.y,
          z: 0.04,
          radius: pad,
          endRadius: pad,
          height: 0,
          dur: 0.68,
          lut,
          mode: CloudMode.PlasmaFlow,
          flowStyle: isCross ? 1 : 2,
          spanLen,
          nomWid: isCross ? 0.95 : 1.05,
          erosion: 0.02,
        })
        const peers = board?.peers ?? []
        for (const peer of peers) {
          if (peer.x === fx.target.x && peer.y === fx.target.y) continue
          const pm = mid(peer)
          gl.spawnRibbon({
            ax: t.x, ay: t.y, az: 0.14,
            cx: (t.x + pm.x) * 0.5, cy: (t.y + pm.y) * 0.5, cz: 0.16,
            bx: pm.x, by: pm.y, bz: 0.14, width: 0.12, dur: 0.40, lut: LutRow.Probe, style: RibbonStyle.VectorRay, spin: -1,
          })
          gl.spawnRibbon({
            ax: t.x, ay: t.y, az: 0.14,
            cx: (t.x + pm.x) * 0.5, cy: (t.y + pm.y) * 0.5, cz: 0.18,
            bx: pm.x, by: pm.y, bz: 0.14, width: 0.22, dur: 0.42, lut, style: RibbonStyle.Arc,
          })
        }
      }

      // Main: flat-anchored dual-tone excitation Beam + white-steel inner spine + tight coaxial Arc
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.11,
        cx: mx, cy: my, cz: 0.13,
        bx: t.x, by: t.y, bz: 0.12, width: 0.40 + slot * 0.04, dur: 0.40, lut, style: RibbonStyle.Beam,
      })
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.14,
        cx: mx, cy: my, cz: 0.14,
        bx: t.x, by: t.y, bz: 0.14, width: 0.15, dur: 0.42, lut: LutRow.Probe, style: RibbonStyle.Beam,
      })
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.14,
        cx: mx, cy: my, cz: 0.16,
        bx: t.x, by: t.y, bz: 0.14, width: 0.20, dur: 0.38, lut, style: RibbonStyle.Arc,
      })

      gl.spawnWave({ x: t.x, y: t.y, z: 0.18, r0: 1.35, r1: 0.28, pitchX: 0.42, rollY: 0.18, thickness: 0.11, dur: Math.max(0.16, at / 1000), lut, mode: WaveMode.Gimbal })
      this.after(at, () => {
        gl.spawnWave({ x: t.x, y: t.y, z: 0.18, r0: 0.22, r1: 1.65, pitchX: 0.40, rollY: -0.20, thickness: 0.14, dur: 0.44, lut, mode: WaveMode.Shock })
        for (let k = 0; k < 2; k++) {
          const ang = (k / 2) * Math.PI * 2 + slot * 0.4
          gl.spawnRibbon({
            ax: t.x + Math.cos(ang) * 0.22, ay: t.y + Math.sin(ang) * 0.22, az: 0.14,
            cx: t.x + Math.cos(ang + 1.8) * 0.42, cy: t.y + Math.sin(ang + 1.8) * 0.42, cz: 0.55,
            bx: t.x + Math.cos(ang + 3.4) * 0.16, by: t.y + Math.sin(ang + 3.4) * 0.16, bz: 0.95,
            width: 0.18, dur: 0.46, lut, style: RibbonStyle.Arc,
          })
        }
        this.glBurst(gl, t.x, t.y, 0.20, 24 + slot * 4, lut, {
          speed: [1.2, 4.2], vz: [3.0, 7.2], life: [0.32, 0.68], size: 2.5, drag: 1.9, gravZ: 2.4, curl: 12, bounce: 0, shape: ParticleShape.Spark,
        })
        this.ripple(t, 5)
        this.tag(t, 'T = 2.0', col[0], suppressReadout)
      })
      return
    }

    if (this.firstInAreaStep(fx)) {
      for (let i = 0; i < cells.length; i += 3) {
        const cell = cells[i]
        this.add({ x: cell.x + 0.5, y: cell.y + 0.5, life: 0.45, size: 7, color: col[0], type: 'dot' })
      }
    }
    this.after(at, () => {
      this.ring(t, 0.2, 1.5, 0.48, col[0], 3)
      for (let k = 0; k < 20; k++) {
        this.add({
          x: t.x + rnd(-0.2, 0.2), y: t.y + rnd(-0.2, 0.2),
          vx: rnd(-1.5, 1.5), vy: rnd(-5.5, -1.5), life: rnd(0.35, 0.75), size: 2.2, color: col[k % 2], drag: 2, jit: 14, type: 'spark',
        })
      }
      this.ripple(t, 5)
      this.tag(t, 'T = 2.0', col[0], suppressReadout)
    })
  }

  // 8. ULTRA (CoT):
  //   Bg: wide billowing Liquid-Glass plasma wake | Main: on-axis void orb (z = 0.24) + TwinHitscan lock rails -> flat-anchored full-board rail beam | Hit: low-Z fracture + dual crowns + directional sparks.
  private ultra = ({ fx, p, t, col, lut, dir, at, suppressReadout }: Ctx): void => {
    const gl = this.useGl(false)
    const end = { x: p.x + Math.cos(dir) * SIZE * 1.5, y: p.y + Math.sin(dir) * SIZE * 1.5 }
    const railMatch = fx.events?.find(e => e.startsWith('RAIL +'))
    const tagCount = Math.max(0, Math.min(3, fx.readTags?.length ?? (railMatch ? Number(railMatch.slice(6)) || 0 : 0)))
    const nx = -Math.sin(dir)
    const ny = Math.cos(dir)
    const beamAt = Math.max(180, at - 90)
    const mxEnd = (p.x + end.x) * 0.5
    const myEnd = (p.y + end.y) * 0.5

    if (gl) {
      // Background: wide billowing domain-warped Liquid-Glass singularity flame wake
      const wakeStart = { x: p.x - Math.cos(dir) * 0.9, y: p.y - Math.sin(dir) * 0.9 }
      const wakeEnd = { x: p.x + Math.cos(dir) * 9.2, y: p.y + Math.sin(dir) * 9.2 }
      this.spawnPlasmaPlume(gl, wakeStart, wakeEnd, 1.48, 0.78, lut, { flowStyle: 3, erosion: -0.03 })
      // Charge: on-axis void orb + accretion rings (z = 0.24) + centralized lock conduit + coTLinkedSteps + tag siphon rays
      gl.spawnDome({ x: p.x, y: p.y, z: 0.24, r0: 0.15, r1: 0.78, dur: 0.34, lut, voidOrb: true })
      gl.spawnWave({ x: p.x, y: p.y, z: 0.24, r0: 1.85, r1: 0.65, pitchX: 0.45, rollY: -0.25, thickness: 0.12, dur: 0.32, lut, mode: WaveMode.Gimbal })
      gl.spawnWave({ x: p.x, y: p.y, z: 0.24, r0: 1.55, r1: 0.52, pitchX: -0.52, rollY: 0.36, thickness: 0.1, dur: 0.32, lut: LutRow.Probe, mode: WaveMode.Slice })
      gl.spawnWave({ x: p.x, y: p.y, z: 0.24, r0: 1.3, r1: 0.42, pitchX: 0.18, rollY: -0.48, thickness: 0.09, dur: 0.32, lut, mode: WaveMode.Shock })
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.13,
        cx: mxEnd, cy: myEnd, cz: 0.14,
        bx: end.x, by: end.y, bz: 0.13,
        width: 0.36, dur: beamAt / 1000 + 0.14, lut, style: RibbonStyle.TwinHitscan,
      })
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.15,
        cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.15,
        bx: t.x, by: t.y, bz: 0.15,
        width: 0.16, dur: beamAt / 1000 + 0.14, lut: LutRow.Probe, style: RibbonStyle.VectorRay, spin: 10,
      })
      this.coTLinkedSteps(gl, p, t, Math.max(120, beamAt - 20), lut)
      for (let s = 0; s < tagCount; s++) {
        const fan = (s - (tagCount - 1) / 2) * 0.26
        gl.spawnRibbon({
          ax: t.x, ay: t.y, az: 0.15,
          cx: (t.x + p.x) * 0.5 + nx * fan, cy: (t.y + p.y) * 0.5 + ny * fan, cz: 0.22,
          bx: p.x, by: p.y, bz: 0.20,
          width: 0.13, dur: Math.max(0.22, beamAt / 1000), lut: s === 0 ? lut : LutRow.Probe, style: RibbonStyle.VectorRay, spin: -1,
        })
      }
      for (let k = 0; k < 3; k++) {
        this.after(k * 65, () => this.glImplode(gl, p, 0.24, 12, lut, 2.4, 0.22, ParticleShape.Spark))
      }

      // Main beam launch: flat-anchored straight full-board rail beam (z = 0.15..0.20)
      this.after(beamAt, () => {
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 0.15,
          cx: mxEnd, cy: myEnd, cz: 0.16,
          bx: end.x, by: end.y, bz: 0.15,
          width: 0.84, dur: 0.46, lut, style: RibbonStyle.Beam,
        })
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 0.17,
          cx: mxEnd, cy: myEnd, cz: 0.17,
          bx: end.x, by: end.y, bz: 0.17,
          width: 0.28, dur: 0.50, lut: LutRow.Probe, style: RibbonStyle.Beam,
        })
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 0.17,
          cx: mxEnd, cy: myEnd, cz: 0.20,
          bx: end.x, by: end.y, bz: 0.17,
          width: 0.24, dur: 0.42, lut: LutRow.Probe, style: RibbonStyle.Arc,
        })
      })

      // Hit: impact crown & spark detonation
      this.after(at, () => {
        this.hitStop = Math.max(this.hitStop, 0.035)
        this.triggerFlash(0.14)
        gl.spawnDecal({ x: t.x, y: t.y, radius: 1.6, dur: 0.50, lut, kind: DecalKind.Fracture })
        gl.spawnWave({ x: t.x, y: t.y, z: 0.22, r0: 0.25, r1: 2.1, pitchX: 0.42, rollY: -0.22, thickness: 0.18, dur: 0.46, lut, mode: WaveMode.Shock })
        gl.spawnWave({ x: t.x, y: t.y, z: 0.28, r0: 0.22, r1: 1.65, pitchX: -0.36, rollY: 0.28, thickness: 0.13, dur: 0.42, lut: LutRow.Probe, mode: WaveMode.Slice })
        this.glBurst(gl, t.x, t.y, 0.24, 26, lut, {
          dir, spread: 1.7, speed: [5.0, 15.5], vz: [1.6, 5.2], life: [0.3, 0.65], size: 2.6, curl: 3.5, bounce: 0.44, shape: ParticleShape.Spark,
        })
        this.ripple(t, 7.5)
        this.ripple(p, 3)
        this.shake(6.8)
        this.tag(t, 'ULTRA', col[0], suppressReadout)
      })
      return
    }

    for (let k = 0; k < 5; k++) this.after(k * 60, () => this.implode(p, 14, col, 2.1, 0.2))
    this.after(at, () => {
      this.beam(p, end, 0.36, col[1], 10)
      this.beam(p, end, 0.5, col[2], 4)
      this.flash(p, 0.6)
      this.flash(t, 0.9)
      this.burst(t.x, t.y, { n: 24, speed: [3, 12], life: [0.25, 0.65], colors: col, size: 2.2, type: 'spark' })
      this.ring(t, 0.25, 2.2, 0.5, col[0], 4)
      this.ripple(t, 7.5)
      this.ripple(p, 3)
      this.shake(7)
      this.tag(t, 'ULTRA', col[0], suppressReadout)
    })
  }

  // 9. SPIKE (Specialist):
  //   Bg: hairline floor fracture | Main: oscilloscope sawtooth trace | Hit: edge-lit translucent 3D pyramidal spikes + PINNED harpoon.
  private spike = (c: Ctx): void => {
    const { fx, p, t, col, lut, dir, at, suppressReadout } = c
    const gl = this.useGl(false)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))
    const pinned = fx.events?.includes('PINNED') ?? false

    if (gl) {
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.16,
        cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.16,
        bx: t.x, by: t.y, bz: 0.16,
        width: 0.18 + slot * 0.025, dur: 0.28, lut, style: RibbonStyle.SawtoothZigzag,
      })
      this.after(at, () => {
        if (slot === 0) {
          gl.spawnSolid({
            kind: SolidKind.Spike, x0: t.x, y0: t.y, z0: 0.02,
            sx: 0.32, sy: 0.32, sz: 1.45, wireOnly: 0.45, dur: 0.44, lut,
          })
        } else if (slot === 1) {
          for (let k = 0; k < 3; k++) {
            const ang = (k / 3) * Math.PI * 2
            gl.spawnSolid({
              kind: SolidKind.Spike,
              x0: t.x + Math.cos(ang) * 0.2, y0: t.y + Math.sin(ang) * 0.2, z0: 0.02,
              sx: 0.4, sy: 0.4, sz: 1.85 + (k === 0 ? 0.5 : 0), pitch0: 0.22, yaw: ang, wireOnly: 0.45, dur: 0.46, lut,
            })
          }
        } else if (slot === 2) {
          gl.spawnSolid({
            kind: SolidKind.Spike, x0: t.x, y0: t.y, z0: 0.02,
            sx: 0.58, sy: 0.58, sz: 3.1, wireOnly: 0.45, dur: 0.5, lut,
          })
          for (let k = 0; k < 4; k++) {
            const ang = (k / 4) * Math.PI * 2 + 0.3
            gl.spawnSolid({
              kind: SolidKind.Spike,
              x0: t.x + Math.cos(ang) * 0.24, y0: t.y + Math.sin(ang) * 0.24, z0: 0.02,
              sx: 0.42, sy: 0.42, sz: 2.2, pitch0: 0.34, yaw: ang, wireOnly: 0.45, dur: 0.48, lut,
            })
          }
        } else {
          gl.spawnSolid({
            kind: SolidKind.Spike, x0: t.x, y0: t.y, z0: 0.02,
            sx: 0.72, sy: 0.72, sz: 4.4, wireOnly: 0.45, dur: 0.54, lut,
          })
          for (let k = 0; k < 7; k++) {
            const ang = (k / 7) * Math.PI * 2
            gl.spawnSolid({
              kind: SolidKind.Spike,
              x0: t.x + Math.cos(ang) * 0.24, y0: t.y + Math.sin(ang) * 0.24, z0: 0.02,
              sx: 0.46, sy: 0.46, sz: 2.2 + (k % 2) * 0.55, pitch0: 0.44, yaw: ang, wireOnly: 0.45, dur: 0.5, lut,
            })
          }
        }
        if (pinned) {
          this.hitStop = Math.max(this.hitStop, 0.032)
          gl.spawnSolid({
            kind: SolidKind.Spike,
            x0: t.x - Math.cos(dir) * 0.25, y0: t.y - Math.sin(dir) * 0.25, z0: 0.2,
            sx: 0.5, sy: 0.5, sz: 2.2, pitch0: 0.96, yaw: dir, wireOnly: 0.4, dur: 0.54, lut: LutRow.Probe,
          })
          gl.spawnDecal({ x: t.x + Math.cos(dir) * 0.7, y: t.y + Math.sin(dir) * 0.7, radius: 1.4, rot: dir, dur: 0.52, lut, kind: DecalKind.Fracture })
        }
        gl.spawnWave({ x: t.x, y: t.y, z: 0.25, r0: 0.16, r1: 1.15, pitchX: 0.42, rollY: 0, thickness: 0.12, dur: 0.34, lut, mode: WaveMode.Shock })
        gl.spawnDecal({ x: t.x, y: t.y, radius: 1.35, rot: dir, dur: 0.46, lut, kind: DecalKind.Fracture })
        this.glTriangleSpray(gl, t.x, t.y, 16, lut, dir, Math.PI * 2, [2.4, 7.8])
        this.ripple(t, 5.2)
        this.shake(4.5)
        this.tag(t, 'SPIKE', col[0], suppressReadout)
      })
      return
    }

    const trace: Coord[] = []
    const steps = 18
    const nx = -Math.sin(dir)
    const ny = Math.cos(dir)
    for (let i = 0; i <= steps; i++) {
      const f = i / steps
      const pt = lerp(p, t, f)
      const amp = f > 0.15 && f < 0.95 ? (i % 2 ? 1 : -1) * 0.18 * f : 0
      trace.push({ x: pt.x + nx * amp, y: pt.y + ny * amp })
    }
    this.poly(trace, 0.4, col[0], 1.5)
    this.after(at, () => {
      this.poly([{ x: t.x - 0.28, y: t.y }, { x: t.x, y: t.y - 1.2 - slot * 0.35 }, { x: t.x + 0.28, y: t.y }], 0.4, col[1], 2.5)
      if (pinned) this.beam(t, { x: t.x + Math.cos(dir) * 0.9, y: t.y + Math.sin(dir) * 0.9 }, 0.38, '#f4f4f4', 3)
      this.burst(t.x, t.y, { n: 18, dir: -Math.PI / 2, spread: 0.7, speed: [4, 13], life: [0.22, 0.48], colors: col, grav: 12, size: 4, type: 'triangle' })
      this.ripple(t, 5.2)
      this.shake(4.5)
      this.tag(t, 'SPIKE', col[0], suppressReadout)
    })
  }

  // 10. FLOOD (Specialist):
  //   Bg: BFS square basin wash | Main: surging liquid-plasma tidal waves | Hit: crown droplet splash + drain whirlpool on cleared Flag.
  private floodFill = ({ fx, p, t, col, lut, at, board, suppressReadout }: Ctx): void => {
    const gl = this.useGl(false)
    const reached = bfsRangeCells(fx, board?.walls)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))
    const maxDist = reached.reduce((m, r) => Math.max(m, r.dist), 1)

    if (gl) {
      if (this.firstInAreaStep(fx)) {
        // Background: BFS square basins
        for (const { cell, dist } of reached) {
          this.after(dist * 38, () => {
            gl.spawnCloud({
              x: cell.x + 0.5, y: cell.y + 0.5, z: 0.02,
              radius: 0.49, endRadius: 0.49, dur: 0.58, lut, mode: CloudMode.LiquidCell, whirlpool: false,
            })
          })
        }
        // Main: single crisp tidal wavefront crest sweeping across reachable space
        gl.spawnWave({
          x: p.x, y: p.y, z: 0.24, r0: 0.35, r1: Math.min(4.2, maxDist + 0.35),
          pitchX: 0.28, rollY: 0.12, thickness: 0.10, dur: 0.36, lut, mode: WaveMode.Shock,
        })
        this.ripple(mid(fx.origin), 3.6, 5.6)
      }
      // Main crest ribbon sweeping onto target
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.24,
        cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.64,
        bx: t.x, by: t.y, bz: 0.22,
        width: 0.26, dur: Math.max(0.24, at / 1000 + 0.08), lut, style: RibbonStyle.Beam,
      })
      this.after(at, () => {
        gl.spawnDecal({ x: t.x, y: t.y, radius: 0.62, dur: 0.46, lut, kind: DecalKind.Flood })
        gl.spawnWave({
          x: t.x, y: t.y, z: 0.22, r0: 0.16, r1: 0.92,
          pitchX: 0.36, rollY: 0, thickness: 0.09, dur: 0.32, lut, mode: WaveMode.Shock,
        })
        this.glBurst(gl, t.x, t.y, 0.2, 16 + slot * 4, lut, {
          speed: [1.6, 5.2], vz: [3.8, 7.6], life: [0.32, 0.66], size: 2.8, drag: 1.5, gravZ: -16, bounce: 0.25, shape: ParticleShape.Droplet,
        })
        if (fx.blank) {
          const bm = mid(fx.blank)
          gl.spawnRibbon({
            ax: t.x, ay: t.y, az: 0.16,
            cx: (t.x + bm.x) * 0.5, cy: (t.y + bm.y) * 0.5, cz: 0.42,
            bx: bm.x, by: bm.y, bz: 0.08,
            width: 0.18, dur: 0.44, lut, style: RibbonStyle.Trail,
          })
          gl.spawnCloud({
            x: bm.x, y: bm.y, z: 0.03, radius: 0.56, endRadius: 0.38,
            dur: 0.68, lut, mode: CloudMode.LiquidCell, whirlpool: true,
          })
        }
        this.ripple(t, 3.0)
        this.tag(t, 'FILLED', col[0], suppressReadout)
      })
      return
    }

    if (this.firstInAreaStep(fx)) {
      for (const { cell, dist } of reached) {
        this.after(dist * 42, () => this.lit(cell.x, cell.y, col[0], 0.22, 0.5))
      }
    }
    this.after(at, () => {
      this.burst(t.x, t.y, { n: 16, speed: [1.5, 5], life: [0.25, 0.55], colors: col, type: 'spark' })
      if (fx.blank) this.ring(mid(fx.blank), 0.42, 0.08, 0.5, col[0], 2)
      this.ripple(t, 3.0)
      this.tag(t, 'FILLED', col[0], suppressReadout)
    })
  }

  // 11. PROBE (Specialist):
  //   Bg: faint diagnostic square reticle | Main: hair-thin surgical laser needle | Hit: translucent Fresnel shield + tomography scan plane + 5 octahedron nodes.
  private probe = ({ fx, p, t, col, lut, dir, at, suppressReadout }: Ctx): void => {
    const gl = this.useGl(false)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))
    const nodes = [[-0.28, -0.24, 0.64], [0.26, -0.28, 0.72], [0, 0.02, 0.52], [-0.24, 0.28, 0.68], [0.28, 0.25, 0.56]]
      .map(([dx, dy, z]) => ({ x: t.x + dx, y: t.y + dy, z }))

    if (gl) {
      gl.spawnDecal({ x: t.x, y: t.y, radius: 0.66, dur: 0.85, lut: LutRow.Probe, kind: DecalKind.Tile })
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.6,
        cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.6,
        bx: t.x, by: t.y, bz: 0.6,
        width: 0.09, dur: 0.72, lut: LutRow.Probe, style: RibbonStyle.VectorRay, spin: -1,
      })
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.6,
        cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.6,
        bx: t.x, by: t.y, bz: 0.6,
        width: 0.05, dur: 0.68, lut, style: RibbonStyle.VectorRay, spin: -1,
      })
      // Intact translucent Fresnel Security sphere (zero harsh solid overdraw)
      gl.spawnDome({ x: t.x, y: t.y, z: 0.6, r0: 0.74, r1: 0.8, dur: 0.88, lut: LutRow.Probe })
      gl.spawnWave({
        x: t.x - Math.cos(dir) * 0.55, y: t.y - Math.sin(dir) * 0.55, z: 0.6,
        r0: 0.04, r1: 0.26, pitchX: 0.85, rollY: dir, thickness: 0.05, dur: 0.26, lut: LutRow.Probe, mode: WaveMode.Slice,
      })
      this.after(140, () => {
        gl.spawnSolid({
          kind: SolidKind.ScanPlane,
          x0: t.x, y0: t.y, z0: 1.32,
          x1: t.x, y1: t.y, z1: 0.05,
          sx: 1.3 + (slot >= 2 ? 0.16 : 0), sy: 1.3 + (slot >= 2 ? 0.16 : 0), sz: 1,
          dur: 0.42, lut,
        })
      })
      nodes.forEach((node, i) => {
        this.after(180 + i * 55, () => {
          gl.spawnSolid({
            kind: SolidKind.Octahedron,
            x0: node.x, y0: node.y, z0: node.z,
            sx: 0.17, sy: 0.17, sz: 0.17, spin: 3.5, dur: 0.44, lut,
          })
          if (i > 0) {
            const prev = nodes[i - 1]
            gl.spawnRibbon({
              ax: prev.x, ay: prev.y, az: prev.z,
              cx: (prev.x + node.x) * 0.5, cy: (prev.y + node.y) * 0.5, cz: (prev.z + node.z) * 0.5,
              bx: node.x, by: node.y, bz: node.z,
              width: 0.06, dur: 0.4, lut: LutRow.Probe, style: RibbonStyle.VectorRay, spin: -1,
            })
          }
        })
      })
      this.after(at, () => {
        gl.spawnWave({
          x: t.x, y: t.y, z: 0.45, r0: 0.14, r1: 0.86,
          pitchX: 0.4, rollY: 0.2, thickness: 0.08, dur: 0.3, lut: LutRow.Probe, mode: WaveMode.Shock,
        })
        this.tag(t, 'SECURITY IGNORED', col[0], suppressReadout)
      })
      return
    }

    const shield: Coord[] = []
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2
      shield.push({ x: t.x + Math.cos(a) * 0.62, y: t.y + Math.sin(a) * 0.62 })
    }
    this.poly(shield, 0.9, '#b8b6af', 1.5)
    this.poly([p, t], 0.72, col[0], 1)
    for (let k = 0; k < 8; k++) {
      this.after(140 + k * 35, () => {
        const y = t.y - 0.54 + (1.08 * k) / 7
        this.poly([{ x: t.x - 0.5, y }, { x: t.x + 0.5, y }], 0.08, col[0], 1.2)
      })
    }
    nodes.forEach((node, i) => {
      this.after(180 + i * 55, () => {
        this.add({ x: node.x, y: node.y, life: 0.35, size: 3, color: col[0], type: 'square' })
        if (i) this.poly([nodes[i - 1], node], 0.4, '#f4f4f4', 1)
      })
    })
    this.after(at, () => this.tag(t, 'SECURITY IGNORED', col[0], suppressReadout))
  }

  step(time: number): void {
    const dt = Math.min(0.033, Math.max(0, (time - this.last) / 1000))
    this.last = time
    this.lastStepDt = dt
    this.now = time

    let dueLen = 0
    let writeTimers = 0
    for (let i = 0; i < this.timers.length; i++) {
      const timer = this.timers[i]
      if (timer.at <= time) this.dueScratch[dueLen++] = timer.fn
      else this.timers[writeTimers++] = timer
    }
    this.timers.length = writeTimers
    for (let i = 0; i < dueLen; i++) {
      const fn = this.dueScratch[i]
      fn()
    }
    this.dueScratch.length = 0

    const frozen = this.hitStop > 0
    if (frozen) this.hitStop = Math.max(0, this.hitStop - dt)

    this.gl?.step(dt, frozen)

    if (!frozen) {
      let writeShots = 0
      for (let i = 0; i < this.shots.length; i++) {
        const shot = this.shots[i]
        shot.t += dt
        const f = Math.min(1, shot.t / shot.dur)
        const at = lerp(shot.a, shot.b, f)
        shot.tick(at.x, at.y, f)
        if (f >= 1) shot.done()
        else this.shots[writeShots++] = shot
      }
      this.shots.length = writeShots

      let writeParts = 0
      for (let i = 0; i < this.parts.length; i++) {
        const part = this.parts[i]
        if (part.home) {
          const dx = part.home.x - part.x
          const dy = part.home.y - part.y
          const dist = Math.hypot(dx, dy) || 1
          const pull = (1 - part.life / part.max) * 230
          part.vx += (dx / dist) * pull * dt
          part.vy += (dy / dist) * pull * dt
          if (dist < 0.3) part.life = 0
        }
        if (part.jit) {
          part.vx += rnd(-1, 1) * part.jit * dt * 8
          part.vy += rnd(-1, 1) * part.jit * dt * 8
        }
        part.vx -= part.vx * part.drag * dt
        part.vy -= part.vy * part.drag * dt
        part.vy += part.grav * dt
        part.x += part.vx * dt
        part.y += part.vy * dt
        part.life -= dt
        if (part.life > 0) this.parts[writeParts++] = part
      }
      this.parts.length = writeParts

      compactTimed(this.rings, dt)
      compactTimed(this.beams, dt)
      compactTimed(this.flashes, dt)
      compactTimed(this.lines, dt)
      compactTimed(this.cells, dt)
      compactTimed(this.distortWaves, dt)

      for (const point of this.grid) {
        point.vx += (-point.ox * 190 - point.vx * 9) * dt
        point.vy += (-point.oy * 190 - point.vy * 9) * dt
        point.ox += point.vx * dt
        point.oy += point.vy * dt
      }
    }

    this.timeFreeze = Math.max(0, this.timeFreeze - dt)
    compactTimed(this.tags, dt)
    compactTimed(this.nums, dt)

    this.shakeAmp *= Math.pow(0.0008, dt)
    this.screenFlash = Math.max(0, this.screenFlash - dt * 1.6)
  }

  timeFreezeState(): TimeFreezeState {
    if (this.timeFreeze <= 0.001) return { intensity: 0, origin: this.timeFreezeOrigin, stage: 0 }
    return {
      intensity: Math.min(1, this.timeFreeze / Math.max(0.01, this.timeFreezeMax)),
      origin: this.timeFreezeOrigin,
      stage: this.timeFreezeStage,
    }
  }

  cellWarp(x: number, y: number): CellWarp {
    const point = this.grid[y * SIZE + x]
    let ox = point ? point.ox : 0
    let oy = point ? point.oy : 0
    let scaleDelta = 0
    let crestSum = 0
    if (this.distortWaves.length) {
      const cx = x + 0.5
      const cy = y + 0.5
      for (const wave of this.distortWaves) {
        const f = wave.t / wave.dur
        const ease = 1 - Math.pow(1 - f, 2.2)
        const r = wave.r0 + (wave.r1 - wave.r0) * ease
        const dx = cx - wave.x
        const dy = cy - wave.y
        const dist = Math.hypot(dx, dy)
        if (dist < 0.01) continue
        const u = (dist - r) / wave.band
        if (Math.abs(u) > 2.8) continue
        const fade = Math.max(0, 1 - f)
        const disp = -u * Math.exp(-u * u * 1.35) * 1.65 * wave.amp * fade
        const ridge = Math.exp(-u * u * 2.2) * fade
        ox += (dx / dist) * disp
        oy += (dy / dist) * disp
        scaleDelta += ridge * 0.12
        crestSum += ridge
      }
    }
    return { x: ox, y: oy, scale: 1 + Math.min(0.28, scaleDelta), crest: Math.min(1, crestSum) }
  }

  cellOffset(x: number, y: number): Coord {
    const warp = this.cellWarp(x, y)
    return { x: warp.x, y: warp.y }
  }

  shakeOffset(): Coord {
    return this.shakeAmp > 0.2 ? { x: rnd(-1, 1) * this.shakeAmp, y: rnd(-1, 1) * this.shakeAmp } : { x: 0, y: 0 }
  }

  private drawReadoutOverlay(view: FxView, shake: Coord): void {
    const { origin, cell } = view
    let slot = 0
    for (let i = 0; i < this.tags.length && slot < this.readoutPool.length; i++) {
      const tag = this.tags[i]
      const el = this.readoutPool[slot++]
      const x = origin.x + shake.x + tag.x * cell
      const y = origin.y + shake.y + (tag.y + 0.78) * cell
      const alpha = Math.max(0, Math.min(1, (tag.dur - tag.t) / 0.35))
      const fontSize = Math.max(8, Math.min(12, cell * 0.24))
      el.className = 'vfx-pop is-tag'
      el.textContent = tag.text
      el.style.display = 'block'
      el.style.color = tag.color
      el.style.fontSize = `${fontSize}px`
      el.style.opacity = alpha.toFixed(3)
      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`
    }
    for (let i = 0; i < this.nums.length && slot < this.readoutPool.length; i++) {
      const num = this.nums[i]
      const el = this.readoutPool[slot++]
      const f = num.t / num.dur
      const pop = num.t < 0.1 ? 1.6 - 6 * num.t : 1
      const fontSize = Math.max(11, cell * (num.text.length > 3 ? 0.3 : num.big ? 0.62 : 0.48)) * pop
      const x = origin.x + shake.x + num.x * cell
      const y = origin.y + shake.y + (num.y - 0.62 - (1 - (1 - f) ** 3) * 0.7) * cell
      const alpha = f < 0.6 ? 1 : Math.max(0, 1 - (f - 0.6) / 0.4)
      el.className = `vfx-pop is-num${num.big ? ' is-big' : ''}`
      el.textContent = num.text
      el.style.display = 'block'
      el.style.color = num.color
      el.style.fontSize = `${fontSize.toFixed(1)}px`
      el.style.opacity = alpha.toFixed(3)
      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`
    }
    while (slot < this.readoutPool.length) {
      this.readoutPool[slot++].style.display = 'none'
    }
  }

  draw(ctx: CanvasRenderingContext2D, view: FxView, shake: Coord): void {
    const { origin, cell, dpr } = view
    const cssW = ctx.canvas.width / Math.max(1, dpr)
    const cssH = ctx.canvas.height / Math.max(1, dpr)

    if (this.gl?.isWebglActive) {
      this.gl.render(cssW, cssH, dpr, origin.x + shake.x, origin.y + shake.y, cell, this.lastStepDt)
    }

    const busy = this.parts.length || this.rings.length || this.beams.length || this.flashes.length || this.lines.length || this.cells.length
    if (busy) {
      this.totalFrames2d++
      const width = ctx.canvas.width
      const height = ctx.canvas.height
      if (!this.layer) this.layer = document.createElement('canvas')
      if (!this.bloom) this.bloom = document.createElement('canvas')
      if (this.layer.width !== width || this.layer.height !== height) {
        this.layer.width = width
        this.layer.height = height
        this.bloom.width = Math.max(1, Math.ceil(width / 4))
        this.bloom.height = Math.max(1, Math.ceil(height / 4))
      }
      const fx = this.layer.getContext('2d')
      const glow = this.bloom.getContext('2d')
      if (fx && glow) {
        fx.setTransform(1, 0, 0, 1, 0, 0)
        fx.globalCompositeOperation = 'source-over'
        fx.globalAlpha = 1
        fx.clearRect(0, 0, width, height)
        fx.globalCompositeOperation = 'lighter'
        fx.setTransform(dpr * cell, 0, 0, dpr * cell, dpr * (origin.x + shake.x), dpr * (origin.y + shake.y))
        fx.lineCap = 'round'
        fx.lineJoin = 'round'
        const px = 1 / cell

        for (const lit of this.cells) {
          const k = 1 - lit.t / lit.dur
          fx.fillStyle = fx.strokeStyle = lit.color
          fx.lineWidth = 1.2 * px
          fx.globalAlpha = k * lit.fill
          fx.fillRect(lit.x + 2 * px, lit.y + 2 * px, 1 - 4 * px, 1 - 4 * px)
          fx.globalAlpha = k
          fx.strokeRect(lit.x + 3 * px, lit.y + 3 * px, 1 - 6 * px, 1 - 6 * px)
        }
        for (const line of this.lines) {
          fx.globalAlpha = Math.min(1, (1 - line.t / line.dur) * 1.8)
          fx.strokeStyle = line.color
          fx.lineWidth = line.w * px
          fx.beginPath()
          line.pts.forEach((point, i) => i ? fx.lineTo(point.x, point.y) : fx.moveTo(point.x, point.y))
          fx.stroke()
        }
        for (const beam of this.beams) {
          const k = 1 - beam.t / beam.dur
          fx.globalAlpha = k
          fx.strokeStyle = beam.color
          fx.lineWidth = beam.w * (0.4 + k * 0.6) * px
          fx.beginPath()
          fx.moveTo(beam.a.x, beam.a.y)
          fx.lineTo(beam.b.x, beam.b.y)
          fx.stroke()
        }
        for (const ring of this.rings) {
          const f = ring.t / ring.dur
          fx.globalAlpha = 1 - f
          fx.strokeStyle = ring.color
          fx.lineWidth = Math.max(0.5, ring.w * (1 - f)) * px
          fx.beginPath()
          fx.arc(ring.x, ring.y, Math.max(0.01, ring.r0 + (ring.r1 - ring.r0) * (1 - (1 - f) ** 3)), 0, Math.PI * 2)
          fx.stroke()
        }
        for (const flash of this.flashes) {
          fx.globalAlpha = 1 - flash.t / flash.dur
          fx.fillStyle = '#ffffff'
          fx.beginPath()
          fx.arc(flash.x, flash.y, flash.r, 0, Math.PI * 2)
          fx.fill()
        }
        for (const part of this.parts) {
          const k = Math.min(1, (part.life / part.max) * 1.6)
          fx.globalAlpha = k
          fx.fillStyle = fx.strokeStyle = part.color
          if (part.type === 'spark') {
            fx.lineWidth = part.size * px
            fx.beginPath()
            fx.moveTo(part.x, part.y)
            fx.lineTo(part.x - part.vx * 0.035, part.y - part.vy * 0.035)
            fx.stroke()
          } else if (part.type === 'square') {
            const size = part.size * px
            fx.fillRect(part.x - size / 2, part.y - size / 2, size, size)
          } else if (part.type === 'triangle') {
            const r = part.size * px * 0.95
            const ang = Math.atan2(part.vy, part.vx)
            fx.lineWidth = Math.max(1, px * 1.1)
            fx.beginPath()
            for (let v = 0; v < 3; v++) {
              const a = ang + (v * Math.PI * 2) / 3
              const vx = part.x + Math.cos(a) * r
              const vy = part.y + Math.sin(a) * r
              if (v === 0) fx.moveTo(vx, vy)
              else fx.lineTo(vx, vy)
            }
            fx.closePath()
            fx.globalAlpha = k * 0.42
            fx.fill()
            fx.globalAlpha = k
            fx.stroke()
          } else {
            fx.beginPath()
            fx.arc(part.x, part.y, part.size * px * k, 0, Math.PI * 2)
            fx.fill()
          }
        }

        glow.clearRect(0, 0, this.bloom.width, this.bloom.height)
        glow.imageSmoothingEnabled = true
        glow.imageSmoothingQuality = 'high'
        glow.drawImage(this.layer, 0, 0, this.bloom.width, this.bloom.height)
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalCompositeOperation = 'lighter'
        ctx.drawImage(this.layer, 0, 0)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.globalAlpha = 0.75
        ctx.drawImage(this.bloom, 0, 0, width, height)
        ctx.drawImage(this.bloom, -6 * dpr, -6 * dpr, width + 12 * dpr, height + 12 * dpr)
        ctx.restore()
      }
    }

    if (this.screenFlash > 0) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = `rgba(255,255,255,${this.screenFlash})`
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      ctx.restore()
    }

    if (this.readoutHost) {
      this.drawReadoutOverlay(view, shake)
      return
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.font = `600 ${Math.max(8, Math.min(12, cell * 0.24))}px ${MONO}`
    for (const tag of this.tags) {
      const x = origin.x + tag.x * cell
      const y = origin.y + (tag.y + 0.78) * cell
      ctx.globalAlpha = Math.max(0, Math.min(1, (tag.dur - tag.t) / 0.35))
      ctx.lineWidth = 3
      ctx.strokeStyle = '#050505'
      ctx.strokeText(tag.text, x, y)
      ctx.fillStyle = tag.color
      ctx.fillText(tag.text, x, y)
    }
    for (const num of this.nums) {
      const f = num.t / num.dur
      const pop = num.t < 0.1 ? 1.6 - 6 * num.t : 1
      const size = Math.max(11, cell * (num.text.length > 3 ? 0.3 : num.big ? 0.62 : 0.48)) * pop
      const x = origin.x + num.x * cell
      const y = origin.y + (num.y - 0.62 - (1 - (1 - f) ** 3) * 0.7) * cell
      ctx.globalAlpha = f < 0.6 ? 1 : 1 - (f - 0.6) / 0.4
      ctx.font = `700 ${size}px ${MONO}`
      ctx.lineWidth = Math.max(3, size * 0.2)
      ctx.strokeStyle = '#050505'
      ctx.strokeText(num.text, x, y)
      ctx.fillStyle = num.color
      ctx.fillText(num.text, x, y)
    }
    ctx.globalAlpha = 1
  }

  stats(): VfxStats {
    if (this.gl?.isWebglActive) return this.gl.stats()
    return {
      backend: '2d',
      setting: vfxQualityStore.getSnapshot(),
      tier: 'low',
      hdrFloat: false,
      contextLost: Boolean(this.gl && !this.gl.isAvailable),
      activeParticles: this.parts.length,
      activeRibbons: this.beams.length,
      activeWaves: this.rings.length,
      activeDecals: this.cells.length,
      activeSolids: 0,
      activeClouds: 0,
      peakParticles: this.peakParticles2d,
      peakRibbons: 0,
      peakSolids: 0,
      peakClouds: 0,
      renderPassesLastFrame: 0,
      totalRenderedFrames: this.totalFrames2d,
      vramBytesApprox: 0,
    }
  }
}
