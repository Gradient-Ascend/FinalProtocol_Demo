import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BattleStore } from './battle-store'
import { createInitialState } from './battle-rules'
import type { BattleState } from './battle-types'
import golden from './warden.golden.json'

// warden.golden.json was written by the code as it stood before encounters,
// tuning and boss rules existed: the Warden's first state, a fresh store, and
// two scripted battles turn by turn. The prologue must still be that battle.

// Only the fields that existed then, in the order they were written.
function legacy(state: BattleState, reference: object): unknown {
  const fields = state as unknown as Record<string, unknown>
  return Object.fromEntries(Object.keys(reference).map(key => [key, fields[key]]))
}

const PATTERN: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, 0], [0, -1], [-1, 0], [0, 1]]

// A fixed walk: three to five moves a turn, each the first direction of a
// rotating list the board accepts, and Overload the moment it is charged.
async function playWarden(store: BattleStore, turns: number) {
  const logs: string[] = []
  const seen = new Set<number>()
  store.subscribe(() => {
    for (const entry of store.getSnapshot().log) {
      if (!seen.has(entry.id)) { seen.add(entry.id); logs.push(entry.text) }
    }
  })
  const played: unknown[] = []
  let cursor = 0
  for (let turn = 0; turn < turns && store.getSnapshot().phase === 'planning'; turn++) {
    const moves = 3 + (turn % 3)
    for (let i = 0; i < moves; i++) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const before = store.getSnapshot().actions.length
        store.addStep(...PATTERN[(cursor + attempt) % PATTERN.length])
        if (store.getSnapshot().actions.length > before) break
      }
      cursor++
    }
    if (store.getSnapshot().player.overload >= 5) store.useOverload()
    await store.executeTurn()
    const state = store.getSnapshot()
    played.push(JSON.parse(JSON.stringify({
      turn: state.turn, phase: state.phase, message: state.message,
      player: state.player,
      enemies: state.enemies.map(enemy => ({
        id: enemy.id, pos: enemy.pos, robustness: enemy.robustness, block: enemy.block,
        soulCounter: enemy.soulCounter, stage: enemy.stage, route: enemy.route, live: enemy.live,
      })),
      curtains: state.curtains,
    })))
  }
  return { turns: played, logs, final: store.getSnapshot() }
}

describe('the Warden battle is the one that shipped', () => {
  if (process.env.UPDATE_GOLDEN) {
    it('re-baselines warden.golden.json when UPDATE_GOLDEN is set', async () => {
      const initial = legacy(createInitialState(), golden.initial)
      const storeSnap = legacy(new BattleStore().getSnapshot(), golden.store)
      const playthroughs = []
      for (const playthrough of golden.playthroughs) {
        const store = new BattleStore()
        store.getSnapshot().reducedMotion = true
        store.getSnapshot().player.overload = playthrough.setup.overload
        store.getSnapshot().enemies[0].robustness = playthrough.setup.robustness
        store.start()
        const played = await playWarden(store, 9)
        playthroughs.push({
          setup: playthrough.setup,
          turns: played.turns,
          logs: played.logs,
          final: legacy(played.final, playthrough.final),
        })
      }
      const nextGolden = {
        note: 'The Warden battle under the standardized enemy-kit rules.',
        initial,
        store: storeSnap,
        playthroughs,
      }
      writeFileSync(fileURLToPath(new URL('./warden.golden.json', import.meta.url)), JSON.stringify(nextGolden))
    }, 30000)
  }

  it('createInitialState() with no arguments is today\'s state, byte for byte', () => {
    const state = createInitialState()
    expect(JSON.stringify(legacy(state, golden.initial))).toBe(JSON.stringify(golden.initial))
  })

  it('new BattleStore() opens on the same state', () => {
    const state = new BattleStore().getSnapshot()
    expect(JSON.stringify(legacy(state, golden.store))).toBe(JSON.stringify(golden.store))
  })

  it.each(golden.playthroughs.map((playthrough, index) => [index, playthrough] as const))(
    'scripted battle %i resolves turn for turn as it did',
    async (_index, playthrough) => {
      const store = new BattleStore()
      store.getSnapshot().reducedMotion = true
      store.getSnapshot().player.overload = playthrough.setup.overload
      store.getSnapshot().enemies[0].robustness = playthrough.setup.robustness
      store.start()
      const played = await playWarden(store, 9)
      expect(played.turns).toEqual(playthrough.turns)
      expect(played.logs).toEqual(playthrough.logs)
      expect(JSON.stringify(legacy(played.final, playthrough.final))).toBe(JSON.stringify(playthrough.final))
    },
    30000,
  )
})
