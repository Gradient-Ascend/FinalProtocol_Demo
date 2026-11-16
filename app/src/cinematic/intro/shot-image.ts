// Movement 2: sight. The first picture resolves as a field of dots, is cut
// into 14 x 14 patches, and is looked at: the six heads of the last layer one
// after another, then their mean, with the class token's marker on whatever
// it attends to most. Then the 196 patches leave the grid in raster order and
// fall into one line under the text. The image has become a sentence.
import { CG_IMAGE_SIZE, renderHand } from '../cg-image'
import { clamp01, easeInOutCubic, easeOutCubic, lerp, local, span } from '../display'
import { mulberry32 } from '../point-field'
import { GAMMA, WHITE, bandCell, bandValues, breath, count, drawBandRow, flight, font, type Frame, type Layout } from './common'
import { VISION, movement } from './data'
import { PLAN } from './plan'

const G = VISION.grid, N = G * G
const P = PLAN.image
const HUD = movement('image').hud
const SCAN = (P.resolved - P.resolve) * 0.72 / N          // the score sounds one patch every SCAN seconds
const ARRIVE = 0.6                                         // seconds for one dot to find its place

// Six heads, then their mean: what each shows of the picture, 0..1.
const MAPS: Float32Array[] = [...VISION.heads, VISION.mean].map(m => Float32Array.from(m, v => Math.pow(v / 255, GAMMA)))
const PEAKS = [...VISION.peak.heads, VISION.peak.mean]

// Where the class token's marker stands: each head's strongest patch, then the mean's four strongest in turn.
const strongest = (m: number[], n: number) => m.map((_, i) => i).sort((a, b) => m[b] - m[a]).slice(0, n)
const MARKS: { at: number; patch: number }[] = [
  ...VISION.heads.map((m, h) => ({ at: P.heads + h * P.headDur, patch: strongest(m, 1)[0] })),
  ...strongest(VISION.mean, 4).map((patch, j) => ({ at: P.mean + j * 0.7, patch })),
]

type Dots = {
  per: number                        // dots along one side of a patch
  lum: Float32Array                  // 0..1, the picture under each dot
  u: Float32Array                    // place inside its patch, 0..1
  v: Float32Array
  patch: Uint16Array
  sx: Float32Array                   // where it comes from when the picture resolves, in patch widths
  sy: Float32Array
  late: Float32Array                 // 0..1: dots of one patch do not all arrive together
}

function buildDots(per: number): Dots {
  const picture = renderHand()
  const n = N * per * per, px = CG_IMAGE_SIZE / G / per       // source pixels under one dot
  const dots: Dots = {
    per, lum: new Float32Array(n), u: new Float32Array(n), v: new Float32Array(n), patch: new Uint16Array(n),
    sx: new Float32Array(n), sy: new Float32Array(n), late: new Float32Array(n),
  }
  const rnd = mulberry32(196)
  let d = 0
  for (let p = 0; p < N; p++) {
    const x0 = (p % G) * per, y0 = Math.floor(p / G) * per
    for (let j = 0; j < per; j++) {
      for (let i = 0; i < per; i++, d++) {
        // mean of the source pixels this dot stands for
        const ax = Math.floor((x0 + i) * px), bx = Math.max(ax + 1, Math.round((x0 + i + 1) * px))
        const ay = Math.floor((y0 + j) * px), by = Math.max(ay + 1, Math.round((y0 + j + 1) * px))
        let sum = 0
        for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) sum += picture[y * CG_IMAGE_SIZE + x]
        dots.lum[d] = sum / ((bx - ax) * (by - ay))
        dots.u[d] = (i + 0.5) / per
        dots.v[d] = (j + 0.5) / per
        dots.patch[d] = p
        const angle = rnd() * Math.PI * 2, far = 0.6 + 2.6 * rnd() * rnd()
        dots.sx[d] = Math.cos(angle) * far
        dots.sy[d] = Math.sin(angle) * far
        dots.late[d] = rnd()
      }
    }
  }
  return dots
}

export class ImageShot {
  private dots: Dots | null = null
  // per patch, per frame
  private readonly ox = new Float32Array(N)
  private readonly oy = new Float32Array(N)
  private readonly pw = new Float32Array(N)
  private readonly ph = new Float32Array(N)
  private readonly alpha = new Float32Array(N)
  private readonly weight = new Float32Array(N)
  private readonly shrink = new Float32Array(N)

  /** The picture is drawn once, in the dark of shot 0. */
  prepare(small = false): Dots {
    const per = small ? 6 : 8                                // 7,056 dots on a phone, 12,544 on a desk
    if (!this.dots || this.dots.per !== per) this.dots = buildDots(per)
    return this.dots
  }

  draw(f: Frame, L: Layout): void {
    const { ctx, t } = f
    const boost = breath(t, P.beat)
    drawBandRow(f, L, 0, 1, boost, span(t, P.start, 0.6))
    if (t >= P.landed) drawBandRow(f, L, 1, 1, boost, span(t, P.landed, 0.4))
    this.hud(f)
    if (t < P.resolve || t >= P.landed) return

    const dots = this.prepare(L.small)
    const side = Math.floor(Math.min(f.h * 0.5, 2 * (L.stageY - L.margin), f.w - 2 * L.margin - (L.small ? 12 : 0)) / G) * G
    const cell = side / G, pitch = cell / dots.per
    const sep = f.reduced ? span(t, P.cut + 0.5, P.apart - P.cut - 0.5) : easeInOutCubic(span(t, P.cut + 0.5, P.apart - P.cut - 0.5))
    const gap = (L.small ? 2 : 3) * sep
    const left = f.w / 2 - side / 2, top = L.stageY - side / 2
    const mid = (G - 1) / 2

    // --- what the picture shows: itself, then one head after another, then their mean ---
    const lit = span(t, P.heads - 0.15, 0.5)                 // 0 the picture, 1 attention
    let stage = 0
    while (stage < MAPS.length - 1 && t >= P.heads + (stage + 1) * P.headDur) stage++
    const into = stage === 0 ? 1 : span(t, P.heads + stage * P.headDur, 0.28)
    const from = MAPS[Math.max(0, stage - 1)], to = MAPS[stage]

    // --- where each patch is ---
    const falling = t >= P.fall
    for (let p = 0; p < N; p++) {
      const c = p % G, r = Math.floor(p / G)
      const x = left + c * cell + (c - mid) * gap, y = top + r * cell + (r - mid) * gap
      this.weight[p] = lerp(from[p], to[p], into)
      if (!falling) {
        this.ox[p] = x; this.oy[p] = y; this.pw[p] = cell; this.ph[p] = cell
        this.alpha[p] = 1; this.shrink[p] = 1
        continue
      }
      const k = local(t, P.fall, p, P.stagger, P.flight)
      const home = bandCell(L, 1, p), value = bandValues[1][p]
      if (f.reduced) {
        // no flight: the patch fades where it stands while its place in the line fills
        this.ox[p] = x; this.oy[p] = y; this.pw[p] = cell; this.ph[p] = cell
        this.alpha[p] = 1 - k; this.shrink[p] = 1
        if (k > 0) {
          ctx.fillStyle = `rgba(${WHITE},${(value * k * boost).toFixed(3)})`
          ctx.fillRect(home.x, L.band.y[1], home.w, L.band.rowH)
        }
        continue
      }
      const at = flight(k, x, y, home.x, L.band.y[1], cell * 0.9)
      const solid = span(at.e, 0.5, 0.5)                     // dots give way to one cell as it lands
      this.ox[p] = at.x; this.oy[p] = at.y
      this.pw[p] = lerp(cell, home.w, at.e); this.ph[p] = lerp(cell, L.band.rowH, at.e)
      this.alpha[p] = 1 - solid
      this.shrink[p] = lerp(1, 0.45, at.e)
      if (solid > 0) {
        ctx.fillStyle = `rgba(${WHITE},${(value * solid * boost).toFixed(3)})`
        ctx.fillRect(at.x, at.y, this.pw[p], this.ph[p])
      }
    }

    // --- a quiet cell under each patch while it is being looked at ---
    if (lit > 0 && !falling) {
      ctx.fillStyle = `rgb(${WHITE})`
      for (let p = 0; p < N; p++) {
        ctx.globalAlpha = 0.13 * lit * this.weight[p]
        ctx.fillRect(this.ox[p], this.oy[p], cell, cell)
      }
      ctx.globalAlpha = 1
    }

    // --- the dots ---
    const field = f.field, s = field.scale
    field.clear()
    const resolving = t < P.resolved + ARRIVE + 0.3
    const { lum, u, v, patch, sx, sy, late } = dots
    for (let d = 0; d < lum.length; d++) {
      const p = patch[d]
      let a = this.alpha[p]
      if (a <= 0.004) continue
      let x = this.ox[p] + u[d] * this.pw[p], y = this.oy[p] + v[d] * this.ph[p]
      if (resolving) {
        const k = clamp01((t - P.resolve - 0.25 - p * SCAN - late[d] * 0.22) / ARRIVE)
        if (k <= 0) continue
        if (!f.reduced) {
          const off = (1 - easeOutCubic(k)) * cell
          x += sx[d] * off; y += sy[d] * off
        }
        a *= k
      }
      // under attention the picture dims to a ghost and the looked-at patches come up whole
      const w = this.weight[p]
      const tone = lit > 0 ? lerp(lum[d], lerp(lum[d] * 0.16, 0.3 + 0.7 * lum[d], w), lit) : lum[d]
      const size = pitch * 0.92 * Math.sqrt(clamp01(tone * 1.05)) * this.shrink[p]
      field.splat(x * s, y * s, Math.max(0.5, size * s), 245, 245, 245, (0.24 + 0.76 * tone) * a)
    }
    field.end(ctx, 1, 0.36)

    // --- the cut: hairlines, drawn one after another, that the gaps then replace ---
    const cutAlpha = (1 - sep) * (falling ? 0 : 1)
    if (t >= P.cut && cutAlpha > 0.01) {
      ctx.fillStyle = `rgba(${WHITE},${(0.34 * cutAlpha).toFixed(3)})`
      for (let i = 1; i < G; i++) {
        const k = f.reduced ? span(t, P.cut, 0.4) : easeOutCubic(local(t, P.cut, i - 1, 0.018, 0.36))
        if (k <= 0) continue
        ctx.fillRect(Math.round(left + i * cell), top, 1, side * k)
        ctx.fillRect(left, Math.round(top + i * cell), side * k, 1)
      }
    }

    this.marker(f, L, left - mid * gap, top - mid * gap, cell, gap)
  }

  // The class token's own mark: a label, a line, and a square on the patch it attends to most.
  private marker(f: Frame, L: Layout, left: number, top: number, cell: number, gap: number): void {
    const { ctx, t } = f
    const show = span(t, MARKS[0].at - 0.1, 0.3) * (1 - span(t, P.fall - 0.25, 0.3))
    if (show <= 0.01) return
    let i = 0
    while (i < MARKS.length - 1 && t >= MARKS[i + 1].at) i++
    const here = MARKS[i].patch, before = MARKS[Math.max(0, i - 1)].patch
    const k = f.reduced || i === 0 ? 1 : easeOutCubic(span(t, MARKS[i].at, 0.2))
    const step = cell + gap
    const px = lerp(left + (before % G) * step, left + (here % G) * step, k)
    const py = lerp(top + Math.floor(before / G) * step, top + Math.floor(here / G) * step, k)
    ctx.font = font(L.hudFs)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = `rgba(${WHITE},${(0.62 * show).toFixed(3)})`
    // above the picture's corner, or beside it where the frame leaves no room above
    const label = '[CLS]', width = ctx.measureText(label).width
    const above = top - 12 >= L.hudFs + 6
    const lx = above ? left : left - width - 10, ly = above ? top - 12 : top + L.hudFs
    ctx.fillText(label, lx, ly)
    const from = { x: lx + width + 5, y: ly - L.hudFs * 0.35 }
    ctx.strokeStyle = `rgba(${WHITE},${(0.42 * show).toFixed(3)})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(px + cell / 2, py + cell / 2)
    ctx.stroke()
    ctx.strokeStyle = `rgba(${WHITE},${(0.9 * show).toFixed(3)})`
    ctx.strokeRect(Math.round(px) - 1.5, Math.round(py) - 1.5, Math.round(cell) + 3, Math.round(cell) + 3)
  }

  private hud(f: Frame): void {
    const { t } = f
    if (t < P.resolve) return
    const parts = HUD.split(' · ')
    if (t < P.heads - 0.15) {
      // nothing is attending yet: only what the picture is cut into
      let arrived = 0
      while (arrived < N && t >= P.resolve + 0.25 + arrived * SCAN) arrived++
      f.hud.push({ text: parts.slice(0, 2).join(' · ') })
      f.hud.push({ text: t < P.cut ? `patch ${arrived}/${N}` : `${N} × ${16 * 16} = ${count(N * 256)} px`, alpha: 0.7 })
    } else {
      let stage = 0
      while (stage < MAPS.length - 1 && t >= P.heads + (stage + 1) * P.headDur) stage++
      const mean = stage === MAPS.length - 1
      const named = HUD.replace('head {head}/6', 'mean of 6 heads')
      f.hud.push({ text: mean ? (named === HUD ? HUD.replace('{head}', 'mean') : named) : HUD.replace('{head}', String(stage + 1)) })
      let landed = 0
      while (landed < N && t >= P.fall + landed * P.stagger + P.flight) landed++
      f.hud.push({
        text: t < P.fall ? `max ${PEAKS[stage].toFixed(3)} · uniform ${(1 / N).toFixed(3)}` : `${landed}/${N} in line`,
        alpha: 0.7,
      })
    }
    f.hudAlpha = span(t, P.resolve, 0.4) * (1 - span(t, P.end - 0.45, 0.45))
  }
}
