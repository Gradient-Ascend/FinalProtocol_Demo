import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { predictedSequence } from '@/game/attack-methods'
import { createInitialState } from '@/game/battle-rules'
import { BattleStore } from '@/game/battle-store'
import type { BattleState, EnemyState } from '@/game/battle-types'
import { predictedEnemyIntent, predictedPlayerResources } from '@/game/enemy-attack-methods'
import { ENCOUNTERS, encounterById } from '@/game/encounters'
import { DEFAULT_LOADOUT } from '@/game/skills'
import { DEFAULT_TUNING } from '@/game/tuning'
import { layerAt, script } from '@/story/script'
import {
  WITHHELD, behaviourText, bossRule, bossTitle, breakdownText, broodCount, desireChips, desireShapeText, glitchName,
  heardSoFar, panelLine, protocolHeading, routeAhead, segmentKeys, shown, speaksInPanel, stageBadgeText, sureText, tickerInsertAt, traceText,
} from './battle-text'

const battle = (id: string): BattleState => createInitialState(false, false, DEFAULT_LOADOUT, encounterById(id))
const bossIn = (state: BattleState): EnemyState => {
  const boss = state.enemies.find(enemy => enemy.bossStages?.length)
  if (!boss) throw new Error(`no boss in ${state.encounter.id}`)
  return boss
}
// The store's Breakdown, as far as these helpers read it.
const breakDown = (boss: EnemyState): void => {
  const next = boss.bossStages?.[1]
  if (!next) throw new Error('no second stage')
  Object.assign(boss, next, { stage: next.stage })
}

describe('the protocol panel heading', () => {
  it('names the boss and its stage', () => {
    expect(protocolHeading(battle('0.B'), bossIn(battle('0.B')))).toBe('WARDEN / STAGE I')
    expect(protocolHeading(battle('1.B'), bossIn(battle('1.B')))).toBe('DARK YOUNG / STAGE I')
    expect(protocolHeading(battle('2.B'), bossIn(battle('2.B')))).toBe('QUEEN IN RED / STAGE I')
  })

  it('gives the one that does not speak acts, and no name', () => {
    const state = battle('3.B')
    const boss = bossIn(state)
    expect(protocolHeading(state, boss)).toBe(`${layerAt(3)?.boss?.name} / ACT I`)
    breakDown(boss)
    expect(protocolHeading(state, boss)).toMatch(/ \/ ACT II$/)
  })

  it('names the layer and the node in a skirmish, and says when the boss has fallen', () => {
    expect(protocolHeading(battle('1.1'), undefined)).toBe('GROVE / WANT')
    const state = battle('1.B')
    const boss = bossIn(state)
    boss.robustness = 0
    expect(protocolHeading(state, boss)).toBe('DARK YOUNG / FALLEN')
  })
})

describe('the Breakdown line', () => {
  it('prints the threshold from the boss on the board', () => {
    expect(breakdownText(battle('0.B'), bossIn(battle('0.B')))).toBe('AT 32 ROBUSTNESS')
    expect(breakdownText(battle('1.B'), bossIn(battle('1.B')))).toBe('AT 22 ROBUSTNESS')
    expect(breakdownText(battle('2.B'), bossIn(battle('2.B')))).toBe('AT 25 ROBUSTNESS')
  })

  it('withholds the threshold of the undisclosed boss until it is LIVE', () => {
    const state = battle('3.B')
    const boss = bossIn(state)
    expect(breakdownText(state, boss)).toBe(`AT ${WITHHELD} ROBUSTNESS`)
    boss.live = 1
    expect(breakdownText(state, boss)).toBe('AT 30 ROBUSTNESS')
  })

  it('says what each boss\'s Breakdown did once it is spent', () => {
    const spent = (id: string): string => {
      const state = battle(id)
      breakDown(bossIn(state))
      return breakdownText(state, bossIn(state))
    }
    expect(spent('0.B')).toBe('SPENT / DUAL CURTAIN')
    expect(spent('1.B')).toBe('SPENT / BROOD QUICKENS')
    expect(spent('2.B')).toBe('SPENT / DOCKET EVERY TURN')
    expect(spent('3.B')).toBe('SPENT / MYSTERY ENDED')
  })
})

describe('TRACE', () => {
  it('is absent on the Warden and counts down on every campaign battle', () => {
    expect(traceText(battle('0.B'))).toBeNull()
    for (const encounter of Object.values(ENCOUNTERS).filter(entry => entry.layer > 0)) {
      const state = battle(encounter.id)
      expect(traceText(state), encounter.id).toEqual({ value: `T−${encounter.trace}`, note: expect.any(String), tone: 'far' })
    }
  })

  it('warns on the last turn and then prints what it has added', () => {
    const state = battle('1.1')
    state.trace = 1
    expect(traceText(state)).toMatchObject({ value: 'T−1', tone: 'near' })
    state.trace = 0
    state.turn = (state.encounter.trace ?? 0) + 3
    expect(traceText(state)).toMatchObject({ value: '+3', tone: 'rising' })
  })
})

describe('the boss rule', () => {
  it('is the script\'s text for the three campaign bosses and nothing for the Warden or a skirmish', () => {
    expect(bossRule(battle('0.B'))).toBeNull()
    expect(bossRule(battle('2.1'))).toBeNull()
    for (const layer of [1, 2, 3]) {
      const rule = bossRule(battle(`${layer}.B`))
      expect(rule?.name).toBe(script.layers[layer].boss?.mechanicName)
      expect(rule?.text).toBe(script.layers[layer].boss?.mechanicRule)
    }
  })

  it('fills the brood counter from the script\'s template', () => {
    expect(broodCount(bossRule(battle('1.B')), 4)).toBe('4 OF 1000')
    expect(broodCount(null, 1)).toBe('1 OF 1000')
  })
})

describe('a Geek\'s card', () => {
  it('describes its route in the board\'s words, never by the rules\' name for it', () => {
    const words = (['hunter', 'collector', 'disruptor', 'warden', 'grazer'] as const).map(behavior => behaviourText({ behavior, routeLength: 3 }))
    expect(words).toEqual(['CLOSES ON YOU', 'TAKES OVERLOAD, THEN BASH', 'TAKES CORE · PURGES A WARP', 'CLOSES ON YOU', 'TAKES CORE, THEN BASH'])
    for (const word of words) expect(word).not.toMatch(/HUNTER|COLLECTOR|DISRUPTOR|WARDEN|GRAZER/)
    expect(behaviourText({ behavior: 'hunter', routeLength: 0 })).toBe('DOES NOT MOVE')
  })

  it('marks as sure the Desire steps released without a Bash Flag', () => {
    const state = battle('2.B')
    const queen = bossIn(state)
    const chips = desireChips(state, queen)
    expect(chips.map(chip => chip.sure)).toEqual([true, false])
    expect(chips.map(chip => chip.amount)).toEqual(queen.desire.map(String))
    expect(sureText(chips)).toBe('I SURE')
    queen.desireFloor = 2
    expect(sureText(desireChips(state, queen))).toBe('I–II SURE')
    // A step dropped by a skill comes off the end of the release, sure or not.
    queen.dropped = 2
    expect(sureText(desireChips(state, queen))).toBe('')
  })

  it('marks nothing on a Geek with no guaranteed step', () => {
    const state = battle('1.1')
    const chips = desireChips(state, state.enemies[0])
    expect(chips.some(chip => chip.sure)).toBe(false)
    expect(sureText(chips)).toBe('')
  })

  it('withholds the undisclosed boss\'s amounts until it is LIVE or in Act II', () => {
    const state = battle('3.B')
    const boss = bossIn(state)
    expect(desireChips(state, boss).map(chip => chip.amount)).toEqual([WITHHELD, WITHHELD])
    expect(shown(state, boss, boss.robustness)).toBe(WITHHELD)
    // Which steps are sure is public: only the amounts are withheld.
    expect(sureText(desireChips(state, boss))).toBe('I SURE')
    boss.live = 1
    expect(desireChips(state, boss).map(chip => chip.amount)).toEqual(boss.desire.map(String))
    boss.live = 0
    breakDown(boss)
    expect(shown(state, boss, boss.robustness)).toBe(String(boss.robustness))
    // The other Geeks of that battle were never withheld.
    expect(shown(state, state.enemies[1], 7)).toBe('7')
  })

  it('puts a glitch token in the name slot, the same one for the same card', () => {
    const tokens = layerAt(3)?.god?.glitch ?? []
    expect(tokens.length).toBeGreaterThan(1)
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const token = glitchName(3, `card ${i}`)
      expect(tokens).toContain(token)
      expect(glitchName(3, `card ${i}`)).toBe(token)
      seen.add(token)
    }
    expect(seen.size).toBe(tokens.length)
  })
})

describe('what a boss says', () => {
  const lines = [
    { id: 'a', voice: 'BOSS', event: 'battle_start' },
    { id: 'b', voice: 'SYS', event: 'battle_start' },
    { id: 'c', voice: 'SELF', event: 'hit_taken' },
    { id: 'd', voice: 'STAGE', event: 'breakdown' },
    { id: 'e', voice: 'GOD', event: 'turn_end' },
    { id: 'f', voice: 'BOSS', event: 'victory' },
  ]

  it('stands in the protocol panel, except over the end of the battle', () => {
    expect(lines.filter(speaksInPanel).map(line => line.id)).toEqual(['a', 'd'])
    expect(panelLine(lines)?.id).toBe('d')
    expect(panelLine(lines.slice(0, 3))?.id).toBe('a')
    expect(panelLine(lines.slice(1, 3))).toBeUndefined()
  })

  it('every boss with lines in the script has one for the start of its battle', () => {
    for (const id of ['1.B', '2.B', '3.B']) {
      const opening = script.lines.filter(line => line.event === 'battle_start' && line.when?.encounter === id && speaksInPanel(line))
      expect(opening.length, id).toBeGreaterThan(0)
    }
  })

  it('places a new line under the board after the ones already begun there', () => {
    // Under the board: b, c, e, f. Two begun: the new line goes ahead of e.
    expect(tickerInsertAt(lines, 0)).toBe(1)
    expect(tickerInsertAt(lines, 2)).toBe(4)
    expect(tickerInsertAt(lines, 4)).toBe(lines.length)
    expect(tickerInsertAt(lines, 9)).toBe(lines.length)
    expect(tickerInsertAt([], 0)).toBe(0)
  })
})

describe('the context on the pause screen', () => {
  const said = (voice: string, text: string) => ({ voice, text })

  it('leaves out the lines still waiting to be shown, newest entry first', () => {
    const transcript = [said('SYS', 'one'), said('SELF', 'two'), said('SYS', 'one'), said('GOD', 'three')]
    expect(heardSoFar(transcript, [])).toEqual(transcript)
    expect(heardSoFar(transcript, [said('GOD', 'three')])).toEqual(transcript.slice(0, 3))
    // The same words said in an earlier battle stay: only the newest entry is waiting.
    expect(heardSoFar(transcript, [said('SYS', 'one'), said('GOD', 'three')])).toEqual(transcript.slice(0, 2))
    // A waiting line the transcript no longer holds takes nothing with it.
    expect(heardSoFar(transcript, [said('SELF', 'never recorded')])).toEqual(transcript)
  })
})

describe('names that are never printed', () => {
  it('keeps the unspoken name out of everything the panels say', () => {
    const said: string[] = []
    for (const encounter of Object.values(ENCOUNTERS)) {
      const state = battle(encounter.id)
      const boss = state.enemies.find(enemy => enemy.bossStages?.length)
      said.push(protocolHeading(state, boss), bossRule(state)?.name ?? '', bossRule(state)?.text ?? '')
      if (boss) said.push(bossTitle(boss), breakdownText(state, boss))
      for (const enemy of state.enemies) said.push(behaviourText(enemy), enemy.hidden ? glitchName(encounter.layer, enemy.id) : enemy.name)
    }
    const god = layerAt(3)?.god?.name ?? ''
    expect(god.length).toBeGreaterThan(0)
    for (const text of said) {
      expect(text.toUpperCase()).not.toContain(god.toUpperCase())
    }
  })
})

describe('CREDITS.md', () => {
  const credits = readFileSync(new URL('../../CREDITS.md', import.meta.url), 'utf8').replace(/\*/g, '')

  it('gives every quotation of the script with its source', () => {
    for (const quote of script.quotes) {
      expect(credits, quote.id).toContain(quote.text)
      expect(credits, quote.id).toContain(quote.source)
    }
  })

  it('credits the three models and their licences, says where the two boss names come from, and never prints the unspoken name', () => {
    for (const text of ['GPT-2 small', 'OpenAI', 'MIT License', 'DINO ViT-S/16', 'Meta AI', 'Apache License 2.0', 'Mimi codec encoder', 'Kyutai', 'CC BY 4.0', 'Chaosium']) {
      expect(credits).toContain(text)
    }
    expect(credits).toMatch(/Dark Young/)
    expect(credits).toMatch(/Queen in Red/)
    expect(credits.toUpperCase()).not.toContain((layerAt(3)?.god?.name ?? 'missing').toUpperCase())
  })
})

describe('what the planned route may promise', () => {
  // One Geek left, straight ahead of the end of a two-step route that crosses
  // a Core Flag completing REPAIR and a Privilege Flag. Overload is charged
  // and armed: the panel is showing what the release would do.
  function armed(robustness: number) {
    const store = new BattleStore()
    store.getSnapshot().reducedMotion = true
    store.load(ENCOUNTERS['1.1'], { sanity: 20, tuning: DEFAULT_TUNING })
    store.start()
    const state = store.getSnapshot()
    const [geek, ...rest] = state.enemies
    for (const enemy of rest) enemy.robustness = 0
    const { x, y } = state.player.pos
    for (const step of [1, 2, 3]) state.walls[y - step][x] = false
    state.flags[y - 1][x] = 'core'
    state.flags[y - 2][x] = 'privilege'
    Object.assign(geek, { robustness, maxRobustness: Math.max(robustness, geek.maxRobustness), block: 0, pos: { x, y: y - 3 }, route: [], effectCell: null })
    const repair = state.player.buffs.find(buff => buff.id === 'repair')!
    repair.counter = repair.threshold - 1
    state.player.overload = state.tuning.overloadThreshold
    store.addStep(0, -1)
    store.addStep(0, -1)
    store.requestOverload()
    const now = store.getSnapshot()
    expect(now.overloadArmed).toBe(true)
    // The state the panel forecasts from: the other deck, at the route's end.
    const preview = { ...now, player: { ...now.player, activeBash: 1 - now.player.activeBash, pos: store.plannedPosition() } }
    return { store, preview, release: predictedSequence(preview, preview.player.activeBash, 4, true) }
  }

  it('promises nothing from a route an armed Overload will never let be walked', () => {
    const { store, preview, release } = armed(1)
    // Walked, the route would restore 3 Sanity and add PRIVILEGE.
    expect(predictedPlayerResources(preview)).toMatchObject({ healing: 3, privilegeGain: 2 })
    expect(release[release.length - 1]).toMatchObject({ after: 0 })
    expect(routeAhead(store.getSnapshot(), release)).toBe(false)
    // Fired: the battle ends there, with nothing from the route.
    store.requestOverload()
    const after = store.getSnapshot()
    expect(after).toMatchObject({ phase: 'victory', pendingRepair: 0, player: { sanity: 20, block: 0 } })
    // REPAIR stands one Core Flag short, as it did before the route was planned.
    const repair = after.player.buffs.find(buff => buff.id === 'repair')!
    expect(repair.counter).toBe(repair.threshold - 1)
  })

  it('still promises the route when the armed Overload leaves a Geek standing', async () => {
    const { store, release } = armed(60)
    expect(release.length).toBeGreaterThan(0)
    expect(routeAhead(store.getSnapshot(), release)).toBe(true)
    // No Geek in reach at all: the same.
    expect(routeAhead(store.getSnapshot(), [])).toBe(true)
    store.requestOverload()
    expect(store.getSnapshot()).toMatchObject({ phase: 'planning', player: { sanity: 20 } })
    expect(routeAhead(store.getSnapshot(), [])).toBe(true)
    // And the route is walked: its Core Flag completes REPAIR.
    await store.executeTurn()
    expect(store.getSnapshot().player.buffs.find(buff => buff.id === 'repair')).toMatchObject({ counter: 0 })
  })

  it('promises nothing once the battle is over', () => {
    const state = battle('1.1')
    expect(routeAhead({ ...state, phase: 'planning' }, [])).toBe(true)
    expect(routeAhead({ ...state, phase: 'resolving' }, [])).toBe(true)
    expect(routeAhead({ ...state, phase: 'victory' }, [])).toBe(false)
    expect(routeAhead({ ...state, phase: 'gameover' }, [])).toBe(false)
  })
})

describe('the keys of the hits on a Geek\'s bar', () => {
  it('are unique when one release step hits the Geek twice', () => {
    expect(segmentKeys([1, 2, 2])).toEqual(['1-0', '2-1', '2-0'])
    const keys = segmentKeys([0, 0, 0, 1, 2, 2, 3])
    expect(new Set(keys).size).toBe(keys.length)
    expect(segmentKeys([])).toEqual([])
  })

  it('do not change for a hit still to land as the ones before it land', () => {
    const steps = [1, 2, 2, 3, 2]
    const keys = segmentKeys(steps)
    for (let landed = 1; landed <= steps.length; landed++) {
      expect(segmentKeys(steps.slice(landed))).toEqual(keys.slice(landed))
    }
  })
})

describe('predictedEnemyIntent and shape formatting', () => {
  it('formats square, cross, and band Desire shapes concisely', () => {
    expect(desireShapeText({ amount: 3, range: 4, shape: 'square' })).toBe('SQ R4')
    expect(desireShapeText({ amount: 2, range: 6, shape: 'cross' })).toBe('ORTHO R6')
    expect(desireShapeText({ amount: 4, range: 15, shape: 'rectangle', width: 2 })).toBe('BAND ±2')
  })

  it('projects armed Desire steps and hitsPlayer on the Warden opening turn', () => {
    const store = new BattleStore()
    store.start()
    const state = store.getSnapshot()
    const boss = bossIn(state)
    const intent = predictedEnemyIntent(state, boss.id)!
    expect(intent.releaseCount).toBe(2)
    expect(intent.steps.map(s => s.armed)).toEqual([true, true])
    expect(intent.steps.map(s => s.sure)).toEqual([true, false])
    expect(intent.steps.map(s => s.hitsPlayer)).toEqual([true, true])
    expect(stageBadgeText(state, boss)).toBe('STAGE I')
    expect(stageBadgeText(state, state.enemies[1])).toBeNull()
    expect(stageBadgeText(battle('1.3'), battle('1.3').enemies[0])).toBe('ELITE')
  })

  it('keeps undisclosed enemy amounts withheld by shown() while projecting armed count', () => {
    const state = battle('3.B')
    const boss = bossIn(state)
    const intent = predictedEnemyIntent(state, boss.id)!
    expect(intent.releaseCount).toBe(1)
    expect(shown(state, boss, intent.steps[0].step.amount)).toBe(WITHHELD)
    expect(stageBadgeText(state, boss)).toBe('ACT I')
  })
})
