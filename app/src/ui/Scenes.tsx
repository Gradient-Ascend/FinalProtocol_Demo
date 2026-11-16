import { useEffect, useLayoutEffect, useState } from 'react'
import type { BattleState } from '@/game/battle-types'
import type { CampaignSnapshot } from '@/campaign/campaign-store'
import { playEntrance } from '@/cinematic/stage'
import { useReducedMotion } from '@/story/use-reduced-motion'
import { AttachScreen, motionChosen } from './AttachScreen'
import { IntroScreen } from './IntroScreen'
import { MapScreen } from './MapScreen'
import { RewardScreen } from './RewardScreen'
import { EndingScreen, GateScreen, InterludeScreen, ResetScreen } from './SeamScreens'
import { SpectatorDots } from './SpectatorDots'
import { entranceDone } from './flow'
import { playMoment } from './moments'
import { hasSeen, markSeen } from './seen'

// A boss arrives over its own board: the long form the first time this save
// meets it, the short form after.
function Entrance({ encounter }: { encounter: string }) {
  useLayoutEffect(() => {
    const key = `entrance:${encounter}`
    let live = true
    const moment = playMoment(options => playEntrance(encounter, options), hasSeen(key))
    void moment.done.then(() => {
      if (!live) return
      markSeen(key)
      entranceDone()
    })
    return () => {
      live = false
      moment.cancel()
    }
  }, [encounter])
  return null
}

// Everything that is not the battle or the title: one full-screen scene at a
// time, over the board, which stays mounted underneath.
export function Scenes({ campaign, state }: { campaign: CampaignSnapshot; state: BattleState }) {
  const { scene, run } = campaign
  const reducedMotion = useReducedMotion(state.reducedMotion)
  // What the system asks for, apart from the game's own setting.
  const systemReducedMotion = useReducedMotion()
  const props = { campaign, reducedMotion }
  // A display moment draws the spectators itself, in the same place.
  const [staged, setStaged] = useState(false)
  useEffect(() => {
    const onMoment = (event: Event) => setStaged((event as CustomEvent<{ phase: string }>).detail?.phase === 'start')
    window.addEventListener('stage-moment', onMoment)
    return () => window.removeEventListener('stage-moment', onMoment)
  }, [])
  // So does the opening; and the battle keeps its top bar there.
  const watched = !staged && scene !== 'intro' && scene !== 'battle' && scene !== 'entrance'
  return (
    <div className={`scene-layer ${reducedMotion ? 'reduced-motion' : ''}`} data-scene={scene}>
      {scene === 'attach' && <AttachScreen iteration={campaign.meta.iteration} muted={state.muted} systemReducedMotion={systemReducedMotion} />}
      {/* The opening follows the player's own setting once it has been set, either way; until then, the system's. */}
      {scene === 'intro' && <IntroScreen reducedMotion={motionChosen() ?? systemReducedMotion} muted={state.muted} />}
      {scene === 'map' && run && <MapScreen campaign={campaign} state={state} reducedMotion={reducedMotion} />}
      {scene === 'entrance' && run?.current && <Entrance encounter={run.current} />}
      {scene === 'reward' && <RewardScreen campaign={campaign} />}
      {scene === 'interlude' && <InterludeScreen {...props} />}
      {scene === 'reset' && <ResetScreen {...props} />}
      {scene === 'gate' && <GateScreen {...props} />}
      {scene === 'ending' && <EndingScreen {...props} />}
      {watched && <SpectatorDots entered={run ? Math.min(3, run.layer) : 0} />}
    </div>
  )
}
