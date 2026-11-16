// What the shots of the opening sequence share: the frame they draw into,
// the page geometry, token layout, attention shading, the subtitle and the
// three-row band.
import { MONO, approach, clamp01, easeInOutCubic, lerp, span } from '../display'
import type { PointField } from '../point-field'
import { AUDIO, CONTEXT, VISION, wordWeights } from './data'
import type { LineCue } from './plan'

export type Frame = {
  ctx: CanvasRenderingContext2D    // units are CSS pixels
  field: PointField                // one point buffer for whichever shot is on screen; sized to the frame
  w: number
  h: number
  dpr: number
  t: number                        // seconds on the sequence's clock
  dt: number                       // seconds since the last frame; large after a seek, so eases snap
  reduced: boolean
  hud: HudLine[]                   // lines for the bottom-left read-out, set by the shot each frame
  hudAlpha: number
  voiceAt: number | null           // seconds into the chant on the audio clock, when it is sounding
}

export type HudLine = { text: string; alpha?: number }

export const WHITE = '245,245,245'
export const BLUE = '94,230,255'
export const GAMMA = 0.6

export const font = (px: number, weight = 400) => `${weight} ${px}px ${MONO}`

export type Layout = {
  small: boolean
  fs: number                       // text size
  lh: number
  hudFs: number
  margin: number
  stageY: number                   // centre of the main picture
  subY: number                     // first baseline of the subtitle
  band: { x: number; w: number; rowH: number; y: number[] }
}

export function layoutOf(w: number, h: number): Layout {
  const small = w < 720
  const fs = small ? 15 : Math.round(Math.min(24, Math.max(18, w / 64)))
  const margin = small ? 16 : 28
  const bandW = Math.min(w - 2 * margin, small ? w : 0.82 * w, 1180)
  const rowH = small ? 9 : 13
  // A short screen (a phone on its side) has no room to spare under the band: everything moves up, and closer.
  const short = h < 520
  const bandY = Math.round(h * (short ? 0.58 : 0.69))
  return {
    small, fs, lh: Math.round(fs * 1.85), hudFs: small ? 9 : 10, margin,
    stageY: h * (short ? 0.3 : 0.37),
    subY: bandY + 3 * (rowH + 7) + Math.round(fs * (short ? 1.45 : 2.1)),
    band: { x: Math.round((w - bandW) / 2), w: bandW, rowH, y: [bandY, bandY + rowH + 7, bandY + 2 * (rowH + 7)] },
  }
}

// --- token layout ---

export type TokenBox = { x: number; row: number; w: number; text: string; lead: number }

/**
 * Lay tokens out left to right, wrapping at word starts. A token keeps its
 * leading space inside its own span (as the tokenizer does); at the start of a
 * row the space is not drawn. `lead` is the width of that space.
 */
export function layTokens(ctx: CanvasRenderingContext2D, tokens: string[], maxWidth: number, wordOf: number[], breaks: number[] = []): { boxes: TokenBox[]; rows: number; width: number } {
  const space = ctx.measureText(' ').width
  const boxes: TokenBox[] = []
  let x = 0, row = 0, width = 0
  for (let i = 0; i < tokens.length; i++) {
    const opens = i === 0 || wordOf[i] !== wordOf[i - 1]
    if (opens && i > 0) {
      // Width of the whole word that starts here: a word never splits across rows.
      let wordWidth = 0
      for (let j = i; j < tokens.length && wordOf[j] === wordOf[i]; j++) wordWidth += ctx.measureText(tokens[j]).width
      if (breaks.includes(i) || x + wordWidth > maxWidth) { x = 0; row++ }
    }
    const atStart = x === 0 && tokens[i].startsWith(' ')
    const text = atStart ? tokens[i].slice(1) : tokens[i]
    const w = ctx.measureText(text).width
    boxes.push({ x, row, w, text, lead: !atStart && tokens[i].startsWith(' ') ? space : 0 })
    x += w
    width = Math.max(width, x)
  }
  return { boxes, rows: row + 1, width }
}

// --- attention as breath ---

/**
 * Brightness of tokens under a moving row of attention: quick to rise, slow
 * to fall, and the change travels backwards from the newest token, which is
 * the direction attention looks.
 */
export class Shade {
  readonly shown: Float32Array
  private readonly goal: Float32Array
  private readonly next: Float32Array
  private count = 0
  private arrived = -1e9

  constructor(private readonly line: { wordOf: number[]; rows: number[][] }, private readonly floor = 0.3) {
    const n = line.rows.length
    this.shown = new Float32Array(n)
    this.goal = new Float32Array(n)
    this.next = new Float32Array(n)
  }

  /** `count` tokens have arrived at time t. `lift` raises the floor of tokens from index `liftFrom` on (a finished line stays readable). */
  update(count: number, t: number, dt: number, lift = 0, liftFrom = 0): void {
    const snap = dt > 1
    if (count !== this.count) {
      this.count = count
      this.arrived = snap ? -1e9 : t
      if (count > 0) {
        const w = wordWeights(this.line, count - 1)
        for (let j = 0; j < count; j++) this.next[j] = this.floor + (1 - this.floor) * Math.pow(w[j], GAMMA)
      }
    }
    const head = count - 1
    for (let j = 0; j < this.shown.length; j++) {
      if (j > head) { this.shown[j] = 0; this.goal[j] = 0; continue }
      const lag = Math.min(0.28, 0.014 * (head - j))                  // 14 ms per token of distance
      if (t - this.arrived >= lag) this.goal[j] = this.next[j]
      let goal = j === head ? 1 : this.goal[j]                        // the newest token is the one doing the looking
      if (lift > 0 && j >= liftFrom) goal = Math.max(goal, lift)
      this.shown[j] = snap ? goal : approach(this.shown[j], goal, dt, goal > this.shown[j] ? 0.12 : 0.42)
    }
  }
}

// --- subtitle: one line of the later movements, shaded by its own baked row ---

export class Subtitle {
  private shade: Shade | null = null
  private cue: LineCue | null = null
  private boxes: TokenBox[] = []
  private rows = 1
  private width = 0
  private laidFor = ''

  draw(f: Frame, L: Layout, cues: LineCue[]): void {
    const cue = cues.find(c => f.t >= c.at - 0.05 && f.t < c.out + 0.35) ?? null
    if (cue !== this.cue) {
      this.cue = cue
      this.shade = cue && cue.baked ? new Shade(cue.baked, 0.34) : null
      this.laidFor = ''
    }
    if (!cue) return
    const { ctx } = f
    ctx.font = font(L.fs)
    const key = `${f.w}x${f.h}`
    if (this.laidFor !== key) {
      this.laidFor = key
      const wordOf = cue.baked ? cue.baked.wordOf : cue.tokens.map((_, i) => i)
      const laid = layTokens(ctx, cue.tokens, Math.min(f.w - 2 * L.margin, L.fs * 42), wordOf)
      this.boxes = laid.boxes; this.rows = laid.rows; this.width = laid.width
    }
    let count = 0
    while (count < cue.times.length && cue.times[count] <= f.t) count++
    const done = count === cue.times.length && f.t > cue.end + 0.45
    this.shade?.update(count, f.t, f.dt, done ? 0.6 : 0)
    const fade = 1 - span(f.t, cue.out, 0.3)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    // Rows are centred one by one: a wrapped subtitle should not hang left.
    const rowWidth: number[] = new Array(this.rows).fill(0)
    for (const b of this.boxes) rowWidth[b.row] = Math.max(rowWidth[b.row], b.x + b.w)
    for (let i = 0; i < count; i++) {
      const b = this.boxes[i]
      const a = (this.shade ? this.shade.shown[i] : 0.8) * fade
      if (a < 0.01) continue
      ctx.fillStyle = `rgba(${WHITE},${a.toFixed(3)})`
      ctx.fillText(b.text, Math.round((f.w - rowWidth[b.row]) / 2 + b.x), L.subY + b.row * Math.round(L.fs * 1.6))
    }
  }
}

// --- the band: three senses, three rows, one width ---

export const BAND_COUNTS = [CONTEXT.tokens.length, VISION.grid * VISION.grid, AUDIO.frames]

const floorPow = (v: number, floor: number) => floor + (1 - floor) * Math.pow(clamp01(v), GAMMA)

/** Brightness of every cell of a row as it rests in the band: the last query's real row. */
export const bandValues: Float32Array[] = (() => {
  const last = CONTEXT.rows.length - 1
  const text = Float32Array.from(wordWeights(CONTEXT, last), v => floorPow(v, 0.16))
  const image = Float32Array.from(VISION.mean, v => floorPow(v / 255, 0.10))
  const lastRow = AUDIO.rows[AUDIO.rows.length - 1]
  const peak = Math.max(...lastRow)
  const audio = Float32Array.from(lastRow, v => floorPow(v / peak, 0.12))
  return [text, image, audio]
})()

/** Left edge and width of cell i of a band row, in CSS pixels. */
export function bandCell(L: Layout, row: number, i: number): { x: number; w: number } {
  const n = BAND_COUNTS[row], pitch = L.band.w / n
  const gap = pitch >= 4 ? 1 : 0
  return { x: L.band.x + i * pitch, w: Math.max(0.6, pitch - gap) }
}

/**
 * Draw one resting row of the band, with its cell count at the right.
 * `alpha` fades the whole row, `boost` multiplies brightness (the shared
 * breath when a row lands), `label` fades the count alone.
 */
export function drawBandRow(f: Frame, L: Layout, row: number, alpha: number, boost = 1, label = 1): void {
  if (alpha <= 0.003) return
  const { ctx } = f
  const values = bandValues[row], y = L.band.y[row]
  ctx.fillStyle = `rgb(${WHITE})`
  for (let i = 0; i < values.length; i++) {
    const c = bandCell(L, row, i)
    ctx.globalAlpha = Math.min(1, values[i] * boost) * alpha
    ctx.fillRect(c.x, y, c.w, L.band.rowH)
  }
  ctx.globalAlpha = 0.34 * alpha * label
  ctx.font = font(L.hudFs)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  if (L.band.x + L.band.w + 8 + 28 < f.w) ctx.fillText(String(values.length), L.band.x + L.band.w + 8, y + L.band.rowH / 2 + 0.5)
  ctx.globalAlpha = 1
}

/** The 1.2-times shared brightening when a row has landed: up and down inside `dur`, no blink. */
export function breath(t: number, at: number, dur = 0.5): number {
  const k = span(t, at, dur)
  return k <= 0 || k >= 1 ? 1 : 1 + 0.22 * Math.sin(Math.PI * k)
}

/** A flight with a lift in the middle: where an item is, 0..1 along its move. */
export function flight(k: number, x0: number, y0: number, x1: number, y1: number, lift: number): { x: number; y: number; e: number } {
  const e = easeInOutCubic(clamp01(k))
  return { x: lerp(x0, x1, e), y: lerp(y0, y1, e) - lift * Math.sin(Math.PI * e), e }
}

/** Thousands separator for the read-outs. */
export const count = (n: number) => n.toLocaleString('en-US')
