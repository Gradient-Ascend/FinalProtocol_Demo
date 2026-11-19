import { useState, useSyncExternalStore } from 'react'
import { DoorOpen, HardDrive, Play, RotateCcw } from 'lucide-react'
import { battleStore } from '@/game/battle-store'
import type { BattleState } from '@/game/battle-types'
import { progressSaver } from '@/game/progress-saver'
import { DEFAULT_LOADOUT } from '@/game/skills'
import type { CampaignSnapshot } from '@/campaign/campaign-store'
import { fillText, script } from '@/story/script'
import { LoadoutEditor } from './LoadoutEditor'
import { Modal } from './Modal'
import { ProgressSaver } from './ProgressSaver'
import { newInstance, replayIntro, titlePrimary } from './flow'

// The title: the wordmark, what the log remembers, and the deck builder.
// With no run in progress there is one way in. Space is the first button.
export function TitleScreen({ state, campaign }: { state: BattleState; campaign: CampaignSnapshot }) {
  const { run, meta } = campaign
  const saver = useSyncExternalStore(progressSaver.subscribe, progressSaver.getSnapshot)
  const [confirming, setConfirming] = useState(false)
  const [saverOpen, setSaverOpen] = useState(false)
  // A run left standing at the gate goes back to the door.
  const atDoor = run?.layer === 4 && meta.door === 'kept'
  const label = !run ? script.title.start : atDoor ? script.title.door : script.title.continue
  return (
    <div className="state-overlay title-overlay">
      <div className="title-content">
        <div className="eyebrow">
          {fillText(script.title.eyebrow, { iteration: meta.iteration })}
          {saver.activeUser !== 'default' ? ` // USER ${saver.activeUser.toUpperCase()}` : ''}
        </div>
        <h1>FINAL<br />PROTOCOL</h1>
        {meta.door === 'open' && <p className="title-released">{script.title.released}</p>}
        <div className="title-actions">
          <button className="primary-action" onClick={titlePrimary}>
            {atDoor ? <DoorOpen size={16} /> : <Play size={16} />} {label} <span>SPACE</span>
          </button>
          {run && (
            <button
              className="secondary-action"
              onClick={() => (confirming ? newInstance() : setConfirming(true))}
              onBlur={() => setConfirming(false)}
            >
              {confirming ? `${script.title.newRun} / DISCARD THIS RUN?` : script.title.newRun}
            </button>
          )}
        </div>
        <div className="title-actions title-minor">
          <button className="secondary-action" onClick={replayIntro}>{script.title.replay}</button>
          <button className="secondary-action reset-decks" onClick={() => battleStore.setLoadout(DEFAULT_LOADOUT)}><RotateCcw size={15} /> DEFAULT DECKS</button>
          <button type="button" className="secondary-action" onClick={() => setSaverOpen(true)}><HardDrive size={15} /> SAVE / USER ({saver.activeUser.toUpperCase()})</button>
        </div>
      </div>
      <LoadoutEditor
        loadout={battleStore.getLoadout()}
        buffs={state.player.buffs}
        privilegePerFlag={state.tuning.privilegePerFlag}
        onChange={next => battleStore.setLoadout(next)}
      />
      {saverOpen && (
        <Modal onClose={() => setSaverOpen(false)} label="Progress saver">
          <h2>PROGRESS &amp; USER</h2>
          <ProgressSaver />
        </Modal>
      )}
    </div>
  )
}
