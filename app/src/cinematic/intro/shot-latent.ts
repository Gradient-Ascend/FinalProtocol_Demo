// Movement 4: representation space. The three rows tilt back, lie down and
// dissolve into a field of points. A block of it goes dark; guesses arrive
// along arcs where the missing points would be, wrong at first, and the
// distance to what was hidden falls. The hidden points return beneath them.
// Then everything goes flat (error 0.000: a constant predicts itself
// perfectly), and refuses to stay flat. Then the long pull-back: the field
// runs to the horizon, hundreds of blocks are being filled, and there are
// three that nothing approaches. Seen from above they are petals around a
// centre.
//
// The surface is a formula (point-field.ts `wave`), not a projection of any
// model's activations: the subtitle says so. What is measured on screen is
// measured: the read-out is the mean distance between the guesses drawn and
// the points they are guesses of, and the counts are counts.
import { clamp01, easeInOutCubic, lerp, pullBack, span, stepped } from '../display'
import { jitteredGrid, mulberry32, sheetSide, wave, type Camera } from '../point-field'
import { BAND_COUNTS, WHITE, BLUE, bandCell, bandValues, count, drawBandRow, font, type Frame, type Layout } from './common'
import { movement } from './data'
import { PLAN } from './plan'

const P = PLAN.latent
const HUD = movement('latent').hud
const [WR, WG, WB] = WHITE.split(',').map(Number)
const [BR, BG, BB] = BLUE.split(',').map(Number)

// --- the world ---
const NEAR = { x0: -6, x1: 6, z0: -7, z1: 3 }             // the first sheet: what the three rows become
const MID = 24, FAR = 130                                 // half-sizes of the two sheets beyond it
const BLOCK0 = { x0: -1.9, x1: 1.9, z0: -2.2, z1: 1.0 }   // the block that is masked in front of us
const ROW_Z = [-3.4, -1.2, 0.9]                           // where each row lies down on the floor

// --- the camera ---
const D0 = 6, ZOOM = 30
const PUSH = 0.006                                        // per second, toward the field, before the pull-back
const FOG = 1.6, FOG_WIDE = 0.9                           // how soon distance takes the points, close and wide

// --- guesses ---
const E0 = 1.0, TAU = 1.3                                 // first error of a block's guesses, and how fast it falls
const SIZE = 0.0128                                       // a point's diameter in world units, up close
// A small screen has about a third of the points and would show each at half the width, which reads as dust:
// there a point is drawn this many times wider, about the width it has on a desk, so the wave has body.
const SMALL_BODY = 2.1
const GUESS = 1.05                                        // brightness of a guess: a little over a context point's best

// Three places nothing approaches. The outline is the petal of the map between battles:
// a wedge out of the centre, widest two thirds of the way, a round end.
const PETAL = { gap: 12, length: 40, half: 11, rise: 0.95, fall: 0.58 }
const PETAL_PEAK = (PETAL.rise / (PETAL.rise + PETAL.fall)) ** PETAL.rise * (PETAL.fall / (PETAL.rise + PETAL.fall)) ** PETAL.fall
const AXES = [0, 1, 2].map(i => { const a = -Math.PI / 2 + i * 2 * Math.PI / 3; return [Math.cos(a), Math.sin(a)] })   // x, z: the first points away from us

function inPetal(x: number, z: number, margin = 0): boolean {
  for (const [ax, az] of AXES) {
    const out = x * ax + z * az - PETAL.gap
    if (out < -margin || out > PETAL.length + margin) continue
    const along = Math.min(0.985, Math.max(0.015, out / PETAL.length))
    const half = PETAL.half * along ** PETAL.rise * (1 - along) ** PETAL.fall / PETAL_PEAK
    if (Math.abs(x * az - z * ax) <= half + margin) return true
  }
  return false
}

type Block = {
  x0: number; x1: number; z0: number; z1: number
  start: number              // when its guesses begin to leave
  spread: number             // seconds between its first and last departure
  flight: number
  lift: number               // height of the arcs
  filled: number             // when the last guess has landed
  seen: number               // when it is first counted as masked
}

type Sheet = {
  n: number
  spacing: number            // world distance between neighbours
  x: Float32Array; z: Float32Array
  rank: Float32Array         // ascending: a thinned view of the sheet is a prefix of it
  edge: Float32Array         // fades the sheet out toward its outer border
  block: Int16Array          // index into blocks, or -1 for context
  noise: Float32Array        // -1..1: how wrong this point's guess is, times the block's error
  fx: Float32Array; fz: Float32Array      // where the guess leaves from: the lit edge of the block
  delay: Float32Array        // 0..1 of the block's spread
  arc: Float32Array          // 0.6..1.4 of the block's lift
}

type World = {
  side: number
  sheets: Sheet[]
  blocks: Block[]
  s0: number                 // spacing of the first sheet
  grow: number               // exponent: how the spacing wanted grows with distance
  // the first sheet only: which cell of which row each point comes out of
  row: Uint8Array
  cell: Uint16Array
  cu: Float32Array; cv: Float32Array
  wait: Float32Array
}

function buildWorld(side: number): World {
  const rnd = mulberry32(3)
  const blocks: Block[] = []
  const s0 = Math.sqrt((NEAR.x1 - NEAR.x0) * (NEAR.z1 - NEAR.z0)) / side
  const s1 = s0 * 4.2, s2 = s0 * 15

  // --- blocks ---
  blocks.push({ ...BLOCK0, start: P.predict, spread: 2.6, flight: 1.1, lift: 0.55, filled: P.predict + 2.6 + 1.1 + 0.4, seen: P.mask })
  const lattice = (half: number, pitch: number, skip: (x: number, z: number) => boolean, first: number, range: number, spread: number, flight: number) => {
    const n = Math.round(2 * half / pitch), index = new Int16Array(n * n).fill(-1)
    pitch = 2 * half / n
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        // I-JEPA's proportions: each block about a fifth of the area around it, aspect 0.75 to 1.5
        const w = pitch * (0.44 + 0.12 * rnd()), h = pitch * (0.36 + 0.12 * rnd())
        const cx = -half + (i + 0.5) * pitch + (rnd() - 0.5) * (pitch - w) * 0.8
        const cz = -half + (j + 0.5) * pitch + (rnd() - 0.5) * (pitch - h) * 0.8
        if (skip(cx, cz)) continue
        let touches = false
        for (let a = -1; a <= 1 && !touches; a++) for (let b = -1; b <= 1; b++) if (inPetal(cx + a * w / 2, cz + b * h / 2, pitch * 0.22)) { touches = true; break }
        if (touches) continue
        const far = clamp01(Math.hypot(cx, cz) / (half * 1.2))
        const start = P.pull + first + range * far + 0.3 * rnd()
        index[j * n + i] = blocks.length
        blocks.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - h / 2, z1: cz + h / 2, start, spread, flight, lift: pitch * 0.16, filled: start + spread + flight, seen: start - 0.9 })
      }
    }
    return { n, pitch, half, index }
  }
  const mid = lattice(MID, 6, (x, z) => x > NEAR.x0 - 3.6 && x < NEAR.x1 + 3.6 && z > NEAR.z0 - 3.6 && z < NEAR.z1 + 3.6, 1.5, 1.3, 0.8, 0.9)
  const far = lattice(FAR, 16, (x, z) => Math.abs(x) < MID + 8.5 && Math.abs(z) < MID + 8.5, 2.6, 1.7, 0.6, 0.8)

  // --- points ---
  // A wide view shows only a share of a sheet, and that share has to be as even as the whole.
  // So the ranks are a pyramid: of every 2 x 2 cells of the grid one point is kept at the next
  // level up, of every 2 x 2 of those one again, and a point's rank falls with the level it reaches.
  const pyramid = (cells: number[], side: number, count: number): Float32Array => {
    const level = new Uint8Array(count)
    let size = side, cur = new Int32Array(side * side).fill(-1)
    cells.forEach((cell, i) => { cur[cell] = i })
    for (let l = 1; size > 1; l++) {
      const half = Math.ceil(size / 2), next = new Int32Array(half * half).fill(-1)
      for (let j = 0; j < half; j++) {
        for (let i = 0; i < half; i++) {
          const found: number[] = []
          for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
            const x = 2 * i + a, y = 2 * j + b
            if (x < size && y < size && cur[y * size + x] >= 0) found.push(cur[y * size + x])
          }
          if (!found.length) continue
          const pick = found[Math.floor(rnd() * found.length)]
          next[j * half + i] = pick
          level[pick] = l
        }
      }
      cur = next; size = half
    }
    return Float32Array.from(level, l => 4 ** -(l + 1) * (1 + 3 * rnd()))
  }
  const sheet = (xs: number[], zs: number[], cells: number[], side: number, spacing: number, find: (x: number, z: number) => number, edgeOf: (x: number, z: number) => number): Sheet => {
    const n = xs.length
    const order = Array.from({ length: n }, (_, i) => i), ranks = pyramid(cells, side, n)
    order.sort((a, b) => ranks[a] - ranks[b])
    const s: Sheet = {
      n, spacing, x: new Float32Array(n), z: new Float32Array(n), rank: new Float32Array(n), edge: new Float32Array(n),
      block: new Int16Array(n), noise: new Float32Array(n), fx: new Float32Array(n), fz: new Float32Array(n),
      delay: new Float32Array(n), arc: new Float32Array(n),
    }
    order.forEach((from, i) => {
      const x = xs[from], z = zs[from], b = find(x, z)
      s.x[i] = x; s.z[i] = z; s.rank[i] = ranks[from]; s.edge[i] = edgeOf(x, z); s.block[i] = b
      if (b < 0) return
      // A guess leaves the nearest lit edge of its block; the middle of the block is reached last.
      const k = blocks[b], dl = x - k.x0, dr = k.x1 - x, dn = z - k.z0, df = k.z1 - z
      const near = Math.min(dl, dr, dn, df), out = 0.12 * (k.x1 - k.x0) * (0.3 + rnd())
      const jx = (rnd() - 0.5) * 0.3 * (k.x1 - k.x0), jz = (rnd() - 0.5) * 0.3 * (k.z1 - k.z0)
      if (near === dl || near === dr) { s.fx[i] = near === dl ? k.x0 - out : k.x1 + out; s.fz[i] = z + jz }
      else { s.fx[i] = x + jx; s.fz[i] = near === dn ? k.z0 - out : k.z1 + out }
      s.delay[i] = clamp01(0.85 * near / (0.5 * Math.min(k.x1 - k.x0, k.z1 - k.z0)) + 0.15 * rnd())
      s.noise[i] = rnd() * 2 - 1
      s.arc[i] = 0.6 + 0.8 * rnd()
    })
    return s
  }
  const inBlock = (b: number, x: number, z: number) => (b >= 0 && x >= blocks[b].x0 && x <= blocks[b].x1 && z >= blocks[b].z0 && z <= blocks[b].z1 ? b : -1)
  const inLattice = (l: { n: number; pitch: number; half: number; index: Int16Array }) => (x: number, z: number) => {
    const i = Math.floor((x + l.half) / l.pitch), j = Math.floor((z + l.half) / l.pitch)
    return i < 0 || j < 0 || i >= l.n || j >= l.n ? -1 : inBlock(l.index[j * l.n + i], x, z)
  }

  // the first sheet: every point of the grid, row by row from far to near
  const grid = jitteredGrid(side, 1, 0.35, rnd)
  const xs: number[] = [], zs: number[] = []
  for (let i = 0; i < side * side; i++) {
    xs.push(lerp(NEAR.x0, NEAR.x1, (grid[i * 2] + 1) / 2))
    zs.push(lerp(NEAR.z0, NEAR.z1, (grid[i * 2 + 1] + 1) / 2))
  }
  const near = sheet(xs, zs, xs.map((_, i) => i), side, s0, (x, z) => inBlock(0, x, z), () => 1)

  const beyond = (half: number, spacing: number, inner: (x: number, z: number) => boolean) => {
    const n = Math.round(2 * half / spacing), g = jitteredGrid(n, half, 0.4, rnd)
    const ax: number[] = [], az: number[] = [], cells: number[] = []
    for (let i = 0; i < n * n; i++) {
      const x = g[i * 2], z = g[i * 2 + 1]
      if (inner(x, z) || inPetal(x, z)) continue
      ax.push(x); az.push(z); cells.push(i)
    }
    return { ax, az, cells, n }
  }
  const a = beyond(MID, s1, (x, z) => x >= NEAR.x0 && x <= NEAR.x1 && z >= NEAR.z0 && z <= NEAR.z1)
  const b = beyond(FAR, s2, (x, z) => Math.abs(x) <= MID && Math.abs(z) <= MID)
  const fade = (x: number, z: number) => clamp01((FAR - Math.max(Math.abs(x), Math.abs(z))) / 34)
  const sheets = [near, sheet(a.ax, a.az, a.cells, a.n, s1, inLattice(mid), () => 1), sheet(b.ax, b.az, b.cells, b.n, s2, inLattice(far), fade)]

  // Which cell of which row each point of the first sheet comes out of: the far third
  // of the sheet out of the row of text, the middle out of the patches, the near third out of the sound.
  const n = near.n
  const world: World = {
    side, sheets, blocks, s0, grow: Math.log(s2 / s0) / Math.log(ZOOM),
    row: new Uint8Array(n), cell: new Uint16Array(n), cu: new Float32Array(n), cv: new Float32Array(n), wait: new Float32Array(n),
  }
  for (let i = 0; i < n; i++) {
    const row = Math.min(2, Math.floor(3 * (near.z[i] - NEAR.z0) / (NEAR.z1 - NEAR.z0)))
    const u = clamp01((near.x[i] - NEAR.x0) / (NEAR.x1 - NEAR.x0) + (rnd() - 0.5) * 0.01)
    world.row[i] = row
    world.cell[i] = Math.min(BAND_COUNTS[row] - 1, Math.floor(u * BAND_COUNTS[row]))
    world.cu[i] = rnd(); world.cv[i] = rnd(); world.wait[i] = rnd()
  }
  return world
}

type View = { camera: Camera; spacing: number; fog: number; near: number; size: number; wide: number; body: number }

export class LatentShot {
  private world: World | null = null
  // where each point of the first sheet starts: its place in the band, as a point in the scene
  private px = new Float32Array(0)
  private py = new Float32Array(0)
  private pz = new Float32Array(0)
  private pv = new Float32Array(0)
  private laidFor = ''
  private readonly at = { x: 0, y: 0 }
  private readonly to = { x: 0, y: 0 }
  // totals of the frame being drawn, for the read-out
  private landed = 0
  private off = 0
  private points = 0         // how many points of the first sheet were drawn: fewer than it holds when `share` is under 1
  // A machine that cannot keep up is shown a share of the points, each a little larger.
  private share = 1
  private cost = 0

  private pace(ms: number, dt: number): void {
    if (dt > 0.2) return                                   // a seek or a stall says nothing about this machine
    this.cost += (ms - this.cost) * 0.08
    if (this.cost > 13 && this.share > 0.3) { this.share /= 2; this.cost = 0 }
  }

  /** Time in the world: it stops while everything is flat. */
  private worldTime(t: number, reduced: boolean): number {
    const wt = t < P.flat ? t : t < P.rise ? P.flat : P.flat + (t - P.rise)
    return (wt - P.start) * (reduced ? 0.3 : 1)
  }

  private amp(t: number, reduced: boolean): number {
    const ease = (k: number) => (reduced ? stepped(k) : easeInOutCubic(k))
    const arrive = ease(span(t, P.start + 2.0, 2.4))
    const flat = ease(span(t, P.collapse, P.flat - P.collapse))
    const back = ease(span(t, P.rise, P.risen - P.rise))
    return arrive * (1 - flat + back * flat)
  }

  private view(f: Frame, t: number, wide: boolean | null): View {
    const world = this.world as World
    const portrait = f.h > f.w * 1.15
    const pushed = f.reduced ? D0 : D0 * Math.exp(-PUSH * (Math.min(this.worldTime(t, false), P.pull - P.start - (P.rise - P.flat))))
    const k = wide === null ? span(t, P.pull, P.wide - P.pull) : wide ? 1 : 0
    const e = easeInOutCubic(k)
    const distance = pullBack(pushed, pushed * ZOOM, k)
    const tilt = easeInOutCubic(span(k, 0.35, 0.65))
    // It turns a little as it goes, comes level for the wide view, and never quite stops.
    const drift = f.reduced ? 0 : 0.014 * this.worldTime(Math.min(t, P.pull), false) * (1 - e) + 0.004 * Math.max(0, t - P.wide)
    const camera: Camera = {
      yaw: drift,
      pitch: lerp(portrait ? 0.44 : 0.3, portrait ? 1.0 : 1.2, tilt),
      distance,
      tx: 0, ty: 0, tz: lerp(-0.4, portrait ? -6 : 0, e),
      focal: 1.15,
      cx: 0.5, cy: lerp(0.48, portrait ? 0.4 : 0.41, e),
    }
    const spacing = world.s0 * (distance / pushed) ** world.grow
    const body = Math.min(f.w, f.h) < 600 ? SMALL_BODY : 1
    // A point keeps its size on screen as the view widens: there are fewer of them per unit of ground, not smaller ones.
    return { camera, spacing, fog: lerp(FOG, FOG_WIDE, e) / distance, near: 0.8 * distance, size: SIZE * body * distance / pushed, wide: e, body }
  }

  /** The sheets and their blocks are laid out once, in the dark of shot 0: tens of thousands of points. */
  prepare(w: number, h: number): void {
    const side = sheetSide(w, h)
    if (!this.world || this.world.side !== side) { this.world = buildWorld(side); this.laidFor = '' }
  }

  // Each point of the first sheet starts inside a cell of the band. Found once per layout,
  // by asking the camera where that pixel is at the depth of the field.
  private lay(f: Frame, L: Layout): void {
    this.prepare(f.w, f.h)
    if (!this.world) return
    const key = `${f.w}x${f.h}`
    if (this.laidFor === key) return
    this.laidFor = key
    const world = this.world, n = world.sheets[0].n
    if (this.px.length !== n) { this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n); this.pv = new Float32Array(n) }
    f.field.aim(this.view(f, P.start, false).camera)
    const out = { x: 0, y: 0, z: 0 }
    for (let i = 0; i < n; i++) {
      const row = world.row[i], c = bandCell(L, row, world.cell[i])
      f.field.unproject(c.x + world.cu[i] * c.w, L.band.y[row] + world.cv[i] * L.band.rowH, D0, out)
      this.px[i] = out.x; this.py[i] = out.y; this.pz[i] = out.z
      this.pv[i] = bandValues[row][world.cell[i]]
    }
  }

  draw(f: Frame, L: Layout): void {
    this.lay(f, L)
    const { ctx, t } = f
    const world = this.world as World

    const out = 1 - span(t, P.end - 1.1, 1.0)
    const began = performance.now()
    f.field.clear()
    this.landed = 0; this.off = 0
    if (f.reduced && t >= P.pull) {
      // no pull-back: the wide view arrives by cross-fade
      const k = easeInOutCubic(span(t, P.pull + 2.2, 1.6))
      if (k < 1) this.render(f, this.view(f, t, false), 1 - k, true)
      if (k > 0) this.render(f, this.view(f, t, true), k, k >= 1)
    } else {
      this.render(f, this.view(f, t, null), 1, true)
    }
    f.field.end(ctx, out, 0.7)
    this.pace(performance.now() - began, f.dt)

    this.outline(f, out)

    // the words below need the dark: the nearest part of the field goes under it
    const shade = f.reduced ? span(t, P.start + 0.3, 1.2) : span(t, P.start + 1.2, 2.2)
    if (shade > 0) {
      const from = f.h * 0.62, to = f.h * 0.82
      const g = ctx.createLinearGradient(0, from, 0, to)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, `rgba(0,0,0,${(0.94 * shade).toFixed(3)})`)
      ctx.fillStyle = g
      ctx.fillRect(0, from, f.w, f.h - from)
    }

    // the three rows as they were left, letting go
    const rows = 1 - span(t, P.start + 0.1, f.reduced ? 1.6 : 0.55)
    if (rows > 0) for (let r = 0; r < 3; r++) drawBandRow(f, L, r, rows)

    // --- read-out ---
    if (t < P.mask - 0.3) {
      f.hud.push({ text: `${count(this.points)} points`, alpha: 0.7 * span(t, P.start + 2.4, 1) })
    } else {
      const error = this.landed ? (this.off / this.landed).toFixed(3) : '—'
      let masked = 0, filled = 0
      for (const b of world.blocks) { if (t >= b.seen) masked++; if (t >= b.filled) filled++ }
      if (t >= P.pull + 2.6) masked += 3                     // the three come into view with the rest
      f.hud.push({ text: HUD.replace('{error}', error) })
      f.hud.push({ text: `masked ${count(masked)} · filled ${count(filled)}`, alpha: 0.7 })
    }
    f.hudAlpha = out
  }

  /** Add every point as seen by one view. `tally` is false for the fading half of a cross-fade, so nothing is counted twice. */
  private render(f: Frame, view: View, weight: number, tally: boolean): void {
    const world = this.world as World, field = f.field, t = f.t
    field.aim(view.camera)
    const sp = view.spacing, fog = view.fog, lift = Math.exp(fog * view.near) * weight
    const s1 = world.sheets[1].spacing, s2 = world.sheets[2].spacing
    const amp = this.amp(t, f.reduced), time = this.worldTime(t, f.reduced)
    const size = view.size / Math.sqrt(this.share), floor = lerp(0.42, 0.6, view.wide)

    // One surface for every sheet. Up close it is the fine wave; as the view widens,
    // slower and larger swells of the same formula take over.
    const w0 = 1 - 0.8 * span(sp, 0.5 * s1, 0.5 * s1)
    const w1 = span(sp, 0.3 * s1, 0.5 * s1) * (1 - span(sp, 0.5 * s2, 0.5 * s2))
    const w2 = span(sp, 0.3 * s2, 0.4 * s2)
    const scale = w0 + 4 * w1 + 14 * w2
    const height = (x: number, z: number) =>
      amp * ((w0 > 0.01 ? w0 * wave(x, z, time) : 0)
        + (w1 > 0.01 ? w1 * 4 * wave(x / 4 + 3.1, z / 4 - 1.7, 0.6 * time) : 0)
        + (w2 > 0.01 ? w2 * 14 * wave(x / 14 - 0.7, z / 14 + 2.3, 0.4 * time) : 0))

    // --- the first sheet arriving out of the band ---
    const arriving = t < P.settled + 0.8
    const tiltK = f.reduced ? 1 : easeInOutCubic(span(t, P.start + 0.35, 1.7))
    const appear = f.reduced ? span(t, P.start + 0.4, 1.8) : span(t, P.start, 0.45)

    // --- block 0 ---
    const maskK = easeInOutCubic(span(t, P.mask, P.masked - P.mask))
    const back = 0.42 * easeInOutCubic(span(t, P.targets, P.met - P.targets))

    for (let s = 0; s < 3; s++) {
      const sheet = world.sheets[s]
      // the sheets beyond the first are there from the moment the view begins to widen
      const show = s === 0 ? 1 : s === 1 ? span(sp, 1.03 * world.s0, 0.5 * world.s0) : span(sp, 1.15 * world.s0, 1.3 * world.s0)
      if (show <= 0.003) continue
      const keep = Math.min(1, (sheet.spacing / sp) ** 2) * this.share    // the share of this sheet the view has room for
      const soft = 0.3 * keep
      const { x: xs, z: zs, rank, edge, block, noise, fx, fz, delay, arc } = sheet
      let i = 0
      for (; i < sheet.n; i++) {
        if (rank[i] >= keep) break
        const thin = keep >= 1 ? 1 : clamp01((keep - rank[i]) / soft)
        let x = xs[i], z = zs[i]
        let y = height(x, z)
        const base = show * thin * edge[i] * lift
        const glint = clamp01(floor + 0.5 * y / scale)
        const b = block[i]

        if (s === 0 && arriving) {
          // out of its cell, down onto the floor with its row, then out to its place in the sheet
          const k = f.reduced ? 1 : easeInOutCubic(clamp01((t - P.start - 1.5 - world.wait[i] * 0.7) / 2.2))
          if (k < 1) {
            const row = world.row[i]
            const my = lerp(this.py[i], 0, tiltK), mz = lerp(this.pz[i], ROW_Z[row] + (world.cv[i] - 0.5) * 0.14, tiltK)
            x = lerp(this.px[i], x, k); y = lerp(my, y, k); z = lerp(mz, z, k)
            // packed into its cell the points overlap: each carries a share of the cell's light, not all of it
            // (and a wider point a smaller share, so the rows it leaves are no brighter for it)
            const a = lerp(this.pv[i] * 0.4 / (view.body * view.body), glint, k) * appear * weight * Math.exp(k * fog * view.near)
            field.add(x, y, z, size, WR, WG, WB, a * (b === 0 ? 1 - maskK : 1), fog * k)
            continue
          }
        }

        if (b < 0) {
          field.add(x, y, z, size, WR, WG, WB, glint * base * (s === 0 ? appear : 1), fog)
          continue
        }

        // --- a point inside a block: what was there, and the guess at it ---
        if (b === 0) {
          const there = (1 - maskK) * glint * appear + back
          if (there > 0.004) field.add(x, y, z, size, WR, WG, WB, there * base, fog)
        }
        const k = world.blocks[b]
        const since = t - k.start - delay[i] * k.spread
        if (since <= 0) continue
        const error = E0 * Math.exp(-(t - k.start) / TAU) * noise[i] * amp
        const p = since / k.flight
        if (p >= 1) {
          if (tally) { this.landed++; this.off += Math.abs(error) }
          const flash = 1 + 0.9 * (1 - span(since, k.flight, 0.16))
          field.add(x, y + error, z, size * (1 + 0.25 * (flash - 1)), BR, BG, BB, GUESS * base * flash, fog)
          if (s === 0 && Math.abs(error) > 0.012 && sp <= world.s0 * 1.02) this.hair(f, x, y, y + error, z, 0.3 * weight)
        } else if (f.reduced) {
          field.add(x, y + error, z, size, BR, BG, BB, GUESS * base * stepped(p), fog)
        } else {
          const e = easeInOutCubic(p)
          const from = s === 0 ? height(fx[i], fz[i]) : y
          field.add(lerp(fx[i], x, e), lerp(from, y + error, e) + k.lift * arc[i] * Math.sin(Math.PI * e), lerp(fz[i], z, e),
            size, BR, BG, BB, GUESS * base * (0.35 + 0.65 * e), fog)
        }
      }
      if (s === 0 && tally) this.points = i                  // what the read-out counts: the points drawn, not the points there are
    }
  }

  // A hairline from a guess to the point it is a guess of: the error, drawn.
  private hair(f: Frame, x: number, y: number, guess: number, z: number, a: number): void {
    if (!f.field.project(x, y, z, this.at) || !f.field.project(x, guess, z, this.to)) return
    f.field.hairline(this.at.x, this.at.y, this.to.y, BR, BG, BB, a)
  }

  // The masked block's border on the floor, and its name. Up close only.
  private outline(f: Frame, fade: number): void {
    const { ctx, t } = f
    const a = span(t, P.mask, 0.6) * (1 - span(t, P.targets + 0.4, 1.2)) * fade
    if (a <= 0.01) return
    const field = f.field
    field.aim(this.view(f, t, f.reduced ? false : null).camera)
    const corners = [[BLOCK0.x0, BLOCK0.z0], [BLOCK0.x1, BLOCK0.z0], [BLOCK0.x1, BLOCK0.z1], [BLOCK0.x0, BLOCK0.z1]]
    const pts: { x: number; y: number }[] = []
    for (const [x, z] of corners) {
      const p = { x: 0, y: 0 }
      if (!field.project(x, 0, z, p)) return
      pts.push(p)
    }
    // A dotted border, laid as small rectangles. (A stroked dashed path here, by setLineDash or by hand,
    // took Chrome's rasteriser about 60 ms a frame at this size; rectangles cost nothing.)
    ctx.fillStyle = `rgba(${WHITE},${(0.5 * a).toFixed(3)})`
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length]
      const length = Math.hypot(q.x - p.x, q.y - p.y), ux = (q.x - p.x) / length, uy = (q.y - p.y) / length
      for (let d = 0; d < length; d += 7) ctx.fillRect(Math.round(p.x + ux * d), Math.round(p.y + uy * d), 2, 1)
    })
    ctx.font = font(10)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = `rgba(${WHITE},${(0.55 * a).toFixed(3)})`
    ctx.fillText('MASK', pts[0].x + 2, pts[0].y - 7)
  }
}
