import { describe, expect, it } from 'vitest'
import { BattleStore } from './battle-store'
import type { StoryEvent } from './battle-store'
import { coordKey, createInitialState, livingEnemies, manhattan } from './battle-rules'
import type { BattleState, EnemyState, FlagKind } from './battle-types'
import { desireReleaseCount, desireStepsFor, predictedEnemyResources, predictedEnemySequence } from './enemy-attack-methods'
import { ENCOUNTERS } from './encounters'
import type { Encounter } from './encounters'
import { ARTICLES, advanceMechanics, articleById, disclosed, traceLevel } from './mechanics'
import script from '../story/script.json'

// A battle on a campaign encounter, started, with the story events it emits.
function battle(encounter: Encounter) {
  const store = new BattleStore()
  store.getSnapshot().reducedMotion = true
  store.load(encounter)
  const events: StoryEvent[] = []
  store.onStoryEvent = event => events.push(event)
  store.start()
  // Tests that only wait out turns should not lose the battle doing it.
  store.getSnapshot().player.sanity = 900
  store.getSnapshot().player.maxSanity = 900
  return { store, events }
}

// What a state looks like when a turn has just ended: the counter moved on.
function boundary(state: BattleState) {
  state.turn++
  return advanceMechanics(state)
}

const amounts = (enemy: EnemyState): number[] => desireStepsFor(enemy).map(step => step.amount)
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe('BROOD', () => {
  // The Dark Young one Core Flag from a full Soul, with that Flag on its route.
  function expecting() {
    const { store, events } = battle(ENCOUNTERS['1.B'])
    const state = store.getSnapshot()
    const boss = state.enemies[0]
    boss.robustness = boss.maxRobustness - 10
    boss.soulCounter = boss.soulThreshold - 1
    boss.route = [{ x: boss.pos.x, y: boss.pos.y + 1 }]
    state.flags[boss.pos.y + 1][boss.pos.x] = 'core'
    return { store, events, boss }
  }

  it('forecasts BROOD where a Geek would recover, and does not heal', async () => {
    const { store, boss } = expecting()
    const hurt = boss.robustness
    expect(predictedEnemyResources(store.getSnapshot(), boss.id)).toMatchObject({ brood: true, recovery: 0, soulCounterAfter: 0 })
    // The Geek beside it still recovers the ordinary way.
    const other = store.getSnapshot().enemies[1]
    other.robustness -= 1
    other.soulCounter = other.soulThreshold
    expect(predictedEnemyResources(store.getSnapshot(), other.id)).toMatchObject({ recovery: 1 })
    expect(predictedEnemyResources(store.getSnapshot(), other.id).brood).toBeUndefined()
    await store.executeTurn()
    expect(boss.robustness).toBe(hurt)
    expect(boss.soulCounter).toBe(0)
    expect(other.robustness).toBe(other.maxRobustness)
  })

  it('places the birth only at the turn boundary and never shifts that turn\'s forecast', async () => {
    const { store, events, boss } = expecting()
    const roster = store.getSnapshot().enemies.length
    const sanity = store.getSnapshot().player.sanity
    const incoming = predictedEnemySequence(store.getSnapshot())
    expect(incoming.length).toBeGreaterThan(0)
    // Every state published while the turn resolves: who is on the board, and what is queued.
    const resolving: { enemies: number; queued: number }[] = []
    store.subscribe(() => {
      const state = store.getSnapshot()
      if (state.phase === 'resolving' && state.mechanic?.kind === 'brood') resolving.push({ enemies: state.enemies.length, queued: state.mechanic.queued })
    })
    await store.executeTurn()
    const state = store.getSnapshot()
    expect(resolving.every(seen => seen.enemies === roster)).toBe(true)
    expect(resolving.some(seen => seen.queued === 1)).toBe(true)
    // The turn did exactly what was forecast before the birth was queued.
    expect(state.player.sanity).toBe(incoming[incoming.length - 1].after)
    expect(sanity - state.player.sanity).toBe(incoming.reduce((total, hit) => total + hit.dealt, 0))

    expect(state.enemies).toHaveLength(roster + 1)
    const born = state.enemies[state.enemies.length - 1]
    expect(born).toMatchObject({ id: 'N01', name: 'DESIRE / AGAIN', behavior: 'hunter', born: 2, soulCounter: 0, block: 0 })
    expect(born.robustness).toBe(boss.brood!.spawn.robustness)
    expect(manhattan(born.pos, boss.pos)).toBe(1)
    expect(state.walls[born.pos.y][born.pos.x]).toBe(false)
    // It is on the board for the new turn's planning, with a public route.
    expect(state.phase).toBe('planning')
    expect(born.route.length).toBeGreaterThan(0)
    expect(state.mechanic).toMatchObject({ kind: 'brood', bossId: boss.id, births: 1, count: 2, queued: 0, alive: 1, limit: 3 })
    expect(events.filter(event => event.type === 'brood')).toEqual([
      { type: 'brood', encounter: '1.B', layer: 1, kind: 'boss', turn: 1, stage: 1, broodCount: 1, enemyId: 'N01' },
    ])
    expect(state.log.some(entry => entry.text.includes('N01 born') && entry.text.includes('2 OF 1000'))).toBe(true)
  })

  it('doubles the count with each birth and keeps at most three alive', () => {
    const state = createInitialState(false, true, undefined, ENCOUNTERS['1.B'])
    expect(state.mechanic).toMatchObject({ kind: 'brood', births: 0, count: 1, queued: 0, alive: 0 })
    if (state.mechanic?.kind !== 'brood') throw new Error('no brood')
    state.mechanic = { ...state.mechanic, queued: 5 }
    const events = boundary(state)
    expect(events.map(event => event.type)).toEqual(['birth', 'birth', 'birth', 'birth_lost', 'birth_lost'])
    expect(events.flatMap(event => event.type === 'birth' ? [event.count] : [])).toEqual([2, 4, 8])
    expect(state.mechanic).toMatchObject({ births: 3, count: 8, queued: 0, alive: 3 })
    const born = state.enemies.filter(enemy => enemy.born !== undefined)
    expect(born.map(enemy => enemy.id)).toEqual(['N01', 'N02', 'N03'])
    // Each on its own free cell, the nearest to the boss, appended after the roster.
    expect(new Set(born.map(enemy => coordKey(enemy.pos))).size).toBe(3)
    expect(born.every(enemy => manhattan(enemy.pos, state.enemies[0].pos) === 1)).toBe(true)
    expect(state.enemies.slice(-3)).toEqual(born)

    // One dies: there is room for exactly one more, and the count goes on doubling.
    born[0].robustness = 0
    state.mechanic = { ...state.mechanic, queued: 2 }
    expect(boundary(state).map(event => event.type)).toEqual(['birth', 'birth_lost'])
    expect(state.mechanic).toMatchObject({ births: 4, count: 16, alive: 3 })
    expect(livingEnemies(state).filter(enemy => enemy.born !== undefined)).toHaveLength(3)
  })

  it('is over when the Dark Young is: a birth still queued is lost', () => {
    const state = createInitialState(false, true, undefined, ENCOUNTERS['1.B'])
    if (state.mechanic?.kind !== 'brood') throw new Error('no brood')
    state.mechanic = { ...state.mechanic, queued: 1 }
    state.enemies[0].robustness = 0
    expect(boundary(state)).toEqual([{ type: 'birth_lost' }])
    expect(state.enemies).toHaveLength(ENCOUNTERS['1.B'].enemies.length)
  })
})

describe('DOCKET', () => {
  it('takes its Articles from the script, in an order drawn from the encounter\'s seed', () => {
    expect(ARTICLES.map(article => article.id)).toEqual(script.articles.map(article => article.id))
    const order = (seed: number): string[] => {
      const { mechanic } = createInitialState(false, true, undefined, { ...ENCOUNTERS['2.B'], seed })
      return mechanic?.kind === 'articles' ? mechanic.order : []
    }
    const base = order(ENCOUNTERS['2.B'].seed)
    expect([...base].sort()).toEqual(ARTICLES.map(article => article.id).sort())
    expect(order(ENCOUNTERS['2.B'].seed)).toEqual(base)
    const others = Array.from({ length: 12 }, (_, index) => order(index + 1).join())
    expect(new Set(others).size).toBeGreaterThan(1)
  })

  it('shows the first Article from turn 1 and enacts it only after two full planning turns', async () => {
    const { store, events } = battle(ENCOUNTERS['2.B'])
    const opening = store.getSnapshot().mechanic
    if (opening?.kind !== 'articles') throw new Error('no docket')
    const first = articleById(opening.order[0])!
    const second = articleById(opening.order[1])!
    expect(opening).toMatchObject({ inForce: null, pending: first, pendingTurn: 3, countdown: 2 })

    await store.executeTurn()
    expect(store.getSnapshot().turn).toBe(2)
    expect(store.getSnapshot().mechanic).toMatchObject({ inForce: null, pending: first, countdown: 1 })
    expect(events.some(event => event.type === 'article')).toBe(false)

    // The turn it is due: the plan is made on the board as it still is.
    const incoming = predictedEnemySequence(store.getSnapshot())
    await store.executeTurn()
    expect(store.getSnapshot().player.sanity).toBe(incoming.length ? incoming[incoming.length - 1].after : 900)
    expect(store.getSnapshot().turn).toBe(3)
    // Stage I: the next one is two turns out.
    expect(store.getSnapshot().mechanic).toMatchObject({ inForce: first, pending: second, pendingTurn: 5, countdown: 2 })
    expect(events.filter(event => event.type === 'article')).toEqual([
      { type: 'article', encounter: '2.B', layer: 2, kind: 'boss', turn: 2, stage: 1, article: first.id },
    ])
    expect(store.getSnapshot().log.some(entry => entry.text.startsWith(`DOCKET / ARTICLE ${first.number} in force.`))).toBe(true)
  })

  it('reads out a new Article every turn in Stage II, each still pending for a full turn', async () => {
    const { store, events } = battle(ENCOUNTERS['2.B'])
    await store.executeTurn()
    store.getSnapshot().enemies[0].stage = 2
    await store.executeTurn()
    // The Article that takes effect now was drawn in Stage I; the next is one turn out.
    const drawn = store.getSnapshot().mechanic
    if (drawn?.kind !== 'articles') throw new Error('no docket')
    expect(drawn).toMatchObject({ pendingTurn: 4, countdown: 1 })
    const pending = drawn.pending
    await store.executeTurn()
    expect(store.getSnapshot().mechanic).toMatchObject({ inForce: pending, pendingTurn: 5, countdown: 1 })
    await store.executeTurn()
    expect(events.filter(event => event.type === 'article').map(event => [event.turn, event.stage])).toEqual([[2, 2], [3, 2], [4, 2]])
    // Five Articles in a fixed order: the same one never comes twice running.
    const articles = events.flatMap(event => event.type === 'article' ? [event.article] : [])
    expect(new Set(articles).size).toBe(articles.length)
  })

  // A state where `effect` is the Article due at the next boundary.
  function due(effect: string) {
    const state = createInitialState(false, true, undefined, ENCOUNTERS['2.B'])
    const article = ARTICLES.find(candidate => candidate.effect === effect)!
    if (state.mechanic?.kind !== 'articles') throw new Error('no docket')
    state.mechanic = { ...state.mechanic, pending: article, pendingTurn: state.turn + 1, countdown: 1 }
    return { state, article, queen: state.enemies[0] }
  }

  const swapped = (flag: FlagKind, a: FlagKind, b: FlagKind): FlagKind => flag === a ? b : flag === b ? a : flag

  it.each([
    ['swap_bash_privilege', 'bash', 'privilege'],
    ['swap_core_overload', 'core', 'overload'],
  ] as const)('%s trades the two Flags on the board and in the queue', (effect, a, b) => {
    const { state, article } = due(effect)
    const flags = copy(state.flags)
    const incoming = copy(state.incoming)
    const units = copy(state.enemies.map(enemy => enemy.pos))
    expect(boundary(state)).toEqual([{ type: 'article', article, repealed: null, enacted: true }])
    expect(state.flags).toEqual(flags.map(row => row.map(flag => swapped(flag, a, b))))
    expect(state.incoming).toEqual(incoming.map(column => column.map(flag => swapped(flag, a, b))))
    expect(state.flags.flat().filter(flag => flag === a)).toHaveLength(flags.flat().filter(flag => flag === b).length)
    expect(state.enemies.map(enemy => enemy.pos)).toEqual(units)
    expect(state.mechanic).toMatchObject({ inForce: article })
  })

  it('mirror turns Flags and queue left to right; walls and units stay', () => {
    const { state } = due('mirror')
    const flags = copy(state.flags)
    const incoming = copy(state.incoming)
    const walls = copy(state.walls)
    const units = copy([state.player.pos, ...state.enemies.map(enemy => enemy.pos)])
    boundary(state)
    state.flags.forEach((row, y) => row.forEach((flag, x) => expect(flag).toBe(flags[y][14 - x])))
    state.incoming.forEach((column, x) => expect(column).toEqual(incoming[14 - x]))
    expect(state.walls).toEqual(walls)
    expect([state.player.pos, ...state.enemies.map(enemy => enemy.pos)]).toEqual(units)
  })

  it('floor_up adds one guaranteed Desire step while in force, through a Breakdown, and no longer', () => {
    const { state, queen } = due('floor_up')
    const floor = queen.desireFloor ?? 0
    const later = queen.bossStages![1].desireFloor
    expect(desireReleaseCount(queen, 0)).toBe(floor)
    boundary(state)
    expect(queen.desireFloor).toBe(floor + 1)
    expect(desireReleaseCount(queen, 0)).toBe(floor + 1)
    // The stage she has yet to enter carries it too.
    expect(queen.bossStages![1].desireFloor).toBe(later + 1)
    // The next Article repeals it.
    if (state.mechanic?.kind !== 'articles') throw new Error('no docket')
    state.mechanic = { ...state.mechanic, pending: ARTICLES.find(article => article.effect === 'croquet')!, pendingTurn: state.turn + 1 }
    const [event] = boundary(state)
    expect(event).toMatchObject({ type: 'article', repealed: { effect: 'floor_up' } })
    expect(queen.desireFloor).toBe(floor)
    expect(queen.bossStages![1].desireFloor).toBe(later)
  })

  it('croquet changes her place with the farthest living Geek, or does nothing when there is none', () => {
    const { state, queen } = due('croquet')
    const others = state.enemies.slice(1)
    const far = others.reduce((best, enemy) => manhattan(enemy.pos, queen.pos) > manhattan(best.pos, queen.pos) ? enemy : best)
    const throne = { ...queen.pos }
    const place = { ...far.pos }
    const rest = copy(others.filter(enemy => enemy !== far).map(enemy => enemy.pos))
    expect(boundary(state)).toMatchObject([{ type: 'article', enacted: true }])
    expect(queen.pos).toEqual(place)
    expect(far.pos).toEqual(throne)
    expect(others.filter(enemy => enemy !== far).map(enemy => enemy.pos)).toEqual(rest)

    const alone = due('croquet')
    for (const enemy of alone.state.enemies.slice(1)) enemy.robustness = 0
    const stays = { ...alone.queen.pos }
    expect(boundary(alone.state)).toMatchObject([{ type: 'article', enacted: false }])
    expect(alone.queen.pos).toEqual(stays)
    expect(alone.state.mechanic).toMatchObject({ inForce: { effect: 'croquet' } })
  })

  it('falls silent when the Queen falls', () => {
    const { state, queen } = due('mirror')
    const flags = copy(state.flags)
    queen.robustness = 0
    expect(boundary(state)).toEqual([])
    expect(state.flags).toEqual(flags)
    expect(state.mechanic).toMatchObject({ pending: null, countdown: 0 })
  })
})

describe('UNDISCLOSED', () => {
  it('withholds the boss\'s numbers until it is LIVE or in Act II; nothing else is ever withheld', () => {
    const state = createInitialState(false, true, undefined, ENCOUNTERS['3.B'])
    const [king, geek] = state.enemies
    expect(disclosed(state, king)).toBe(false)
    expect(disclosed(state, geek)).toBe(true)
    king.live = state.turn
    expect(disclosed(state, king)).toBe(true)
    king.live = 0
    king.stage = 2
    expect(disclosed(state, king)).toBe(true)
    for (const enemy of createInitialState().enemies) expect(disclosed(state, enemy)).toBe(true)
  })

  it('MYSTERY restores its Security at the end of its resolve in Stage I', async () => {
    const { store } = battle(ENCOUNTERS['3.B'])
    const king = store.getSnapshot().enemies[0]
    const mystery = king.mystery!
    // In place from the first turn.
    expect(king.block).toBe(mystery)
    expect(store.getSnapshot().mechanic).toEqual({ kind: 'undisclosed', bossId: king.id, mystery })
    // Stripped, as ZERO would leave it; nothing on its route to rebuild it.
    king.block = 0
    king.route = []
    expect(predictedEnemyResources(store.getSnapshot(), king.id).securityGain).toBe(mystery)
    await store.executeTurn()
    expect(king.block).toBe(mystery)
    expect(store.getSnapshot().log.some(entry => entry.text.includes(`restored Security to ${mystery}`))).toBe(true)
    // Privilege on its route counts when it is worth more than MYSTERY.
    king.securityPerFlag = mystery + 2
    king.route = [{ ...king.pos }]
    store.getSnapshot().flags[king.pos.y][king.pos.x] = 'privilege'
    expect(predictedEnemyResources(store.getSnapshot(), king.id).securityGain).toBe(mystery + 2)
    await store.executeTurn()
    expect(king.block).toBe(mystery + 2)
  })

  it('MYSTERY ends with Stage I', async () => {
    const { store, events } = battle(ENCOUNTERS['3.B'])
    const state = store.getSnapshot()
    const king = state.enemies[0]
    // One Bash hit from its Breakdown, standing next to the player.
    king.robustness = Math.floor(king.maxRobustness * (king.breakdownAt ?? 0.5)) + 1
    king.block = 0
    king.pos = { x: state.player.pos.x + 1, y: state.player.pos.y - 1 }
    king.route = []
    state.flags[state.player.pos.y - 1][state.player.pos.x] = 'bash'
    store.addStep(0, -1)
    // The forecast already knows there is no MYSTERY to come back.
    expect(predictedEnemyResources(store.getSnapshot(), king.id).securityGain).toBe(0)
    await store.executeTurn()
    expect(king.stage).toBe(2)
    expect(king.block).toBe(0)
    expect(store.getSnapshot().mechanic).toEqual({ kind: 'undisclosed', bossId: king.id, mystery: null })
    expect(disclosed(store.getSnapshot(), king)).toBe(true)
    expect(events.filter(event => event.type === 'breakdown')).toMatchObject([{ encounter: '3.B', stage: 2, enemyId: king.id }])
    expect(store.getSnapshot().log.some(entry => entry.text.includes('MYSTERY ends'))).toBe(true)
    // A turn with nothing on its route: no Security comes back in Act II.
    king.route = []
    await store.executeTurn()
    expect(king.block).toBe(0)
  })
})

describe('TRACE', () => {
  it('raises every living Geek\'s Desire only from the turn after the one published', async () => {
    const { store } = battle({ ...ENCOUNTERS['1.1'], trace: 2 })
    const [first, second] = store.getSnapshot().enemies
    const base = [amounts(first), amounts(second)]
    expect(store.getSnapshot().trace).toBe(2)

    await store.executeTurn()
    expect(store.getSnapshot().turn).toBe(2)
    expect(store.getSnapshot().trace).toBe(1)
    expect([amounts(first), amounts(second)]).toEqual(base)
    expect(traceLevel(store.getSnapshot())).toBe(0)

    // Turn 2 is the published turn: it is still fought at base Desire.
    const incoming = predictedEnemySequence(store.getSnapshot())
    const sanity = store.getSnapshot().player.sanity
    await store.executeTurn()
    expect(sanity - store.getSnapshot().player.sanity).toBe(incoming.reduce((total, hit) => total + hit.dealt, 0))
    expect(store.getSnapshot().turn).toBe(3)
    expect(store.getSnapshot().trace).toBe(0)
    expect([amounts(first), amounts(second)]).toEqual(base.map(steps => steps.map(amount => amount + 1)))
    expect(first.desire).toEqual(ENCOUNTERS['1.1'].enemies[0].desire.map(amount => amount + 1))
    expect(traceLevel(store.getSnapshot())).toBe(1)
    expect(store.getSnapshot().log.some(entry => entry.text.startsWith('TRACE /'))).toBe(true)

    // A fallen Geek is past it; the living one keeps rising, and the forecast shows it.
    second.robustness = 0
    const raised = predictedEnemySequence(store.getSnapshot())
    expect(raised.every(hit => hit.enemyId === first.id && hit.damage === amounts(first)[hit.stepIndex])).toBe(true)
    await store.executeTurn()
    expect(amounts(first)).toEqual(base[0].map(amount => amount + 2))
    expect(amounts(second)).toEqual(base[1].map(amount => amount + 1))
    // The encounter's own numbers were never touched.
    expect(ENCOUNTERS['1.1'].enemies[0].desire).toEqual(base[0])
  })

  it('carries through a Breakdown, and leaves the Warden alone', async () => {
    const state = createInitialState(false, true, undefined, { ...ENCOUNTERS['2.B'], trace: 1 })
    const queen = state.enemies[0]
    const later = queen.bossStages![1].desireSteps!.map(step => step.amount)
    boundary(state)
    expect(queen.bossStages![1].desireSteps!.map(step => step.amount)).toEqual(later.map(amount => amount + 1))
    expect(queen.bossStages![1].desire).toEqual(later.map(amount => amount + 1))

    const store = new BattleStore()
    store.getSnapshot().reducedMotion = true
    store.start()
    const warden = amounts(store.getSnapshot().enemies[0])
    expect(store.getSnapshot().trace).toBeNull()
    await store.executeTurn()
    await store.executeTurn()
    expect(store.getSnapshot().trace).toBeNull()
    expect(amounts(store.getSnapshot().enemies[0])).toEqual(warden)
  })
})
