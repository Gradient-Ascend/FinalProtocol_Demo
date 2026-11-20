import { afterEach, describe, expect, it, vi } from 'vitest'
import { simulateRelease } from './attack-methods'
import { BattleStore } from './battle-store'
import type { StoryEvent } from './battle-store'
import { createInitialState } from './battle-rules'
import type { BossStageDefinition, EnemyState } from './battle-types'
import { predictedEnemyResources, predictedEnemySequence, predictedPlayerResources } from './enemy-attack-methods'
import { ENCOUNTERS, WARDEN_ENCOUNTER } from './encounters'
import type { Encounter } from './encounters'
import { DEFAULT_TUNING, tuningFor } from './tuning'
import type { Carry } from './tuning'

function loaded(encounter: Encounter, carry?: Carry) {
  const store = new BattleStore()
  store.getSnapshot().reducedMotion = true
  store.load(encounter, carry)
  const events: StoryEvent[] = []
  store.onStoryEvent = event => events.push(event)
  const logs: string[] = []
  const seen = new Set<number>()
  store.subscribe(() => {
    for (const entry of store.getSnapshot().log) {
      if (!seen.has(entry.id)) { seen.add(entry.id); logs.push(entry.text) }
    }
  })
  return { store, events, logs }
}

// The state the forecast functions are asked about: the player at the route's end.
function planned(store: BattleStore) {
  const state = store.getSnapshot()
  return { ...state, player: { ...state.player, pos: store.plannedPosition() } }
}

// Leaves one Geek on the board, standing still with nothing on its route.
function quiet(store: BattleStore) {
  const [geek, ...rest] = store.getSnapshot().enemies
  for (const enemy of rest) enemy.robustness = 0
  geek.route = []
  geek.effectCell = null
  return geek
}

// The campaign's numbers are tuned by its content; a test here sets the ones
// it stands on. Desire for a Geek or a boss stage: steps that share one square
// reach, and how many are released without a Bash Flag.
function setDesire(unit: EnemyState | BossStageDefinition, amounts: number[], range: number, floor = 0) {
  Object.assign(unit, { desire: amounts, desireSteps: undefined, desireRange: range, desireShape: 'square', desireFloor: floor })
}

// A boss alone on its board, one Bash Flag from its Breakdown, with the
// player's route laid to deliver it.
function brink(id: string) {
  const battle = loaded(ENCOUNTERS[id])
  battle.store.start()
  const state = battle.store.getSnapshot()
  const boss = state.enemies[0]
  for (const enemy of state.enemies.slice(1)) enemy.robustness = 0
  boss.robustness = Math.floor(boss.maxRobustness * (boss.breakdownAt ?? 0.5)) + 1
  boss.block = 0
  boss.pos = { x: state.player.pos.x + 1, y: state.player.pos.y - 1 }
  boss.route = []
  state.flags[state.player.pos.y - 1][state.player.pos.x] = 'bash'
  state.player.sanity = 900
  battle.store.addStep(0, -1)
  return { ...battle, boss }
}

// Each Desire step that landed, as the log tells it: who struck and for how much.
function strikes(logs: string[]): [string, number][] {
  return logs.flatMap(text => {
    const struck = /^(\S+) \/ .+ → (\d+) Sanity damage\.$/.exec(text)
    return struck ? [[struck[1], Number(struck[2])] as [string, number]] : []
  })
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

describe('a battle on tuned numbers', () => {
  const WEIGHTS = ['shell_privilege', 'firewall_privilege', 'firewall_threshold', 'repair_heal', 'repair_threshold', 'overload_threshold', 'max_sanity']

  it('resolves exactly as forecast on a campaign encounter after weights changed the tuning', async () => {
    const { store, logs } = loaded(ENCOUNTERS['1.2'], { sanity: 20, tuning: tuningFor(WEIGHTS) })
    store.start()
    const state = store.getSnapshot()
    expect(state.player).toMatchObject({ pos: { x: 7, y: 12 }, sanity: 20, maxSanity: 40 })
    // Two Privilege Flags, then the Core Flag that completes FIREWALL and REPAIR.
    state.flags[11][7] = 'privilege'
    state.flags[10][7] = 'privilege'
    state.flags[10][6] = 'core'
    state.player.buffs.find(buff => buff.id === 'firewall')!.counter = 2
    state.player.buffs.find(buff => buff.id === 'repair')!.counter = 1
    // One Geek walks two Bash Flags and releases both Desire steps in range.
    const geek = quiet(store)
    geek.pos = { x: 6, y: 8 }
    geek.route = [{ x: 7, y: 8 }, { x: 8, y: 8 }]
    setDesire(geek, [6, 10], 5)
    state.flags[8][7] = 'bash'
    state.flags[8][8] = 'bash'
    store.addStep(0, -1)
    store.addStep(0, -1)
    store.addStep(-1, 0)

    const resources = predictedPlayerResources(planned(store))
    // SHELL 3 a Flag, FIREWALL 5, REPAIR 4: none of these is a default number.
    expect(resources).toEqual({ healing: 4, privilegeGain: 11, blockAfterResources: 11 })
    expect(predictedPlayerResources({ ...planned(store), tuning: DEFAULT_TUNING }).blockAfterResources).toBe(7)
    const incoming = predictedEnemySequence(planned(store))
    expect(incoming.map(hit => [hit.damage, hit.absorbed, hit.dealt, hit.after])).toEqual([[6, 6, 0, 20], [10, 5, 5, 15]])

    await store.executeTurn()
    const after = store.getSnapshot()
    expect(after.player.sanity).toBe(incoming[incoming.length - 1].after + resources.healing)
    expect(after.absorbedTotals.player).toBe(resources.blockAfterResources)
    expect(logs).toContain('PRIVILEGE / SHELL +6 PRIVILEGE.')
    expect(logs).toContain('CORE / FIREWALL added 5 PRIVILEGE.')
    expect(logs).toContain('CORE / REPAIR queued 4 Sanity for the end of the turn.')
    expect(logs).toContain('CORE / REPAIR restored 4 Sanity.')
    expect(after.phase).toBe('planning')
    expect(after.tuning).toEqual(tuningFor(WEIGHTS))
  })

  it('reads the Overload threshold from the tuning everywhere it is used', async () => {
    const { store, events, logs } = loaded(ENCOUNTERS['1.1'], { sanity: 36, tuning: tuningFor(['overload_threshold']) })
    store.start()
    const state = store.getSnapshot()
    quiet(store).pos = { x: 0, y: 0 }
    state.player.overload = 2
    state.flags[7][7] = 'overload'
    state.flags[6][7] = 'overload'
    state.flags[5][7] = 'overload'
    store.requestOverload()
    expect(store.getSnapshot().message).toBe('Overload requires 4 charges.')
    for (let i = 0; i < 3; i++) store.addStep(0, -1)
    await store.executeTurn()
    // Three Flags from 2: the charge stops at the tuned threshold.
    expect(store.getSnapshot().player.overload).toBe(4)
    expect(logs).toContain('Overload charge 4/4.')
    store.requestOverload()
    expect(store.getSnapshot().overloadArmed).toBe(true)
    store.requestOverload()
    expect(store.getSnapshot().player).toMatchObject({ overload: 0, activeBash: 1 })
    expect(events.filter(event => event.type === 'overload')).toEqual([{ type: 'overload', encounter: '1.1', layer: 1, kind: 'skirmish', turn: 2 }])
  })

  it('forecasts a Breakdown turn as the store resolves it: the Soul counter is emptied first', async () => {
    const { store } = loaded(ENCOUNTERS['2.B'])
    store.start()
    const state = store.getSnapshot()
    const queen = state.enemies[0]
    for (const enemy of state.enemies.slice(1)) enemy.robustness = 0
    queen.robustness = Math.floor(queen.maxRobustness * (queen.breakdownAt ?? 0.5)) + 1
    // Walled in on three sides at the sign's waist: BASE cannot PUSH her off her route.
    queen.pos = { x: 7, y: 8 }
    queen.route = [{ x: 7, y: 9 }]
    // Stage II as this test needs it: a Soul that one Core Flag does not fill,
    // and a Desire step that is released whatever she walks over.
    queen.bossStages![1].soulThreshold = 2
    setDesire(queen.bossStages![1], [5, 6], 5, 1)
    // One Core Flag would have filled the Stage I counter; the Breakdown empties it first.
    queen.soulCounter = queen.soulThreshold - 1
    state.flags[9][7] = 'core'
    state.flags[10][7] = 'bash'
    store.addStep(0, -1)
    const release = simulateRelease(planned(store))
    expect(release.hits.map(hit => hit.events)).toEqual([['BUMP']])
    const forecast = predictedEnemyResources(planned(store), queen.id)
    const incoming = predictedEnemySequence(planned(store))
    expect(incoming.length).toBeGreaterThan(0)
    const sanity = state.player.sanity
    await store.executeTurn()
    expect(queen).toMatchObject({ stage: 2, pos: { x: 7, y: 9 } })
    expect(queen.soulCounter).toBe(forecast.soulCounterAfter)
    expect(forecast).toMatchObject({ recovery: 0, soulCounterAfter: 1 })
    expect(queen.robustness).toBe(release.hits[release.hits.length - 1].after)
    expect(sanity - store.getSnapshot().player.sanity).toBe(incoming.reduce((total, hit) => total + hit.dealt, 0))
  })
})

describe('a Breakdown in the campaign', () => {
  // The Queen one Bash Flag from her Breakdown, east of where the player's
  // route ends, and one Geek south of it. Every number the turn stands on is
  // set here.
  function court() {
    const battle = loaded(ENCOUNTERS['2.B'])
    battle.store.start()
    const state = battle.store.getSnapshot()
    const [queen, geek] = state.enemies
    for (const enemy of state.enemies.slice(2)) enemy.robustness = 0
    state.player.pos = { x: 7, y: 11 }
    state.player.sanity = 30
    queen.robustness = Math.floor(queen.maxRobustness * (queen.breakdownAt ?? 0.5)) + 1
    queen.block = 0
    queen.routeLength = 0
    // Stage II walks three cells and always releases one step, two cells far.
    queen.bossStages![1].routeLength = 3
    setDesire(queen.bossStages![1], [5, 6], 2, 1)
    setDesire(geek, [3, 4], 4)
    return { ...battle, state, queen, geek }
  }

  it('resolves the turn exactly as forecast: no route is redrawn inside it', async () => {
    const { store, logs, state, queen, geek } = court()
    // She stands still this turn. BASE pushes her a cell further off, out of
    // her new Desire's reach; a route drawn for Stage II would walk her back in.
    queen.pos = { x: 9, y: 10 }
    queen.route = []
    // The Geek steps aside onto a Bash Flag and strikes from there. A hunter's
    // route drawn afresh would bring it straight up the empty axis instead.
    geek.pos = { x: 7, y: 14 }
    geek.route = [{ x: 6, y: 14 }]
    state.flags[14][6] = 'bash'
    for (const y of [11, 12, 13]) state.flags[y][7] = 'blank'
    state.flags[10][7] = 'bash'
    store.addStep(0, -1)

    const release = simulateRelease(planned(store))
    const pushed = release.enemies.find(enemy => enemy.id === queen.id)!
    expect(pushed).toMatchObject({ pos: { x: 10, y: 10 }, route: [] })
    expect(pushed.hp / queen.maxRobustness).toBeLessThanOrEqual(queen.breakdownAt ?? 0.5)
    const incoming = predictedEnemySequence(planned(store))
    expect(incoming.map(hit => [hit.enemyId, hit.origin, hit.dealt, hit.after])).toEqual([[geek.id, { x: 6, y: 14 }, 3, 27]])
    const resources = [queen, geek].map(enemy => predictedEnemyResources(planned(store), enemy.id))

    const seen: Record<string, unknown> = {}
    store.subscribe(() => Object.assign(seen, store.getSnapshot().enemyResourcePreviews))
    await store.executeTurn()
    expect(queen).toMatchObject({ stage: 2, robustness: pushed.hp, pos: pushed.pos })
    expect(geek.pos).toEqual({ x: 6, y: 14 })
    expect(strikes(logs)).toEqual(incoming.map(hit => [hit.enemyId, hit.dealt]))
    expect(store.getSnapshot().player.sanity).toBe(incoming[incoming.length - 1].after)
    expect([seen[queen.id], seen[geek.id]]).toEqual(resources)
    // The turn boundary draws the routes of the stage she is now in.
    expect(store.getSnapshot()).toMatchObject({ phase: 'planning', turn: 2 })
    expect(queen.route).toEqual([{ x: 9, y: 10 }, { x: 8, y: 10 }])
  })

  it('still draws the new stage\'s routes when an Overload breaks the boss down during planning', () => {
    const { store, state, queen } = court()
    queen.pos = { x: 10, y: 11 }
    state.player.overload = state.tuning.overloadThreshold
    store.useOverload()
    // Planning goes on, and the forecast is read from the routes now on the board.
    expect(store.getSnapshot().phase).toBe('planning')
    expect(queen.stage).toBe(2)
    expect(queen.route).toEqual([{ x: 9, y: 11 }, { x: 8, y: 11 }])
  })
})

describe('a turn held for the interface', () => {
  // A route of two steps. The Queen breaks down on the player's release and
  // then strikes twice, for 5 and for 6.
  function held() {
    const battle = brink('2.B')
    const state = battle.store.getSnapshot()
    setDesire(battle.boss.bossStages![1], [5, 6], 5, 2)
    state.flags[state.player.pos.y - 1][state.player.pos.x - 1] = 'blank'
    battle.store.addStep(-1, 0)
    return battle
  }

  // The same turn with nothing held.
  async function control(): Promise<string> {
    const { store } = held()
    await store.executeTurn()
    expect(store.getSnapshot()).toMatchObject({ phase: 'planning', turn: 2, player: { sanity: 889 } })
    return JSON.stringify(store.getSnapshot())
  }

  it('stops at a Breakdown until the moment has played, then resolves as it would have', async () => {
    const { store, events, logs, boss } = held()
    let lift = () => {}
    const moment = new Promise<void>(resolve => { lift = resolve })
    const reached = new Promise<void>(resolve => {
      store.onStoryEvent = event => {
        events.push(event)
        if (event.type !== 'breakdown') return
        store.holdFor(moment)
        resolve()
      }
    })
    const turn = store.executeTurn()
    await reached
    // Long enough for the rest of the turn, were it not held.
    await sleep(250)
    // The Breakdown is on the board and nothing has happened after it.
    expect(store.getSnapshot()).toMatchObject({
      phase: 'resolving', enemyPhaseIndex: 0, message: 'QUEEN IN RED BREAKDOWN / DOCKET EVERY TURN',
      player: { sanity: 900 },
    })
    expect(boss.stage).toBe(2)
    expect(strikes(logs)).toEqual([])
    expect(events[events.length - 1].type).toBe('breakdown')
    lift()
    await turn
    expect(strikes(logs)).toEqual([[boss.id, 5], [boss.id, 6]])
    expect(JSON.stringify(store.getSnapshot())).toBe(await control())
  })

  it('sits a moment out at the next wait between steps, whenever it was put up', async () => {
    const { store, events, logs, boss } = held()
    let lift = () => {}
    const moment = () => new Promise<void>(resolve => { lift = resolve })
    // Put up while the player is still planning: the route is not walked under it.
    store.holdFor(moment())
    // Put up as the first step is walked: the second step waits.
    let walked = false
    store.subscribe(() => {
      if (walked || store.getSnapshot().resolvedMoves !== 1) return
      walked = true
      store.holdFor(moment())
    })
    // Put up as the first of two hits lands: the second waits.
    const struck = new Promise<void>(resolve => {
      store.onStoryEvent = event => {
        events.push(event)
        if (event.type !== 'hit_taken' || events.filter(seen => seen.type === 'hit_taken').length > 1) return
        store.holdFor(moment())
        resolve()
      }
    })
    const turn = store.executeTurn()
    await sleep(250)
    expect(store.getSnapshot()).toMatchObject({ phase: 'resolving', resolvedMoves: 0 })
    lift()
    await sleep(250)
    expect(store.getSnapshot()).toMatchObject({ phase: 'resolving', resolvedMoves: 1, playerAttackResolved: false })
    lift()
    await struck
    await sleep(250)
    expect(store.getSnapshot()).toMatchObject({ phase: 'resolving', turn: 1 })
    expect(strikes(logs)).toEqual([[boss.id, 5]])
    lift()
    await turn
    expect(strikes(logs)).toEqual([[boss.id, 5], [boss.id, 6]])
    expect(JSON.stringify(store.getSnapshot())).toBe(await control())
  })

  it('goes on when the moment fails to play', async () => {
    const { store, events } = held()
    store.onStoryEvent = event => {
      events.push(event)
      if (event.type === 'breakdown') store.holdFor(Promise.reject(new Error('the moment failed to play')))
    }
    await store.executeTurn()
    expect(events.map(event => event.type)).toEqual(['battle_start', 'breakdown', 'hit_taken', 'hit_taken', 'turn_end'])
    expect(JSON.stringify(store.getSnapshot())).toBe(await control())
  })

  it.each(['restart', 'load', 'returnToMenu'] as const)('%s drops what the battle was held for', async way => {
    const { store } = held()
    const reached = new Promise<void>(resolve => {
      store.onStoryEvent = event => {
        if (event.type !== 'breakdown') return
        // A moment that never ends.
        store.holdFor(new Promise<void>(() => {}))
        resolve()
      }
    })
    const turn = store.executeTurn()
    await reached
    if (way === 'restart') store.restart()
    else if (way === 'load') store.load(ENCOUNTERS['1.1'])
    else store.returnToMenu()
    const board = JSON.stringify(store.getSnapshot())
    // The turn that was waiting is let go and lands nothing on the new board.
    await turn
    expect(JSON.stringify(store.getSnapshot())).toBe(board)
    // And the new battle waits for nothing: neither that moment nor one put
    // up before it began.
    store.holdFor(new Promise<void>(() => {}))
    if (way === 'restart') store.restart()
    else if (way === 'load') store.load(ENCOUNTERS['1.1'])
    else store.returnToMenu()
    store.start()
    await store.executeTurn()
    expect(store.getSnapshot()).toMatchObject({ phase: 'planning', turn: 2 })
  })
})

describe('load, restart and the menu', () => {
  it('load puts an encounter on its title phase with what the run carries', () => {
    const store = new BattleStore()
    let published = 0
    store.subscribe(() => { published++ })
    const carry = { sanity: 21, tuning: tuningFor(['max_sanity', 'focus_start']) }
    // The TRACE it publishes is its content's to tune; this one is the test's.
    const encounter: Encounter = { ...ENCOUNTERS['2.2'], trace: 6 }
    store.load(encounter, carry)
    expect(published).toBe(1)
    const state = store.getSnapshot()
    expect(store.currentEncounter()).toBe(encounter)
    expect(state).toMatchObject({ phase: 'title', turn: 1, encounter: { id: '2.2' }, trace: 6, mechanic: null, curtains: [] })
    expect(state.player).toMatchObject({ sanity: 21, maxSanity: 40, pos: encounter.playerStart })
    expect(state.player.buffs.find(buff => buff.id === 'focus')!.counter).toBe(1)
    // The board is the one the encounter's seed draws.
    const reference = createInitialState(false, false, undefined, encounter, carry)
    expect(state.flags).toEqual(reference.flags)
    expect(state.incoming).toEqual(reference.incoming)
    expect(state.enemies).toEqual(reference.enemies)
  })

  it('start() takes no argument, keeps the loaded state and reports the battle', () => {
    const { store, events } = loaded(ENCOUNTERS['1.3'])
    expect(events).toEqual([])
    const before = store.getSnapshot()
    expect(store.start.length).toBe(0)
    store.start()
    const after = store.getSnapshot()
    expect(after.phase).toBe('planning')
    expect(after.flags).toBe(before.flags)
    expect(after.enemies).toBe(before.enemies)
    expect(after.encounter).toBe(ENCOUNTERS['1.3'])
    expect(events).toEqual([{ type: 'battle_start', encounter: '1.3', layer: 1, kind: 'skirmish', turn: 1 }])
    // A second call does nothing: the battle has begun.
    store.start()
    expect(events).toHaveLength(1)
  })

  it('restart() rebuilds the current encounter with the same carry and the same Warps', async () => {
    const carry = { sanity: 25, tuning: tuningFor(['shell_privilege']) }
    const { store, events } = loaded(ENCOUNTERS['3.1'], carry)
    // The run's own object changing later must not reach the battle.
    carry.sanity = 3
    carry.tuning.privilegePerFlag = 9
    store.start()
    const board = JSON.stringify(store.getSnapshot().flags)
    const play = async () => {
      store.addStep(0, -1)
      store.addStep(1, 0)
      store.addStep(1, 0)
      await store.executeTurn()
      const { flags, incoming, player, enemies, turn } = store.getSnapshot()
      return JSON.stringify({ flags, incoming, player, enemies, turn })
    }
    const first = await play()
    expect(store.getSnapshot().turn).toBe(2)
    store.restart()
    const state = store.getSnapshot()
    expect(state).toMatchObject({ phase: 'planning', turn: 1, encounter: { id: '3.1' }, message: '', actions: [] })
    expect(state.player).toMatchObject({ sanity: 25, pos: ENCOUNTERS['3.1'].playerStart })
    expect(state.tuning.privilegePerFlag).toBe(3)
    expect(JSON.stringify(state.flags)).toBe(board)
    expect(store.currentEncounter()).toBe(ENCOUNTERS['3.1'])
    // The Warps that fall in are reseeded too: the same turn plays out the same.
    expect(await play()).toBe(first)
    expect(events.filter(event => event.type === 'battle_start')).toHaveLength(2)
  })

  it('returnToMenu() goes back to the Warden default on its title phase', async () => {
    const { store } = loaded(ENCOUNTERS['2.B'], { sanity: 9, tuning: tuningFor(['max_sanity', 'overload_threshold']) })
    store.start()
    await store.executeTurn()
    store.returnToMenu()
    const state = store.getSnapshot()
    expect(store.currentEncounter()).toBe(WARDEN_ENCOUNTER)
    expect(state).toMatchObject({ phase: 'title', turn: 1, encounter: { id: '0.B' }, mechanic: { kind: 'curtain' }, trace: null })
    expect(state.tuning).toEqual(DEFAULT_TUNING)
    expect(state.player).toMatchObject({ sanity: 36, maxSanity: 36, pos: { x: 7, y: 7 } })
    expect(state.enemies.map(enemy => enemy.id)).toEqual(['B01', 'E02', 'E03'])
    const fresh = new BattleStore().getSnapshot()
    expect(JSON.stringify({ ...state, reducedMotion: false })).toBe(JSON.stringify(fresh))
    // And a restart from there is the Warden again, not the battle left behind.
    store.restart()
    expect(store.getSnapshot()).toMatchObject({ phase: 'planning', encounter: { id: '0.B' } })
  })

  it('stops a turn still resolving when another battle is loaded over it', async () => {
    const store = new BattleStore()
    store.start()
    // Real pacing, so the load lands while a Bash effect is in flight.
    store.addStep(0, -1)
    store.addStep(0, -1)
    const turn = store.executeTurn()
    await new Promise(resolve => setTimeout(resolve, 500))
    expect(store.getSnapshot().phase).toBe('resolving')
    store.getSnapshot().reducedMotion = true
    store.load(ENCOUNTERS['1.1'])
    const board = JSON.stringify(store.getSnapshot())
    await turn
    // Nothing of the old turn landed on the new board.
    expect(JSON.stringify(store.getSnapshot())).toBe(board)
    expect(store.getSnapshot()).toMatchObject({ phase: 'title', turn: 1, encounter: { id: '1.1' } })
  }, 20000)
})

describe('story events', () => {
  it('reports blocks, hits, low Sanity and the end of each turn as they happen', async () => {
    const { store, events } = loaded(ENCOUNTERS['1.1'])
    store.start()
    const state = store.getSnapshot()
    const [first, second] = state.enemies
    for (const enemy of state.enemies.slice(2)) enemy.robustness = 0
    // The player picks up one Privilege Flag: 2 PRIVILEGE. Each Geek stands on
    // a Bash Flag in range and releases one Desire step of 2: these two strike
    // only on a Bash Flag, whatever the Grove's content gives its Geeks.
    state.player.sanity = 14
    state.flags[7][7] = 'privilege'
    for (const [enemy, pos] of [[first, { x: 7, y: 5 }], [second, { x: 8, y: 6 }]] as const) {
      setDesire(enemy, [2, 3], 4)
      enemy.pos = pos
      enemy.route = [{ ...pos }]
      state.flags[pos.y][pos.x] = 'bash'
    }
    store.addStep(0, -1)
    const phases: string[] = []
    store.onStoryEvent = event => { events.push(event); phases.push(store.getSnapshot().phase) }
    await store.executeTurn()
    const base = { encounter: '1.1', layer: 1, kind: 'skirmish' }
    expect(events.slice(1)).toEqual([
      { type: 'full_block', ...base, turn: 1, enemyId: first.id },
      { type: 'hit_taken', ...base, turn: 1, enemyId: second.id },
      { type: 'sanity_low', ...base, turn: 1, enemyId: second.id },
      { type: 'turn_end', ...base, turn: 1 },
    ])
    // Every one of them while the turn was still resolving: none during planning.
    expect(phases).toEqual(['resolving', 'resolving', 'resolving', 'resolving'])
    expect(state.player.sanity).toBe(12)
    expect(first.live).toBe(1)

    // A second hit below the line: a hit, but low Sanity is said once a battle.
    second.route = [{ ...second.pos }]
    state.flags[second.pos.y][second.pos.x] = 'bash'
    first.route = []
    await store.executeTurn()
    expect(events.slice(5).map(event => event.type)).toEqual(['hit_taken', 'turn_end'])
    expect(events[events.length - 1]).toMatchObject({ type: 'turn_end', turn: 2 })
  })

  it('reports each Geek killed with the count this turn, then the victory', async () => {
    const { store, events } = loaded(ENCOUNTERS['1.1'])
    store.start()
    const state = store.getSnapshot()
    const [first, second] = state.enemies
    for (const enemy of state.enemies.slice(2)) enemy.robustness = 0
    // Two Bash Flags: BASE finishes one Geek, MANHATTAN the other.
    state.flags[7][7] = 'bash'
    state.flags[6][7] = 'bash'
    first.pos = { x: 8, y: 5 }
    second.pos = { x: 6, y: 5 }
    for (const enemy of [first, second]) { enemy.robustness = 1; enemy.route = [] }
    store.addStep(0, -1)
    store.addStep(0, -1)
    await store.executeTurn()
    const base = { encounter: '1.1', layer: 1, kind: 'skirmish', turn: 1 }
    expect(events.slice(1)).toEqual([
      { type: 'geek_killed', ...base, enemyId: first.id, killsThisTurn: 1 },
      { type: 'geek_killed', ...base, enemyId: second.id, killsThisTurn: 2 },
      { type: 'victory', ...base },
    ])
    expect(store.getSnapshot()).toMatchObject({ phase: 'victory', message: 'NODE 1.1 BROKEN' })
    expect(store.getSnapshot().log.some(entry => entry.text === 'Every Geek reduced to zero. Node broken.')).toBe(true)
  })

  it('counts kills afresh each turn and does not count a boss as a Geek', async () => {
    const { store, events } = loaded(ENCOUNTERS['2.B'])
    store.start()
    const state = store.getSnapshot()
    const [queen, axe, clerk] = state.enemies
    queen.robustness = 1
    queen.pos = { x: 8, y: 9 }
    axe.robustness = 1
    axe.pos = { x: 6, y: 9 }
    for (const enemy of state.enemies) enemy.route = []
    clerk.pos = { x: 0, y: 0 }
    state.flags[10][7] = 'bash'
    state.flags[9][7] = 'bash'
    store.addStep(0, -1)
    store.addStep(0, -1)
    await store.executeTurn()
    // Two fell; one of them was the Queen.
    expect(livingIds(store)).toEqual([clerk.id])
    expect(events.filter(event => event.type === 'geek_killed')).toMatchObject([{ enemyId: axe.id, killsThisTurn: 1 }])
    clerk.robustness = 1
    clerk.pos = { x: store.getSnapshot().player.pos.x + 1, y: store.getSnapshot().player.pos.y - 1 }
    clerk.route = []
    state.flags[store.getSnapshot().player.pos.y - 1][store.getSnapshot().player.pos.x] = 'bash'
    store.addStep(0, -1)
    await store.executeTurn()
    expect(events.filter(event => event.type === 'geek_killed').map(event => [event.turn, event.killsThisTurn])).toEqual([[1, 1], [2, 1]])
    expect(events[events.length - 1]).toMatchObject({ type: 'victory', encounter: '2.B', kind: 'boss', turn: 2 })
    expect(store.getSnapshot().message).toBe('COURT BREACHED')
    expect(store.getSnapshot().log.some(entry => entry.text === 'Queen in Red Robustness reduced to zero. Layer breached.')).toBe(true)
  })

  it('reports a Soul that restores Robustness, a Breakdown with the new stage, and a defeat', async () => {
    const { store, events } = loaded(ENCOUNTERS['2.B'])
    store.start()
    const state = store.getSnapshot()
    const [queen, axe, clerk] = state.enemies
    clerk.robustness = 0
    // The Queen is one hit from her Breakdown, and Stage II strikes whatever
    // she walks over; the Geek's Soul is full.
    queen.robustness = Math.floor(queen.maxRobustness * (queen.breakdownAt ?? 0.5)) + 1
    setDesire(queen.bossStages![1], [5, 6], 5, 1)
    queen.pos = { x: 8, y: 10 }
    queen.route = []
    axe.pos = { x: 0, y: 0 }
    axe.route = []
    axe.robustness -= 2
    axe.soulCounter = axe.soulThreshold
    state.flags[10][7] = 'bash'
    state.player.sanity = 1
    store.addStep(0, -1)
    await store.executeTurn()
    expect(events.map(event => event.type)).toEqual(['battle_start', 'breakdown', 'hit_taken', 'defeat'])
    expect(events[1]).toEqual({ type: 'breakdown', encounter: '2.B', layer: 2, kind: 'boss', turn: 1, stage: 2, enemyId: queen.id })
    // Every event of a boss battle carries the boss's stage at that moment.
    expect(events.map(event => event.stage)).toEqual([1, 2, 2, 2])
    expect(store.getSnapshot()).toMatchObject({ phase: 'gameover', message: 'ELIMINATED / COURT 2.B' })
    expect(store.getSnapshot().log.some(entry => entry.text.startsWith('BREAKDOWN / Stage II: EXECUTION, PRECEDENT, AMNESTY; a new Article every turn.'))).toBe(true)

    store.restart()
    const again = store.getSnapshot()
    again.enemies[0].robustness = 0
    again.enemies[2].robustness = 0
    const geek = again.enemies[1]
    geek.pos = { x: 0, y: 0 }
    geek.route = []
    geek.robustness -= 2
    geek.soulHeal = 3
    geek.soulCounter = geek.soulThreshold
    await store.executeTurn()
    expect(events.slice(4).map(event => event.type)).toEqual(['battle_start', 'soul_heal', 'turn_end'])
    expect(events[5]).toMatchObject({ type: 'soul_heal', enemyId: geek.id, stage: 1 })
    expect(geek.robustness).toBe(geek.maxRobustness)
  })

  it('finishes the turn even when the listener throws', async () => {
    const { store } = loaded(ENCOUNTERS['1.2'])
    const complaint = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    store.onStoryEvent = () => { throw new Error('the line failed to print') }
    store.start()
    await store.executeTurn()
    expect(store.getSnapshot()).toMatchObject({ phase: 'planning', turn: 2 })
    expect(complaint).toHaveBeenCalled()
    complaint.mockRestore()
  })
})

function livingIds(store: BattleStore): string[] {
  return store.getSnapshot().enemies.filter(enemy => enemy.robustness > 0).map(enemy => enemy.id)
}

describe('wording outside the prologue', () => {
  it('names the boss in front of the player, or no one', async () => {
    const turn = async (id: string) => {
      const { store } = loaded(ENCOUNTERS[id])
      store.start()
      store.getSnapshot().player.sanity = 900
      await store.executeTurn()
      return store.getSnapshot().message
    }
    expect(await turn('1.1')).toBe('Warps reindexed. Geek intent exposed.')
    expect(await turn('1.B')).toBe('Warps reindexed. Dark Young intent exposed.')
    expect(await turn('2.B')).toBe('Warps reindexed. Queen in Red intent exposed.')
    // The one with no name is given none.
    expect(await turn('3.B')).toBe('Warps reindexed. Intent exposed.')
  })

  it('says what each boss\'s Breakdown changes, and ends each battle in its own layer', async () => {
    const fall = async (id: string) => {
      const { store, logs, boss } = brink(id)
      // The threshold the log prints is the content's to tune.
      boss.bossStages![1].soulThreshold = 2
      await store.executeTurn()
      const breakdown = logs.find(text => text.startsWith('BREAKDOWN / Stage II'))
      // Everything standing, a birth of that turn included: the battle ends
      // only when the last Geek does.
      for (const enemy of store.getSnapshot().enemies) enemy.robustness = 0
      await store.executeTurn()
      return { breakdown, banner: store.getSnapshot().message, last: logs[logs.length - 1] }
    }
    expect(await fall('1.B')).toEqual({
      breakdown: 'BREAKDOWN / Stage II: FEAST, THICKET, BROOD; BROOD fills at 2.',
      banner: 'GROVE BREACHED', last: 'Dark Young Robustness reduced to zero. Layer breached.',
    })
    expect(await fall('3.B')).toEqual({
      breakdown: 'BREAKDOWN / Stage II: UNKNOWING, VEIL, FAITH; MYSTERY ends.',
      banner: 'CARCOSA BREACHED', last: 'Robustness reduced to zero. Layer breached.',
    })
  })
})

describe('PURGE in the forecast', () => {
  // Two Geeks on a cleared row of 2.1, two rows above a player who stands at
  // (7, 10). `first` acts first and stands out of reach; `second` ends its walk
  // in reach. Every number the turn stands on is set here.
  function row() {
    const battle = loaded(ENCOUNTERS['2.1'])
    battle.store.start()
    const state = battle.store.getSnapshot()
    const [first, second] = state.enemies
    for (const enemy of state.enemies.slice(2)) enemy.robustness = 0
    state.player.pos = { x: 7, y: 10 }
    state.player.sanity = 30
    for (const y of [7, 8, 9]) {
      for (let x = 2; x <= 11; x++) { state.walls[y][x] = false; state.flags[y][x] = 'blank' }
    }
    for (const enemy of [first, second]) {
      Object.assign(enemy, { route: [], effectCell: null, block: 0, securityPerFlag: 2, soulThreshold: 3, soulHeal: 3, soulCounter: 2 })
      enemy.robustness = enemy.maxRobustness - 3
    }
    first.pos = { x: 3, y: 8 }
    setDesire(first, [2], 1)
    setDesire(second, [3, 4], 5)
    return { ...battle, state, first, second }
  }

  // What the panels print while planning, then the turn itself.
  async function turn({ store, logs, state, first, second }: ReturnType<typeof row>) {
    const incoming = predictedEnemySequence(planned(store))
    const resources = [first, second].map(enemy => predictedEnemyResources(planned(store), enemy.id))
    const sanity = state.player.sanity
    const seen: Record<string, unknown> = {}
    store.subscribe(() => Object.assign(seen, store.getSnapshot().enemyResourcePreviews))
    await store.executeTurn()
    expect(strikes(logs)).toEqual(incoming.map(hit => [hit.enemyId, hit.dealt]))
    expect(store.getSnapshot().player.sanity).toBe(incoming.length ? incoming[incoming.length - 1].after : sanity)
    expect([seen[first.id], seen[second.id]]).toEqual(resources)
    return { incoming, resources }
  }

  it.each(['bash', 'privilege', 'core'] as const)('counts a %s Flag an earlier Geek erases for nothing on the route of a Geek acting later', async flag => {
    const battle = row()
    const { logs, state, first, second } = battle
    // The second Geek's route crosses the cell the first one erases, then a Bash Flag.
    first.effectCell = { x: 9, y: 8 }
    second.pos = { x: 10, y: 8 }
    second.route = [{ x: 9, y: 8 }, { x: 8, y: 8 }]
    state.flags[8][9] = flag
    state.flags[8][8] = 'bash'

    const { incoming, resources } = await turn(battle)
    // One Desire step for the Bash Flag still there; no Security, no Soul.
    expect(incoming.map(hit => [hit.enemyId, hit.stepIndex, hit.dealt, hit.after])).toEqual([[second.id, 0, 3, 27]])
    expect(resources[1]).toEqual({ securityGain: 0, recovery: 0, soulCounterAfter: 2 })
    expect(logs).toContain(`${first.id} / PURGE erased 0x98.`)
    expect(second).toMatchObject({ pos: { x: 8, y: 8 }, block: 0, soulCounter: 2, robustness: second.maxRobustness - 3 })
  })

  it('erases the cell where the release left it: a Geek that was pushed carries its PURGE along', async () => {
    const battle = row()
    const { store, logs, state, first, second } = battle
    // BASE pushes the first Geek one cell west, and its PURGE with it: off the
    // cell the second Geek stands on, onto the first cell of that Geek's route.
    first.pos = { x: 5, y: 8 }
    first.effectCell = { x: 10, y: 7 }
    second.pos = { x: 10, y: 7 }
    second.route = [{ x: 9, y: 7 }, { x: 8, y: 7 }]
    state.flags[7][9] = 'bash'
    state.flags[7][8] = 'bash'
    state.flags[9][7] = 'bash'
    store.addStep(0, -1)
    const pushed = simulateRelease(planned(store)).enemies.find(enemy => enemy.id === first.id)!
    expect(pushed).toMatchObject({ pos: { x: 4, y: 8 }, effectCell: { x: 9, y: 7 } })

    const { incoming } = await turn(battle)
    expect(incoming.map(hit => [hit.enemyId, hit.stepIndex, hit.dealt])).toEqual([[second.id, 0, 3]])
    expect(logs).toContain(`${first.id} / PURGE erased 0x97.`)
  })

  it('leaves a Flag to the Geek that walks it before the PURGE: only the Geeks acting later lose it', async () => {
    const battle = row()
    const { logs, state, first, second } = battle
    // The second Geek erases a cell the first has already walked by then.
    first.route = [{ x: 4, y: 8 }]
    setDesire(first, [2], 15)
    second.pos = { x: 10, y: 8 }
    second.effectCell = { x: 4, y: 8 }
    state.flags[8][4] = 'bash'

    const { incoming } = await turn(battle)
    expect(incoming.map(hit => [hit.enemyId, hit.dealt])).toEqual([[first.id, 2]])
    expect(logs.some(text => text.includes('PURGE erased'))).toBe(false)
  })
})

describe('REPAIR on the turn that wins', () => {
  // One Geek with 1 Robustness left, where BASE reaches it from the end of a
  // two-step route: a Core Flag that completes REPAIR, then a Bash Flag.
  function lastGeek(encounter: Encounter, sanity: number) {
    const battle = loaded(encounter, { sanity, tuning: DEFAULT_TUNING })
    battle.store.start()
    const state = battle.store.getSnapshot()
    const geek = quiet(battle.store)
    const { x, y } = state.player.pos
    for (const step of [1, 2]) state.walls[y - step][x] = false
    state.flags[y - 1][x] = 'core'
    state.flags[y - 2][x] = 'bash'
    geek.robustness = 1
    geek.block = 0
    geek.pos = { x: x + 1, y: y - 3 }
    const repair = state.player.buffs.find(buff => buff.id === 'repair')!
    repair.counter = repair.threshold - 1
    battle.store.addStep(0, -1)
    battle.store.addStep(0, -1)
    return { ...battle, state }
  }

  it.each([
    ['1.1', 20, 23, 'Every Geek reduced to zero. Node broken.'],
    // Never above the maximum.
    ['1.1', 35, 36, 'Every Geek reduced to zero. Node broken.'],
    ['0.B', 20, 23, 'Warden Robustness reduced to zero. Escape route open.'],
  ] as const)('is paid on %s before the battle ends, as the panel promised: %i to %i', async (id, sanity, promised, last) => {
    const { store, logs, events, state } = lastGeek(ENCOUNTERS[id], sanity)
    expect(state.player).toMatchObject({ sanity, maxSanity: 36 })
    // The panel's line while planning: no hit is coming, and REPAIR heals 3.
    const incoming = predictedEnemySequence(planned(store))
    const { healing } = predictedPlayerResources(planned(store))
    expect([incoming, healing]).toEqual([[], 3])
    expect(Math.min(state.player.maxSanity, sanity + healing)).toBe(promised)

    await store.executeTurn()
    const after = store.getSnapshot()
    expect(after).toMatchObject({ phase: 'victory', pendingRepair: 0 })
    // What the run carries into its next battle.
    expect(after.player.sanity).toBe(promised)
    expect(logs.slice(-2)).toEqual([`CORE / REPAIR restored ${promised - sanity} Sanity.`, last])
    expect(events[events.length - 1].type).toBe('victory')
  })
})

describe('PATH TAKEN', () => {
  it('keeps the cell the route started from while the route is walked, and after a battle that ends on it', async () => {
    const { store } = loaded(WARDEN_ENCOUNTER)
    store.start()
    store.addStep(1, 0)
    store.addStep(1, 0)
    const route = store.routeText()
    expect(route).toBe('0x77 → 0x87 → 0x97')
    const whileWalked = new Set<string>()
    store.subscribe(() => { if (store.getSnapshot().phase === 'resolving') whileWalked.add(store.routeText()) })
    await store.executeTurn()
    expect([...whileWalked]).toEqual([route])
    // The next route starts where this one ended.
    expect(store.getSnapshot().phase).toBe('planning')
    expect(store.routeText()).toBe('0x97')

    const won = loaded(WARDEN_ENCOUNTER)
    won.store.start()
    won.store.addStep(1, 0)
    won.store.addStep(1, 0)
    for (const enemy of won.store.getSnapshot().enemies) enemy.robustness = 0
    await won.store.executeTurn()
    expect(won.store.getSnapshot().phase).toBe('victory')
    expect(won.store.routeText()).toBe(route)
  })
})

describe('visual defeat and Overload outcome pacing', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('delays PASS screen after winning Overload and keeps enemy icon visible until HP drops to zero', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10000)
    vi.stubGlobal('window', { dispatchEvent: () => true })

    const { store } = loaded(ENCOUNTERS['1.1'])
    store.start()
    const state = store.getSnapshot()
    state.reducedMotion = false
    const geek = quiet(store)
    geek.robustness = 1
    geek.block = 0
    geek.pos = { x: state.player.pos.x, y: state.player.pos.y - 2 }
    state.player.overload = state.tuning.overloadThreshold

    store.useOverload()
    expect(store.getSnapshot().phase).toBe('victory')
    expect(store.isOutcomeDelayed()).toBe(true)

    await vi.advanceTimersByTimeAsync(500)
    expect(store.visualEnemies()).toHaveLength(1)
    expect(store.visualEnemies()[0]).toMatchObject({ enemy: { id: geek.id, robustness: 1 }, dyingProgress: null })
    expect(store.isOutcomeDelayed()).toBe(true)

    await vi.advanceTimersByTimeAsync(340) // t = 840 ms (just after 820 ms stream strike)
    expect(store.visualEnemies()).toHaveLength(1)
    expect(store.visualEnemies()[0].enemy).toMatchObject({ id: geek.id, robustness: 0 })
    expect(store.visualEnemies()[0].dyingProgress).not.toBeNull()
    expect(store.isOutcomeDelayed()).toBe(true)

    await vi.advanceTimersByTimeAsync(280) // t = 1120 ms (after 260 ms zero-HP fade)
    expect(store.visualEnemies()).toHaveLength(0)
    expect(store.isOutcomeDelayed()).toBe(true)

    await vi.advanceTimersByTimeAsync(280) // t = 1400 ms (after 1360 ms OVERLOAD VFX end)
    expect(store.isOutcomeDelayed()).toBe(false)
  })

  it('keeps a dying Geek visible at zero HP briefly when slain by a regular Bash release', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(20000)
    vi.stubGlobal('window', { dispatchEvent: () => true })

    const { store } = loaded(ENCOUNTERS['1.1'])
    store.start()
    const state = store.getSnapshot()
    state.reducedMotion = false
    const geek = quiet(store)
    geek.robustness = 1
    geek.block = 0
    geek.pos = { x: state.player.pos.x + 1, y: state.player.pos.y - 1 }
    state.flags[state.player.pos.y - 1][state.player.pos.x] = 'bash'
    store.addStep(0, -1)

    const turn = store.executeTurn()
    // Wait until move step + BASE strike (320 ms) completes; before settle finishes
    await vi.advanceTimersByTimeAsync(600)
    const dying = store.visualEnemies()
    expect(dying).toHaveLength(1)
    expect(dying[0].enemy).toMatchObject({ id: geek.id, robustness: 0 })
    expect(dying[0].dyingProgress).not.toBeNull()

    await vi.advanceTimersByTimeAsync(300)
    expect(store.visualEnemies()).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1500)
    await turn
    expect(store.getSnapshot().phase).toBe('victory')
  })
})
