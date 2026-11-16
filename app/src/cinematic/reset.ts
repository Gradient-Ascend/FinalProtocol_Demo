// Defeat. Short, quiet and the same every time, because a run shows it more
// than anything else: attention goes flat (everything the same grey), the
// text deletes from the end backwards and the board with it, then one cursor
// and one word.
import script from '../story/script.json'
import { battleStore } from '../game/battle-store'
import { lerp, span } from './display'
import { blip, sinkTone } from './sound'
import { drawBoard, drawLiveBoard, font, signMask, trackedText, type Cue, type Env, type Moment } from './stage-kit'

export function resetMoment(env: Env): Moment {
  const { w, h, small, geo } = env
  const T = { flat: 0.6, gone: 2.0, word: 2.3, end: 2.6 }
  const state = battleStore.getSnapshot()
  const encounter = state.encounter
  const mask = signMask(encounter)
  const cell = geo.cell

  // The text on screen: the battle's own log, as it stood.
  const px = small ? 9 : 11, lineH = Math.round(px * 1.7), charW = px * 0.6
  const below = small || geo.x < 230
  const boxW = below ? w - 32 : geo.x - 64
  const perLine = Math.max(12, Math.floor(boxW / charW))
  const source = state.log.length ? state.log.map(entry => entry.text) : [script.defeat.sys]
  const lines: string[] = []
  for (const text of source) for (let i = 0; i < text.length; i += perLine) lines.push(text.slice(i, i + perLine))
  const shown = lines.slice(-(below ? 6 : 14))
  const total = shown.reduce((n, line) => n + line.length, 0)
  const textX = below ? 16 : 32
  const textBottom = below ? Math.min(h - 28, geo.y + cell * 15 + 30 + shown.length * lineH) : Math.min(h - 40, geo.y + cell * 15)
  // It deletes faster as it goes: 40 ms a character, a tenth less each time, never under 6. Fitted to the time there is.
  const stamps: number[] = []
  {
    let at = 0
    for (let i = 0; i < total; i++) { stamps.push(at); at += Math.max(6, 40 * 0.9 ** i) }
    const fit = (T.gone - T.flat) * 1000 * 0.94 / Math.max(1, at)
    for (let i = 0; i < total; i++) stamps[i] = T.flat + stamps[i] * fit / 1000
  }

  const cues: Cue[] = [
    // what was under everything sinks a semitone and stops
    { at: 0.02, fire: (s, when) => sinkTone(s.ctx, s.master.music, when, 55, -100, 1.5, 0.3) },
    { at: T.gone, fire: (s, when) => blip(s.ctx, s.master.sfx, when, 1000, 0.05, 0.07) },
  ]

  return {
    length: T.end,
    cues,
    cover: t => span(t, 0, 0.25),
    draw(f) {
      const { ctx, t } = f
      ctx.fillStyle = '#050505'
      ctx.fillRect(0, 0, w, h)
      const flat = 1 - Math.exp(-t / 0.2)
      const deleted = stamps.reduce((n, at) => n + (t >= at ? 1 : 0), 0)
      const progress = total ? deleted / total : span(t, T.flat, T.gone - T.flat)
      if (t < T.gone) {
        // the board, every part of it the same grey
        ctx.save()
        ctx.beginPath()
        ctx.rect(geo.x, geo.y, cell * 15, cell * 15)
        ctx.clip()
        if (!drawLiveBoard(ctx, geo)) drawBoard(ctx, geo, encounter, mask, { labels: 0 })
        ctx.globalAlpha = flat
        ctx.globalCompositeOperation = 'saturation'
        ctx.fillStyle = '#000'
        ctx.fillRect(geo.x, geo.y, cell * 15, cell * 15)
        ctx.globalCompositeOperation = 'darken'
        ctx.fillStyle = '#4d4d4d'
        ctx.fillRect(geo.x, geo.y, cell * 15, cell * 15)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
        // and it goes as the text goes: from the last cell backwards
        const gone = Math.floor(progress * 225)
        ctx.fillStyle = '#050505'
        const rows = Math.floor(gone / 15), rest = gone % 15
        if (rows > 0) ctx.fillRect(geo.x, geo.y + (15 - rows) * cell, cell * 15, rows * cell + 1)
        if (rest > 0) ctx.fillRect(geo.x + (15 - rest) * cell, geo.y + (14 - rows) * cell, rest * cell + 1, cell)
        ctx.restore()
        // the text, flat, deleting right to left and bottom to top
        ctx.font = font(px)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        const grey = Math.round(lerp(200, 77, flat))
        ctx.fillStyle = `rgb(${grey},${grey},${grey})`
        let left = total - deleted
        shown.forEach((line, i) => {
          const keep = Math.max(0, Math.min(line.length, left))
          left -= line.length
          if (keep > 0) ctx.fillText(line.slice(0, keep), textX, textBottom - (shown.length - 1 - i) * lineH)
        })
        return
      }
      // one cursor, alone. It blinks once. Then the word.
      const since = t - T.gone
      const on = since < 0.18 || since >= T.word - T.gone
      const size = 14
      ctx.fillStyle = '#9a9a9a'
      const word = script.defeat.word
      const width = t >= T.word ? trackedText(ctx, word, w / 2, h / 2 + size * 0.36, size, 0.2, 500) : 0
      if (on) {
        ctx.fillStyle = 'rgba(245,245,245,0.92)'
        ctx.fillRect(Math.round(w / 2 + width / 2 + (width ? 2 : -size * 0.28)), Math.round(h / 2 - size * 0.5), Math.round(size * 0.56), Math.round(size * 1.1))
      }
    },
  }
}
