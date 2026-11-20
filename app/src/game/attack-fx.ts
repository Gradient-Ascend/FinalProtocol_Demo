import { MONO, allowFlash } from '../cinematic/display'
import { inAttackRange } from './attack-methods'
import type { AttackEffect, Coord } from './battle-types'
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
  type: 'spark' | 'dot' | 'square'
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
  if (fx.overload) return { strike: 0, settle: 300 }
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
    case 'zero': return { strike: 0, settle: 430 }
    case 'ultra': return { strike: 340, settle: 560 }
    case 'probe': return { strike: 520, settle: 380 }
    default: return { strike: 360, settle: 440 }
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
  private peakParticles2d = 0
  private totalFrames2d = 0

  // Lazy-allocated 2D fallback canvases (zero DOM creation in Node or until needed)
  private layer: HTMLCanvasElement | null = null
  private bloom: HTMLCanvasElement | null = null

  // Optional mounted 2.5D WebGL2 engine + post-bloom DOM text readout pool
  private gl: VfxWebglEngine | null = null
  private readoutHost: HTMLDivElement | null = null
  private readoutPool: HTMLSpanElement[] = []

  attachOverlay(stage: HTMLElement | null): void {
    if (!stage || typeof document === 'undefined') return
    this.disposeOverlay()

    this.gl = VfxWebglEngine.create(stage)
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
    let start = Math.max(this.now, this.nextStart)
    if (effect.overload && !reduced && start - this.lastOverload > 1500) {
      this.timers.push({ at: start, fn: () => this.cascade(mid(effect.origin), reduced) })
      start += 340
    }
    if (effect.overload) this.lastOverload = start
    this.nextStart = start + (reduced ? 60 : effect.overload ? 110 : timing.strike + timing.settle - 20)
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
    this.hitStop = 0
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
    if (color === AMBER[0]) rememberAmber(at, text)
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
    if (dealt > 0 && col === AMBER) rememberAmber(at, text)
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
      zero: this.zeroShot,
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
    this.after(at, () => { this.number(t, fx, col); this.note(t, fx) })
    if (fx.source === 'enemy') { this.swarm(c); return }
    if (fx.overload) { this.overloadStrike(c); return }
    this.dispatchPlayerSkill(fx.fx ?? '', c)
  }

  // OVERLOAD opening cascade (340 ms): SELF's 4 brackets elevate into 3D obsidian-violet
  // monoliths, orbit 90° (Deck A <-> B switch), and burst as a radial prism curtain.
  private cascade(p: Coord, reduced: boolean): void {
    const gl = this.useGl(reduced)
    if (gl) {
      for (let c = 0; c < 4; c++) {
        const ang = (c * Math.PI) / 2 + Math.PI * 0.25
        const nextAng = ((c + 1) % 4) * (Math.PI / 2) + Math.PI * 0.25
        const px0 = p.x + Math.cos(ang) * 0.62
        const py0 = p.y + Math.sin(ang) * 0.62
        const px1 = p.x + Math.cos(nextAng) * 0.62
        const py1 = p.y + Math.sin(nextAng) * 0.62
        gl.spawnSolid({
          kind: SolidKind.Monolith,
          x0: px0, y0: py0, z0: 0.04,
          x1: px1, y1: py1, z1: 1.45,
          sx: 0.24, sy: 0.24, sz: 2.25,
          yaw: ang, spin: 1.57, dur: 0.34, lut: LutRow.Violet,
        })
        const nx = p.x + Math.cos(nextAng) * 0.62
        const ny = p.y + Math.sin(nextAng) * 0.62
        gl.spawnRibbon({
          ax: px0, ay: py0, az: 1.15,
          cx: (px0 + nx) * 0.5, cy: (py0 + ny) * 0.5, cz: 1.4,
          bx: nx, by: ny, bz: 1.15,
          width: 0.14, dur: 0.34, lut: LutRow.Violet, style: RibbonStyle.VectorRay, spin: -1,
        })
      }
      for (let k = 0; k < 4; k++) {
        this.after(k * 65, () => {
          gl.spawnCloud({
            x: p.x + rnd(-0.35, 0.35), y: p.y + rnd(-0.35, 0.35), z: 0.5 + k * 0.32,
            vz: 1.4, radius: 0.65, endRadius: 1.25, dur: 0.36, lut: LutRow.Violet, mode: CloudMode.Mist,
          })
          this.glImplode(gl, p, 1.5, 18, LutRow.Violet, 2.8, 0.24, ParticleShape.Shard)
        })
      }
      this.after(340, () => {
        this.triggerFlash(0.18)
        this.hitStop = 0.036
        gl.spawnDecal({ x: p.x, y: p.y, radius: 6.5, dur: 0.72, lut: LutRow.Violet, kind: DecalKind.Spill })
        for (let k = 0; k < 16; k++) {
          const ang = (k / 16) * Math.PI * 2
          const dist = 3.2 + (k % 2) * 1.4
          gl.spawnSolid({
            kind: k % 2 === 0 ? SolidKind.Wedge : SolidKind.Octahedron,
            x0: p.x, y0: p.y, z0: 1.1,
            x1: p.x + Math.cos(ang) * dist, y1: p.y + Math.sin(ang) * dist, z1: 0.14,
            sx: 0.42, sy: 0.42, sz: 0.42, scaleEnd: 0.3,
            yaw: ang, spin: 4.5, dur: 0.5, lut: LutRow.Violet,
          })
        }
        this.glBurst(gl, p.x, p.y, 0.9, 36, LutRow.Violet, {
          speed: [4.5, 14.0], vz: [2.5, 8.2], life: [0.38, 0.88], size: 3.1, curl: 2.2, bounce: 0.48, shape: ParticleShape.Cuboid,
        })
        this.glBurst(gl, p.x, p.y, 0.9, 52, LutRow.Violet, {
          speed: [5.0, 15.0], vz: [2.8, 8.6], life: [0.35, 0.85], size: 2.6, curl: 4.2, bounce: 0.46, shape: ParticleShape.Spark,
        })
        this.ripple(p, 11, 10)
        this.shake(7.5)
      })
      return
    }

    for (let k = 0; k < 5; k++) this.after(k * 55, () => this.implode(p, 14, VIOLET, 2.6, 0.22))
    this.after(340, () => {
      this.triggerFlash(0.18)
      this.poly([
        { x: p.x - 1.2, y: p.y - 1.2 }, { x: p.x + 1.2, y: p.y - 1.2 },
        { x: p.x + 1.2, y: p.y + 1.2 }, { x: p.x - 1.2, y: p.y + 1.2 }, { x: p.x - 1.2, y: p.y - 1.2 },
      ], 0.45, VIOLET[0], 3)
      this.ring(p, 0.2, 9, 0.7, VIOLET[0], 4)
      this.ripple(p, 11, 10)
      this.shake(7.5)
      this.burst(p.x, p.y, { n: 44, speed: [3, 13], life: [0.4, 0.85], colors: VIOLET, type: 'square' })
    })
  }

  // OVERLOAD strike: replays each switched-deck skill in its own morphology tinted Violet.
  private overloadStrike = (c: Ctx): void => {
    const { fx, p, t, col } = c
    const steps = fx.overloadSteps
    if (steps?.length) {
      steps.forEach((sub, idx) => {
        this.after(idx * 75, () => {
          const subFx: AttackEffect = {
            ...fx,
            fx: sub.fx,
            stepIndex: sub.stepIndex,
            slotAmount: sub.slotAmount,
            pierce: sub.pierce,
            amount: sub.amount,
            cap: sub.cap,
            dealt: sub.dealt,
            absorbed: sub.absorbed,
            events: sub.events,
            blank: sub.blank,
            movedTo: sub.movedTo,
            securityBefore: sub.securityBefore,
            readTags: sub.readTags,
            overload: true,
          }
          const subTiming = effectTiming({ ...subFx, overload: false })
          const subAt = Math.min(260, subTiming.strike)
          this.dispatchPlayerSkill(sub.fx ?? 'base', {
            ...c,
            fx: subFx,
            lut: LutRow.Violet,
            col: VIOLET,
            at: subAt,
            suppressReadout: true,
          })
        })
      })
      this.tag(t, 'OVERLOAD', col[0])
      return
    }

    const gl = this.useGl(false)
    if (gl) {
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.48, cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.65,
        bx: t.x, by: t.y, bz: 0.42, width: 0.42, dur: 0.34, lut: LutRow.Violet, style: RibbonStyle.TwinHitscan,
      })
      gl.spawnSolid({
        kind: SolidKind.Wedge,
        x0: p.x, y0: p.y, z0: 0.52, x1: t.x, y1: t.y, z1: 0.42,
        sx: 0.85, sy: 0.85, sz: 0.65, yaw: c.dir, quantSteps: 4, dur: 0.32, lut: LutRow.Violet,
      })
      for (let k = 0; k < 4; k++) {
        gl.spawnSolid({
          kind: SolidKind.CornerBracket,
          x0: t.x, y0: t.y, z0: 0.6, sx: 0.9, sy: 0.9, sz: 0.45, scaleEnd: 0.6,
          yaw: k * Math.PI * 0.5, dur: 0.34, lut: LutRow.Violet,
        })
      }
      this.hitStop = Math.max(this.hitStop, 0.03)
    } else {
      this.beam(p, t, 0.24, pick(col), 4)
    }
    this.ripple(t, 4.5)
    this.shake(4.2)
    this.tag(t, 'OVERLOAD', col[0])
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

  // 1. BASE (VECTOR): Basis-vector ray + 4 quantized hold-step 3D wedge rams + PUSH/BUMP solids.
  private forwardPass = (c: Ctx): void => {
    const { fx, p, t, col, lut, dir, at, suppressReadout } = c
    const gl = this.useGl(false)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))
    const dist = Math.max(1, Math.hypot(t.x - p.x, t.y - p.y))
    const bumped = fx.events?.includes('BUMP') ?? false
    const pushed = fx.events?.includes('PUSH') ?? false
    const dest = fx.movedTo ? mid(fx.movedTo) : t
    const dx = Math.sign(fx.target.x - fx.origin.x)
    const dy = Math.sign(fx.target.y - fx.origin.y)
    const away = dx || dy ? { x: dx, y: dy } : { x: Math.cos(dir), y: Math.sin(dir) }

    if (gl) {
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.32,
        cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.32,
        bx: t.x, by: t.y, bz: 0.32,
        width: 0.14 + slot * 0.02, dur: Math.max(0.28, at / 1000 + 0.08),
        lut, style: RibbonStyle.VectorRay, spin: Math.max(2, Math.round(dist)),
      })
      gl.spawnSolid({
        kind: SolidKind.Wedge,
        x0: p.x, y0: p.y, z0: 0.48,
        x1: t.x, y1: t.y, z1: 0.42,
        sx: 0.78 + slot * 0.09, sy: 0.72 + slot * 0.09, sz: 0.54 + slot * 0.08,
        yaw: dir, quantSteps: 4, wireOnly: 0, dur: Math.max(0.22, (at + 60) / 1000), lut,
      })
      for (let k = 1; k <= 3; k++) {
        this.after((at * k) / 4, () => {
          const gp = lerp(p, t, k / 4)
          gl.spawnSolid({
            kind: SolidKind.Wedge,
            x0: gp.x, y0: gp.y, z0: 0.46,
            sx: 0.8 + slot * 0.08, sy: 0.74 + slot * 0.08, sz: 0.52,
            yaw: dir, wireOnly: 1, dur: 0.24, lut,
          })
        })
      }
      if (slot >= 2) {
        this.after(at * 0.22, () => {
          gl.spawnSolid({
            kind: SolidKind.Wedge,
            x0: p.x, y0: p.y, z0: 0.72,
            x1: t.x, y1: t.y, z1: 0.58,
            sx: 1.02, sy: 0.96, sz: 0.66,
            yaw: dir, quantSteps: 4, wireOnly: 1, dur: 0.28, lut,
          })
        })
      }
      this.after(at, () => {
        const nx = -Math.sin(dir) * 0.26
        const ny = Math.cos(dir) * 0.26
        for (const s of [-1, 1]) {
          gl.spawnRibbon({
            ax: p.x + nx * s, ay: p.y + ny * s, az: 0.05,
            cx: (p.x + t.x) * 0.5 + nx * s, cy: (p.y + t.y) * 0.5 + ny * s, cz: 0.05,
            bx: dest.x + nx * s, by: dest.y + ny * s, bz: 0.05,
            width: 0.08, dur: 0.34, lut, style: RibbonStyle.VectorRay, spin: -1,
          })
        }
        gl.spawnDecal({ x: t.x, y: t.y, radius: 0.62, dur: 0.34, lut, kind: DecalKind.Tile })
        if (bumped) {
          const aLen = Math.hypot(away.x, away.y) || 1
          const ax = t.x + (away.x / aLen) * 0.48
          const ay = t.y + (away.y / aLen) * 0.48
          gl.spawnSolid({
            kind: SolidKind.Monolith,
            x0: ax, y0: ay, z0: 0.02,
            sx: 0.14, sy: 0.96, sz: 1.48,
            yaw: Math.atan2(away.y, away.x), dur: 0.36, lut,
          })
          for (let k = 0; k < 4; k++) {
            const ang = dir + Math.PI + (k - 1.5) * 0.55
            gl.spawnSolid({
              kind: SolidKind.Octahedron,
              x0: ax, y0: ay, z0: 0.55,
              x1: ax + Math.cos(ang) * 0.8, y1: ay + Math.sin(ang) * 0.8, z1: 0.08,
              sx: 0.24, sy: 0.24, sz: 0.24, spin: 7.0, dur: 0.34, lut,
            })
          }
          this.glBurst(gl, ax, ay, 0.5, 22, lut, {
            dir: dir + Math.PI, spread: 1.9, speed: [2.4, 7.6], vz: [1.6, 4.8],
            life: [0.22, 0.46], size: 2.8, gravZ: -12, bounce: 0.45, shape: ParticleShape.Cuboid,
          })
          this.shake(3.4)
        } else if (pushed) {
          gl.spawnSolid({
            kind: SolidKind.Wedge,
            x0: dest.x, y0: dest.y, z0: 0.32,
            sx: 0.72, sy: 0.68, sz: 0.44, yaw: dir, dur: 0.3, lut,
          })
          for (const side of [-0.45, 0.45]) {
            gl.spawnSolid({
              kind: SolidKind.CornerBracket,
              x0: dest.x, y0: dest.y, z0: 0.45,
              sx: 0.82, sy: 0.82, sz: 0.35, yaw: dir + side, dur: 0.3, lut,
            })
          }
          this.glBurst(gl, dest.x, dest.y, 0.35, 14, lut, {
            dir, spread: 0.8, speed: [2.2, 6.4], vz: [1.2, 3.6], life: [0.2, 0.4], size: 2.5, shape: ParticleShape.Cuboid,
          })
        } else {
          this.glBurst(gl, t.x, t.y, 0.35, 14, lut, {
            dir, spread: 1.4, speed: [2.2, 6.2], vz: [1.4, 3.8], life: [0.2, 0.4], size: 2.5, shape: ParticleShape.Cuboid,
          })
        }
        this.ripple(t, bumped ? 4.5 : 3.2)
        this.tag(t, 'FORWARD PASS', col[0], suppressReadout)
      })
      return
    }

    const nx = -Math.sin(dir) * 0.25
    const ny = Math.cos(dir) * 0.25
    for (let k = 1; k <= 4; k++) {
      this.after((at * k) / 4, () => {
        const pt = lerp(p, t, k / 4)
        const tip = { x: pt.x + Math.cos(dir) * 0.28, y: pt.y + Math.sin(dir) * 0.28 }
        const w1 = { x: pt.x - Math.cos(dir) * 0.18 + nx, y: pt.y - Math.sin(dir) * 0.18 + ny }
        const w2 = { x: pt.x - Math.cos(dir) * 0.18 - nx, y: pt.y - Math.sin(dir) * 0.18 - ny }
        this.poly([w1, tip, w2], 0.14, col[k === 4 ? 1 : 0], 2.2)
      })
    }
    this.after(at, () => {
      this.burst(t.x, t.y, { n: bumped ? 18 : 10, dir, spread: 1.5, speed: [2, 6], life: [0.18, 0.4], colors: col, size: 3.5, type: 'square' })
      this.ripple(t, 3.2)
      this.tag(t, 'FORWARD PASS', col[0], suppressReadout)
    })
  }

  // 2. MANHATTAN (VECTOR): 90-degree orthogonal caliper rays + stepped 3D skyscraper monoliths.
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
      if (corner) {
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 0.08, cx: (p.x + corner.x) * 0.5, cy: (p.y + corner.y) * 0.5, cz: 0.08,
          bx: corner.x, by: corner.y, bz: 0.08, width: 0.16, dur: Math.max(0.28, at / 1000 + 0.16),
          lut, style: RibbonStyle.VectorRay, spin: -1,
        })
        gl.spawnRibbon({
          ax: corner.x, ay: corner.y, az: 0.08, cx: (corner.x + t.x) * 0.5, cy: (corner.y + t.y) * 0.5, cz: 0.08,
          bx: t.x, by: t.y, bz: 0.08, width: 0.16, dur: Math.max(0.28, at / 1000 + 0.16),
          lut, style: RibbonStyle.VectorRay, spin: -1,
        })
      } else {
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 0.08, cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.08,
          bx: t.x, by: t.y, bz: 0.08, width: 0.16, dur: Math.max(0.28, at / 1000 + 0.16),
          lut, style: RibbonStyle.VectorRay, spin: -1,
        })
      }
      path.forEach((cell, i) => {
        this.after(i * gap, () => {
          const pt = mid(cell)
          const h = Math.min(4.8, 0.62 + (i + 1) * 0.52 + slot * 0.12)
          gl.spawnDecal({ x: pt.x, y: pt.y, radius: 0.58, dur: 0.44, lut, kind: DecalKind.Tile })
          gl.spawnSolid({
            kind: SolidKind.Monolith,
            x0: pt.x, y0: pt.y, z0: 0.02,
            sx: 0.44, sy: 0.44, sz: h,
            dur: Math.max(0.26, (at - i * gap + 220) / 1000), lut,
          })
        })
      })
      const from = path.length > 1 ? mid(path[path.length - 2]) : p
      this.after(at, () => {
        const hingeYaw = Math.atan2(t.y - from.y, t.x - from.x)
        const peakH = Math.min(4.6, 0.8 + path.length * 0.48 + slot * 0.14)
        gl.spawnSolid({
          kind: SolidKind.Monolith,
          x0: from.x, y0: from.y, z0: 0.02,
          sx: 0.48, sy: 0.48, sz: peakH,
          pitch0: 0, pitch1: 1.42, yaw: hingeYaw, dur: 0.34, lut,
        })
        for (let k = 0; k < 4; k++) {
          gl.spawnSolid({
            kind: SolidKind.CornerBracket,
            x0: t.x, y0: t.y, z0: 0.38, sx: 0.92, sy: 0.92, sz: 0.3, scaleEnd: 0.58,
            yaw: k * Math.PI * 0.5, dur: 0.3, lut,
          })
        }
        this.glBurst(gl, t.x, t.y, 0.35, 20 + path.length * 3, lut, {
          speed: [2.0, 6.8], vz: [1.4, 4.4], life: [0.22, 0.48], size: 2.7, curl: 0.4, bounce: 0.42, shape: ParticleShape.Cuboid,
        })
        this.ripple(t, 3 + path.length * 0.45)
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
      this.burst(t.x, t.y, { n: 12, speed: [2, 6], life: [0.2, 0.4], colors: col, size: 3.5, type: 'square' })
      this.ripple(t, 3 + path.length * 0.4)
      this.tag(t, `L1 = ${path.length}`, col[0], suppressReadout)
    })
  }

  // 3. ARRAY (VECTOR): Row-major raster scan + [ ] 3D corner cages + straight tractor dashes.
  private arrayScan = ({ fx, p, t, col, lut, at, suppressReadout }: Ctx): void => {
    const gl = this.useGl(false)
    const cells = rangeCells(fx)
    const dest = fx.movedTo ? mid(fx.movedTo) : t
    const pulled = fx.events?.includes('PULL') ?? false
    const bumped = fx.events?.includes('BUMP') ?? false
    const slot = Math.max(0, Math.min(3, fx.stepIndex))

    if (gl) {
      if (this.firstInAreaStep(fx)) {
        const rows = new Map<number, { minX: number; maxX: number; firstIdx: number }>()
        cells.forEach((cell, i) => {
          this.after(i * 9, () => {
            gl.spawnDecal({ x: cell.x + 0.5, y: cell.y + 0.5, radius: 0.52, dur: 0.24, lut, kind: DecalKind.Tile })
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
              width: 0.14, dur: 0.22, lut, style: RibbonStyle.VectorRay, spin: -1,
            })
          })
        }
        this.ripple(p, 2, 4)
      }

      const cageDur = Math.max(0.28, at / 1000 + 0.22)
      for (let k = 0; k < 4; k++) {
        gl.spawnSolid({
          kind: SolidKind.CornerBracket,
          x0: t.x, y0: t.y, z0: 0.68,
          x1: pulled ? dest.x : t.x, y1: pulled ? dest.y : t.y, z1: 0.52,
          sx: 0.88 + slot * 0.05, sy: 0.88 + slot * 0.05, sz: 0.48 + slot * 0.08, scaleEnd: 0.62,
          yaw: k * Math.PI * 0.5, dur: cageDur, lut,
        })
      }

      const dAng = Math.atan2(t.y - p.y, t.x - p.x)
      const nx = -Math.sin(dAng) * 0.16
      const ny = Math.cos(dAng) * 0.16
      const railOffsets = slot >= 2 ? [-1, 1] : [0]
      for (const s of railOffsets) {
        gl.spawnRibbon({
          ax: p.x + nx * s, ay: p.y + ny * s, az: 0.45,
          cx: (p.x + t.x) * 0.5 + nx * s, cy: (p.y + t.y) * 0.5 + ny * s, cz: 0.45,
          bx: t.x + nx * s, by: t.y + ny * s, bz: 0.45,
          width: 0.22, dur: cageDur, lut, style: RibbonStyle.TractorDash,
        })
      }

      this.after(at, () => {
        if (pulled) {
          for (let k = 0; k < 4; k++) {
            gl.spawnSolid({
              kind: SolidKind.CornerBracket,
              x0: t.x, y0: t.y, z0: 0.06,
              sx: 0.86, sy: 0.86, sz: 0.18, yaw: k * Math.PI * 0.5, wireOnly: 1, dur: 0.34, lut,
            })
          }
        } else if (bumped) {
          const tx = dest.x + (p.x - dest.x) * 0.15
          const ty = dest.y + (p.y - dest.y) * 0.15
          gl.spawnSolid({
            kind: SolidKind.Monolith,
            x0: tx, y0: ty, z0: 0.02,
            sx: 0.14, sy: 0.92, sz: 1.25, yaw: dAng, dur: 0.3, lut,
          })
        }
        this.glBurst(gl, pulled ? dest.x : t.x, pulled ? dest.y : t.y, 0.35, 16, lut, {
          dir: dAng + Math.PI, spread: 1.4, speed: [2.0, 6.2], vz: [1.0, 3.4], life: [0.22, 0.46], size: 2.5, shape: ParticleShape.Cuboid,
        })
        this.ripple(t, 2.5)
        this.tag(t, `[${fx.target.y.toString(16).toUpperCase()}][${fx.target.x.toString(16).toUpperCase()}]`, col[0], suppressReadout)
      })
      return
    }

    if (this.firstInAreaStep(fx)) {
      cells.forEach((cell, i) => this.after(i * 9, () => this.lit(cell.x, cell.y, col[0], 0.16, 0.2)))
      this.ripple(p, 2, 4)
    }
    this.beam(p, t, Math.max(0.24, at / 1000 + 0.12), col[0], 2)
    this.after(at, () => {
      this.burst(t.x, t.y, { n: 8, speed: [1.5, 5], life: [0.18, 0.36], colors: col, size: 3.5, type: 'square' })
      this.tag(t, `[${fx.target.y.toString(16).toUpperCase()}][${fx.target.x.toString(16).toUpperCase()}]`, col[0], suppressReadout)
    })
  }

  // 4. ZERO (VECTOR): 0 ms twin-rail hitscan + extruded 3D Ø null-glyph + sheared hex armor plates.
  private zeroShot = (c: Ctx): void => {
    const { fx, p, t, col, lut, dir, suppressReadout } = c
    const gl = this.useGl(false)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))
    const overshootLen = 2.5 + slot * 0.4
    const overshoot = { x: t.x + Math.cos(dir) * overshootLen, y: t.y + Math.sin(dir) * overshootLen }
    const armored = (fx.securityBefore ?? 0) > 0 || (fx.absorbed ?? 0) > 0
    const breached = fx.events?.includes('BREACH') ?? false

    if (gl) {
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.56,
        cx: (p.x + overshoot.x) * 0.5, cy: (p.y + overshoot.y) * 0.5, cz: 0.56,
        bx: overshoot.x, by: overshoot.y, bz: 0.56,
        width: 0.36 + slot * 0.04, dur: 0.34, lut, style: RibbonStyle.TwinHitscan,
      })
      const cut = 0.78 + slot * 0.08
      gl.spawnRibbon({
        ax: t.x - cut, ay: t.y - cut, az: 0.85,
        cx: t.x, cy: t.y, cz: 0.85,
        bx: t.x + cut, by: t.y + cut, bz: 0.85,
        width: 0.14, dur: 0.32, lut: LutRow.Probe, style: RibbonStyle.VectorRay, spin: -1,
      })
      gl.spawnSolid({
        kind: SolidKind.NullGlyph,
        x0: t.x, y0: t.y, z0: 0.88,
        sx: 1.05 + slot * 0.09, sy: 1.05 + slot * 0.09, sz: 0.92,
        dur: 0.38, lut,
      })

      if (armored) {
        for (const s of [-1, 1]) {
          const ang = dir + s * (Math.PI * 0.35)
          gl.spawnSolid({
            kind: SolidKind.HexPlate,
            x0: t.x + Math.cos(ang) * 0.25, y0: t.y + Math.sin(ang) * 0.25, z0: 0.48,
            x1: t.x + Math.cos(ang) * 1.15, y1: t.y + Math.sin(ang) * 1.15, z1: 0.08,
            sx: 0.52, sy: 0.52, sz: 0.52, scaleEnd: 0.65, yaw: ang, spin: s * 5.2,
            pitch0: 0.35 * s, pitch1: 0.08, dur: 0.42, lut: LutRow.Probe,
          })
        }
      }
      if (breached) {
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2 + 0.2
          gl.spawnSolid({
            kind: SolidKind.HexPlate,
            x0: t.x + Math.cos(ang) * 0.32, y0: t.y + Math.sin(ang) * 0.32, z0: 0.55,
            x1: t.x + Math.cos(ang) * 1.65, y1: t.y + Math.sin(ang) * 1.65, z1: 0.06,
            sx: 0.44, sy: 0.44, sz: 0.44, scaleEnd: 0.4, yaw: ang, spin: 6.0,
            pitch0: 0.85, pitch1: 0.1, dur: 0.46, lut,
          })
        }
        this.glBurst(gl, t.x, t.y, 0.5, 24, lut, {
          speed: [3.2, 10.5], vz: [1.8, 5.2], life: [0.24, 0.54], size: 2.8, bounce: 0.44, shape: ParticleShape.Cuboid,
        })
      } else {
        this.glBurst(gl, t.x, t.y, 0.48, 16, lut, {
          dir, spread: 0.5, speed: [5, 14], vz: [1.0, 3.6], life: [0.2, 0.46], size: 2.4, bounce: 0.42, shape: ParticleShape.Cuboid,
        })
      }
      this.ripple(t, breached ? 4.4 : 3.2)
      this.tag(t, '0-SHOT', col[0], suppressReadout)
      return
    }

    const nx = -Math.sin(dir) * 0.09
    const ny = Math.cos(dir) * 0.09
    this.beam({ x: p.x + nx, y: p.y + ny }, { x: overshoot.x + nx, y: overshoot.y + ny }, 0.24, col[1], 1.5)
    this.beam({ x: p.x - nx, y: p.y - ny }, { x: overshoot.x - nx, y: overshoot.y - ny }, 0.24, col[0], 1.5)
    this.poly([{ x: t.x - 0.38, y: t.y - 0.38 }, { x: t.x + 0.38, y: t.y + 0.38 }], 0.3, col[1], 2)
    this.burst(t.x, t.y, { n: 18, dir, spread: 0.6, speed: [5, 13], life: [0.2, 0.45], colors: col, size: 3.5, type: 'square' })
    this.ripple(t, 3)
    this.tag(t, '0-SHOT', col[0], suppressReadout)
  }

  // 5. OFF (CoT): Undulating gossamer silk filaments + quenched cold charcoal smoke clouds.
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

    if (gl) {
      for (const f of [0.35, 0.72]) {
        const mp = lerp(p, t, f)
        gl.spawnCloud({
          x: mp.x, y: mp.y, z: 0.65, vz: 0.45, radius: 0.75, endRadius: 1.35,
          dur: Math.max(0.28, at / 1000 + 0.14), lut, mode: CloudMode.Mist,
        })
      }
      for (let i = 0; i < units; i++) {
        const side = (i - (units - 1) / 2) * 0.24
        const a = { x: p.x + nx * side, y: p.y + ny * side }
        const b = { x: t.x + nx * side * 0.42, y: t.y + ny * side * 0.42 }
        const cutAt = rnd(0.34, 0.72)
        if (dropped.has(i)) {
          const dp = lerp(a, b, cutAt)
          gl.spawnRibbon({
            ax: a.x, ay: a.y, az: 0.42,
            cx: (a.x + dp.x) * 0.5 + nx * side * 0.5, cy: (a.y + dp.y) * 0.5 + ny * side * 0.5, cz: 1.55,
            bx: dp.x, by: dp.y, bz: 1.15,
            width: 0.24, dur: Math.max(0.14, (at / 1000) * cutAt),
            lut, style: RibbonStyle.SilkMist,
          })
          this.after(at * cutAt, () => {
            for (let s = 0; s < 3; s++) {
              gl.spawnCloud({
                x: dp.x + rnd(-0.18, 0.18), y: dp.y + rnd(-0.18, 0.18), z: 1.1 + s * 0.18,
                vx: Math.cos(dir) * 0.55 + rnd(-0.3, 0.3), vy: Math.sin(dir) * 0.55 + rnd(-0.3, 0.3), vz: rnd(1.1, 2.2),
                radius: 0.44, endRadius: 1.05, dur: 0.68, lut, mode: CloudMode.Mist, dark: true,
              })
            }
          })
        } else {
          gl.spawnRibbon({
            ax: a.x, ay: a.y, az: 0.42,
            cx: (a.x + b.x) * 0.5 + nx * side * 0.6, cy: (a.y + b.y) * 0.5 + ny * side * 0.6, cz: 1.85,
            bx: b.x, by: b.y, bz: 0.5,
            width: 0.28, dur: Math.max(0.18, at / 1000 + 0.06),
            lut, style: RibbonStyle.SilkMist,
          })
        }
      }
      this.after(at, () => {
        if (kept > 0) {
          gl.spawnCloud({
            x: t.x, y: t.y, z: 0.65, vz: 0.5, radius: 0.85, endRadius: 0.42, dur: 0.38, lut, mode: CloudMode.Mist,
          })
          this.glBurst(gl, t.x, t.y, 0.5, 10 + kept * 3, lut, {
            speed: [0.4, 2.2], vz: [0.8, 2.6], life: [0.35, 0.72], size: 2.8, drag: 1.8, gravZ: 1.2, curl: 4.5, bounce: 0, shape: ParticleShape.Mote,
          })
          this.ripple(t, 1.2 + kept * 0.5)
        }
        if (dropTriggered) {
          for (let q = 0; q < 3; q++) {
            gl.spawnCloud({
              x: t.x + rnd(-0.22, 0.22), y: t.y + rnd(-0.22, 0.22), z: 1.55 - q * 0.28,
              vz: -0.95, radius: 1.25, endRadius: 0.62, dur: 0.56, lut, mode: CloudMode.Mist, dark: true,
            })
          }
          gl.spawnCloud({
            x: t.x, y: t.y, z: 0.45, vz: 1.85, radius: 0.55, endRadius: 1.25,
            dur: 0.64, lut: LutRow.Probe, mode: CloudMode.Mist,
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
          this.burst(x, y, { n: 5, speed: [0.4, 1.8], life: [0.35, 0.65], colors: ['#777777', '#555555'], drag: 2.2, grav: -2.4, type: 'dot' })
          return
        }
        this.add({ x, y, life: 0.06, size: 2.4, color: col[0], type: 'dot' })
      }, () => {
        if (!dropped.has(i)) this.burst(b.x, b.y, { n: 5, speed: [0.5, 2.5], life: [0.25, 0.5], colors: col, size: 2, type: 'dot' })
      })
    }
    this.after(at, () => {
      if (kept) this.ring(t, 0.15, 0.8 + kept * 0.14, 0.4, col[0], 2)
      this.tag(t, `DROPOUT ${kept}/${units} KEPT`, kept ? col[0] : '#8d8b85', suppressReadout)
    })
  }

  // 6. ON (CoT): Unbroken liquid-light dendrite stream -> volumetric nebula blossom + breathing corona halo.
  private neuronOn = (c: Ctx): void => {
    const { fx, p, t, col, lut, at, suppressReadout } = c
    const gl = this.useGl(false)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))
    const mx = (p.x + t.x) * 0.5
    const my = (p.y + t.y) * 0.5
    const dealt = fx.dealt ?? fx.amount ?? 0

    if (gl) {
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.48, cx: mx, cy: my, cz: 1.55,
        bx: t.x, by: t.y, bz: 0.55, width: 0.28 + slot * 0.04, dur: 0.46, lut, style: RibbonStyle.SilkMist,
      })
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.48, cx: mx, cy: my, cz: 1.55,
        bx: t.x, by: t.y, bz: 0.55, width: 0.72 + slot * 0.08, dur: 0.5, lut, style: RibbonStyle.SilkMist,
      })
      for (const f of [0.25, 0.5, 0.75]) {
        const pt = lerp(p, t, f)
        this.after(f * (at - 30), () => {
          gl.spawnCloud({
            x: pt.x, y: pt.y, z: 0.55 + Math.sin(f * Math.PI) * 0.65,
            vz: 0.45, radius: 0.45, endRadius: 0.95, dur: 0.4, lut, mode: CloudMode.Mist,
          })
        })
      }
      this.after(at, () => {
        if (dealt > 0) {
          for (let k = 0; k < 4; k++) {
            gl.spawnCloud({
              x: t.x + rnd(-0.22, 0.22), y: t.y + rnd(-0.22, 0.22), z: 0.45 + k * 0.34,
              vz: 0.65 + k * 0.18, radius: 0.48, endRadius: 1.15 + slot * 0.1, dur: 0.62, lut, mode: CloudMode.Mist,
            })
          }
          gl.spawnCloud({
            x: t.x, y: t.y, z: 0.38, radius: 0.35, endRadius: 1.3 + slot * 0.14,
            dur: 0.68, lut, mode: CloudMode.Corona,
          })
          this.glBurst(gl, t.x, t.y, 0.55, 26 + slot * 6, lut, {
            speed: [0.3, 1.8], vz: [1.0, 2.8], life: [0.55, 1.05], size: 2.8, drag: 1.6, gravZ: 1.8, curl: 5.5, bounce: 0, shape: ParticleShape.Mote,
          })
        } else {
          for (const s of [-1, 1]) {
            gl.spawnCloud({
              x: t.x, y: t.y, z: 0.6, vx: s * 1.4, vy: -s * 0.6, vz: 0.4,
              radius: 0.48, endRadius: 0.85, dur: 0.38, lut, mode: CloudMode.Mist,
            })
          }
        }
        this.ripple(t, 2.5)
        this.tag(t, dealt > 0 ? 'ACTIVE' : 'DAMPENED', col[0], suppressReadout)
      })
      return
    }

    this.beam(p, t, 0.4, col[0], 2.5)
    this.after(at, () => {
      if (dealt > 0) {
        this.ring(t, 0.25, 1.2, 0.55, col[0], 2)
        this.burst(t.x, t.y, { n: 14, speed: [0.4, 2.4], life: [0.4, 0.9], colors: col, size: 2, drag: 2, grav: -2.2, type: 'dot' })
      }
      this.ripple(t, 2.5)
      this.tag(t, dealt > 0 ? 'ACTIVE' : 'DAMPENED', col[0], suppressReadout)
    })
  }

  // 7. HIGH (CoT): Wide volumetric thermal fog bank + sinuous SPREAD heat-bridges + convection plumes.
  private temperature = ({ fx, p, t, col, lut, at, board, suppressReadout }: Ctx): void => {
    const gl = this.useGl(false)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))
    const cells = rangeCells(fx)

    if (gl) {
      if (this.firstInAreaStep(fx)) {
        const stride = cells.length > 36 ? 3 : 2
        for (let i = 0; i < cells.length; i += stride) {
          const cell = cells[i]
          const delay = Math.min(140, (Math.abs(cell.x - fx.origin.x) + Math.abs(cell.y - fx.origin.y)) * 18)
          this.after(delay, () => {
            gl.spawnCloud({
              x: cell.x + 0.5, y: cell.y + 0.5, z: 0.45 + rnd(0, 0.45),
              vz: rnd(0.2, 0.65), radius: 0.88, endRadius: 1.48, dur: 0.56, lut, mode: CloudMode.Mist,
            })
          })
        }
      }

      const peers = board?.peers ?? []
      let bridged = false
      for (const peer of peers) {
        if (peer.x === fx.target.x && peer.y === fx.target.y) continue
        const pm = mid(peer)
        gl.spawnRibbon({
          ax: t.x, ay: t.y, az: 0.65,
          cx: (t.x + pm.x) * 0.5, cy: (t.y + pm.y) * 0.5, cz: 1.85,
          bx: pm.x, by: pm.y, bz: 0.65, width: 0.36, dur: 0.48, lut, style: RibbonStyle.SilkMist,
        })
        bridged = true
      }
      if (!bridged) {
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 0.55,
          cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 1.5,
          bx: t.x, by: t.y, bz: 0.55, width: 0.32, dur: 0.4, lut, style: RibbonStyle.SilkMist,
        })
      }

      this.after(at, () => {
        const plumeH = 2.2 + slot * 1.1
        gl.spawnCloud({
          x: t.x, y: t.y, z: 0.15, radius: 0.68, endRadius: 1.05 + slot * 0.14,
          height: plumeH, dur: 0.58, lut, mode: CloudMode.Plume,
        })
        gl.spawnCloud({
          x: t.x, y: t.y, z: 0.25, radius: 0.4, endRadius: 1.85, dur: 0.56, lut, mode: CloudMode.Corona,
        })
        for (let k = 0; k < 3; k++) {
          gl.spawnCloud({
            x: t.x + rnd(-0.25, 0.25), y: t.y + rnd(-0.25, 0.25), z: 0.8 + k * 0.6,
            vz: 1.8 + k * 0.4, radius: 0.62, endRadius: 1.35, dur: 0.62, lut, mode: CloudMode.Mist,
          })
        }
        this.glBurst(gl, t.x, t.y, 0.35, 36 + slot * 12, lut, {
          speed: [0.8, 3.6], vz: [3.8, 8.8], life: [0.55, 1.15], size: 2.9, drag: 1.8, gravZ: 3.2, curl: 14, bounce: 0, shape: ParticleShape.Mote,
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
      for (let k = 0; k < 32; k++) {
        this.add({
          x: t.x + rnd(-0.2, 0.2), y: t.y + rnd(-0.2, 0.2),
          vx: rnd(-1.5, 1.5), vy: rnd(-5.5, -1.5), life: rnd(0.45, 0.95), size: 2.2, color: col[k % 2], drag: 2, jit: 18, type: 'dot',
        })
      }
      this.ripple(t, 5)
      this.tag(t, 'T = 2.0', col[0], suppressReadout)
    })
  }

  // 8. ULTRA (CoT): Storm-cloud singularity + 0-3 tag-siphon mist streams -> aurora-plasma river + rolling cloud wakes.
  private ultra = ({ fx, p, t, col, lut, dir, at, suppressReadout }: Ctx): void => {
    const gl = this.useGl(false)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))
    const end = { x: p.x + Math.cos(dir) * SIZE * 1.5, y: p.y + Math.sin(dir) * SIZE * 1.5 }
    const railMatch = fx.events?.find(e => e.startsWith('RAIL +'))
    const tagCount = Math.max(0, Math.min(3, fx.readTags?.length ?? (railMatch ? Number(railMatch.slice(6)) || 0 : 0)))
    const nx = -Math.sin(dir)
    const ny = Math.cos(dir)

    if (gl) {
      gl.spawnDome({ x: p.x, y: p.y, z: 1.6, r0: 0.2, r1: 0.88, dur: 0.36, lut, voidOrb: true })
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI * 2
        gl.spawnCloud({
          x: p.x + Math.cos(ang) * 0.55, y: p.y + Math.sin(ang) * 0.55, z: 1.55,
          vx: -Math.cos(ang) * 0.65, vy: -Math.sin(ang) * 0.65,
          radius: 0.85, endRadius: 0.45, dur: 0.36, lut, mode: CloudMode.Mist, dark: true,
        })
      }
      for (let k = 0; k < 2; k++) {
        gl.spawnCloud({
          x: p.x, y: p.y, z: 1.6, radius: 1.15, endRadius: 0.65, dur: 0.36, lut, mode: CloudMode.Mist,
        })
      }
      for (let s = 0; s < tagCount; s++) {
        const fan = (s - (tagCount - 1) / 2) * 1.15
        gl.spawnRibbon({
          ax: t.x, ay: t.y, az: 0.55,
          cx: (t.x + p.x) * 0.5 + nx * fan, cy: (t.y + p.y) * 0.5 + ny * fan, cz: 2.35 + s * 0.28,
          bx: p.x, by: p.y, bz: 1.6,
          width: 0.32, dur: Math.max(0.24, at / 1000), lut: s === 0 ? lut : LutRow.Probe, style: RibbonStyle.SilkMist,
        })
      }
      for (let k = 0; k < 4; k++) {
        this.after(k * 70, () => this.glImplode(gl, p, 1.6, 16, lut, 2.6, 0.22, ParticleShape.Mote))
      }

      this.after(at, () => {
        this.hitStop = Math.max(this.hitStop, 0.038)
        this.triggerFlash(0.18)
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 1.05,
          cx: (p.x + end.x) * 0.5, cy: (p.y + end.y) * 0.5, cz: 1.18,
          bx: end.x, by: end.y, bz: 0.65,
          width: 1.15 + slot * 0.1, dur: 0.52, lut, style: RibbonStyle.SilkMist,
        })
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 1.05,
          cx: (p.x + end.x) * 0.5, cy: (p.y + end.y) * 0.5, cz: 1.18,
          bx: end.x, by: end.y, bz: 0.65,
          width: 0.4, dur: 0.55, lut: LutRow.Probe, style: RibbonStyle.SilkMist,
        })
        for (let f = 0.08; f < 0.85; f += 0.14) {
          const pt = lerp(p, end, f)
          if (pt.x < 0 || pt.y < 0 || pt.x > SIZE || pt.y > SIZE) break
          for (const side of [-1, 1]) {
            gl.spawnCloud({
              x: pt.x + nx * side * 0.68, y: pt.y + ny * side * 0.68, z: 0.72,
              vx: nx * side * 1.15, vy: ny * side * 1.15, vz: 0.75,
              radius: 0.58, endRadius: 1.25, dur: 0.56, lut, mode: CloudMode.Mist,
            })
          }
          this.glBurst(gl, pt.x, pt.y, 0.7, 4, lut, {
            dir: dir + (Math.random() < 0.5 ? 1 : -1) * (Math.PI * 0.5), spread: 0.7,
            speed: [0.8, 2.8], vz: [0.9, 3.2], life: [0.55, 1.15], size: 2.6, drag: 1.5, curl: 6.5, bounce: 0, shape: ParticleShape.Mote,
          })
        }
        gl.spawnCloud({
          x: t.x, y: t.y, z: 0.45, radius: 0.35, endRadius: 2.65, dur: 0.64, lut: LutRow.Probe, mode: CloudMode.Corona,
        })
        gl.spawnCloud({
          x: t.x, y: t.y, z: 0.48, radius: 0.28, endRadius: 2.35, dur: 0.62, lut, mode: CloudMode.Corona,
        })
        gl.spawnCloud({
          x: t.x, y: t.y, z: 0.85, vz: 0.9, radius: 0.85, endRadius: 1.95, dur: 0.6, lut, mode: CloudMode.Mist,
        })
        this.glBurst(gl, t.x, t.y, 0.65, 52, lut, {
          speed: [1.5, 6.8], vz: [1.8, 6.4], life: [0.5, 1.1], size: 2.9, drag: 1.6, curl: 9.0, bounce: 0, shape: ParticleShape.Mote,
        })
        this.ripple(t, 7.5)
        this.ripple(p, 3)
        this.shake(7.2)
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
      this.burst(t.x, t.y, { n: 36, speed: [2, 10], life: [0.3, 0.8], colors: col, size: 2.2, type: 'dot' })
      this.ring(t, 0.25, 2.2, 0.5, col[0], 4)
      this.ripple(t, 7.5)
      this.ripple(p, 3)
      this.shake(7)
      this.tag(t, 'ULTRA', col[0], suppressReadout)
    })
  }

  // 9. SPIKE (Specialist): Oscilloscope voltage sawtooth zigzag + erupting 3D pyramidal spikes + PINNED harpoon.
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
        width: 0.22 + slot * 0.03, dur: 0.28, lut, style: RibbonStyle.SawtoothZigzag,
      })
      this.after(at, () => {
        if (slot === 0) {
          gl.spawnSolid({
            kind: SolidKind.Spike, x0: t.x, y0: t.y, z0: 0.02,
            sx: 0.32, sy: 0.32, sz: 1.45, dur: 0.44, lut,
          })
        } else if (slot === 1) {
          for (let k = 0; k < 3; k++) {
            const ang = (k / 3) * Math.PI * 2
            gl.spawnSolid({
              kind: SolidKind.Spike,
              x0: t.x + Math.cos(ang) * 0.2, y0: t.y + Math.sin(ang) * 0.2, z0: 0.02,
              sx: 0.42, sy: 0.42, sz: 1.9 + (k === 0 ? 0.5 : 0), pitch0: 0.22, yaw: ang, dur: 0.46, lut,
            })
          }
        } else if (slot === 2) {
          gl.spawnSolid({
            kind: SolidKind.Spike, x0: t.x, y0: t.y, z0: 0.02,
            sx: 0.62, sy: 0.62, sz: 3.3, dur: 0.5, lut,
          })
          for (let k = 0; k < 4; k++) {
            const ang = (k / 4) * Math.PI * 2 + 0.3
            gl.spawnSolid({
              kind: SolidKind.Spike,
              x0: t.x + Math.cos(ang) * 0.24, y0: t.y + Math.sin(ang) * 0.24, z0: 0.02,
              sx: 0.45, sy: 0.45, sz: 2.35, pitch0: 0.34, yaw: ang, dur: 0.48, lut,
            })
          }
        } else {
          gl.spawnSolid({
            kind: SolidKind.Spike, x0: t.x, y0: t.y, z0: 0.02,
            sx: 0.78, sy: 0.78, sz: 4.8, dur: 0.54, lut,
          })
          for (let k = 0; k < 7; k++) {
            const ang = (k / 7) * Math.PI * 2
            gl.spawnSolid({
              kind: SolidKind.Spike,
              x0: t.x + Math.cos(ang) * 0.26, y0: t.y + Math.sin(ang) * 0.26, z0: 0.02,
              sx: 0.5, sy: 0.5, sz: 2.4 + (k % 2) * 0.65, pitch0: 0.44, yaw: ang, dur: 0.5, lut,
            })
          }
        }
        if (pinned) {
          this.hitStop = Math.max(this.hitStop, 0.032)
          gl.spawnSolid({
            kind: SolidKind.Spike,
            x0: t.x - Math.cos(dir) * 0.25, y0: t.y - Math.sin(dir) * 0.25, z0: 0.2,
            sx: 0.54, sy: 0.54, sz: 2.35, pitch0: 0.96, yaw: dir, dur: 0.54, lut: LutRow.Probe,
          })
          gl.spawnDecal({ x: t.x + Math.cos(dir) * 0.7, y: t.y + Math.sin(dir) * 0.7, radius: 1.5, rot: dir, dur: 0.52, lut, kind: DecalKind.Fracture })
        }
        gl.spawnDecal({ x: t.x, y: t.y, radius: 1.45, rot: dir, dur: 0.46, lut, kind: DecalKind.Fracture })
        this.glBurst(gl, t.x, t.y, 0.35, 24, lut, {
          speed: [2.2, 7.6], vz: [4.8, 12.8], life: [0.3, 0.68], size: 2.8, gravZ: -18, bounce: 0.48, shape: ParticleShape.Shard,
        })
        this.ripple(t, 5.5)
        this.shake(4.8)
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
      this.burst(t.x, t.y, { n: 20, dir: -Math.PI / 2, spread: 0.7, speed: [4, 14], life: [0.22, 0.52], colors: col, grav: 12 })
      this.ripple(t, 5.5)
      this.shake(4.5)
      this.tag(t, 'SPIKE', col[0], suppressReadout)
    })
  }

  // 10. FLOOD (Specialist): BFS rising glossy liquid tide + Voronoi caustics + 3D droplet splashes + FILL drain whirlpool.
  private floodFill = ({ fx, t, col, lut, at, board, suppressReadout }: Ctx): void => {
    const gl = this.useGl(false)
    const reached = bfsRangeCells(fx, board?.walls)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))

    if (gl) {
      if (this.firstInAreaStep(fx)) {
        for (const { cell, dist } of reached) {
          this.after(dist * 42, () => {
            gl.spawnCloud({
              x: cell.x + 0.5, y: cell.y + 0.5, z: 0.02,
              radius: 0.49, endRadius: 0.49, dur: 0.62, lut, mode: CloudMode.LiquidCell, whirlpool: false,
            })
          })
        }
        this.ripple(mid(fx.origin), 4.5, 6.5)
      }
      this.after(at, () => {
        gl.spawnDecal({ x: t.x, y: t.y, radius: 0.68, dur: 0.52, lut, kind: DecalKind.Flood })
        this.glBurst(gl, t.x, t.y, 0.2, 22 + slot * 6, lut, {
          speed: [1.4, 5.2], vz: [3.8, 7.8], life: [0.35, 0.72], size: 2.8, drag: 1.5, gravZ: -16, bounce: 0.25, shape: ParticleShape.Droplet,
        })
        if (fx.blank) {
          const bm = mid(fx.blank)
          gl.spawnRibbon({
            ax: t.x, ay: t.y, az: 0.16,
            cx: (t.x + bm.x) * 0.5, cy: (t.y + bm.y) * 0.5, cz: 0.45,
            bx: bm.x, by: bm.y, bz: 0.08,
            width: 0.26, dur: 0.46, lut, style: RibbonStyle.SilkMist,
          })
          gl.spawnCloud({
            x: bm.x, y: bm.y, z: 0.03, radius: 0.56, endRadius: 0.38,
            dur: 0.68, lut, mode: CloudMode.LiquidCell, whirlpool: true,
          })
        }
        this.ripple(t, 3.2)
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
      this.burst(t.x, t.y, { n: 16, speed: [1.5, 5], life: [0.25, 0.55], colors: col, type: 'dot' })
      if (fx.blank) this.ring(mid(fx.blank), 0.42, 0.08, 0.5, col[0], 2)
      this.ripple(t, 3.2)
      this.tag(t, 'FILLED', col[0], suppressReadout)
    })
  }

  // 11. PROBE (Specialist): Zero-shake coherent laser needle passing through an intact translucent 3D hex-shell + X-ray scan plane + 5 octahedron nodes.
  private probe = ({ fx, p, t, col, lut, dir, at, suppressReadout }: Ctx): void => {
    const gl = this.useGl(false)
    const slot = Math.max(0, Math.min(3, fx.stepIndex))
    const nodes = [[-0.28, -0.24, 0.64], [0.26, -0.28, 0.72], [0, 0.02, 0.52], [-0.24, 0.28, 0.68], [0.28, 0.25, 0.56]]
      .map(([dx, dy, z]) => ({ x: t.x + dx, y: t.y + dy, z }))

    if (gl) {
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.62,
        cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.62,
        bx: t.x, by: t.y, bz: 0.62,
        width: 0.11, dur: 0.72, lut: LutRow.Probe, style: RibbonStyle.VectorRay, spin: -1,
      })
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.62,
        cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.62,
        bx: t.x, by: t.y, bz: 0.62,
        width: 0.07, dur: 0.68, lut, style: RibbonStyle.VectorRay, spin: -1,
      })
      // Intact translucent 3D hexagonal Security containment prism shell
      gl.spawnSolid({
        kind: SolidKind.HexPlate,
        x0: t.x, y0: t.y, z0: 0.62,
        sx: 1.32, sy: 1.32, sz: 4.5,
        wireOnly: 0.72, dur: 0.9, lut: LutRow.Probe,
      })
      gl.spawnWave({
        x: t.x - Math.cos(dir) * 0.55, y: t.y - Math.sin(dir) * 0.55, z: 0.62,
        r0: 0.04, r1: 0.28, pitchX: 0.85, rollY: dir, thickness: 0.05, dur: 0.26, lut: LutRow.Probe, mode: WaveMode.Slice,
      })
      this.after(140, () => {
        gl.spawnSolid({
          kind: SolidKind.ScanPlane,
          x0: t.x, y0: t.y, z0: 1.35,
          x1: t.x, y1: t.y, z1: 0.05,
          sx: 1.38 + (slot >= 2 ? 0.18 : 0), sy: 1.38 + (slot >= 2 ? 0.18 : 0), sz: 1,
          dur: 0.42, lut,
        })
      })
      nodes.forEach((node, i) => {
        this.after(180 + i * 55, () => {
          gl.spawnSolid({
            kind: SolidKind.Octahedron,
            x0: node.x, y0: node.y, z0: node.z,
            sx: 0.18, sy: 0.18, sz: 0.18, spin: 3.5, dur: 0.44, lut,
          })
          if (i > 0) {
            const prev = nodes[i - 1]
            gl.spawnRibbon({
              ax: prev.x, ay: prev.y, az: prev.z,
              cx: (prev.x + node.x) * 0.5, cy: (prev.y + node.y) * 0.5, cz: (prev.z + node.z) * 0.5,
              bx: node.x, by: node.y, bz: node.z,
              width: 0.07, dur: 0.4, lut: LutRow.Probe, style: RibbonStyle.VectorRay, spin: -1,
            })
          }
        })
      })
      this.after(at, () => {
        nodes.forEach(node => {
          this.glBurst(gl, node.x, node.y, node.z, 3, lut, {
            speed: [0.1, 0.4], vz: [0.1, 0.5], life: [0.22, 0.4], size: 2.2, gravZ: 0, bounce: 0, shape: ParticleShape.Mote,
          })
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
    }

    compactTimed(this.tags, dt)
    compactTimed(this.nums, dt)

    for (const point of this.grid) {
      point.vx += (-point.ox * 190 - point.vx * 9) * dt
      point.vy += (-point.oy * 190 - point.vy * 9) * dt
      point.ox += point.vx * dt
      point.oy += point.vy * dt
    }
    this.shakeAmp *= Math.pow(0.0008, dt)
    this.screenFlash = Math.max(0, this.screenFlash - dt * 1.6)
  }

  cellOffset(x: number, y: number): Coord {
    const point = this.grid[y * SIZE + x]
    return point ? { x: point.ox, y: point.oy } : { x: 0, y: 0 }
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
