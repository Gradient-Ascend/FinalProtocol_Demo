import { describe, expect, it } from 'vitest'
import { BattleStore } from './battle-store'
import { coordKey, createInitialState, enemyRoutes, predictedDamage } from './battle-rules'
import { attackRoll, inAttackRange, releaseCount, stepDamage } from './attack-methods'
import { BASH_PRESETS } from './battle-config'

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

  it('creates a 15×15 board with two exposed hostile routes', () => {
    const state = createInitialState()
    expect(state.flags).toHaveLength(15)
    expect(state.flags[0]).toHaveLength(15)
    expect(state.enemies).toHaveLength(2)
    expect(state.enemies.every(enemy => enemy.route.length > 0)).toBe(true)
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

  it('predicts Bash damage from the planned endpoint', () => {
    const store = readyStore()
    store.addStep(0, -1)
    store.addStep(0, -1)
    const state = store.getSnapshot()
    const preview = { ...state, player: { ...state.player, pos: store.plannedPosition() } }
    expect(predictedDamage(preview).E01).toBe(2)
  })
})

describe('turn resolution', () => {
  it('fires one Bash preset step per Bash Flag and advances the turn', async () => {
    const store = readyStore()
    store.addStep(0, -1)
    store.addStep(0, -1)
    await store.executeTurn()
    const state = store.getSnapshot()
    expect(state.enemies[0].robustness).toBe(10)
    expect(state.turn).toBe(2)
    expect(state.actions).toHaveLength(0)
    expect(store.getSnapshot().phase).toBe('planning')
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
    const before = state.enemies.map(enemy => enemy.robustness)
    store.useOverload()
    expect(state.player.activeBash).toBe(1)
    expect(state.player.overload).toBe(0)
    expect(store.getSnapshot().actions).toHaveLength(3)
    expect(state.enemies.some((enemy, index) => enemy.robustness < before[index])).toBe(true)
  })

  it('opens escape when every hostile Robustness reaches zero', async () => {
    const store = readyStore()
    const state = store.getSnapshot()
    state.enemies[0].robustness = 1
    state.enemies[0].block = 0
    state.enemies[1].robustness = 0
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
    state.enemies[1].robustness = 0
    state.flags[6][8] = 'bash'
    await store.executeTurn()
    expect(state.player.sanity).toBe(0)
    expect(store.getSnapshot().phase).toBe('gameover')
  })
})


describe('enemy operation planning', () => {
  it('lets an adjacent hostile collect its current Warp instead of stalling', () => {
    const state = createInitialState()
    state.enemies[0].pos = { x: 7, y: 6 }
    state.enemies[1].robustness = 0
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
  expect(store.getSnapshot().enemies[0].robustness).toBe(1)
})


it('requires a second Overload request to switch Bash and release damage', () => {
  const store = readyStore()
  const state = store.getSnapshot()
  state.player.overload = 5
  store.addStep(0, -1)
  store.addStep(0, -1)
  const before = store.getSnapshot().enemies.map(enemy => enemy.robustness)
  store.requestOverload()
  expect(store.getSnapshot().overloadArmed).toBe(true)
  expect(store.getSnapshot().player.activeBash).toBe(0)
  expect(store.getSnapshot().attackPreview).toEqual({ presetIndex: 1, stepIndex: 0 })
  expect(store.getSnapshot().enemies.map(enemy => enemy.robustness)).toEqual(before)
  store.requestOverload()
  expect(store.getSnapshot().overloadArmed).toBe(false)
  expect(store.getSnapshot().player.activeBash).toBe(1)
  expect(store.getSnapshot().enemies.some((enemy, index) => enemy.robustness < before[index])).toBe(true)
})
