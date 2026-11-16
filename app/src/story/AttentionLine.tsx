import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { TOKENS_PER_SECOND, attentionFor, shadeAt, shadeFinal, tokenDelay } from './attention'
import { useReducedMotion } from './use-reduced-motion'
import './story.css'

export type AttentionLineProps = {
  text: string
  id?: string               // the script line's id: finds its baked row
  still?: boolean           // no reveal: the whole line at once, with its held shading
  rate?: number             // tokens per second while it is written
  reducedMotion?: boolean
  onDone?: () => void       // the line is whole and holding
  className?: string
}

// The last arrival ripples across the earlier words before the line settles.
const SETTLE_MS = 320
// A token that has not arrived is not drawn, not even dimmed; it only keeps
// its place so the line does not reflow as it is written.
const UNBORN: CSSProperties = { opacity: 0, visibility: 'hidden' }

// One SELF line. Tokens arrive one at a time and each word's opacity eases to
// its attention; then the line holds. A new text is a new line: it starts over.
export function AttentionLine(props: AttentionLineProps) {
  return <Reveal key={`${props.id ?? ''}|${props.text}`} {...props} />
}

function Reveal({ text, id, still = false, rate = TOKENS_PER_SECOND, reducedMotion, onDone, className }: AttentionLineProps) {
  const line = useMemo(() => attentionFor(text, id), [text, id])
  const whole = useReducedMotion(reducedMotion) || still
  const total = line.tokens.length
  const [arrived, setArrived] = useState(whole ? total : 0)
  const [held, setHeld] = useState(whole)
  const told = useRef(false)

  useEffect(() => {
    if (held) return
    // Asked to stop moving mid-reveal (planning began, a key was pressed): finish at once.
    if (whole) {
      setArrived(total)
      setHeld(true)
      return
    }
    const wait = arrived >= total ? SETTLE_MS : arrived === 0 ? 0 : tokenDelay(line.tokens[arrived - 1], rate)
    const timer = window.setTimeout(() => {
      if (arrived >= total) setHeld(true)
      else setArrived(arrived + 1)
    }, wait)
    return () => window.clearTimeout(timer)
  }, [arrived, held, whole, total, line, rate])

  useEffect(() => {
    if (!held || told.current) return
    told.current = true
    onDone?.()
  }, [held, onDone])

  const shades = held ? shadeFinal(line) : shadeAt(line, arrived - 1)
  return (
    <span
      className={['story-attn', whole ? 'story-attn--still' : '', className ?? ''].filter(Boolean).join(' ')}
      // Says which numbers these are, so nothing downstream calls an estimate measured.
      data-attn={line.baked ? 'baked' : 'estimate'}
    >
      <span className="story-sr">{text}</span>
      <span aria-hidden="true">
        {line.tokens.map((token, j) => (
          <span key={j} className="story-tok" style={j < arrived ? { opacity: Number(shades[j].toFixed(3)) } : UNBORN}>{token}</span>
        ))}
      </span>
    </span>
  )
}
