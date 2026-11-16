import type { BattleState, EnemyState } from '@/game/battle-types'
import { layerName } from '@/game/encounters'
import { desireStepsFor } from '@/game/enemy-attack-methods'
import { disclosed, traceLevel } from '@/game/mechanics'
import { fillText, layerAt } from '@/story/script'

// What the battle panels print that is not a plain number: the words for a
// boss's stage, its rule, TRACE, a Geek's habits. Nothing here draws, and
// nothing here prints a number the sandbox withholds.

export const ROMAN = ['I', 'II', 'III', 'IV']
export const WITHHELD = '?'

// 'WARDEN', 'QUEEN IN RED': the part of a boss's name before its epithet.
export function bossTitle(boss: Pick<EnemyState, 'name'>): string {
  return boss.name.split(' / ')[0]
}

// The one that does not speak has acts, not stages.
function stageWord(state: BattleState): string {
  return state.mechanic?.kind === 'undisclosed' ? 'ACT' : 'STAGE'
}

// The protocol panel's heading: the boss and its stage, or in a skirmish the
// layer and the node.
export function protocolHeading(state: BattleState, boss: EnemyState | undefined): string {
  if (!boss) return `${layerName(state.encounter.layer)} / ${state.encounter.name}`
  if (boss.robustness <= 0) return `${bossTitle(boss)} / FALLEN`
  return `${bossTitle(boss)} / ${stageWord(state)} ${ROMAN[boss.stage - 1] ?? boss.stage}`
}

// A number of this Geek's, or the mark that stands for one the sandbox withholds.
export function shown(state: BattleState, enemy: EnemyState, value: number): string {
  return disclosed(state, enemy) ? String(value) : WITHHELD
}

// Where the boss breaks down, or what its Breakdown did.
export function breakdownText(state: BattleState, boss: EnemyState): string {
  const stages = boss.bossStages?.length ?? 0
  if (boss.stage < stages) {
    return `AT ${shown(state, boss, Math.ceil(boss.maxRobustness * (boss.breakdownAt ?? 0.5)))} ROBUSTNESS`
  }
  const kind = state.mechanic?.kind
  if (kind === 'curtain') return 'SPENT / DUAL CURTAIN'
  if (kind === 'brood') return 'SPENT / BROOD QUICKENS'
  if (kind === 'articles') return 'SPENT / DOCKET EVERY TURN'
  if (kind === 'undisclosed') return 'SPENT / MYSTERY ENDED'
  return 'SPENT'
}

export type TraceText = { value: string; note: string; tone: 'far' | 'near' | 'rising' }

// TRACE as the panel prints it: a countdown, then what it has added.
export function traceText(state: BattleState): TraceText | null {
  if (state.trace === null) return null
  if (state.trace > 1) return { value: `T−${state.trace}`, note: 'THEN EVERY DESIRE +1 A TURN', tone: 'far' }
  if (state.trace === 1) return { value: 'T−1', note: 'DESIRE +1 WHEN THIS TURN ENDS', tone: 'near' }
  return { value: `+${traceLevel(state)}`, note: 'ON EVERY DESIRE, RISING', tone: 'rising' }
}

// Whether the route on the plan is still to be walked, so that what lies on
// it may be forecast. Not once the battle is over. And not while an Overload
// is armed that would leave no Geek standing: that release fires at once,
// from the planned endpoint, and the battle ends there with the route never
// walked. `release` is the armed release as the planner forecasts it.
export function routeAhead(
  state: Pick<BattleState, 'phase' | 'overloadArmed' | 'enemies'>, release: readonly { enemyId: string; after: number }[],
): boolean {
  if (state.phase === 'victory' || state.phase === 'gameover') return false
  if (!state.overloadArmed) return true
  const left = new Map(release.map(hit => [hit.enemyId, hit.after]))
  return state.enemies.some(enemy => (left.get(enemy.id) ?? enemy.robustness) > 0)
}

// A key for each hit still to land on one Geek's bar, given the release step
// of each in order. One step can hit a Geek twice (struck, then bumped into),
// so the step alone is not a key. Hits of one step are counted from the last:
// hits land from the front, and the key of one still to come does not change
// as the ones before it land.
export function segmentKeys(steps: readonly number[]): string[] {
  return steps.map((step, at) => `${step}-${steps.slice(at + 1).filter(later => later === step).length}`)
}

type Spoken = { voice: string; event?: string }

// A boss speaks through its protocol panel, and the one that does not speak
// has its stage directions there: neither is a line under the board. What is
// said over the end of a battle belongs to the outcome overlay.
export function speaksInPanel(line: Spoken): boolean {
  return (line.voice === 'BOSS' || line.voice === 'STAGE') && line.event !== 'victory' && line.event !== 'defeat'
}

// The last thing the panel was told to say in this battle. It stands until
// the next one replaces it.
export function panelLine<T extends Spoken>(lines: readonly T[]): T | undefined {
  for (let i = lines.length - 1; i >= 0; i--) if (speaksInPanel(lines[i])) return lines[i]
  return undefined
}

// Where in a battle's lines a new line goes so that it follows exactly
// `begun` of the lines shown under the board.
export function tickerInsertAt(lines: readonly Spoken[], begun: number): number {
  let seen = 0
  for (let i = 0; i < lines.length; i++) {
    if (speaksInPanel(lines[i])) continue
    if (seen === begun) return i
    seen += 1
  }
  return lines.length
}

// The transcript as far as it has been shown. A line is recorded when it is
// chosen, which for a line under the board can be a turn before it appears:
// each line still waiting takes its newest entry out of what the pause screen
// calls the context.
export function heardSoFar<T extends { voice: string; text: string }>(
  transcript: readonly T[], waiting: readonly { voice: string; text: string }[],
): T[] {
  const left = [...waiting]
  const heard: T[] = []
  for (let i = transcript.length - 1; i >= 0; i--) {
    const entry = transcript[i]
    const at = left.findIndex(line => line.voice === entry.voice && line.text === entry.text)
    if (at >= 0) left.splice(at, 1)
    else heard.push(entry)
  }
  return heard.reverse()
}

export type BossRule = { name: string; text: string; counter?: string }

// The rule of the boss being fought, in the script's words. The Warden's
// Curtain has no entry there: its panel is the Curtain list itself.
export function bossRule(state: BattleState): BossRule | null {
  if (state.encounter.kind !== 'boss') return null
  const boss = layerAt(state.encounter.layer)?.boss
  if (!boss || boss.mechanic !== state.encounter.mechanic) return null
  return { name: boss.mechanicName, text: boss.mechanicRule, counter: boss.counter }
}

// "4 OF 1000", from the script's template.
export function broodCount(rule: BossRule | null, count: number): string {
  return fillText(rule?.counter ?? '{count} OF 1000', { count })
}

// What a Geek's route is drawn toward, in the board's own words: Flags,
// Warps, purges. The rules call these hunter, collector, disruptor, grazer.
export function behaviourText(enemy: Pick<EnemyState, 'behavior' | 'routeLength'>): string {
  if (enemy.routeLength === 0) return 'DOES NOT MOVE'
  if (enemy.behavior === 'collector') return 'TAKES OVERLOAD, THEN BASH'
  if (enemy.behavior === 'disruptor') return 'TAKES CORE · PURGES A WARP'
  if (enemy.behavior === 'grazer') return 'TAKES CORE, THEN BASH'
  return 'CLOSES ON YOU'
}

export type DesireChip = { numeral: string; amount: string; sure: boolean }

// A Geek's Desire steps in the order it releases them. The first `desireFloor`
// are released whatever its route collects; a step dropped by a skill comes
// off that count for the turn.
export function desireChips(state: BattleState, enemy: EnemyState): DesireChip[] {
  const sure = Math.max(0, (enemy.desireFloor ?? 0) - (enemy.dropped ?? 0))
  return desireStepsFor(enemy).map((step, index) => ({
    numeral: ROMAN[index] ?? String(index + 1),
    amount: shown(state, enemy, step.amount),
    sure: index < sure,
  }))
}

// 'I SURE', 'I–II SURE': which steps need no Bash Flag.
export function sureText(chips: readonly DesireChip[]): string {
  const sure = chips.filter(chip => chip.sure)
  if (!sure.length) return ''
  return `${sure.length > 1 ? `${sure[0].numeral}–${sure[sure.length - 1].numeral}` : sure[0].numeral} SURE`
}

// What stands in the name slot of a Geek that has no name to print: one of
// the layer's glitch tokens, chosen by what its card shows. The same card
// gives the same token, so it changes only when the card does.
export function glitchName(layer: number, signature: string): string {
  const tokens = layerAt(layer)?.god?.glitch ?? layerAt(3)?.god?.glitch ?? ['']
  let hash = 0x811c9dc5
  for (let i = 0; i < signature.length; i++) hash = Math.imul(hash ^ signature.charCodeAt(i), 0x01000193)
  return tokens[(hash >>> 0) % tokens.length]
}
