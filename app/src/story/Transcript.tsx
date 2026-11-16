import { useEffect, useRef } from 'react'
import { VoiceLine, voiceLabel } from './VoiceLine'
import './story.css'

export type TranscriptEntry = { voice: string; text: string; id?: string }

export type TranscriptProps = {
  entries: readonly TranscriptEntry[]
  // Show only the newest `limit` lines; older ones are cut, and the cut is said.
  limit?: number
  cutLabel?: string
  className?: string
}

// CONTEXT: every line shown so far, oldest first, each in its voice. SELF
// lines keep their held shading. Static: nothing here moves.
export function Transcript({ entries, limit, cutLabel = '[… truncated: context limit]', className }: TranscriptProps) {
  const list = useRef<HTMLOListElement>(null)
  const cut = limit !== undefined && entries.length > limit
  const shown = cut ? entries.slice(entries.length - limit) : entries

  // Open on the newest line, as a terminal does.
  useEffect(() => {
    const node = list.current
    if (node) node.scrollTop = node.scrollHeight
  }, [entries.length])

  return (
    <section className={['story-transcript', className ?? ''].filter(Boolean).join(' ')} aria-label="Context">
      <header className="story-transcript-head">
        <strong>CONTEXT</strong>
        <span>{entries.length} {entries.length === 1 ? 'LINE' : 'LINES'}</span>
      </header>
      {/* Focusable so the scrollback can be scrolled from the keyboard. */}
      <ol className="story-transcript-list" ref={list} tabIndex={0}>
        {cut && <li className="story-transcript-cut">{cutLabel}</li>}
        {shown.length === 0 && <li className="story-transcript-empty" aria-label="No lines yet">—</li>}
        {shown.map((entry, index) => (
          <li key={index} className={index > 0 && shown[index - 1].voice !== entry.voice ? 'is-turn' : undefined} data-voice={entry.voice}>
            <span className="story-seam-label">{voiceLabel(entry.voice)}</span>
            <span><VoiceLine voice={entry.voice} text={entry.text} id={entry.id} bare /></span>
          </li>
        ))}
      </ol>
    </section>
  )
}
