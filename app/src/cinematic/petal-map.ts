// The map between battles: three petals around a small empty centre. Each
// petal is a field of dots laid out like a seed head inside a petal outline,
// and over it the same dots crowd onto the strokes of its god's sign, so a
// petal reads as a petal first and as a sign when looked at. Quiet almost all
// of the time: the dots sway within a pixel or two and breathe.

import {
  breath, driftX, driftY, drawSigilDots, fillDot, glowSprite, ignition, nearestStroke,
  prepareSigil, scatterSigil, seededRandom, STROKE_PACE, withAlpha,
  type Sigil, type SigilDots,
} from './sigil-dots'

export type PetalNode = {
  id: string
  name: string
  kind: 'skirmish' | 'boss'
  state: 'broken' | 'open' | 'locked' | 'closed'
  part: [number, number][]
}
export type PetalLayer = {
  index: 1 | 2 | 3
  name: string
  hue: string
  sigil: [number, number][]
  state: 'locked' | 'current' | 'cleared'
  nodes: PetalNode[]
}
export type PetalModel = {
  layers: PetalLayer[]
  selected: string | null
  ghosts: string[]
  gathered: number
  reducedMotion: boolean
}

const TAU = Math.PI * 2
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const WHITE = '#F4F4F4'
const BLUE = '#79BFFF'
const GHOST = '#6E9BC8'               // the run's blue, greyed: where an earlier run ended
const BONE = '#F3EDE2'
const INK = '#070707'

// About 1,200 dots a petal: the seed-head field, a dotted outline, and the
// dots that crowd onto the sign.
const FIELD_DOTS = 850
const SIGN_DOTS = 250
const RIM_SPACING = 0.5

// One petal, in the cells of its sign's grid. Row 0 of the sign is nearest
// the tip; the base is where the petal meets the empty centre.
const TIP = -4.2
const BASE = 19.2
const GAP = 2.3
const HALF = 9.3
const LENGTH = BASE - TIP
const REACH = GAP + LENGTH
const RISE = 0.95
const FALL = 0.58
const PEAK = (RISE / (RISE + FALL)) ** RISE * (FALL / (RISE + FALL)) ** FALL

// Half the petal's width, `along` running from 0 at the base to 1 at the tip:
// a wedge out of the centre, widest two thirds of the way, a round end.
export function petalHalfWidth(along: number): number {
  if (along <= 0 || along >= 1) return 0
  return HALF * along ** RISE * (1 - along) ** FALL / PEAK
}

// How far the three petals reach from the centre, in cells, found by walking
// the outline of the lower-right one.
const EXTENT = (() => {
  let side = 0, below = 0
  for (let i = 0; i <= 96; i++) {
    const along = i / 96, out = GAP + along * LENGTH, half = petalHalfWidth(along)
    side = Math.max(side, out * Math.cos(Math.PI / 6) + half * 0.5)
    below = Math.max(below, out * 0.5 + half * Math.cos(Math.PI / 6))
  }
  return { above: REACH, below, side }
})()

// The gods differ in how they move, not in ornament. GROVE spills; COURT will
// not hold still and its mistakes are symmetrical; CARCOSA is the one still
// thing on the map.
const NATURE: Record<1 | 2 | 3, { period: number; sway: number; sigma: number; dust: number; restless: boolean }> = {
  1: { period: 7.3, sway: 1, sigma: 0.13, dust: 0.12, restless: false },
  2: { period: 8.9, sway: 1, sigma: 0.1, dust: 0.06, restless: true },
  3: { period: 0, sway: 0, sigma: 0.07, dust: 0.02, restless: false },
}

// Seconds for the hue to cross a petal, and for one dot to change.
const WAVE = 1.2
const TURN = 0.45
// How long a restless dot stays on one side before it is found on the other.
const RESTLESS_EVERY = 66

type PetalState = PetalLayer['state']

type Petal = {
  index: 1 | 2 | 3
  sigil: Sigil
  sign: SigilDots
  cells: [number, number][]          // our own copy, to notice a changed sign
  parts: [number, number][][]
  count: number
  gx: Float32Array                   // field dots, in grid cells
  gy: Float32Array
  along: Float32Array                // 0 at the base, 1 at the tip
  weight: Float32Array               // brightness: the field is weighted by the sign
  size: Float32Array
  halo: Float32Array                 // how much of a lit stroke's light reaches the dot
  d: Float32Array
  owner: Int16Array                  // nearest sigil cell
  give: Int16Array                   // order in which dots leave for the centre
  phase: Float32Array
  holder: Int8Array                  // per sigil cell: the node whose part it is, or -1
  anchors: [number, number][]        // per node, in grid cells
  litAt: Float64Array                // per sigil cell: when it was lit; Infinity while dark
  since: Float32Array                // scratch: seconds each cell has been lit
  ax: number                         // the petal's axis on screen
  ay: number
  state: PetalState
  from: PetalState
  changedAt: number
  wave: -1 | 0 | 1                   // 1: from the base outward; -1: from the tip inward; 0: all at once
}

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)
const smooth = (value: number) => { const k = clamp01(value); return k * k * (3 - 2 * k) }
const easeInOut = (value: number) => { const k = clamp01(value); return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2 }

function mixColour(a: string, b: string, amount: number): string {
  const from = parseInt(a.slice(1), 16), to = parseInt(b.slice(1), 16)
  const channel = (shift: number) => Math.round((from >> shift & 255) + ((to >> shift & 255) - (from >> shift & 255)) * amount)
  return '#' + ((1 << 24) | (channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).slice(1)
}

function hashOf(text: string): number {
  let value = 2166136261
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619)
  return (value >>> 0) / 4294967296
}

function insidePetal(gx: number, gy: number, mid: number, margin = 0): boolean {
  return Math.abs(gx - mid) <= petalHalfWidth((BASE - gy) / LENGTH) - margin
}

// Where each node sits on its sign, in grid cells. A skirmish takes the point
// of its part nearest the part's centroid; the boss takes the sign's centre
// of mass. Two rules keep the rings apart: a skirmish keeps two cells clear
// of the boss when its part allows, and of several equally central points it
// takes the one farthest from the skirmishes already placed.
export function nodeAnchors(nodes: PetalNode[], sigil: Sigil): [number, number][] {
  const boss = sigil.centre
  const placed: [number, number][] = []
  return nodes.map((node, order): [number, number] => {
    if (node.kind === 'boss') return boss
    if (!node.part.length) {
      const angle = order * TAU / 3
      return [boss[0] + 3 * Math.cos(angle), boss[1] + 3 * Math.sin(angle)]
    }
    let cx = 0, cy = 0
    for (const [x, y] of node.part) { cx += x; cy += y }
    cx /= node.part.length
    cy /= node.part.length
    const clear = node.part.filter(([x, y]) => Math.hypot(x - boss[0], y - boss[1]) >= 2)
    const pool = clear.length ? clear : node.part
    const central = Math.min(...pool.map(([x, y]) => Math.hypot(x - cx, y - cy)))
    let best = pool[0], bestRoom = -1
    for (const point of pool) {
      if (Math.hypot(point[0] - cx, point[1] - cy) > central + 0.01) continue
      const room = placed.length ? Math.min(...placed.map(([x, y]) => Math.hypot(point[0] - x, point[1] - y))) : 0
      if (room > bestRoom) { best = point; bestRoom = room }
    }
    placed.push(best)
    return [best[0], best[1]]
  })
}

// The seed head: dots at the golden angle around the sign's centre of mass,
// kept where they fall inside the petal. The spacing is searched for so the
// petal holds the number of dots asked for.
function seedHead(sigil: Sigil, wanted: number, turn: number): { x: number[]; y: number[] } {
  const [cx, cy] = sigil.centre, mid = (sigil.size - 1) / 2
  const farthest = Math.max(Math.hypot(HALF, cy - TIP), Math.hypot(HALF, BASE - cy)) + 1
  const lay = (spacing: number) => {
    const x: number[] = [], y: number[] = []
    for (let i = 0; ; i++) {
      const r = spacing * Math.sqrt(i + 0.5)
      if (r > farthest) break
      const px = cx + r * Math.cos(i * GOLDEN + turn), py = cy + r * Math.sin(i * GOLDEN + turn)
      if (insidePetal(px, py, mid)) { x.push(px); y.push(py) }
    }
    return { x, y }
  }
  let tight = 0.15, wide = 1.2
  for (let step = 0; step < 28; step++) {
    const spacing = (tight + wide) / 2
    if (lay(spacing).x.length > wanted) tight = spacing
    else wide = spacing
  }
  return lay(wide)
}

// The outline as a row of evenly spaced dots, so a petal reads as a petal
// even when its field is at twelve percent.
function rimDots(mid: number): { x: number[]; y: number[] } {
  const x: number[] = [], y: number[] = []
  for (const side of [-1, 1]) {
    let walked = RIM_SPACING / 2, px = mid, py = BASE
    for (let i = 1; i <= 600; i++) {
      const along = i / 600
      const nx = mid + side * petalHalfWidth(along), ny = BASE - along * LENGTH
      walked += Math.hypot(nx - px, ny - py)
      if (walked >= RIM_SPACING) { walked -= RIM_SPACING; x.push(nx); y.push(ny) }
      px = nx
      py = ny
    }
  }
  return { x, y }
}

function buildPetal(layer: PetalLayer): Petal {
  const cells = layer.sigil.map(([x, y]): [number, number] => [x, y])
  const sigil = prepareSigil(cells)
  const nature = NATURE[layer.index]
  const mid = (sigil.size - 1) / 2
  const sign = scatterSigil(sigil, SIGN_DOTS, { sigma: nature.sigma, dust: nature.dust, seed: layer.index })
  // Dust thrown past the outline is drawn back in, so the petal keeps its edge.
  for (let i = 0; i < sign.count; i++) {
    let moved = false
    for (let step = 0; step < 12 && !insidePetal(sign.x[i], sign.y[i], mid, 0.3); step++) {
      sign.x[i] += (sigil.centre[0] - sign.x[i]) * 0.15
      sign.y[i] += (sigil.centre[1] - sign.y[i]) * 0.15
      moved = true
    }
    if (moved) {
      const near = nearestStroke(sigil, sign.x[i], sign.y[i])
      sign.d[i] = near.d
      sign.cell[i] = near.cell
    }
  }

  const head = seedHead(sigil, FIELD_DOTS, layer.index * 2.1)
  const rim = rimDots(mid)
  const seeds = head.x.length
  const count = seeds + rim.x.length
  const random = seededRandom(90 + layer.index)
  const petal: Petal = {
    index: layer.index, sigil, sign, cells,
    parts: layer.nodes.map(node => node.part.map(([x, y]): [number, number] => [x, y])),
    count,
    gx: Float32Array.from([...head.x, ...rim.x]), gy: Float32Array.from([...head.y, ...rim.y]),
    along: new Float32Array(count), weight: new Float32Array(count), size: new Float32Array(count),
    halo: new Float32Array(count), d: new Float32Array(count), owner: new Int16Array(count),
    give: new Int16Array(count), phase: new Float32Array(count),
    holder: new Int8Array(cells.length).fill(-1),
    anchors: nodeAnchors(layer.nodes, sigil),
    litAt: new Float64Array(cells.length).fill(Infinity),
    since: new Float32Array(cells.length),
    ax: Math.cos(-Math.PI / 2 + (layer.index - 1) * TAU / 3),
    ay: Math.sin(-Math.PI / 2 + (layer.index - 1) * TAU / 3),
    state: layer.state, from: layer.state, changedAt: -Infinity, wave: 0,
  }
  const order: [number, number][] = []
  for (let i = 0; i < count; i++) {
    const near = nearestStroke(sigil, petal.gx[i], petal.gy[i])
    const onRim = i >= seeds
    petal.d[i] = near.d
    petal.owner[i] = near.cell
    petal.along[i] = (BASE - petal.gy[i]) / LENGTH
    // The field is a halftone of the sign: a dot is larger and brighter the
    // nearer it lies to a stroke.
    petal.weight[i] = onRim ? 0.9 : 0.68 + 0.32 * Math.exp(-((near.d / 0.8) ** 2))
    petal.size[i] = onRim ? 0.74 : 0.8 + 1.0 * Math.exp(-((near.d / 0.55) ** 2))
    petal.halo[i] = !onRim && near.d < 1.6 ? Math.exp(-((near.d / 0.62) ** 2)) : 0
    petal.phase[i] = random()
    if (!onRim) order.push([random(), i])
  }
  // The outline never leaves for the centre.
  petal.give.fill(32767)
  order.sort((a, b) => a[0] - b[0])
  order.forEach(([, dot], rank) => { petal.give[dot] = rank })

  // Skirmish parts first; whatever is left belongs to the boss.
  const at = new Map(cells.map(([x, y], i) => [y * 64 + x, i]))
  const claim = (kind: PetalNode['kind']) => layer.nodes.forEach((node, n) => {
    if (node.kind !== kind) return
    for (const [x, y] of node.part) {
      const cell = at.get(y * 64 + x)
      if (cell !== undefined && petal.holder[cell] < 0) petal.holder[cell] = n
    }
  })
  claim('skirmish')
  claim('boss')
  return petal
}

function sameCells(a: [number, number][], b: [number, number][]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false
  return true
}

function sameShape(petal: Petal, layer: PetalLayer): boolean {
  if (petal.index !== layer.index || petal.parts.length !== layer.nodes.length) return false
  if (!sameCells(petal.cells, layer.sigil)) return false
  return layer.nodes.every((node, n) => sameCells(petal.parts[n], node.part))
}

const frameTimes = new WeakMap<HTMLCanvasElement, { ms: number }>()

// Smoothed cost of drawing one frame, in ms, for a mounted map. For checks.
export function petalMapFrameMs(canvas: HTMLCanvasElement): number | null {
  return frameTimes.get(canvas)?.ms ?? null
}

// The canvas must be given its size by CSS. The model is read every frame;
// the map never keeps state the caller does not hand it, except where the
// run last stood, which it works out from the nodes.
export function mountPetalMap(
  canvas: HTMLCanvasElement,
  opts: { getModel: () => PetalModel; onSelect: (id: string | null) => void; onActivate: (id: string) => void },
): { dispose(): void; resize(): void } {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D is unavailable')
  const ctx: CanvasRenderingContext2D = context
  const family = getComputedStyle(canvas).fontFamily || 'monospace'
  const stat = { ms: 0 }
  frameTimes.set(canvas, stat)

  const petals: (Petal | null)[] = [null, null, null]
  let width = 0, height = 0, ratio = 1
  let cell = 16, cx = 0, cy = 0
  let clock = 0, last = 0, raf = 0, frames = 0
  let disposed = false
  let first = true
  let dirty = true
  let busyUntil = 0
  let bornAt = 0
  let reduced = false
  let model: PetalModel | null = null

  let seenSelected: string | null = null
  let seenGhosts: string[] | null = null
  let seenGhostCount = -1
  let seenGathered = 0
  let seenStates = ''
  let lastCleared = -1
  let stood: string | null = null            // the node the run last broke
  let player = { x: 0, y: 0, fromX: 0, fromY: 0, at: -Infinity }
  let hover: string | null = null
  let touch = false

  // Gathered dots in flight to the centre: where each left from, and when.
  let flightFrom = new Float32Array(0)
  let flightAt = new Float64Array(0)

  type Hit = { id: string; x: number; y: number; r: number; open: boolean }
  let hits: Hit[] = []

  // A place on a petal's grid, in cells from the middle of the map.
  const placeX = (p: Petal, gx: number, gy: number) => (gx - (p.sigil.size - 1) / 2) * -p.ay + (GAP + BASE - gy) * p.ax
  const placeY = (p: Petal, gx: number, gy: number) => (gx - (p.sigil.size - 1) / 2) * p.ax + (GAP + BASE - gy) * p.ay

  function measure(): void {
    const w = canvas.clientWidth, h = canvas.clientHeight
    const r = Math.min(window.devicePixelRatio || 1, 2)
    if (w === width && h === height && r === ratio) return
    width = w
    height = h
    ratio = r
    canvas.width = Math.max(1, Math.round(w * r))
    canvas.height = Math.max(1, Math.round(h * r))
    // Room is kept for the petal names beyond the tips.
    const padX = 18, padTop = 46, padBottom = 40
    const tall = EXTENT.above + EXTENT.below
    cell = Math.max(3, Math.min((w - padX * 2) / (EXTENT.side * 2), (h - padTop - padBottom) / tall, 30))
    cx = w / 2
    cy = padTop + cell * EXTENT.above + (h - padTop - padBottom - cell * tall) / 2
    dirty = true
  }

  function standingNode(layers: PetalLayer[]): string | null {
    let found: string | null = null
    for (const layer of layers) for (const node of layer.nodes) if (node.state === 'broken') found = node.id
    return found
  }

  function anchorOf(id: string | null): [number, number] | null {
    if (!id || !model) return null
    for (const layer of model.layers) {
      const p = petals[layer.index - 1]
      const n = layer.nodes.findIndex(node => node.id === id)
      if (p && n >= 0) return [placeX(p, p.anchors[n][0], p.anchors[n][1]), placeY(p, p.anchors[n][0], p.anchors[n][1])]
    }
    return null
  }

  function playerNow(): [number, number] {
    const k = easeInOut((clock - player.at) / 0.9)
    return [player.fromX + (player.x - player.fromX) * k, player.fromY + (player.y - player.fromY) * k]
  }

  // Where the n-th gathered dot rests: a small seed head in the centre.
  const slotR = (i: number, total: number) => GAP * 0.74 * Math.sqrt((i + 0.5) / Math.max(180, total))

  // Bring the petals in line with the model and start whatever follows from a
  // change: a hue arriving or leaving, a part of a sign lighting, dots leaving
  // for the centre, the run's dot moving on.
  function sync(next: PetalModel): void {
    model = next
    if (next.reducedMotion !== reduced) { reduced = next.reducedMotion; dirty = true }
    const instant = reduced || first
    let states = ''
    let newlyBroken: string | null = null

    for (let k = 0; k < 3; k++) {
      const layer = next.layers.find(candidate => candidate.index === k + 1)
      if (!layer) { if (petals[k]) { petals[k] = null; dirty = true } continue }
      let p = petals[k]
      if (!p || !sameShape(p, layer)) {
        p = petals[k] = buildPetal(layer)
        dirty = true
      }
      if (layer.state !== p.state) {
        p.wave = instant ? 0 : p.state === 'locked' && layer.state === 'current' ? 1 : p.state === 'current' && layer.state === 'cleared' ? -1 : 0
        p.from = p.state
        p.state = layer.state
        p.changedAt = instant ? -Infinity : clock
        if (layer.state === 'cleared') lastCleared = k
        dirty = true
      }
      // A part is lit once its node is broken; the whole sign once the boss is.
      const whole = layer.state === 'cleared' || layer.nodes.some(node => node.kind === 'boss' && node.state === 'broken')
      let earliest = Infinity
      const fresh: number[] = []
      for (let c = 0; c < p.litAt.length; c++) {
        const lit = whole || (p.holder[c] >= 0 && layer.nodes[p.holder[c]].state === 'broken')
        if (lit && p.litAt[c] === Infinity) { fresh.push(c); earliest = Math.min(earliest, p.sigil.depth[c]) }
        else if (!lit && p.litAt[c] !== Infinity) { p.litAt[c] = Infinity; dirty = true }
      }
      // Written along the strokes: on arrival, after the field has bloomed.
      for (const c of fresh) {
        p.litAt[c] = reduced ? -Infinity : first ? clock + 0.9 + STROKE_PACE * p.sigil.depth[c] : clock + STROKE_PACE * (p.sigil.depth[c] - earliest)
        dirty = true
      }
      for (const node of layer.nodes) states += node.state[0]
      // The second letter: "current" and "cleared" share their first.
      states += layer.state[1] + '|'
    }

    if (states !== seenStates) {
      if (!first) {
        // The node that just broke is where the run now stands.
        let cursor = 0
        for (const layer of next.layers.slice().sort((a, b) => a.index - b.index)) {
          for (const node of layer.nodes) {
            if (node.state === 'broken' && seenStates[cursor] !== 'b') newlyBroken = node.id
            cursor++
          }
          cursor += 2
        }
      }
      seenStates = states
      dirty = true
    }
    const stillStands = stood !== null && next.layers.some(layer => layer.nodes.some(node => node.id === stood && node.state === 'broken'))
    const stands: string | null = newlyBroken ?? (stillStands ? stood : standingNode(next.layers))
    const target = anchorOf(stands) ?? [0, 0]
    if (first || stands !== stood || target[0] !== player.x || target[1] !== player.y) {
      const [x, y] = instant ? target : playerNow()
      player = { x: target[0], y: target[1], fromX: x, fromY: y, at: instant ? -Infinity : clock }
      stood = stands
      dirty = true
    }

    const gathered = Math.max(0, Math.min(600, Math.floor(next.gathered)))
    if (gathered !== seenGathered) {
      if (flightAt.length < gathered) {
        const at = new Float64Array(gathered).fill(-Infinity), from = new Float32Array(gathered * 2)
        at.set(flightAt)
        from.set(flightFrom)
        flightAt = at
        flightFrom = from
      }
      const donor = lastCleared >= 0 ? petals[lastCleared] : null
      for (let i = seenGathered; i < gathered; i++) {
        flightAt[i] = -Infinity
        if (instant) continue
        // Each new dot leaves from a dot of the petal that was just cleared,
        // once the grey has passed over it.
        const rank = i - seenGathered
        const dot = donor ? donor.give.indexOf(rank) : -1
        if (donor && dot >= 0) {
          flightFrom[i * 2] = placeX(donor, donor.gx[dot], donor.gy[dot])
          flightFrom[i * 2 + 1] = placeY(donor, donor.gx[dot], donor.gy[dot])
          flightAt[i] = clock + (1 - donor.along[dot]) * WAVE + 0.5 + donor.phase[dot] * 0.5
        } else {
          const r = slotR(i, gathered)
          flightFrom[i * 2] = r * Math.cos(i * GOLDEN)
          flightFrom[i * 2 + 1] = r * Math.sin(i * GOLDEN)
          flightAt[i] = clock + rank * 0.004
        }
      }
      seenGathered = gathered
      dirty = true
    }

    if (next.selected !== seenSelected) { seenSelected = next.selected; dirty = true }
    if (next.ghosts !== seenGhosts || next.ghosts.length !== seenGhostCount) {
      seenGhosts = next.ghosts
      seenGhostCount = next.ghosts.length
      dirty = true
    }
    if (dirty && !reduced) busyUntil = Math.max(busyUntil, clock + 4)
    if (first) { bornAt = reduced ? -Infinity : clock; first = false }
  }

  // The look of a field dot in each state: [alpha, in the god's hue or not].
  const fieldAlpha = (state: PetalState) => (state === 'current' ? 0.55 : state === 'cleared' ? 0.3 : 0.12)

  function drawPetal(p: Petal, layer: PetalLayer, total: number, cleared: number): void {
    const nature = NATURE[p.index]
    const time = clock + p.index * 3.1
    const period = reduced ? 0 : nature.period
    const sway = reduced ? 0 : nature.sway * Math.min(1.5, Math.max(0.8, cell * 0.085))
    const dotR = Math.min(1.7, Math.max(0.55, cell * 0.07))
    const lit = p.index === 2 ? BONE : mixColour(layer.hue, '#FFFFFF', 0.6)
    const turning = clock - p.changedAt < WAVE + TURN + 0.1
    const blooming = clock - bornAt < 2.6
    const mid = (p.sigil.size - 1) / 2
    const ox = cx + cell * (GAP + BASE - mid) * p.ax, oy = cy + cell * (GAP + BASE - mid) * p.ay
    const cos = -p.ay * cell, sin = p.ax * cell
    const toAlpha = fieldAlpha(p.state), fromAlpha = fieldAlpha(p.from)
    const toHue = p.state === 'current', fromHue = p.from === 'current'
    // Dots a cleared petal has given to the centre.
    const given = p.state === 'cleared' && cleared > 0 ? Math.min(Math.round(total / cleared), Math.floor(p.count * 0.15)) : 0
    const restless = nature.restless && !reduced && p.state === 'current'

    for (let c = 0; c < p.litAt.length; c++) p.since[c] = p.litAt[c] === Infinity ? -1 : Math.min(99, clock - p.litAt[c])

    ctx.globalCompositeOperation = 'lighter'
    // The petal in play carries a little of its hue in the dark around it.
    const warmth = (p.state === 'current' ? 1 : 0) * (turning ? smooth((clock - p.changedAt) / (WAVE + TURN)) : 1)
      + (p.from === 'current' && turning ? 1 - smooth((clock - p.changedAt) / (WAVE + TURN)) : 0)
    if (warmth > 0.01) {
      const reach = cell * 15
      const ax = cx + cell * (GAP + LENGTH * 0.56) * p.ax, ay = cy + cell * (GAP + LENGTH * 0.56) * p.ay
      ctx.globalAlpha = 0.085 * warmth * (blooming ? smooth((clock - bornAt - 0.3) / 1.2) : 1)
      ctx.drawImage(glowSprite(layer.hue), ax - reach, ay - reach, reach * 2, reach * 2)
    }
    let ink = ''
    const paint = (colour: string, alpha: number, x: number, y: number, r: number) => {
      if (alpha < 0.012) return
      if (colour !== ink) { ink = colour; ctx.fillStyle = colour }
      ctx.globalAlpha = alpha > 1 ? 1 : alpha
      fillDot(ctx, x, y, r)
    }

    for (let i = 0; i < p.count; i++) {
      let gx = p.gx[i]
      const gy = p.gy[i]
      let show = p.weight[i]
      if (blooming) show *= smooth((clock - bornAt - 0.15 - (GAP + BASE - gy) / REACH) / 0.7)
      if (restless) {
        // Now and then a dot is found on the other side of the axis instead.
        const beat = clock / RESTLESS_EVERY + p.phase[i]
        const within = (beat - Math.floor(beat)) * RESTLESS_EVERY
        if (Math.floor(beat) % 2 === 1) gx = 2 * mid - gx
        show *= Math.min(1, within / 0.5, (RESTLESS_EVERY - within) / 0.5)
      }
      let x = ox + (gx - mid) * cos - (gy - mid) * sin
      let y = oy + (gx - mid) * sin + (gy - mid) * cos
      if (sway > 0) {
        x += sway * driftX(gx, gy, time)
        y += sway * driftY(gx, gy, time)
      }
      const r = dotR * p.size[i] * breath(time, period, p.d[i])
      let k = 1
      if (turning) {
        const delay = p.wave > 0 ? p.along[i] * WAVE : p.wave < 0 ? (1 - p.along[i]) * WAVE : 0
        k = smooth((clock - p.changedAt - delay) / TURN)
      }
      const gone = p.give[i] < given ? 1 - k : 1
      if (k < 1) paint(fromHue ? layer.hue : WHITE, show * fromAlpha * (1 - k), x, y, r)
      if (gone > 0) paint(toHue ? layer.hue : WHITE, show * toAlpha * k * gone, x, y, r)
      // Light from a lit stroke reaches the field around it.
      if (p.state === 'current' && p.halo[i] > 0.02 && p.since[p.owner[i]] > 0) {
        const level = ignition(p.since[p.owner[i]] - 0.04 * p.d[i])
        paint(layer.hue, 0.6 * p.halo[i] * Math.min(1, level) * k, x, y, r * 1.1)
      }
    }

    // The sign over the field. While a petal changes, the old look fades out
    // under the new one.
    const k = turning ? smooth((clock - p.changedAt) / (WAVE + TURN)) : 1
    const born = blooming ? smooth((clock - bornAt - 0.5) / 0.9) : 1
    const sign = (state: PetalState, alpha: number) => drawSigilDots(ctx, p.sigil, p.sign, {
      x: ox, y: oy, cell, rotation: Math.atan2(p.ax, -p.ay),
      hue: state === 'current' ? layer.hue : WHITE,
      core: state === 'current' ? lit : WHITE,
      time,
      lit: state === 'locked' ? -1 : p.since,
      ghost: state === 'current' ? 0.5 : 1,
      alpha: alpha * born * (state === 'current' ? 1 : state === 'cleared' ? 0.36 : 0.15),
      dot: dotR,
      breath: period,
      drift: sway,
      glow: state === 'current' ? 1 : 0,
    })
    if (k < 1) sign(p.from, 1 - k)
    sign(p.state, k)
  }

  function drawCentre(total: number): void {
    const dotR = Math.min(1.4, Math.max(0.55, cell * 0.058))
    const sway = reduced ? 0 : Math.min(1.5, Math.max(0.8, cell * 0.085))
    const born = clock - bornAt < 2.6 ? smooth((clock - bornAt - 0.2) / 0.8) : 1
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = WHITE
    for (let i = 0; i < total; i++) {
      const r = slotR(i, total)
      let x = r * Math.cos(i * GOLDEN), y = r * Math.sin(i * GOLDEN)
      let alpha = 0.6 * born
      const flown = clock - flightAt[i]
      if (flown < 0) continue
      if (flown < 1.7) {
        // A slightly bowed path, so sixty dots do not travel as one line.
        const k = easeInOut(flown / 1.7), bow = Math.sin(Math.PI * k) * (i % 2 ? 1.1 : -1.1)
        const fx = flightFrom[i * 2], fy = flightFrom[i * 2 + 1]
        const length = Math.hypot(x - fx, y - fy) || 1
        const nx = -(y - fy) / length, ny = (x - fx) / length
        x = fx + (x - fx) * k + nx * bow
        y = fy + (y - fy) * k + ny * bow
        alpha *= Math.min(1, flown / 0.3)
      }
      ctx.globalAlpha = alpha
      fillDot(
        ctx,
        cx + x * cell + sway * driftX(x * 3, y * 3, clock),
        cy + y * cell + sway * driftY(x * 3, y * 3, clock),
        dotR,
      )
    }
  }

  const ring = (x: number, y: number, r: number) => {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.stroke()
  }

  function drawNodes(next: PetalModel): void {
    const scale = Math.min(1.1, Math.max(0.78, cell / 15))
    const pulse = reduced ? 1 : 0.8 + 0.2 * Math.sin(TAU * 0.5 * clock)
    const born = clock - bornAt < 2.6 ? smooth((clock - bornAt - 1.1) / 0.7) : 1
    hits = []
    ctx.globalCompositeOperation = 'source-over'
    ctx.lineCap = 'round'

    // Where earlier runs ended: one faint dot each, beside the node.
    const fallen = new Map<string, number>()
    for (const id of next.ghosts) fallen.set(id, (fallen.get(id) ?? 0) + 1)

    for (const layer of next.layers) {
      const p = petals[layer.index - 1]
      if (!p) continue
      const lit = p.index === 2 ? BONE : mixColour(layer.hue, '#FFFFFF', 0.6)
      layer.nodes.forEach((node, n) => {
        const x = cx + cell * placeX(p, p.anchors[n][0], p.anchors[n][1])
        const y = cy + cell * placeY(p, p.anchors[n][0], p.anchors[n][1])
        const boss = node.kind === 'boss'
        const r = (boss ? 8.5 : 5.5) * scale
        const here = layer.state !== 'locked'
        const selected = next.selected === node.id
        if (here) hits.push({ id: node.id, x, y, r, open: node.state === 'open' })

        // A white dot would be one more dot of the field on a grey petal, so
        // each is a faded dot of the run's own colour in a small pocket of dark.
        const ghosts = Math.min(fallen.get(node.id) ?? 0, 12)
        for (const pocket of [true, false]) {
          ctx.fillStyle = pocket ? INK : GHOST
          ctx.globalAlpha = (pocket ? 0.78 : 0.6) * born
          for (let g = 0; g < ghosts; g++) {
            const angle = hashOf(node.id) * TAU + g * GOLDEN, out = r + 7 + 2.5 * Math.floor(g / 5)
            fillDot(ctx, x + out * Math.cos(angle), y + out * Math.sin(angle), pocket ? 3.2 : 1.4)
          }
        }

        // Clear the dots from under the mark so it reads as a mark.
        ctx.globalAlpha = (here ? 0.86 : 0.5) * born
        ctx.fillStyle = INK
        fillDot(ctx, x, y, r + 1.5)

        let colour = WHITE, alpha = 0.16, weight = 1
        if (here) {
          if (node.state === 'open') { alpha = 0.95; weight = 1.5 }
          else if (node.state === 'broken') { colour = layer.state === 'current' ? lit : WHITE; alpha = layer.state === 'current' ? 0.8 : 0.4 }
          else if (node.state === 'closed') alpha = 0.26
          else alpha = 0.34
        }
        ctx.strokeStyle = colour
        ctx.lineWidth = weight
        ctx.globalAlpha = alpha * born
        ring(x, y, r)
        if (boss) ring(x, y, r * 0.52)
        if (node.state === 'broken' && here) {
          ctx.fillStyle = colour
          fillDot(ctx, x, y, boss ? 2.6 * scale : 2.1 * scale)
        }
        if (node.state === 'closed' && here) {
          const reach = r + 3
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x - reach, y + reach)
          ctx.lineTo(x + reach, y - reach)
          ctx.stroke()
        }
        if (selected) {
          ctx.strokeStyle = WHITE
          ctx.lineWidth = 1
          ctx.globalAlpha = pulse
          ring(x, y, r + 5)
        }
      })
    }

    // The fallen whose node is not on the map lie at the edge of the centre.
    let stray = 0
    for (const [id, count] of fallen) {
      if (hits.some(hit => hit.id === id) || next.layers.some(layer => layer.nodes.some(node => node.id === id))) continue
      ctx.fillStyle = GHOST
      for (let g = 0; g < Math.min(count, 12); g++, stray++) {
        const angle = hashOf(id) * TAU + stray * GOLDEN
        ctx.globalAlpha = 0.55 * born
        fillDot(ctx, cx + GAP * 0.92 * cell * Math.cos(angle), cy + GAP * 0.92 * cell * Math.sin(angle), 1.4)
      }
    }

    // The run itself: one blue dot.
    const [px, py] = playerNow()
    const x = cx + px * cell, y = cy + py * cell
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.55 * born
    ctx.drawImage(glowSprite(BLUE), x - 15, y - 15, 30, 30)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = born
    ctx.fillStyle = BLUE
    fillDot(ctx, x, y, 3 * scale)
  }

  type Box = { left: number; top: number; right: number; bottom: number }
  const overlap = (a: Box, b: Box) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

  // Text with a dark edge, so it stays legible over the dots. `left` is where
  // the text starts; the font and tracking are already set.
  function write(text: string, left: number, y: number, wide: number, colour: string, alpha: number, struck: boolean): void {
    ctx.textAlign = 'left'
    ctx.globalAlpha = alpha
    ctx.lineWidth = 3.5
    ctx.strokeStyle = withAlpha(INK, 0.92)
    ctx.strokeText(text, left, y)
    ctx.fillStyle = colour
    ctx.fillText(text, left, y)
    if (!struck) return
    ctx.strokeStyle = colour
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(left - 2, y)
    ctx.lineTo(left + wide + 1, y)
    ctx.stroke()
  }

  function drawLabels(next: PetalModel): void {
    const size = Math.max(9, Math.min(11, Math.round(cell * 0.6)))
    const born = clock - bornAt < 2.6 ? smooth((clock - bornAt - 1.3) / 0.7) : 1
    const scale = Math.min(1.1, Math.max(0.78, cell / 15))
    const taken: Box[] = []
    ctx.globalCompositeOperation = 'source-over'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'

    // The petals' names, just past their tips.
    ctx.font = `500 ${size}px ${family}`
    ctx.letterSpacing = `${(size * 0.28).toFixed(1)}px`
    for (const layer of next.layers) {
      const p = petals[layer.index - 1]
      if (!p) continue
      const mid = (p.sigil.size - 1) / 2
      const wide = ctx.measureText(layer.name).width
      const x = cx + cell * placeX(p, mid, TIP) + p.ax * 20
      const y = cy + cell * placeY(p, mid, TIP) + p.ay * 20 + (p.ay > 0 ? 4 : 0)
      const left = Math.max(6, Math.min(width - 6 - wide, x - wide / 2))
      const tone = layer.state === 'current' ? layer.hue : WHITE
      write(layer.name, left, y, wide, tone, (layer.state === 'current' ? 0.95 : layer.state === 'cleared' ? 0.42 : 0.26) * born, false)
      taken.push({ left, top: y - size, right: left + wide, bottom: y + size })
    }

    // Node names. The chosen node first, then the ones that can be entered,
    // each taking the side of its ring that crowds the others and the sign
    // least.
    type Name = { lines: string[]; x: number; y: number; r: number; weight: number; alpha: number; struck: boolean; rank: number; first: number; petal: Petal }
    const names: Name[] = []
    for (const layer of next.layers) {
      const p = petals[layer.index - 1]
      if (!p) continue
      const mid = (p.sigil.size - 1) / 2
      const middleX = cx + cell * placeX(p, mid, mid)
      layer.nodes.forEach((node, n) => {
        const x = cx + cell * placeX(p, p.anchors[n][0], p.anchors[n][1])
        const y = cy + cell * placeY(p, p.anchors[n][0], p.anchors[n][1])
        const boss = node.kind === 'boss'
        const selected = next.selected === node.id
        const r = (boss ? 8.5 : 5.5) * scale + (selected ? 5 : 0)
        if (layer.state !== 'locked') taken.push({ left: x - r - 2, top: y - r - 2, right: x + r + 2, bottom: y + r + 2 })
        // On a small screen only the chosen node is named. Nor is a node that
        // cannot be entered yet: its name arrives with it.
        if (!selected && (layer.state !== 'current' || node.state === 'locked' || cell < 11)) return
        // A skirmish prefers the side away from the petal's middle; a boss the
        // way to the tip, where the signs leave room.
        const outward = Math.abs(x - middleX) > cell * 0.5 ? (x > middleX ? 0 : 1) : middleX >= cx ? 0 : 1
        const first = !boss ? outward : Math.abs(p.ax) < 0.3 ? 3 : p.ax > 0 ? 0 : 1
        // A boss's name and epithet stack, so the label stays narrow.
        names.push({
          lines: (selected ? `${node.id}  ${node.name}` : node.name).split(' / '),
          x, y, r, petal: p, first,
          weight: selected ? 600 : 500,
          alpha: selected ? 1 : node.state === 'open' ? 0.82 : node.state === 'broken' ? 0.55 : 0.36,
          struck: node.state === 'closed',
          rank: selected ? 0 : node.state === 'open' ? (boss ? 1 : 2) : 3,
        })
      })
    }
    names.sort((a, b) => a.rank - b.rank)
    ctx.letterSpacing = `${(size * 0.12).toFixed(1)}px`
    for (const name of names) {
      const px = name.weight === 600 ? size + 1 : size
      ctx.font = `${name.weight} ${px}px ${family}`
      const widths = name.lines.map(line => ctx.measureText(line).width)
      const wide = Math.max(...widths), line = px + 3, tall = line * name.lines.length + 1
      const p = name.petal
      let best: Box | null = null, bestSide = 0, bestCost = Infinity
      // Right, left, below, above: the preferred side first.
      for (let turn = 0; turn < 4; turn++) {
        const side = [name.first, name.first ^ 1, name.first < 2 ? 2 : 0, name.first < 2 ? 3 : 1][turn]
        let left = side === 0 ? name.x + name.r + 7 : side === 1 ? name.x - name.r - 7 - wide : name.x - wide / 2
        const middle = side === 2 ? name.y + name.r + tall / 2 + 5 : side === 3 ? name.y - name.r - tall / 2 - 5 : name.y
        left = Math.max(6, Math.min(width - 6 - wide, left))
        const box: Box = { left: left - 3, top: middle - tall / 2, right: left + wide + 3, bottom: middle + tall / 2 }
        let cost = turn * 40
        for (const other of taken) cost += overlap(box, other) * 4
        // A name should not sit on the sign: its points count, and the
        // middles of its strokes.
        const on = (gx: number, gy: number) => {
          const sx = cx + cell * placeX(p, gx, gy), sy = cy + cell * placeY(p, gx, gy)
          return sx > box.left - 3 && sx < box.right + 3 && sy > box.top - 3 && sy < box.bottom + 3
        }
        for (const [gx, gy] of p.sigil.cells) if (on(gx, gy)) cost += 120
        for (const [a, b] of p.sigil.links) {
          if (on((p.sigil.cells[a][0] + p.sigil.cells[b][0]) / 2, (p.sigil.cells[a][1] + p.sigil.cells[b][1]) / 2)) cost += 90
        }
        if (cost < bestCost) { best = box; bestSide = side; bestCost = cost }
      }
      if (!best) continue
      name.lines.forEach((text, row) => {
        const left = bestSide === 0 ? best.left + 3 : bestSide === 1 ? best.right - 3 - widths[row] : (best.left + best.right - widths[row]) / 2
        write(text, left, best.top + line * (row + 0.5) + 0.5, widths[row], WHITE, name.alpha * born * (row ? 0.72 : 1), name.struck)
      })
      taken.push(best)
    }
    ctx.letterSpacing = '0px'
  }

  function draw(next: PetalModel): void {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const total = seenGathered
    const cleared = next.layers.filter(layer => layer.state === 'cleared').length
    for (const layer of next.layers) {
      const p = petals[layer.index - 1]
      if (p) drawPetal(p, layer, total, cleared)
    }
    drawCentre(total)
    drawNodes(next)
    drawLabels(next)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  function frame(now: number): void {
    if (disposed) return
    raf = requestAnimationFrame(frame)
    // A stall or a hidden tab must not skip a transition.
    clock += Math.min(0.05, Math.max(0, (now - last) / 1000))
    last = now
    frames++
    measure()
    sync(opts.getModel())
    if (width < 2 || height < 2) return
    // Still: draw only when something changed. Idle: the sway is slow enough
    // that every other frame is plenty.
    if (reduced ? !dirty : !dirty && clock > busyUntil && frames % 2 === 1) return
    const began = performance.now()
    if (model) draw(model)
    stat.ms += (performance.now() - began - stat.ms) * (stat.ms ? 0.08 : 1)
    dirty = false
  }

  function start(): void {
    if (raf || disposed) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  function stop(): void {
    cancelAnimationFrame(raf)
    raf = 0
  }

  function nodeAt(event: PointerEvent | MouseEvent): Hit | null {
    const box = canvas.getBoundingClientRect()
    const x = event.clientX - box.left, y = event.clientY - box.top
    let best: Hit | null = null, bestGap = Infinity
    for (const hit of hits) {
      const gap = Math.hypot(hit.x - x, hit.y - y)
      if (gap <= Math.max(hit.r + 8, touch ? 20 : 13) && gap < bestGap) { best = hit; bestGap = gap }
    }
    return best
  }

  const onPointerMove = (event: PointerEvent): void => {
    touch = event.pointerType === 'touch'
    if (touch) return
    const hit = nodeAt(event)
    canvas.style.cursor = hit?.open ? 'pointer' : ''
    if ((hit?.id ?? null) === hover) return
    hover = hit?.id ?? null
    // Pointing at a node chooses it. Pointing away leaves the choice alone, so
    // a choice made with the keys is not lost to a resting mouse.
    if (hover && hover !== model?.selected) opts.onSelect(hover)
    busyUntil = clock + 1
  }
  const onPointerLeave = (): void => {
    hover = null
    canvas.style.cursor = ''
  }
  const onPointerDown = (event: PointerEvent): void => { touch = event.pointerType === 'touch' }
  const onClick = (event: MouseEvent): void => {
    const hit = nodeAt(event)
    busyUntil = clock + 1
    if (!hit) { if (model?.selected) opts.onSelect(null); return }
    // A finger chooses first and enters on the second tap; a mouse has already
    // chosen by pointing.
    if (hit.open && (!touch || model?.selected === hit.id)) opts.onActivate(hit.id)
    else if (model?.selected !== hit.id) opts.onSelect(hit.id)
  }
  const onVisibility = (): void => {
    if (document.hidden) stop()
    else start()
  }

  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('click', onClick)
  document.addEventListener('visibilitychange', onVisibility)
  if (!document.hidden) start()

  return {
    dispose(): void {
      disposed = true
      stop()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('click', onClick)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.style.cursor = ''
      frameTimes.delete(canvas)
      petals.fill(null)
      hits = []
      model = null
    },
    // Sizes are picked up on the next frame anyway; this is for a caller who
    // wants it now.
    resize(): void {
      measure()
      dirty = true
    },
  }
}
