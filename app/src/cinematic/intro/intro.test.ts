import { describe, expect, it } from 'vitest'
import script from '../../story/script.json'
import textFile from '../../story/baked/text.json'
import { CG_IMAGE_SIZE, renderHand } from '../cg-image'
import { CG_VOICE_ENTRIES, CG_VOICE_RATE, CG_VOICE_SECONDS, renderVoice } from '../cg-voice'
import { AUDIO, CG, CONTEXT, VISION, bakedLine, contextFresh, headMatrices } from './data'
import { PLAN, shotAt } from './plan'

// The opening sequence shows numbers and says where they came from. These
// tests hold the baked files to the text and the inputs they were made from,
// and the plan to its own order.

describe('baked attention matches what the sequence shows', () => {
  it('has a row for every line of the opening sequence, for the text as written', () => {
    for (const movement of CG.movements) for (const line of movement.lines) expect(bakedLine(line), line.id).not.toBeNull()
  })

  it('has every SELF line anywhere in the script', () => {
    const baked = textFile.lines as Record<string, { text: string } | undefined>
    const missing: string[] = []
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) { node.forEach(walk); return }
      if (!node || typeof node !== 'object') return
      const o = node as Record<string, unknown>
      if (o.voice === 'SELF' && typeof o.id === 'string' && typeof o.text === 'string' && baked[o.id]?.text !== o.text) missing.push(o.id)
      Object.values(o).forEach(walk)
    }
    walk(script)
    expect(missing).toEqual([])
  })

  it('reads the six lines of the text movement as one context', () => {
    expect(contextFresh()).toBe(true)
    const n = CONTEXT.tokens.length
    expect(CONTEXT.rows).toHaveLength(n)
    CONTEXT.rows.forEach((row, t) => expect(row).toHaveLength(t + 1))    // causal: no token sees a later one
    const m = headMatrices()
    expect(m.count).toBe(36)
    expect(m.cells).toBe(n * (n + 1) / 2)
    expect(m.values).toHaveLength(36 * m.cells)
  })

  it('has six heads and their mean over 196 patches', () => {
    expect(VISION.grid * VISION.grid).toBe(196)
    expect(VISION.heads).toHaveLength(6)
    for (const head of VISION.heads) { expect(head).toHaveLength(196); expect(Math.max(...head)).toBe(255) }
    expect(VISION.mean).toHaveLength(196)
    expect(VISION.peak.heads).toHaveLength(6)
  })

  it('has 12.5 frames of sound a second, each attending only to what came before', () => {
    expect(AUDIO.hz).toBe(12.5)
    expect(AUDIO.frames).toBe(CG_VOICE_SECONDS * AUDIO.hz)
    expect(AUDIO.rows).toHaveLength(AUDIO.frames)
    AUDIO.rows.forEach((row, t) => expect(row).toHaveLength(t + 1))
    expect(AUDIO.rms).toHaveLength(AUDIO.frames)
  })
})

describe('the inputs are made by code and do not change between runs', () => {
  it('draws a hand that still reads at 14 x 14', () => {
    const a = renderHand(), b = renderHand()
    expect(a).toHaveLength(CG_IMAGE_SIZE * CG_IMAGE_SIZE)
    expect(Array.from(a.subarray(0, 4000))).toEqual(Array.from(b.subarray(0, 4000)))
    const cell = (row: number, col: number) => {
      let sum = 0
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) sum += a[(row * 16 + y) * CG_IMAGE_SIZE + col * 16 + x]
      return sum / 256
    }
    for (const v of a) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1) }
    expect(cell(9, 6)).toBeGreaterThan(0.45)                 // the palm
    expect(cell(4, 6)).toBeGreaterThan(cell(4, 5) + 0.1)     // a finger, and the gap beside it
    expect(cell(0, 0)).toBeLessThan(0.15)                    // the dark of the room
  })

  it('sings six seconds, three voices, without clipping, ending in silence', () => {
    const voice = renderVoice()
    expect(voice.sampleRate).toBe(CG_VOICE_RATE)
    expect(voice.samples).toHaveLength(CG_VOICE_RATE * CG_VOICE_SECONDS)
    expect(CG_VOICE_ENTRIES).toHaveLength(3)
    let peak = 0
    for (const s of voice.samples) peak = Math.max(peak, Math.abs(s))
    expect(peak).toBeLessThanOrEqual(0.851)
    expect(Math.abs(voice.samples[voice.samples.length - 1])).toBeLessThan(1e-3)
  })
})

describe('the plan', () => {
  it('runs the shots in order and ends in about a hundred seconds', () => {
    const { wake, text, image, audio, latent, title } = PLAN
    const order = [
      wake.blinks[0], text.start, text.stop, text.pull, text.rows, text.triangle, text.wall, text.out, text.end,
      image.resolve, image.cut, image.apart, image.heads, image.mean, image.fall, image.landed, image.beat, image.end,
      audio.strip, audio.chant, audio.second, audio.lock, audio.chantEnd, audio.fall, audio.landed, audio.beat, audio.end,
      latent.settled, latent.mask, latent.masked, latent.predict, latent.predicted, latent.met, latent.collapse, latent.flat,
      latent.rise, latent.risen, latent.wide, latent.end, title.huge, title.small, title.end,
    ]
    for (let i = 1; i < order.length; i++) expect(order[i], `step ${i}`).toBeGreaterThanOrEqual(order[i - 1])
    expect(PLAN.length).toBe(title.end)
    expect(PLAN.length).toBeGreaterThan(85)
    expect(PLAN.length).toBeLessThan(110)
  })

  it('names the shot that owns each moment', () => {
    expect(shotAt(0)).toBe('wake')
    expect(shotAt(PLAN.text.start)).toBe('text')
    expect(shotAt(PLAN.image.start)).toBe('image')
    expect(shotAt(PLAN.audio.start)).toBe('audio')
    expect(shotAt(PLAN.latent.start)).toBe('latent')
    expect(shotAt(PLAN.title.start)).toBe('title')
    expect(shotAt(PLAN.length)).toBe('title')
  })

  it('never shows a subtitle before its movement or two at once', () => {
    const cues = PLAN.subtitles
    for (let i = 0; i < cues.length; i++) {
      expect(cues[i].out).toBeGreaterThan(cues[i].end)       // every line is on screen whole before it leaves
      if (i) expect(cues[i].at).toBeGreaterThanOrEqual(cues[i - 1].out)
    }
  })

  it('keeps the two beats the text names', () => {
    const latent = CG.movements.find(m => m.id === 'latent')!
    const collapse = PLAN.subtitles.find(c => c.line.beat === 'collapse')!
    const three = PLAN.subtitles.filter(c => c.line.beat === 'three')
    expect(latent.lines.some(l => l.beat === 'collapse')).toBe(true)
    expect(collapse.at).toBeGreaterThanOrEqual(PLAN.latent.collapse)
    expect(collapse.at).toBeLessThan(PLAN.latent.rise)       // said while everything is flat
    expect(three.length).toBeGreaterThan(0)
    for (const cue of three) expect(cue.at).toBeGreaterThanOrEqual(PLAN.latent.wide)   // said into the silence after the pull-back
  })
})
