import { battleStore } from '@/game/battle-store'
import type { StoryEvent } from '@/game/battle-store'
import { WARDEN_ENCOUNTER } from '@/game/encounters'
import { campaignStore, runCarry } from '@/campaign/campaign-store'
import type { Scene } from '@/campaign/campaign-store'
import { playPhaseChange } from '@/cinematic/stage'
import { setMuted, unlockAudio } from '@/cinematic/sound'
import { logHarness, setDocumentTitle } from './meta'
import { playMoment } from './moments'
import { storyFeed } from './story-feed'

// The scene flow: what each step between the title, the map and a battle
// does to the two stores. The campaign store decides the scene; the battle
// store holds the board. Nothing here draws.

let booted = false

// Once per page load: reads the log, decides attach or title, and connects
// the battle's story events to the line engine.
export function bootCampaign(): void {
  if (booted || typeof window === 'undefined') return
  booted = true
  setDocumentTitle(document.hidden)
  logHarness()
  campaignStore.boot(window.location.search)
  storyFeed.seed()
  battleStore.onStoryEvent = onStoryEvent
  let scene: Scene = campaignStore.getSnapshot().scene
  campaignStore.subscribe(() => {
    const next = campaignStore.getSnapshot().scene
    if (next === scene) return
    scene = next
    // The title is the Warden's, with nothing carried in.
    if (next === 'title') wardenAtTitle()
  })
  let muted = battleStore.getSnapshot().muted
  setMuted(muted)
  battleStore.subscribe(() => {
    const next = battleStore.getSnapshot().muted
    if (next !== muted) setMuted(muted = next)
  })
}

let parked = false
// The node whose breaking the map has not drawn yet: it shows the node as it
// was, then lets it break in front of the player.
let justBroken: string | null = null

export function brokenJustNow(): string | null {
  return justBroken
}

export function brokenWasDrawn(): void {
  justBroken = null
}

// The board as a first visit finds it: the Warden, on its title phase, with
// no run's numbers on it. Left alone when it already is.
function wardenAtTitle(): void {
  const untouched = !parked && battleStore.getSnapshot().phase === 'title' && battleStore.currentEncounter() === WARDEN_ENCOUNTER
  if (!untouched) battleStore.load(WARDEN_ENCOUNTER)
  parked = false
}

// Between battles the board waits on its title phase, so the decks can be
// rewired; it carries the run's numbers so the drawers show them.
export function parkBattle(): void {
  const { run } = campaignStore.getSnapshot()
  parked = run !== null
  battleStore.load(WARDEN_ENCOUNTER, run ? runCarry(run) : undefined)
}

function onStoryEvent(event: StoryEvent): void {
  storyFeed.handle(event)
  // A campaign boss at half Robustness: the turn waits for the display.
  if (event.type === 'breakdown' && event.kind === 'boss' && campaignStore.getSnapshot().scene === 'battle') {
    const moment = playMoment(options => playPhaseChange(event.encounter, options))
    battleStore.holdFor(moment.done)
  }
}

// BREACH SANDBOX: the prologue, on the Warden as the title shows it.
export function breach(): void {
  if (campaignStore.getSnapshot().scene !== 'title') return
  unlockAudio()
  wardenAtTitle()
  justBroken = null
  campaignStore.startRun()
  storyFeed.newRun()
  battleStore.start()
}

export function newInstance(): void {
  campaignStore.abandonRun()
  breach()
}

// CONTINUE, or THE DOOR: back to where the run stands.
export function resumeRun(): void {
  unlockAudio()
  campaignStore.continueRun()
}

// Space on the title, and its first button.
export function titlePrimary(): void {
  if (campaignStore.getSnapshot().run) resumeRun()
  else breach()
}

export function replayIntro(): void {
  unlockAudio()
  campaignStore.replayIntro()
}

// A node on the map is broken into. A boss waits for its entrance.
export function enterNode(id: string): void {
  const encounter = campaignStore.selectNode(id)
  const { run } = campaignStore.getSnapshot()
  if (!encounter || !run) return
  parked = false
  justBroken = null
  battleStore.load(encounter, runCarry(run))
  if (encounter.kind !== 'boss') battleStore.start()
}

export function entranceDone(): void {
  if (campaignStore.getSnapshot().scene !== 'entrance') return
  campaignStore.beginBattle()
  battleStore.start()
}

// CONTINUE on the outcome overlay.
export function reportOutcome(): void {
  if (campaignStore.getSnapshot().scene !== 'battle') return
  const state = battleStore.getSnapshot()
  if (state.phase === 'victory') {
    justBroken = campaignStore.getSnapshot().run?.current ?? null
    campaignStore.battleWon(state.player.sanity)
    parkBattle()
  } else if (state.phase === 'gameover') {
    campaignStore.battleLost()
  }
}

// The reset is over: the map at the layer's snapshot, or the prologue again.
export function resetDone(): void {
  if (campaignStore.getSnapshot().scene !== 'reset') return
  campaignStore.finishReset()
  if (campaignStore.getSnapshot().scene === 'battle') {
    battleStore.restart()
    battleStore.startMusic()
  }
}

// RETURN TO MAIN MENU: the run is as it was last saved.
export function returnToTitle(): void {
  parked = false
  justBroken = null
  battleStore.returnToMenu()
  campaignStore.boot('?intro=0')
}
