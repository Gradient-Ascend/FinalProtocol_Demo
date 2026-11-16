// The first reveal. The board the player just fought shrinks, its cells
// become dots, the dots become one dot, and that dot is at the root of a
// petal of dots; and the petal is one of three. It ends on the map as the map
// scene draws it, so fading out is arriving there.
//
// Also the flower itself (three petals of dots and what has gathered in the
// middle), which the ending draws again.
import { SIGN_LOOKS } from '../game/battle-renderer'
import { battleStore } from '../game/battle-store'
import { SIGILS } from '../game/sigils'
import { clamp01, easeInOutCubic, lerp, smoother, span } from './display'
import { petalHalfWidth } from './petal-map'
import { mulberry32 } from './point-field'
import { blip, both, lowTone } from './sound'
import { dot, drawBoard, rgbOf, signMask, type Cue, type Env, type Frame, type Moment } from './stage-kit'

// petal-map.ts keeps these to itself: a petal starts GAP cells from the middle of the map,
// is LENGTH cells long, and a sign's row `y` lies SIGN_BASE - y cells out from the petal's root.
const GAP = 2.3, LENGTH = 23.4, SIGN_BASE = 19.2, HALF = 9.3
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const AXES: [number, number][] = [[0, -1], [Math.cos(Math.PI / 6), 0.5], [-Math.cos(Math.PI / 6), 0.5]]
const SIGNS = [SIGILS.grove, SIGILS.court, SIGILS.carcosa]
// 0 while `v` is above `from`, 1 once it has fallen to `to`.
const fall = (v: number, from: number, to: number) => clamp01((from - v) / (from - to))
const HUES = [SIGN_LOOKS.grove?.hue ?? '#9FCB6B', SIGN_LOOKS.court?.hue ?? '#C4162E', SIGN_LOOKS.carcosa?.hue ?? '#FFC857']

const EXTENT = (() => {
  let side = 0, below = 0
  for (let i = 0; i <= 96; i++) {
    const along = i / 96, out = GAP + along * LENGTH, half = petalHalfWidth(along)
    side = Math.max(side, out * Math.cos(Math.PI / 6) + half * 0.5)
    below = Math.max(below, out * 0.5 + half * Math.cos(Math.PI / 6))
  }
  return { above: GAP + LENGTH, below, side }
})()

export type MapLayout = { cx: number; cy: number; cell: number }

/** Where the map scene puts its middle and how big it draws a cell: the same arithmetic as petal-map.ts. */
export function mapLayout(w: number, h: number): MapLayout {
  let left = 0, top = 0, width = w, height = h
  const canvas = document.querySelector('canvas[data-map]')
  if (canvas instanceof HTMLCanvasElement && canvas.clientWidth > 0) {
    const box = canvas.getBoundingClientRect()
    left = box.left; top = box.top; width = box.width; height = box.height
  }
  const padX = 18, padTop = 46, padBottom = 40, tall = EXTENT.above + EXTENT.below
  const cell = Math.max(3, Math.min((width - padX * 2) / (EXTENT.side * 2), (height - padTop - padBottom) / tall, 30))
  return { cx: left + width / 2, cy: top + padTop + cell * EXTENT.above + (height - padTop - padBottom - cell * tall) / 2, cell }
}

// x, y in map cells from the middle; petal 0..2, or 3 for what has gathered in the middle; `sign` marks dots on a god's sign.
export type Flower = { count: number; x: Float32Array; y: Float32Array; petal: Uint8Array; sign: Uint8Array; size: Float32Array }

export function buildFlower(gathered = 0): Flower {
  const xs: number[] = [], ys: number[] = [], petals: number[] = [], signs: number[] = [], sizes: number[] = []
  const rnd = mulberry32(0x9e7a1)
  AXES.forEach(([ax, ay], p) => {
    const put = (across: number, out: number, sign: number, size: number) => {
      xs.push(across * -ay + out * ax); ys.push(across * ax + out * ay); petals.push(p); signs.push(sign); sizes.push(size)
    }
    // a seed head, kept where it falls inside the petal
    const tries = 1750
    for (let i = 0; i < tries; i++) {
      const r = Math.sqrt((i + 0.5) / tries), th = i * GOLDEN
      const along = (r * Math.sin(th) + 1) / 2, across = r * Math.cos(th) * HALF * 1.04
      if (Math.abs(across) < petalHalfWidth(along) - 0.2) put(across, GAP + along * LENGTH, 0, 0.8 + 0.4 * rnd())
    }
    // its outline, dotted
    for (let s = 0.004; s < 1; s += 0.0108) {
      const half = petalHalfWidth(s)
      put(half, GAP + s * LENGTH, 0, 0.9)
      put(-half, GAP + s * LENGTH, 0, 0.9)
    }
    // the god's sign, crowded on top
    for (const [gx, gy] of SIGNS[p]) {
      for (let k = 0; k < 8; k++) {
        const a = rnd() * Math.PI * 2, d = 0.3 * Math.sqrt(-2 * Math.log(1 - rnd() * 0.98)) * 0.6
        put(gx - 7 + Math.cos(a) * d, GAP + SIGN_BASE - gy + Math.sin(a) * d, 1, 1.15)
      }
    }
  })
  for (let i = 0; i < gathered; i++) {
    const r = GAP * 0.74 * Math.sqrt((i + 0.5) / Math.max(180, gathered))
    xs.push(r * Math.cos(i * GOLDEN)); ys.push(r * Math.sin(i * GOLDEN)); petals.push(3); signs.push(0); sizes.push(1)
  }
  return { count: xs.length, x: Float32Array.from(xs), y: Float32Array.from(ys), petal: Uint8Array.from(petals), sign: Uint8Array.from(signs), size: Float32Array.from(sizes) }
}

/**
 * The flower into the additive buffer. `hue[p]` is how much of its god's
 * colour petal p carries (0 grey .. 1), `level[p]` how brightly it shows.
 */
export function drawFlower(f: Frame, flower: Flower, cx: number, cy: number, cell: number, alpha: number, hue: number[], level: number[]): void {
  if (alpha <= 0.003) return
  const white: [number, number, number] = [244, 244, 244]
  const colours = HUES.map((h, p) => { const c = rgbOf(h); return [lerp(white[0], c[0], hue[p]), lerp(white[1], c[1], hue[p]), lerp(white[2], c[2], hue[p])] as [number, number, number] })
  const size = Math.min(5, Math.max(1.15, cell * 0.085))
  const margin = 8
  for (let i = 0; i < flower.count; i++) {
    const x = cx + flower.x[i] * cell, y = cy + flower.y[i] * cell
    if (x < -margin || y < -margin || x > f.w + margin || y > f.h + margin) continue
    const p = flower.petal[i]
    if (p === 3) { dot(f, x, y, size, white, 0.6 * alpha); continue }
    dot(f, x, y, size * flower.size[i], colours[p], alpha * level[p] * (flower.sign[i] ? 1.5 : 1))
  }
}

export function revealMoment(env: Env): Moment {
  const { w, h, geo, reduced, small } = env
  const T = { start: 0.7, pulled: 5.4, out: 6.5, end: 7.0 }
  const state = battleStore.getSnapshot()
  const encounter = state.encounter
  const mask = signMask(encounter)
  const map = mapLayout(w, h)
  const flower = buildFlower(0)
  const ZOOM = 40
  const board = { x: geo.x + 7.5 * geo.cell, y: geo.y + 7.5 * geo.cell, side: geo.cell * 15 }
  const blue = rgbOf('#79BFFF'), white: [number, number, number] = [244, 244, 244]
  // How brightly each petal shows. The map keeps a locked petal at 0.12; here the two are held at twice that,
  // so that the petal the run is in is seen to be one of three. They sink to the map's level as this fades onto it.
  const LEVELS = [0.55, 0.24, 0.24]

  const cues: Cue[] = [
    // the first petal's own note comes up under the pull-back, and stays for the map to take over
    { at: T.start, fire: (s, when, keep) => { keep(lowTone(s.ctx, both(s, 'music'), 49, when, 3.5, { gain: 0.2 }), 2.5) } },
    { at: lerp(T.start, T.pulled, 0.74), fire: (s, when) => blip(s.ctx, both(s), when, 587.33, 0.04, 0.5) },
  ]

  return {
    length: T.end,
    cues,
    cover: t => Math.min(span(t, 0, 0.5), 1 - span(t, T.out, T.end - T.out)),
    draw(f) {
      const { ctx, t } = f
      ctx.fillStyle = '#070707'
      ctx.fillRect(0, 0, w, h)
      const k = span(t, T.start, T.pulled - T.start)
      const e = easeInOutCubic(k)
      f.field.clear()
      if (reduced) {
        // No zoom: the board gives way to the map, and the dot it was is ringed.
        const there = smoother(span(t, T.start + 1.2, 2.2))
        drawBoard(ctx, geo, encounter, mask, { alpha: 1 - there, labels: 0.6 })
        drawFlower(f, flower, map.cx, map.cy, map.cell, there, [0.9, 0, 0], LEVELS)
        dot(f, map.cx, map.cy, 4.5, blue, there)
        f.field.end(ctx, 1, 0.6)
        ctx.strokeStyle = `rgba(244,244,244,${(0.6 * there).toFixed(3)})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(map.cx, map.cy, 11, 0, Math.PI * 2)
        ctx.stroke()
        return
      }
      // One camera: the board is at the middle of the map, 40 times closer than the map will be seen.
      const scale = ZOOM ** (1 - e)                                   // how much bigger than the map's own scale
      const ox = lerp(board.x, map.cx, e)
      // on the way, the view rides up the first petal, so it is one petal before it is three
      const oy = lerp(board.y, map.cy, e) + Math.sin(Math.PI * clamp01((e - 0.3) / 0.7)) ** 2 * h * 0.3
      const side = board.side * scale / ZOOM
      const cell = side / 15
      // tiles while they can be seen as tiles
      const tiles = 1 - smoother(fall(scale / ZOOM, 0.5, 0.18))
      if (tiles > 0.01) drawBoard(ctx, { x: ox - side / 2, y: oy - side / 2, cell }, encounter, mask, { alpha: tiles, labels: clamp01(1 - k * 6) * 0.6 })
      // then 225 dots, drawing together until they are one
      const dots = 1 - tiles
      const one = smoother(fall(scale / ZOOM, 0.13, 0.03))
      if (dots > 0.01) {
        const gather = 1 - one
        const each = lerp(Math.max(1.3, cell * 0.16), 0, one)
        if (one < 1) {
          for (let i = 0; i < 225; i++) {
            const x = ((i % 15) - 7) * cell * gather, y = (Math.floor(i / 15) - 7) * cell * gather
            dot(f, ox + x, oy + y, Math.max(1.2, each), white, dots * (mask[i] ? 0.35 : 0.8) * (1 - one * 0.9))
          }
        }
        // the one: the dot the run is, on the map
        dot(f, ox, oy, lerp(2, small ? 4 : 5, one), [lerp(white[0], blue[0], one), lerp(white[1], blue[1], one), lerp(white[2], blue[2], one)], one)
      }
      // the petal it is at the root of; then the other two
      const petals = smoother(fall(scale / ZOOM, 0.42, 0.08))
      drawFlower(f, flower, ox, oy, map.cell * scale, petals, [0.9, 0, 0], LEVELS)
      f.field.end(ctx, 1, 0.6)
    },
  }
}
