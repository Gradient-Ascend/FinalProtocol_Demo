import { MONO, allowFlash } from '../cinematic/display'
import { inAttackRange } from './attack-methods'
import type { AttackEffect, Coord } from './battle-types'
import type { GodId } from './encounters'
import { vfxQualityStore } from './vfx-quality'
import {
  DecalKind,
  LutRow,
  ParticleShape,
  RibbonStyle,
  VfxWebglEngine,
  WaveMode,
  type VfxStats,
} from './vfx-webgl'

// Attack effects are the one loud part of an otherwise minimal board: a
// synchronized WebGL2 2.5D VFX overlay above the orthographic 2D board renders
// GPU-instanced 3D particles, Curl-Noise turbulence, Bezier slash/beam ribbons,
// tilted shockwave crowns, grid-border light spill, and multi-mip HDR bloom.
// Users can tune HIGH / MEDIUM / LOW / AUTO in Settings; LOW and reduced-motion
// degrade cleanly to Canvas 2D without `ctx.filter`.

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
type Ctx = { fx: AttackEffect; p: Coord; t: Coord; col: string[]; lut: LutRow; bossGod?: GodId; dir: number; at: number }

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
  // so this only queues an Overload: its opening cascade, then one beam per
  // Geek in quick succession.
  play(effect: AttackEffect, reduced: boolean, bossGod?: GodId): void {
    const timing = effectTiming(effect)
    let start = Math.max(this.now, this.nextStart)
    if (effect.overload && !reduced && start - this.lastOverload > 1500) {
      this.timers.push({ at: start, fn: () => this.cascade(mid(effect.origin), reduced) })
      start += 340
    }
    if (effect.overload) this.lastOverload = start
    this.nextStart = start + (reduced ? 60 : effect.overload ? 110 : timing.strike + timing.settle - 20)
    this.timers.push({ at: start, fn: () => this.start(effect, reduced, timing.strike, bossGod) })
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
        shape: i % 3 === 0 ? ParticleShape.Mote : ParticleShape.Spark,
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
  private tag(at: Coord, text: string, color: string): void {
    this.tags = this.tags.filter(tag => tag.x !== at.x || tag.y !== at.y)
    this.tags.push({ x: at.x, y: at.y, text, color, t: 0, dur: 1.15 })
    if (color === AMBER[0]) rememberAmber(at, text)
  }

  // The interactions a hit triggered (PUSH, PINNED, BREACH, LIVE…), in white
  // on a second line under the term so they never read as one more number.
  private note(at: Coord, fx: AttackEffect, reduced = false): void {
    if (!fx.events?.length) return
    const y = at.y + 0.36
    this.tags = this.tags.filter(tag => tag.x !== at.x || tag.y !== y)
    this.tags.push({ x: at.x, y, text: fx.events.join(' · '), color: '#f4f4f4', t: 0, dur: 1.5 })
    const gl = this.useGl(reduced)
    if (gl) {
      gl.spawnWave({
        x: at.x, y: at.y, z: 0.35, r0: 0.3, r1: 1.55, pitchX: 0.42, rollY: -0.22,
        thickness: 0.14, dur: 0.5, lut: LutRow.Probe, mode: WaveMode.Shock,
      })
    } else {
      this.ring(at, 0.3, 1.25, 0.5, '#f4f4f4', 1.5)
    }
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

  // Four layers: wide grid-rim floor light spill, triple multi-angle tilted 3D
  // shockwave crowns, long velocity-stretched sparks bouncing on z = 0, and
  // swirling Curl-Noise embers.
  private impact(at: Coord, from: Coord, col: string[], lut: LutRow, power: number, reduced = false): void {
    const dir = Math.atan2(at.y - from.y, at.x - from.x)
    const gl = this.useGl(reduced)
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
      gl.spawnWave({
        x: at.x, y: at.y, z: 0.55, r0: 0.24, r1: 0.85 + power * 0.75,
        pitchX: 0.25, rollY: 0.62, thickness: 0.08, dur: 0.34, lut: LutRow.Probe, mode: WaveMode.Slice,
      })
      this.glBurst(gl, at.x, at.y, 0.3, 32 + Math.round(power * 48), lut, {
        dir, spread: 2.1, speed: [3.2, 10 + power * 6.5], vz: [2.4, 6.8 + power * 3.5],
        life: [0.32, 0.72], size: 2.6, gravZ: -10.5, curl: 3.6, bounce: 0.48, shape: ParticleShape.Spark,
      })
      this.glBurst(gl, at.x, at.y, 0.42, 18 + Math.round(power * 22), lut, {
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

  // The frame's own mark on a single-target strike: CoT weaves elevated 3D
  // spline arches with holographic Gimbal rings, VECTOR drops a bold twin-blade 3D chevron.
  private motif(c: Ctx, travel: number, gl: VfxWebglEngine | null): void {
    const { fx, p, t, col, lut, dir } = c
    if (fx.source !== 'player') return
    if (fx.shape === 'cross') {
      const steps = 6
      for (let i = 1; i < steps; i++) {
        this.after((travel * i) / steps, () => {
          const a = lerp(p, t, (i - 1) / steps)
          const b = lerp(p, t, i / steps)
          if (gl) {
            const m = lerp(a, b, 0.5)
            const zA = i === 1 ? 0.25 : 0.95
            const zB = i === steps - 1 ? 0.6 : 0.95
            gl.spawnRibbon({
              ax: a.x, ay: a.y, az: zA,
              cx: m.x, cy: m.y, cz: 1.65,
              bx: b.x, by: b.y, bz: zB,
              width: 0.22, dur: 0.4, lut, style: RibbonStyle.Beam,
            })
            gl.spawnWave({
              x: b.x, y: b.y, z: zB, r0: 0.08, r1: 0.46,
              pitchX: 0.35, rollY: i * 0.45, thickness: 0.08, dur: 0.38, lut, mode: WaveMode.Gimbal,
            })
            gl.spawnDecal({ x: Math.floor(b.x) + 0.5, y: Math.floor(b.y) + 0.5, radius: 0.55, dur: 0.36, lut, kind: DecalKind.Tile })
          } else {
            this.poly([a, b], 0.34, col[0], 1)
            this.ring(b, 0.05, 0.16, 0.34, col[0], 1.5)
          }
        })
      }
    } else {
      this.after(travel, () => {
        const size = 0.72
        const open = 0.54
        const arm1 = { x: t.x - Math.cos(dir - open) * size, y: t.y - Math.sin(dir - open) * size }
        const arm2 = { x: t.x - Math.cos(dir + open) * size, y: t.y - Math.sin(dir + open) * size }
        if (gl) {
          gl.spawnRibbon({ ax: arm1.x, ay: arm1.y, az: 1.6, cx: (arm1.x + t.x) * 0.5, cy: (arm1.y + t.y) * 0.5, cz: 0.95, bx: t.x, by: t.y, bz: 0.15, width: 0.34, dur: 0.42, lut, style: RibbonStyle.Beam })
          gl.spawnRibbon({ ax: arm2.x, ay: arm2.y, az: 1.6, cx: (arm2.x + t.x) * 0.5, cy: (arm2.y + t.y) * 0.5, cz: 0.95, bx: t.x, by: t.y, bz: 0.15, width: 0.34, dur: 0.42, lut, style: RibbonStyle.Beam })
          gl.spawnRibbon({ ax: arm1.x, ay: arm1.y, az: 1.1, cx: (arm1.x + arm2.x) * 0.5, cy: (arm1.y + arm2.y) * 0.5, cz: 1.35, bx: arm2.x, by: arm2.y, bz: 1.1, width: 0.16, dur: 0.38, lut, style: RibbonStyle.Beam })
          gl.spawnDecal({ x: t.x, y: t.y, radius: 0.75, dur: 0.4, lut, kind: DecalKind.Tile })
        } else {
          this.poly([arm1, t, arm2], 0.36, col[0], 2.5)
        }
      })
    }
  }

  private start(fx: AttackEffect, reduced: boolean, at: number, bossGod?: GodId): void {
    const p = mid(fx.origin)
    const t = mid(fx.target)
    const col = fx.source === 'enemy' ? RED : fx.overload ? VIOLET : fx.shape === 'cross' ? CYAN : AMBER
    const lut = lutForEffect(fx, bossGod)
    const c: Ctx = { fx, p, t, col, lut, bossGod, dir: Math.atan2(t.y - p.y, t.x - p.x), at }
    // The Reduced Motion setting swaps the whole effect for a line and a ring.
    if (reduced) {
      this.gl?.clear()
      this.poly([p, t], 0.12, col[0], 1.5)
      this.ring(t, 0.2, 0.7, 0.12, col[0], 2)
      this.number(t, fx, col)
      this.note(t, fx, true)
      return
    }
    this.after(at, () => { this.number(t, fx, col); this.note(t, fx, false) })
    if (fx.source === 'enemy') { this.swarm(c); return }
    if (fx.overload) { this.overloadBeam(c); return }
    const signature: Record<string, (c: Ctx) => void> = {
      base: this.forwardPass, on: this.neuronOn, off: this.dropout, spike: this.spike,
      manhattan: this.manhattan, array: this.arrayScan, flood: this.floodFill, high: this.temperature,
      zero: this.zeroShot, ultra: this.ultra, probe: this.probe,
    }
    ;(signature[fx.fx ?? ''] ?? this.forwardPass)(c)
  }

  // OVERLOAD: plunging z = 8.4 -> 0 orbital sky-spears + inner white core + forked 3D lightning arcs.
  private overloadBeam = ({ p, t, col, lut }: Ctx): void => {
    const gl = this.useGl(false)
    if (gl) {
      const mx = (p.x + t.x) * 0.5
      const my = (p.y + t.y) * 0.5
      gl.spawnRibbon({
        ax: mx, ay: my, az: 8.4, cx: (mx + t.x) * 0.5, cy: (my + t.y) * 0.5, cz: 4.0,
        bx: t.x, by: t.y, bz: 0.18, width: 0.68, dur: 0.36, lut: LutRow.Violet, style: RibbonStyle.Beam,
      })
      gl.spawnRibbon({
        ax: mx, ay: my, az: 8.4, cx: (mx + t.x) * 0.5, cy: (my + t.y) * 0.5, cz: 4.0,
        bx: t.x, by: t.y, bz: 0.18, width: 0.22, dur: 0.42, lut: LutRow.Probe, style: RibbonStyle.Beam,
      })
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.5, cx: mx, cy: my, cz: 2.8,
        bx: t.x, by: t.y, bz: 0.25, width: 0.38, dur: 0.38, lut: LutRow.Violet, style: RibbonStyle.Arc,
      })
      this.hitStop = Math.max(this.hitStop, 0.032)
    } else {
      this.beam(p, t, 0.26, pick(col), 5)
    }
    this.impact(t, p, col, lut, 1.05)
    this.shake(4.5)
    this.tag(t, 'OVERLOAD', col[0])
  }

  // Twin counter-rotating 3D violet cathedral helices soaring z = 0 -> 8.6 into detonation.
  private cascade(p: Coord, reduced: boolean): void {
    const gl = this.useGl(reduced)
    if (gl) {
      for (let k = 0; k < 5; k++) {
        this.after(k * 55, () => {
          this.glImplode(gl, p, 1.8, 28, LutRow.Violet, 3.2, 0.25)
          for (let h = 0; h < 2; h++) {
            const ang = k * 0.95 + h * Math.PI
            const r = 1.5 - k * 0.22
            gl.spawnRibbon({
              ax: p.x + Math.cos(ang) * r, ay: p.y + Math.sin(ang) * r, az: 0.2,
              cx: p.x + Math.cos(ang + 1.5) * (r * 0.72), cy: p.y + Math.sin(ang + 1.5) * (r * 0.72), cz: 4.4 + k * 0.85,
              bx: p.x + Math.cos(ang + 3.0) * 0.35, by: p.y + Math.sin(ang + 3.0) * 0.35, bz: 7.4 + k * 0.3,
              width: 0.34, dur: 0.32, lut: LutRow.Violet, style: RibbonStyle.Beam,
            })
          }
        })
      }
      this.after(340, () => {
        this.triggerFlash(0.18)
        this.hitStop = 0.038
        gl.spawnDecal({ x: p.x, y: p.y, radius: 8.0, dur: 0.82, lut: LutRow.Violet, kind: DecalKind.Spill })
        gl.spawnDecal({ x: p.x, y: p.y, radius: 3.4, dur: 0.7, lut: LutRow.Violet, kind: DecalKind.Fracture })
        gl.spawnWave({ x: p.x, y: p.y, z: 0.55, r0: 0.3, r1: 12.0, pitchX: 0.52, rollY: -0.22, thickness: 0.36, dur: 0.85, lut: LutRow.Violet, mode: WaveMode.Shock })
        gl.spawnWave({ x: p.x, y: p.y, z: 0.8, r0: 0.3, r1: 11.0, pitchX: -0.38, rollY: 0.32, thickness: 0.2, dur: 0.95, lut: LutRow.Cyan, mode: WaveMode.Gimbal })
        this.glBurst(gl, p.x, p.y, 0.8, 120, LutRow.Violet, {
          speed: [4.0, 15.5], vz: [3.0, 9.0], life: [0.45, 1.05], size: 2.8, curl: 5.5, bounce: 0.48,
        })
        this.ripple(p, 12, 11)
        this.shake(8)
      })
      return
    }

    for (let k = 0; k < 5; k++) this.after(k * 55, () => this.implode(p, 16, VIOLET, 2.6, 0.22))
    this.after(340, () => {
      this.triggerFlash(0.18)
      this.ring(p, 0.2, 11, 0.8, VIOLET[0], 6)
      this.ring(p, 0.2, 11, 0.95, VIOLET[1], 2)
      this.ripple(p, 12, 11)
      this.shake(8)
      this.burst(p.x, p.y, { n: 50, speed: [3, 13], life: [0.4, 0.9], colors: VIOLET })
    })
  }

  // DESIRE: arcing 3D crimson/god-tinted motes curving through Z before homing onto the Operator.
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
        this.impact(t, p, col, lut, bossGod ? 0.95 : 0.65)
        this.shake(bossGod ? 5 : 3.2)
      })
      return
    }

    for (let i = 0; i < 30; i++) this.after(i * 8, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = rnd(3, 7)
      this.add({ x: p.x, y: p.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.1, color: pick(col), drag: 1.8, home: t })
    })
    this.after(at, () => { this.impact(t, p, col, lut, 0.6); this.shake(3) })
  }

  // BASE: 7 high-arcing helical prism trails + twin crossed 35deg tilted sweeping kinetic blade slashes.
  private forwardPass = (c: Ctx): void => {
    const { p, t, col, lut, dir, at } = c
    const gl = this.useGl(false)
    this.motif(c, at - 30, gl)
    if (gl) {
      const nx = -Math.sin(dir)
      const ny = Math.cos(dir)
      for (let i = 0; i < 7; i++) {
        this.after(i * 32, () => {
          const spread = (i - 3) * 0.34
          const mx = (p.x + t.x) * 0.5 + nx * spread
          const my = (p.y + t.y) * 0.5 + ny * spread
          gl.spawnRibbon({
            ax: p.x, ay: p.y, az: 0.28, cx: mx, cy: my, cz: 2.4 + Math.abs(spread) * 0.9,
            bx: t.x, by: t.y, bz: 0.3, width: 0.28, dur: 0.26, lut, style: RibbonStyle.Trail,
          })
          gl.spawnParticle({
            x: t.x + rnd(-0.22, 0.22), y: t.y + rnd(-0.22, 0.22), z: 0.4,
            vx: Math.cos(dir + rnd(-0.75, 0.75)) * rnd(2.6, 6.2), vy: Math.sin(dir + rnd(-0.75, 0.75)) * rnd(2.6, 6.2), vz: rnd(2.0, 4.6),
            life: rnd(0.24, 0.48), size: 3.1, drag: 2.8, gravZ: -8.5, curl: 2.0, bounce: 0.4, lut, shape: ParticleShape.Shard,
          })
        })
      }
      this.after(at, () => {
        // Two crossed tilted crescent slashes across target
        gl.spawnRibbon({
          ax: t.x - nx * 1.15, ay: t.y - ny * 1.15, az: 1.4,
          cx: t.x + Math.cos(dir) * 0.9, cy: t.y + Math.sin(dir) * 0.9, cz: 1.8,
          bx: t.x + nx * 1.15, by: t.y + ny * 1.15, bz: 0.2,
          width: 0.95, dur: 0.3, lut, style: RibbonStyle.Slash,
        })
        gl.spawnRibbon({
          ax: t.x + nx * 0.95, ay: t.y + ny * 0.95, az: 1.25,
          cx: t.x + Math.cos(dir) * 0.75, cy: t.y + Math.sin(dir) * 0.75, cz: 1.55,
          bx: t.x - nx * 0.95, by: t.y - ny * 0.95, bz: 0.2,
          width: 0.65, dur: 0.28, lut: LutRow.Probe, style: RibbonStyle.Slash,
        })
        this.impact(t, p, col, lut, 0.55)
        this.tag(t, 'FORWARD PASS', col[0])
      })
      return
    }

    for (let i = 0; i < 7; i++) this.after(i * 34, () => {
      const size = rnd(4, 9)
      this.shot(p, t, 0.15, (x, y) => this.add({ x, y, life: 0.03, size, color: col[i % 2], type: 'square' }),
        () => this.burst(t.x, t.y, { n: 4, dir, spread: 1.6, speed: [2, 6], life: [0.15, 0.35], colors: col, size: 1.6 }))
    })
    this.after(at, () => { this.impact(t, p, col, lut, 0.4); this.tag(t, 'FORWARD PASS', col[0]) })
  }

  // ON: ascending 3D astrolabe relay rings -> dual counter-rotating gimbal halos + blazing twin beam + Fresnel lock dome.
  private neuronOn = (c: Ctx): void => {
    const { fx, p, t, col, lut, dir, at } = c
    const gl = this.useGl(false)
    const nodes = 7
    for (let i = 1; i <= nodes; i++) {
      this.after((i * (at - 30)) / nodes, () => {
        const pt = lerp(p, t, i / nodes)
        if (gl) {
          gl.spawnDecal({ x: pt.x, y: pt.y, radius: 0.62, dur: 0.32, lut, kind: DecalKind.Spill })
          gl.spawnWave({
            x: pt.x, y: pt.y, z: 0.35 + i * 0.25, r0: 0.08, r1: 0.46,
            pitchX: 0.45, rollY: i * 0.35, thickness: 0.09, dur: 0.34, lut, mode: WaveMode.Gimbal,
          })
        } else {
          this.flash(pt, 0.14, 0.12)
          this.ring(pt, 0.05, 0.3, 0.3, col[0], 1.5)
        }
      })
    }
    this.after(at, () => {
      if (gl) {
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 0.45, cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 1.45,
          bx: t.x, by: t.y, bz: 0.55, width: 0.48, dur: 0.42, lut, style: RibbonStyle.Beam,
        })
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 0.45, cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 1.45,
          bx: t.x, by: t.y, bz: 0.55, width: 0.18, dur: 0.46, lut: LutRow.Probe, style: RibbonStyle.Beam,
        })
        gl.spawnDome({ x: t.x, y: t.y, z: 0.5, r0: 0.22, r1: 0.82, dur: 0.44, lut })
        gl.spawnWave({
          x: t.x, y: t.y, z: 0.85, r0: 1.5, r1: 0.42, pitchX: 0.58, rollY: -0.28,
          thickness: 0.14, dur: 0.46, lut, mode: WaveMode.Gimbal,
        })
        gl.spawnWave({
          x: t.x, y: t.y, z: 0.45, r0: 0.2, r1: 1.45, pitchX: -0.38, rollY: 0.38,
          thickness: 0.13, dur: 0.46, lut, mode: WaveMode.Shock,
        })
        this.glBurst(gl, t.x, t.y, 0.55, 48, lut, {
          dir: dir + Math.PI, spread: 2.3, speed: [2.4, 8.8], vz: [2.0, 5.8], life: [0.24, 0.55], bounce: 0.4,
        })
        gl.spawnDecal({ x: t.x, y: t.y, radius: 2.1, dur: 0.52, lut, kind: DecalKind.Spill })
      } else {
        this.beam(p, t, 0.36, col[1], 3.5)
        for (let k = 0; k < 8; k++) this.after(k * 30, () => this.burst(t.x, t.y, {
          n: 4, dir: dir + Math.PI, spread: 2.2, speed: [2, 7], life: [0.2, 0.45], colors: col, size: 1.8,
        }))
        this.flash(t, 0.45)
        this.ring(t, 0.2, 1.2, 0.4, col[0], 2.5)
      }
      this.ripple(t, 4)
      if (fx.shape !== 'cross') this.motif(c, 0, gl)
      this.tag(t, 'ACTIVE', col[0])
    })
  }

  // OFF (dropout): high parabolic 3D streams; dropped units shatter mid-air into bouncing ash cubes.
  private dropout = ({ fx, p, t, col, lut, dir, at }: Ctx): void => {
    const gl = this.useGl(false)
    const units = Math.max(1, Math.min(6, fx.cap ?? 5))
    const kept = Math.min(units, fx.amount ?? units)
    const order = Array.from({ length: units }, (_, i) => i).sort(() => Math.random() - 0.5)
    const dropped = new Set(order.slice(0, units - kept))
    const nx = -Math.sin(dir)
    const ny = Math.cos(dir)
    for (let i = 0; i < units; i++) {
      const side = (i - (units - 1) / 2) * 0.24
      const a = { x: p.x + nx * side, y: p.y + ny * side }
      const b = { x: t.x + nx * side * 0.38, y: t.y + ny * side * 0.38 }
      const cutAt = rnd(0.32, 0.7)
      if (gl) {
        if (dropped.has(i)) {
          const dropPt = lerp(a, b, cutAt)
          gl.spawnRibbon({
            ax: a.x, ay: a.y, az: 0.25,
            cx: (a.x + dropPt.x) * 0.5, cy: (a.y + dropPt.y) * 0.5, cz: 2.1,
            bx: dropPt.x, by: dropPt.y, bz: 1.5, width: 0.24, dur: Math.max(0.12, ((at - 10) / 1000) * cutAt),
            lut: LutRow.Probe, style: RibbonStyle.Trail,
          })
          this.after(at * cutAt, () => {
            gl.spawnWave({
              x: dropPt.x, y: dropPt.y, z: 1.5, r0: 0.08, r1: 0.55,
              pitchX: 0.65, rollY: 0.35, thickness: 0.08, dur: 0.22, lut: LutRow.Probe, mode: WaveMode.Slice,
            })
            this.glBurst(gl, dropPt.x, dropPt.y, 1.5, 11, lut, {
              dir, spread: 1.5, speed: [1.6, 4.6], vz: [0.8, 2.8], life: [0.5, 0.85],
              size: 3.1, drag: 1.6, gravZ: -16, curl: 1.4, bounce: 0.38, shape: ParticleShape.Ash,
            })
          })
        } else {
          gl.spawnRibbon({
            ax: a.x, ay: a.y, az: 0.25,
            cx: (a.x + b.x) * 0.5, cy: (a.y + b.y) * 0.5, cz: 2.8,
            bx: b.x, by: b.y, bz: 0.25, width: 0.28, dur: Math.max(0.15, (at - 10) / 1000),
            lut, style: RibbonStyle.Trail,
          })
          this.after(Math.max(40, at - 20), () => {
            this.glBurst(gl, b.x, b.y, 0.3, 11, lut, {
              dir, spread: 1.7, speed: [2.2, 7.2], vz: [1.6, 4.8], life: [0.25, 0.55], size: 2.8, shape: ParticleShape.Shard,
            })
          })
        }
      } else {
        let gone = false
        this.shot(a, b, (at - 10) / 1000, (x, y, f) => {
          if (dropped.has(i) && f > cutAt) {
            if (gone) return
            gone = true
            this.add({ x, y, vx: Math.cos(dir) * 3, vy: Math.sin(dir) * 3, life: 0.8, size: 6, color: '#6b6963', drag: 1.5, grav: 12, type: 'square' })
            return
          }
          this.add({ x, y, life: 0.03, size: 6, color: col[0], type: 'square' })
        }, () => {
          if (!dropped.has(i)) this.burst(b.x, b.y, { n: 7, dir, spread: 1.8, speed: [2, 7], life: [0.2, 0.5], colors: col, size: 3, type: 'square', drag: 4 })
        })
      }
    }
    this.after(at, () => {
      if (kept) {
        if (gl) {
          gl.spawnWave({
            x: t.x, y: t.y, z: 0.3, r0: 0.2, r1: 1.1 + kept * 0.3,
            pitchX: 0.55, rollY: -0.25, thickness: 0.16, dur: 0.4, lut, mode: WaveMode.Shock,
          })
          gl.spawnDecal({ x: t.x, y: t.y, radius: 1.6 + kept * 0.25, dur: 0.48, lut, kind: DecalKind.Spill })
        } else {
          this.flash(t, 0.3 + kept * 0.07)
          this.ring(t, 0.2, 0.7 + kept * 0.22, 0.35, col[0], 2)
        }
        this.ripple(t, 1.5 + kept)
      }
      this.tag(t, `DROPOUT ${kept}/${units} KEPT`, kept ? col[0] : '#8d8b85')
    })
  }

  // SPIKE: jagged floor trace -> colossal z = 9.2 -> 0 heaven-piercing orbital lance + Mach halo.
  private spike = (c: Ctx): void => {
    const { fx, p, t, col, lut, at } = c
    const gl = this.useGl(false)
    if (gl) {
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.1, cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.22,
        bx: t.x, by: t.y, bz: 0.1, width: 0.18, dur: 0.45, lut, style: RibbonStyle.Arc,
      })
      this.motif(c, at, gl)
      this.after(at, () => {
        gl.spawnRibbon({
          ax: t.x, ay: t.y, az: 9.2, cx: t.x, cy: t.y, cz: 4.5, bx: t.x, by: t.y, bz: 0.04,
          width: 0.78, dur: 0.4, lut, style: RibbonStyle.Beam,
        })
        gl.spawnRibbon({
          ax: t.x, ay: t.y, az: 9.2, cx: t.x, cy: t.y, cz: 4.5, bx: t.x, by: t.y, bz: 0.04,
          width: 0.28, dur: 0.46, lut: LutRow.Probe, style: RibbonStyle.Beam,
        })
        gl.spawnDecal({ x: t.x, y: t.y, radius: 2.1, dur: 0.58, lut, kind: DecalKind.Fracture })
        gl.spawnDecal({ x: t.x, y: t.y, radius: 2.9, dur: 0.62, lut, kind: DecalKind.Spill })
        gl.spawnWave({ x: t.x, y: t.y, z: 3.2, r0: 0.18, r1: 1.45, pitchX: 0.28, rollY: 0.18, thickness: 0.14, dur: 0.36, lut: LutRow.Probe, mode: WaveMode.Slice })
        gl.spawnWave({ x: t.x, y: t.y, z: 0.32, r0: 0.2, r1: 1.95, pitchX: 0.54, rollY: -0.22, thickness: 0.22, dur: 0.44, lut, mode: WaveMode.Shock })
        gl.spawnWave({ x: t.x, y: t.y, z: 1.15, r0: 0.15, r1: 1.3, pitchX: -0.35, rollY: 0.32, thickness: 0.13, dur: 0.38, lut, mode: WaveMode.Slice })
        this.glBurst(gl, t.x, t.y, 0.22, 75, lut, {
          speed: [2.0, 8.2], vz: [6.0, 17.0], life: [0.35, 0.8], size: 2.7, gravZ: -19, curl: 2.8, bounce: 0.5,
        })
        if (fx.events?.includes('PINNED')) this.hitStop = Math.max(this.hitStop, 0.032)
        this.ripple(t, 6)
        this.shake(5.5)
        this.tag(t, 'SPIKE', col[0])
      })
      return
    }

    const trace: Coord[] = []
    for (let i = 0; i <= 24; i++) {
      const pt = lerp(p, t, i / 24)
      trace.push({ x: pt.x, y: pt.y + (i % 24 ? rnd(-0.05, 0.05) : 0) })
    }
    this.poly(trace, 0.55, col[0], 1.2)
    this.motif(c, at, null)
    this.after(at, () => {
      this.poly([{ x: t.x - 0.3, y: t.y }, { x: t.x - 0.07, y: t.y - 1.9 }, { x: t.x + 0.07, y: t.y + 0.55 }, { x: t.x + 0.3, y: t.y }], 0.4, col[1], 3)
      this.flash(t, 0.5)
      this.burst(t.x, t.y, { n: 36, dir: -Math.PI / 2, spread: 0.7, speed: [5, 17], life: [0.25, 0.6], colors: col, grav: 10 })
      this.ring(t, 0.2, 1.3, 0.4, col[0], 3)
      this.ripple(t, 6)
      this.shake(5)
      this.tag(t, 'SPIKE', col[0])
    })
  }

  // MANHATTAN: cathedral colonnade of rising 3D light pillars linked by airborne tip-to-tip arcs.
  private manhattan = ({ fx, p, t, col, lut, at }: Ctx): void => {
    const gl = this.useGl(false)
    const path: Coord[] = []
    const sx = Math.sign(fx.target.x - fx.origin.x)
    const sy = Math.sign(fx.target.y - fx.origin.y)
    for (let x = fx.origin.x + sx; sx && x !== fx.target.x + sx; x += sx) path.push({ x, y: fx.origin.y })
    for (let y = fx.origin.y + sy; sy && y !== fx.target.y + sy; y += sy) path.push({ x: fx.target.x, y })
    const gap = at / Math.max(1, path.length)
    path.forEach((cell, i) => {
      this.after(i * gap, () => {
        const pt = mid(cell)
        if (gl) {
          const topZ = Math.min(4.6, 1.4 + i * 0.38)
          gl.spawnDecal({ x: pt.x, y: pt.y, radius: 0.65, dur: 0.48, lut, kind: DecalKind.Tile })
          gl.spawnRibbon({
            ax: pt.x, ay: pt.y, az: 0.02, cx: pt.x, cy: pt.y, cz: topZ * 0.5, bx: pt.x, by: pt.y, bz: topZ,
            width: 0.32, dur: 0.48, lut, style: RibbonStyle.Beam,
          })
          if (i > 0) {
            const prev = mid(path[i - 1])
            const prevZ = Math.min(4.6, 1.4 + (i - 1) * 0.38)
            gl.spawnRibbon({
              ax: prev.x, ay: prev.y, az: prevZ,
              cx: (prev.x + pt.x) * 0.5, cy: (prev.y + pt.y) * 0.5, cz: Math.max(prevZ, topZ) + 0.55,
              bx: pt.x, by: pt.y, bz: topZ,
              width: 0.2, dur: 0.38, lut, style: RibbonStyle.Arc,
            })
          }
          this.glBurst(gl, pt.x, pt.y, 0.35, 7, lut, { speed: [0.5, 2.2], vz: [1.8, 4.4], life: [0.24, 0.45], size: 2.3 })
        } else {
          this.lit(cell.x, cell.y, col[0], 0.12, 0.4)
          this.burst(pt.x, pt.y, { n: 4, speed: [0.4, 1.6], life: [0.15, 0.3], colors: col, size: 1.6 })
        }
      })
    })
    const from = path.length > 1 ? mid(path[path.length - 2]) : p
    this.after(at, () => {
      if (gl && path.length > 0) {
        const last = mid(path[path.length - 1])
        const lastZ = Math.min(4.6, 1.4 + (path.length - 1) * 0.38)
        gl.spawnRibbon({
          ax: last.x, ay: last.y, az: lastZ, cx: last.x, cy: last.y, cz: lastZ * 0.5, bx: t.x, by: t.y, bz: 0.15,
          width: 0.42, dur: 0.32, lut, style: RibbonStyle.Beam,
        })
      }
      this.impact(t, from, col, lut, Math.max(0.45, Math.min(1.05, path.length / 8)))
      this.tag(t, `L1 = ${path.length}`, col[0])
    })
  }

  // ARRAY: grid scan decals + twin counter-sweeping 3D helical lasso slashes pulling inward.
  private arrayScan = ({ fx, p, t, col, lut, dir, at }: Ctx): void => {
    const gl = this.useGl(false)
    const cells = rangeCells(fx)
    cells.forEach((cell, i) => {
      this.after(i * 9, () => {
        if (gl) {
          gl.spawnDecal({ x: cell.x + 0.5, y: cell.y + 0.5, radius: 0.54, dur: 0.26, lut, kind: DecalKind.Tile })
        } else {
          this.lit(cell.x, cell.y, col[0], 0.16, 0.22)
        }
      })
    })
    if (gl) {
      const nx = -Math.sin(dir)
      const ny = Math.cos(dir)
      const lassoDur = Math.max(0.24, at / 1000 + 0.08)
      gl.spawnRibbon({
        ax: p.x - nx * 1.4, ay: p.y - ny * 1.4, az: 0.65,
        cx: (p.x + t.x) * 0.5 + nx * 1.1, cy: (p.y + t.y) * 0.5 + ny * 1.1, cz: 2.4,
        bx: t.x, by: t.y, bz: 0.35, width: 0.72, dur: lassoDur, lut, style: RibbonStyle.Slash,
      })
      gl.spawnRibbon({
        ax: p.x + nx * 1.4, ay: p.y + ny * 1.4, az: 0.65,
        cx: (p.x + t.x) * 0.5 - nx * 1.1, cy: (p.y + t.y) * 0.5 - ny * 1.1, cz: 2.4,
        bx: t.x, by: t.y, bz: 0.35, width: 0.72, dur: lassoDur, lut: LutRow.Probe, style: RibbonStyle.Slash,
      })
    }
    this.after(at, () => {
      this.impact(t, { x: t.x - 1, y: t.y }, col, lut, 0.5)
      this.tag(t, `[${fx.target.y.toString(16).toUpperCase()}][${fx.target.x.toString(16).toUpperCase()}]`, col[0])
    })
    this.ripple(p, 2, 4)
  }

  // FLOOD: diamond wave of Voronoi crests + surging 3D crest arcs & Curl-Noise spray.
  private floodFill = ({ fx, p, t, col, lut, at }: Ctx): void => {
    const gl = this.useGl(false)
    const cells = rangeCells(fx)
    const maxDist = cells.reduce((m, cell) => Math.max(m, Math.abs(cell.x - fx.origin.x) + Math.abs(cell.y - fx.origin.y)), 0)
    if (gl) {
      for (let d = 1; d <= maxDist; d += 2) {
        this.after(d * 42, () => {
          gl.spawnWave({
            x: p.x, y: p.y, z: 0.4, r0: Math.max(0.4, d - 0.8), r1: d + 0.9,
            pitchX: 0.35, rollY: d % 4 === 1 ? 0.16 : -0.16, thickness: 0.24, dur: 0.38, lut: LutRow.Cyan, mode: WaveMode.Shock,
          })
          gl.spawnRibbon({
            ax: p.x - d * 0.6, ay: p.y - d * 0.25, az: 0.45,
            cx: p.x, cy: p.y + d * 0.5, cz: 1.45,
            bx: p.x + d * 0.6, by: p.y - d * 0.25, bz: 0.45,
            width: 0.46, dur: 0.36, lut, style: RibbonStyle.Slash,
          })
        })
      }
    }
    for (const cell of cells) {
      const dist = Math.abs(cell.x - fx.origin.x) + Math.abs(cell.y - fx.origin.y)
      this.after(dist * 42, () => {
        if (gl) {
          const cx = cell.x + 0.5
          const cy = cell.y + 0.5
          gl.spawnDecal({ x: cx, y: cy, radius: 0.58, dur: 0.56, lut: dist % 2 ? lut : LutRow.Cyan, kind: DecalKind.Flood })
          if ((cell.x + cell.y) % 2 === 0) {
            this.glBurst(gl, cx, cy, 0.15, 5, lut, {
              speed: [0.4, 1.8], vz: [2.5, 5.5], life: [0.35, 0.65], size: 2.3, curl: 9.5, bounce: 0.28, shape: ParticleShape.Mote,
            })
          }
        } else {
          this.lit(cell.x, cell.y, col[dist % 2 ? 0 : 2], 0.18, 0.5)
        }
      })
    }
    this.after(at, () => { this.impact(t, p, col, lut, 0.42); this.tag(t, 'FILLED', col[0]) })
    this.ripple(p, 5, 7)
  }

  // HIGH: contracting thermal gimbals -> roaring z = 0 -> 6.5 turbulent solar plasma column.
  private temperature = ({ t, col, lut, at }: Ctx): void => {
    const gl = this.useGl(false)
    if (gl) {
      gl.spawnWave({ x: t.x, y: t.y, z: 0.55, r0: 1.65, r1: 0.32, pitchX: 0.48, rollY: 0.22, thickness: 0.14, dur: at / 1000, lut, mode: WaveMode.Gimbal })
      this.after(at, () => {
        gl.spawnDecal({ x: t.x, y: t.y, radius: 2.8, dur: 0.68, lut, kind: DecalKind.Spill })
        gl.spawnWave({ x: t.x, y: t.y, z: 0.35, r0: 0.24, r1: 2.1, pitchX: 0.46, rollY: -0.25, thickness: 0.24, dur: 0.52, lut, mode: WaveMode.Shock })
        for (let k = 0; k < 3; k++) {
          const ang = (k / 3) * Math.PI * 2
          gl.spawnRibbon({
            ax: t.x + Math.cos(ang) * 0.45, ay: t.y + Math.sin(ang) * 0.45, az: 0.15,
            cx: t.x + Math.cos(ang + 2.1) * 0.72, cy: t.y + Math.sin(ang + 2.1) * 0.72, cz: 3.1,
            bx: t.x + Math.cos(ang + 4.2) * 0.25, by: t.y + Math.sin(ang + 4.2) * 0.25, bz: 5.8,
            width: 0.34, dur: 0.55, lut, style: RibbonStyle.Arc,
          })
        }
        this.glBurst(gl, t.x, t.y, 0.3, 95, lut, {
          speed: [1.0, 5.2], vz: [4.5, 11.5], life: [0.55, 1.25], size: 2.7, drag: 1.75, gravZ: 3.6, curl: 16, bounce: 0, shape: ParticleShape.Mote,
        })
        this.ripple(t, 6)
        this.shake(4.5)
        this.tag(t, 'T = 2.0', col[0])
      })
      return
    }

    this.ring(t, 1.2, 0.3, at / 1000, col[0], 1.5)
    this.after(at, () => {
      this.flash(t, 0.6)
      for (let k = 0; k < 46; k++) {
        const angle = -Math.PI / 2 + rnd(-1.3, 1.3)
        const speed = rnd(1, 7)
        this.add({
          x: t.x + rnd(-0.15, 0.15), y: t.y + rnd(-0.15, 0.15), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: rnd(0.5, 1.2), max: 1.2, size: rnd(1.5, 2.6), color: pick(['#ffffff', col[0], col[1], '#ff9f43']),
          drag: 2.2, grav: -5, jit: 26, type: 'dot',
        })
      }
      this.ring(t, 0.2, 1.6, 0.45, col[0], 4)
      this.ripple(t, 6)
      this.shake(4)
      this.tag(t, 'T = 2.0', col[0])
    })
  }

  // ZERO: instant twin rail lance + 4 tilted supersonic Mach shock cones + Fresnel shield shatter.
  private zeroShot = (c: Ctx): void => {
    const { p, t, col, lut, dir } = c
    const gl = this.useGl(false)
    this.motif(c, 0, gl)
    if (gl) {
      const overshoot = { x: t.x + Math.cos(dir) * 3.0, y: t.y + Math.sin(dir) * 3.0 }
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.55, cx: (p.x + overshoot.x) * 0.5, cy: (p.y + overshoot.y) * 0.5, cz: 0.65,
        bx: overshoot.x, by: overshoot.y, bz: 0.45, width: 0.46, dur: 0.32, lut, style: RibbonStyle.Beam,
      })
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.55, cx: (p.x + overshoot.x) * 0.5, cy: (p.y + overshoot.y) * 0.5, cz: 0.65,
        bx: overshoot.x, by: overshoot.y, bz: 0.45, width: 0.18, dur: 0.34, lut: LutRow.Probe, style: RibbonStyle.Beam,
      })
      for (let m = 0; m < 4; m++) {
        const pt = lerp(p, overshoot, 0.24 + m * 0.22)
        gl.spawnWave({
          x: pt.x, y: pt.y, z: 0.52, r0: 0.12, r1: 0.8 + m * 0.24,
          pitchX: 1.15, rollY: dir, thickness: 0.12, dur: 0.32, lut: LutRow.Probe, mode: WaveMode.Slice,
        })
      }
      gl.spawnDome({ x: t.x, y: t.y, z: 0.5, r0: 0.62, r1: 1.18, dur: 0.28, lut: LutRow.Probe })
      this.glBurst(gl, t.x, t.y, 0.48, 56, lut, {
        dir, spread: 0.58, speed: [7, 18], vz: [1.0, 4.5], life: [0.24, 0.58], size: 2.6, bounce: 0.44,
      })
      gl.spawnDecal({ x: t.x, y: t.y, radius: 1.9, dur: 0.42, lut, kind: DecalKind.Spill })
      this.ripple(t, 3.5)
      this.tag(t, '0-SHOT', col[0])
      return
    }

    this.beam(p, { x: t.x + Math.cos(dir) * 2.6, y: t.y + Math.sin(dir) * 2.6 }, 0.24, col[1], 2.5)
    this.flash(t, 0.5)
    this.ring(t, 0.15, 0.8, 0.3, col[1], 1.5)
    this.burst(t.x, t.y, { n: 34, dir, spread: 0.5, speed: [6, 16], life: [0.2, 0.5], colors: col })
    this.ripple(t, 3)
    this.tag(t, '0-SHOT', col[0])
  }

  // ULTRA: dark ink-void singularity + 3 accretion gimbals -> colossal width 1.15 full-board rail cannon.
  private ultra = (c: Ctx): void => {
    const { p, t, col, lut, dir, at } = c
    const gl = this.useGl(false)
    const end = { x: p.x + Math.cos(dir) * SIZE * 1.5, y: p.y + Math.sin(dir) * SIZE * 1.5 }
    this.motif(c, at, gl)

    if (gl) {
      gl.spawnDome({ x: p.x, y: p.y, z: 1.8, r0: 0.15, r1: 0.95, dur: 0.38, lut, voidOrb: true })
      gl.spawnWave({ x: p.x, y: p.y, z: 1.8, r0: 2.1, r1: 0.72, pitchX: 0.55, rollY: -0.3, thickness: 0.14, dur: 0.36, lut, mode: WaveMode.Gimbal })
      gl.spawnWave({ x: p.x, y: p.y, z: 1.8, r0: 1.8, r1: 0.58, pitchX: -0.65, rollY: 0.42, thickness: 0.12, dur: 0.36, lut: LutRow.Probe, mode: WaveMode.Slice })
      gl.spawnWave({ x: p.x, y: p.y, z: 1.8, r0: 1.5, r1: 0.46, pitchX: 0.2, rollY: -0.58, thickness: 0.1, dur: 0.36, lut, mode: WaveMode.Shock })
      for (let k = 0; k < 5; k++) {
        this.after(k * 60, () => this.glImplode(gl, p, 1.8, 22, lut, 2.8, 0.23))
      }
      this.after(at, () => {
        this.hitStop = Math.max(this.hitStop, 0.038)
        this.triggerFlash(0.18)
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 1.1, cx: (p.x + end.x) * 0.5, cy: (p.y + end.y) * 0.5, cz: 1.25,
          bx: end.x, by: end.y, bz: 0.65, width: 1.15, dur: 0.44, lut, style: RibbonStyle.Beam,
        })
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 1.1, cx: (p.x + end.x) * 0.5, cy: (p.y + end.y) * 0.5, cz: 1.25,
          bx: end.x, by: end.y, bz: 0.65, width: 0.36, dur: 0.52, lut: LutRow.Probe, style: RibbonStyle.Beam,
        })
        gl.spawnRibbon({
          ax: p.x, ay: p.y, az: 1.1, cx: (p.x + end.x) * 0.5, cy: (p.y + end.y) * 0.5, cz: 1.8,
          bx: end.x, by: end.y, bz: 0.65, width: 0.42, dur: 0.46, lut, style: RibbonStyle.Arc,
        })
        for (let f = 0.035; f < 1; f += 0.045) {
          const pt = lerp(p, end, f)
          if (pt.x < 0 || pt.y < 0 || pt.x > SIZE || pt.y > SIZE) break
          gl.spawnDecal({ x: pt.x, y: pt.y, radius: 2.2, dur: 0.56, lut, kind: DecalKind.Spill })
          this.glBurst(gl, pt.x, pt.y, 0.75, 4, lut, {
            dir: dir + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2, spread: 0.7,
            speed: [0.8, 3.2], vz: [1.0, 3.8], life: [0.5, 1.2], size: 2.4, drag: 1.4, curl: 5.5, shape: ParticleShape.Mote,
          })
        }
        gl.spawnDecal({ x: t.x, y: t.y, radius: 3.1, dur: 0.68, lut, kind: DecalKind.Fracture })
        gl.spawnWave({ x: t.x, y: t.y, z: 0.45, r0: 0.25, r1: 3.2, pitchX: 0.48, rollY: -0.25, thickness: 0.36, dur: 0.56, lut, mode: WaveMode.Shock })
        gl.spawnWave({ x: t.x, y: t.y, z: 0.7, r0: 0.25, r1: 2.6, pitchX: -0.4, rollY: 0.32, thickness: 0.18, dur: 0.5, lut: LutRow.Probe, mode: WaveMode.Slice })
        this.glBurst(gl, t.x, t.y, 0.6, 85, lut, {
          dir, spread: 1.7, speed: [5.0, 17], vz: [3.0, 9.5], life: [0.4, 0.88], size: 2.8, curl: 4.0, bounce: 0.48,
        })
        this.ripple(t, 8)
        this.ripple(p, 3)
        this.shake(7.5)
        this.tag(t, 'ULTRA', col[0])
      })
      return
    }

    for (let k = 0; k < 5; k++) this.after(k * 60, () => this.implode(p, 14, col, 2.1, 0.2))
    this.after(at, () => {
      this.beam(p, end, 0.32, col[1], 10)
      this.beam(p, end, 0.5, col[2], 3)
      this.flash(p, 0.6)
      this.flash(t, 0.9)
      for (let f = 0.03; f < 1; f += 0.02) {
        const pt = lerp(p, end, f)
        if (pt.x < 0 || pt.y < 0 || pt.x > SIZE || pt.y > SIZE) break
        this.burst(pt.x, pt.y, {
          n: 1, dir: dir + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2, spread: 0.5,
          speed: [0.3, 1.8], life: [0.5, 1.2], colors: col, size: 1.6, drag: 1.5, type: 'dot',
        })
      }
      this.burst(t.x, t.y, { n: 40, dir, spread: 1.4, speed: [4, 15], life: [0.3, 0.7], colors: col, size: 2.2 })
      this.ring(t, 0.2, 2.2, 0.5, col[0], 5)
      this.ripple(t, 8)
      this.ripple(p, 3)
      this.shake(7)
      this.tag(t, 'ULTRA', col[0])
    })
  }

  // PROBE: Fresnel Security containment sphere + laser tomography scan + 5 glowing 3D synapses.
  private probe = (c: Ctx): void => {
    const { p, t, col, lut, at } = c
    const gl = this.useGl(false)
    const radius = 0.78
    const nodes = [[-0.3, -0.26, 0.65], [0.28, -0.3, 0.75], [0, 0.02, 0.52], [-0.26, 0.3, 0.7], [0.3, 0.27, 0.58]]
      .map(([dx, dy, z]) => ({ x: t.x + dx, y: t.y + dy, z }))

    if (gl) {
      gl.spawnDome({ x: t.x, y: t.y, z: 0.65, r0: radius, r1: radius + 0.1, dur: 0.92, lut: LutRow.Probe })
      gl.spawnRibbon({
        ax: p.x, ay: p.y, az: 0.55, cx: (p.x + t.x) * 0.5, cy: (p.y + t.y) * 0.5, cz: 0.95,
        bx: t.x, by: t.y, bz: 0.62, width: 0.16, dur: 0.72, lut: LutRow.Probe, style: RibbonStyle.Beam,
      })
      this.motif(c, 120, gl)
      for (let k = 0; k < 10; k++) {
        this.after(140 + k * 30, () => {
          const z = 1.25 - (k / 9) * 1.17
          const sliceR = Math.max(0.2, radius * Math.sqrt(Math.max(0.08, 1 - ((k - 4.5) / 5) ** 2)))
          gl.spawnWave({
            x: t.x, y: t.y, z, r0: sliceR, r1: sliceR + 0.06, pitchX: 0.06, rollY: 0,
            thickness: 0.08, dur: 0.14, lut, mode: WaveMode.Slice,
          })
        })
      }
      nodes.forEach((node, i) => {
        this.after(180 + i * 55, () => {
          this.glBurst(gl, node.x, node.y, node.z, 6, lut, { speed: [0.1, 0.5], vz: [0.1, 0.7], life: [0.3, 0.45], size: 2.9, shape: ParticleShape.Mote })
          if (i) {
            const prev = nodes[i - 1]
            gl.spawnRibbon({
              ax: prev.x, ay: prev.y, az: prev.z, cx: (prev.x + node.x) * 0.5, cy: (prev.y + node.y) * 0.5, cz: (prev.z + node.z) * 0.5 + 0.18,
              bx: node.x, by: node.y, bz: node.z, width: 0.12, dur: 0.45, lut, style: RibbonStyle.Beam,
            })
          }
        })
      })
      this.after(at, () => {
        nodes.forEach(node => this.glBurst(gl, node.x, node.y, node.z, 9, lut, { speed: [1.8, 6.2], vz: [1.0, 3.8], life: [0.24, 0.55] }))
        gl.spawnWave({ x: t.x, y: t.y, z: 0.45, r0: 0.14, r1: 0.95, pitchX: 0.44, rollY: 0.22, thickness: 0.12, dur: 0.36, lut: LutRow.Probe, mode: WaveMode.Shock })
        gl.spawnDecal({ x: t.x, y: t.y, radius: 1.6, dur: 0.45, lut, kind: DecalKind.Spill })
        this.ripple(t, 2)
        this.tag(t, 'SECURITY IGNORED', col[0])
      })
      return
    }

    const shield: Coord[] = []
    for (let i = 0; i <= 28; i++) shield.push({ x: t.x + Math.cos((i / 28) * Math.PI * 2) * radius, y: t.y + Math.sin((i / 28) * Math.PI * 2) * radius })
    this.poly(shield, 0.95, '#9a9891', 1.5)
    this.poly([p, t], 0.7, col[1], 1)
    this.motif(c, 120, null)
    for (let k = 0; k < 14; k++) this.after(140 + k * 22, () => {
      const y = t.y - radius + (2 * radius * k) / 13
      const half = Math.sqrt(Math.max(0, radius * radius - (y - t.y) ** 2))
      this.poly([{ x: t.x - half, y }, { x: t.x + half, y }], 0.08, col[0], 1.5)
    })
    nodes.forEach((node, i) => this.after(180 + i * 55, () => {
      this.flash(node, 0.09, 0.3)
      if (i) this.poly([nodes[i - 1], node], 0.4, col[0], 1)
    }))
    this.after(at, () => {
      nodes.forEach(node => this.burst(node.x, node.y, { n: 6, speed: [1, 5], life: [0.2, 0.5], colors: col, size: 1.6 }))
      this.ring(t, 0.1, 0.6, 0.3, col[1], 1.5)
      this.ripple(t, 2)
      this.tag(t, 'SECURITY IGNORED', col[0])
    })
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
      peakParticles: this.peakParticles2d,
      peakRibbons: 0,
      renderPassesLastFrame: 0,
      totalRenderedFrames: this.totalFrames2d,
      vramBytesApprox: 0,
    }
  }
}
