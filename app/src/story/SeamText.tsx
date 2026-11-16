import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { VoiceLine, voiceLabel } from './VoiceLine'
import { useReducedMotion } from './use-reduced-motion'
import './story.css'

// A line at a seam. Besides the five voices, two kinds that are not speech:
// 'NOTE' (a release-notes line; the first of a block is its heading) and
// 'INSCRIPTION' (a gate's text, alone on the screen).
export type SeamItem = { id?: string; voice: string; text: string }

export type SeamTextProps = {
  lines: readonly SeamItem[]
  // The reader passed the last line, or skipped the sequence.
  onDone: () => void
  // Once per line, in order, as it is shown; a skip reports the rest at once,
  // so the scrollback still holds what was skipped.
  onLine?: (line: SeamItem) => void
  reducedMotion?: boolean
  label?: string
  // Shown under the last line once it is whole (the gate's two buttons). With
  // children the reader leaves by them: no key ends the screen, and a skip
  // only jumps to them.
  children?: ReactNode
  className?: string
}

// A watcher's line gets the screen to itself, and this long before any key counts.
export const ALONE_MS = 1400
const PAGE_LINES = 6

type Kind = 'alone' | 'notes' | 'speech'

function kindOf(voice: string): Kind {
  if (voice === 'GOD' || voice === 'INSCRIPTION') return 'alone'
  return voice === 'NOTE' ? 'notes' : 'speech'
}

// The first line of the page that holds `index`. A page is a run of one kind
// of line; a line that stands alone is a page by itself.
export function pageStart(lines: readonly SeamItem[], index: number): number {
  const kind = kindOf(lines[index].voice)
  if (kind === 'alone') return index
  let run = index
  while (run > 0 && kindOf(lines[run - 1].voice) === kind) run -= 1
  return run + Math.floor((index - run) / PAGE_LINES) * PAGE_LINES
}

export type Step = { index: number; whole: boolean; rushed: boolean; locked: boolean }

const stepAt = (lines: readonly SeamItem[], index: number, rushed = false): Step => ({
  index, whole: false, rushed, locked: !rushed && kindOf(lines[index]?.voice ?? '') === 'alone',
})

// What a press does to the step: a first press finishes the line being
// written, the next one moves on. `current` is the step as it stands when the
// press is applied, and that is what decides. `seenIndex` is the line the key
// handler was made for, which can be a moment older: a line reports itself
// whole once, so a press must never put back a step in which it was not, and
// a press meant for a line already left is not a press on the next one.
export function afterPress(current: Step, seenIndex: number, lines: readonly SeamItem[]): Step {
  if (current.index !== seenIndex || current.locked) return current
  if (!current.whole) return current.rushed ? current : { ...current, rushed: true }
  return current.index < lines.length - 1 ? stepAt(lines, current.index + 1) : current
}

// A full-screen sequence of lines, one at a time, at the reader's pace. Any
// key or a click advances; Escape or SKIP leaves the whole sequence.
export function SeamText({ lines, onDone, onLine, reducedMotion, label = 'Interlude', children, className }: SeamTextProps) {
  const calm = useReducedMotion(reducedMotion)
  const [step, setStep] = useState<Step>(() => stepAt(lines, 0))
  const root = useRef<HTMLDivElement>(null)
  const reported = useRef(-1)
  const finished = useRef(false)
  const last = lines.length - 1
  const hasActions = children !== undefined && children !== null && children !== false
  const atEnd = step.index >= last && step.whole

  const reportThrough = useCallback((index: number) => {
    for (let i = reported.current + 1; i <= index; i++) onLine?.(lines[i])
    reported.current = Math.max(reported.current, index)
  }, [lines, onLine])

  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    reportThrough(last)
    onDone()
  }, [last, onDone, reportThrough])

  useEffect(() => {
    if (lines.length === 0) finish()
    else reportThrough(step.index)
  }, [lines.length, step.index, finish, reportThrough])

  useEffect(() => {
    if (!step.locked) return
    const timer = window.setTimeout(() => {
      setStep(current => (current.index === step.index ? { ...current, locked: false } : current))
    }, ALONE_MS)
    return () => window.clearTimeout(timer)
  }, [step.index, step.locked])

  const advance = useCallback(() => {
    if (step.locked) return
    if (step.whole && step.index >= last) {
      if (!hasActions) finish()
      return
    }
    setStep(current => afterPress(current, step.index, lines))
  }, [step, last, lines, hasActions, finish])

  const skip = useCallback(() => {
    if (!hasActions) return finish()
    // Jump to the last line, whole; if it is already there, only stop its reveal.
    setStep(current => (current.index === last ? { ...current, rushed: true, locked: false } : stepAt(lines, last, true)))
  }, [hasActions, lines, last, finish])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) return
      // The game underneath must not also hear this key.
      event.stopPropagation()
      // A focused control on this screen keeps its own keys (Enter on SKIP, on a gate button).
      const target = event.target instanceof Element ? event.target : null
      const ownControl = target !== null && root.current?.contains(target) === true && target.closest('button, a, input, select, textarea') !== null
      if (event.key !== 'Escape' && ownControl) return
      event.preventDefault()
      if (event.key === 'Escape') skip()
      else if (!event.repeat) advance()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [advance, skip])

  useEffect(() => { root.current?.focus({ preventScroll: true }) }, [])

  const lineDone = useCallback((index: number) => {
    setStep(current => (current.index === index ? { ...current, whole: true } : current))
  }, [])

  const onSkipClick = (event: MouseEvent) => {
    event.stopPropagation()
    skip()
  }

  if (lines.length === 0) return null
  const start = pageStart(lines, step.index)
  const kind = kindOf(lines[step.index].voice)
  const waiting = step.whole && !step.locked && !(atEnd && hasActions)

  return (
    <div
      ref={root}
      className={['story-seam', className ?? ''].filter(Boolean).join(' ')}
      role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
      onClick={advance}
    >
      <div className="story-seam-stage">
        <div className="story-seam-page" data-kind={kind} role="log" aria-live="polite">
          {lines.slice(start, step.index + 1).map((line, offset) => {
            const index = start + offset
            const newest = index === step.index
            const turn = offset > 0 && lines[index - 1].voice !== line.voice
            const heading = kind === 'notes' && (index === 0 || kindOf(lines[index - 1].voice) !== 'notes')
            return (
              <p key={index} className={`story-seam-row${turn ? ' is-turn' : ''}${heading ? ' is-heading' : ''}`} data-voice={line.voice}>
                {kind === 'speech' && <span className="story-seam-label">{voiceLabel(line.voice)}</span>}
                <span className="story-seam-text">
                  <VoiceLine
                    voice={line.voice} text={line.text} id={line.id} bare
                    live={newest && !step.rushed} reducedMotion={calm}
                    onDone={newest ? () => lineDone(index) : undefined}
                  />
                </span>
              </p>
            )
          })}
          {atEnd && hasActions && <div className="story-seam-actions">{children}</div>}
        </div>
      </div>
      <div className="story-seam-foot">
        <span className={`story-seam-hint${waiting ? ' is-on' : ''}`} aria-hidden="true">
          <span className="on-keys">ANY KEY ▸</span><span className="on-touch">TAP ▸</span>
        </span>
        {!(atEnd && hasActions) && (
          <button type="button" className="story-seam-skip" onClick={onSkipClick} aria-label="Skip">SKIP<span aria-hidden="true">ESC</span></button>
        )}
      </div>
    </div>
  )
}
