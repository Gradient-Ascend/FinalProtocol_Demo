// The line engine: given a story event, which authored lines to show. Pure and
// deterministic (no Math.random); it does not render. After the response
// rules of Left 4 Dead: a rule is eligible only when every criterion matches,
// and the most specific eligible rule wins.
import { fillText, placeholdersIn, script } from './script'
import type { Criteria, LineEventType, ScriptLine, Tier, Voice } from './script'
// A type only: nothing of the store is loaded by the story modules.
import type { StoryEvent } from '@/game/battle-store'

export type { StoryEvent }
// One event the store cannot know about: the tab came back (see LineSession.resume).
export type ResumeEvent = Omit<StoryEvent, 'type'> & { type: 'resume' }
export type LineEvent = StoryEvent | ResumeEvent

// A line chosen for display, placeholders filled.
export type StoryLine = {
  id: string
  voice: Voice
  text: string
  tier: Tier
  event: LineEventType   // the rule's own event: 'turn_idle' for the derived one
  beat: string           // the moment it belongs to; see beatOf
  quote?: string
}
// What the engine has to remember about a line already shown this battle.
export type ShownLine = Pick<StoryLine, 'id' | 'voice' | 'tier' | 'beat'>

export type LineContext = {
  attempt: number                        // tries at this encounter this run; the first is 1
  iteration: number
  seenRun: readonly string[]             // line ids shown this run
  seenEver: readonly string[]            // line ids shown on this save
  shownThisBattle: readonly ShownLine[]
  turnsSinceLastLine: number             // 0 when a line was shown this turn
  duration?: string                      // {duration}: how long the tab was away
  count?: number                         // {count}; defaults to the event's broodCount
}

export const SKIRMISH_CAP = 4
export const BOSS_CAP = 8
export const IDLE_TURNS = 3
// "GOD ... None in layer 3" (spec section 2): the watchers fall silent there,
// even for a line with no layer criterion.
const GOD_SILENT_FROM_LAYER = 3

type Facts = LineEvent & { attempt: number }

const MATCHERS: { [K in keyof Criteria]-?: (want: NonNullable<Criteria[K]>, facts: Facts) => boolean } = {
  layer: (want, facts) => facts.layer === want,
  layer_gte: (want, facts) => facts.layer >= want,
  kind: (want, facts) => facts.kind === want,
  encounter: (want, facts) => facts.encounter === want,
  stage: (want, facts) => facts.stage === want,
  attempt_gte: (want, facts) => facts.attempt >= want,
  kills_this_turn_gte: (want, facts) => (facts.killsThisTurn ?? 0) >= want,
  brood_eq: (want, facts) => facts.broodCount === want,
  brood_gte: (want, facts) => (facts.broodCount ?? 0) >= want,
}

// Every key must match. A key the engine does not know never matches, so a
// typo silences its line instead of widening it.
export function matches(when: Criteria | undefined, facts: Facts): boolean {
  return Object.entries(when ?? {}).every(([key, want]) => {
    const test = MATCHERS[key as keyof Criteria] as ((want: unknown, facts: Facts) => boolean) | undefined
    return test !== undefined && test(want, facts)
  })
}

export function specificity(line: ScriptLine): number {
  return Object.keys(line.when ?? {}).length
}

// Lines share a moment, not a turn number. The start of a battle and its
// outcome overlay are moments of their own, so a kill on the last turn does
// not silence the victory line.
export function beatOf(event: LineEvent): string {
  if (event.type === 'battle_start') return 'start'
  if (event.type === 'victory' || event.type === 'defeat') return 'end'
  if (event.type === 'resume') return 'resume'
  return `turn ${event.turn}`
}

// SELF and SYS share one slot per beat; every other voice has its own.
function slotOf(voice: Voice): string {
  return voice === 'SELF' || voice === 'SYS' ? 'narrator' : voice
}

// BOSS and STAGE lines and scripted beats (tier 0) do not count against the cap.
export function countsTowardCap(line: Pick<StoryLine, 'voice' | 'tier'>): boolean {
  return line.tier !== 0 && line.voice !== 'BOSS' && line.voice !== 'STAGE'
}

export function capFor(kind: StoryEvent['kind']): number {
  return kind === 'skirmish' ? SKIRMISH_CAP : BOSS_CAP
}

// 'battle' lines may return in a later battle; 'run' lines never repeat inside
// a run; 'ever' lines never repeat on this save. Nothing repeats in a battle.
function unseen(line: ScriptLine, context: LineContext): boolean {
  if (context.shownThisBattle.some(shown => shown.id === line.id)) return false
  if (line.once === 'battle') return true
  if (context.seenRun.includes(line.id)) return false
  return line.once === 'run' || !context.seenEver.includes(line.id)
}

// turn_idle is derived: a turn ended and nothing has been said for a while.
function eventsFor(event: LineEvent, context: LineContext): LineEventType[] {
  const idle = event.type === 'turn_end' && context.turnsSinceLastLine >= IDLE_TURNS
  return idle ? ['turn_end', 'turn_idle'] : [event.type]
}

function placeholderValues(event: LineEvent, context: LineContext): Partial<Record<string, string | number>> {
  return {
    attempt: context.attempt,
    iteration: context.iteration,
    duration: context.duration,
    count: context.count ?? event.broodCount,
  }
}

// Where each voice sits when several speak in one beat: the frame first, the
// watchers last.
const SPEAKING_ORDER: Voice[] = ['STAGE', 'SYS', 'BOSS', 'SELF', 'GOD']

export function selectLines(
  event: LineEvent,
  context: LineContext,
  pool: readonly ScriptLine[] = script.lines,
): StoryLine[] {
  const facts: Facts = { ...event, attempt: context.attempt }
  const events = eventsFor(event, context)
  const values = placeholderValues(event, context)
  const beat = beatOf(event)

  const eligible = pool
    .map((line, order) => ({ line, order }))
    .filter(({ line }) => events.includes(line.event))
    .filter(({ line }) => matches(line.when, facts) && unseen(line, context))
    .filter(({ line }) => !(line.voice === 'GOD' && event.layer >= GOD_SILENT_FROM_LAYER))
    // A line whose placeholder has no value stays silent rather than print a brace.
    .filter(({ line }) => placeholdersIn(line.text).every(name => values[name] !== undefined))
    // Lower tier first, then more criteria, then the order of the file.
    .sort((a, b) => a.line.tier - b.line.tier || specificity(b.line) - specificity(a.line) || a.order - b.order)

  const taken = new Set(context.shownThisBattle.filter(shown => shown.beat === beat).map(shown => slotOf(shown.voice)))
  let budget = capFor(event.kind) - context.shownThisBattle.filter(countsTowardCap).length
  const chosen: StoryLine[] = []
  for (const { line } of eligible) {
    const slot = slotOf(line.voice)
    if (taken.has(slot)) continue
    // Over the cap the answer is silence. The list is sorted by tier, so every
    // later line for this slot is capped too: nothing weaker slips through.
    if (countsTowardCap(line)) {
      if (budget <= 0) continue
      budget -= 1
    }
    taken.add(slot)
    chosen.push({
      id: line.id, voice: line.voice, text: fillText(line.text, values), tier: line.tier,
      event: line.event, beat, ...(line.quote ? { quote: line.quote } : {}),
    })
  }
  return chosen.sort((a, b) => SPEAKING_ORDER.indexOf(a.voice) - SPEAKING_ORDER.indexOf(b.voice))
}

// "Suspended {duration}." in plain words; the device fires after a minute away.
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.floor(ms / 60_000))
  const say = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (minutes < 60) return say(minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? say(hours, 'hour') : say(Math.floor(hours / 24), 'day')
}

export type LineFacts = { attempt: number; iteration: number; count?: number }
export type LineMemory = { seenRun?: readonly string[]; seenEver?: readonly string[] }
type Battle = { shown: ShownLine[]; lines: StoryLine[]; lastLineTurn: number }

const freshBattle = (): Battle => ({ shown: [], lines: [], lastLineTurn: 0 })

// The bookkeeping around selectLines: what has been shown this battle, this
// run and ever. Feed it every story event; it answers with the lines to show
// and remembers them. Persisting what it remembers is the caller's job.
export class LineSession {
  private seenRun: Set<string>
  private seenEver: Set<string>
  private battle: Battle = freshBattle()

  constructor(memory: LineMemory = {}, private pool: readonly ScriptLine[] = script.lines) {
    this.seenRun = new Set(memory.seenRun)
    this.seenEver = new Set(memory.seenEver)
  }

  handle(event: LineEvent, facts: LineFacts, duration?: string): StoryLine[] {
    // A new battle forgets the last one's lines; the run and the save do not.
    if (event.type === 'battle_start') this.battle = freshBattle()
    const lines = selectLines(event, {
      ...facts,
      duration,
      seenRun: [...this.seenRun],
      seenEver: [...this.seenEver],
      shownThisBattle: this.battle.shown,
      turnsSinceLastLine: Math.max(0, event.turn - this.battle.lastLineTurn),
    }, this.pool)
    for (const line of lines) {
      this.battle.shown.push({ id: line.id, voice: line.voice, tier: line.tier, beat: line.beat })
      this.battle.lines.push(line)
      this.seenRun.add(line.id)
      this.seenEver.add(line.id)
    }
    // The opening line is spoken before turn 1, so it counts as turn 0.
    if (lines.length) this.battle.lastLineTurn = event.type === 'battle_start' ? 0 : event.turn
    return lines
  }

  // The tab was hidden for `hiddenMs` and is back. Call it outside resolution.
  resume(at: Pick<StoryEvent, 'encounter' | 'layer' | 'kind' | 'turn'>, facts: LineFacts, hiddenMs: number): StoryLine[] {
    return this.handle({ ...at, type: 'resume' }, facts, formatDuration(hiddenMs))
  }

  // A new run forgets run-scoped lines; 'ever' lines stay spent.
  newRun(): void {
    this.seenRun.clear()
    this.battle = freshBattle()
  }

  linesThisBattle(): readonly StoryLine[] { return this.battle.lines }
  seenThisRun(): string[] { return [...this.seenRun] }
  seenOnThisSave(): string[] { return [...this.seenEver] }
}

// The ids behind transcript entries, for seeding a session after a reload when
// only { voice, text } was stored. A placeholder matches any filled-in value.
export function lineIdsFromTexts(entries: readonly { voice: string; text: string }[], pool: readonly ScriptLine[] = script.lines): string[] {
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = pool.map(line => ({
    line,
    pattern: new RegExp(`^${line.text.split(/\{\w+\}/).map(escape).join('.+')}$`),
  }))
  const ids = new Set<string>()
  for (const entry of entries) {
    const hit = patterns.find(({ line, pattern }) => line.voice === entry.voice && pattern.test(entry.text))
    if (hit) ids.add(hit.line.id)
  }
  return [...ids]
}
