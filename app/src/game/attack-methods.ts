import { BASH_PRESETS, MAX_ACTIONS, PLAYER_FUNCTIONS } from './battle-config'
import { livingEnemies, manhattan } from './battle-rules'
import type { AttackStep, BattleState, Coord, EnemyState } from './battle-types'

export function inAttackRange(origin: Coord, target: Coord, step: AttackStep): boolean {
  const dx = Math.abs(origin.x - target.x)
  const dy = Math.abs(origin.y - target.y)
  if (dx === 0 && dy === 0) return false
  if (step.shape === 'square') return Math.max(dx, dy) <= step.range
  if (step.shape === 'rectangle') return Math.max(dx, dy) <= step.range && Math.min(dx, dy) <= (step.width ?? 1)
  return (dx === 0) !== (dy === 0) && dx + dy <= step.range
}

export function releaseCount(state: BattleState): number {
  const bash = state.actions.filter(action => action.type === 'move' && action.flag === 'bash').length
  const remaining = MAX_ACTIONS - state.actions.length
  return Math.min(4, bash, remaining)
}

export function attackRoll(state: BattleState, stepIndex: number, targetId: string): number {
  const key = `${state.turn}:${state.player.pos.x},${state.player.pos.y}:${state.actions.length}:${stepIndex}:${targetId}`
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 4
}

export function stepDamage(step: AttackStep, state: BattleState, target: EnemyState, stepIndex: number): number {
  if (step.mode === 'manhattan') return manhattan(state.player.pos, target.pos)
  if (step.mode === 'random') return attackRoll(state, stepIndex, target.id)
  return step.amount
}

export function presetFor(state: BattleState) {
  return BASH_PRESETS[state.player.activeBash]
}

export type PredictedHit = {
  enemyId: string
  presetIndex: number
  stepIndex: number
  damage: number
  absorbed: number
  dealt: number
  focus: number
  before: number
  after: number
}

// This pure sequence planner is the single source of truth for both the yellow
// forecast and real damage. Applying a preview can never drift from its rules.
export function predictedSequence(state: BattleState, presetIndex = state.player.activeBash, stepsOverride?: number): PredictedHit[] {
  const steps = stepsOverride ?? releaseCount(state)
  const hp = Object.fromEntries(livingEnemies(state).map(enemy => [enemy.id, enemy.robustness]))
  const shields = Object.fromEntries(livingEnemies(state).map(enemy => [enemy.id, enemy.block]))
  const hits: PredictedHit[] = []
  let focusReady = state.player.focusReady
  for (const [stepIndex, step] of BASH_PRESETS[presetIndex].steps.slice(0, steps).entries()) {
    const candidates = livingEnemies(state).filter(enemy => hp[enemy.id] > 0 && inAttackRange(state.player.pos, enemy.pos, step))
    const targets = step.area === 'all'
      ? candidates
      : candidates.sort((a, b) => manhattan(state.player.pos, a.pos) - manhattan(state.player.pos, b.pos) || a.id.localeCompare(b.id)).slice(0, 1)
    for (const target of targets) {
      const focus = focusReady ? PLAYER_FUNCTIONS.focusBonus : 0
      focusReady = false
      const damage = stepDamage(step, state, target, stepIndex) + focus
      const absorbed = Math.min(Math.max(0, shields[target.id] - (step.pierce ?? 0)), damage)
      shields[target.id] -= absorbed
      const before = hp[target.id]
      const dealt = Math.min(before, damage - absorbed)
      const after = Math.max(0, before - dealt)
      hp[target.id] = after
      hits.push({ enemyId: target.id, presetIndex, stepIndex, damage, absorbed, dealt, focus, before, after })
    }
  }
  return hits
}

export function predictedDamage(state: BattleState, presetIndex = state.player.activeBash, stepsOverride?: number): Record<string, number> {
  const result: Record<string, number> = {}
  for (const hit of predictedSequence(state, presetIndex, stepsOverride)) {
    result[hit.enemyId] = (result[hit.enemyId] ?? 0) + hit.dealt
  }
  return result
}

export function mechanicText(step: AttackStep): string {
  if (step.mode === 'manhattan') return 'Deal damage equal to the target’s Manhattan distance.'
  if (step.mode === 'random') return 'Deal a deterministic random 0–3 damage.'
  const targets = step.area === 'all' ? ' every Geek in range' : ' the nearest Geek'
  const pierce = step.pierce ? `; pierce ${step.pierce} Security` : ''
  return `Deal ${step.amount} damage to ${targets}${pierce}.`
}

export function rangeText(step: AttackStep): string {
  return step.shape === 'square'
    ? `${step.range * 2 + 1}×${step.range * 2 + 1} square / center excluded`
    : `Cross / arm length ${step.range} / center excluded`
}
