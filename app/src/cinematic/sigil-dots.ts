// A god's sign as a field of dots: dense on the strokes and thinning with
// distance, the points of the sign joined by hairlines, the whole breathing
// slowly. Nothing here knows about the map. A boss entrance can draw the same
// sign at any size with prepareSigil, scatterSigil and drawSigilDots.

export type SigilCell = [number, number]

export type Sigil = {
  size: number                 // side of the grid, in cells
  cells: SigilCell[]
  links: [number, number][]    // pairs of cell indices joined by a hairline
  depth: Float32Array          // per cell: distance along the strokes from where the sign starts, in cells
  maxDepth: number
  centre: [number, number]     // centre of mass, in cells
}

export type SigilDots = {
  count: number
  x: Float32Array              // cells; (0, 0) is the middle of the top-left cell
  y: Float32Array
  d: Float32Array              // distance to the nearest stroke, in cells
  cell: Int16Array             // the sigil cell whose light this dot follows
  rank: Uint8Array             // RANK_CORE, RANK_STROKE or RANK_DUST
  phase: Float32Array          // 0..1, a private number per dot
}

export const RANK_DUST = 0
export const RANK_STROKE = 1
export const RANK_CORE = 2

// Seconds per cell: how fast the sign is written along its strokes, and how
// fast the light then spreads from a stroke into the dots around it.
export const STROKE_PACE = 0.045
const LIGHT_LAG = 0.04
const LINK_LAG = 0.12

const TAU = Math.PI * 2

// '#' marks a point of the sign. Takes the rows as pasted from the spec.
export function parseSigil(rows: string | string[]): SigilCell[] {
  const lines = (typeof rows === 'string' ? rows.split('\n') : rows).map(row => row.trim()).filter(Boolean)
  const cells: SigilCell[] = []
  lines.forEach((row, y) => [...row].forEach((mark, x) => { if (mark === '#') cells.push([x, y]) }))
  return cells
}

// Which gaps a hairline may cross, nearest first. Touching points are always
// joined. A wider stride is used only where it joins strokes that would
// otherwise stay apart, and the knight's stride is tried before the straight
// gap: a fork reads as a fork only while its two tines are not tied together.
const STRIDES: [number, number][][] = [
  [[1, 0], [0, 1], [1, 1], [1, -1]],
  [[2, 1], [1, 2], [2, -1], [1, -2]],
  [[2, 0], [0, 2]],
  [[2, 2], [2, -2]],
]

export function prepareSigil(cells: SigilCell[], size = 15): Sigil {
  const count = cells.length
  const at = new Map<number, number>()
  const key = (x: number, y: number) => (y + 4) * 64 + x + 4
  cells.forEach(([x, y], i) => at.set(key(x, y), i))

  const group = cells.map((_, i) => i)
  const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])))
  const links: [number, number][] = []
  STRIDES.forEach((strides, stage) => {
    // Decide the whole stage against the strokes as they stood before it, so
    // a symmetric sign gets symmetric lines.
    const found: [number, number][] = []
    cells.forEach(([x, y], a) => {
      for (const [dx, dy] of strides) {
        const b = at.get(key(x + dx, y + dy))
        if (b !== undefined && (stage === 0 || find(a) !== find(b))) found.push([a, b])
      }
    })
    for (const [a, b] of found) { links.push([a, b]); group[find(a)] = find(b) }
  })

  let cx = 0, cy = 0
  for (const [x, y] of cells) { cx += x; cy += y }
  if (count) { cx /= count; cy /= count }

  // Stroke order. Each separate stroke starts at its point nearest the centre
  // of mass, so the sign grows outward from where its god sits.
  const near = cells.map(([x, y]) => Math.hypot(x - cx, y - cy))
  const nearest = count ? Math.min(...near) : 0
  const depth = new Float32Array(count).fill(Infinity)
  const start = new Map<number, number>()
  for (let i = 0; i < count; i++) {
    const g = find(i), held = start.get(g)
    if (held === undefined || near[i] < near[held]) start.set(g, i)
  }
  for (const i of start.values()) depth[i] = near[i] - nearest
  const joined: [number, number][][] = cells.map(() => [])
  for (const [a, b] of links) {
    const length = Math.hypot(cells[a][0] - cells[b][0], cells[a][1] - cells[b][1])
    joined[a].push([b, length])
    joined[b].push([a, length])
  }
  const settled = new Uint8Array(count)
  for (let step = 0; step < count; step++) {
    let next = -1
    for (let i = 0; i < count; i++) if (!settled[i] && (next < 0 || depth[i] < depth[next])) next = i
    settled[next] = 1
    for (const [other, length] of joined[next]) depth[other] = Math.min(depth[other], depth[next] + length)
  }
  let maxDepth = 0
  for (let i = 0; i < count; i++) maxDepth = Math.max(maxDepth, depth[i])

  return { size, cells, links, depth, maxDepth, centre: [cx, cy] }
}

// Distance from a place on the grid to the sign, and the cell that owns the
// nearest piece of stroke.
export function nearestStroke(sigil: Sigil, x: number, y: number): { d: number; cell: number } {
  let best = Infinity, cell = -1
  sigil.cells.forEach(([px, py], i) => {
    const d = (x - px) ** 2 + (y - py) ** 2
    if (d < best) { best = d; cell = i }
  })
  for (const [a, b] of sigil.links) {
    const [ax, ay] = sigil.cells[a], [bx, by] = sigil.cells[b]
    const ux = bx - ax, uy = by - ay
    const along = Math.max(0, Math.min(1, ((x - ax) * ux + (y - ay) * uy) / (ux * ux + uy * uy)))
    const d = (x - ax - along * ux) ** 2 + (y - ay - along * uy) ** 2
    if (d < best) { best = d; cell = along < 0.5 ? a : b }
  }
  return { d: Math.sqrt(best), cell }
}

// Small seeded generator, so a sign is the same dots on every visit.
export function seededRandom(seed: number): () => number {
  let state = (seed * 0x9E3779B1) >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

export type ScatterOptions = {
  sigma?: number    // spread of the dots that sit on a stroke, in cells
  halo?: number     // share of the dots thrown wider, 0..1
  dust?: number     // share scattered anywhere near the sign, 0..1
  seed?: number
}

// The sign as `count` dots: one exactly on each point, most of the rest
// crowded on the strokes, a share thrown wider, a little dust.
export function scatterSigil(sigil: Sigil, count: number, options: ScatterOptions = {}): SigilDots {
  const sigma = options.sigma ?? 0.16
  const random = seededRandom(options.seed ?? 1)
  const cores = Math.min(count, sigil.cells.length)
  const loose = count - cores
  const dustCount = Math.round(loose * (options.dust ?? 0.1))
  const haloCount = Math.round(loose * (options.halo ?? 0.3))
  const strokeCount = loose - dustCount - haloCount

  const dots: SigilDots = {
    count,
    x: new Float32Array(count), y: new Float32Array(count), d: new Float32Array(count),
    cell: new Int16Array(count), rank: new Uint8Array(count), phase: new Float32Array(count),
  }
  let filled = 0
  const put = (x: number, y: number, rank: number) => {
    const edge = sigil.size - 0.5
    dots.x[filled] = Math.max(-0.5, Math.min(edge, x))
    dots.y[filled] = Math.max(-0.5, Math.min(edge, y))
    dots.rank[filled] = rank
    dots.phase[filled] = random()
    filled++
  }
  const gauss = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(TAU * random())

  for (let i = 0; i < cores; i++) put(sigil.cells[i][0], sigil.cells[i][1], RANK_CORE)

  // A point of the sign weighs as much as a cell and a half of line, so the
  // points read as knots on the thread.
  const lengths = sigil.links.map(([a, b]) => Math.hypot(sigil.cells[a][0] - sigil.cells[b][0], sigil.cells[a][1] - sigil.cells[b][1]))
  const pointWeight = 0.9, lineWeight = 0.6
  const total = sigil.cells.length * pointWeight + lengths.reduce((sum, length) => sum + length * lineWeight, 0)
  const onSkeleton = (share: number): [number, number, boolean] => {
    let mark = share * total
    for (const [x, y] of sigil.cells) {
      if (mark < pointWeight) return [x, y, true]
      mark -= pointWeight
    }
    for (let i = 0; i < lengths.length; i++) {
      const weight = lengths[i] * lineWeight
      if (mark < weight || i === lengths.length - 1) {
        const [a, b] = sigil.links[i], along = Math.max(0, Math.min(1, mark / weight))
        return [
          sigil.cells[a][0] + (sigil.cells[b][0] - sigil.cells[a][0]) * along,
          sigil.cells[a][1] + (sigil.cells[b][1] - sigil.cells[a][1]) * along,
          false,
        ]
      }
      mark -= weight
    }
    const [x, y] = sigil.cells[sigil.cells.length - 1] ?? [0, 0]
    return [x, y, true]
  }
  // Stratified along the skeleton so every stroke gets its share.
  const crowd = (amount: number, spread: number) => {
    for (let i = 0; i < amount; i++) {
      const [x, y, knot] = onSkeleton((i + random()) / amount)
      const reach = spread * (knot ? 1.3 : 1)
      put(x + gauss() * reach, y + gauss() * reach, RANK_STROKE)
    }
  }
  if (sigil.cells.length) {
    crowd(strokeCount, sigma)
    crowd(haloCount, sigma * 3.4)
  }

  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
  for (const [x, y] of sigil.cells) {
    left = Math.min(left, x); right = Math.max(right, x)
    top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  while (filled < count) {
    put(left - 1.5 + random() * (right - left + 3), top - 1.5 + random() * (bottom - top + 3), RANK_DUST)
  }

  for (let i = 0; i < count; i++) {
    if (dots.rank[i] === RANK_CORE) { dots.d[i] = 0; dots.cell[i] = i; continue }
    const { d, cell } = nearestStroke(sigil, dots.x[i], dots.y[i])
    dots.d[i] = d
    dots.cell[i] = cell
  }
  return dots
}

// Radius multiplier for the slow breath. The swell runs outward from the
// strokes at about one cell per second.
export function breath(time: number, period: number, d: number, amount = 0.06): number {
  return period > 0 ? 1 + amount * Math.sin(TAU * time / period - 0.9 * d) : 1
}

// How lit a point is `since` seconds after it was struck: nothing before,
// about 1.4 at 80 ms, settling to 1. It only ever rises once.
export function ignition(since: number): number {
  if (since <= 0) return 0
  if (since > 3) return 1
  return Math.min(1, since / 0.08) * (1 + 0.5 * Math.exp(-since / 0.35))
}

// A slow field the dots sway on: neighbours move together, periods of 9 and
// 8 seconds that never line up. Each returns -1..1; scale by the px allowed.
export function driftX(x: number, y: number, time: number): number {
  return 0.7 * Math.sin(TAU * time / 9.1 + 0.33 * x + 0.9 * Math.sin(0.21 * y))
}
export function driftY(x: number, y: number, time: number): number {
  return 0.7 * Math.sin(TAU * time / 7.7 + 0.29 * y + 0.9 * Math.cos(0.26 * x))
}

// One dot. Below a pixel a square and a circle are the same thing, and the
// square is far cheaper.
export function fillDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (r < 0.62) { ctx.fillRect(x - r, y - r, r * 2, r * 2); return }
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
}

const glows = new Map<string, HTMLCanvasElement>()

// A soft round halo in one colour, drawn once and stamped wherever a point is lit.
export function glowSprite(colour: string): HTMLCanvasElement {
  const held = glows.get(colour)
  if (held) return held
  const sprite = document.createElement('canvas')
  sprite.width = sprite.height = 64
  const g = sprite.getContext('2d')
  if (g) {
    const fall = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    const stops: [number, number][] = [[0, 1], [0.12, 0.62], [0.3, 0.26], [0.6, 0.07], [1, 0]]
    for (const [where, alpha] of stops) fall.addColorStop(where, withAlpha(colour, alpha))
    g.fillStyle = fall
    g.fillRect(0, 0, 64, 64)
  }
  glows.set(colour, sprite)
  return sprite
}

// '#rrggbb' and an alpha as an rgba() string.
export function withAlpha(colour: string, alpha: number): string {
  const value = parseInt(colour.slice(1), 16)
  return `rgba(${value >> 16 & 255}, ${value >> 8 & 255}, ${value & 255}, ${alpha})`
}

export type SigilDraw = {
  x: number                    // where the middle of the grid goes, px
  y: number
  cell: number                 // px per grid cell
  rotation?: number            // radians, clockwise on screen
  hue: string                  // '#rrggbb': the dots around the sign
  core?: string                // the lit strokes themselves; defaults to the hue
  time: number                 // seconds on any steady clock
  // Seconds since the sign began to be written (each point then lights in
  // stroke order), or one figure per cell for a sign lit in parts (zero or
  // less: not lit). Leave out for a sign that is simply lit.
  lit?: number | ArrayLike<number>
  ghost?: number               // how much of an unlit stroke shows, 0..1
  alpha?: number               // the whole sign, 0..1
  dot?: number                 // radius of an ordinary dot, px
  breath?: number              // period in seconds; 0 holds still
  drift?: number               // px each dot may wander; 0 holds still
  glow?: number                // strength of the halo on lit points, 0..1
}

let scratch = new Float32Array(64)

// Draws the sign with additive dots. The caller owns clearing and transforms;
// the context's state is restored on return.
export function drawSigilDots(ctx: CanvasRenderingContext2D, sigil: Sigil, dots: SigilDots, o: SigilDraw): void {
  const alpha = o.alpha ?? 1
  if (alpha <= 0.004) return
  const cells = sigil.cells.length
  if (scratch.length < cells) scratch = new Float32Array(cells)
  const since = scratch
  for (let c = 0; c < cells; c++) {
    since[c] = o.lit === undefined ? 99 : typeof o.lit === 'number' ? o.lit - STROKE_PACE * sigil.depth[c] : o.lit[c]
  }
  const ghost = o.ghost ?? 0.3
  const core = o.core ?? o.hue
  const dot = o.dot ?? o.cell * 0.075
  const period = o.breath ?? 6
  const wander = o.drift ?? 0
  const glow = o.glow ?? 1
  const mid = (sigil.size - 1) / 2
  const turn = o.rotation ?? 0
  const cos = Math.cos(turn) * o.cell, sin = Math.sin(turn) * o.cell

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  // Hairlines between neighbouring points, a moment after both ends are lit.
  ctx.lineWidth = 1
  ctx.lineCap = 'round'
  for (const [a, b] of sigil.links) {
    const level = Math.min(1, ignition(Math.min(since[a], since[b]) - LINK_LAG))
    const [ax, ay] = sigil.cells[a], [bx, by] = sigil.cells[b]
    ctx.globalAlpha = alpha * (0.16 * ghost + (0.46 - 0.16 * ghost) * level)
    ctx.strokeStyle = level > 0.5 ? core : o.hue
    ctx.beginPath()
    ctx.moveTo(o.x + (ax - mid) * cos - (ay - mid) * sin, o.y + (ax - mid) * sin + (ay - mid) * cos)
    ctx.lineTo(o.x + (bx - mid) * cos - (by - mid) * sin, o.y + (bx - mid) * sin + (by - mid) * cos)
    ctx.stroke()
  }

  let ink = ''
  for (let i = 0; i < dots.count; i++) {
    const d = dots.d[i], rank = dots.rank[i]
    const level = ignition(since[dots.cell[i]] - LIGHT_LAG * d)
    const on = level > 1 ? 1 : level
    const weight = rank === RANK_CORE ? 1 : 0.2 + 0.8 * Math.exp(-(d * d) / 0.22)
    const a = alpha * weight * (ghost + (1 - ghost) * on) * (level > 1 ? level : 1)
    if (a < 0.012) continue
    let r = dot * (rank === RANK_CORE ? 2.5 : 0.7 + 0.75 * Math.exp(-(d * d) / 0.12)) * (1 + 0.18 * on)
    if (period > 0) r *= breath(o.time, period, d)
    const gx = dots.x[i], gy = dots.y[i]
    let x = o.x + (gx - mid) * cos - (gy - mid) * sin
    let y = o.y + (gx - mid) * sin + (gy - mid) * cos
    if (wander > 0) {
      x += wander * driftX(gx, gy, o.time)
      y += wander * driftY(gx, gy, o.time)
    }
    const colour = on > 0.5 && d < 0.14 ? core : o.hue
    if (colour !== ink) { ink = colour; ctx.fillStyle = colour }
    ctx.globalAlpha = a > 1 ? 1 : a
    fillDot(ctx, x, y, r)
  }

  // The lit points carry a halo.
  if (glow > 0) {
    const sprite = glowSprite(core)
    const reach = dot * 11
    for (let c = 0; c < cells; c++) {
      const level = ignition(since[c])
      if (level <= 0) continue
      const [gx, gy] = sigil.cells[c]
      ctx.globalAlpha = Math.min(1, alpha * glow * 0.3 * level)
      ctx.drawImage(
        sprite,
        o.x + (gx - mid) * cos - (gy - mid) * sin - reach,
        o.y + (gx - mid) * sin + (gy - mid) * cos - reach,
        reach * 2, reach * 2,
      )
    }
  }
  ctx.restore()
}
