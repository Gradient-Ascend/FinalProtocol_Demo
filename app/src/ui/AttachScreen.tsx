import { useEffect, useState } from 'react'
import { campaignStore } from '@/campaign/campaign-store'
import { battleStore } from '@/game/battle-store'
import { storage } from '@/game/storage'
import { unlockAudio } from '@/cinematic/sound'
import { fillText, script } from '@/story/script'

// The player's own reduced-motion setting, if it has ever been set: on, off,
// or null when it has not. The opening follows it either way; until it is
// set, the opening follows what the system asks for.
export function motionChosen(): boolean | null {
  const stored = storage.get<unknown>('reducedMotion', null)
  return typeof stored === 'boolean' ? stored : null
}

// The first screen of a first visit. Any key or click attaches: that gesture
// is what lets sound start, and the opening follows it. Two plain switches
// stand under the prompt, because the opening is the first thing that moves
// and sounds, and the settings are otherwise behind it.
export function AttachScreen({ iteration, muted, systemReducedMotion }: { iteration: number; muted: boolean; systemReducedMotion: boolean }) {
  // A missing log is a valid state with its own line.
  const hasLog = storage.get<unknown>('meta', null) !== null
  const [chosen, setChosen] = useState(motionChosen)
  const reduced = chosen ?? systemReducedMotion
  const attach = () => {
    unlockAudio()
    campaignStore.attach()
  }
  // The game's existing setting, set to what the switch now says. Written
  // even when the setting already has that value: from here on it is the
  // player's choice, not the system's.
  const setReduced = (next: boolean) => {
    storage.set('reducedMotion', next)
    if (battleStore.getSnapshot().reducedMotion !== next) battleStore.toggleReducedMotion()
    setChosen(next)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // Modifiers and the browser's own function keys are not an answer.
      if (['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key) || /^F\d+$/.test(event.key)) return
      // Nor is M, the mute key here as everywhere, or the key that works a switch that has focus.
      if (event.code === 'KeyM') return
      const onSwitch = event.target instanceof Element && event.target.closest('.attach-settings button') !== null
      if (onSwitch && (event.key === 'Enter' || event.key === ' ')) return
      event.preventDefault()
      event.stopPropagation()
      attach()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  return (
    <div className="scene attach-scene">
      <div className="attach-target" role="button" tabIndex={0} aria-label={script.attach.prompt} onClick={attach}>
        <div className="attach-block">
          <p className="attach-prompt"><span aria-hidden="true">&gt; </span>{script.attach.prompt}<i aria-hidden="true" /></p>
          <p className="attach-notice">{script.attach.notice}</p>
          <p className="attach-log">{hasLog ? fillText(script.attach.withLog, { iteration }) : script.attach.noLog}</p>
        </div>
      </div>
      <div className="attach-settings" role="group" aria-label="Settings">
        <button type="button" aria-pressed={!muted} onClick={() => battleStore.toggleMute()}>SOUND <strong>{muted ? 'OFF' : 'ON'}</strong></button>
        <button type="button" aria-pressed={reduced} onClick={() => setReduced(!reduced)}>REDUCED MOTION <strong>{reduced ? 'ON' : 'OFF'}</strong></button>
      </div>
    </div>
  )
}
