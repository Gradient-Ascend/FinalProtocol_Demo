// Shot 0 and movement 1: one cursor in the dark, then text. Tokens arrive one
// at a time and every earlier token's brightness moves to the newest token's
// real attention row. Then the tremble: the stream stops, and the view pulls
// back until the paragraph is the bottom row of a triangle of every row there
// ever was, and that triangle is one of the 36 the row was averaged from.
import { clamp01, easeInOutCubic, easeOutCubic, lerp, local, pullBack, span } from '../display'
import { BAND_COUNTS, GAMMA, Shade, WHITE, bandCell, bandValues, count, font, layTokens, type Frame, type Layout, type TokenBox } from './common'
import { CONTEXT, headMatrices, movement, wordWeights } from './data'
import { PLAN } from './plan'

const T = CONTEXT.tokens.length
const LINES = movement('text').lines
const firstOf = LINES.map((_, n) => CONTEXT.lineOf.indexOf(n))
const lastOf = LINES.map((_, n) => CONTEXT.lineOf.lastIndexOf(n))
const SEAM_LINES = 2                 // the first lines show their token seams and ids
const P = PLAN.text

type Cam = { c: number; ox: number; oy: number }
type Arc = { from: number; to: number; born: number; share: number }

// Brightness of every cell of the triangle: row t is what the paragraph looked like when token t arrived.
const cellAlpha: Float32Array[] = CONTEXT.rows.map((_, t) => Float32Array.from(wordWeights(CONTEXT, t), v => 0.06 + 0.94 * Math.pow(v, GAMMA)))

export class TextShot {
  private readonly shade = new Shade(CONTEXT, 0.3)
  private boxes: TokenBox[] = []
  private baseline: number[] = []
  private x0 = 0
  private laidFor = ''
  private arcs: Arc[] = []
  private lastCount = 0
  private atlas: HTMLCanvasElement | null = null
  private atlasCell = 3

  /** The one heavy thing this shot needs, made in the dark of shot 0: the bitmap of the 36 matrices. */
  prepare(): void {
    this.wallAtlas()
  }

  /** The cursor's first position: where the first token will be written. */
  private lay(f: Frame, L: Layout): void {
    const key = `${f.w}x${f.h}`
    if (this.laidFor === key) return
    this.laidFor = key
    const { ctx } = f
    ctx.font = font(L.fs)
    // wide screens put the captions left of the column: leave them room on both sides, so the column stays centred
    const column = Math.min(62 * ctx.measureText('M').width, f.w - 2 * L.margin - (L.small ? 8 : 220))
    const laid = layTokens(ctx, CONTEXT.tokens, column, CONTEXT.wordOf, firstOf)
    const gap = Math.round(L.lh * (L.small ? 0.62 : 0.3))               // between script lines; small screens put the caption in it
    const height = laid.rows * L.lh + (LINES.length - 1) * gap
    const top = Math.round(f.h * 0.43 - height / 2 + L.fs)
    this.boxes = laid.boxes
    this.baseline = laid.boxes.map((b, i) => top + b.row * L.lh + CONTEXT.lineOf[i] * gap)
    this.x0 = Math.round((f.w - column) / 2) + (L.small ? 4 : 0)
  }

  // --- the three camera framings of the pull-back, as cell size and the triangle's top-left corner ---

  private rowCam(f: Frame, L: Layout): Cam {
    const c = Math.min((f.w - 2 * L.margin) / T, L.small ? 9 : 21)
    return { c, ox: (f.w - T * c) / 2, oy: f.h * 0.8 - (T - 1) * c }
  }

  private triangleCam(f: Frame, L: Layout): Cam {
    const c = Math.min(0.7 * f.h / T, (f.w - 2 * L.margin) / T)
    return { c, ox: (f.w - T * c) / 2, oy: f.h * 0.45 - T * c / 2 }
  }

  // The wall under the triangle: the 36 matrices in a grid, drawn at `q` of the triangle's scale.
  private wallShape(f: Frame): { cols: number; rows: number; q: number; gap: number; width: number; height: number; top: number } {
    const wide = f.w / f.h > 1.1
    const cols = wide ? 12 : 6, rows = 36 / cols, q = wide ? 0.4 : 0.5
    const gap = 0.12 * q * T
    return { cols, rows, q, gap, width: cols * q * T + (cols - 1) * gap, height: rows * q * T + (rows - 1) * gap, top: T * 1.32 }
  }

  private wallCam(f: Frame, L: Layout): Cam {
    const s = this.wallShape(f)
    const total = s.top + s.height
    const c = Math.min((f.w - 2 * L.margin) / s.width, 0.76 * f.h / total)
    return { c, ox: f.w / 2 - T * c / 2, oy: f.h * 0.455 - total * c / 2 }
  }

  private blend(a: Cam, b: Cam, k: number): Cam {
    const e = easeInOutCubic(clamp01(k))
    return { c: pullBack(a.c, b.c, k), ox: lerp(a.ox, b.ox, e), oy: lerp(a.oy, b.oy, e) }
  }

  // One bitmap holding all 36 matrices, made once: 65,880 cells are too many to fill one by one each frame.
  private wallAtlas(): HTMLCanvasElement {
    if (this.atlas) return this.atlas
    const m = headMatrices(), ps = this.atlasCell
    const canvas = document.createElement('canvas')
    canvas.width = 12 * T * ps
    canvas.height = 3 * T * ps
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const image = ctx.createImageData(canvas.width, canvas.height), d = image.data
      for (let tile = 0; tile < m.count; tile++) {
        const tx = (tile % 12) * T * ps, ty = Math.floor(tile / 12) * T * ps
        let o = tile * m.cells
        for (let r = 0; r < T; r++) {
          let max = 1
          for (let j = 0; j <= r; j++) max = Math.max(max, m.values[o + j])
          for (let j = 0; j <= r; j++) {
            const w = (m.values[o + j] / max) ** 2                       // stored as 15 * sqrt(weight)
            const v = Math.round(245 * (0.05 + 0.95 * Math.pow(w, GAMMA)))
            for (let py = 0; py < ps - 1; py++) for (let px = 0; px < ps - 1; px++) {
              const at = ((ty + r * ps + py) * canvas.width + tx + j * ps + px) * 4
              d[at] = d[at + 1] = d[at + 2] = v
              d[at + 3] = 255
            }
          }
          o += r + 1
        }
      }
      ctx.putImageData(image, 0, 0)
    }
    this.atlas = canvas
    return canvas
  }

  private drawTriangle(f: Frame, cam: Cam, alpha: number, rowAlpha: (r: number) => number): void {
    if (alpha <= 0.003) return
    const { ctx } = f
    const gap = cam.c >= 6 ? 1.5 : cam.c >= 3 ? 1 : 0.4
    const s = Math.max(0.8, cam.c - gap)
    ctx.fillStyle = `rgb(${WHITE})`
    for (let r = 0; r < T; r++) {
      const ra = rowAlpha(r) * alpha * (r === T - 1 ? 1 : 0.82)
      if (ra <= 0.003) continue
      const row = cellAlpha[r], y = cam.oy + r * cam.c
      for (let j = 0; j <= r; j++) {
        ctx.globalAlpha = row[j] * ra
        ctx.fillRect(cam.ox + j * cam.c, y, s, s)
      }
    }
    // The row the viewer was reading, underlined.
    ctx.globalAlpha = 0.55 * alpha * rowAlpha(T - 2)
    ctx.fillRect(cam.ox, cam.oy + T * cam.c + Math.max(2, cam.c * 0.35), T * cam.c - gap, 1)
    ctx.globalAlpha = 1
  }

  private drawWall(f: Frame, cam: Cam, alpha: number, tileAlpha: (i: number) => number): void {
    if (alpha <= 0.003) return
    const { ctx } = f
    const s = this.wallShape(f), atlas = this.wallAtlas(), src = T * this.atlasCell
    const size = s.q * T * cam.c
    const left = cam.ox + (T / 2 - s.width / 2) * cam.c, top = cam.oy + s.top * cam.c
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    for (let i = 0; i < 36; i++) {
      const a = tileAlpha(i) * alpha
      if (a <= 0.003) continue
      const col = i % s.cols, row = Math.floor(i / s.cols)
      ctx.globalAlpha = a
      ctx.drawImage(atlas, (i % 12) * src, Math.floor(i / 12) * src, src, src,
        left + col * (size + s.gap * cam.c), top + row * (size + s.gap * cam.c), size, size)
    }
    // A hairline from the triangle to what it is the mean of.
    ctx.globalAlpha = 0.22 * alpha * tileAlpha(35)
    ctx.fillStyle = `rgb(${WHITE})`
    ctx.fillRect(f.w / 2, cam.oy + T * cam.c + 0.1 * T * cam.c, 1, 0.14 * T * cam.c)
    ctx.fillRect(left, top - 0.08 * T * cam.c, s.width * cam.c, 1)
    ctx.globalAlpha = 1
  }

  draw(f: Frame, L: Layout): void {
    this.lay(f, L)
    const { ctx, t } = f
    const hudLine = movement('text').hud

    // --- shot 0: wake. One cursor; it sizes the dark. ---
    if (t < P.start) {
      const on = PLAN.wake.blinks.some(b => t >= b && t < b + PLAN.wake.blinkOn)
      if (on) this.cursor(f, L, this.x0, this.baseline[0], 0.92)
      return
    }

    let n = 0
    while (n < T && PLAN.contextTimes[n] <= t) n++

    if (t < P.pull) {
      this.stream(f, L, n)
      f.hud.push({ text: hudLine }, { text: `t ${n}/${T}`, alpha: 0.7 })
      return
    }

    // --- the tremble ---
    this.shade.update(T, t, f.dt)
    const row = this.rowCam(f, L), tri = this.triangleCam(f, L), wall = this.wallCam(f, L)
    const kB = span(t, P.rows, P.triangle - P.rows)
    const holdTri = 0.5
    const kC = span(t, P.triangle + holdTri, P.wall - P.triangle - holdTri)
    const kOut = span(t, P.out, 0.5)
    const rowsIn = (r: number) => (r === T - 1 ? 1 : span(t, P.rows + (T - 2 - r) * 0.02, 0.35))
    const tilesIn = (i: number) => span(t, P.triangle + holdTri + 0.35 + i * 0.03, 0.5)

    if (t < P.rows) {
      this.unspool(f, L, row)
    } else if (t < P.out) {
      if (f.reduced) {
        // No camera move: each framing is still, and they cross-fade.
        const a = easeInOutCubic(kB), b = easeInOutCubic(kC)
        this.drawTriangle(f, row, 1 - a, r => (r === T - 1 ? 1 : 0))
        this.drawTriangle(f, tri, a * (1 - b), rowsIn)
        this.drawTriangle(f, wall, b, () => 1)
        this.drawWall(f, wall, b, tilesIn)
      } else {
        const cam = kC > 0 ? this.blend(tri, wall, kC) : this.blend(row, tri, kB)
        this.drawTriangle(f, cam, 1, rowsIn)
        if (kC > 0) this.drawWall(f, cam, 1, tilesIn)
      }
    } else {
      // The wall lets go. The row we were reading goes to the band, where the other senses will join it.
      this.drawTriangle(f, wall, 1 - kOut, r => (r === T - 1 ? 0 : 1))
      this.drawWall(f, wall, 1 - kOut, () => 1)
      this.toBand(f, L, wall)
    }

    const cells = T * (T + 1) / 2
    const second = t < P.triangle - 0.4 ? `t ${T}/${T}`
      : t < P.triangle + holdTri + 0.8 ? `${T} × ${T + 1} ÷ 2 = ${count(cells)}`
      : `36 × ${count(cells)} = ${count(36 * cells)}`
    f.hud.push({ text: hudLine }, { text: second, alpha: 0.7 })
    const aside = movement('text').aside
    if (aside && t >= P.aside) f.hud.push({ text: aside, alpha: 0.85 * span(t, P.aside, 1.4) })
    f.hudAlpha = 1 - span(t, P.end - 0.5, 0.5)
  }

  // --- the stream: tokens arriving, attention breathing over everything already there ---
  private stream(f: Frame, L: Layout, n: number): void {
    const { ctx, t } = f
    const head = n - 1
    const line = head >= 0 ? CONTEXT.lineOf[head] : 0
    const lineDone = head === lastOf[line] && t > PLAN.contextTimes[head] + 0.4
    this.shade.update(n, t, f.dt, lineDone ? 0.55 : 0, firstOf[line])
    const shown = this.shade.shown

    // captions and the rule beside the lines the AI is given, not the ones it says
    ctx.textBaseline = 'alphabetic'
    LINES.forEach((entry, i) => {
      const first = firstOf[i]
      if (head < first) return
      const a = span(t, PLAN.contextTimes[first] - 0.05, 0.5)
      const y0 = this.baseline[first], y1 = this.baseline[lastOf[i]]
      if (entry.voice === 'SYS') {
        ctx.fillStyle = `rgba(${WHITE},${(0.26 * a).toFixed(3)})`
        ctx.fillRect(this.x0 - (L.small ? 7 : 12), y0 - L.fs * 0.86, 1, y1 - y0 + L.fs * 1.12)
      }
      if (entry.caption) {
        ctx.font = font(L.hudFs + (L.small ? 0 : 1))
        ctx.fillStyle = `rgba(${WHITE},${(0.42 * a).toFixed(3)})`
        if (L.small) {
          ctx.textAlign = 'left'
          ctx.fillText(entry.caption, this.x0, y0 - L.lh * 0.82)
        } else {
          ctx.textAlign = 'right'
          ctx.fillText(entry.caption, this.x0 - 24, y0 - 1)
        }
      }
    })

    // seams: for a moment the reader sees what the text is to the thing reading it
    const seamFade = 1 - span(t, PLAN.textLines[SEAM_LINES].at - 0.2, 0.7)
    if (seamFade > 0) {
      ctx.font = font(L.small ? 8 : 9)
      ctx.textAlign = 'center'
      for (let i = 0; i <= head && CONTEXT.lineOf[i] < SEAM_LINES; i++) {
        const b = this.boxes[i], age = t - PLAN.contextTimes[i]
        const x = this.x0 + b.x, y = this.baseline[i] + Math.round(L.fs * 0.36)
        ctx.fillStyle = `rgba(${WHITE},${(0.26 * seamFade * span(age, 0, 0.15)).toFixed(3)})`
        ctx.fillRect(x + 1.5, y, b.w - 3, 1)
        const idAlpha = 0.5 * seamFade * span(age, 0, 0.12) * (1 - span(age, 1.0, 0.5))
        if (idAlpha > 0.01) {
          ctx.fillStyle = `rgba(${WHITE},${idAlpha.toFixed(3)})`
          ctx.fillText(String(CONTEXT.ids[i]), x + b.lead + (b.w - b.lead) / 2, y + (L.small ? 10 : 12))
        }
      }
    }

    // tokens
    ctx.font = font(L.fs)
    ctx.textAlign = 'left'
    for (let i = 0; i <= head; i++) {
      const b = this.boxes[i]
      ctx.fillStyle = `rgba(${WHITE},${shown[i].toFixed(3)})`
      ctx.fillText(b.text, this.x0 + b.x, this.baseline[i])
    }
    // a soft light on whatever is being looked at hardest
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i <= head; i++) {
      const glow = clamp01((shown[i] - 0.74) / 0.26) ** 2
      if (glow < 0.04) continue
      const b = this.boxes[i]
      ctx.shadowColor = `rgba(255,255,255,${(0.6 * glow).toFixed(3)})`
      ctx.shadowBlur = L.fs * 0.55
      ctx.fillStyle = `rgba(255,255,255,${(0.22 * glow).toFixed(3)})`
      ctx.fillText(b.text, this.x0 + b.x, this.baseline[i])
    }
    ctx.restore()

    this.drawArcs(f, L, n)

    // the cursor: the place where now is
    if (head >= 0) {
      const b = this.boxes[head], since = t - PLAN.contextTimes[head]
      const stopped = head === T - 1
      const on = stopped || since < 0.5 || ((since - 0.5) % 1) >= 0.5
      if (on) this.cursor(f, L, this.x0 + b.x + b.w + Math.round(L.fs * 0.14), this.baseline[head], 0.9)
    }
  }

  private cursor(f: Frame, L: Layout, x: number, baseline: number, alpha: number): void {
    f.ctx.fillStyle = `rgba(${WHITE},${alpha})`
    f.ctx.fillRect(Math.round(x), Math.round(baseline - L.fs * 0.86), Math.round(L.fs * 0.56), Math.round(L.fs * 1.1))
  }

  // At most three faint arcs from the newest token to what it attends to most. Across lines they reach back up the page.
  private drawArcs(f: Frame, L: Layout, n: number): void {
    const { ctx, t } = f
    const head = n - 1
    if (n !== this.lastCount) {
      const fresh = n > this.lastCount && f.dt < 1
      this.lastCount = n
      if (fresh && head > 0) {
        const row = CONTEXT.rows[head]
        let total = 0
        for (const v of row) total += v
        const byWord = new Map<number, { sum: number; best: number }>()
        for (let j = 0; j < head; j++) {
          const word = CONTEXT.wordOf[j]
          if (word === CONTEXT.wordOf[head]) continue
          const entry = byWord.get(word)
          if (!entry) byWord.set(word, { sum: row[j], best: j })
          else { entry.sum += row[j]; if (row[j] > row[entry.best]) entry.best = j }
        }
        const top = [...byWord.values()].sort((a, b) => b.sum - a.sum).slice(0, 3)
        for (const entry of top) if (entry.sum / total >= 0.08) this.arcs.push({ from: head, to: entry.best, born: t, share: entry.sum / total })
      }
      if (!fresh) this.arcs = []
    }
    this.arcs = this.arcs.filter(arc => t - arc.born < 1.0 && arc.from < n)
    ctx.lineWidth = 1
    for (const arc of this.arcs) {
      const age = t - arc.born
      const grow = f.reduced ? 1 : easeOutCubic(span(age, 0, 0.24))
      const fade = span(age, 0, 0.08) * (1 - span(age, 0.5, 0.5))
      const a = this.boxes[arc.from], b = this.boxes[arc.to]
      const x0 = this.x0 + a.x + a.lead + (a.w - a.lead) / 2, y0 = this.baseline[arc.from] - L.fs * 0.84
      const x1 = this.x0 + b.x + b.lead + (b.w - b.lead) / 2
      const sameRow = this.baseline[arc.to] === this.baseline[arc.from]
      const y1 = sameRow ? y0 : this.baseline[arc.to] + L.fs * 0.34
      // cubic: leaves the newest token upward, arrives at the old one from below (or from above on the same row)
      const rise = sameRow ? Math.min(L.lh * 0.8, 0.16 * Math.abs(x1 - x0) + 6) : (y0 - y1) * 0.45
      const c0y = y0 - rise, c1y = sameRow ? y1 - rise : y1 + rise
      ctx.strokeStyle = `rgba(${WHITE},${(Math.min(0.5, 0.14 + 0.9 * arc.share) * fade).toFixed(3)})`
      ctx.beginPath()
      const steps = 18
      for (let s = 0; s <= steps; s++) {
        const u = (s / steps) * grow, v = 1 - u
        const x = v * v * v * x0 + 3 * v * v * u * x0 + 3 * v * u * u * x1 + u * u * u * x1
        const y = v * v * v * y0 + 3 * v * v * u * c0y + 3 * v * u * u * c1y + u * u * u * y1
        if (s === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }

  // The paragraph lets go of its shape: every token becomes one cell, and the cells run out into a single row.
  private unspool(f: Frame, L: Layout, cam: Cam): void {
    const { ctx, t } = f
    const shown = this.shade.shown
    const window = P.rows - P.pull
    const gap = cam.c >= 6 ? 1.5 : 1, s = Math.max(1, cam.c - gap)
    const yRow = cam.oy + (T - 1) * cam.c
    ctx.font = font(L.fs)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    for (let i = 0; i < T; i++) {
      const b = this.boxes[i]
      const k = local(t, P.pull, i, (window - 0.55) / T, 0.55)
      const glyph = 1 - span(k, 0, 0.45)
      if (glyph > 0.01) {
        ctx.fillStyle = `rgba(${WHITE},${(shown[i] * glyph).toFixed(3)})`
        ctx.fillText(b.text, this.x0 + b.x, this.baseline[i])
      }
      if (k <= 0) continue
      ctx.fillStyle = `rgb(${WHITE})`
      if (f.reduced) {
        ctx.globalAlpha = lerp(shown[i], cellAlpha[T - 1][i], k) * k
        ctx.fillRect(cam.ox + i * cam.c, yRow, s, s)
      } else {
        // glyph box -> cell: it shrinks where it stands, then flies to its place in the row
        const e = easeInOutCubic(span(k, 0.25, 0.75)), shrink = easeOutCubic(span(k, 0, 0.4))
        const gx = this.x0 + b.x + b.lead, gy = this.baseline[i] - L.fs * 0.72
        const w0 = lerp(Math.max(4, b.w - b.lead), s, shrink), h0 = lerp(L.fs * 0.9, s, shrink)
        ctx.globalAlpha = lerp(shown[i], cellAlpha[T - 1][i], e) * span(k, 0, 0.3)
        ctx.fillRect(lerp(gx, cam.ox + i * cam.c, e), lerp(gy + (L.fs * 0.9 - h0) / 2, yRow, e), lerp(w0, s, e), lerp(h0, s, e))
      }
    }
    ctx.globalAlpha = 1
  }

  // The bottom row of the triangle becomes the first row of the band.
  private toBand(f: Frame, L: Layout, cam: Cam): void {
    const { ctx, t } = f
    const gap = cam.c >= 6 ? 1.5 : cam.c >= 3 ? 1 : 0.4, s = Math.max(0.8, cam.c - gap)
    const y0 = cam.oy + (T - 1) * cam.c, y1 = L.band.y[0]
    const window = P.end - P.out - 0.1
    ctx.fillStyle = `rgb(${WHITE})`
    for (let i = 0; i < BAND_COUNTS[0]; i++) {
      const cell = bandCell(L, 0, i)
      const k = local(t, P.out + 0.05, i, (window - 0.6) / T, 0.6)
      const e = easeInOutCubic(k)
      const value = lerp(cellAlpha[T - 1][i], bandValues[0][i], e)
      if (f.reduced) {
        ctx.globalAlpha = cellAlpha[T - 1][i] * (1 - e)
        ctx.fillRect(cam.ox + i * cam.c, y0, s, s)
        ctx.globalAlpha = bandValues[0][i] * e
        ctx.fillRect(cell.x, y1, cell.w, L.band.rowH)
      } else {
        ctx.globalAlpha = value
        ctx.fillRect(lerp(cam.ox + i * cam.c, cell.x, e), lerp(y0, y1, e), lerp(s, cell.w, e), lerp(s, L.band.rowH, e))
      }
    }
    ctx.globalAlpha = 1
  }
}
