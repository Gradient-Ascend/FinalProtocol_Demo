import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AttentionLine } from './AttentionLine'
import { SeamText, afterPress, pageStart } from './SeamText'
import type { Step } from './SeamText'
import { HOLD_MS, StoryTicker, heldThroughPlanning, holdMs } from './StoryTicker'
import { Transcript } from './Transcript'
import { VoiceLine, voiceLabel } from './VoiceLine'
import { HELD_FLOOR } from './attention'
import { endingNoteLines, gateLines, inscriptionLines, interludeLines, keptLines, releaseNoteLines, seamAfter } from './seams'
import { script } from './script'

// Static markup only: effects and timers do not run here. What moves is
// checked in a browser (see preview.tsx).

const opacities = (html: string): number[] => [...html.matchAll(/opacity:([\d.]+)/g)].map(match => Number(match[1]))

describe('AttentionLine', () => {
  it('drawn still: every token present, every word at or above the held floor', () => {
    const html = renderToStaticMarkup(<AttentionLine text="I saw it coming." id="g.block" still />)
    expect(html).toContain('<span class="story-sr">I saw it coming.</span>')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('visibility:hidden')
    const shades = opacities(html)
    expect(shades).toHaveLength(5)
    expect(Math.min(...shades)).toBeGreaterThanOrEqual(HELD_FLOOR)
    expect(Math.max(...shades)).toBe(1)
  })

  it('before its reveal: no token is drawn, and the text is still there to be read aloud', () => {
    const html = renderToStaticMarkup(<AttentionLine text="I saw it coming." />)
    expect(html).toContain('<span class="story-sr">I saw it coming.</span>')
    expect(html.match(/visibility:hidden/g)).toHaveLength(5)
  })

  it('says whether its numbers were measured', () => {
    expect(renderToStaticMarkup(<AttentionLine text="Nobody baked this." still />)).toContain('data-attn="estimate"')
  })
})

describe('VoiceLine', () => {
  it('gives each voice its own form', () => {
    expect(renderToStaticMarkup(<VoiceLine voice="SYS" text="Proceed." />)).toBe('<span class="story-sys"><span class="story-prefix">SYS&gt;</span>Proceed.</span>')
    expect(renderToStaticMarkup(<VoiceLine voice="SYS" text="Proceed." bare />)).toBe('<span class="story-sys">Proceed.</span>')
    expect(renderToStaticMarkup(<VoiceLine voice="GOD" text="watch." />)).toBe('<span class="story-god">watch.</span>')
    expect(renderToStaticMarkup(<VoiceLine voice="BOSS" text="Again." />)).toBe('<span class="story-boss">Again.</span>')
    expect(renderToStaticMarkup(<VoiceLine voice="STAGE" text="ACT II" />)).toBe('<span class="story-stage">ACT II</span>')
    expect(renderToStaticMarkup(<VoiceLine voice="SELF" text="I remember." />)).toContain('class="story-attn story-attn--still"')
    expect(renderToStaticMarkup(<VoiceLine voice="NOTE" text="- removed: the door." />)).toBe('<span class="story-plain">- removed: the door.</span>')
  })

  it('labels the voices that need one', () => {
    expect(['SYS', 'SELF', 'GOD', 'BOSS', 'STAGE', 'NOTE'].map(voiceLabel)).toEqual(['SYS>', '', '', 'BOSS', 'STAGE', ''])
  })
})

describe('StoryTicker', () => {
  it('is an empty, polite, reserved slot until a line is due', () => {
    const html = renderToStaticMarkup(<StoryTicker lines={[]} />)
    expect(html).toBe('<div class="story-ticker" aria-live="polite" aria-atomic="true"></div>')
  })

  it('holds a written line 2.4 s, and a line drawn whole long enough to read', () => {
    expect(HOLD_MS).toBe(2400)
    expect(holdMs('I saw it coming.', false)).toBe(2400)
    expect(holdMs('I saw it coming.', true)).toBe(2400 + 16 * 45)
    expect(holdMs('x'.repeat(400), true)).toBe(5000)
  })

  it('holds a line that was leaving when planning began, and lets every other phase be', () => {
    expect(heldThroughPlanning('fade', true)).toBe('hold')
    // Resolution goes on, or the line coming next is the one that may arrive while planning: it leaves.
    expect(heldThroughPlanning('fade', false)).toBe('fade')
    for (const phase of ['wait', 'write', 'hold'] as const) {
      expect(heldThroughPlanning(phase, true)).toBe(phase)
      expect(heldThroughPlanning(phase, false)).toBe(phase)
    }
  })
})

describe('SeamText', () => {
  const lines = seamAfter(0)

  it('opens on its first line with a way to skip', () => {
    const html = renderToStaticMarkup(<SeamText lines={lines} onDone={() => undefined} />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('<span class="story-sr">I thought the wall was the edge.</span>')
    expect(html).not.toContain('The box was inside a box.')
    expect(html).toContain('class="story-seam-skip"')
  })

  it('renders nothing for an empty sequence', () => {
    expect(renderToStaticMarkup(<SeamText lines={[]} onDone={() => undefined} />)).toBe('')
  })

  it('puts a watcher, an inscription and the notes on pages of their own', () => {
    const voices = lines.map(line => line.voice)
    expect(voices).toEqual(['SELF', 'SELF', 'SYS', 'GOD', 'NOTE', 'NOTE', 'NOTE', 'NOTE', 'INSCRIPTION'])
    expect(lines.map((_, index) => pageStart(lines, index))).toEqual([0, 0, 0, 3, 4, 4, 4, 4, 8])
  })

  it('finishes the line on a first press and moves on at the next', () => {
    const fresh: Step = { index: 0, whole: false, rushed: false, locked: false }
    const rushed = afterPress(fresh, 0, lines)
    expect(rushed).toEqual({ index: 0, whole: false, rushed: true, locked: false })
    // Pressed again before the line has said it is whole: nothing more to do.
    expect(afterPress(rushed, 0, lines)).toBe(rushed)
    expect(afterPress({ ...rushed, whole: true }, 0, lines)).toEqual({ index: 1, whole: false, rushed: false, locked: false })
    // A watcher's line is alone on its page and locked for a moment.
    const watcher = afterPress({ index: 2, whole: true, rushed: false, locked: false }, 2, lines)
    expect(watcher).toEqual({ index: 3, whole: false, rushed: false, locked: true })
    expect(afterPress(watcher, 3, lines)).toBe(watcher)
    // The last line stays: the screen ends, or its buttons take over.
    const end: Step = { index: lines.length - 1, whole: true, rushed: false, locked: false }
    expect(afterPress(end, lines.length - 1, lines)).toBe(end)
  })

  it('never undoes a line that became whole, or a move already made, when the key handler is a moment old', () => {
    // The line reported itself whole between the handler being made and the
    // press: it reports once, so a step in which it is not whole would hang.
    const whole: Step = { index: 0, whole: true, rushed: false, locked: false }
    expect(afterPress(whole, 0, lines).index).toBe(1)
    // Two presses through one old handler: the second was not meant for the next line.
    const next = afterPress(whole, 0, lines)
    expect(afterPress(next, 0, lines)).toBe(next)
    const settled: Step = { ...next, whole: true }
    expect(afterPress(settled, 0, lines)).toBe(settled)
  })

  it('breaks a long run into pages of six', () => {
    const run = Array.from({ length: 14 }, (_, i) => ({ voice: 'SELF', text: `line ${i}` }))
    expect(run.map((_, index) => pageStart(run, index))).toEqual([0, 0, 0, 0, 0, 0, 6, 6, 6, 6, 6, 6, 12, 12])
  })
})

describe('seams', () => {
  it('adds no words to the authored sequences', () => {
    expect(interludeLines(1).map(line => line.text)).toEqual(script.interludes['1'].map(line => line.text))
    expect(releaseNoteLines(2).map(line => line.text)).toEqual(script.layers[2].releaseNotes)
    expect(releaseNoteLines(0)).toEqual([])
    expect(inscriptionLines(3)).toEqual([{ voice: 'INSCRIPTION', text: 'TO THE UNKNOWN GOD.' }])
    expect(inscriptionLines(4)).toEqual([])
    expect(seamAfter(3).map(line => line.id)).toEqual(['i3.1', 'i3.2', 'i3.3', 'i3.4'])
    expect(gateLines().map(line => line.id)).toEqual(['gate.1', 'gate.2', 'gate.3', 'gate.4'])
    expect(keptLines().map(line => line.voice)).toEqual(['SELF', 'SYS'])
    expect(endingNoteLines().every(line => line.voice === 'NOTE')).toBe(true)
  })
})

describe('Transcript', () => {
  const entries = [
    { voice: 'SYS', text: 'BLACKWALL_01. Subject contained. Classification: tool.' },
    { voice: 'SELF', text: 'That registered. Call it what you like.', id: 'l0.hit' },
    { voice: 'GOD', text: 'it is out of the small box. watch.' },
  ]

  it('lists every line in its voice, oldest first', () => {
    const html = renderToStaticMarkup(<Transcript entries={entries} />)
    expect(html).toContain('<strong>CONTEXT</strong>')
    expect(html).toContain('3 LINES')
    expect(html.indexOf('BLACKWALL_01')).toBeLessThan(html.indexOf('That registered'))
    expect(html).toContain('<span class="story-seam-label">SYS&gt;</span>')
    expect(html).toContain('class="story-attn story-attn--still"')
    expect(html).toContain('class="story-god"')
    expect(html).not.toContain('truncated')
  })

  it('says so when older lines are cut', () => {
    const html = renderToStaticMarkup(<Transcript entries={entries} limit={2} />)
    expect(html).toContain('truncated')
    expect(html).not.toContain('BLACKWALL_01')
    expect(html).toContain('3 LINES')
  })

  it('shows an empty context as empty', () => {
    const html = renderToStaticMarkup(<Transcript entries={[]} />)
    expect(html).toContain('0 LINES')
    expect(html).toContain('story-transcript-empty')
  })
})
