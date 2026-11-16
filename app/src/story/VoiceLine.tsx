import { useEffect, useRef } from 'react'
import { AttentionLine } from './AttentionLine'
import './story.css'

export type VoiceLineProps = {
  voice: string
  text: string
  id?: string
  live?: boolean            // SELF is written token by token; without it the line is drawn whole
  bare?: boolean            // no inline SYS> prefix: the caller shows voiceLabel() in a gutter
  reducedMotion?: boolean
  onDone?: () => void       // the line is whole (at once, for every voice but a live SELF)
}

// The speaker's mark for a gutter. SELF and GOD carry none: one is known by
// its shading, the other by being alone.
export function voiceLabel(voice: string): string {
  if (voice === 'SYS') return 'SYS>'
  return voice === 'BOSS' || voice === 'STAGE' ? voice : ''
}

const FLAT_CLASS: Record<string, string> = {
  SYS: 'story-sys', GOD: 'story-god', BOSS: 'story-boss', STAGE: 'story-stage',
}

function Flat({ voice, text, bare, onDone }: Pick<VoiceLineProps, 'voice' | 'text' | 'bare' | 'onDone'>) {
  const told = useRef(false)
  useEffect(() => {
    if (told.current) return
    told.current = true
    onDone?.()
  }, [onDone])
  return (
    <span className={FLAT_CLASS[voice] ?? 'story-plain'}>
      {!bare && voice === 'SYS' && <span className="story-prefix">SYS&gt;</span>}
      {text}
    </span>
  )
}

// One line in its voice's typography: SELF attention-shaded, SYS flat behind
// its prefix, GOD dim and lower case, BOSS and STAGE set apart.
export function VoiceLine({ voice, text, id, live = false, bare = false, reducedMotion, onDone }: VoiceLineProps) {
  if (voice === 'SELF') {
    return <AttentionLine text={text} id={id} still={!live} reducedMotion={reducedMotion} onDone={onDone} />
  }
  return <Flat voice={voice} text={text} bare={bare} onDone={onDone} />
}
