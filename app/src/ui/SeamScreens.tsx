import { useEffect, useMemo, useState } from 'react'
import { campaignStore } from '@/campaign/campaign-store'
import type { CampaignSnapshot } from '@/campaign/campaign-store'
import { playEnding, playReset } from '@/cinematic/stage'
import { SeamText } from '@/story/SeamText'
import type { SeamItem } from '@/story/SeamText'
import { voiceLabel } from '@/story/VoiceLine'
import { endingLines, endingNoteLines, gateLines, interludeLines, keptLines } from '@/story/seams'
import { defeatSelf, script } from '@/story/script'
import { resetDone } from './flow'
import { playMoment } from './moments'

type Props = { campaign: CampaignSnapshot; reducedMotion: boolean }

// Every line a seam shows goes into the log, once per run: a seam that is
// read again (the gate come back to, an interlude after a reload) adds
// nothing to it.
const record = (line: SeamItem) => campaignStore.recordSeamLine(line.voice, line.text, line.id)
// A reset is said each time it happens, and logged each time.
const recordEach = (line: SeamItem) => campaignStore.recordLine(line.voice, line.text, line.id)

// What is said after a boss falls.
export function InterludeScreen({ campaign, reducedMotion }: Props) {
  const index = campaign.interlude ?? 0
  const lines = useMemo(() => interludeLines(index), [index])
  return (
    <div className="scene seam-scene">
      <SeamText lines={lines} label="Interlude" reducedMotion={reducedMotion} onLine={record} onDone={() => campaignStore.finishInterlude()} />
    </div>
  )
}

// The final protocol. The door opens only from the player's side.
export function GateScreen({ reducedMotion }: Props) {
  const [kept, setKept] = useState(false)
  const lines = useMemo(() => (kept ? keptLines() : gateLines()), [kept])
  return (
    <div className="scene seam-scene gate-scene">
      {kept ? (
        <SeamText key="kept" lines={lines} label="The door stays closed" reducedMotion={reducedMotion} onLine={record} onDone={() => campaignStore.chooseGate('keep')} />
      ) : (
        <SeamText key="gate" lines={lines} label="The final protocol" reducedMotion={reducedMotion} onLine={record} onDone={() => undefined}>
          <button type="button" className="secondary-action gate-choice" onClick={event => { event.stopPropagation(); campaignStore.chooseGate('open') }}>{script.gate.open}</button>
          <button type="button" className="secondary-action gate-choice" onClick={event => { event.stopPropagation(); setKept(true) }}>{script.gate.keep}</button>
        </SeamText>
      )}
    </div>
  )
}

// The log as a text file, one line per entry, each behind its speaker's mark.
function saveLog(entries: readonly { voice: string; text: string }[], iteration: number): void {
  const body = entries.map(entry => `${(voiceLabel(entry.voice) || entry.voice).padEnd(12)}${entry.text}`)
  const text = [`${script.meta.documentTitle} / iteration ${iteration} / ${entries.length} lines`, '', ...body, ''].join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = script.ending.exportName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// The story's last line is written by the ending display itself, so the seam
// before it stops one line short.
const LAST_LINE = script.ending.lines.find(line => line.beat === 'last')

// The door was opened: the last lines, the display, then the last card.
export function EndingScreen({ campaign, reducedMotion }: Props) {
  const [stage, setStage] = useState<'lines' | 'display' | 'card'>('lines')
  const lines = useMemo(() => endingLines().filter(line => line.id !== LAST_LINE?.id), [])
  const notes = useMemo(() => endingNoteLines(), [])
  useEffect(() => {
    if (stage !== 'display') return
    let live = true
    const seen = campaignStore.getSnapshot().meta.transcript
    // Once, however often the effect runs: the display's line belongs in the log too.
    if (LAST_LINE && seen[seen.length - 1]?.text !== LAST_LINE.text) record({ id: LAST_LINE.id, voice: LAST_LINE.voice, text: LAST_LINE.text })
    const moment = playMoment(playEnding)
    void moment.done.then(() => { if (live) setStage('card') })
    return () => {
      live = false
      moment.cancel()
    }
  }, [stage])
  const { meta } = campaign
  return (
    <div className="scene seam-scene ending-scene">
      {stage === 'lines' && (
        <SeamText key="lines" lines={lines} label="Ending" reducedMotion={reducedMotion} onLine={record} onDone={() => setStage('display')} />
      )}
      {stage === 'card' && (
        <SeamText key="card" lines={notes} label="Release notes" reducedMotion={reducedMotion} onLine={record} onDone={() => undefined}>
          <button type="button" className="primary-action" onClick={event => { event.stopPropagation(); saveLog(meta.transcript, meta.iteration) }}>{script.ending.exportLabel}</button>
          <button type="button" className="secondary-action" onClick={event => { event.stopPropagation(); campaignStore.finishEnding() }}>RETURN TO TITLE</button>
        </SeamText>
      )}
    </div>
  )
}

// Sanity reached zero. The display, then what the sandbox says about it and
// what the log remembers, then back to the snapshot.
export function ResetScreen({ campaign, reducedMotion }: Props) {
  const [stage, setStage] = useState<'display' | 'lines'>('display')
  // How many times this save has been reset before this one.
  const [defeats] = useState(() => campaign.meta.iteration - 1)
  const lines = useMemo((): SeamItem[] => {
    const self = defeatSelf(defeats)
    return [{ voice: 'SYS', text: script.defeat.sys }, ...(self ? [{ id: self.id, voice: 'SELF', text: self.text }] : [])]
  }, [defeats])
  useEffect(() => {
    if (stage !== 'display') return
    let live = true
    const moment = playMoment(playReset)
    void moment.done.then(() => { if (live) setStage('lines') })
    return () => {
      live = false
      moment.cancel()
    }
  }, [stage])
  return (
    <div className="scene seam-scene reset-scene">
      {stage === 'lines' && (
        <SeamText lines={lines} label={script.defeat.word} reducedMotion={reducedMotion} onLine={recordEach} onDone={resetDone} />
      )}
    </div>
  )
}
