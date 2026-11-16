// The three phase changes: a boss at half Robustness shows what it was. The
// battle is held while one plays. Each is a breach: for a few seconds
// something is on screen that the board cannot contain.
//
//   1.B  the mesh spreads past the board, and the edge of something vast
//        stands across the screen. Only its edge: the mother is never drawn.
//   2.B  the mask comes back, cracks and parts; behind it is no face but one
//        crowd of dots taking form after form.
//   3.B  a hole opens in the board where the sign's ring is empty. Behind it
//        is the surface from the opening, and a place in it where no point is
//        and no prediction arrives.
import script from '../story/script.json'
import type { Encounter } from '../game/encounters'
import { clamp01, easeInOutCubic, easeOutCubic, lerp, smoother, span, stepped } from './display'
import { bossOf, buildMask, drawMask } from './entrances'
import { mulberry32, wave } from './point-field'
import { blip, both, driftCluster, noiseTick, pulseTrain, shepardFall, vowel } from './sound'
import { dot, drawBoard, drawLiveBoard, font, rgbOf, signMask, type Cue, type Env, type Frame, type Moment } from './stage-kit'

const TAU = Math.PI * 2

// The board under a breach: the real one as it stands this frame, or a picture of it where there is none.
function boardUnder(f: Frame, encounter: Encounter, mask: Uint8Array, alpha = 1): void {
  if (!drawLiveBoard(f.ctx, f.geo, alpha)) drawBoard(f.ctx, f.geo, encounter, mask, { alpha, labels: 0 })
}

// ── 1.B: this was the young of it ────────────────────────────────────────

function grove(env: Env, encounter: Encounter): Moment {
  const { geo, small, reduced, short, w, h } = env
  const L = short ? 3 : 5
  const T = { spread: 0.9 * L / 5, trace: 1.3 * L / 5, traced: 2.0 * L / 5, leave: 4.0 * L / 5, out: 4.5 * L / 5, end: L }
  const mask = signMask(encounter)
  const boss = bossOf(encounter)
  const cell = geo.cell
  const bx = geo.x + (boss.pos.x + 0.5) * cell, by = geo.y + (boss.pos.y + 0.5) * cell
  const rim = rgbOf('#9FCB6B')
  const far = Math.hypot(Math.max(bx, w - bx), Math.max(by, h - by))

  // An arc of a circle far larger than the screen, from the lower left to the upper right.
  const p1 = { x: w * 0.16, y: h + 30 }, p2 = { x: w + 30, y: h * 0.14 }
  const radius = 2.3 * Math.max(w, h)
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2
  const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  const nx = (p1.y - p2.y) / chord, ny = (p2.x - p1.x) / chord                 // toward the lower right
  const away = Math.sqrt(radius * radius - chord * chord / 4)
  const cx = mx + nx * away, cy = my + ny * away
  const a1 = Math.atan2(p1.y - cy, p1.x - cx), a2 = Math.atan2(p2.y - cy, p2.x - cx)
  const rnd = mulberry32(encounter.seed ^ 0xa4c)
  const count = small ? 1100 : 2400
  const dots = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const edge = i < 900
    dots[i * 3] = rnd()                                                        // along the arc
    dots[i * 3 + 1] = edge ? 3 * rnd() ** 2 : 6 + (small ? 70 : 150) * rnd() ** 1.8 // how far inside the edge
    dots[i * 3 + 2] = edge ? 0.6 + 0.4 * rnd() : 0.5 * (1 - dots[i * 3 + 1] / (small ? 76 : 156)) ** 1.6
  }

  // What is behind the edge, as one picture made once: a path filled every frame beside the point buffer
  // costs Chrome 40 ms a frame at this size; a picture costs nothing.
  const body = document.createElement('canvas')
  body.width = Math.ceil(w / 2) + 2
  body.height = Math.ceil(h / 2) + 2
  {
    const picture = body.getContext('2d')
    if (picture) {
      picture.scale(0.5, 0.5)
      picture.fillStyle = '#010201'
      picture.beginPath()
      for (let i = -4; i <= 44; i++) {
        const a = lerp(a1, a2, i / 40)
        picture.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
      }
      picture.lineTo(w + 200, h + 200)
      picture.closePath()
      picture.fill()
    }
  }

  const cues: Cue[] = [{
    at: 0.1,
    fire: (s, when, keep) => {
      // the pitch the clicks became drops an octave, and something slower begins under it
      const train = keep(pulseTrain(s.ctx, both(s), when, { from: 64, to: 32, seconds: T.trace, gain: 0.3, attack: 0.6, under: 1 / 7 }), 2.5)
      train.level(0.16, when + T.leave, 1)
    },
  }]

  return {
    length: T.end,
    cues,
    cover: t => Math.min(span(t, 0, 0.4), 1 - span(t, T.end - 0.35, 0.35)),
    draw(f) {
      const { ctx, t } = f
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      boardUnder(f, encounter, mask)
      // the fine mesh leaves the board and crosses everything
      const out = span(t, T.out, T.end - T.out - 0.2)
      const spread = span(t, 0.1, T.spread)
      const reach = far * (reduced ? stepped(spread) : easeOutCubic(spread))
      if (reach > 1) {
        // hairlines as rectangles (strokes are slow), each as long as the circle it has reached is wide there
        ctx.globalAlpha = 0.3 * (1 - out)
        ctx.fillStyle = '#9FCB6B'
        const gap = cell / 4
        for (let x = geo.x - Math.ceil(geo.x / gap) * gap; x < w; x += gap) {
          const d = Math.abs(x - bx)
          if (d >= reach) continue
          const half = Math.sqrt(reach * reach - d * d)
          ctx.fillRect(Math.round(x), by - half, 0.6, half * 2)
        }
        for (let y = geo.y - Math.ceil(geo.y / gap) * gap; y < h; y += gap) {
          const d = Math.abs(y - by)
          if (d >= reach) continue
          const half = Math.sqrt(reach * reach - d * d)
          ctx.fillRect(bx - half, Math.round(y), half * 2, 0.6)
        }
        ctx.globalAlpha = 1
      }
      // The edge. It is traced, it stays where it is, and it goes.
      const traced = span(t, T.trace, T.traced - T.trace)
      const going = span(t, T.leave, T.out - T.leave)
      if (traced <= 0) return
      const slide = reduced ? 0 : going * going * Math.max(w, h) * 0.7
      const shown = reduced ? traced * (1 - going) : 1
      const ox = nx * slide, oy = ny * slide
      // what is behind the edge is not shown; it only hides what was there
      ctx.globalAlpha = 0.97 * (reduced ? shown : smoother(traced))
      ctx.drawImage(body, ox, oy, body.width * 2, body.height * 2)
      ctx.globalAlpha = 1
      f.field.clear()
      for (let i = 0; i < count; i++) {
        const u = dots[i * 3]
        if (!reduced && u > traced) continue
        const a = lerp(a1, a2, u), r = radius - dots[i * 3 + 1]
        const head = reduced ? 0 : Math.max(0, 1 - (traced - u) * 14) * (traced < 1 ? 1 : 0)
        dot(f, cx + ox + Math.cos(a) * r, cy + oy + Math.sin(a) * r, i < 900 ? (small ? 1.7 : 2.2) : 1.4, rim, Math.min(1, dots[i * 3 + 2] * shown + head * 0.5))
      }
      f.field.end(ctx, 1, 0.8)
    },
  }
}

// ── 2.B: the mask slips ──────────────────────────────────────────────────

type Shape = (x: number, y: number) => boolean
const disc = (x: number, y: number, cx: number, cy: number, r: number) => (x - cx) ** 2 + (y - cy) ** 2 < r * r
const capsule = (x: number, y: number, ax: number, ay: number, bx: number, by: number, r: number) => {
  const dx = bx - ax, dy = by - ay
  const k = clamp01(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))
  return (x - ax - dx * k) ** 2 + (y - ay - dy * k) ** 2 < r * r
}
// Five things it might be. x runs -0.5..0.5, y from 0 at the top to 1.
const FORMS: Shape[] = [
  // a crowned figure
  (x, y) => {
    const spike = Math.max(0, 1 - Math.abs(Math.abs(x) - 0.11) / 0.05, 1 - Math.abs(x) / 0.05)
    if (Math.abs(x) < 0.17 && y > 0.15 - 0.13 * spike && y < 0.19) return true
    if (disc(x, y, 0, 0.29, 0.095)) return true
    return y > 0.4 && y < 1 && Math.abs(x) < lerp(0.15, 0.38, (y - 0.4) / 0.6) && !(y < 0.48 && Math.abs(x) > 0.15 + (y - 0.4) * 1.2)
  },
  // a hand
  (x, y) => {
    if (Math.abs(x) < 0.21 && y > 0.52 && y < 0.92 && !(Math.abs(x) > 0.17 && (y < 0.56 || y > 0.88))) return true
    const tips = [0.2, 0.08, 0.04, 0.14]
    for (let i = 0; i < 4; i++) if (capsule(x, y, -0.155 + i * 0.103, 0.56, -0.165 + i * 0.11, tips[i], 0.046)) return true
    if (capsule(x, y, -0.19, 0.78, -0.39, 0.5, 0.05)) return true
    return Math.abs(x) < 0.14 && y >= 0.9 && y < 1
  },
  // a figure in a tall striped headcloth: the showman of the 1920 prose poem, who "looked like a Pharaoh"
  (x, y) => {
    const ax = Math.abs(x)
    const band = y % 0.06 < 0.037                                               // the stripes of the cloth
    const face = (x / 0.07) ** 2 + ((y - 0.245) / 0.095) ** 2
    if (face < 1) return true
    if (y < 0.4) {
      // the cloth: square over the brow, then spreading wide of the face down to the shoulders; a clear line round the face
      const half = y < 0.12 ? 0.12 + 0.04 * Math.sqrt(Math.max(0, y - 0.02) / 0.1) : lerp(0.16, 0.3, (y - 0.12) / 0.28)
      return y > 0.02 && ax < half && face > 1.7 && band
    }
    // its two ends hang on the chest, each with a clear line round it
    if (y < 0.57 && ax > 0.065 && ax < 0.145) return band
    if (y < 0.585 && ax > 0.05 && ax < 0.16) return false
    if (y < 0.425) return ax < 0.04                                             // the neck
    // a narrow body under all that cloth: shoulders, arms at the sides, a kilt, two legs
    if (capsule(x, y, 0.205 * Math.sign(x), 0.46, 0.215 * Math.sign(x), 0.7, 0.032)) return true
    if (y < 0.66) return ax < lerp(0.2, 0.1, (y - 0.425) / 0.235)
    if (y < 0.84) return ax < lerp(0.1, 0.14, (y - 0.66) / 0.18)
    return y < 1 && ax > 0.018 && ax < 0.085
  },
  // a man in a suit
  (x, y) => {
    const ax = Math.abs(x)
    if (disc(x, y, 0, 0.11, 0.08) || (ax < 0.033 && y > 0.18 && y < 0.24)) return true
    if (y > 0.23 && y < 0.62 && ax < lerp(0.235, 0.165, (y - 0.23) / 0.39) && !(y < 0.27 && ax > 0.2 - (0.27 - y) * 1.5)) {
      return !(y < 0.44 && ax < 0.055 * (1 - (y - 0.23) / 0.21) && ax > 0.012)          // the shirt front, with a tie down it
    }
    if (capsule(x, y, 0.225 * Math.sign(x), 0.3, 0.25 * Math.sign(x), 0.66, 0.042)) return true
    return y >= 0.62 && y < 1 && Math.abs(ax - 0.085) < 0.068
  },
  // nothing: an oval with no face on it
  (x, y) => (x / 0.27) ** 2 + ((y - 0.5) / 0.43) ** 2 < 1,
]

function court(env: Env, encounter: Encounter): Moment {
  const { small, reduced, short, w, h } = env
  const each = short ? 0.4 : 0.5
  const T = short
    ? { arrive: 0.3, crack: 0.3, part: 0.5, forms: 0.72, close: 0.72 + 5 * each, out: 0.72 + 5 * each + 0.3, end: 3.4 }
    : { arrive: 0.5, crack: 0.5, part: 0.8, forms: 1.15, close: 1.15 + 5 * each, out: 1.15 + 5 * each + 0.4, end: 4.5 }
  const mask = signMask(encounter)
  const shape = buildMask(env)
  const red: [number, number, number] = [236, 44, 66]
  const gapHalf = w * (small ? 0.36 : 0.2)
  // The same dots for every form: each form is where they all stand for half a second.
  const n = small ? 1200 : 2200
  const tall = Math.min(h * 0.74, gapHalf * 2 * 1.2), top = (h - tall) / 2
  const rnd = mulberry32(0xf0a5)
  const forms = FORMS.map(inside => {
    const pts: [number, number][] = []
    for (let guard = 0; pts.length < n && guard < n * 400; guard++) {
      const x = rnd() - 0.5, y = rnd()
      if (inside(x, y)) pts.push([x, y])
    }
    while (pts.length < n) pts.push([0, 0.5])
    // in bands from the top down, so a dot high in one form is high in the next: they flow, they do not swap
    pts.sort((a, b) => Math.floor(a[1] * 18) - Math.floor(b[1] * 18) || a[0] - b[0])
    const out = new Float32Array(n * 2)
    pts.forEach(([x, y], i) => { out[i * 2] = shape.ex + x * tall; out[i * 2 + 1] = top + y * tall })
    return out
  })

  // Everything but the eye is dark: one picture with a hole in it, made once, so no frame clips or fills a path.
  const dark = document.createElement('canvas')
  dark.width = Math.ceil(w / 2) + 1
  dark.height = Math.ceil(h / 2) + 1
  {
    const pen = dark.getContext('2d')
    if (pen) {
      pen.scale(0.5, 0.5)
      pen.fillStyle = '#000'
      pen.fillRect(0, 0, w + 2, h + 2)
      pen.globalCompositeOperation = 'destination-out'
      shape.eyePath(pen)
      pen.fill()
    }
  }

  const cues: Cue[] = []
  cues.push({ at: T.crack, fire: (s, when) => { for (let i = 0; i < 4; i++) noiseTick(s.ctx, s.master.sfx, when + i * 0.07, 2600 - i * 300, 0.14, 0.04, 1.4) } })
  cues.push({
    at: 0.05,
    fire: (s, when, keep) => {
      // her one note, and under it the same note a quarter-tone flat: it was never one voice
      const bus = both(s, 'music')
      keep(vowel(s.ctx, bus, 146.83, when, { gain: 0.17, attack: 0.4, vibrato: 0 }), 0.9).stop(when + T.out, 0.9)
      keep(vowel(s.ctx, bus, 146.83 * 2 ** (-50 / 1200), when + T.part, { gain: 0.17, attack: 0.5, vibrato: 0 }), 0.9).stop(when + T.out, 0.9)
    },
  })
  const wrong = [587.33, 622.25, 415.3, 493.88, 349.23]
  for (let i = 0; i < 5; i++) cues.push({ at: T.forms + i * each, fire: (s, when) => blip(s.ctx, both(s), when, wrong[i], 0.11, 0.5, 0.01) })

  return {
    length: T.end,
    cues,
    cover: t => Math.min(span(t, 0, 0.3), 1 - span(t, T.end - 0.3, 0.3)),
    draw(f) {
      const { ctx, t } = f
      const arrived = span(t, 0, T.arrive) * (1 - span(t, T.out, T.end - T.out - 0.25))
      const parted = easeInOutCubic(span(t, T.part, T.forms - T.part)) * (1 - easeInOutCubic(span(t, T.close, T.out - T.close)))
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      // the board is still where it was, in the eye, until the eye is in two
      boardUnder(f, encounter, mask, 1 - parted)
      ctx.drawImage(dark, 0, 0, dark.width * 2, dark.height * 2)
      f.field.clear()
      // Behind it: no face. One crowd, standing as one thing and then as another.
      if (parted > 0.02 && !reduced) {
        const at = (t - T.forms) / each
        const index = Math.max(0, Math.min(4, Math.floor(at))), next = Math.min(4, index + 1)
        const into = at < 0 ? 0 : clamp01((at - index - 0.56) / 0.44)
        const a = forms[index], b = forms[next]
        const e = easeInOutCubic(into)
        for (let i = 0; i < n; i++) {
          const bow = Math.sin(Math.PI * e) * ((i % 5) - 2) * 3
          dot(f, lerp(a[i * 2], b[i * 2], e) + bow, lerp(a[i * 2 + 1], b[i * 2 + 1], e), i % 7 === 0 ? 2.8 : 2, red, parted)
        }
      }
      if (parted > 0.02 && !reduced) f.field.end(ctx, 1, 0.55)
      drawMask(f, shape, arrived, 1, reduced ? 0 : parted * gapHalf)
      // the crack: nine segments, top to bottom
      const cracked = span(t, T.crack, T.part - T.crack)
      if (cracked > 0 && parted < 0.5) {
        ctx.fillStyle = `rgba(243,237,226,${(0.9 * arrived * (1 - parted * 2)).toFixed(3)})`
        const run = cracked * (shape.crack.length - 1)
        for (let i = 0; i < shape.crack.length - 1 && i < run; i++) {
          const [x0, y0] = shape.crack[i], [x1, y1] = shape.crack[i + 1]
          const part = Math.min(1, run - i), steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2)
          for (let s = 0; s <= steps * part; s++) {
            const px = lerp(x0, x1, s / steps), py = lerp(y0, y1, s / steps)
            if (!shape.inEye(px, py)) ctx.fillRect(px - 0.8, py - 0.8, 1.6, 1.6)
          }
        }
      }
      // Under reduced motion nothing slides: a band of the mask goes dark where the halves would have opened,
      // and one form fades as the next arrives, the same number of dots throughout.
      if (reduced && parted > 0) {
        ctx.fillStyle = `rgba(0,0,0,${parted.toFixed(3)})`
        ctx.fillRect(shape.ex - gapHalf, 0, gapHalf * 2, h)
        f.field.clear()
        const at = (t - T.forms) / each
        const index = Math.max(0, Math.min(4, Math.floor(at))), next = Math.min(4, index + 1)
        const into = at < 0 ? 0 : clamp01((at - index - 0.56) / 0.44)
        for (let i = 0; i < n; i++) {
          dot(f, forms[index][i * 2], forms[index][i * 2 + 1], 1.8, red, 0.8 * parted * (1 - into))
          if (into > 0) dot(f, forms[next][i * 2], forms[next][i * 2 + 1], 1.8, red, 0.8 * parted * into)
        }
        f.field.end(ctx, 1, 0.55)
      }
    },
  }
}

// ── 3.B: the true form ───────────────────────────────────────────────────

function carcosa(env: Env, encounter: Encounter): Moment {
  const { geo, small, reduced, short, w, h } = env
  const L = short ? 3.4 : 6
  const T = { open: 0.9 * L / 6, predict: 2.1 * L / 6, stopped: 4.0 * L / 6, close: 5.2 * L / 6, end: L }
  const boss = bossOf(encounter)
  const cell = geo.cell
  const cx = geo.x + (boss.pos.x + 0.5) * cell, cy = geo.y + (boss.pos.y + 0.5) * cell
  const rings = 3                                                    // the hole grows a ring of cells at a time, to 7 by 7: the inside of the sign's ring
  const half = (rings + 0.5) * cell
  const side = small ? 46 : 74
  const world = 3.3, scale = half / world
  const R = 0.82                                                     // the place with no points, in the surface's own units
  const rnd = mulberry32(encounter.seed ^ 0x7e11)
  const grid = new Float32Array(side * side * 2)
  for (let i = 0; i < side * side; i++) {
    grid[i * 2] = -world + ((i % side) + 0.5 + (rnd() - 0.5) * 0.7) * (2 * world / side)
    grid[i * 2 + 1] = -world + (Math.floor(i / side) + 0.5 + (rnd() - 0.5) * 0.7) * (2 * world / side)
  }
  // Guesses: each sets out from the rim of the hole toward the middle, and stops where the surface stops.
  const guesses = Array.from({ length: small ? 90 : 170 }, () => {
    const a = rnd() * TAU, from = world * (1.05 + 0.3 * rnd())
    return { a, from, stop: R * (1.03 + 0.1 * rnd() ** 2), leaves: T.predict + rnd() * (T.stopped - T.predict) * 0.75, takes: 0.5 + 0.5 * rnd(), jitter: rnd() * TAU }
  })
  const white: [number, number, number] = [245, 245, 245], blue: [number, number, number] = [94, 230, 255]
  const readout = ((script.cg.movements.find(m => m.id === 'latent') as { hud?: string } | undefined)?.hud ?? '{error}').replace('{error}', 'NaN')

  const cues: Cue[] = [{
    at: 0.1,
    fire: (s, when, keep) => {
      const bus = both(s, 'music')
      keep(driftCluster(s.ctx, bus, when, { gain: 0.2, rise: 2.4 }), 3)
      // under it, a fall that does not arrive
      keep(shepardFall(s.ctx, bus, when + 0.3, T.end + 2, { secondsPerOctave: 13, gain: 0.16, attack: 1.5 }), 2.5)
    },
  }]
  for (const g of guesses.filter((_, i) => i % 9 === 0)) cues.push({ at: g.leaves + g.takes, fire: (s, when) => blip(s.ctx, s.master.sfx, when, 587.33 * 2 ** ([0, 3, 7, 10][Math.floor(g.jitter) % 4] / 12), 0.014, 0.12) })

  return {
    length: T.end,
    cues,
    cover: () => 1,
    draw(f) {
      const { ctx, t } = f
      // Everything but the hole is the game, at a quarter of its light for as long as the hole is open:
      // this canvas is black over it, eased in and out so that nothing jumps.
      const opening = span(t, 0.15, T.open), closing = span(t, T.close, T.end - T.close - 0.1)
      const dim = 0.75 * Math.min(smoother(opening), 1 - smoother(closing))
      if (dim > 0.002) {
        ctx.fillStyle = `rgba(0,0,0,${dim.toFixed(3)})`
        ctx.fillRect(0, 0, w, h)
      }
      const open = Math.min(reduced ? stepped(opening) : opening, 1 - closing) * (rings + 1)
      const ring = Math.min(rings, Math.floor(open - 0.001))
      if (open <= 0.001) return
      const reach = (ring + 0.5) * cell
      ctx.save()
      ctx.beginPath()
      ctx.rect(cx - reach, cy - reach, reach * 2 + 1, reach * 2 + 1)
      ctx.clip()
      ctx.fillStyle = '#000'
      ctx.fillRect(cx - reach, cy - reach, reach * 2 + 1, reach * 2 + 1)
      // dim while the hole is still opening or already closing; nothing at all in its first cell
      const light = ring < 1 ? 0 : lerp(0.45, 1, clamp01(open - rings))
      // The surface, from above. It bends round a place where it is not.
      const time = (reduced ? 0.3 : 1) * f.now
      f.field.clear()
      for (let i = 0; i < side * side; i++) {
        const x = grid[i * 2], z = grid[i * 2 + 1]
        const r2 = x * x + z * z
        if (r2 < R * R) continue
        const k = R * R / r2
        const px = x + k * x * 0.6, pz = z + k * z * 0.6
        if (Math.abs(px) > world || Math.abs(pz) > world) continue
        const height = wave(px * 1.4, pz * 1.4, time)
        dot(f, cx + px * scale, cy + pz * scale - height * cell * 0.16, small ? 1.3 : 1.6, white, light * (0.28 + 0.62 * clamp01(0.5 + height)))
      }
      for (const g of guesses) {
        const k = clamp01((t - g.leaves) / g.takes)
        if (k <= 0) continue
        const e = reduced ? 1 : easeOutCubic(k)
        const r = lerp(g.from, g.stop, e) + (k >= 1 && !reduced ? 0.012 * Math.sin(f.now * 3 + g.jitter) : 0)
        dot(f, cx + Math.cos(g.a) * r * scale, cy + Math.sin(g.a) * r * scale, small ? 1.8 : 2.4, blue, light * (reduced ? k : 1) * 0.9)
      }
      f.field.end(ctx, 1, 0.75)
      ctx.restore()
      // the edge of the hole: one hairline, so it reads as cut and not as a panel
      ctx.strokeStyle = 'rgba(255,200,87,0.22)'
      ctx.lineWidth = 1
      ctx.strokeRect(cx - reach + 0.5, cy - reach + 0.5, reach * 2, reach * 2)
      // What the opening measured, measured here: under the hole, on the dimmed board, at a size to be read from across a room.
      const read = span(t, T.predict + (T.stopped - T.predict) * 0.55, 0.5) * (1 - closing * 3)
      if (read > 0 && ring === rings) {
        const px = Math.min(small ? 18 : 34, Math.floor(reach * 2 / (readout.length * 0.62)))
        ctx.globalAlpha = 0.92 * read
        ctx.fillStyle = '#f5f5f5'
        ctx.font = font(px, 600)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(readout, cx - reach, cy + reach + Math.round(px * 0.4))
        ctx.globalAlpha = 1
      }
    },
  }
}

export function phaseFor(encounter: Encounter): ((env: Env) => Moment) | null {
  if (encounter.kind !== 'boss') return null
  if (encounter.god === 'grove') return env => grove(env, encounter)
  if (encounter.god === 'court') return env => court(env, encounter)
  if (encounter.god === 'carcosa') return env => carcosa(env, encounter)
  return null
}
