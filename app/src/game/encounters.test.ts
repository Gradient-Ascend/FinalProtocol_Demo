import { describe, expect, it } from 'vitest'
import { ENEMY_DEFINITIONS, EXPLICIT_FLAGS, FLAG_WEIGHTS, OVERLOAD_THRESHOLD, PLAYER_FUNCTIONS, PLAYER_SANITY, WALLS } from './battle-config'
import { createInitialState } from './battle-rules'
import { ENCOUNTERS, WARDEN_ENCOUNTER, encounterById } from './encounters'
import type { Encounter } from './encounters'
import { DEFAULT_TUNING, applyWeight, tuningFor, weightSanity } from './tuning'
import script from '../story/script.json'

const IDS = ['0.B', '1.1', '1.2', '1.3', '1.B', '2.1', '2.2', '2.3', '2.B', '3.1', '3.2', '3.3', '3.B']
const CAMPAIGN = IDS.slice(1).map(id => ENCOUNTERS[id])
const key = ([x, y]: [number, number]): string => `${x},${y}`

// Every open cell reachable from the player's start by orthogonal moves.
function reachable(encounter: Encounter): number {
  const walls = new Set(encounter.walls.map(key))
  const seen = new Set([key([encounter.playerStart.x, encounter.playerStart.y])])
  const queue: [number, number][] = [[encounter.playerStart.x, encounter.playerStart.y]]
  while (queue.length) {
    const [x, y] = queue.pop()!
    for (const next of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
      if (next[0] < 0 || next[1] < 0 || next[0] > 14 || next[1] > 14 || walls.has(key(next)) || seen.has(key(next))) continue
      seen.add(key(next))
      queue.push(next)
    }
  }
  return seen.size
}

describe('encounter table', () => {
  it('holds the prologue and all twelve campaign battles', () => {
    expect(Object.keys(ENCOUNTERS).sort()).toEqual([...IDS].sort())
    for (const id of IDS) expect(encounterById(id).id).toBe(id)
    expect(() => encounterById('4.1')).toThrow()
  })

  it('builds the Warden from the constants the game shipped with', () => {
    expect(encounterById('0.B')).toBe(WARDEN_ENCOUNTER)
    expect(WARDEN_ENCOUNTER).toMatchObject({ layer: 0, kind: 'prologue', god: 'none', mechanic: 'curtain', playerStart: { x: 7, y: 7 } })
    expect(WARDEN_ENCOUNTER.enemies).toBe(ENEMY_DEFINITIONS)
    expect(WARDEN_ENCOUNTER.walls).toBe(WALLS)
    expect(WARDEN_ENCOUNTER.explicitFlags).toBe(EXPLICIT_FLAGS)
    expect(WARDEN_ENCOUNTER.flagWeights).toBe(FLAG_WEIGHTS)
    // The Warden has no TRACE.
    expect(WARDEN_ENCOUNTER.trace).toBeUndefined()
  })

  it('gives each layer three skirmishes and a boss under the names in the script', () => {
    const gods = ['none', 'grove', 'court', 'carcosa']
    const mechanics = [undefined, 'brood', 'articles', 'undisclosed']
    for (const encounter of CAMPAIGN) {
      const [layer, node] = encounter.id.split('.')
      expect(encounter.layer).toBe(Number(layer))
      expect(encounter.kind).toBe(node === 'B' ? 'boss' : 'skirmish')
      expect(encounter.god).toBe(gods[encounter.layer])
      expect(encounter.mechanic).toBe(node === 'B' ? mechanics[encounter.layer] : undefined)
      expect(encounter.trace).toBeGreaterThan(0)
      const text = script.layers[encounter.layer].nodes.find(candidate => candidate.id === encounter.id)
      expect(encounter.name).toBe(text?.name)
      const eliteCfg = script.layers[encounter.layer].elite
      const names: string[] = [
        ...Object.values(script.layers[encounter.layer].enemies ?? {}),
        ...(eliteCfg ? [eliteCfg.name] : []),
      ]
      for (const enemy of encounter.enemies) {
        if (enemy.bossStages) expect(enemy.name).toBe(encounter.name)
        else expect(names).toContain(enemy.name)
      }
    }
  })

  it('draws each god\'s whole sign and walls only points of it', () => {
    const points: Record<string, number> = { grove: 32, court: 29, carcosa: 18 }
    for (const encounter of CAMPAIGN) {
      const sigil = new Set(encounter.sigil.map(key))
      expect(sigil.size).toBe(points[encounter.god])
      expect(encounter.sigil).toHaveLength(points[encounter.god])
      for (const wall of encounter.walls) expect(sigil.has(key(wall))).toBe(true)
      // A boss fights on the whole sign, a skirmish on one part of it.
      if (encounter.kind === 'boss') expect(encounter.walls).toHaveLength(encounter.sigil.length)
      else expect(encounter.walls.length).toBeLessThan(encounter.sigil.length)
    }
    // The three parts of a sign are its whole.
    for (const layer of [1, 2, 3]) {
      const parts = CAMPAIGN.filter(encounter => encounter.layer === layer && encounter.kind === 'skirmish')
      const whole = CAMPAIGN.find(encounter => encounter.layer === layer && encounter.kind === 'boss')!
      const union = parts.flatMap(encounter => encounter.walls.map(key))
      expect(union).toHaveLength(whole.sigil.length)
      expect(new Set(union)).toEqual(new Set(whole.sigil.map(key)))
    }
    // COURT leaves exactly the 196 open cells of the opening's patch grid.
    expect(225 - ENCOUNTERS['2.B'].walls.length).toBe(196)
  })

  it('keeps every board playable: units on open cells, one connected field, whole Flag weights', () => {
    for (const encounter of IDS.map(id => ENCOUNTERS[id])) {
      const walls = new Set(encounter.walls.map(key))
      expect(walls.size, encounter.id).toBe(encounter.walls.length)
      for (const [x, y] of [...encounter.walls, ...encounter.sigil]) {
        expect(x >= 0 && y >= 0 && x < 15 && y < 15, encounter.id).toBe(true)
      }
      const units = [encounter.playerStart, ...encounter.enemies.map(enemy => enemy.pos)].map(pos => key([pos.x, pos.y]))
      expect(new Set(units).size, encounter.id).toBe(units.length)
      for (const unit of units) expect(walls.has(unit), `${encounter.id} ${unit}`).toBe(false)
      expect(new Set(encounter.enemies.map(enemy => enemy.id)).size, encounter.id).toBe(encounter.enemies.length)
      expect(reachable(encounter), encounter.id).toBe(225 - walls.size)
      const weights = encounter.flagWeights ?? FLAG_WEIGHTS
      expect(weights.map(([kind]) => kind).sort(), encounter.id).toEqual(['bash', 'blank', 'core', 'overload', 'privilege'])
      expect(weights.reduce((total, [, weight]) => total + weight, 0), encounter.id).toBe(100)
      expect(encounter.enemies.filter(enemy => enemy.bossStages).length, encounter.id).toBe(encounter.kind === 'skirmish' ? 0 : 1)
    }
  })

  it('carries each boss rule in the boss definition', () => {
    const [young] = ENCOUNTERS['1.B'].enemies
    expect(young.brood).toMatchObject({ limit: 3, spawn: { name: 'DESIRE / AGAIN', behavior: 'hunter' } })
    expect(young.brood!.spawn.robustness).toBeLessThan(Math.min(...ENCOUNTERS['1.1'].enemies.map(enemy => enemy.robustness)))
    // Stage II lowers the Soul threshold by 1.
    expect(young.bossStages![1].soulThreshold).toBe(young.bossStages![0].soulThreshold - 1)
    const [queen, ...court] = ENCOUNTERS['2.B'].enemies
    expect(queen.bossStages).toHaveLength(2)
    // CHANGE PLACES needs a Geek to change places with.
    expect(court.length).toBeGreaterThan(0)
    const [king] = ENCOUNTERS['3.B'].enemies
    expect(king).toMatchObject({ hidden: true, undisclosed: true })
    expect(king.privilegeSkill).toMatchObject({ kind: 'mystery' })
    if (king.privilegeSkill.kind === 'mystery') expect(king.privilegeSkill.floor).toBeGreaterThan(0)
    // Act II: the floor is 2 and Desire is larger.
    expect(king.bossStages![1].desireFloor).toBe(2)
    expect(Math.max(...king.bossStages![1].desire)).toBeGreaterThan(Math.max(...king.bossStages![0].desire))
    for (const boss of [young, queen]) {
      expect(boss.hidden ?? boss.undisclosed).toBeUndefined()
      expect(boss.privilegeSkill.kind).not.toBe('mystery')
    }
  })
})

describe('createInitialState on an encounter', () => {
  it('builds every encounter: walls, start, roster, rule and public routes', () => {
    for (const encounter of IDS.map(id => ENCOUNTERS[id])) {
      const state = createInitialState(false, false, undefined, encounter)
      expect(state.encounter).toBe(encounter)
      expect(state.phase).toBe('title')
      expect(state.player.pos).toEqual(encounter.playerStart)
      expect(state.playerTrail).toEqual([encounter.playerStart])
      expect(state.enemies.map(enemy => enemy.id)).toEqual(encounter.enemies.map(enemy => enemy.id))
      const walls = new Set(encounter.walls.map(key))
      state.walls.forEach((row, y) => row.forEach((solid, x) => expect(solid).toBe(walls.has(key([x, y])))))
      expect(state.mechanic?.kind).toBe(encounter.mechanic)
      expect(state.trace).toBe(encounter.trace ?? null)
      // Curtains belong to the Warden alone.
      expect(state.curtains.length > 0).toBe(encounter.mechanic === 'curtain')
      for (const enemy of state.enemies) {
        for (const cell of enemy.route) expect(state.walls[cell.y][cell.x], `${encounter.id} ${enemy.id}`).toBe(false)
      }
      expect(state.tuning).toEqual(DEFAULT_TUNING)
      expect(state.player.sanity).toBe(DEFAULT_TUNING.maxSanity)
    }
  })

  it('draws the board from the encounter\'s seed and its own Flag weights', () => {
    const encounter = ENCOUNTERS['1.2']
    const first = createInitialState(false, false, undefined, encounter)
    const again = createInitialState(false, false, undefined, encounter)
    const reseeded = createInitialState(false, false, undefined, { ...encounter, seed: encounter.seed + 1 })
    expect(again.flags).toEqual(first.flags)
    expect(again.incoming).toEqual(first.incoming)
    expect(reseeded.flags).not.toEqual(first.flags)
    // A board with no Privilege weight has no Privilege Flag on it.
    const dry = createInitialState(false, false, undefined, {
      ...encounter, flagWeights: [['bash', 40], ['privilege', 0], ['core', 5], ['overload', 5], ['blank', 50]],
    })
    expect(dry.flags.flat()).not.toContain('privilege')
    expect(dry.incoming.flat()).not.toContain('privilege')
    const explicit = createInitialState(false, false, undefined, { ...encounter, explicitFlags: { '7,11': 'overload', '6,12': 'core' } })
    expect(explicit.flags[11][7]).toBe('overload')
    expect(explicit.flags[12][6]).toBe('core')
  })

  it('takes Sanity and the tuned numbers from what the run carries', () => {
    const tuning = tuningFor(['repair_threshold', 'repair_heal', 'firewall_threshold', 'firewall_privilege', 'focus_start', 'max_sanity'])
    const state = createInitialState(false, false, undefined, ENCOUNTERS['2.1'], { sanity: 17, tuning })
    expect(state.tuning).toEqual(tuning)
    expect(state.tuning).not.toBe(tuning)
    expect(state.player.sanity).toBe(17)
    expect(state.player.maxSanity).toBe(40)
    // PRIVILEGE, Overload charge and Core counters start from nothing each battle.
    expect(state.player).toMatchObject({ block: 0, overload: 0, focusReady: false })
    const buffs = Object.fromEntries(state.player.buffs.map(buff => [buff.id, buff]))
    expect(buffs.repair).toMatchObject({ counter: 0, threshold: 2, description: '+4 Sanity' })
    expect(buffs.firewall).toMatchObject({ counter: 0, threshold: 3, description: '+5 PRIVILEGE' })
    // FOCUS begins one tick from ready.
    expect(buffs.focus).toMatchObject({ counter: 1, threshold: 2 })
  })

  it('never starts a battle above the maximum, at zero, or on a number that is not one', () => {
    const start = (sanity: number) => createInitialState(false, false, undefined, ENCOUNTERS['1.1'], { sanity, tuning: DEFAULT_TUNING }).player.sanity
    expect(start(99)).toBe(36)
    expect(start(0)).toBe(1)
    expect(start(-5)).toBe(1)
    expect(start(Number.NaN)).toBe(36)
    expect(start(12.4)).toBe(12)
  })
})

describe('tuning', () => {
  it('defaults to the numbers the exported constants still hold', () => {
    expect(DEFAULT_TUNING).toEqual({
      maxSanity: PLAYER_SANITY, privilegePerFlag: PLAYER_FUNCTIONS.privilegePerFlag,
      repairHeal: PLAYER_FUNCTIONS.repairHeal, repairThreshold: 3,
      focusThreshold: 2, focusStart: 0,
      firewallThreshold: 4, firewallPrivilege: PLAYER_FUNCTIONS.firewallPrivilege,
      overloadThreshold: OVERLOAD_THRESHOLD,
    })
    expect(DEFAULT_TUNING).toMatchObject({ maxSanity: 36, privilegePerFlag: 2, repairHeal: 3, firewallPrivilege: 3, overloadThreshold: 5 })
  })

  it('applies every weight in the script, and each changes only its own number', () => {
    const changes: Record<string, object> = {
      repair_threshold: { repairThreshold: 2 }, repair_heal: { repairHeal: 4 },
      firewall_threshold: { firewallThreshold: 3 }, firewall_privilege: { firewallPrivilege: 5 },
      focus_start: { focusStart: 1 }, shell_privilege: { privilegePerFlag: 3 },
      overload_threshold: { overloadThreshold: 4 }, max_sanity: { maxSanity: 40 },
      patch: {},
    }
    expect(script.weights.map(weight => weight.id).sort()).toEqual(Object.keys(changes).sort())
    for (const [id, change] of Object.entries(changes)) {
      const before = { ...DEFAULT_TUNING }
      expect(applyWeight(DEFAULT_TUNING, id), id).toEqual({ ...DEFAULT_TUNING, ...change })
      expect(DEFAULT_TUNING).toEqual(before)
    }
    expect(applyWeight(DEFAULT_TUNING, 'no_such_weight')).toEqual(DEFAULT_TUNING)
    expect(weightSanity('max_sanity')).toBe(4)
    expect(weightSanity('patch')).toBe(8)
    expect(weightSanity('repair_heal')).toBe(0)
  })
})
