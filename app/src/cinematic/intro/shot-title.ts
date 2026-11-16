// The title. First the words too large for the frame: parts of two or three
// letters, drifting, in silence. Then the same words small and calm, with the
// low tone under them. The two sizes are the scale statement for the whole
// game: the thing that does not fit, then the calm label for it.
import { easeOutCubic, span } from '../display'
import { WHITE, font, type Frame, type Layout } from './common'
import { TITLE } from './data'
import { PLAN } from './plan'

const P = PLAN.title
const HUGE_CAP = 1.4                 // cap height of the large title, in viewport heights
const DRIFT = 0.035                  // viewport widths per second, leftward
// Which letter the frame opens on, counted in letters from the first: the join of the O and the C of
// PROTOCOL, so a wide frame holds the backs of two round letters and nothing that can be read as a word.
const OPEN_ON = 10.95
const OPEN_ON_TALL = 2.52            // a tall frame holds less than half a letter: it opens on a diagonal
const TRACK = 0.42                   // letter-spacing of the small title, in em

export class TitleShot {
  private capRatio = 0               // cap height per font pixel, measured once from the face in use
  private advance = 0.6              // one character's width per font pixel

  private measure(f: Frame): void {
    if (this.capRatio) return
    const { ctx } = f
    ctx.font = font(200, 700)
    const m = ctx.measureText('H')
    this.capRatio = (m.actualBoundingBoxAscent || 146) / 200
    this.advance = m.width / 200
  }

  draw(f: Frame, L: Layout): void {
    this.measure(f)
    const { ctx, t, w, h } = f

    // --- too large for the frame ---
    // It arrives and leaves on short ramps, not cuts: these letters are most of the screen.
    const huge = span(t, P.huge, 0.5) * (1 - span(t, P.small - 0.22, 0.2))
    if (huge > 0.003) {
      const px = HUGE_CAP * h / this.capRatio
      const cw = this.advance * px
      // The frame holds parts of two or three letters, and the word slides through it.
      const drift = f.reduced ? 0 : DRIFT * w * (t - P.huge)
      const x0 = w / 2 - (h > w ? OPEN_ON_TALL : OPEN_ON) * cw - drift
      const baseline = h / 2 + HUGE_CAP * h / 2
      ctx.font = font(px, 700)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = `rgba(${WHITE},${(0.94 * huge).toFixed(3)})`
      for (let i = 0; i < TITLE.length; i++) {
        const x = x0 + i * cw
        if (x > w || x + cw < 0 || TITLE[i] === ' ') continue
        ctx.fillText(TITLE[i], x, baseline)
      }
    }

    // --- the same words, calm ---
    const small = span(t, P.small, 0.14) * (1 - span(t, P.end - 0.8, 0.7))
    if (small > 0.003) {
      const px = L.small ? 17 : 28
      ctx.font = font(px, 500)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      const cw = ctx.measureText('M').width, step = cw + TRACK * px
      const width = TITLE.length * step - TRACK * px
      const y = Math.round(h * 0.485)
      let x = (w - width) / 2
      ctx.fillStyle = `rgba(${WHITE},${(0.96 * small).toFixed(3)})`
      for (const ch of TITLE) {
        if (ch !== ' ') ctx.fillText(ch, Math.round(x), y)
        x += step
      }
      // one line beneath, drawn outward from the middle
      const rule = (L.small ? 64 : 96) * (f.reduced ? 1 : easeOutCubic(span(t, P.small + 0.1, 0.9)))
      ctx.fillStyle = `rgba(${WHITE},${(0.5 * small).toFixed(3)})`
      ctx.fillRect(Math.round(w / 2 - rule / 2), y + Math.round(px * 0.85), Math.round(rule), 1)
    }
  }
}
