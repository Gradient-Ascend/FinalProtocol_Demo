// Movement 3: sound. The real waveform of the chant scrolls past as it plays,
// cut by hairlines into 80 ms frames, each frame as bright as the newest
// frame's attention to it. When the third voice enters the stream stops: the
// view lets go of "now", and everything heard so far lies still at the width
// of the two rows above. Then the 75 frames fall into line under them.
// Three senses, three rows, one width.
//
// Nothing here changes at the frame rate: brightness eases, the picture
// scrolls, and the frames are a strip in space.
import { CG_VOICE_ENTRIES, CG_VOICE_RATE, CG_VOICE_SECONDS, renderVoice } from '../cg-voice'
import { approach, clamp01, easeInOutCubic, easeOutCubic, lerp, local, pullBack, span } from '../display'
import { Shade, WHITE, bandCell, bandValues, breath, drawBandRow, font, type Frame, type Layout } from './common'
import { AUDIO, movement } from './data'
import { PLAN } from './plan'

const P = PLAN.audio
const HUD = movement('audio').hud
const FRAMES = AUDIO.frames
const FRAME = 1 / AUDIO.hz                                  // seconds in one frame
const BIN = 24                                              // samples per envelope bin: 1 ms
const VISIBLE = 26                                          // frames across the strip while it scrolls
const NOW = CG_VOICE_ENTRIES[2] / CG_VOICE_SECONDS          // where "now" stands while it scrolls: where the third voice will be

// The share of each frame's attention that goes to the very first frame. It is an
// attention sink, as the start-of-text token is for text: the bake keeps it, and the
// sequence shows it as a line from now back to the first sound.
const FIRST: number[] = AUDIO.rows.map(row => row[0] / Math.max(1, row.reduce((a, b) => a + b, 0)))

export class AudioShot {
  private lo: Float32Array | null = null
  private hi: Float32Array | null = null
  // Every frame attends to the frames before it; one frame is one "word".
  private readonly shade = new Shade({ wordOf: AUDIO.rows.map((_, i) => i), rows: AUDIO.rows }, 0.1)
  private back = 0                                          // FIRST of the newest frame, eased

  /** The chant is sung once, in the dark of shot 0, and its outline kept per millisecond. */
  prepare(): void {
    if (this.lo) return
    const { samples } = renderVoice()
    const n = Math.ceil(samples.length / BIN)
    const lo = new Float32Array(n), hi = new Float32Array(n)
    for (let b = 0; b < n; b++) {
      let a = 1, z = -1
      const end = Math.min(samples.length, (b + 1) * BIN)
      for (let i = b * BIN; i < end; i++) { if (samples[i] < a) a = samples[i]; if (samples[i] > z) z = samples[i] }
      lo[b] = a; hi[b] = z
    }
    this.lo = lo; this.hi = hi
  }

  draw(f: Frame, L: Layout): void {
    this.prepare()
    const { ctx, t } = f
    const boost = breath(t, P.beat)
    drawBandRow(f, L, 0, 1, boost)
    drawBandRow(f, L, 1, 1, boost)
    if (t >= P.landed) drawBandRow(f, L, 2, 1, boost, span(t, P.landed, 0.4))

    // Where the ear is. While the chant sounds the audio clock says; otherwise the plan does.
    const at = f.voiceAt !== null && t >= P.chant && t < P.chantEnd ? f.voiceAt : t - P.chant
    const pos = Math.max(0, Math.min(CG_VOICE_SECONDS, at))
    const heard = pos / FRAME                                // in frames
    const arrived = t < P.chant ? 0 : Math.min(FRAMES, Math.floor(heard) + 1)
    this.shade.update(arrived, t, f.dt)

    const voices = CG_VOICE_ENTRIES.filter(e => t >= P.chant + e).length
    f.hud.push({ text: HUD.replace('{frame}', String(arrived)).replace('{frames}', String(FRAMES)) })
    const first = arrived > 1 ? FIRST[arrived - 1] : 0
    this.back = f.dt > 1 ? first : approach(this.back, first, f.dt, 0.3)
    f.hud.push({
      text: `${pos.toFixed(2)} s · ${voices} ${voices === 1 ? 'voice' : 'voices'}` + (arrived > 1 ? ` · ${Math.round(first * 100)}% on frame 1` : ''),
      alpha: 0.7,
    })
    f.hudAlpha = span(t, P.strip, 0.5) * (1 - span(t, P.end - 0.45, 0.45))
    if (t < P.strip || t >= P.landed) return

    // --- the strip ---
    const bx = L.band.x, bw = L.band.w
    const height = Math.round(Math.min(f.h * (L.small ? 0.2 : 0.26), 250))
    const mid = Math.round(L.stageY), top = mid - height / 2
    const still = bw / FRAMES, moving = bw / VISIBLE
    const lock = f.reduced ? 1 : span(t, P.lock, P.lockDur)  // 0 scrolling under a fixed "now", 1 lying still
    const pitch = f.reduced ? still : pullBack(moving, still, lock)
    const nowX = lerp(bx + NOW * bw, bx + heard * still, easeInOutCubic(lock))
    const x0 = nowX - heard * pitch
    const open = span(t, P.strip, 0.9)
    // frames leave softly on the left while the strip scrolls; once it lies still nothing is leaving
    const leaving = 1 - easeInOutCubic(lock)
    const edge = (x: number) => 1 - leaving * (1 - clamp01((x - bx) / 36))

    // the line of silence the sound will be written on
    const reach = (f.reduced ? 1 : easeOutCubic(open)) * bw
    ctx.fillStyle = `rgba(${WHITE},${(0.13 * open).toFixed(3)})`
    ctx.fillRect(bx + NOW * bw - reach * NOW, mid, reach, 1)

    const amp = height / 2 * 0.98 / 0.85                     // the chant peaks at 0.85
    const falling = t >= P.fall
    const shown = this.shade.shown

    // --- frames: a faint fill and a hairline each ---
    for (let j = 0; j <= FRAMES; j++) {
      const x = x0 + j * pitch
      if (x < bx - 1 || x > bx + bw + 1) continue
      const past = j <= heard
      // slots not yet heard show only once the view is still
      const a = (past ? 0.2 : 0.08 * easeInOutCubic(lock)) * edge(x) * open
      if (a <= 0.004) continue
      let y = top, h = height
      if (falling) {
        const k = local(t, P.fall, Math.min(j, FRAMES - 1), P.stagger, P.flight)
        if (f.reduced) { ctx.globalAlpha = 1 - k } else {
          const e = easeInOutCubic(k)
          y = lerp(top, L.band.y[2], e); h = lerp(height, L.band.rowH, e)
          ctx.globalAlpha = 1 - span(e, 0.6, 0.4)
        }
      }
      ctx.fillStyle = `rgba(${WHITE},${a.toFixed(3)})`
      ctx.fillRect(Math.round(x), y, 1, h)
      ctx.globalAlpha = 1
    }

    // --- the waveform, one frame at a time ---
    const lo = this.lo as Float32Array, hi = this.hi as Float32Array
    const perPx = FRAME / pitch * CG_VOICE_RATE / BIN         // envelope bins under one pixel
    ctx.fillStyle = `rgb(${WHITE})`
    for (let j = 0; j < arrived; j++) {
      const xa = x0 + j * pitch, xb = Math.min(xa + pitch, nowX)
      if (xb < bx || xa > bx + bw) continue
      let y = mid, squeeze = 1, wave = 1, solid = 0
      if (falling) {
        const k = local(t, P.fall, j, P.stagger, P.flight)
        const home = bandCell(L, 2, j)
        let cellY = L.band.y[2], cellH = L.band.rowH
        if (f.reduced) { wave = 1 - k; solid = k } else {
          // the column closes like a blind, down into its place in the row
          const e = easeInOutCubic(k)
          cellH = lerp(height, L.band.rowH, e)
          cellY = lerp(top, L.band.y[2], e)
          y = cellY + cellH / 2
          squeeze = cellH / height
          solid = span(e, 0.55, 0.45); wave = 1 - solid
        }
        if (solid > 0) {
          ctx.globalAlpha = bandValues[2][j] * solid * boost
          ctx.fillRect(home.x, cellY, home.w, cellH)
        }
      }
      if (wave <= 0.004) continue
      // the frame itself, faintly: attention as a column of light
      ctx.globalAlpha = 0.17 * shown[j] * shown[j] * wave * edge(xa + pitch / 2)
      ctx.fillRect(xa + 1, y - height * squeeze / 2, Math.max(0, xb - xa - 1), height * squeeze)
      const from = Math.max(Math.ceil(xa), Math.ceil(bx)), to = Math.min(Math.floor(xb), Math.floor(bx + bw))
      for (let x = from; x < to; x++) {
        const b0 = Math.max(0, Math.floor((x - x0) * perPx)), b1 = Math.min(lo.length, Math.max(b0 + 1, Math.ceil((x + 1 - x0) * perPx)))
        let a = 1, z = -1
        for (let b = b0; b < b1; b++) { if (lo[b] < a) a = lo[b]; if (hi[b] > z) z = hi[b] }
        if (z < a) continue
        ctx.globalAlpha = (0.22 + 0.78 * shown[j]) * wave * edge(x)
        const y0 = y - z * amp * squeeze
        ctx.fillRect(x, y0, 1, Math.max(1, (z - a) * amp * squeeze))
      }
    }
    ctx.globalAlpha = 1

    // --- from now back to the first sound: the one place it never stops looking ---
    if (this.back > 0.01 && arrived > 1) {
      const ax = Math.min(nowX, bx + bw), zx = x0 + pitch / 2, y = top + height + 7
      const drop = Math.min(L.small ? 34 : 62, 12 + 0.11 * (ax - zx), Math.max(8, L.band.y[0] - y - 12))
      const fade = (falling ? 1 - span(t, P.fall, 0.5) : 1) * span(heard, 1, 3)
      ctx.lineWidth = 1
      const steps = 48
      for (let i = 0; i < steps; i++) {
        const u0 = i / steps, u1 = (i + 1) / steps
        const xa = lerp(ax, zx, u0), xb = lerp(ax, zx, u1)
        if (xb < bx - 1) break
        ctx.strokeStyle = `rgba(${WHITE},${((0.16 + 0.9 * this.back) * fade * edge((xa + xb) / 2)).toFixed(3)})`
        ctx.beginPath()
        ctx.moveTo(xa, y + drop * 4 * u0 * (1 - u0))
        ctx.lineTo(Math.max(bx, xb), y + drop * 4 * u1 * (1 - u1))
        ctx.stroke()
      }
      // where it lands
      if (zx >= bx - 1) {
        ctx.fillStyle = `rgba(${WHITE},${((0.3 + 0.7 * this.back) * fade * edge(zx)).toFixed(3)})`
        ctx.fillRect(Math.round(zx) - 1, y - 3, 3, 3)
      }
    }

    // --- now ---
    const playing = span(t, P.chant - 0.9, 0.6) * (1 - span(t, P.chantEnd, 0.5))
    if (playing > 0.01) {
      ctx.fillStyle = `rgba(${WHITE},${(0.85 * playing).toFixed(3)})`
      ctx.fillRect(Math.round(nowX), top - 8, 1, height + 16)
    }

    // --- where each voice came in ---
    ctx.font = font(L.hudFs)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const gone = falling ? 1 - span(t, P.fall, 0.4) : 1
    CG_VOICE_ENTRIES.forEach((entry, i) => {
      const x = x0 + entry / FRAME * pitch
      const a = span(t, P.chant + entry, 0.5) * edge(x) * gone
      if (a <= 0.01 || x < bx - 1 || x > bx + bw + 1) return
      ctx.fillStyle = `rgba(${WHITE},${(0.6 * a).toFixed(3)})`
      ctx.fillRect(Math.round(x), top - 9, 1, 6)
      ctx.fillText(String(i + 1), Math.round(x) + 0.5, top - 14)
    })
  }
}
