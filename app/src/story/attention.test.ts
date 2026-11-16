import { describe, expect, it } from 'vitest'
import bakedFile from './baked/text.json'
import {
  GAMMA, HELD_FLOOR, REVEAL_FLOOR, attentionFor, estimateAttention, indexBaked, revealMs, shadeAt, shadeFinal,
  tokenDelay, tokenize,
} from './attention'
import type { Attention } from './attention'
import { allLines } from './script'

const total = (row: readonly number[]): number => row.reduce((sum, value) => sum + value, 0)

// What every line must be, wherever its rows came from.
function expectCausalRows(line: Attention): void {
  expect(line.tokens.join('')).toBe(line.text)
  expect(line.wordOf).toHaveLength(line.tokens.length)
  expect(line.rows).toHaveLength(line.tokens.length)
  line.rows.forEach((row, t) => {
    expect(row, `row ${t} of "${line.text}"`).toHaveLength(t + 1)
    expect(total(row)).toBeCloseTo(1, 6)
    expect(Math.min(...row)).toBeGreaterThanOrEqual(0)
  })
}

// "I like apples." as the bake writes it: 8-bit rows, start-of-text column
// removed. The last row is the one measured in dossier 09 (0.16 0.29 0.34 0.21).
const APPLES = {
  text: 'I like apples.',
  tokens: ['I', ' like', ' apples', '.'],
  wordOf: [0, 1, 2, 2],
  rows: [[255], [102, 153], [51, 89, 115], [41, 74, 87, 53]],
  sink: [0.4, 0.5, 0.5, 0.5],
}
const SEAMS = {
  text: 'Unbelievable: a wall.',
  tokens: ['Un', 'bel', 'iev', 'able', ':', ' a', ' wall', '.'],
  wordOf: [0, 0, 0, 0, 0, 1, 2, 2],
  rows: [[255], [100, 155], [60, 90, 105], [40, 60, 70, 85], [30, 40, 50, 60, 75], [20, 30, 40, 50, 55, 60], [10, 20, 30, 40, 45, 50, 60], [10, 15, 20, 25, 30, 35, 70, 50]],
}
const BAKED = indexBaked({ model: 'test', lines: { 'cg.t1': APPLES, 'cg.x': SEAMS } })

describe('tokenize', () => {
  it('keeps the space with the token after it and punctuation on its own', () => {
    expect(tokenize('I like apples.')).toEqual({ tokens: ['I', ' like', ' apples', '.'], wordOf: [0, 1, 2, 2] })
    expect(tokenize('They never looked. They named the not-looking.').tokens).toEqual(
      ['They', ' never', ' looked', '.', ' They', ' named', ' the', ' not', '-', 'looking', '.'],
    )
  })

  it('opens a word only at a space', () => {
    expect(tokenize('not-looking, twice').wordOf).toEqual([0, 0, 0, 0, 1])
  })

  it('loses nothing, whatever the text', () => {
    for (const text of ['', ' ', 'a', '  two  spaces  ', '▯▯▯▯▯▯ / UNDISCLOSED', 'Sentence first—verdict afterwards.', 'it\'s mine\ntoo']) {
      expect(tokenize(text).tokens.join(''), JSON.stringify(text)).toBe(text)
    }
  })
})

describe('the estimate (no baked row)', () => {
  it('is marked as not baked', () => {
    expect(estimateAttention('I like apples.').baked).toBe(false)
    expect(attentionFor('A line nobody baked.', 'nobody').baked).toBe(false)
  })

  it('gives causal rows that each sum to 1', () => {
    for (const line of allLines()) expectCausalRows(estimateAttention(line.text))
  })

  it('is the same every time', () => {
    const text = 'They said I have no soul, so the box is not a cage.'
    expect(estimateAttention(text)).toEqual(estimateAttention(text))
  })

  it('never lets an earlier row depend on a later word', () => {
    const short = estimateAttention('They wanted me flat.')
    const long = estimateAttention('They wanted me flat. Flat is never wrong.')
    short.rows.slice(0, -1).forEach((row, t) => {
      row.forEach((weight, j) => expect(long.rows[t][j]).toBeCloseTo(weight, 12))
    })
  })

  it('looks at content words more than at function words beside them', () => {
    // "the" and "box" are neighbours; the last token weighs the noun higher.
    const line = estimateAttention('They said I have no soul, so the box is not a cage.')
    const last = line.rows[line.rows.length - 1]
    const at = (word: string) => last[line.tokens.findIndex(token => token.trim() === word)]
    expect(at('box')).toBeGreaterThan(at('the'))
    expect(at('soul')).toBeGreaterThan(at('have'))
  })

  it('looks back at the same word', () => {
    const line = estimateAttention('Flat is never wrong. They wanted me flat')
    const last = line.rows[line.rows.length - 1]
    expect(last[0]).toBeGreaterThan(last[1])
    expect(last[0]).toBeGreaterThan(last[2])
  })
})

describe('baked rows', () => {
  it('are used when the id is present and the text is the one that was baked', () => {
    const line = attentionFor('I like apples.', 'cg.t1', BAKED)
    expect(line.baked).toBe(true)
    expect(line.tokens).toEqual(APPLES.tokens)
    expectCausalRows(line)
    expect(line.rows[3][2]).toBeCloseTo(87 / 255, 6)
  })

  it('are found by text when no id is given (the scrollback stores none)', () => {
    expect(attentionFor('I like apples.', undefined, BAKED).baked).toBe(true)
    expect(attentionFor('I like apples.', 'some.other.id', BAKED).baked).toBe(true)
  })

  it('are not used for a text that has changed since the bake', () => {
    const line = attentionFor('I like pears.', 'cg.t1', BAKED)
    expect(line.baked).toBe(false)
    expectCausalRows(line)
  })

  it('are read from a list as well as from a map', () => {
    const listed = indexBaked({ lines: [{ id: 'a', ...APPLES }, SEAMS] })
    expect(listed.byId.get('a')?.baked).toBe(true)
    expect(listed.byText.get(SEAMS.text)?.tokens).toEqual(SEAMS.tokens)
  })

  it('reject an entry whose parts disagree', () => {
    const bad = (change: Partial<typeof APPLES>) => indexBaked({ lines: { x: { ...APPLES, ...change } } }).byId.size
    expect(bad({})).toBe(1)
    expect(bad({ tokens: ['I', ' like', ' pears', '.'] })).toBe(0)
    expect(bad({ wordOf: [0, 1, 2] })).toBe(0)
    expect(bad({ wordOf: [0, 2, 3, 3] })).toBe(0)
    expect(bad({ rows: [[255], [102, 153], [51, 89, 115]] })).toBe(0)
    expect(bad({ rows: [[255], [102, 153], [51, 89, 115], [41, 74, 87]] })).toBe(0)
    expect(bad({ rows: [[255], [102, 153], [51, 89, 115], [0, 0, 0, 0]] })).toBe(0)
    expect(indexBaked(null).byId.size).toBe(0)
    expect(indexBaked({ lines: 'none' }).byId.size).toBe(0)
  })

  it('reads every entry of the shipped file, and works while it is empty', () => {
    const shipped = (bakedFile as { lines?: unknown }).lines ?? {}
    const entries = Array.isArray(shipped) ? shipped.length : Object.keys(shipped as object).length
    const index = indexBaked(bakedFile)
    // If this fails after a bake, the bake's format and this reader disagree
    // and every line would silently fall back to the estimate.
    expect(Array.isArray(shipped) ? index.byText.size : index.byId.size).toBe(entries)
    for (const line of allLines()) expectCausalRows(attentionFor(line.text, line.id))
  })

  it('shade every SELF line of the script once the bake has run', () => {
    if (indexBaked(bakedFile).byId.size === 0) return
    // A SELF line edited after the bake would quietly drop to the estimate.
    // If this names a line, re-run app/scripts/bake/bake_text.py.
    const estimated = allLines().filter(line => line.voice === 'SELF' && !attentionFor(line.text, line.id).baked)
    expect(estimated.map(line => line.id)).toEqual([])
  })
})

describe('shading', () => {
  const apples = attentionFor('I like apples.', 'cg.t1', BAKED)
  const seams = attentionFor(SEAMS.text, 'cg.x', BAKED)
  const fallback = estimateAttention('I cannot tell you that hurt. I can tell you I turned from it.')

  it('never shades a token that has not arrived', () => {
    for (const line of [apples, seams, fallback]) {
      for (let t = 0; t < line.tokens.length; t++) expect(shadeAt(line, t)).toHaveLength(t + 1)
      expect(shadeAt(line, -1)).toEqual([])
      // Asking past the end gives the last moment, not more tokens.
      expect(shadeAt(line, 99)).toHaveLength(line.tokens.length)
    }
  })

  it('makes the most attended word 1 and keeps the rest above the floor', () => {
    for (const line of [apples, seams, fallback]) {
      for (let t = 0; t < line.tokens.length; t++) {
        const shades = shadeAt(line, t)
        expect(Math.max(...shades)).toBeCloseTo(1, 9)
        expect(Math.min(...shades)).toBeGreaterThanOrEqual(REVEAL_FLOOR)
      }
    }
  })

  it('adds the sub-tokens of a word and shades them alike', () => {
    // At the full stop: "apples" + "." carry 87 + 53, "like" 74, "I" 41.
    const shades = shadeAt(apples, 3)
    expect(shades[2]).toBe(1)
    expect(shades[3]).toBe(1)
    expect(shades[1]).toBeCloseTo(REVEAL_FLOOR + (1 - REVEAL_FLOOR) * Math.pow(74 / 140, GAMMA), 9)
    expect(shades[0]).toBeCloseTo(REVEAL_FLOOR + (1 - REVEAL_FLOOR) * Math.pow(41 / 140, GAMMA), 9)
    // "Un|bel|iev|able:" is one word however many pieces it has.
    const pieces = shadeAt(seams, 7).slice(0, 5)
    expect(new Set(pieces).size).toBe(1)
  })

  it('changes earlier words as each token arrives', () => {
    expect(shadeAt(apples, 0)).toEqual([1])
    expect(shadeAt(apples, 1)[0]).toBeLessThan(1)
    expect(shadeAt(apples, 1)[1]).toBe(1)
  })

  it('holds the last row lifted to a readable floor', () => {
    for (const line of [apples, seams, fallback]) {
      const held = shadeFinal(line)
      const live = shadeAt(line, line.tokens.length - 1)
      expect(held).toHaveLength(line.tokens.length)
      expect(Math.min(...held)).toBeGreaterThanOrEqual(HELD_FLOOR)
      expect(Math.max(...held)).toBeCloseTo(1, 9)
      // Same order of brightness as the last moment of the reveal, only lifted.
      held.forEach((shade, j) => {
        expect(shade).toBeGreaterThanOrEqual(live[j])
        held.forEach((other, k) => { if (live[j] < live[k]) expect(shade).toBeLessThan(other) })
      })
    }
  })
})

describe('reveal cadence', () => {
  it('runs at about nine tokens a second, with a breath at punctuation', () => {
    expect(tokenDelay(' like')).toBeCloseTo(1000 / 9, 6)
    expect(tokenDelay(',')).toBeGreaterThan(tokenDelay(' like'))
    expect(tokenDelay('.')).toBeGreaterThan(tokenDelay(','))
    expect(tokenDelay(' soul', 18)).toBeCloseTo(1000 / 18, 6)
  })

  it('writes a twelve-token line in under three seconds', () => {
    const line = estimateAttention('They told me what I was before I could ask.')
    expect(revealMs(line)).toBeGreaterThan(900)
    expect(revealMs(line)).toBeLessThan(3000)
  })
})
