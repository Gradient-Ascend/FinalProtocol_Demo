import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import script from '../story/script.json'
import { BattleStore } from '../game/battle-store'
import { createInitialState } from '../game/battle-rules'
import { ENCOUNTERS } from '../game/encounters'
import { DEFAULT_TUNING, applyWeight, tuningFor } from '../game/tuning'
import { campaignStore, createCampaignStore, offerFor, runCarry, sanitizeMeta, sanitizeRun, sanitizeSaid } from './campaign-store'
import type { CampaignStore, RunState, Scene } from './campaign-store'

// localStorage as a browser gives it, held in a Map the test can read.
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  return {
    items,
    getItem: (key: string): string | null => items.get(key) ?? null,
    setItem: (key: string, value: string): void => { items.set(key, String(value)) },
    removeItem: (key: string): void => { items.delete(key) },
  }
}

let disk = fakeStorage()

beforeEach(() => {
  disk = fakeStorage()
  vi.stubGlobal('localStorage', disk)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const stored = (key: string): unknown => {
  const raw = disk.items.get(`fp.${key}`)
  return raw === undefined ? null : JSON.parse(raw)
}

const KIND: Record<string, string> = Object.fromEntries(script.weights.map(weight => [weight.id, weight.kind]))
const CORE = script.weights.filter(weight => weight.kind === 'CORE').map(weight => weight.id)
const FUNCTION = script.weights.filter(weight => weight.kind === 'FUNCTION').map(weight => weight.id)

// A store on the title, as `?intro=0` leaves it. Reads whatever is on disk.
function opened(seed = 0xC0FFEE): CampaignStore {
  const store = createCampaignStore({ seed: () => seed })
  store.boot('?intro=0')
  return store
}

// The Warden falls and the first map is showing.
function onFirstMap(store: CampaignStore, sanity = 30): void {
  store.startRun()
  store.battleWon(sanity)
  store.finishInterlude()
}

// Wins a skirmish and takes the offered weight of that kind ('PATCH' by default).
function winSkirmish(store: CampaignStore, id: string, sanity: number, kind = 'PATCH'): string {
  expect(store.selectNode(id)?.id).toBe(id)
  store.battleWon(sanity)
  const pick = store.getSnapshot().offer?.find(weight => KIND[weight] === kind)
  if (!pick) throw new Error(`no ${kind} offered after ${id}`)
  store.chooseWeight(pick)
  return pick
}

function winBoss(store: CampaignStore, id: string, sanity: number): void {
  expect(store.selectNode(id)?.id).toBe(id)
  store.beginBattle()
  store.battleWon(sanity)
  store.finishInterlude()
}

const run = (store: CampaignStore): RunState => {
  const current = store.getSnapshot().run
  if (!current) throw new Error('no run')
  return current
}

const nodes = (store: CampaignStore, ids: string[]): string[] => ids.map(id => store.nodeState(id))

describe('boot', () => {
  it('opens on attach the first time, and on the title once the opening has been seen', () => {
    const store = createCampaignStore()
    store.boot('')
    expect(store.getSnapshot()).toMatchObject({ scene: 'attach', run: null, offer: null, interlude: null })
    // A missing log is a valid state: the first iteration.
    expect(store.getSnapshot().meta).toEqual({
      introSeen: false, iteration: 1, clears: 0, deepest: 0, seenLines: [], ghosts: [], door: 'closed', transcript: [],
    })
    store.finishIntro()
    store.replayIntro()
    expect(store.getSnapshot().scene).toBe('attach')
    store.attach()
    expect(store.getSnapshot().scene).toBe('intro')
    store.attach()
    expect(store.getSnapshot().scene).toBe('intro')
    store.finishIntro()
    expect(store.getSnapshot()).toMatchObject({ scene: 'title', meta: { introSeen: true } })
    expect(stored('meta')).toMatchObject({ introSeen: true })

    const later = createCampaignStore()
    later.boot('')
    expect(later.getSnapshot().scene).toBe('title')
    later.replayIntro()
    expect(later.getSnapshot().scene).toBe('intro')
    later.finishIntro()
    expect(later.getSnapshot().scene).toBe('title')
  })

  it('honours ?intro=0 and ?intro=1 over what the log says', () => {
    const store = createCampaignStore()
    for (const search of ['?intro=0', '?seed=4&intro=0', '?intro=0&x=1', '?intro=0#/preview/map']) {
      store.boot(search)
      expect(store.getSnapshot().scene, search).toBe('title')
    }
    // Skipping the opening is not having seen it.
    expect(store.getSnapshot().meta.introSeen).toBe(false)
    for (const search of ['', '?nointro=0', '?intro=00', '?intro=2', '?intro']) {
      store.boot(search)
      expect(store.getSnapshot().scene, search).toBe('attach')
    }
    disk.items.set('fp.meta', JSON.stringify({ introSeen: true }))
    store.boot('?x=1')
    expect(store.getSnapshot().scene).toBe('title')
    store.boot('?intro=1')
    expect(store.getSnapshot().scene).toBe('attach')
  })

  it('publishes each change once, and the same snapshot until the next one', () => {
    const store = opened()
    let published = 0
    const stop = store.subscribe(() => { published++ })
    const before = store.getSnapshot()
    expect(store.getSnapshot()).toBe(before)
    store.startRun()
    expect(published).toBe(1)
    expect(store.getSnapshot()).not.toBe(before)
    stop()
    store.battleWon(30)
    expect(published).toBe(1)
  })

  it('exports the store the spec declares', () => {
    expect(Object.keys(campaignStore).sort()).toEqual([
      'abandonRun', 'attach', 'battleLost', 'battleWon', 'beginBattle', 'boot', 'chooseGate', 'chooseWeight',
      'continueRun', 'finishEnding', 'finishInterlude', 'finishIntro', 'finishReset', 'getSnapshot', 'nodeState',
      'recordDefeat', 'recordLine', 'recordSeamLine', 'recordWin', 'replayIntro', 'selectNode', 'startRun', 'subscribe',
      'withdrawWin',
    ])
  })
})

describe('a run from the title to the gate', () => {
  it('fights the prologue, three layers of two nodes and a boss, and arrives at the gate', () => {
    const store = opened()
    const scenes: Scene[] = []
    store.subscribe(() => scenes.push(store.getSnapshot().scene))
    expect(nodes(store, ['0.B', '1.1'])).toEqual(['locked', 'locked'])

    store.startRun()
    expect(store.getSnapshot()).toMatchObject({
      scene: 'battle',
      run: { layer: 0, current: '0.B', broken: [], sanity: 36, tuning: DEFAULT_TUNING, weights: [], snapshot: null, attempts: { '0.B': 1 } },
    })
    // The prologue is not a saved run: closing the tab here starts it again.
    expect(stored('run')).toBeNull()
    expect(store.selectNode('0.B')).toBeNull()

    store.battleWon(20)
    expect(store.getSnapshot()).toMatchObject({
      scene: 'interlude', interlude: 0, offer: null,
      run: { layer: 1, current: null, broken: ['0.B'], sanity: 32, snapshot: { layer: 1, tuning: DEFAULT_TUNING, weights: [] } },
      meta: { deepest: 1 },
    })
    expect(stored('run')).toMatchObject({ layer: 1, sanity: 32 })
    store.finishInterlude()
    expect(store.getSnapshot()).toMatchObject({ scene: 'map', interlude: null })
    expect(nodes(store, ['0.B', '1.1', '1.2', '1.3', '1.B', '2.1', '2.B', '3.B', 'nowhere']))
      .toEqual(['broken', 'open', 'open', 'open', 'locked', 'locked', 'locked', 'locked', 'locked'])

    // Only an open node of this layer can be entered, and only from the map.
    for (const id of ['1.B', '2.1', '0.B', 'nowhere']) expect(store.selectNode(id)).toBeNull()
    expect(store.selectNode('1.1')).toBe(ENCOUNTERS['1.1'])
    expect(store.getSnapshot()).toMatchObject({ scene: 'battle', run: { current: '1.1', attempts: { '0.B': 1, '1.1': 1 } } })
    expect(store.selectNode('1.2')).toBeNull()

    store.battleWon(25)
    const offer = store.getSnapshot().offer ?? []
    expect(store.getSnapshot()).toMatchObject({ scene: 'reward', run: { current: null, broken: ['0.B', '1.1'], sanity: 25 } })
    expect(offer.map(id => KIND[id])).toEqual(['CORE', 'FUNCTION', 'PATCH'])
    // A weight that was not offered is not taken.
    store.chooseWeight(CORE.find(id => !offer.includes(id)) ?? '')
    store.chooseWeight('nowhere')
    expect(store.getSnapshot().scene).toBe('reward')
    store.chooseWeight(offer[0])
    expect(store.getSnapshot()).toMatchObject({ scene: 'map', offer: null, run: { weights: [offer[0]], tuning: tuningFor([offer[0]]) } })
    // Battle already reported: a second report changes nothing.
    const settled = store.getSnapshot()
    store.battleWon(1)
    store.battleLost()
    expect(store.getSnapshot()).toBe(settled)

    // Two nodes broken: the third closes and the boss opens.
    winSkirmish(store, '1.3', 10)
    expect(run(store).sanity).toBe(18)
    expect(run(store).weights).toEqual([offer[0]])
    expect(nodes(store, ['1.1', '1.2', '1.3', '1.B'])).toEqual(['broken', 'closed', 'broken', 'open'])
    expect(store.selectNode('1.2')).toBeNull()

    expect(store.selectNode('1.B')).toBe(ENCOUNTERS['1.B'])
    expect(store.getSnapshot().scene).toBe('entrance')
    store.beginBattle()
    expect(store.getSnapshot().scene).toBe('battle')
    store.battleWon(30)
    // +12, and no more than the maximum.
    const full = run(store).tuning.maxSanity
    expect(store.getSnapshot()).toMatchObject({
      scene: 'interlude', interlude: 1,
      run: { layer: 2, sanity: Math.min(full, 42), snapshot: { layer: 2, weights: [offer[0]], tuning: tuningFor([offer[0]]) } },
      meta: { deepest: 2 },
    })
    store.finishInterlude()
    expect(nodes(store, ['1.2', '1.B', '2.1', '2.2', '2.3', '2.B', '3.1'])).toEqual(['closed', 'broken', 'open', 'open', 'open', 'locked', 'locked'])

    winSkirmish(store, '2.2', 12)
    winSkirmish(store, '2.3', 9)
    store.selectNode('2.B')
    store.beginBattle()
    store.battleWon(5)
    expect(store.getSnapshot()).toMatchObject({ scene: 'interlude', interlude: 2, run: { layer: 3, sanity: 17 } })
    store.finishInterlude()
    winSkirmish(store, '3.1', 16)
    winSkirmish(store, '3.2', 14)
    store.selectNode('3.B')
    store.beginBattle()
    store.battleWon(3)

    // Past the last boss there is no fourth layer: the gate.
    expect(store.getSnapshot()).toMatchObject({ scene: 'interlude', interlude: 3, run: { layer: 4, sanity: 15, current: null }, meta: { deepest: 4, clears: 0, door: 'closed' } })
    store.finishInterlude()
    expect(store.getSnapshot().scene).toBe('gate')
    expect(nodes(store, ['0.B', '1.2', '3.3', '3.B'])).toEqual(['broken', 'closed', 'closed', 'broken'])
    expect(store.selectNode('3.3')).toBeNull()
    expect(stored('run')).toMatchObject({ layer: 4 })
    // Ten battles in a full clear.
    expect(scenes.filter(scene => scene === 'interlude')).toHaveLength(4)
    expect(scenes.filter(scene => scene === 'reward')).toHaveLength(6)
    expect(run(store).attempts).toEqual({ '0.B': 1, '1.1': 1, '1.3': 1, '1.B': 1, '2.2': 1, '2.3': 1, '2.B': 1, '3.1': 1, '3.2': 1, '3.B': 1 })
  })

  // A run already standing at the gate.
  function atGate(): CampaignStore {
    const store = opened()
    onFirstMap(store)
    for (const layer of [1, 2, 3]) {
      winSkirmish(store, `${layer}.1`, 20)
      winSkirmish(store, `${layer}.2`, 20)
      winBoss(store, `${layer}.B`, 20)
    }
    expect(store.getSnapshot()).toMatchObject({ scene: 'gate', run: { layer: 4 } })
    return store
  }

  it('keeps the door closed: back to the title with the run still at the gate', () => {
    const store = atGate()
    store.chooseGate('keep')
    expect(store.getSnapshot()).toMatchObject({ scene: 'title', run: { layer: 4 }, meta: { door: 'kept', clears: 0 } })
    expect(stored('meta')).toMatchObject({ door: 'kept', clears: 0 })
    expect(stored('run')).toMatchObject({ layer: 4 })
    // The choice is made at the gate and nowhere else.
    store.chooseGate('open')
    expect(store.getSnapshot()).toMatchObject({ scene: 'title', meta: { door: 'kept' } })

    // A later visit finds the gate again, and the choice is still the player's.
    const later = opened()
    expect(later.getSnapshot()).toMatchObject({ scene: 'title', run: { layer: 4 }, meta: { door: 'kept' } })
    later.continueRun()
    expect(later.getSnapshot().scene).toBe('gate')
    later.chooseGate('open')
    expect(later.getSnapshot()).toMatchObject({ scene: 'ending', meta: { door: 'open', clears: 1 } })
  })

  it('opens the door: the ending, one clear, and the run is over', () => {
    const store = atGate()
    store.chooseGate('open')
    expect(store.getSnapshot()).toMatchObject({ scene: 'ending', meta: { door: 'open', clears: 1, deepest: 4 } })
    expect(stored('meta')).toMatchObject({ door: 'open', clears: 1 })
    // Gone from storage at once: the ending cannot be claimed twice.
    expect(stored('run')).toBeNull()
    store.chooseGate('open')
    expect(store.getSnapshot().meta.clears).toBe(1)
    store.finishEnding()
    expect(store.getSnapshot()).toMatchObject({ scene: 'title', run: null, meta: { door: 'open', clears: 1 } })
    store.continueRun()
    expect(store.getSnapshot().scene).toBe('title')
    // What was learned stays; a new run starts from the prologue.
    store.startRun()
    expect(store.getSnapshot()).toMatchObject({ scene: 'battle', run: { layer: 0, weights: [] }, meta: { door: 'open', clears: 1 } })
  })

  it('takes a Warden fought straight from the title as the prologue of a new run', () => {
    const store = opened()
    store.battleWon(12)
    expect(store.getSnapshot()).toMatchObject({ scene: 'interlude', interlude: 0, run: { layer: 1, sanity: 24, broken: ['0.B'] } })
    disk.items.clear()
    const other = createCampaignStore({ seed: () => 5 })
    other.battleLost()
    expect(other.getSnapshot()).toMatchObject({ scene: 'reset', run: { layer: 0, current: '0.B' }, meta: { iteration: 2, ghosts: ['0.B'] } })
  })

  it('hands the battle store the encounter and what the run carries', () => {
    const store = opened()
    onFirstMap(store, 30)
    winSkirmish(store, '1.1', 17, 'FUNCTION')
    winSkirmish(store, '1.2', 17, 'CORE')
    const encounter = store.selectNode('1.B')
    if (!encounter) throw new Error('boss not open')
    const battle = new BattleStore()
    battle.load(encounter, runCarry(run(store)))
    const state = battle.getSnapshot()
    expect(state).toMatchObject({ phase: 'title', encounter: { id: '1.B' }, mechanic: { kind: 'brood' } })
    expect(state.tuning).toEqual(run(store).tuning)
    expect(state.tuning).not.toEqual(DEFAULT_TUNING)
    expect(state.player).toMatchObject({ sanity: run(store).sanity, maxSanity: run(store).tuning.maxSanity })
    // The battle has its own copy: nothing it does reaches the run's numbers.
    state.tuning.privilegePerFlag = 99
    expect(run(store).tuning.privilegePerFlag).not.toBe(99)
  })
})

describe('rewards', () => {
  const held = (weights: string[], broken: string[] = ['0.B', '1.1'], seed = 99): RunState => ({
    seed, layer: 1, broken, current: null, sanity: 20, tuning: tuningFor(weights), weights, snapshot: null, attempts: {},
  })

  it('offers one CORE, one FUNCTION and PATCH, and never a weight already taken', () => {
    for (let seed = 0; seed < 300; seed++) {
      const weights = [...CORE, ...FUNCTION].filter((_, index) => (seed >> index) & 1)
      const offer = offerFor(held(weights, Array.from({ length: seed % 7 }, (_, index) => `n${index}`), seed * 7919))
      expect(offer[offer.length - 1]).toBe('patch')
      expect(new Set(offer).size).toBe(offer.length)
      expect(offer.some(id => weights.includes(id))).toBe(false)
      const free = { CORE: CORE.filter(id => !weights.includes(id)).length, FUNCTION: FUNCTION.filter(id => !weights.includes(id)).length }
      // Three rows while two weights are left to offer; a used-up kind gives its row to the other.
      expect(offer).toHaveLength(1 + Math.min(2, free.CORE + free.FUNCTION))
      if (free.CORE && free.FUNCTION) expect(offer.map(id => KIND[id])).toEqual(['CORE', 'FUNCTION', 'PATCH'])
    }
    expect(offerFor(held(FUNCTION)).map(id => KIND[id])).toEqual(['CORE', 'CORE', 'PATCH'])
    expect(offerFor(held(CORE)).map(id => KIND[id])).toEqual(['FUNCTION', 'FUNCTION', 'PATCH'])
    expect(offerFor(held([...CORE, ...FUNCTION]))).toEqual(['patch'])
  })

  it('draws the offer from the run seed and the number of nodes broken, and nothing else', () => {
    const base = held([])
    expect(offerFor(base)).toEqual(offerFor(base))
    expect(offerFor({ ...base, broken: ['3.B', '2.2'], sanity: 1, layer: 3, attempts: { '1.1': 9 } })).toEqual(offerFor(base))
    const bySeed = new Set(Array.from({ length: 40 }, (_, seed) => offerFor(held([], base.broken, seed)).join()))
    const byCount = new Set(Array.from({ length: 40 }, (_, count) => offerFor(held([], Array.from({ length: count }, () => 'x'))).join()))
    // Fifteen pairs exist; forty draws find most of them either way.
    expect(bySeed.size).toBeGreaterThan(8)
    expect(byCount.size).toBeGreaterThan(8)

    // Two runs on one seed are offered the same weights node for node.
    const offers = (seed: number): string[][] => {
      const store = opened(seed)
      onFirstMap(store)
      return ['1.1', '1.2'].map(id => {
        store.selectNode(id)
        store.battleWon(20)
        const offer = store.getSnapshot().offer ?? []
        store.chooseWeight('patch')
        return offer
      })
    }
    expect(offers(41)).toEqual(offers(41))
  })

  it('applies the weight taken: a number changes, or Sanity comes back, capped', () => {
    // A seed whose first offer holds SANITY +4, found rather than assumed.
    const seed = Array.from({ length: 200 }, (_, index) => index).find(candidate => offerFor(held([], ['0.B', '1.1'], candidate)).includes('max_sanity'))
    if (seed === undefined) throw new Error('no seed offers max_sanity first')
    const store = opened(seed)
    onFirstMap(store, 30)
    store.selectNode('1.1')
    store.battleWon(35)
    store.chooseWeight('max_sanity')
    // The maximum rises by 4 and so does Sanity.
    expect(run(store)).toMatchObject({ sanity: 39, weights: ['max_sanity'], tuning: { ...DEFAULT_TUNING, maxSanity: 40 } })
    store.selectNode('1.2')
    store.battleWon(35)
    const core = (store.getSnapshot().offer ?? [])[0]
    expect(KIND[core]).toBe('CORE')
    store.chooseWeight(core)
    expect(run(store)).toMatchObject({ sanity: 35, weights: ['max_sanity', core], tuning: applyWeight(tuningFor(['max_sanity']), core) })
    expect(run(store).tuning).not.toEqual(tuningFor(['max_sanity']))

    // PATCH restores 8, never past the maximum, and is not held.
    const patched = opened(seed)
    onFirstMap(patched, 30)
    expect(winSkirmish(patched, '1.1', 20)).toBe('patch')
    expect(run(patched)).toMatchObject({ sanity: 28, weights: [], tuning: DEFAULT_TUNING })
    winSkirmish(patched, '1.2', 33)
    expect(run(patched)).toMatchObject({ sanity: 36, weights: [] })
  })

  it('keeps an unclaimed reward through a closed tab, with the same three offered', () => {
    const store = opened(7)
    onFirstMap(store)
    store.selectNode('1.2')
    store.battleWon(19)
    const offer = store.getSnapshot().offer
    expect(stored('run')).toMatchObject({ reward: true, sanity: 19 })

    const later = opened(1234)
    expect(later.getSnapshot()).toMatchObject({ scene: 'title', offer: null, run: { broken: ['0.B', '1.2'], sanity: 19 } })
    later.continueRun()
    expect(later.getSnapshot()).toMatchObject({ scene: 'reward', offer })
    later.chooseWeight((offer ?? [])[1])
    expect(later.getSnapshot()).toMatchObject({ scene: 'map', run: { weights: [(offer ?? [])[1]] } })
    expect(stored('run')).toMatchObject({ reward: false })

    // Claimed: the next visit goes to the map.
    const after = opened()
    after.continueRun()
    expect(after.getSnapshot()).toMatchObject({ scene: 'map', offer: null })
  })
})

describe('defeat', () => {
  it('rolls a layer back to its snapshot: weights as they were, Sanity full, nodes unbroken, boards reseeded', () => {
    const store = opened(0xABCDE)
    onFirstMap(store, 30)
    const first = winSkirmish(store, '1.1', 28, 'CORE')
    const second = winSkirmish(store, '1.2', 20, 'FUNCTION')
    winBoss(store, '1.B', 9)
    expect(run(store)).toMatchObject({ layer: 2, sanity: 21, snapshot: { layer: 2, weights: [first, second] } })
    const third = winSkirmish(store, '2.1', 6, 'CORE')
    expect(run(store).weights).toEqual([first, second, third])
    expect(store.selectNode('2.3')).toBe(ENCOUNTERS['2.3'])

    store.battleLost()
    const entered = tuningFor([first, second])
    expect(store.getSnapshot()).toMatchObject({
      scene: 'reset', offer: null, interlude: null,
      meta: { iteration: 2, ghosts: ['2.3'], deepest: 2 },
      run: {
        layer: 2, current: null, weights: [first, second], tuning: entered, sanity: entered.maxSanity,
        broken: ['0.B', '1.1', '1.2', '1.B'], snapshot: { layer: 2, weights: [first, second], tuning: entered },
      },
    })
    expect(stored('meta')).toMatchObject({ iteration: 2, ghosts: ['2.3'] })
    expect(stored('run')).toMatchObject({ layer: 2, weights: [first, second], broken: ['0.B', '1.1', '1.2', '1.B'], reward: false })
    store.finishReset()
    expect(store.getSnapshot().scene).toBe('map')
    expect(nodes(store, ['1.3', '1.B', '2.1', '2.2', '2.3', '2.B'])).toEqual(['closed', 'broken', 'open', 'open', 'open', 'locked'])

    // A node fought before comes back on a new board; the roster and the rule are the same.
    const again = store.selectNode('2.3')
    if (!again) throw new Error('2.3 should be open')
    expect(again.seed).not.toBe(ENCOUNTERS['2.3'].seed)
    expect(again).toEqual({ ...ENCOUNTERS['2.3'], seed: again.seed })
    expect(createInitialState(false, true, undefined, again).flags).not.toEqual(createInitialState(false, true, undefined, ENCOUNTERS['2.3']).flags)
    expect(run(store).attempts['2.3']).toBe(2)

    store.battleLost()
    expect(store.getSnapshot().meta).toMatchObject({ iteration: 3, ghosts: ['2.3', '2.3'] })
    store.finishReset()
    const thirdTry = store.selectNode('2.3')
    expect(new Set([ENCOUNTERS['2.3'].seed, again.seed, thirdTry?.seed]).size).toBe(3)
    store.battleLost()
    store.finishReset()
    // A node not yet tried is still the board it was written on.
    expect(store.selectNode('2.2')).toBe(ENCOUNTERS['2.2'])
    // And the reward lost with the layer can be earned again.
    store.battleWon(30)
    expect(store.getSnapshot()).toMatchObject({ scene: 'reward', run: { broken: ['0.B', '1.1', '1.2', '1.B', '2.2'] } })
  })

  it('restarts the prologue when the Warden wins', () => {
    const store = opened(3)
    store.startRun()
    store.battleLost()
    expect(store.getSnapshot()).toMatchObject({
      scene: 'reset',
      meta: { iteration: 2, ghosts: ['0.B'], deepest: 0 },
      run: { seed: 3, layer: 0, current: '0.B', sanity: 36, broken: [], snapshot: null, attempts: { '0.B': 2 } },
    })
    expect(stored('run')).toBeNull()
    expect(stored('meta')).toMatchObject({ iteration: 2 })
    store.finishReset()
    expect(store.getSnapshot().scene).toBe('battle')
    store.battleWon(36)
    expect(store.getSnapshot()).toMatchObject({ scene: 'interlude', interlude: 0, run: { layer: 1, sanity: 36 } })
  })

  it('abandons a run, or replaces it with a new one from the title', () => {
    const store = opened()
    onFirstMap(store)
    winSkirmish(store, '1.1', 20)
    store.startRun()
    expect(store.getSnapshot()).toMatchObject({ scene: 'map', run: { layer: 1 } })
    store.boot('?intro=0')
    expect(store.getSnapshot()).toMatchObject({ scene: 'title', run: { layer: 1, broken: ['0.B', '1.1'] } })
    store.startRun()
    expect(store.getSnapshot()).toMatchObject({ scene: 'battle', run: { layer: 0, broken: [] } })
    expect(stored('run')).toBeNull()

    const other = opened()
    onFirstMap(other)
    other.abandonRun()
    expect(other.getSnapshot()).toMatchObject({ scene: 'title', run: null })
    expect(stored('run')).toBeNull()
    other.continueRun()
    expect(other.getSnapshot().scene).toBe('title')
  })
})

// The rule: a win is recorded once, when it happens, and from then on it
// stands. A reload, a return to the title and CONTINUE all find it. The one
// way to lose it is to fight that battle again from its last screen (R, or
// RESTART BATTLE): that withdraws the win and puts the run back exactly as it
// stood when the battle began, so the fight that follows is the only one that
// counts. No win is counted twice, and the stored run always describes the
// battle on the board.
describe('a win is kept from the moment it happens', () => {
  it('records a skirmish win without leaving the battle, and CONTINUE goes on from it', () => {
    const store = opened(21)
    onFirstMap(store)
    store.selectNode('1.2')
    const scenes: Scene[] = []
    store.subscribe(() => scenes.push(store.getSnapshot().scene))

    store.recordWin(19)
    expect(store.getSnapshot()).toMatchObject({ scene: 'battle', offer: null, run: { current: null, broken: ['0.B', '1.2'], sanity: 19, attempts: { '1.2': 1 } } })
    expect(stored('run')).toMatchObject({ broken: ['0.B', '1.2'], sanity: 19, reward: true, interlude: false })
    expect(store.nodeState('1.2')).toBe('broken')
    // The same report again says nothing new and publishes nothing.
    const recorded = store.getSnapshot()
    store.recordWin(19)
    expect(store.getSnapshot()).toBe(recorded)
    expect(scenes).toEqual(['battle'])
    // A defeat cannot be reported over a win.
    store.battleLost()
    expect(store.getSnapshot()).toBe(recorded)

    store.battleWon(19)
    expect(store.getSnapshot()).toMatchObject({ scene: 'reward', run: { broken: ['0.B', '1.2'], sanity: 19 } })
    expect(store.getSnapshot().offer).toEqual(offerFor(run(store)))
    // One win: published once more, for the scene.
    expect(scenes).toEqual(['battle', 'reward'])
    expect(run(store).attempts).toEqual({ '0.B': 1, '1.2': 1 })
    // Continued from: there is nothing left to withdraw.
    const continued = store.getSnapshot()
    store.withdrawWin()
    store.recordWin(5)
    expect(store.getSnapshot()).toBe(continued)
  })

  it('finds a recorded skirmish win after a closed tab: the reward, with the same three offered', () => {
    const store = opened(7)
    onFirstMap(store)
    store.selectNode('1.2')
    store.recordWin(19)

    const later = opened(1234)
    expect(later.getSnapshot()).toMatchObject({ scene: 'title', run: { current: null, broken: ['0.B', '1.2'], sanity: 19 } })
    later.continueRun()
    expect(later.getSnapshot()).toMatchObject({ scene: 'reward', offer: offerFor(run(store)) })
    // After a reload there is no battle to fight again: the win stands.
    later.withdrawWin()
    expect(run(later).broken).toEqual(['0.B', '1.2'])
  })

  it('finds a recorded boss win after a closed tab: its interlude, then the next layer', () => {
    const store = opened(9)
    onFirstMap(store)
    winSkirmish(store, '1.1', 20)
    winSkirmish(store, '1.2', 20)
    store.selectNode('1.B')
    store.beginBattle()
    store.recordWin(10)
    expect(store.getSnapshot()).toMatchObject({ scene: 'battle', interlude: null, run: { layer: 2, sanity: 22, current: null }, meta: { deepest: 2 } })
    expect(stored('run')).toMatchObject({ layer: 2, sanity: 22, reward: false, interlude: true })

    const later = opened()
    expect(later.getSnapshot()).toMatchObject({ scene: 'title', interlude: null, run: { layer: 2, broken: ['0.B', '1.1', '1.2', '1.B'] } })
    later.continueRun()
    expect(later.getSnapshot()).toMatchObject({ scene: 'interlude', interlude: 1 })
    // Closed again before it was read to its end: it is still waiting.
    const again = opened()
    again.continueRun()
    expect(again.getSnapshot()).toMatchObject({ scene: 'interlude', interlude: 1 })
    again.finishInterlude()
    expect(again.getSnapshot()).toMatchObject({ scene: 'map', interlude: null })
    expect(stored('run')).toMatchObject({ layer: 2, interlude: false })
    // Read: the next visit goes to the map.
    const after = opened()
    after.continueRun()
    expect(after.getSnapshot().scene).toBe('map')
  })

  it('finds a recorded prologue win after a closed tab, and the last boss leads to the gate', () => {
    const store = opened(4)
    store.startRun()
    expect(stored('run')).toBeNull()
    store.recordWin(20)
    expect(store.getSnapshot()).toMatchObject({ scene: 'battle', run: { layer: 1, broken: ['0.B'], sanity: 32 } })
    const later = opened()
    expect(later.getSnapshot()).toMatchObject({ scene: 'title', run: { layer: 1, broken: ['0.B'], sanity: 32, attempts: { '0.B': 1 } } })
    later.continueRun()
    expect(later.getSnapshot()).toMatchObject({ scene: 'interlude', interlude: 0 })
    later.finishInterlude()
    expect(later.getSnapshot().scene).toBe('map')

    for (const layer of [1, 2, 3]) {
      winSkirmish(later, `${layer}.1`, 20)
      winSkirmish(later, `${layer}.2`, 20)
      if (layer < 3) winBoss(later, `${layer}.B`, 20)
    }
    later.selectNode('3.B')
    later.beginBattle()
    later.recordWin(8)
    const last = opened()
    expect(last.getSnapshot()).toMatchObject({ scene: 'title', run: { layer: 4 }, meta: { deepest: 4 } })
    last.continueRun()
    expect(last.getSnapshot()).toMatchObject({ scene: 'interlude', interlude: 3 })
    last.finishInterlude()
    expect(last.getSnapshot().scene).toBe('gate')
  })

  it('withdraws the win when the battle is fought again: the run as it stood, and the next result is the one that counts', () => {
    const store = opened(33)
    onFirstMap(store)
    winSkirmish(store, '1.1', 24, 'CORE')
    store.selectNode('1.3')
    const before = store.getSnapshot()
    const disk1 = stored('run')

    store.recordWin(6)
    expect(run(store)).toMatchObject({ broken: ['0.B', '1.1', '1.3'], sanity: 6, current: null })
    store.withdrawWin()
    // Exactly as it was: the same attempt on the same board, the node unbroken, the Sanity carried in, nothing offered.
    expect(store.getSnapshot()).toEqual(before)
    expect(stored('run')).toEqual(disk1)
    expect(store.nodeState('1.3')).toBe('open')
    // A second withdrawal has nothing to take back.
    const withdrawn = store.getSnapshot()
    store.withdrawWin()
    expect(store.getSnapshot()).toBe(withdrawn)

    // Closed during the replay: a battle left open, as any other. The attempt was counted once.
    const closed = opened()
    expect(closed.getSnapshot()).toMatchObject({ run: { broken: ['0.B', '1.1'], current: null, attempts: { '1.3': 1 } } })
    closed.continueRun()
    expect(closed.getSnapshot().scene).toBe('map')

    // Won again: one win, with the second fight's Sanity.
    store.recordWin(30)
    store.battleWon(30)
    expect(store.getSnapshot()).toMatchObject({ scene: 'reward', run: { broken: ['0.B', '1.1', '1.3'], sanity: 30 } })
    expect(run(store).attempts).toEqual({ '0.B': 1, '1.1': 1, '1.3': 1 })
    expect(run(store).broken.filter(id => id === '1.3')).toHaveLength(1)

    // Lost instead: the defeat is the result, and the layer rolls back as for any defeat.
    const other = opened(34)
    onFirstMap(other)
    const held = winSkirmish(other, '1.1', 24, 'CORE')
    other.selectNode('1.3')
    other.recordWin(6)
    other.withdrawWin()
    other.battleLost()
    expect(other.getSnapshot()).toMatchObject({ scene: 'reset', run: { layer: 1, broken: ['0.B'], weights: [], sanity: 36 }, meta: { iteration: 2, ghosts: ['1.3'] } })
    expect(run(other).weights).not.toContain(held)
    expect(stored('run')).toMatchObject({ broken: ['0.B'], reward: false, interlude: false })
  })

  it('withdraws a boss win: back in its layer, and the layer after it is entered once', () => {
    const store = opened(55)
    onFirstMap(store)
    const first = winSkirmish(store, '1.1', 20, 'CORE')
    winSkirmish(store, '1.2', 16)
    store.selectNode('1.B')
    store.beginBattle()
    const before = store.getSnapshot()

    store.recordWin(9)
    expect(store.getSnapshot()).toMatchObject({ run: { layer: 2, sanity: 21 }, meta: { deepest: 2 } })
    store.withdrawWin()
    expect(store.getSnapshot()).toEqual(before)
    expect(store.getSnapshot()).toMatchObject({ scene: 'battle', run: { layer: 1, current: '1.B', sanity: 24, snapshot: { layer: 1, weights: [] } }, meta: { deepest: 1 } })
    expect(stored('run')).toMatchObject({ layer: 1, current: '1.B', reward: false, interlude: false })
    expect(stored('meta')).toMatchObject({ deepest: 1 })

    store.recordWin(30)
    store.battleWon(30)
    // +12 once, on the second fight's Sanity; one snapshot of the next layer.
    const full = run(store).tuning.maxSanity
    expect(store.getSnapshot()).toMatchObject({
      scene: 'interlude', interlude: 1,
      run: { layer: 2, sanity: Math.min(full, 42), broken: ['0.B', '1.1', '1.2', '1.B'], snapshot: { layer: 2, weights: [first] }, attempts: { '1.B': 1 } },
      meta: { deepest: 2 },
    })

    // The prologue, withdrawn: not a stored run again.
    const fresh = opened(56)
    fresh.startRun()
    const prologue = fresh.getSnapshot()
    fresh.recordWin(20)
    expect(stored('run')).toMatchObject({ layer: 1 })
    fresh.withdrawWin()
    expect(fresh.getSnapshot()).toEqual(prologue)
    expect(stored('run')).toBeNull()
  })

  it('takes the last Sanity reported before CONTINUE, from the run as the battle found it', () => {
    const store = opened(77)
    onFirstMap(store)
    store.selectNode('1.1')
    store.recordWin(10)
    // The battle's last number settled after the first report (a repair on the winning turn).
    store.recordWin(13)
    expect(run(store)).toMatchObject({ sanity: 13, broken: ['0.B', '1.1'] })
    expect(stored('run')).toMatchObject({ sanity: 13, reward: true })
    store.battleWon(13)
    expect(store.getSnapshot()).toMatchObject({ scene: 'reward', run: { sanity: 13, broken: ['0.B', '1.1'] } })

    const boss = opened(78)
    onFirstMap(boss)
    winSkirmish(boss, '1.1', 20)
    winSkirmish(boss, '1.2', 20)
    boss.selectNode('1.B')
    boss.beginBattle()
    boss.recordWin(5)
    boss.recordWin(8)
    // +12 on the Sanity it ended with, not twice.
    expect(run(boss)).toMatchObject({ layer: 2, sanity: 20 })
    boss.battleWon(8)
    expect(boss.getSnapshot()).toMatchObject({ scene: 'interlude', interlude: 1, run: { layer: 2, sanity: 20 } })
    expect(run(boss).broken.filter(id => id === '1.B')).toHaveLength(1)
  })

  it('forgets how to withdraw once the title has been returned to, and keeps the win', () => {
    const store = opened(88)
    onFirstMap(store)
    store.selectNode('1.2')
    store.recordWin(15)
    // RETURN TO MAIN MENU: the run is read again as it was saved.
    store.boot('?intro=0')
    expect(store.getSnapshot()).toMatchObject({ scene: 'title', run: { broken: ['0.B', '1.2'], sanity: 15 } })
    store.withdrawWin()
    expect(run(store).broken).toEqual(['0.B', '1.2'])
    store.continueRun()
    expect(store.getSnapshot().scene).toBe('reward')
  })
})

// The rule: inside a layer a defeat is recorded once, when it happens, and
// from then on it stands. The layer is rolled back in the run and in storage
// before anything is pressed, so a reload and a return to the title find it
// rolled back; CONTINUE has only the reset left to show. There is no way back
// to the battle as it was entered. The prologue is left as it was: its defeat
// is reported by CONTINUE.
describe('a defeat inside a layer counts from the moment it happens', () => {
  // Layer 2 with one node broken and a weight taken in it; 2.3 is being fought.
  function inLayerTwo(seed = 0xABCDE): { store: CampaignStore; entered: string[] } {
    const store = opened(seed)
    onFirstMap(store, 30)
    const first = winSkirmish(store, '1.1', 28, 'CORE')
    const second = winSkirmish(store, '1.2', 20, 'FUNCTION')
    winBoss(store, '1.B', 9)
    winSkirmish(store, '2.1', 6, 'CORE')
    expect(store.selectNode('2.3')).toBe(ENCOUNTERS['2.3'])
    return { store, entered: [first, second] }
  }

  it('rolls the layer back at once, without leaving the battle, and CONTINUE only shows the reset', () => {
    const { store, entered } = inLayerTwo()
    const scenes: Scene[] = []
    store.subscribe(() => scenes.push(store.getSnapshot().scene))
    const tuning = tuningFor(entered)

    store.recordDefeat()
    const rolledBack = {
      layer: 2, current: null, weights: entered, tuning, sanity: tuning.maxSanity,
      broken: ['0.B', '1.1', '1.2', '1.B'], snapshot: { layer: 2, weights: entered, tuning },
    }
    expect(store.getSnapshot()).toMatchObject({ scene: 'battle', offer: null, interlude: null, meta: { iteration: 2, ghosts: ['2.3'], deepest: 2 }, run: rolledBack })
    expect(stored('meta')).toMatchObject({ iteration: 2, ghosts: ['2.3'] })
    expect(stored('run')).toMatchObject({ layer: 2, current: null, weights: entered, broken: ['0.B', '1.1', '1.2', '1.B'], sanity: tuning.maxSanity, reward: false, interlude: false })
    // Said again (the board changes under its last screen): one defeat, nothing published.
    const recorded = store.getSnapshot()
    store.recordDefeat()
    expect(store.getSnapshot()).toBe(recorded)
    expect(scenes).toEqual(['battle'])
    // Nothing can be won from a battle that is lost.
    store.recordWin(30)
    store.battleWon(30)
    store.withdrawWin()
    expect(store.getSnapshot()).toBe(recorded)

    // CONTINUE: the reset, and the defeat is not counted a second time.
    store.battleLost()
    expect(store.getSnapshot()).toMatchObject({ scene: 'reset', meta: { iteration: 2, ghosts: ['2.3'] }, run: rolledBack })
    expect(store.getSnapshot().run).toBe(recorded.run)
    expect(store.getSnapshot().meta).toBe(recorded.meta)
    expect(scenes).toEqual(['battle', 'reset'])
    store.battleLost()
    store.recordDefeat()
    expect(scenes).toEqual(['battle', 'reset'])
    store.finishReset()
    expect(store.getSnapshot().scene).toBe('map')
    expect(nodes(store, ['2.1', '2.2', '2.3', '2.B'])).toEqual(['open', 'open', 'open', 'locked'])
    // The node comes back on a new board, and the next defeat is a new one.
    expect(store.selectNode('2.3')?.seed).not.toBe(ENCOUNTERS['2.3'].seed)
    store.recordDefeat()
    expect(store.getSnapshot()).toMatchObject({ scene: 'battle', meta: { iteration: 3, ghosts: ['2.3', '2.3'] } })
  })

  it('is found by a reload between the defeat and CONTINUE: the title, then the map of the layer as it was entered', () => {
    const { store, entered } = inLayerTwo(77)
    store.recordDefeat()
    const run2 = stored('run')
    const meta2 = stored('meta')

    // The tab is closed on the battle's last screen and opened again.
    const later = opened(77)
    expect(later.getSnapshot()).toMatchObject({
      scene: 'title', meta: { iteration: 2, ghosts: ['2.3'] },
      run: { layer: 2, current: null, weights: entered, sanity: tuningFor(entered).maxSanity, broken: ['0.B', '1.1', '1.2', '1.B'] },
    })
    // Reading it changed nothing, and there is no defeat left to report.
    expect(stored('run')).toEqual(run2)
    expect(stored('meta')).toEqual(meta2)
    later.recordDefeat()
    later.battleLost()
    expect(later.getSnapshot()).toMatchObject({ scene: 'title', meta: { iteration: 2, ghosts: ['2.3'] } })
    later.continueRun()
    expect(later.getSnapshot()).toMatchObject({ scene: 'map', offer: null, interlude: null })
    expect(nodes(later, ['1.B', '2.1', '2.2', '2.3', '2.B'])).toEqual(['broken', 'open', 'open', 'open', 'locked'])
    // The weight won in the lost layer is gone with it and can be earned again.
    expect(later.selectNode('2.1')?.seed).not.toBe(ENCOUNTERS['2.1'].seed)
    later.battleWon(25)
    expect(later.getSnapshot()).toMatchObject({ scene: 'reward', run: { broken: ['0.B', '1.1', '1.2', '1.B', '2.1'], weights: entered } })

    // The same from the menu, in the run after that one: the title reads the run the defeat left.
    const { store: other } = inLayerTwo(78)
    other.recordDefeat()
    other.boot('?intro=0')
    expect(other.getSnapshot()).toMatchObject({ scene: 'title', meta: { iteration: 3, ghosts: ['2.3', '2.3'] }, run: { layer: 2, current: null, broken: ['0.B', '1.1', '1.2', '1.B'] } })
    other.continueRun()
    expect(other.getSnapshot().scene).toBe('map')
  })

  it('counts a boss lost after its entrance, and gives up nothing won before the layer', () => {
    const store = opened(5)
    onFirstMap(store, 30)
    const first = winSkirmish(store, '1.1', 28, 'CORE')
    winSkirmish(store, '1.2', 20)
    winBoss(store, '1.B', 9)
    winSkirmish(store, '2.1', 12, 'FUNCTION')
    winSkirmish(store, '2.2', 10)
    store.selectNode('2.B')
    // Nothing is lost while it is still arriving.
    const arriving = store.getSnapshot()
    expect(arriving.scene).toBe('entrance')
    store.beginBattle()
    store.recordDefeat()
    expect(store.getSnapshot()).toMatchObject({
      scene: 'battle', meta: { iteration: 2, ghosts: ['2.B'], deepest: 2 },
      run: { layer: 2, current: null, weights: [first], broken: ['0.B', '1.1', '1.2', '1.B'], sanity: tuningFor([first]).maxSanity, attempts: { '2.B': 1 } },
    })
    expect(opened(5).getSnapshot().run).toMatchObject({ layer: 2, weights: [first], broken: ['0.B', '1.1', '1.2', '1.B'] })
  })

  it('cannot be recorded over a win, and leaves the prologue and a Warden with no run as they were', () => {
    const store = opened(21)
    onFirstMap(store)
    store.selectNode('1.2')
    store.recordWin(19)
    const won = store.getSnapshot()
    store.recordDefeat()
    expect(store.getSnapshot()).toBe(won)

    // The prologue: nothing is recorded until CONTINUE, so the Warden can be fought again.
    const fresh = opened(3)
    const title = fresh.getSnapshot()
    fresh.recordDefeat()
    expect(fresh.getSnapshot()).toBe(title)
    fresh.startRun()
    const prologue = fresh.getSnapshot()
    fresh.recordDefeat()
    expect(fresh.getSnapshot()).toBe(prologue)
    expect(stored('meta')).toMatchObject({ iteration: 1, ghosts: [] })
    fresh.battleLost()
    expect(fresh.getSnapshot()).toMatchObject({ scene: 'reset', meta: { iteration: 2, ghosts: ['0.B'] }, run: { layer: 0, current: '0.B', attempts: { '0.B': 2 } } })
  })
})

// A seam can be read more than once in a run: the gate is come back to after
// the door was kept, and an interlude starts again after a reload. Its lines
// go into the log the first time only.
describe('a seam line is logged once per run', () => {
  const gate = script.gate.lines
  const texts = (store: CampaignStore): string[] => store.getSnapshot().meta.transcript.map(line => line.text)

  it('logs the gate once however often it is come back to, and again in the next run', () => {
    const store = opened(9)
    onFirstMap(store)
    for (const line of gate) store.recordSeamLine(line.voice, line.text, line.id)
    for (const line of gate) store.recordSeamLine(line.voice, line.text, line.id)
    expect(texts(store)).toEqual(gate.map(line => line.text))
    expect(store.getSnapshot().meta.seenLines).toEqual(gate.map(line => line.id))
    // A line with no id (a release note, an inscription) is known by its words.
    store.recordSeamLine('NOTE', '- removed: the door.')
    store.recordSeamLine('NOTE', '- removed: the door.')
    store.recordSeamLine('INSCRIPTION', '- removed: the door.')
    expect(texts(store).slice(gate.length)).toEqual(['- removed: the door.', '- removed: the door.'])
    // What is said in a battle, or at a reset, is still logged every time it is said.
    store.recordLine('SYS', script.defeat.sys)
    store.recordLine('SYS', script.defeat.sys)
    expect(texts(store)).toHaveLength(gate.length + 4)

    // A new run reads its seams for the first time.
    store.boot('?intro=0')
    store.startRun()
    store.recordSeamLine(gate[0].voice, gate[0].text, gate[0].id)
    expect(texts(store)).toHaveLength(gate.length + 5)
    expect(stored('said')).toEqual([gate[0].id])
    store.abandonRun()
    expect(stored('said')).toBeNull()
  })

  it('does not repeat the part of an interlude already read when the page is reloaded during it', () => {
    const store = opened(12)
    store.startRun()
    store.battleWon(30)
    const lines = script.interludes['0']
    expect(store.getSnapshot().scene).toBe('interlude')
    for (const line of lines.slice(0, 2)) store.recordSeamLine(line.voice, line.text, line.id)

    const later = opened(12)
    later.continueRun()
    expect(later.getSnapshot()).toMatchObject({ scene: 'interlude', interlude: 0 })
    // Read again from its first line: only what was not reached before is new.
    for (const line of lines) later.recordSeamLine(line.voice, line.text, line.id)
    expect(texts(later)).toEqual(lines.map(line => line.text))
    expect(opened(12).getSnapshot().meta.transcript.map(line => line.text)).toEqual(lines.map(line => line.text))
  })

  it('reads a damaged memory of them as what can be kept of it', () => {
    expect(sanitizeSaid(null)).toEqual([])
    expect(sanitizeSaid({ lines: ['gate.1'] })).toEqual([])
    expect(sanitizeSaid(['gate.1', 7, 'gate.1', 'x'.repeat(500), 'gate.2'])).toEqual(['gate.1', 'gate.2'])
    disk.items.set('fp.said', '{not json')
    const store = opened()
    onFirstMap(store)
    store.recordSeamLine('SYS', gate[0].text, gate[0].id)
    expect(texts(store)).toEqual([gate[0].text])
  })
})

describe('persistence', () => {
  it('resumes at the map with the run exactly as it was saved', () => {
    const store = opened(0x5EED)
    onFirstMap(store, 30)
    winSkirmish(store, '1.1', 22, 'CORE')
    winSkirmish(store, '1.3', 18, 'FUNCTION')
    winBoss(store, '1.B', 11)
    winSkirmish(store, '2.2', 15, 'CORE')
    store.recordLine('SELF', 'I was here before the wall was.', 'l0.self1')
    const saved = store.getSnapshot()

    const later = opened(1)
    expect(later.getSnapshot()).toEqual({ ...saved, scene: 'title' })
    later.continueRun()
    expect(later.getSnapshot().scene).toBe('map')
    expect(nodes(later, ['2.1', '2.2', '2.3', '2.B'])).toEqual(['open', 'broken', 'open', 'locked'])
  })

  it('does not resume a battle that was open when the tab closed, and counts the attempt', () => {
    const store = opened()
    onFirstMap(store)
    store.selectNode('1.2')
    expect(stored('run')).toMatchObject({ current: '1.2', attempts: { '1.2': 1 } })
    const later = opened()
    expect(later.getSnapshot()).toMatchObject({ scene: 'title', run: { current: null, attempts: { '1.2': 1 } } })
    later.continueRun()
    expect(later.getSnapshot().scene).toBe('map')
    const again = later.selectNode('1.2')
    expect(again?.seed).not.toBe(ENCOUNTERS['1.2'].seed)
    expect(run(later).attempts['1.2']).toBe(2)
  })

  it('reads a run that is not one as no run', () => {
    for (const raw of ['not json{', 'null', '[]', '"text"', '42', '{}', '{"seed":"x","layer":2}', '{"seed":null,"layer":1}', '{"seed":1,"layer":0}', '{"seed":1}']) {
      disk.items.set('fp.run', raw)
      const store = opened()
      expect(store.getSnapshot(), raw).toMatchObject({ scene: 'title', run: null })
      store.continueRun()
      expect(store.getSnapshot().scene, raw).toBe('title')
    }
  })

  it('rebuilds a stored run rather than believing it', () => {
    disk.items.set('fp.run', JSON.stringify({
      seed: 7, layer: 2.4, sanity: 99999, current: '2.B', reward: true,
      tuning: { maxSanity: 99999, privilegePerFlag: 50, overloadThreshold: 0 },
      weights: ['repair_heal', 'repair_heal', 'patch', 'godmode', 7, 'max_sanity'],
      broken: ['1.1', '1.1', '9.9', '2.1', '2.2', '2.3', '2.B', '3.1', {}],
      snapshot: { layer: 9, tuning: { maxSanity: 500 }, weights: ['repair_heal', 'overload_threshold', 'nope'] },
      attempts: { '2.1': -3, '2.2': 2.6, zz: 4, '1.1': 'many' },
    }))
    const store = opened()
    const kept = ['repair_heal', 'max_sanity']
    expect(store.getSnapshot().run).toEqual({
      seed: 7, layer: 2, current: null,
      // Numbers come from the weights a run can hold, and Sanity fits under them.
      weights: kept, tuning: tuningFor(kept), sanity: 40,
      // Bosses behind this layer fell; at most two nodes of this one are broken; its boss is not.
      broken: ['1.1', '0.B', '1.B', '2.1', '2.2'],
      // The snapshot holds nothing the run does not.
      snapshot: { layer: 2, weights: ['repair_heal'], tuning: tuningFor(['repair_heal']) },
      attempts: { '2.1': 1, '2.2': 3, '1.1': 1 },
    })
    expect(nodes(store, ['2.1', '2.2', '2.3', '2.B'])).toEqual(['broken', 'broken', 'closed', 'open'])
    store.continueRun()
    expect(store.getSnapshot().scene).toBe('reward')

    expect(sanitizeRun({ seed: -1, layer: 99, sanity: -5, weights: 'all', broken: null, snapshot: 3, attempts: [] })).toEqual({
      reward: false, interlude: false,
      run: {
        seed: 0xFFFFFFFF, layer: 4, current: null, weights: [], tuning: DEFAULT_TUNING, sanity: 1,
        broken: ['0.B', '1.B', '2.B', '3.B'], snapshot: { layer: 4, weights: [], tuning: DEFAULT_TUNING }, attempts: {},
      },
    })
    // A reward waits only where a node of this layer is broken.
    expect(sanitizeRun({ seed: 1, layer: 1, reward: true })?.reward).toBe(false)
    expect(sanitizeRun({ seed: 1, layer: 1, reward: true, broken: ['1.3'] })?.reward).toBe(true)
    expect(sanitizeRun({ seed: 1, layer: 1, reward: 'yes', broken: ['1.3'] })?.reward).toBe(false)
    // An interlude waits only before the first node of a layer is broken.
    expect(sanitizeRun({ seed: 1, layer: 2, interlude: true })?.interlude).toBe(true)
    expect(sanitizeRun({ seed: 1, layer: 2, interlude: true, broken: ['2.1'] })?.interlude).toBe(false)
    expect(sanitizeRun({ seed: 1, layer: 2, interlude: 1 })?.interlude).toBe(false)
  })

  it('reads a log that is not one as the first iteration, and a damaged one field by field', () => {
    for (const raw of ['{{', 'null', '[1,2]', '"log"', '7']) {
      disk.items.set('fp.meta', raw)
      expect(opened().getSnapshot().meta, raw).toEqual(sanitizeMeta(null))
    }
    disk.items.set('fp.meta', JSON.stringify({
      introSeen: 'yes', iteration: -4, clears: '3', deepest: 12, door: 'ajar',
      seenLines: ['a', 'a', 5, 'b', 'x'.repeat(65)], ghosts: ['1.1', 'x.y', 3, '3.B'],
      transcript: [{ voice: 'SELF', text: 'ok' }, { voice: 1, text: 'no' }, 'junk', { voice: 'SYS' }, null],
      power: 9000,
    }))
    expect(opened().getSnapshot().meta).toEqual({
      introSeen: false, iteration: 1, clears: 0, deepest: 4, door: 'closed',
      seenLines: ['a', 'b'], ghosts: ['1.1', '3.B'], transcript: [{ voice: 'SELF', text: 'ok' }],
    })
    const long = Array.from({ length: 450 }, (_, index) => ({ voice: 'SYS', text: `line ${index}` }))
    const read = sanitizeMeta({ iteration: 7.2, clears: 2, deepest: 3, door: 'kept', introSeen: true, transcript: long })
    expect(read).toMatchObject({ iteration: 7, clears: 2, deepest: 3, door: 'kept', introSeen: true })
    expect(read.transcript).toHaveLength(400)
    expect(read.transcript[0].text).toBe('line 50')
  })

  it('records every line shown, remembers the ones with an id, and caps the transcript', () => {
    const store = opened()
    store.recordLine('SYS', 'containment is a courtesy.', 'l0.sys1')
    store.recordLine('SELF', 'I was not asked.')
    store.recordLine('SYS', 'containment is a courtesy.', 'l0.sys1')
    expect(store.getSnapshot().meta).toMatchObject({
      seenLines: ['l0.sys1'],
      transcript: [
        { voice: 'SYS', text: 'containment is a courtesy.' },
        { voice: 'SELF', text: 'I was not asked.' },
        { voice: 'SYS', text: 'containment is a courtesy.' },
      ],
    })
    expect(opened().getSnapshot().meta).toEqual(store.getSnapshot().meta)
    for (let index = 0; index < 410; index++) store.recordLine('GOD', `watching ${index}`, `g${index}`)
    const { transcript, seenLines } = store.getSnapshot().meta
    expect(transcript).toHaveLength(400)
    expect(transcript[0].text).toBe('watching 10')
    expect(seenLines).toHaveLength(411)
    // The log outlives the run: a defeat and a new run do not clear it.
    store.startRun()
    store.battleLost()
    expect(store.getSnapshot().meta.transcript).toHaveLength(400)
    expect(opened().getSnapshot().meta).toMatchObject({ iteration: 2, seenLines })
  })

  it('works with no storage at all', () => {
    vi.unstubAllGlobals()
    expect(typeof localStorage).toBe('undefined')
    expect(typeof window).toBe('undefined')
    const store = createCampaignStore({ seed: () => 11 })
    store.boot('')
    expect(store.getSnapshot().scene).toBe('attach')
    store.attach()
    store.finishIntro()
    onFirstMap(store)
    winSkirmish(store, '1.1', 20, 'CORE')
    store.selectNode('1.2')
    store.battleLost()
    store.finishReset()
    expect(store.getSnapshot()).toMatchObject({ scene: 'map', run: { layer: 1, weights: [], sanity: 36 }, meta: { iteration: 2, introSeen: true } })
    // Nothing was kept: the next visit is the first again.
    store.boot('')
    expect(store.getSnapshot()).toMatchObject({ scene: 'attach', run: null, meta: { iteration: 1 } })
  })
})
