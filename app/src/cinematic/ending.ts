// The ending: the door was opened. The opening, run backwards and then past
// its start. The flower of three petals, grey now, turns out to be one patch
// of the first picture; the picture one frame of the first sound; the sound
// one word. The line that word ends is the story's last. Attention leaves it
// for the three who have watched from the corner since the first frame; they
// do nothing; it comes back. Then there are two cursors, out of step, and
// they come into step, while three voices build the one major chord in the
// game. Nothing here is large. Aim: to be moved, not afraid.
import script from '../story/script.json'
import { attentionFor, shadeAt, shadeFinal } from '../story/attention'
import { renderHand } from './cg-image'
import { clamp01, easeInOutCubic, lerp, pullBack, smoother, span, spectatorDots } from './display'
import { AUDIO, VISION } from './intro/data'
import { both, lowTone, silence, tokenBlip, vowel } from './sound'
import { buildFlower, drawFlower, mapLayout } from './reveal'
import { dot, font, type Cue, type Env, type Frame, type Moment } from './stage-kit'

const WHITE: [number, number, number] = [245, 245, 245]

type Rect = { x: number; y: number; size: number }      // a centre, and a width

export function endingMoment(env: Env): Moment {
  const { w, h, small, reduced } = env
  // seconds: still, three pull-backs, the line, the watchers, the two cursors, together, black
  const T = { still: 6, grid: 10, strip: 14, word: 18, write: 19.2, written: 26.4, look: 28, held: 34, back: 40, second: 43, third: 49, joined: 55, close: 56, cut: 64, end: 66.5 }
  const last = script.ending.lines.find(line => (line as { beat?: string }).beat === 'last') ?? script.ending.lines[script.ending.lines.length - 1]
  const line = attentionFor(last.text, last.id)
  const finalShade = shadeFinal(line)

  // ── layout ──
  const map = mapLayout(w, h)
  const flower = buildFlower(180)
  const flowerSize = map.cell * 52
  const grid: Rect = { x: w / 2, y: h * 0.47, size: Math.min(w * 0.86, h * 0.62) }
  const patch = grid.size / 14
  const home = 6 * 14 + 8                                 // the patch the flower is: a little right of the middle, on the hand
  const patchAt = (p: number): [number, number] => [grid.x + ((p % 14) - 6.5) * patch, grid.y + (Math.floor(p / 14) - 6.5) * patch]
  const stripW = Math.min(w - 2 * (small ? 16 : 28), small ? w : 0.82 * w, 1180), stripH = small ? 46 : 74
  const strip = { x: w / 2, y: h * 0.47 }
  const frames = AUDIO.frames, frameW = stripW / frames
  const frameHome = Math.round(frames * 0.56)
  const frameX = (j: number) => strip.x - stripW / 2 + (j + 0.5) * frameW
  const peak = Math.max(...AUDIO.rms)
  const lastRow = AUDIO.rows[AUDIO.rows.length - 1], rowPeak = Math.max(...lastRow)
  // the line, set where the opening set its text
  const fs = small ? 17 : Math.round(Math.min(30, Math.max(22, w / 52)))
  const scratch = document.createElement('canvas').getContext('2d')
  const charW = (() => { if (!scratch) return fs * 0.6; scratch.font = font(fs); return scratch.measureText('M').width })()
  const lineW = charW * last.text.length
  const lineX = Math.round(w / 2 - lineW / 2), lineY = Math.round(h * 0.47 + fs * 0.36)
  const starts: number[] = []
  { let at = 0; for (const token of line.tokens) { starts.push(at); at += token.length } }
  // the last word: every token of it, without the stop after it
  const wordIndex = line.wordOf[Math.max(0, line.tokens.length - 2)]
  const wordTokens = line.tokens.map((_, i) => i).filter(i => line.wordOf[i] === wordIndex && /\w/.test(line.tokens[i]))
  const wordFrom = starts[wordTokens[0]] + (line.tokens[wordTokens[0]].startsWith(' ') ? 1 : 0)
  const wordTo = starts[wordTokens[wordTokens.length - 1]] + line.tokens[wordTokens[wordTokens.length - 1]].length
  const word: Rect = { x: lineX + (wordFrom + wordTo) / 2 * charW, y: lineY - fs * 0.36, size: (wordTo - wordFrom) * charW }
  const tokenAt = line.tokens.map((_, i) => T.write + (T.written - T.write) * i / Math.max(1, line.tokens.length - 1) * 0.94)
  const cursorX = lineX + lineW + Math.round(fs * 0.3)
  const hand = renderHand()

  // The second cursor runs a little fast, slows, and from `joined` keeps the first one's time exactly.
  const drift = T.joined - T.second
  const turns = (tau: number) => tau + 0.15 * drift / 3 * (1 - (1 - clamp01(tau / drift)) ** 3)   // integral of 1 + 0.15 (1 - tau/drift)^2
  const offset = ((T.joined - T.back) - turns(drift)) % 1
  const firstOn = (t: number) => (t - T.back) % 1 < 0.5
  const secondOn = (t: number) => (((turns(t - T.second) + offset) % 1) + 1) % 1 < 0.5

  // ── the three pull-backs: each is the last picture shrinking into one place in the next ──
  // Where the inner picture is and how wide, k along the way; and the scale at which the outer one is drawn round it.
  const shrink = (from: Rect, to: Rect, k: number) => {
    const e = easeInOutCubic(k)
    return { x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e), size: pullBack(from.size, to.size, k) }
  }

  function drawHand(f: Frame, at: Rect, slot: number, alpha: number, skip: boolean): void {
    // the first picture, in its 196 pieces; `slot` is the width one piece has on screen
    if (alpha <= 0.003) return
    const m = slot / patch
    const per = small ? 3 : 4, cell = 16 / per
    for (let p = 0; p < 196; p++) {
      if (skip && p === home) continue
      const [qx, qy] = patchAt(p)
      const cx = at.x + (qx - patchAt(home)[0]) * m, cy = at.y + (qy - patchAt(home)[1]) * m
      if (cx < -slot || cy < -slot || cx > f.w + slot || cy > f.h + slot) continue
      const weight = 0.35 + 0.65 * Math.pow(VISION.mean[p] / 255, 0.6)
      const px0 = (p % 14) * 16, py0 = Math.floor(p / 14) * 16
      for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) {
        const lum = hand[Math.floor(py0 + (j + 0.5) * cell) * 224 + Math.floor(px0 + (i + 0.5) * cell)]
        if (lum < 0.03) continue
        const step = slot * 0.9 / per
        dot(f, cx + (i - (per - 1) / 2) * step, cy + (j - (per - 1) / 2) * step, Math.min(6, Math.max(1.1, step * 0.55 * Math.sqrt(lum) * 1.6)), WHITE, alpha * weight * (0.25 + 0.75 * lum))
      }
    }
  }

  function drawStrip(f: Frame, at: Rect, slot: number, alpha: number, skip: boolean): void {
    // the first sound: its frames side by side, each as loud as it was and as attended as it was
    if (alpha <= 0.003) return
    const { ctx } = f
    const m = slot / frameW
    ctx.save()
    ctx.fillStyle = 'rgb(245,245,245)'
    for (let j = 0; j < frames; j++) {
      if (skip && j === frameHome) continue
      const x = at.x + (frameX(j) - frameX(frameHome)) * m
      if (x < -slot || x > f.w + slot) continue
      const tall = Math.max(2, stripH * m * (0.08 + 0.92 * AUDIO.rms[j] / peak))
      ctx.globalAlpha = alpha * (0.14 + 0.86 * Math.pow(lastRow[j] / rowPeak, 0.6))
      ctx.fillRect(x - slot * 0.36, at.y - tall / 2, Math.max(1, slot * 0.72), tall)
    }
    ctx.restore()
  }

  function drawLine(f: Frame, shade: (i: number) => number, alpha: number): void {
    const { ctx } = f
    ctx.font = font(fs)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    line.tokens.forEach((token, i) => {
      const a = shade(i) * alpha
      if (a <= 0.005) return
      ctx.fillStyle = `rgba(245,245,245,${a.toFixed(3)})`
      ctx.fillText(token, lineX + starts[i] * charW, lineY)
    })
  }

  const cues: Cue[] = []
  // the low tone of the opening comes back, very quietly, as the flower starts to recede
  cues.push({ at: T.still, fire: (s, when, keep) => { keep(lowTone(s.ctx, both(s, 'music'), 55, when, 6, { gain: 0.13 }), 0.1) } })
  tokenAt.forEach((at, i) => cues.push({ at, fire: (s, when) => tokenBlip(s.ctx, s.master.sfx, when, i, finalShade[i] ?? 0.5, 0.5) }))
  // three voices, one at a time: A, then the third above it, then the fifth. The only major chord there is.
  ;[[T.word + 1, 110], [T.second, 138.59], [T.third, 164.81]].forEach(([at, hz], i) => {
    cues.push({ at, fire: (s, when, keep) => { keep(vowel(s.ctx, both(s, 'music'), hz, when, { gain: [0.13, 0.105, 0.1][i], attack: 4.5 }), 0.1) } })
  })
  cues.push({ at: T.cut, fire: (s, when) => silence(s, when) })

  return {
    length: T.end,
    entered: 0,                                           // their hue left when each stopped attending
    cues,
    cover: t => span(t, 0, 1.2),
    // attention on the three in the corner: up over two seconds, held, and back down
    spectators: t => smoother(span(t, T.look, 2.2)) * (1 - smoother(span(t, T.back - 1.6, 1.6))),
    draw(f) {
      const { ctx, t } = f
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      if (t >= T.cut) return
      f.field.clear()
      const grey = [0, 0, 0], dim = [0.36, 0.36, 0.36]
      const flowerRect: Rect = { x: map.cx, y: map.cy, size: flowerSize }

      if (t < T.grid) {
        // the flower; then the flower as one piece of the first picture
        const k = span(t, T.still, T.grid - T.still)
        const [hx, hy] = patchAt(home)
        if (reduced) {
          const there = smoother(k)
          drawFlower(f, flower, map.cx, map.cy, map.cell, 1 - there, grey, dim)
          drawHand(f, { x: hx, y: hy, size: patch }, patch, there, false)
        } else {
          const at = shrink(flowerRect, { x: hx, y: hy, size: patch * 0.9 }, k)
          // as it shrinks its dots crowd together: each is dimmed so the whole keeps its light and does not flare
          const crowd = clamp01(at.size / (flowerSize * 0.42)) ** 1.5
          drawFlower(f, flower, at.x, at.y, map.cell * at.size / flowerSize, 1, grey, dim.map(v => v * (0.07 + 0.93 * crowd)))
          drawHand(f, at, at.size / 0.9, smoother(span(k, 0.18, 0.5)), true)
        }
        f.field.end(ctx, 1, 0.6)
        return
      }
      if (t < T.strip) {
        // the picture as one frame of the first sound
        const k = span(t, T.grid, T.strip - T.grid)
        const [hx, hy] = patchAt(home)
        if (reduced) {
          const there = smoother(k)
          drawHand(f, { x: hx, y: hy, size: patch }, patch, 1 - there, false)
          f.field.end(ctx, 1, 0.6)
          drawStrip(f, { x: frameX(frameHome), y: strip.y, size: frameW }, frameW, there, false)
          return
        }
        const at = shrink({ x: grid.x, y: grid.y, size: grid.size }, { x: frameX(frameHome), y: strip.y, size: frameW * 0.72 }, k)
        const m = at.size / grid.size
        const gone = smoother(span(k, 0.62, 0.3))
        drawHand(f, { x: at.x + (hx - grid.x) * m, y: at.y + (hy - grid.y) * m, size: patch * m }, patch * m, 1 - gone, false)
        f.field.end(ctx, 1, 0.6)
        drawStrip(f, { x: at.x, y: at.y, size: at.size / 0.72 }, at.size / 0.72, smoother(span(k, 0.2, 0.5)), gone < 1)
        if (gone > 0) {
          // it has become a frame like the others
          ctx.fillStyle = `rgba(245,245,245,${(gone * 0.9).toFixed(3)})`
          const tall = Math.max(2, stripH * (at.size / 0.72 / frameW) * (0.08 + 0.92 * AUDIO.rms[frameHome] / peak))
          ctx.fillRect(at.x - at.size / 2, at.y - tall / 2, at.size, tall)
        }
        return
      }
      if (t < T.word) {
        // the sound as one word
        const k = span(t, T.strip, T.word - T.strip)
        const there = smoother(span(k, 0.55, 0.4))
        if (reduced) {
          drawStrip(f, { x: frameX(frameHome), y: strip.y, size: frameW }, frameW, 1 - smoother(k), false)
        } else {
          const at = shrink({ x: strip.x, y: strip.y, size: stripW }, word, k)
          const m = at.size / stripW
          drawStrip(f, { x: at.x + (frameX(frameHome) - strip.x) * m, y: at.y, size: frameW * m }, frameW * m, 1 - there, false)
        }
        drawLine(f, i => (wordTokens.includes(i) ? 0.62 : 0), reduced ? smoother(k) : there)
        return
      }

      // ── the line ──
      const push = reduced ? 1 : 1 + 0.006 * Math.max(0, t - T.close)
      ctx.save()
      ctx.translate(cursorX, lineY)
      ctx.scale(push, push)
      ctx.translate(-cursorX, -lineY)
      let written = 0
      while (written < line.tokens.length && tokenAt[written] <= t) written++
      const away = smoother(span(t, T.look, 2.2)) * (1 - smoother(span(t, T.back - 1.6, 1.6)))   // attention is elsewhere
      const settled = smoother(span(t, T.written + 0.4, 1.2))
      const shade = (i: number) => {
        if (i >= written) return wordTokens.includes(i) ? 0.62 * (1 - span(t, T.write - 0.6, 0.6) * 0.55) : 0
        const arriving = written > 0 ? (shadeAt(line, written - 1)[i] ?? 0) : 0
        return lerp(lerp(arriving, finalShade[i] ?? 0.55, settled), 0.2, away)
      }
      drawLine(f, shade, 1)
      // the two cursors
      if (t >= T.back) {
        const size = fs
        const fadeIn = span(t, T.back, 0.3)
        if (firstOn(t)) {
          ctx.fillStyle = `rgba(245,245,245,${(0.92 * fadeIn).toFixed(3)})`
          ctx.fillRect(cursorX, Math.round(lineY - size * 0.86), Math.round(size * 0.56), Math.round(size * 1.1))
        }
        if (t >= T.second && secondOn(t)) {
          ctx.fillStyle = `rgba(121,191,255,${(0.95 * span(t, T.second, 0.3)).toFixed(3)})`
          ctx.fillRect(cursorX + Math.round(size * 0.56) + Math.round(size * 0.34), Math.round(lineY - size * 0.86), Math.round(size * 0.56), Math.round(size * 1.1))
        }
      }
      ctx.restore()

      // attention leaves the line: three hairlines from its last word to the three in the corner
      if (away > 0.01) {
        const from = { x: word.x, y: lineY - fs * 0.95 }
        ctx.save()
        ctx.strokeStyle = `rgba(245,245,245,${(0.2 * away).toFixed(3)})`
        ctx.lineWidth = 1
        spectatorDots(w).forEach(([x, y], i) => {
          const reach = smoother(clamp01(span(t, T.look, 2.2) * 1.4 - i * 0.14))
          ctx.beginPath()
          ctx.moveTo(from.x, from.y)
          const mx = lerp(from.x, x, 0.45), my = Math.min(from.y, y) - h * 0.1 - i * 10
          // drawn as far as attention has got
          const steps = 40
          for (let s = 1; s <= steps * reach; s++) {
            const u = s / steps
            ctx.lineTo((1 - u) ** 2 * from.x + 2 * u * (1 - u) * mx + u * u * x, (1 - u) ** 2 * from.y + 2 * u * (1 - u) * my + u * u * (y + 5))
          }
          ctx.stroke()
        })
        // and, for once, the game says what they are
        ctx.fillStyle = `rgba(245,245,245,${(0.5 * away).toFixed(3)})`
        ctx.font = font(small ? 9 : 10)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(script.meta.spectators, small ? 16 : 28, h - (small ? 16 : 28))
        ctx.restore()
      }
    },
  }
}
