import { inAttackRange } from './attack-methods'
import type { AttackEffect, Coord } from './battle-types'

// Attack effects are the one loud part of an otherwise minimal board: additive
// particles with a soft bloom, drawn on their own layer above the grid. Every
// skill acts out the AI term it is named after, in the colour of the deck that
// fired it (VECTOR amber, CoT cyan), Geeks in red, Overload in violet.
//
// Positions, speeds and radii are in cells, so effects follow pan and zoom;
// stroke widths and particle sizes are in CSS pixels.

const SIZE = 15
const MAX_PARTICLES = 1500
const AMBER = ['#ffc857', '#fff3c4', '#ff9f43']
const CYAN = ['#5ee6ff', '#e2fbff', '#3aa8ff']
const RED = ['#ff5d73', '#ffd0d6', '#ff3fa4']
const VIOLET = ['#a78bfa', '#ffffff', '#5ee6ff']

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
// `at` is when the hit lands, in ms after the effect starts.
type Ctx = { fx: AttackEffect; p: Coord; t: Coord; col: string[]; dir: number; at: number }

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

function rangeCells(fx: AttackEffect): Coord[] {
  const cells: Coord[] = []
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (inAttackRange(fx.origin, { x, y }, { name: '', amount: 0, area: 'all', shape: fx.shape, range: fx.range, width: fx.width })) cells.push({ x, y })
  }
  return cells
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
  private grid = Array.from({ length: SIZE * SIZE }, () => ({ ox: 0, oy: 0, vx: 0, vy: 0 }))
  private shakeAmp = 0
  private screenFlash = 0
  private now = 0
  private last = 0
  private nextStart = 0
  private lastOverload = -1e9
  private layer = document.createElement('canvas')
  private bloom = document.createElement('canvas')

  // One effect at a time. In a turn the battle already waits for each effect,
  // so this only queues an Overload: its opening cascade, then one beam per
  // Geek in quick succession.
  play(effect: AttackEffect, reduced: boolean): void {
    const timing = effectTiming(effect)
    let start = Math.max(this.now, this.nextStart)
    if (effect.overload && !reduced && start - this.lastOverload > 1500) {
      this.timers.push({ at: start, fn: () => this.cascade(mid(effect.origin)) })
      start += 340
    }
    if (effect.overload) this.lastOverload = start
    this.nextStart = start + (reduced ? 60 : effect.overload ? 110 : timing.strike + timing.settle - 20)
    this.timers.push({ at: start, fn: () => this.start(effect, reduced, timing.strike) })
  }

  clear(): void {
    this.parts = []; this.rings = []; this.beams = []; this.flashes = []; this.lines = []
    this.cells = []; this.tags = []; this.nums = []; this.shots = []; this.timers = []
    this.nextStart = 0
    this.grid.forEach(point => { point.ox = point.oy = point.vx = point.vy = 0 })
    this.shakeAmp = this.screenFlash = 0
  }

  private after(ms: number, fn: () => void): void {
    this.timers.push({ at: this.now + ms, fn })
  }

  private add(part: Partial<Particle> & Pick<Particle, 'x' | 'y' | 'life' | 'color'>): void {
    this.parts.push({ vx: 0, vy: 0, max: part.life, size: 2, drag: 0, grav: 0, jit: 0, type: 'spark', home: null, ...part })
  }

  private burst(x: number, y: number, o: Burst): void {
    for (let i = 0; i < o.n; i++) {
      const angle = (o.dir ?? 0) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2)
      const speed = rnd(o.speed[0], o.speed[1])
      this.add({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rnd(o.life[0], o.life[1]),
        size: o.size ?? 2, color: pick(o.colors), drag: o.drag ?? 3.2, grav: o.grav ?? 0, type: o.type ?? 'spark',
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
  private note(at: Coord, fx: AttackEffect): void {
    if (!fx.events?.length) return
    const y = at.y + 0.36
    this.tags = this.tags.filter(tag => tag.x !== at.x || tag.y !== y)
    this.tags.push({ x: at.x, y, text: fx.events.join(' · '), color: '#f4f4f4', t: 0, dur: 1.5 })
    this.ring(at, 0.3, 1.25, 0.5, '#f4f4f4', 1.5)
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

  // Four layers: a white core that is gone in a few frames, sparks thrown
  // along the line of the attack, a ring, and slow embers.
  private impact(at: Coord, from: Coord, col: string[], power: number): void {
    const dir = Math.atan2(at.y - from.y, at.x - from.x)
    this.flash(at, 0.3 + power * 0.25)
    this.ring(at, 0.2, 0.9 + power * 0.9, 0.42, col[0], 2 + power * 2)
    this.burst(at.x, at.y, { n: 10 + power * 18, dir, spread: 1.7, speed: [2, 7 + power * 5], life: [0.25, 0.6], colors: col })
    this.burst(at.x, at.y, { n: 6 + power * 8, speed: [0.3, 1.6], life: [0.7, 1.3], colors: col, size: 1.6, drag: 1.4, type: 'dot' })
    this.ripple(at, 2 + power * 5)
  }

  // The frame's own mark on a single-target strike: CoT travels as a chain of
  // linked steps, VECTOR ends in an arrowhead along the attack.
  private motif({ fx, p, t, col, dir }: Ctx, travel: number): void {
    if (fx.source !== 'player') return
    if (fx.shape === 'cross') {
      const steps = 6
      for (let i = 1; i < steps; i++) this.after(travel * i / steps, () => {
        const b = lerp(p, t, i / steps)
        this.poly([lerp(p, t, (i - 1) / steps), b], 0.34, col[0], 1)
        this.ring(b, 0.05, 0.16, 0.34, col[0], 1.5)
      })
    } else this.after(travel, () => {
      const size = 0.55, open = 0.5
      this.poly([
        { x: t.x - Math.cos(dir - open) * size, y: t.y - Math.sin(dir - open) * size }, t,
        { x: t.x - Math.cos(dir + open) * size, y: t.y - Math.sin(dir + open) * size },
      ], 0.36, col[0], 2.5)
    })
  }

  private start(fx: AttackEffect, reduced: boolean, at: number): void {
    const p = mid(fx.origin)
    const t = mid(fx.target)
    const col = fx.source === 'enemy' ? RED : fx.overload ? VIOLET : fx.shape === 'cross' ? CYAN : AMBER
    const c: Ctx = { fx, p, t, col, dir: Math.atan2(t.y - p.y, t.x - p.x), at }
    // The Reduced Motion setting swaps the whole effect for a line and a ring.
    if (reduced) {
      this.poly([p, t], 0.12, col[0], 1.5)
      this.ring(t, 0.2, 0.7, 0.12, col[0], 2)
      this.number(t, fx, col)
      this.note(t, fx)
      return
    }
    this.after(at, () => { this.number(t, fx, col); this.note(t, fx) })
    if (fx.source === 'enemy') { this.swarm(c); return }
    if (fx.overload) { this.overloadBeam(c); return }
    const signature: Record<string, (c: Ctx) => void> = {
      base: this.forwardPass, on: this.neuronOn, off: this.dropout, spike: this.spike,
      manhattan: this.manhattan, array: this.arrayScan, flood: this.floodFill, high: this.temperature,
      zero: this.zeroShot, ultra: this.ultra, probe: this.probe,
    }
    ;(signature[fx.fx ?? ''] ?? this.forwardPass)(c)
  }

  // OVERLOAD is one animation of its own, not the deck's four skills in turn:
  // the cascade below, then a beam to every Geek it hits.
  private overloadBeam = ({ p, t, col }: Ctx): void => {
    this.beam(p, t, 0.26, pick(col), 5)
    this.impact(t, p, col, 0.9)
    this.shake(4)
    this.tag(t, 'OVERLOAD', col[0])
  }

  // An implosion, a white flash and a double ring before the beams fire.
  private cascade(p: Coord): void {
    for (let k = 0; k < 5; k++) this.after(k * 55, () => this.implode(p, 16, VIOLET, 2.6, 0.22))
    this.after(340, () => {
      this.screenFlash = 0.3
      this.ring(p, 0.2, 11, 0.8, VIOLET[0], 6)
      this.ring(p, 0.2, 11, 0.95, VIOLET[1], 2)
      this.ripple(p, 12, 11)
      this.shake(8)
      this.burst(p.x, p.y, { n: 50, speed: [3, 13], life: [0.4, 0.9], colors: VIOLET })
    })
  }

  // DESIRE: motes leave the Geek, curve in and home on the Operator.
  private swarm = ({ p, t, col, at }: Ctx): void => {
    for (let i = 0; i < 30; i++) this.after(i * 8, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = rnd(3, 7)
      this.add({ x: p.x, y: p.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.1, color: pick(col), drag: 1.8, home: t })
    })
    this.after(at, () => { this.impact(t, p, col, 0.6); this.shake(3) })
  }

  // BASE, a base model's forward pass: a stream of token blocks lands one by one.
  private forwardPass = (c: Ctx): void => {
    const { p, t, col, dir, at } = c
    this.motif(c, at - 30)
    for (let i = 0; i < 7; i++) this.after(i * 34, () => {
      const size = rnd(4, 9)
      this.shot(p, t, 0.15, (x, y) => this.add({ x, y, life: 0.03, size, color: col[i % 2], type: 'square' }),
        () => this.burst(t.x, t.y, { n: 4, dir, spread: 1.6, speed: [2, 6], life: [0.15, 0.35], colors: col, size: 1.6 }))
    })
    this.after(at, () => { this.impact(t, p, col, 0.4); this.tag(t, 'FORWARD PASS', col[0]) })
  }

  // ON, a neuron switching on: nodes fire along the line, then the signal holds.
  private neuronOn = (c: Ctx): void => {
    const { fx, p, t, col, dir, at } = c
    const nodes = 7
    for (let i = 1; i <= nodes; i++) this.after(i * (at - 30) / nodes, () => {
      const at = lerp(p, t, i / nodes)
      this.flash(at, 0.14, 0.12)
      this.ring(at, 0.05, 0.3, 0.3, col[0], 1.5)
    })
    this.after(at, () => {
      this.beam(p, t, 0.36, col[1], 3.5)
      for (let k = 0; k < 8; k++) this.after(k * 30, () => this.burst(t.x, t.y, {
        n: 4, dir: dir + Math.PI, spread: 2.2, speed: [2, 7], life: [0.2, 0.45], colors: col, size: 1.8,
      }))
      this.flash(t, 0.45)
      this.ring(t, 0.2, 1.2, 0.4, col[0], 2.5)
      this.ripple(t, 4)
      if (fx.shape !== 'cross') this.motif(c, 0)
      this.tag(t, 'ACTIVE', col[0])
    })
  }

  // OFF, dropout: units launch, some grey out and fall away; the rest are the roll.
  private dropout = ({ fx, p, t, col, dir, at }: Ctx): void => {
    const units = Math.max(1, Math.min(6, fx.cap ?? 5))
    const kept = Math.min(units, fx.amount ?? units)
    const order = Array.from({ length: units }, (_, i) => i).sort(() => Math.random() - 0.5)
    const dropped = new Set(order.slice(0, units - kept))
    const nx = -Math.sin(dir), ny = Math.cos(dir)
    for (let i = 0; i < units; i++) {
      const side = (i - (units - 1) / 2) * 0.16
      const a = { x: p.x + nx * side, y: p.y + ny * side }
      const b = { x: t.x + nx * side * 0.3, y: t.y + ny * side * 0.3 }
      const cutAt = rnd(0.3, 0.7)
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
    this.after(at, () => {
      if (kept) {
        this.flash(t, 0.3 + kept * 0.07)
        this.ring(t, 0.2, 0.7 + kept * 0.22, 0.35, col[0], 2)
        this.ripple(t, 1.5 + kept)
      }
      this.tag(t, `DROPOUT ${kept}/${units} KEPT`, kept ? col[0] : '#8d8b85')
    })
  }

  // SPIKE, a spike in the signal: a flat trace jumps into one tall peak.
  private spike = (c: Ctx): void => {
    const { p, t, col, at } = c
    const trace: Coord[] = []
    for (let i = 0; i <= 24; i++) {
      const at = lerp(p, t, i / 24)
      trace.push({ x: at.x, y: at.y + (i % 24 ? rnd(-0.05, 0.05) : 0) })
    }
    this.poly(trace, 0.55, col[0], 1.2)
    this.motif(c, at)
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

  // MANHATTAN, L1 distance: a spark walks the right-angled path cell by cell.
  private manhattan = ({ fx, p, t, col, at }: Ctx): void => {
    const path: Coord[] = []
    const sx = Math.sign(fx.target.x - fx.origin.x), sy = Math.sign(fx.target.y - fx.origin.y)
    for (let x = fx.origin.x + sx; sx && x !== fx.target.x + sx; x += sx) path.push({ x, y: fx.origin.y })
    for (let y = fx.origin.y + sy; sy && y !== fx.target.y + sy; y += sy) path.push({ x: fx.target.x, y })
    const gap = at / Math.max(1, path.length)
    path.forEach((cell, i) => this.after(i * gap, () => {
      this.lit(cell.x, cell.y, col[0], 0.12, 0.4)
      const at = mid(cell)
      this.burst(at.x, at.y, { n: 4, speed: [0.4, 1.6], life: [0.15, 0.3], colors: col, size: 1.6 })
    }))
    const from = path.length > 1 ? mid(path[path.length - 2]) : p
    this.after(at, () => { this.impact(t, from, col, Math.min(1, path.length / 9)); this.tag(t, `L1 = ${path.length}`, col[0]) })
  }

  // ARRAY, an array being indexed: the range is scanned row by row.
  private arrayScan = ({ fx, p, t, col, at }: Ctx): void => {
    rangeCells(fx).forEach((cell, i) => this.after(i * 9, () => this.lit(cell.x, cell.y, col[0], 0.16, 0.22)))
    this.after(at, () => {
      this.impact(t, { x: t.x - 1, y: t.y }, col, 0.35)
      this.tag(t, `[${fx.target.y.toString(16).toUpperCase()}][${fx.target.x.toString(16).toUpperCase()}]`, col[0])
    })
    this.ripple(p, 2, 4)
  }

  // FLOOD, flood fill: cells fill outward from the Operator in a diamond wave.
  private floodFill = ({ fx, p, t, col, at }: Ctx): void => {
    for (const cell of rangeCells(fx)) {
      const dist = Math.abs(cell.x - fx.origin.x) + Math.abs(cell.y - fx.origin.y)
      this.after(dist * 42, () => this.lit(cell.x, cell.y, col[dist % 2 ? 0 : 2], 0.18, 0.5))
    }
    this.after(at, () => { this.impact(t, p, col, 0.3); this.tag(t, 'FILLED', col[0]) })
    this.ripple(p, 5, 7)
  }

  // HIGH, high temperature: the Geek overheats and jittering embers scatter.
  private temperature = ({ t, col, at }: Ctx): void => {
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

  // ZERO, zero-shot: no wind-up, one instant lance through the target.
  private zeroShot = (c: Ctx): void => {
    const { p, t, col, dir } = c
    this.motif(c, 0)
    this.beam(p, { x: t.x + Math.cos(dir) * 2.6, y: t.y + Math.sin(dir) * 2.6 }, 0.24, col[1], 2.5)
    this.flash(t, 0.5)
    this.ring(t, 0.15, 0.8, 0.3, col[1], 1.5)
    this.burst(t.x, t.y, { n: 34, dir, spread: 0.5, speed: [6, 16], life: [0.2, 0.5], colors: col })
    this.ripple(t, 3)
    this.tag(t, '0-SHOT', col[0])
  }

  // ULTRA, the largest tier: particles converge like parameters loading, then a rail beam.
  private ultra = (c: Ctx): void => {
    const { p, t, col, dir, at } = c
    const end = { x: p.x + Math.cos(dir) * SIZE * 1.5, y: p.y + Math.sin(dir) * SIZE * 1.5 }
    for (let k = 0; k < 5; k++) this.after(k * 60, () => this.implode(p, 14, col, 2.1, 0.2))
    this.motif(c, at)
    this.after(at, () => {
      this.beam(p, end, 0.32, col[1], 10)
      this.beam(p, end, 0.5, col[2], 3)
      this.flash(p, 0.6)
      this.flash(t, 0.9)
      for (let f = 0.03; f < 1; f += 0.02) {
        const at = lerp(p, end, f)
        if (at.x < 0 || at.y < 0 || at.x > SIZE || at.y > SIZE) break
        this.burst(at.x, at.y, {
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

  // PROBE, reading internal activations: a hairline passes the Security ring
  // untouched, a scan line sweeps the Geek and its inner nodes light up.
  private probe = (c: Ctx): void => {
    const { p, t, col, at } = c
    const radius = 0.62
    const shield: Coord[] = []
    for (let i = 0; i <= 28; i++) shield.push({ x: t.x + Math.cos(i / 28 * Math.PI * 2) * radius, y: t.y + Math.sin(i / 28 * Math.PI * 2) * radius })
    this.poly(shield, 0.95, '#9a9891', 1.5)
    this.poly([p, t], 0.7, col[1], 1)
    this.motif(c, 120)
    for (let k = 0; k < 14; k++) this.after(140 + k * 22, () => {
      const y = t.y - radius + 2 * radius * k / 13
      const half = Math.sqrt(Math.max(0, radius * radius - (y - t.y) ** 2))
      this.poly([{ x: t.x - half, y }, { x: t.x + half, y }], 0.08, col[0], 1.5)
    })
    const nodes = [[-0.3, -0.25], [0.28, -0.3], [0, 0.02], [-0.25, 0.3], [0.3, 0.26]].map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy }))
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
    this.now = time
    const due = this.timers.filter(timer => timer.at <= time)
    this.timers = this.timers.filter(timer => timer.at > time)
    due.forEach(timer => timer.fn())

    for (const shot of this.shots) {
      shot.t += dt
      const f = Math.min(1, shot.t / shot.dur)
      const at = lerp(shot.a, shot.b, f)
      shot.tick(at.x, at.y, f)
      if (f >= 1) shot.done()
    }
    this.shots = this.shots.filter(shot => shot.t < shot.dur)

    for (const part of this.parts) {
      if (part.home) {
        const dx = part.home.x - part.x, dy = part.home.y - part.y
        const dist = Math.hypot(dx, dy) || 1
        const pull = (1 - part.life / part.max) * 230
        part.vx += dx / dist * pull * dt
        part.vy += dy / dist * pull * dt
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
    }
    this.parts = this.parts.filter(part => part.life > 0)
    if (this.parts.length > MAX_PARTICLES) this.parts.splice(0, this.parts.length - MAX_PARTICLES)

    const age = <T extends Timed>(list: T[]): T[] => {
      list.forEach(item => { item.t += dt })
      return list.filter(item => item.t < item.dur)
    }
    this.rings = age(this.rings)
    this.beams = age(this.beams)
    this.flashes = age(this.flashes)
    this.lines = age(this.lines)
    this.cells = age(this.cells)
    this.tags = age(this.tags)
    this.nums = age(this.nums)

    for (const point of this.grid) {
      point.vx += (-point.ox * 190 - point.vx * 9) * dt
      point.vy += (-point.oy * 190 - point.vy * 9) * dt
      point.ox += point.vx * dt
      point.oy += point.vy * dt
    }
    this.shakeAmp *= Math.pow(0.0008, dt)
    this.screenFlash = Math.max(0, this.screenFlash - dt * 1.6)
  }

  // How far the grid has been pushed at one cell, in cells.
  cellOffset(x: number, y: number): Coord {
    const point = this.grid[y * SIZE + x]
    return point ? { x: point.ox, y: point.oy } : { x: 0, y: 0 }
  }

  shakeOffset(): Coord {
    return this.shakeAmp > 0.2 ? { x: rnd(-1, 1) * this.shakeAmp, y: rnd(-1, 1) * this.shakeAmp } : { x: 0, y: 0 }
  }

  draw(ctx: CanvasRenderingContext2D, view: FxView, shake: Coord): void {
    const { origin, cell, dpr } = view
    const busy = this.parts.length || this.rings.length || this.beams.length || this.flashes.length || this.lines.length || this.cells.length
    if (busy) {
      const width = ctx.canvas.width, height = ctx.canvas.height
      if (this.layer.width !== width || this.layer.height !== height) {
        this.layer.width = width
        this.layer.height = height
        this.bloom.width = Math.ceil(width / 4)
        this.bloom.height = Math.ceil(height / 4)
      }
      const fx = this.layer.getContext('2d')
      const glow = this.bloom.getContext('2d')
      if (!fx || !glow) return
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
        const k = Math.min(1, part.life / part.max * 1.6)
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

      // Composite in device pixels: the sharp layer, then a blurred
      // quarter-size copy of it twice for the glow.
      glow.clearRect(0, 0, this.bloom.width, this.bloom.height)
      glow.filter = 'blur(2px)'
      glow.drawImage(this.layer, 0, 0, this.bloom.width, this.bloom.height)
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'lighter'
      ctx.drawImage(this.layer, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.globalAlpha = 0.8
      ctx.drawImage(this.bloom, 0, 0, width, height)
      ctx.drawImage(this.bloom, -8 * dpr, -8 * dpr, width + 16 * dpr, height + 16 * dpr)
      ctx.restore()
    }

    if (this.screenFlash > 0) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = `rgba(255,255,255,${this.screenFlash})`
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      ctx.restore()
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.font = `600 ${Math.max(8, Math.min(12, cell * 0.24))}px "JetBrains Mono", monospace`
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
      ctx.font = `700 ${size}px "JetBrains Mono", monospace`
      ctx.lineWidth = Math.max(3, size * 0.2)
      ctx.strokeStyle = '#050505'
      ctx.strokeText(num.text, x, y)
      ctx.fillStyle = num.color
      ctx.fillText(num.text, x, y)
    }
    ctx.globalAlpha = 1
  }
}
