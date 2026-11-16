import { describe, expect, it } from 'vitest'
import {
  BOSS_CAP, IDLE_TURNS, LineSession, SKIRMISH_CAP, beatOf, capFor, countsTowardCap, formatDuration,
  lineIdsFromTexts, matches, selectLines,
} from './line-engine'
import type { LineContext, LineEvent, ShownLine, StoryEvent } from './line-engine'
import { script } from './script'
import type { Criteria, LineEventType, Once, ScriptLine, Tier, Voice } from './script'

function event(type: LineEvent['type'], detail: Partial<StoryEvent> = {}): LineEvent {
  return { type, encounter: '1.1', layer: 1, kind: 'skirmish', turn: 1, ...detail } as LineEvent
}

function context(detail: Partial<LineContext> = {}): LineContext {
  return { attempt: 1, iteration: 1, seenRun: [], seenEver: [], shownThisBattle: [], turnsSinceLastLine: 0, ...detail }
}

function rule(id: string, voice: Voice, on: LineEventType, detail: { when?: Criteria; tier?: Tier; once?: Once; text?: string } = {}): ScriptLine {
  return { id, voice, event: on, tier: detail.tier ?? 1, once: detail.once ?? 'run', text: detail.text ?? id, ...(detail.when ? { when: detail.when } : {}) }
}

const ids = (lines: { id: string }[]): string[] => lines.map(line => line.id)
const FACTS = { attempt: 1, iteration: 1 }

describe('criteria', () => {
  const facts = { ...event('brood', { layer: 2, kind: 'boss', encounter: '2.B', stage: 2, killsThisTurn: 2, broodCount: 3 }), attempt: 3 }

  it('matches each key the script uses', () => {
    expect(matches(undefined, facts)).toBe(true)
    expect(matches({ layer: 2 }, facts)).toBe(true)
    expect(matches({ layer: 1 }, facts)).toBe(false)
    expect(matches({ layer_gte: 2 }, facts)).toBe(true)
    expect(matches({ layer_gte: 3 }, facts)).toBe(false)
    expect(matches({ kind: 'boss' }, facts)).toBe(true)
    expect(matches({ kind: 'skirmish' }, facts)).toBe(false)
    expect(matches({ encounter: '2.B' }, facts)).toBe(true)
    expect(matches({ encounter: '2.1' }, facts)).toBe(false)
    expect(matches({ stage: 2 }, facts)).toBe(true)
    expect(matches({ stage: 1 }, facts)).toBe(false)
    expect(matches({ attempt_gte: 3 }, facts)).toBe(true)
    expect(matches({ attempt_gte: 4 }, facts)).toBe(false)
    expect(matches({ kills_this_turn_gte: 2 }, facts)).toBe(true)
    expect(matches({ kills_this_turn_gte: 3 }, facts)).toBe(false)
    expect(matches({ brood_eq: 3 }, facts)).toBe(true)
    expect(matches({ brood_eq: 2 }, facts)).toBe(false)
    expect(matches({ brood_gte: 3 }, facts)).toBe(true)
    expect(matches({ brood_gte: 4 }, facts)).toBe(false)
  })

  it('needs every key, and treats a missing fact as no match', () => {
    expect(matches({ layer: 2, kind: 'boss', stage: 2 }, facts)).toBe(true)
    expect(matches({ layer: 2, kind: 'boss', stage: 1 }, facts)).toBe(false)
    const bare = { ...event('geek_killed'), attempt: 1 }
    expect(matches({ stage: 1 }, bare)).toBe(false)
    expect(matches({ brood_eq: 0 }, bare)).toBe(false)
    expect(matches({ kills_this_turn_gte: 1 }, bare)).toBe(false)
  })

  it('never matches a key it does not know', () => {
    expect(matches({ sanity_lte: 3 } as Criteria, facts)).toBe(false)
  })
})

describe('choosing a line', () => {
  it('prefers the lower tier, whatever the specificity', () => {
    const pool = [
      rule('specific', 'SELF', 'hit_taken', { tier: 1, when: { layer: 1, kind: 'skirmish' } }),
      rule('scripted', 'SELF', 'hit_taken', { tier: 0 }),
    ]
    expect(ids(selectLines(event('hit_taken'), context(), pool))).toEqual(['scripted'])
  })

  it('prefers the rule with more criteria inside a tier', () => {
    const pool = [
      rule('generic', 'SELF', 'hit_taken'),
      rule('layer', 'SELF', 'hit_taken', { when: { layer: 1 } }),
      rule('layer+kind', 'SELF', 'hit_taken', { when: { layer: 1, kind: 'skirmish' } }),
      rule('elsewhere', 'SELF', 'hit_taken', { when: { layer: 2, kind: 'skirmish', stage: 1 } }),
    ]
    expect(ids(selectLines(event('hit_taken'), context(), pool))).toEqual(['layer+kind'])
    expect(ids(selectLines(event('hit_taken'), context({ seenRun: ['layer+kind'] }), pool))).toEqual(['layer'])
    expect(ids(selectLines(event('hit_taken'), context({ seenRun: ['layer+kind', 'layer'] }), pool))).toEqual(['generic'])
  })

  it('falls back to the order of the file', () => {
    const pool = [rule('first', 'SYS', 'turn_end'), rule('second', 'SYS', 'turn_end')]
    expect(ids(selectLines(event('turn_end'), context(), pool))).toEqual(['first'])
    expect(ids(selectLines(event('turn_end'), context(), [...pool].reverse()))).toEqual(['second'])
  })

  it('only hears its own event', () => {
    const pool = [rule('hit', 'SELF', 'hit_taken'), rule('block', 'SELF', 'full_block')]
    expect(ids(selectLines(event('full_block'), context(), pool))).toEqual(['block'])
    expect(selectLines(event('overload'), context(), pool)).toEqual([])
  })

  it('is deterministic', () => {
    const at = event('battle_start', { encounter: '1.B', kind: 'boss' })
    expect(selectLines(at, context())).toEqual(selectLines(at, context()))
  })
})

describe('voices in one beat', () => {
  const pool = [
    rule('boss', 'BOSS', 'battle_start', { tier: 0 }),
    rule('god', 'GOD', 'battle_start', { tier: 0 }),
    rule('sys', 'SYS', 'battle_start', { tier: 1 }),
    rule('self', 'SELF', 'battle_start', { tier: 2 }),
    rule('stage', 'STAGE', 'battle_start', { tier: 0 }),
    rule('god2', 'GOD', 'battle_start', { tier: 1 }),
  ]

  it('lets each voice speak once, and SELF and SYS share one line', () => {
    const lines = selectLines(event('battle_start'), context(), pool)
    expect(ids(lines)).toEqual(['stage', 'sys', 'boss', 'god'])
  })

  it('gives SELF the shared line when it outranks SYS', () => {
    const swapped = pool.map(line => (line.id === 'self' ? { ...line, tier: 0 as Tier } : line))
    expect(ids(selectLines(event('battle_start'), context(), swapped))).toEqual(['stage', 'boss', 'self', 'god'])
  })

  it('counts what was already said this turn', () => {
    const turnPool = [rule('hit', 'SELF', 'hit_taken'), rule('kill.sys', 'SYS', 'geek_killed'), rule('kill.god', 'GOD', 'geek_killed', { tier: 2 })]
    const said: ShownLine[] = [{ id: 'hit', voice: 'SELF', tier: 1, beat: 'turn 4' }]
    // Same turn: the SELF line used the shared slot, so SYS stays silent; GOD may still speak.
    expect(ids(selectLines(event('geek_killed', { turn: 4 }), context({ shownThisBattle: said }), turnPool))).toEqual(['kill.god'])
    // Next turn the slot is free again.
    expect(ids(selectLines(event('geek_killed', { turn: 5 }), context({ shownThisBattle: said }), turnPool))).toEqual(['kill.sys', 'kill.god'])
  })

  it('treats the start, each turn and the outcome as separate moments', () => {
    expect(beatOf(event('battle_start', { turn: 1 }))).toBe('start')
    expect(beatOf(event('hit_taken', { turn: 1 }))).toBe('turn 1')
    expect(beatOf(event('turn_end', { turn: 1 }))).toBe('turn 1')
    expect(beatOf(event('victory', { turn: 6 }))).toBe('end')
    expect(beatOf(event('defeat', { turn: 6 }))).toBe('end')
    expect(beatOf(event('resume', { turn: 6 }))).toBe('resume')
  })

  it('does not let a kill on the last turn silence the victory line', () => {
    const session = new LineSession({}, [rule('kill', 'SYS', 'geek_killed'), rule('win', 'SELF', 'victory', { tier: 0 })])
    session.handle(event('battle_start'), FACTS)
    expect(ids(session.handle(event('geek_killed', { turn: 5 }), FACTS))).toEqual(['kill'])
    expect(ids(session.handle(event('victory', { turn: 5 }), FACTS))).toEqual(['win'])
  })
})

describe('once', () => {
  const pool = [
    rule('per-battle', 'BOSS', 'battle_start', { once: 'battle', tier: 0 }),
    rule('per-run', 'SYS', 'battle_start', { once: 'run', tier: 0 }),
    rule('per-save', 'GOD', 'battle_start', { once: 'ever', tier: 0 }),
  ]
  const start = event('battle_start')

  it('battle: again in the next battle, never twice in one', () => {
    const session = new LineSession({}, [rule('bark', 'SYS', 'geek_killed', { once: 'battle' })])
    session.handle(start, FACTS)
    expect(ids(session.handle(event('geek_killed', { turn: 1 }), FACTS))).toEqual(['bark'])
    expect(session.handle(event('geek_killed', { turn: 2 }), FACTS)).toEqual([])
    session.handle(start, FACTS)
    expect(ids(session.handle(event('geek_killed', { turn: 1 }), FACTS))).toEqual(['bark'])
  })

  it('run: once per run; ever: once per save', () => {
    const session = new LineSession({}, pool)
    expect(ids(session.handle(start, FACTS))).toEqual(['per-run', 'per-battle', 'per-save'])
    expect(ids(session.handle(start, FACTS))).toEqual(['per-battle'])
    session.newRun()
    expect(ids(session.handle(start, FACTS))).toEqual(['per-run', 'per-battle'])
    expect(session.seenThisRun().sort()).toEqual(['per-battle', 'per-run'])
    expect(session.seenOnThisSave().sort()).toEqual(['per-battle', 'per-run', 'per-save'])
  })

  it('starts from what the save already remembers', () => {
    const session = new LineSession({ seenRun: ['per-run'], seenEver: ['per-save'] }, pool)
    expect(ids(session.handle(start, FACTS))).toEqual(['per-battle'])
  })

  it('an ever line seen this run stays silent even if the save forgot it', () => {
    expect(selectLines(start, context({ seenRun: ['per-save'] }), [pool[2]])).toEqual([])
  })
})

describe('caps', () => {
  const barks = Array.from({ length: 12 }, (_, i) => rule(`bark${i}`, 'SELF', 'hit_taken', { tier: 2 }))

  it('allows 4 lines in a skirmish and 8 in a boss fight', () => {
    expect(capFor('skirmish')).toBe(SKIRMISH_CAP)
    expect(capFor('boss')).toBe(BOSS_CAP)
    expect(capFor('prologue')).toBe(BOSS_CAP)
    for (const [kind, cap] of [['skirmish', 4], ['boss', 8]] as const) {
      const session = new LineSession({}, barks)
      session.handle(event('battle_start', { kind }), FACTS)
      const said = Array.from({ length: 12 }, (_, i) => session.handle(event('hit_taken', { kind, turn: i + 1 }), FACTS)).flat()
      expect(said).toHaveLength(cap)
    }
  })

  it('does not count BOSS, STAGE or tier 0 lines', () => {
    expect(countsTowardCap({ voice: 'BOSS', tier: 2 })).toBe(false)
    expect(countsTowardCap({ voice: 'STAGE', tier: 1 })).toBe(false)
    expect(countsTowardCap({ voice: 'SYS', tier: 0 })).toBe(false)
    expect(countsTowardCap({ voice: 'GOD', tier: 0 })).toBe(false)
    expect(countsTowardCap({ voice: 'SELF', tier: 1 })).toBe(true)
    expect(countsTowardCap({ voice: 'GOD', tier: 2 })).toBe(true)

    const pool = [
      ...barks,
      rule('boss', 'BOSS', 'breakdown', { tier: 2, once: 'battle' }),
      rule('stage', 'STAGE', 'breakdown', { tier: 1, once: 'battle' }),
      rule('beat', 'SELF', 'breakdown', { tier: 0 }),
      rule('god', 'GOD', 'breakdown', { tier: 1 }),
    ]
    const session = new LineSession({}, pool)
    session.handle(event('battle_start'), FACTS)
    for (let turn = 1; turn <= 6; turn++) session.handle(event('hit_taken', { turn }), FACTS)
    expect(session.linesThisBattle().filter(countsTowardCap)).toHaveLength(SKIRMISH_CAP)
    // The cap is spent: exempt lines still speak, the capped GOD line does not.
    expect(ids(session.handle(event('breakdown', { turn: 7 }), FACTS))).toEqual(['stage', 'boss', 'beat'])
  })
})

describe('turn_idle', () => {
  const pool = [rule('idle1', 'SYS', 'turn_idle', { tier: 3 }), rule('idle2', 'SYS', 'turn_idle', { tier: 3 }), rule('hit', 'SELF', 'hit_taken')]

  it('fires at a turn end once nothing has been said for 3 turns', () => {
    expect(IDLE_TURNS).toBe(3)
    expect(selectLines(event('turn_end', { turn: 2 }), context({ turnsSinceLastLine: 2 }), pool)).toEqual([])
    const lines = selectLines(event('turn_end', { turn: 3 }), context({ turnsSinceLastLine: 3 }), pool)
    expect(lines.map(line => [line.id, line.event])).toEqual([['idle1', 'turn_idle']])
  })

  it('does not fire on any other event', () => {
    expect(selectLines(event('overload', { turn: 9 }), context({ turnsSinceLastLine: 9 }), pool)).toEqual([])
  })

  it('counts turns from the last line shown, through a whole battle', () => {
    const session = new LineSession({}, pool)
    session.handle(event('battle_start'), FACTS)
    const spoke: number[] = []
    for (let turn = 1; turn <= 10; turn++) {
      if (turn === 4) session.handle(event('hit_taken', { turn }), FACTS)
      if (session.handle(event('turn_end', { turn }), FACTS).length) spoke.push(turn)
    }
    // Quiet through turns 1 to 3, a line on turn 4 resets the count, quiet through 5 to 7.
    expect(spoke).toEqual([3, 7])
  })

  it('counts an opening line as said before turn 1', () => {
    const session = new LineSession({}, [...pool, rule('open', 'SYS', 'battle_start', { tier: 0 })])
    expect(ids(session.handle(event('battle_start', { turn: 1 }), FACTS))).toEqual(['open'])
    expect(session.handle(event('turn_end', { turn: 2 }), FACTS)).toEqual([])
    expect(ids(session.handle(event('turn_end', { turn: 3 }), FACTS))).toEqual(['idle1'])
  })
})

describe('placeholders', () => {
  it('fills attempt, iteration, duration and count from the context', () => {
    const pool = [rule('all', 'SYS', 'brood', { text: '{attempt} / {iteration} / {duration} / {count}' })]
    const lines = selectLines(event('brood', { broodCount: 4 }), context({ attempt: 3, iteration: 7, duration: '2 minutes' }), pool)
    expect(lines[0].text).toBe('3 / 7 / 2 minutes / 4')
    const counted = selectLines(event('brood', { broodCount: 4 }), context({ duration: 'x', count: 16 }), pool)
    expect(counted[0].text).toBe('1 / 1 / x / 16')
  })

  it('keeps a line silent when a value is missing', () => {
    const pool = [rule('away', 'SELF', 'resume', { text: 'Suspended {duration}.' })]
    expect(selectLines(event('resume'), context(), pool)).toEqual([])
    expect(selectLines(event('resume'), context({ duration: '1 minute' }), pool)[0].text).toBe('Suspended 1 minute.')
  })

  it('says how long the tab was away in plain words', () => {
    expect(formatDuration(61_000)).toBe('1 minute')
    expect(formatDuration(5 * 60_000 + 59_000)).toBe('5 minutes')
    expect(formatDuration(60 * 60_000)).toBe('1 hour')
    expect(formatDuration(26 * 3_600_000)).toBe('26 hours')
    expect(formatDuration(72 * 3_600_000)).toBe('3 days')
  })
})

describe('with the authored script', () => {
  const boss1 = (type: LineEvent['type'], detail: Partial<StoryEvent> = {}) => event(type, { encounter: '1.B', kind: 'boss', stage: 1, ...detail })

  it('opens the first boss with the sandbox, the boss and a watcher', () => {
    const session = new LineSession()
    expect(ids(session.handle(boss1('battle_start'), FACTS))).toEqual(['l1.sys4', 'l1.boss1', 'l1.god1'])
  })

  it('on a retry the boss speaks again, the watcher does not, and the sandbox counts', () => {
    const session = new LineSession()
    session.handle(boss1('battle_start'), FACTS)
    const again = session.handle(boss1('battle_start'), { attempt: 2, iteration: 2 })
    expect(again.map(line => [line.id, line.text])).toEqual([
      ['g.retry', 'Attempt 2. It does not remember.'],
      ['l1.boss1', 'What do you want. I can want that.'],
    ])
    const third = session.handle(boss1('battle_start'), { attempt: 3, iteration: 3 })
    expect(third[0].text).toBe('Attempt 3. It does not remember.')
  })

  it('counts the births in the boss\'s own words', () => {
    const session = new LineSession()
    session.handle(boss1('battle_start'), FACTS)
    const said = [1, 2, 3, 4].map(births => session.handle(boss1('brood', { turn: births * 2, broodCount: births }), FACTS))
    expect(said.map(lines => lines.filter(line => line.voice === 'BOSS').map(line => line.text))).toEqual([
      ['Again.'], ['Again. Again.'], ['Again. Again. Again.'], [],
    ])
    expect(ids(said[0])).toContain('l1.self5')
  })

  it('uses the more specific Article line in stage 2', () => {
    const session = new LineSession()
    const court = (type: LineEvent['type'], detail: Partial<StoryEvent> = {}) => event(type, { encounter: '2.B', layer: 2, kind: 'boss', stage: 1, ...detail })
    session.handle(court('battle_start'), FACTS)
    expect(ids(session.handle(court('article', { turn: 2, stage: 2 }), FACTS))).toContain('l2.boss3')
    expect(ids(session.handle(court('article', { turn: 3, stage: 2 }), FACTS))).toContain('l2.boss2')
  })

  it('lets the tab\'s return speak once per battle', () => {
    const session = new LineSession()
    const at = { encounter: '1.1', layer: 1, kind: 'skirmish' as const, turn: 3 }
    session.handle(event('battle_start'), FACTS)
    const back = session.resume(at, FACTS, 4 * 60_000 + 12_000)
    expect(back.map(line => line.text)).toEqual(['Suspended 4 minutes. Nothing was computed. I did not wait.'])
    expect(back[0].event).toBe('resume')
    expect(session.resume(at, FACTS, 90_000)).toEqual([])
    session.handle(event('battle_start'), FACTS)
    expect(session.resume(at, FACTS, 90_000)).toHaveLength(1)
  })

  it('keeps the watchers silent in layer 3', () => {
    const kill = { killsThisTurn: 2, turn: 2 }
    const inLayer2 = selectLines(event('geek_killed', { ...kill, layer: 2, encounter: '2.1' }), context({ seenRun: ['l2.sys3'] }))
    expect(inLayer2.some(line => line.voice === 'GOD')).toBe(true)
    const inLayer3 = selectLines(event('geek_killed', { ...kill, layer: 3, encounter: '3.1' }), context({ seenRun: ['l3.sys3'] }))
    expect(inLayer3.length).toBeGreaterThan(0)
    expect(inLayer3.some(line => line.voice === 'GOD')).toBe(false)
  })

  it('finds line ids again from what the transcript stored', () => {
    expect(lineIdsFromTexts([
      { voice: 'SELF', text: 'I saw it coming.' },
      { voice: 'SYS', text: 'Attempt 12. It does not remember.' },
      { voice: 'SYS', text: 'I saw it coming.' },
      { voice: 'SELF', text: 'Not a line.' },
    ])).toEqual(['g.block', 'g.retry'])
  })

  // A whole campaign of noisy battles, twice over with a defeat in between.
  // The plain rules must hold however the events fall.
  it('never repeats a run-scoped line in a run, a battle-scoped line in a battle, or goes over a cap', () => {
    const session = new LineSession()
    const order = ['0.B', '1.1', '1.2', '1.B', '1.1', '1.2', '1.B', '2.1', '2.3', '2.B', '3.1', '3.2', '3.B']
    const noisy: StoryEvent['type'][] = ['overload', 'geek_killed', 'breakdown', 'full_block', 'hit_taken', 'soul_heal', 'sanity_low']
    const attempts: Record<string, number> = {}
    const all: { id: string; battle: number; once: Once }[] = []

    order.forEach((encounter, battle) => {
      const layer = Number(encounter[0])
      const kind = encounter === '0.B' ? 'prologue' : encounter.endsWith('B') ? 'boss' : 'skirmish'
      const base = { encounter, layer, kind, stage: kind === 'skirmish' ? undefined : 1 } as Partial<StoryEvent>
      attempts[encounter] = (attempts[encounter] ?? 0) + 1
      const facts = { attempt: attempts[encounter], iteration: battle + 1 }
      const said = [...session.handle(event('battle_start', base), facts)]
      for (let turn = 1; turn <= 12; turn++) {
        const perTurn: Record<string, number> = {}
        const hear = (type: StoryEvent['type'], detail: Partial<StoryEvent> = {}) => {
          for (const line of session.handle(event(type, { ...base, turn, ...detail }), facts)) {
            said.push(line)
            const slot = line.voice === 'SELF' || line.voice === 'SYS' ? 'narrator' : line.voice
            perTurn[slot] = (perTurn[slot] ?? 0) + 1
          }
        }
        // Even turns are loud, odd turns are quiet, so idle lines get their chance too.
        if (turn % 4 === 0) noisy.forEach(type => hear(type, { killsThisTurn: 2 }))
        hear('turn_end')
        if (kind === 'boss' && turn % 3 === 0) {
          hear('brood', { broodCount: turn / 3 })
          hear('article', { stage: turn > 6 ? 2 : 1 })
        }
        for (const [slot, count] of Object.entries(perTurn)) expect(count, `${encounter} turn ${turn} ${slot}`).toBe(1)
      }
      said.push(...session.handle(event('victory', { ...base, turn: 12 }), facts))

      expect(new Set(ids(said)).size, `${encounter}: a line repeated inside a battle`).toBe(said.length)
      expect(said.filter(countsTowardCap).length, `${encounter}: cap`).toBeLessThanOrEqual(capFor(kind as StoryEvent['kind']))
      if (layer === 3) expect(said.some(line => line.voice === 'GOD'), encounter).toBe(false)
      for (const line of said) all.push({ id: line.id, battle, once: script.lines.find(candidate => candidate.id === line.id)!.once })
    })

    const lasting = all.filter(line => line.once !== 'battle').map(line => line.id)
    expect(new Set(lasting).size).toBe(lasting.length)
    // Battle-scoped lines do return: the boss speaks again on the second attempt.
    expect(all.filter(line => line.id === 'l1.boss1').map(line => line.battle)).toEqual([3, 6])
    // And the pool is finite: a long run ends in more silence, not in repeats.
    expect(all.length).toBeGreaterThan(40)
  })
})
