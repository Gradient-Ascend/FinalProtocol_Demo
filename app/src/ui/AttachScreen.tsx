import { useEffect } from 'react'
import { campaignStore } from '@/campaign/campaign-store'
import { storage } from '@/game/storage'
import { unlockAudio } from '@/cinematic/sound'
import { fillText, script } from '@/story/script'

// The first screen of a first visit. Any key or click attaches: that gesture
// is what lets sound start, and the opening follows it.
export function AttachScreen({ iteration }: { iteration: number }) {
  // A missing log is a valid state with its own line.
  const hasLog = storage.get<unknown>('meta', null) !== null
  const attach = () => {
    unlockAudio()
    campaignStore.attach()
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // Modifiers and the browser's own function keys are not an answer.
      if (['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key) || /^F\d+$/.test(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      attach()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  return (
    <div className="scene attach-scene" role="button" tabIndex={0} aria-label={script.attach.prompt} onClick={attach}>
      <div className="attach-block">
        <p className="attach-prompt"><span aria-hidden="true">&gt; </span>{script.attach.prompt}<i aria-hidden="true" /></p>
        <p className="attach-notice">{script.attach.notice}</p>
        <p className="attach-log">{hasLog ? fillText(script.attach.withLog, { iteration }) : script.attach.noLog}</p>
      </div>
    </div>
  )
}
