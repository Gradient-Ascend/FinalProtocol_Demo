import script from '../story/script.json'
import { mulberry32 } from '../game/battle-rules'
import { ENCOUNTERS } from '../game/encounters'
import type { Encounter } from '../game/encounters'
import { storage } from '../game/storage'
import { DEFAULT_TUNING, applyWeight, tuningFor, weightSanity } from '../game/tuning'
import type { Carry, Tuning } from '../game/tuning'

// The run between battles: which scene is showing, what the run holds, and
// the log the reset does not reach. No UI and no battle rules live here; the
// shell loads the encounter `selectNode` returns into the battle store and
// reports back how the battle ended.

export type Scene = 'attach' | 'intro' | 'title' | 'map' | 'entrance' | 'battle'
                  | 'reward' | 'interlude' | 'reset' | 'gate' | 'ending'

export type RunState = {
  seed: number; layer: 0 | 1 | 2 | 3 | 4          // 4 = at the gate
  broken: string[]; current: string | null
  sanity: number; tuning: Tuning; weights: string[]
  snapshot: { layer: number; tuning: Tuning; weights: string[] } | null
  attempts: Record<string, number>
}

export type MetaState = {
  introSeen: boolean; iteration: number; clears: number; deepest: number
  seenLines: string[]; ghosts: string[]            // encounter ids where a run ended
  door: 'closed' | 'kept' | 'open'
  transcript: { voice: string; text: string }[]    // capped at 400
}

export type CampaignSnapshot = { scene: Scene; run: RunState | null; meta: MetaState; offer: string[] | null; interlude: number | null }

export type CampaignStore = {
  getSnapshot(): CampaignSnapshot; subscribe(listener: () => void): () => void
  boot(search: string): void            // decides attach / title from storage and ?intro
  attach(): void; finishIntro(): void; replayIntro(): void
  startRun(): void; continueRun(): void; abandonRun(): void
  nodeState(id: string): 'broken' | 'open' | 'locked' | 'closed'
  selectNode(id: string): Encounter | null         // sets current; returns the encounter to load
  beginBattle(): void                              // entrance finished → scene 'battle'
  recordWin(sanity: number): void                  // the battle is won: kept at once; the scene stays 'battle'
  withdrawWin(): void                              // that battle is fought again: the run as it stood before the win
  battleWon(sanity: number): void                  // → 'reward' | 'interlude'
  recordDefeat(): void                             // the battle is lost: a layer rolls back at once; the scene stays 'battle'
  battleLost(): void                               // → 'reset'
  finishReset(): void; chooseWeight(id: string): void; finishInterlude(): void
  chooseGate(choice: 'open' | 'keep'): void; finishEnding(): void
  recordLine(voice: string, text: string, id?: string): void
  recordSeamLine(voice: string, text: string, id?: string): void   // a seam's line: logged once per run
}

const PROLOGUE = '0.B'
const BOSS_HEAL = 12
export const ELITE_SANITY_BONUS = 4
const TRANSCRIPT_CAP = 400
const GHOST_CAP = 200
const SEEN_CAP = 2000
const SAID_CAP = 400

type WeightText = { id: string; kind: string }
const WEIGHTS = script.weights as WeightText[]
const CORE_WEIGHTS = WEIGHTS.filter(weight => weight.kind === 'CORE').map(weight => weight.id)
const FUNCTION_WEIGHTS = WEIGHTS.filter(weight => weight.kind === 'FUNCTION').map(weight => weight.id)
const PATCH = WEIGHTS.find(weight => weight.kind === 'PATCH')?.id ?? 'patch'

function isEncounter(id: string): boolean {
  return Object.hasOwn(ENCOUNTERS, id)
}

// PATCH restores Sanity and is gone; only the others are held by a run.
function isHeldWeight(id: string): boolean {
  return CORE_WEIGHTS.includes(id) || FUNCTION_WEIGHTS.includes(id)
}

function skirmishes(layer: number): string[] {
  return Object.values(ENCOUNTERS).filter(encounter => encounter.layer === layer && encounter.kind === 'skirmish').map(encounter => encounter.id)
}

// What a run brings into the battle store: `battleStore.load(encounter, runCarry(run))`.
export function runCarry(run: RunState): Carry {
  return { sanity: run.sanity, tuning: { ...run.tuning } }
}

// Three offers: one CORE, one FUNCTION and PATCH, never a weight the run
// already holds. Drawn from the run's seed and how many nodes it has broken,
// so the same run is offered the same three if the screen is shown again.
// When one kind is used up the other fills its row.
export function offerFor(run: RunState): string[] {
  const random = mulberry32((run.seed ^ Math.imul(run.broken.length + 1, 0x9E3779B1)) >>> 0)
  const core = CORE_WEIGHTS.filter(id => !run.weights.includes(id))
  const fn = FUNCTION_WEIGHTS.filter(id => !run.weights.includes(id))
  const draw = (pool: string[]): string | undefined => pool.length ? pool.splice(Math.floor(random() * pool.length), 1)[0] : undefined
  const first = draw(core) ?? draw(fn)
  const second = draw(fn) ?? draw(core)
  return [first, second, PATCH].filter((id): id is string => id !== undefined)
}

// A node fought again gets a new board. The first attempt keeps the
// encounter's own seed: that is the board the content was tuned on.
function reseed(seed: number, runSeed: number, attempt: number): number {
  return (seed ^ Math.imul(runSeed + attempt, 0x9E3779B1)) >>> 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function whole(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function unique(items: string[]): string[] {
  return [...new Set(items)]
}

function freshMeta(): MetaState {
  return { introSeen: false, iteration: 1, clears: 0, deepest: 0, seenLines: [], ghosts: [], door: 'closed', transcript: [] }
}

// A missing log is a valid state: it reads as the first iteration.
export function sanitizeMeta(raw: unknown): MetaState {
  if (!isRecord(raw)) return freshMeta()
  const transcript = Array.isArray(raw.transcript)
    ? raw.transcript.flatMap(line => isRecord(line) && typeof line.voice === 'string' && typeof line.text === 'string'
      ? [{ voice: line.voice.slice(0, 16), text: line.text.slice(0, 400) }]
      : [])
    : []
  return {
    introSeen: raw.introSeen === true,
    iteration: whole(raw.iteration, 1, 999999, 1),
    clears: whole(raw.clears, 0, 999999, 0),
    deepest: whole(raw.deepest, 0, 4, 0),
    seenLines: unique(strings(raw.seenLines).filter(id => id.length <= 64)).slice(-SEEN_CAP),
    ghosts: strings(raw.ghosts).filter(isEncounter).slice(-GHOST_CAP),
    door: raw.door === 'kept' || raw.door === 'open' ? raw.door : 'closed',
    transcript: transcript.slice(-TRANSCRIPT_CAP),
  }
}

// The seam lines a run has already put in the log, as they were stored.
export function sanitizeSaid(raw: unknown): string[] {
  return unique(strings(raw).filter(key => key.length <= 480)).slice(-SAID_CAP)
}

// A stored run is rebuilt rather than believed: its numbers come from the
// weights it lists, its broken nodes have to fit its layer, and the battle
// that was open when the tab closed is not resumed. `reward` says a skirmish
// was won and its weight not yet chosen; `interlude` says a boss fell and
// what is said after it has not been read to its end.
export function sanitizeRun(raw: unknown): { run: RunState; reward: boolean; interlude: boolean } | null {
  if (!isRecord(raw) || typeof raw.seed !== 'number' || !Number.isFinite(raw.seed)) return null
  const layer = whole(raw.layer, 0, 4, 0) as RunState['layer']
  // The prologue is never stored: a run is saved from its first map on.
  if (layer === 0) return null
  const weights = unique(strings(raw.weights).filter(isHeldWeight))
  const tuning = tuningFor(weights)
  const stored = unique(strings(raw.broken).filter(isEncounter))
  const behind = stored.filter(id => ENCOUNTERS[id].layer < layer)
  // Every boss behind this layer fell, or the run would not be here.
  const bosses = Object.values(ENCOUNTERS).filter(encounter => encounter.kind !== 'skirmish' && encounter.layer < layer).map(encounter => encounter.id)
  const here = stored.filter(id => ENCOUNTERS[id].layer === layer && ENCOUNTERS[id].kind === 'skirmish').slice(0, 2)
  const kept = isRecord(raw.snapshot)
    ? unique(strings(raw.snapshot.weights).filter(isHeldWeight)).filter(id => weights.includes(id))
    : weights
  const attempts: Record<string, number> = {}
  if (isRecord(raw.attempts)) {
    for (const [id, count] of Object.entries(raw.attempts)) if (isEncounter(id)) attempts[id] = whole(count, 1, 9999, 1)
  }
  return {
    run: {
      seed: raw.seed >>> 0, layer,
      broken: unique([...behind, ...bosses, ...here]), current: null,
      sanity: whole(raw.sanity, 1, tuning.maxSanity, tuning.maxSanity), tuning, weights,
      snapshot: { layer, tuning: tuningFor(kept), weights: kept },
      attempts,
    },
    reward: raw.reward === true && layer < 4 && here.length > 0,
    // An interlude waits only at the door of a layer: before any of its nodes is broken.
    interlude: raw.interlude === true && here.length === 0,
  }
}

export function createCampaignStore(options: { seed?: () => number } = {}): CampaignStore {
  const nextSeed = options.seed ?? (() => Math.floor(Math.random() * 0x100000000))
  const listeners = new Set<() => void>()
  // A skirmish is won and its weight not yet chosen; kept with the stored run
  // so a closed tab does not cost the reward.
  let reward = false
  // A boss (or the Warden) fell and the interlude after it is still to be
  // read; kept with the stored run in the same way.
  let interlude = false
  // A win that has been recorded and not yet continued from: the run and the
  // deepest layer as they stood when that battle began, and the Sanity the
  // win was recorded with. Only while this is held can the win be withdrawn;
  // it is never stored.
  let won: { before: RunState; deepest: number; sanity: number } | null = null
  // A defeat that has been recorded and not yet continued from: the run is
  // rolled back already, and CONTINUE has only the reset left to show. It is
  // never stored: a reload finds the run as the defeat left it.
  let lost = false
  // The seam lines this run has put in the log: an interlude read again after
  // a reload, or the gate come back to, says nothing the log does not hold.
  let said: string[] = []
  let state = read('title')

  function read(scene: Scene): CampaignSnapshot {
    const stored = sanitizeRun(storage.get<unknown>('run', null))
    reward = stored?.reward ?? false
    interlude = stored?.interlude ?? false
    won = null
    lost = false
    said = sanitizeSaid(storage.get<unknown>('said', null))
    return { scene, run: stored?.run ?? null, meta: sanitizeMeta(storage.get<unknown>('meta', null)), offer: null, interlude: null }
  }

  function commit(patch: Partial<CampaignSnapshot>): void {
    state = { ...state, ...patch }
    listeners.forEach(listener => listener())
  }

  function saveRun(run: RunState | null): void {
    if (!run || run.layer === 0) storage.remove('run')
    else storage.set('run', { ...run, reward, interlude })
  }

  function saveMeta(meta: MetaState): void {
    storage.set('meta', meta)
  }

  function prologueRun(seed: number, attempts: Record<string, number>): RunState {
    return {
      seed, layer: 0, broken: [], current: PROLOGUE,
      sanity: DEFAULT_TUNING.maxSanity, tuning: { ...DEFAULT_TUNING }, weights: [],
      snapshot: null, attempts: { ...attempts, [PROLOGUE]: (attempts[PROLOGUE] ?? 0) + 1 },
    }
  }

  // A battle reported with no run behind it can only be the Warden fought
  // straight from the title, so that run is the one it belongs to.
  function runInBattle(): RunState | null {
    const run = state.run ?? prologueRun(nextSeed(), {})
    return run.current ? run : null
  }

  // The battle on the board is won. The win goes into the run and into
  // storage now, so a closed tab finds it; the scene is not changed here.
  // Returns what changed: null when no battle is being fought, and nothing
  // when this win is already recorded as it is. Reported again with another
  // Sanity before it is continued from (the battle's last number settled
  // after the first report), the win is worked out again from the run as it
  // stood when the battle began: one win, however often it is reported.
  function settle(sanity: number): Partial<CampaignSnapshot> | null {
    const before = won?.before ?? runInBattle()
    if (!before || !before.current) return null
    const kept = whole(sanity, 1, before.tuning.maxSanity, before.sanity)
    if (won?.sanity === kept) return {}
    const deepest = won?.deepest ?? state.meta.deepest
    const encounter = ENCOUNTERS[before.current]
    const broken = unique([...before.broken, encounter.id])
    won = { before, deepest, sanity: kept }
    if (encounter.kind === 'skirmish') {
      const bonus = encounter.elite ? ELITE_SANITY_BONUS : 0
      const next = {
        ...before, broken, current: null,
        sanity: Math.min(before.tuning.maxSanity, kept + bonus),
      }
      reward = true
      interlude = false
      saveRun(next)
      return { run: next }
    }
    // A boss, or the Warden: Sanity back, the next layer, and the snapshot
    // a defeat in that layer rolls back to.
    const layer = Math.min(4, encounter.layer + 1) as RunState['layer']
    const next: RunState = {
      ...before, broken, current: null, layer,
      sanity: Math.min(before.tuning.maxSanity, kept + BOSS_HEAL),
      snapshot: { layer, tuning: { ...before.tuning }, weights: [...before.weights] },
    }
    const meta = { ...state.meta, deepest: Math.max(deepest, layer) }
    reward = false
    interlude = true
    saveRun(next)
    saveMeta(meta)
    return { run: next, meta }
  }

  // The battle on the board is lost. The log counts the reset and keeps the
  // place; the run goes back. Inside a layer: to its snapshot, weights as they
  // were, Sanity full, its nodes unbroken. In the prologue: the prologue again.
  // Both are stored now. The scene is not changed here.
  function fall(run: RunState, fought: string): Partial<CampaignSnapshot> {
    const meta = {
      ...state.meta, iteration: state.meta.iteration + 1,
      ghosts: [...state.meta.ghosts, fought].slice(-GHOST_CAP),
    }
    const next: RunState = run.layer === 0 || !run.snapshot
      ? prologueRun(run.seed, run.attempts)
      : {
        ...run, current: null,
        tuning: { ...run.snapshot.tuning }, weights: [...run.snapshot.weights],
        sanity: run.snapshot.tuning.maxSanity,
        broken: run.broken.filter(id => ENCOUNTERS[id].layer !== run.layer),
      }
    reward = false
    saveRun(next)
    saveMeta(meta)
    return { run: next, meta }
  }

  function recordLine(voice: string, text: string, id?: string): void {
    const meta = {
      ...state.meta,
      transcript: [...state.meta.transcript, { voice, text }].slice(-TRANSCRIPT_CAP),
      seenLines: id && !state.meta.seenLines.includes(id) ? [...state.meta.seenLines, id].slice(-SEEN_CAP) : state.meta.seenLines,
    }
    saveMeta(meta)
    commit({ meta })
  }

  function forgetSaid(): void {
    said = []
    storage.remove('said')
  }

  function nodeState(id: string): 'broken' | 'open' | 'locked' | 'closed' {
    const { run } = state
    if (!run || !isEncounter(id)) return 'locked'
    if (run.broken.includes(id)) return 'broken'
    const encounter = ENCOUNTERS[id]
    // The third node of a layer closed when its boss opened.
    if (encounter.layer < run.layer) return 'closed'
    if (encounter.layer > run.layer) return 'locked'
    const brokenHere = skirmishes(run.layer).filter(node => run.broken.includes(node)).length
    if (encounter.kind === 'skirmish') return brokenHere >= 2 ? 'closed' : 'open'
    return encounter.kind === 'prologue' || brokenHere >= 2 ? 'open' : 'locked'
  }

  return {
    getSnapshot: () => state,

    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    // Reads the log and the stored run again and lands on the attach screen
    // or the title. `?intro=0` skips attach and the opening; `?intro=1`
    // forces them. Calling it again mid-run is a return to the title: the run
    // is as it was last saved.
    boot(search) {
      const intro = /(?:^|[?&#/])intro=([01])(?:[&#]|$)/.exec(search)?.[1]
      const next = read('title')
      const scene = intro === '0' ? 'title' : intro === '1' || !next.meta.introSeen ? 'attach' : 'title'
      state = { ...next, scene }
      listeners.forEach(listener => listener())
    },

    // The first gesture: it unlocks audio and starts the opening.
    attach() {
      if (state.scene === 'attach') commit({ scene: 'intro' })
    },

    finishIntro() {
      if (state.scene !== 'intro') return
      const meta = { ...state.meta, introSeen: true }
      saveMeta(meta)
      commit({ meta, scene: 'title' })
    },

    replayIntro() {
      if (state.scene === 'title') commit({ scene: 'intro' })
    },

    // A new instance: the prologue, straight into battle. It replaces any
    // run that was in progress.
    startRun() {
      if (state.scene !== 'title') return
      reward = false
      interlude = false
      won = null
      lost = false
      forgetSaid()
      saveRun(null)
      commit({ run: prologueRun(nextSeed(), {}), scene: 'battle', offer: null, interlude: null })
    },

    continueRun() {
      const { run } = state
      if (state.scene !== 'title' || !run) return
      // A boss fell and the tab was closed before its interlude was read out.
      if (interlude) commit({ scene: 'interlude', interlude: run.layer - 1 })
      else if (run.layer === 4) commit({ scene: 'gate' })
      else if (run.layer === 0) commit({ scene: 'battle' })
      else if (reward) commit({ scene: 'reward', offer: offerFor(run) })
      else commit({ scene: 'map' })
    },

    abandonRun() {
      reward = false
      interlude = false
      won = null
      lost = false
      forgetSaid()
      saveRun(null)
      commit({ run: null, scene: 'title', offer: null, interlude: null })
    },

    nodeState,

    selectNode(id) {
      const { run } = state
      if (!run || state.scene !== 'map' || nodeState(id) !== 'open') return null
      const encounter = ENCOUNTERS[id]
      const attempt = (run.attempts[id] ?? 0) + 1
      const next = { ...run, current: id, attempts: { ...run.attempts, [id]: attempt } }
      // Saved now, so closing the tab mid-battle still counts the attempt.
      saveRun(next)
      commit({ run: next, scene: encounter.kind === 'boss' ? 'entrance' : 'battle' })
      return attempt === 1 ? encounter : { ...encounter, seed: reseed(encounter.seed, run.seed, attempt) }
    },

    beginBattle() {
      if (state.scene === 'entrance') commit({ scene: 'battle' })
    },

    // The battle is won, at the moment it is won. The run and storage hold
    // the win from here on: a reload, a return to the title and CONTINUE all
    // find it. The scene stays where it is, on the battle's last screen.
    recordWin(sanity) {
      const patch = settle(sanity)
      if (patch?.run) commit(patch)
    },

    // The one way a recorded win is lost: the player chose to fight that
    // battle again from its last screen. The run goes back exactly as it
    // stood when the battle began (the same attempt, its node unbroken, the
    // Sanity it carried in, nothing offered), so the fight that follows is
    // the only one that counts and no win is counted twice.
    withdrawWin() {
      if (!won) return
      const { before, deepest } = won
      const meta = state.meta.deepest === deepest ? state.meta : { ...state.meta, deepest }
      won = null
      reward = false
      interlude = false
      saveRun(before)
      if (meta !== state.meta) saveMeta(meta)
      commit({ run: before, meta })
    },

    // CONTINUE: on to what follows the win. A win not yet recorded is
    // recorded here first.
    battleWon(sanity) {
      const patch = settle(sanity)
      const run = patch?.run ?? state.run
      if (!patch || !won?.before.current || !run) return
      const encounter = ENCOUNTERS[won.before.current]
      won = null
      if (encounter.kind === 'skirmish') commit({ ...patch, scene: 'reward', offer: offerFor(run), interlude: null })
      else commit({ ...patch, scene: 'interlude', interlude: encounter.layer, offer: null })
    },

    // A battle inside a layer is lost, at the moment it is lost. The run and
    // storage hold the defeat from here on: a reload and a return to the title
    // find the layer rolled back, and there is no way to fight that battle
    // again as it was entered. The scene stays on the battle's last screen.
    // The prologue is not recorded here: its defeat is CONTINUE's to report,
    // and until then the Warden can be fought again, as it always could.
    recordDefeat() {
      const { run } = state
      if (lost || !run?.current || run.layer === 0 || !run.snapshot) return
      lost = true
      commit(fall(run, run.current))
    },

    // CONTINUE on a lost battle: the reset. A defeat not yet recorded is
    // recorded here first.
    battleLost() {
      if (lost) {
        lost = false
        commit({ scene: 'reset', offer: null, interlude: null })
        return
      }
      const run = runInBattle()
      if (!run || !run.current) return
      commit({ ...fall(run, run.current), scene: 'reset', offer: null, interlude: null })
    },

    finishReset() {
      if (state.scene !== 'reset') return
      commit({ scene: !state.run ? 'title' : state.run.layer === 0 ? 'battle' : 'map' })
    },

    chooseWeight(id) {
      const { run, offer } = state
      if (!run || !offer?.includes(id)) return
      const tuning = applyWeight(run.tuning, id)
      const next = {
        ...run, tuning,
        weights: isHeldWeight(id) ? [...run.weights, id] : run.weights,
        sanity: Math.min(tuning.maxSanity, run.sanity + weightSanity(id)),
      }
      reward = false
      saveRun(next)
      commit({ run: next, offer: null, scene: 'map' })
    },

    finishInterlude() {
      if (state.scene !== 'interlude') return
      // Read to its end: a later visit goes straight on.
      if (interlude) {
        interlude = false
        saveRun(state.run)
      }
      commit({ interlude: null, scene: !state.run ? 'title' : state.run.layer === 4 ? 'gate' : 'map' })
    },

    // The door opens only from the player's side. Opening it ends the run;
    // keeping it closed leaves the run standing at the gate.
    chooseGate(choice) {
      const { run } = state
      if (state.scene !== 'gate' || !run || run.layer !== 4) return
      if (choice === 'open') {
        const meta: MetaState = { ...state.meta, door: 'open', clears: state.meta.clears + 1 }
        saveMeta(meta)
        // Removed from storage at once, so the ending cannot be claimed twice.
        storage.remove('run')
        commit({ meta, scene: 'ending' })
      } else {
        const meta: MetaState = { ...state.meta, door: 'kept' }
        saveMeta(meta)
        saveRun(run)
        commit({ meta, scene: 'title' })
      }
    },

    finishEnding() {
      if (state.scene === 'ending') commit({ run: null, scene: 'title' })
    },

    // Every line shown goes into the transcript; a line with an id is also
    // remembered as seen, across runs and resets.
    recordLine,

    // A line shown at a seam (an interlude, a layer's gate, the final
    // protocol, the ending) goes into the log once per run, however often
    // that seam is read: come back to, or read again after a reload.
    recordSeamLine(voice, text, id) {
      const key = id ?? `${voice}:${text}`
      if (said.includes(key)) return
      said = [...said, key].slice(-SAID_CAP)
      storage.set('said', said)
      recordLine(voice, text, id)
    },
  }
}

export const campaignStore = createCampaignStore()
