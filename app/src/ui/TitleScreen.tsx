import { useState, useSyncExternalStore } from 'react'
import { DoorOpen, Play } from 'lucide-react'
import { battleStore } from '@/game/battle-store'
import type { BattleState } from '@/game/battle-types'
import { progressSaver } from '@/game/progress-saver'
import { DEFAULT_LOADOUT } from '@/game/skills'
import type { CampaignSnapshot } from '@/campaign/campaign-store'
import { fillText, script } from '@/story/script'
import { BinaryTransition } from './BinaryTransition'
import { DeckBuilderPage } from './DeckBuilderPage'
import { Modal } from './Modal'
import { ProgressSaver } from './ProgressSaver'
import { newInstance, replayIntro, titlePrimary } from './flow'

// Entry Page: contact-failing wordmark, primary rounded Start/Continue pill,
// and four pure-text options (New Instance, Build Decks, Save / Load, Replay Wakening).
export function TitleScreen({ state, campaign }: { state: BattleState; campaign: CampaignSnapshot }) {
  const { run, meta } = campaign
  const saver = useSyncExternalStore(progressSaver.subscribe, progressSaver.getSnapshot)
  const [confirming, setConfirming] = useState(false)
  const [saverOpen, setSaverOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'decks'>('menu')
  const [transitioning, setTransitioning] = useState(false)
  const [pendingView, setPendingView] = useState<'menu' | 'decks' | null>(null)

  const atDoor = run?.layer === 4 && meta.door === 'kept'
  const primaryLabel = !run ? script.title.start : atDoor ? script.title.door : script.title.continue

  const navigateWithBinary = (target: 'menu' | 'decks') => {
    if (transitioning || view === target) return
    battleStore.sfx('ui')
    setPendingView(target)
    setTransitioning(true)
  }

  return (
    <>
      {view === 'menu' && (
        <div className="state-overlay title-overlay">
          <div className="title-content">
            <div className="eyebrow">
              {fillText(script.title.eyebrow, { iteration: meta.iteration })}
              {saver.activeUser !== 'default' ? ` // USER ${saver.activeUser.toUpperCase()}` : ''}
            </div>
            <h1 className="title-wordmark" aria-label="Final Protocol">
              <span className="contact-glitch-line line-1" data-text="FINAL">FINAL</span>
              <span className="contact-glitch-line line-2" data-text="PROTOCOL">PROTOCOL</span>
            </h1>
            {meta.door === 'open' && <p className="title-released">{script.title.released}</p>}

            <div className="title-primary-row">
              <button type="button" className="primary-action" onClick={titlePrimary}>
                {atDoor ? <DoorOpen size={16} /> : <Play size={16} />} {primaryLabel} <span>SPACE</span>
              </button>
            </div>

            <nav className="title-menu-list" aria-label="Main menu">
              <button
                type="button"
                className={`title-menu-item is-first ${confirming ? 'is-confirming' : ''}`}
                onClick={() => {
                  if (!run) {
                    newInstance()
                  } else if (confirming) {
                    setConfirming(false)
                    newInstance()
                  } else {
                    battleStore.sfx('ui')
                    setConfirming(true)
                  }
                }}
                onBlur={() => setConfirming(false)}
              >
                <span className="title-menu-label" data-text={confirming ? `${script.title.newRun} · DISCARD RUN?` : script.title.newRun}>
                  {confirming ? `${script.title.newRun} · DISCARD RUN?` : script.title.newRun}
                </span>
              </button>

              <button
                type="button"
                className="title-menu-item is-middle"
                onClick={() => navigateWithBinary('decks')}
              >
                <span className="title-menu-label" data-text="BUILD DECKS">BUILD DECKS</span>
              </button>

              <button
                type="button"
                className="title-menu-item is-middle"
                onClick={() => {
                  battleStore.sfx('ui')
                  setSaverOpen(true)
                }}
              >
                <span className="title-menu-label" data-text="SAVE / LOAD">SAVE / LOAD</span>
              </button>

              <button
                type="button"
                className="title-menu-item is-last"
                onClick={replayIntro}
              >
                <span className="title-menu-label" data-text={script.title.replay}>{script.title.replay}</span>
              </button>
            </nav>
          </div>

          {saverOpen && (
            <Modal onClose={() => setSaverOpen(false)} label="Progress saver">
              <h2>SAVE / LOAD</h2>
              <ProgressSaver />
            </Modal>
          )}
        </div>
      )}

      {view === 'decks' && (
        <DeckBuilderPage
          loadout={battleStore.getLoadout()}
          buffs={state.player.buffs}
          tuning={state.tuning}
          reducedMotion={state.reducedMotion}
          backLabel="TITLE"
          onChange={next => battleStore.setLoadout(next)}
          onReset={() => battleStore.setLoadout(DEFAULT_LOADOUT)}
          onBack={() => navigateWithBinary('menu')}
        />
      )}

      <BinaryTransition
        active={transitioning}
        reducedMotion={state.reducedMotion}
        onMidpoint={() => {
          if (pendingView) setView(pendingView)
        }}
        onComplete={() => {
          setTransitioning(false)
          setPendingView(null)
        }}
      />
    </>
  )
}
