import { beforeAll, describe, expect, it } from 'vitest'
import { createCampaignStore } from '../campaign/campaign-store'
import { BOARD_SIZE } from './battle-config'
import { DEFAULT_MAX_TURNS, fight, playRun, runTable } from './bot'
import type { BattleReport, BotPolicy, RunReport } from './bot'
import { ENCOUNTERS } from './encounters'
import type { Encounter } from './encounters'
import { SIGILS, SIGIL_ART, SIGIL_PARTS, SIGIL_SIZE, isConnected, parseSigil, sigilFor, sigilPart } from './sigils'
import type { Cell, SigilId } from './sigils'

const IDS = ['1.1', '1.2', '1.3', '1.B', '2.1', '2.2', '2.3', '2.B', '3.1', '3.2', '3.3', '3.B']
const CAMPAIGN: Encounter[] = IDS.map(id => ENCOUNTERS[id])
const GODS: SigilId[] = ['grove', 'court', 'carcosa']
// Which two of a layer's three nodes a run breaks.
const PAIRS = [[1, 2], [1, 3], [2, 3]]
const RUN_SEED = 0x5EED

const key = ([x, y]: Cell): string => `${x},${y}`
const keys = (cells: Cell[]): string[] => cells.map(key).sort()

describe('the three signs', () => {
  it('draws each sign on the board\'s own grid with the number of points the spec gives', () => {
    const points: Record<SigilId, number> = { grove: 32, court: 29, carcosa: 18 }
    expect(SIGIL_SIZE).toBe(BOARD_SIZE)
    for (const god of GODS) {
      expect(SIGIL_ART[god], god).toHaveLength(SIGIL_SIZE)
      for (const row of SIGIL_ART[god]) expect(row, god).toMatch(/^[#.]{15}$/)
      expect(SIGILS[god], god).toHaveLength(points[god])
      expect(parseSigil(SIGIL_ART[god])).toEqual(SIGILS[god])
      expect(sigilFor(god)).toBe(SIGILS[god])
    }
    expect(sigilFor('none')).toEqual([])
    // COURT leaves the 196 open cells of the opening's patch grid.
    expect(SIGIL_SIZE * SIGIL_SIZE - SIGILS.court.length).toBe(196)
    // The Court is the same after a half-turn, like a court card.
    expect(keys(SIGILS.court.map(([x, y]): Cell => [14 - x, 14 - y]))).toEqual(keys(SIGILS.court))
  })

  it('reads (x, y) from the top-left and keeps only the points asked for', () => {
    expect(parseSigil(['.#.', '...', '#.#'])).toEqual([[1, 0], [0, 2], [2, 2]])
    expect(parseSigil(['.#.', '...', '#.#'], (_x, y) => y === 2)).toEqual([[0, 2], [2, 2]])
    // The Grove's crown is eight points across the top row.
    expect(SIGILS.grove.filter(([, y]) => y === 0).map(([x]) => x)).toEqual([0, 2, 4, 6, 8, 10, 12, 14])
    // Carcosa's ring is open at the top and its centre is empty.
    expect(SIGILS.carcosa.map(key)).not.toContain('7,0')
    expect(SIGILS.carcosa.filter(([x, y]) => x > 3 && x < 11 && y > 1 && y < 9)).toEqual([])
  })

  it('cuts each sign into three parts that share no point and together are the whole', () => {
    for (const [layer, god] of GODS.entries()) {
      const parts = [1, 2, 3].map(node => sigilPart(`${layer + 1}.${node}`))
      for (const part of parts) expect(part.length).toBeGreaterThan(0)
      const union = parts.flat().map(key)
      expect(new Set(union).size, god).toBe(union.length)
      expect([...union].sort(), god).toEqual(keys(SIGILS[god]))
      expect(sigilPart(`${layer + 1}.B`)).toBe(SIGILS[god])
    }
    // The parts the spec names: hooves and trunk, the Court's rows 5 to 9, Carcosa's tail with the ring's two lowest points.
    expect(keys(SIGIL_PARTS['1.1'])).toEqual(keys(SIGILS.grove.filter(([, y]) => y >= 10)))
    expect(keys(SIGIL_PARTS['2.2'])).toEqual(keys(SIGILS.court.filter(([, y]) => y >= 5 && y <= 9)))
    expect(keys(SIGIL_PARTS['3.1'])).toEqual(keys([[5, 9], [9, 9], [7, 10], [7, 11], [6, 12], [7, 13], [5, 14], [8, 14]]))
    expect(sigilPart('0.B')).toEqual([])
    expect(sigilPart('4.1')).toEqual([])
  })

  it('tells a board that is one field from one with a pocket', () => {
    for (const god of GODS) expect(isConnected(SIGILS[god]), god).toBe(true)
    for (const id of IDS) expect(isConnected(sigilPart(id)), id).toBe(true)
    expect(isConnected([])).toBe(true)
    // A cell walled in on all four sides is a pocket no route can enter.
    expect(isConnected([[7, 6], [6, 7], [8, 7], [7, 8]])).toBe(false)
    // So is a corner cut off by two walls.
    expect(isConnected([[1, 0], [0, 1]])).toBe(false)
    expect(isConnected([[1, 0]])).toBe(true)
  })
})

describe('campaign boards', () => {
  it('leaves the open cells of every map connected', () => {
    for (const encounter of CAMPAIGN) expect(isConnected(encounter.walls), encounter.id).toBe(true)
  })

  it('walls only points of the layer\'s sign: one part for a skirmish, all of it for the boss', () => {
    for (const encounter of CAMPAIGN) {
      const sign = sigilFor(encounter.god)
      expect(encounter.sigil, encounter.id).toBe(sign)
      const points = new Set(sign.map(key))
      for (const wall of encounter.walls) expect(points.has(key(wall)), `${encounter.id} ${key(wall)}`).toBe(true)
      expect(keys(encounter.walls), encounter.id).toEqual(keys(sigilPart(encounter.id)))
      if (encounter.kind === 'boss') expect(encounter.walls).toHaveLength(sign.length)
    }
  })

  it('starts everyone on an open cell, no two together and no Geek beside the player', () => {
    for (const encounter of CAMPAIGN) {
      const walls = new Set(encounter.walls.map(key))
      const starts = [encounter.playerStart, ...encounter.enemies.map(enemy => enemy.pos)]
      for (const pos of starts) {
        expect(pos.x >= 0 && pos.y >= 0 && pos.x < BOARD_SIZE && pos.y < BOARD_SIZE, encounter.id).toBe(true)
        expect(walls.has(key([pos.x, pos.y])), `${encounter.id} ${pos.x},${pos.y}`).toBe(false)
      }
      expect(new Set(starts.map(pos => key([pos.x, pos.y]))).size, encounter.id).toBe(starts.length)
      // Not beside the player, corners included: no one is struck before they have moved.
      for (const enemy of encounter.enemies) {
        const gap = Math.max(Math.abs(enemy.pos.x - encounter.playerStart.x), Math.abs(enemy.pos.y - encounter.playerStart.y))
        expect(gap, `${encounter.id} ${enemy.id}`).toBeGreaterThan(1)
      }
    }
  })

  it('names every unit apart, never as the player, and gives each boss two stages', () => {
    for (const encounter of CAMPAIGN) {
      const ids = encounter.enemies.map(enemy => enemy.id)
      expect(new Set(ids).size, encounter.id).toBe(ids.length)
      expect(ids, encounter.id).not.toContain('P')
      for (const enemy of encounter.enemies) {
        expect(enemy.robustness, `${encounter.id} ${enemy.id}`).toBeGreaterThan(0)
        expect(enemy.desire.length, `${encounter.id} ${enemy.id}`).toBeGreaterThan(0)
        // Every Desire step must be able to land: a floor above the list is a number no one can see.
        expect(enemy.desireFloor ?? 0, `${encounter.id} ${enemy.id}`).toBeLessThanOrEqual(enemy.desire.length)
      }
      const bosses = encounter.enemies.filter(enemy => enemy.bossStages)
      expect(bosses, encounter.id).toHaveLength(encounter.kind === 'boss' ? 1 : 0)
      for (const boss of bosses) expect(boss.bossStages).toHaveLength(2)
    }
  })

  it('makes each layer its own with data alone', () => {
    const share = (encounter: Encounter, kind: string): number => encounter.flagWeights?.find(([flag]) => flag === kind)?.[1] ?? 0
    const layer = (index: number): Encounter[] => CAMPAIGN.filter(encounter => encounter.layer === index)
    // GROVE is abundance: fewer blanks and more Core and Overload than the prologue's board.
    for (const encounter of layer(1)) {
      expect(share(encounter, 'blank'), encounter.id).toBeLessThan(50)
      expect(share(encounter, 'core'), encounter.id).toBeGreaterThan(10)
      expect(share(encounter, 'overload'), encounter.id).toBeGreaterThan(6)
    }
    // Its Geeks collect, and play by the prologue's rule: no Bash Flag, no strike.
    expect(layer(1).filter(encounter => encounter.enemies.some(enemy => enemy.behavior === 'collector')).length).toBeGreaterThanOrEqual(3)
    for (const encounter of layer(1)) {
      for (const enemy of encounter.enemies.filter(candidate => !candidate.bossStages)) expect(enemy.desireFloor ?? 0, encounter.id).toBe(0)
    }
    // COURT disrupts and purges.
    expect(layer(2).filter(encounter => encounter.enemies.some(enemy => enemy.behavior === 'disruptor')).length).toBeGreaterThanOrEqual(3)
    // CARCOSA has the fewest walls and the longest reach.
    const walls = (index: number): number => layer(index).filter(encounter => encounter.kind === 'skirmish').reduce((total, encounter) => total + encounter.walls.length, 0)
    expect(walls(3)).toBeLessThan(Math.min(walls(1), walls(2)))
    const reach = (index: number): number => Math.max(...layer(index).flatMap(encounter => encounter.enemies.filter(enemy => !enemy.bossStages).map(enemy => enemy.desireRange)))
    expect(reach(3)).toBeGreaterThanOrEqual(Math.max(reach(1), reach(2)))
    // Its boss is mild in Stage I and the hardest thing in the game in Stage II.
    const stageTwo = (id: string): number => ENCOUNTERS[id].enemies[0].bossStages![1].desire.slice(0, 2).reduce((total, amount) => total + amount, 0)
    const [king] = ENCOUNTERS['3.B'].enemies
    expect(king.bossStages![0].desire[0]).toBeLessThanOrEqual(Math.min(...['0.B', '1.B', '2.B'].map(id => ENCOUNTERS[id].enemies[0].bossStages![0].desire[0])))
    expect(stageTwo('3.B')).toBeGreaterThan(Math.max(stageTwo('0.B'), stageTwo('1.B'), stageTwo('2.B')))
  })
})

function battleRow(report: BattleReport): string {
  return [
    report.encounter.padEnd(5), report.policy.padEnd(9), report.result.padEnd(9), String(report.turns).padStart(5),
    String(report.sanityLost).padStart(5), String(report.damageTaken).padStart(6), String(report.overloads).padStart(4),
  ].join(' ')
}

describe('every encounter under the bots', () => {
  const reports: Record<BotPolicy, BattleReport[]> = { strong: [], careless: [] }

  beforeAll(async () => {
    for (const encounter of CAMPAIGN) {
      reports.strong.push(await fight(encounter, { policy: 'strong' }))
      reports.careless.push(await fight(encounter, { policy: 'careless' }))
    }
    console.log([
      'Each encounter alone, from full Sanity with no weights',
      'node  policy    result    turns  lost  taken  ovl',
      ...reports.strong.map(battleRow), ...reports.careless.map(battleRow),
    ].join('\n'))
  }, 120_000)

  it('both bots finish every encounter, won or lost, inside the turn cap', () => {
    for (const policy of ['strong', 'careless'] as const) {
      expect(reports[policy].map(report => report.encounter)).toEqual(IDS)
      for (const report of reports[policy]) {
        expect(report.result, `${policy} ${report.encounter}`).not.toBe('timeout')
        expect(report.turns, `${policy} ${report.encounter}`).toBeLessThanOrEqual(DEFAULT_MAX_TURNS)
        // Sanity lost is damage taken less what REPAIR gave back.
        expect(report.sanityLost, `${policy} ${report.encounter}`).toBeLessThanOrEqual(report.damageTaken)
      }
    }
  })

  it('the strong bot wins every encounter from full Sanity', () => {
    for (const report of reports.strong) {
      expect(report.result, report.encounter).toBe('victory')
      expect(report.sanityStart, report.encounter).toBe(36)
      expect(report.sanityEnd, report.encounter).toBeGreaterThan(0)
    }
  })

  it('a boss is beaten in its second stage, never skipped past it', () => {
    for (const report of reports.strong.filter(candidate => candidate.encounter.endsWith('.B'))) expect(report.stage, report.encounter).toBe(2)
  })
})

describe('whole runs through the campaign store', () => {
  const strong: RunReport[] = []
  const careless: RunReport[] = []
  const nodesOf = (pair: number[]) => (layer: number): string[] => pair.map(node => `${layer}.${node}`)

  beforeAll(async () => {
    const lines: string[] = []
    for (const pair of PAIRS) {
      const run = await playRun(createCampaignStore({ seed: () => RUN_SEED }), { policy: 'strong', nodes: nodesOf(pair) })
      strong.push(run)
      lines.push(`STRONG, nodes ${pair.join(' and ')} of each layer\n${runTable(run)}`)
    }
    for (const pair of PAIRS) {
      const run = await playRun(createCampaignStore({ seed: () => RUN_SEED }), { policy: 'careless', nodes: nodesOf(pair) })
      careless.push(run)
      lines.push(`CARELESS, nodes ${pair.join(' and ')} of each layer\n${runTable(run)}`)
    }
    console.log(lines.join('\n\n'))
  }, 180_000)

  it('the strong bot clears the prologue, two nodes and the boss of each layer, and reaches the gate undefeated', () => {
    for (const [index, run] of strong.entries()) {
      const label = `nodes ${PAIRS[index].join('+')}`
      expect(run.outcome, label).toBe('gate')
      expect(run.defeats, label).toBe(0)
      const pair = PAIRS[index]
      expect(run.battles.map(battle => battle.encounter), label).toEqual([
        '0.B', ...[1, 2, 3].flatMap(layer => [...pair.map(node => `${layer}.${node}`), `${layer}.B`]),
      ])
      // One reward after each skirmish, none after a boss.
      for (const battle of run.battles) expect(battle.reward !== undefined, `${label} ${battle.encounter}`).toBe(!battle.encounter.endsWith('.B'))
      // Six rewards, each a weight the run then holds or PATCH.
      const taken = run.battles.flatMap(battle => battle.reward && battle.reward !== 'patch' ? [battle.reward] : [])
      expect(run.weights, label).toEqual(taken)
    }
  })

  it('keeps the tuned pace: skirmishes of 4 to 7 turns, bosses of 8 to 14', () => {
    for (const [index, run] of strong.entries()) {
      for (const battle of run.battles) {
        const label = `nodes ${PAIRS[index].join('+')} ${battle.encounter}`
        if (battle.encounter.endsWith('.B')) {
          expect(battle.turns, label).toBeGreaterThanOrEqual(8)
          expect(battle.turns, label).toBeLessThanOrEqual(14)
        } else {
          expect(battle.turns, label).toBeGreaterThanOrEqual(4)
          expect(battle.turns, label).toBeLessThanOrEqual(7)
        }
      }
    }
  })

  it('makes the Dark Young cost the strong bot some Sanity, never nothing and never much', () => {
    for (const [index, run] of strong.entries()) {
      const young = run.battles.find(battle => battle.encounter === '1.B')
      const label = `nodes ${PAIRS[index].join('+')}`
      // Tuned to 3 to 8. The Grove mends as fast as it wounds, so this fight
      // can slide to costing nothing without any other bound here noticing.
      expect(young?.sanityLost, label).toBeGreaterThanOrEqual(1)
      expect(young?.sanityLost, label).toBeLessThanOrEqual(10)
    }
  })

  it('wears the strong bot down to between 8 and 20 Sanity by the end of the last battle', () => {
    for (const [index, run] of strong.entries()) {
      const last = run.battles[run.battles.length - 1]
      const label = `nodes ${PAIRS[index].join('+')}`
      expect(last.encounter, label).toBe('3.B')
      expect(last.sanityEnd, label).toBeGreaterThanOrEqual(8)
      expect(last.sanityEnd, label).toBeLessThanOrEqual(20)
      // The gate is reached after the last boss's restore of 12.
      expect(run.sanity, label).toBe(Math.min(last.sanityEnd + 12, 36 + (run.weights.includes('max_sanity') ? 4 : 0)))
    }
  })

  it('lets the careless bot through the Grove and stops it in the Court or Carcosa', () => {
    for (const [index, run] of careless.entries()) {
      const label = `nodes ${PAIRS[index].join('+')}`
      expect(run.outcome, label).toBe('defeat')
      expect(run.defeats, label).toBe(1)
      const fallen = run.battles[run.battles.length - 1]
      expect(fallen.result, label).toBe('gameover')
      expect(['2', '3'], `${label}: fell at ${fallen.encounter}`).toContain(fallen.encounter[0])
      // Everything before it was won, the Dark Young included.
      for (const battle of run.battles.slice(0, -1)) expect(battle.result, `${label} ${battle.encounter}`).toBe('victory')
      expect(run.battles.map(battle => battle.encounter), label).toContain('1.B')
    }
  })
})
