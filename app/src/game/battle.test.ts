import { describe, expect, it } from 'vitest'
import { BattleStore } from './battle-store'
import { coordKey, createInitialState, enemyRoutes, refillBoard, scheduleCurtains } from './battle-rules'
import { attackRoll, inAttackRange, predictedDamage, predictedSequence, releaseCount, stepDamage } from './attack-methods'
import { desireInRange, desireReleaseCount, predictedEnemyResources, predictedEnemySequence, predictedPlayerResources } from './enemy-attack-methods'
import { BASH_PRESETS, FLAG_WEIGHTS } from './battle-config'

function readyStore(): BattleStore {
  const store = new BattleStore()
  store.getSnapshot().reducedMotion = true
  store.start()
  return store
}

describe('battle rules', () => {
  it('formats coordinates as hexadecimal Warps from the top-left', () => {
    expect(coordKey({ x: 0, y: 0 })).toBe('0x00')
    expect(coordKey({ x: 1, y: 1 })).toBe('0x11')
    expect(coordKey({ x: 14, y: 14 })).toBe('0xEE')
  })

  it('creates one Warden and two Geeks with public routes and a two-turn Curtain forecast', () => {
    const state = createInitialState()
    expect(state.flags).toHaveLength(15)
    expect(state.incoming).toHaveLength(15)
    expect(state.enemies).toHaveLength(3)
    expect(state.enemies[0].name).toBe('WARDEN / CURTAIN')
    expect(state.enemies[0].stage).toBe(1)
    expect(state.enemies.map(enemy => enemy.id)).toEqual(['B01', 'E02', 'E03'])
    expect(state.enemies.every(enemy => enemy.route.length > 0)).toBe(true)
    expect(state.curtains).toEqual([{ axis: 'column', index: 7, fireTurn: 3, locked: false, unlockTurn: null }])
  })

  it('limits planning to eight orthogonal operations', () => {
    const store = readyStore()
    store.addStep(0, -1)
    store.addStep(0, -1)
    for (let i = 0; i < 6; i++) store.addStep(1, 0)
    expect(store.getSnapshot().actions).toHaveLength(8)
    store.addStep(0, 1)
    expect(store.getSnapshot().actions).toHaveLength(8)
    store.undo()
    expect(store.getSnapshot().actions).toHaveLength(7)
  })

  it('empties a Warp the first time the route crosses it', () => {
    const store = readyStore()
    store.addStep(0, -1)
    store.addStep(0, -1)
    store.addStep(0, 1)
    store.addStep(0, -1)
    const flags = store.getSnapshot().actions.map(action => action.type === 'move' ? action.flag : null)
    expect(flags).toEqual(['bash', 'bash', 'blank', 'blank'])
    expect(store.plannedFlagCounts().bash).toBe(2)
  })

  it('predicts Bash damage from the planned endpoint', () => {
    const store = readyStore()
    store.addStep(0, -1)
    store.addStep(0, -1)
    const state = store.getSnapshot()
    const preview = { ...state, player: { ...state.player, pos: store.plannedPosition() } }
    expect(predictedDamage(preview).B01).toBe(2)
  })
})

describe('turn resolution', () => {
  it('fires one Bash preset step per Bash Flag and advances the turn', async () => {
    const store = readyStore()
    store.addStep(0, -1)
    store.addStep(0, -1)
    await store.executeTurn()
    const state = store.getSnapshot()
    expect(state.enemies[0].robustness).toBe(34)
    expect(state.turn).toBe(2)
    expect(state.actions).toHaveLength(0)
    expect(state.phase).toBe('planning')
  })

  it('advances independent Core counters and leaves FOCUS ready at threshold', async () => {
    const store = readyStore()
    const state = store.getSnapshot()
    state.flags[7][8] = 'core'
    state.flags[7][9] = 'core'
    store.addStep(1, 0)
    store.addStep(1, 0)
    await store.executeTurn()
    expect(state.player.focusReady).toBe(true)
    expect(state.player.buffs.find(buff => buff.id === 'focus')?.counter).toBe(0)
    expect(state.player.buffs.find(buff => buff.id === 'repair')?.counter).toBe(2)
  })

  it('persists Overload charges across turns', async () => {
    const store = readyStore()
    store.getSnapshot().player.overload = 4
    await store.executeTurn()
    expect(store.getSnapshot().player.overload).toBe(4)
  })

  it('spends one action on Overload, switches Bash and releases collected Bash immediately', () => {
    const store = readyStore()
    const state = store.getSnapshot()
    state.player.overload = 5
    store.addStep(0, -1)
    store.addStep(0, -1)
    const before = state.enemies[0].robustness
    store.useOverload()
    expect(state.player.activeBash).toBe(1)
    expect(state.player.overload).toBe(0)
    expect(store.getSnapshot().actions).toHaveLength(3)
    expect(state.enemies[0].robustness).toBeLessThan(before)
  })

  it('opens escape when Warden Robustness reaches zero', async () => {
    const store = readyStore()
    const state = store.getSnapshot()
    state.enemies[0].robustness = 1
    state.enemies[0].block = 0
    for (const enemy of state.enemies.slice(1)) enemy.robustness = 0
    store.addStep(0, -1)
    await store.executeTurn()
    expect(store.getSnapshot().phase).toBe('victory')
  })

  it('eliminates the process when Sanity reaches zero', async () => {
    const store = readyStore()
    const state = store.getSnapshot()
    state.player.sanity = 1
    state.enemies[0].pos = { x: 7, y: 6 }
    state.enemies[0].route = [{ x: 8, y: 6 }]
    state.flags[6][8] = 'bash'
    await store.executeTurn()
    expect(state.player.sanity).toBe(0)
    expect(store.getSnapshot().phase).toBe('gameover')
  })
})

describe('enemy operation planning', () => {
  it('lets an adjacent Warden collect its current Warp instead of stalling', () => {
    const state = createInitialState()
    state.enemies[0].pos = { x: 7, y: 6 }
    state.flags[6][7] = 'bash'
    enemyRoutes(state)
    expect(state.enemies[0].route).toEqual([{ x: 7, y: 6 }])
  })
})

describe('method-based Bash attacks', () => {
  it('caps releases by Bash collected, remaining AP and IV', () => {
    const state = createInitialState()
    state.actions = Array.from({ length: 8 }, (_, index) => ({
      type: 'move' as const,
      to: { x: index, y: 0 },
      flag: index < 4 ? 'bash' as const : 'core' as const,
    }))
    expect(releaseCount(state)).toBe(0)
    state.actions = state.actions.slice(0, 4)
    expect(releaseCount(state)).toBe(4)
    state.actions = [...state.actions, { type: 'move', to: { x: 4, y: 0 }, flag: 'core' }]
    expect(releaseCount(state)).toBe(3)
  })

  it('uses a 5×5 VECTOR square excluding its center', () => {
    const step = BASH_PRESETS[0].steps[0]
    expect(inAttackRange({ x: 7, y: 7 }, { x: 9, y: 9 }, step)).toBe(true)
    expect(inAttackRange({ x: 7, y: 7 }, { x: 10, y: 10 }, step)).toBe(false)
    expect(inAttackRange({ x: 7, y: 7 }, { x: 7, y: 7 }, step)).toBe(false)
  })

  it('uses a CoT cross with arm length 5 and excludes diagonals', () => {
    const step = BASH_PRESETS[1].steps[0]
    expect(inAttackRange({ x: 7, y: 7 }, { x: 7, y: 2 }, step)).toBe(true)
    expect(inAttackRange({ x: 7, y: 7 }, { x: 8, y: 6 }, step)).toBe(false)
    expect(inAttackRange({ x: 7, y: 7 }, { x: 7, y: 1 }, step)).toBe(false)
  })

  it('deals Manhattan-scaled damage and deterministic CoT random damage', () => {
    const state = createInitialState()
    const target = state.enemies[0]
    target.pos = { x: 8, y: 6 }
    expect(stepDamage(BASH_PRESETS[0].steps[1], state, target, 1)).toBe(2)
    const first = attackRoll(state, 0, target.id)
    expect(attackRoll(state, 0, target.id)).toBe(first)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThanOrEqual(3)
  })
})

it('releases the complete I–IV VECTOR sequence with four Bash and four AP remaining', async () => {
  const store = readyStore()
  const state = store.getSnapshot()
  state.flags[6][7] = 'bash'
  state.flags[5][7] = 'bash'
  state.flags[5][8] = 'bash'
  state.flags[5][9] = 'bash'
  state.enemies[0].route = []
  state.flags[4][7] = 'blank'
  store.addStep(0, -1)
  store.addStep(0, -1)
  store.addStep(1, 0)
  store.addStep(1, 0)
  expect(releaseCount(store.getSnapshot())).toBe(4)
  await store.executeTurn()
  expect(store.getSnapshot().enemies[0].robustness).toBe(26)
})

it('requires a second Overload request to switch Bash and release damage', () => {
  const store = readyStore()
  const state = store.getSnapshot()
  state.player.overload = 5
  store.addStep(0, -1)
  store.addStep(0, -1)
  const before = store.getSnapshot().enemies[0].robustness
  store.requestOverload()
  expect(store.getSnapshot().overloadArmed).toBe(true)
  expect(store.getSnapshot().player.activeBash).toBe(0)
  expect(store.getSnapshot().attackPreview).toEqual({ presetIndex: 1, stepIndex: 0 })
  expect(store.getSnapshot().enemies[0].robustness).toBe(before)
  store.requestOverload()
  expect(store.getSnapshot().overloadArmed).toBe(false)
  expect(store.getSnapshot().player.activeBash).toBe(1)
  expect(store.getSnapshot().enemies[0].robustness).toBeLessThan(before)
})

it('releases all four Overload methods without any Bash Flags', () => {
  const store = readyStore()
  const state = store.getSnapshot()
  state.player.overload = 5
  const before = state.enemies[0].robustness
  store.useOverload()
  expect(store.getSnapshot().actions).toEqual([{ type: 'overload' }])
  expect(store.getSnapshot().player.activeBash).toBe(1)
  expect(state.enemies[0].robustness).toBeLessThan(before)
})

it('keeps the normal end-of-turn Bash release after Overload', async () => {
  const store = readyStore()
  const state = store.getSnapshot()
  state.player.overload = 5
  store.addStep(0, -1)
  store.useOverload()
  expect(releaseCount(store.getSnapshot())).toBe(1)
  const previousLogIds = new Set(state.log.map(entry => entry.id))
  await store.executeTurn()
  expect(store.getSnapshot().log.some(entry => !previousLogIds.has(entry.id) && entry.text.includes('CoT / OFF'))).toBe(true)
  expect(store.getSnapshot().actions).toHaveLength(0)
})

describe('GDD strategy infrastructure', () => {
  it('uses the same ordered attack sequence for preview and immediate resolution', () => {
    const store = readyStore()
    const state = store.getSnapshot()
    state.player.overload = 5
    store.addStep(0, -1)
    store.addStep(0, -1)
    const planned = store.getSnapshot()
    const before = planned.enemies[0].robustness
    const previewState = {
      ...planned,
      player: { ...planned.player, activeBash: 1, pos: store.plannedPosition() },
      actions: [...planned.actions, { type: 'overload' as const }],
    }
    const hits = predictedSequence(previewState, 1, 4)
    store.requestOverload()
    store.requestOverload()
    expect(store.getSnapshot().enemies[0].robustness, JSON.stringify(hits)).toBe(hits.length ? hits[hits.length - 1].after : before)
  })

  it('drops only changed columns and consumes their public incoming queues', () => {
    const state = createInitialState()
    const untouched = state.flags.map(row => row[6])
    const untouchedIncoming = [...state.incoming[6]]
    const changedIncoming = [...state.incoming[7]]
    const next = state.incoming[7][0]
    state.flags[14][7] = 'blank'
    refillBoard(state, () => 0.5, new Set([7]))
    expect(state.flags.map(row => row[6])).toEqual(untouched)
    expect(state.incoming[6]).toEqual(untouchedIncoming)
    expect(state.incoming[7]).toHaveLength(15)
    expect(state.incoming[7]).not.toEqual(changedIncoming)
    expect(state.flags.some(row => row[7] === next)).toBe(true)
  })
})

describe('Warden boss protocol', () => {
  it('keeps a scheduled Curtain fixed while the player moves', async () => {
    const store = readyStore()
    store.addStep(1, 0)
    await store.executeTurn()
    expect(store.getSnapshot().player.pos).toEqual({ x: 8, y: 7 })
    expect(store.getSnapshot().curtains[0]).toMatchObject({ axis: 'column', index: 7, fireTurn: 3, locked: false })
  })

  it('seals the forecast column for exactly one planning turn', async () => {
    const store = readyStore()
    await store.executeTurn()
    await store.executeTurn()
    expect(store.getSnapshot().curtains[0].locked).toBe(false)
    await store.executeTurn()
    expect(store.getSnapshot().turn).toBe(4)
    expect(store.getSnapshot().curtains[0]).toMatchObject({ index: 7, locked: true, unlockTurn: 4 })
    store.addStep(0, -1)
    expect(store.getSnapshot().actions).toHaveLength(0)
    expect(store.getSnapshot().message).toContain('sealed')
    await store.executeTurn()
    expect(store.getSnapshot().curtains).toHaveLength(1)
    expect(store.getSnapshot().curtains[0]).toMatchObject({ fireTurn: 6, locked: false })
  })

  it('Breakdown swaps Desire, Security and Soul sets at half Robustness', async () => {
    const store = readyStore()
    const state = store.getSnapshot()
    state.enemies[0].robustness = 19
    state.enemies[0].route = []
    store.addStep(0, -1)
    store.addStep(0, -1)
    await store.executeTurn()
    const boss = store.getSnapshot().enemies[0]
    expect(boss.stage).toBe(2)
    expect(boss.desireName).toBe('OVERTURE')
    expect(boss.desire).toEqual([4, 5, 7])
    expect(boss.securityName).toBe('DEADLOCK')
    expect(boss.securityPerFlag).toBe(3)
    expect(boss.soulName).toBe('REWRITE')
    expect(boss.soulThreshold).toBe(2)
    expect(store.getSnapshot().log.some(entry => entry.text.includes('BREAKDOWN / Stage II'))).toBe(true)
  })

  it('Stage II schedules a dual-axis Curtain with the same countdown', () => {
    const state = createInitialState()
    const boss = state.enemies[0]
    boss.stage = 2
    state.curtains = []
    scheduleCurtains(state, 6)
    expect(state.curtains).toHaveLength(2)
    expect(new Set(state.curtains.map(curtain => curtain.axis))).toEqual(new Set(['column', 'row']))
    expect(state.curtains.every(curtain => curtain.fireTurn === 6 && !curtain.locked)).toBe(true)
  })
})


describe('rebalanced encounter and player forecast', () => {
  it('allocates half of generated Warps to Blank while preserving a complete weight table', () => {
    expect(FLAG_WEIGHTS.find(([kind]) => kind === 'blank')?.[1]).toBe(50)
    expect(FLAG_WEIGHTS.reduce((total, [, weight]) => total + weight, 0)).toBe(100)
  })

  it('gives the Warden broad rectangular coverage without changing square attacks', () => {
    const rectangle = { amount: 2, range: 6, shape: 'rectangle' as const, width: 1 }
    const square = { amount: 2, range: 3, shape: 'square' as const }
    expect(desireInRange({ x: 7, y: 4 }, { x: 1, y: 5 }, rectangle)).toBe(true)
    expect(desireInRange({ x: 7, y: 4 }, { x: 1, y: 6 }, rectangle)).toBe(false)
    expect(desireInRange({ x: 7, y: 4 }, { x: 4, y: 7 }, square)).toBe(true)
    expect(desireInRange({ x: 7, y: 4 }, { x: 3, y: 7 }, square)).toBe(false)
  })

  it('predicts each incoming Desire step with route positions and Block', () => {
    const state = createInitialState()
    for (const enemy of state.enemies.slice(1)) enemy.robustness = 0
    const boss = state.enemies[0]
    boss.pos = { x: 7, y: 6 }
    boss.route = [{ x: 7, y: 6 }, { x: 7, y: 5 }]
    state.flags[6][7] = 'bash'
    state.flags[5][7] = 'bash'
    state.player.block = 1
    const counters = state.player.buffs.map(buff => buff.counter)
    const hits = predictedEnemySequence(state)
    expect(hits.map(hit => hit.dealt)).toEqual([2, 3])
    expect(hits.every(hit => hit.origin.x === 7 && hit.origin.y === 5)).toBe(true)
    expect(hits[hits.length - 1].after).toBe(55)
    expect(state.player.buffs.map(buff => buff.counter)).toEqual(counters)
  })

  it('clears the gray trail when the turn completes', async () => {
    const store = readyStore()
    store.addStep(0, -1)
    store.addStep(0, -1)
    await store.executeTurn()
    expect(store.getSnapshot().playerTrail).toEqual([{ x: 7, y: 5 }])
    expect(store.getSnapshot().actions).toHaveLength(0)
  })
})


describe('live HP resource previews', () => {
  it('previews player PRIVILEGE and REPAIR without mutating live counters', () => {
    const state = createInitialState()
    state.actions = [
      { type: 'move', to: { x: 8, y: 7 }, flag: 'privilege' },
      { type: 'move', to: { x: 9, y: 7 }, flag: 'core' },
    ]
    state.player.sanity = 50
    state.player.buffs.find(buff => buff.id === 'repair')!.counter = 2
    const preview = predictedPlayerResources(state)
    expect(preview.privilegeGain).toBe(1)
    expect(preview.healing).toBe(2)
    expect(preview.blockAfterResources).toBe(1)
    expect(state.player.buffs.find(buff => buff.id === 'repair')!.counter).toBe(2)
  })

  it('previews enemy SECURITY and Soul recovery from the exposed route', () => {
    const state = createInitialState()
    const boss = state.enemies[0]
    boss.robustness = 30
    boss.route = [{ x: 7, y: 5 }, { x: 7, y: 6 }]
    boss.soulCounter = 1
    state.flags[5][7] = 'privilege'
    state.flags[6][7] = 'core'
    const preview = predictedEnemyResources(state, boss.id)
    expect(preview.securityGain).toBe(2)
    expect(preview.recovery).toBe(4)
    expect(preview.soulCounterAfter).toBe(0)
  })
})


it('applies REPAIR after the enemy phase and keeps it out of the damage forecast', async () => {
  const store = readyStore()
  const state = store.getSnapshot()
  state.player.sanity = 50
  state.player.buffs.find(buff => buff.id === 'repair')!.counter = 2
  state.flags[6][7] = 'core'
  store.addStep(0, -1)
  const predicted = predictedEnemySequence(store.getSnapshot())
  expect(predicted.length).toBeGreaterThan(0)
  expect(predicted[0].before).toBe(50)
  const lost = predicted.reduce((total, hit) => total + hit.dealt, 0)
  await store.executeTurn()
  const after = store.getSnapshot()
  expect(after.player.sanity).toBe(50 - lost + 2)
  expect(after.pendingRepair).toBe(0)
  expect(after.incomingForecast).toBeNull()
  expect(after.outgoingForecast).toBeNull()
})

it('guarantees only the Warden a baseline Desire step without Bash', () => {
  const state = createInitialState()
  expect(desireReleaseCount(state.enemies[0], 0)).toBe(1)
  state.enemies[0].stage = 2
  expect(desireReleaseCount(state.enemies[0], 0)).toBe(1)
  expect(desireReleaseCount(state.enemies[1], 0)).toBe(0)
  expect(desireReleaseCount(state.enemies[2], 0)).toBe(0)
})


it('advances HP previews through attack and enemy events before clearing them', async () => {
  const store = readyStore()
  store.getSnapshot().reducedMotion = false
  store.addStep(0, -1)
  store.addStep(0, -1)
  const waitFor = async (predicate: () => boolean) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (predicate()) return
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error('Timed out waiting for battle event')
  }
  const execution = store.executeTurn()
  await waitFor(() => store.getSnapshot().playerAttackResolved)
  expect(store.getSnapshot().playerAttackResolved).toBe(true)
  await waitFor(() => Object.keys(store.getSnapshot().enemyResourcePreviews).length > 0)
  expect(store.getSnapshot().enemyResourcePreviews.B01).toBeDefined()
  await waitFor(() => store.getSnapshot().enemyPhaseIndex > 0)
  await execution
  expect(store.getSnapshot().enemyPhaseIndex).toBe(0)
  expect(store.getSnapshot().playerAttackResolved).toBe(false)
  expect(store.getSnapshot().enemyResourcePreviews).toEqual({})
})
