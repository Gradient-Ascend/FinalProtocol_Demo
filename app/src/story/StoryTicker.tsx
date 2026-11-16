import { useCallback, useEffect, useRef, useState } from 'react'
import { VoiceLine } from './VoiceLine'
import { useReducedMotion } from './use-reduced-motion'
import './story.css'

export type TickerLine = { id: string; voice: string; text: string; event?: string }

export type StoryTickerProps = {
  // The lines of one battle, append-only: each is shown once, in order, one at
  // a time. Empty the list (or remount with a key) when a new battle begins.
  lines: readonly TickerLine[]
  // The player is planning a route: no line appears, moves or disappears.
  frozen?: boolean
  reducedMotion?: boolean
  className?: string
}

export const HOLD_MS = 2400
const FADE_MS = 420
// A line that stayed up through planning has been read; it leaves soon after
// resolution resumes.
const AFTER_PLANNING_MS = 500
// A line drawn whole has no reveal to be read during, so its hold grows with
// its length.
const READ_MS_PER_CHAR = 45
const READ_MS_MAX = 2600

type Phase = 'wait' | 'write' | 'hold' | 'fade'

// The return to the tab happens outside resolution by definition, so its line
// is the one that may appear while the player plans.
const mayInterrupt = (line: TickerLine | undefined): boolean => line?.event === 'resume'

export function holdMs(text: string, drawnWhole: boolean): number {
  return HOLD_MS + (drawnWhole ? Math.min(READ_MS_MAX, text.length * READ_MS_PER_CHAR) : 0)
}

// The single line slot under the battle board. DOM text, announced politely,
// and never in the way of the pointer.
export function StoryTicker({ lines, frozen = false, reducedMotion, className }: StoryTickerProps) {
  const calm = useReducedMotion(reducedMotion)
  const [cursor, setCursor] = useState(0)
  const [phase, setPhase] = useState<Phase>('wait')
  // When the held line starts to fade; null until the hold begins or resumes.
  const leaveAt = useRef<number | null>(null)
  const sawPlanning = useRef(false)
  const line = cursor < lines.length ? lines[cursor] : undefined
  const blocked = frozen && !mayInterrupt(line)
  const pinned = frozen && !mayInterrupt(lines[cursor + 1])
  const hold = line ? holdMs(line.text, line.voice !== 'SELF' || calm || frozen) : 0

  // The list shrank: a new battle. Start again from its first line.
  useEffect(() => {
    if (cursor <= lines.length) return
    setCursor(0)
    setPhase('wait')
  }, [cursor, lines.length])

  useEffect(() => {
    if (phase === 'wait' && line && !blocked) setPhase('write')
  }, [phase, line, blocked])

  const written = useCallback(() => {
    leaveAt.current = null
    sawPlanning.current = false
    setPhase(current => (current === 'write' ? 'hold' : current))
  }, [])

  useEffect(() => {
    if (phase !== 'hold') return
    if (pinned) {
      sawPlanning.current = true
      leaveAt.current = null
      return
    }
    const now = performance.now()
    if (leaveAt.current === null) leaveAt.current = now + (sawPlanning.current ? AFTER_PLANNING_MS : hold)
    const timer = window.setTimeout(() => setPhase('fade'), Math.max(0, leaveAt.current - now))
    return () => window.clearTimeout(timer)
  }, [phase, pinned, hold])

  useEffect(() => {
    if (phase !== 'fade') return
    const timer = window.setTimeout(() => {
      setCursor(current => current + 1)
      setPhase('wait')
    }, FADE_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  return (
    <div className={['story-ticker', className ?? ''].filter(Boolean).join(' ')} aria-live="polite" aria-atomic="true">
      {line && phase !== 'wait' && (
        <div key={cursor} className="story-ticker-line" data-voice={line.voice} data-phase={phase}>
          <VoiceLine voice={line.voice} text={line.text} id={line.id} live={!frozen} reducedMotion={calm} onDone={written} />
        </div>
      )}
    </div>
  )
}
