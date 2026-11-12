import { BASH_PRESETS, MAX_ACTIONS } from './battle-config'
import type { AttackStep, BattleState, Coord, EnemyState } from './battle-types'

export function inAttackRange(origin: Coord, target: Coord, step: AttackStep): boolean {
  const dx = Math.abs(origin.x - target.x)
  const dy = Math.abs(origin.y - target.y)
  if (dx === 0 && dy === 0) return false
  if (step.shape === 'square') return Math.max(dx, dy) <= step.range
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
  if (step.mode === 'manhattan') {
    return Math.abs(state.player.pos.x - target.pos.x) + Math.abs(state.player.pos.y - target.pos.y)
  }
  if (step.mode === 'random') return attackRoll(state, stepIndex, target.id)
  return step.amount
}

export function presetFor(state: BattleState) {
  return BASH_PRESETS[state.player.activeBash]
}


export type PredictedHit = {
  enemyId: string
  stepIndex: number
  damage: number
  before: number
  after: number
}

export function predictedSequence(state: BattleState, presetIndex = state.player.activeBash, stepsOverride?: number): PredictedHit[] {
  const steps = stepsOverride ?? releaseCount(state)
  const hp = Object.fromEntries(state.enemies.filter(enemy => enemy.robustness > 0).map(enemy => [enemy.id, enemy.robustness]))
  const shields = Object.fromEntries(state.enemies.filter(enemy => enemy.robustness > 0).map(enemy => [enemy.id, enemy.block]))
  const hits: PredictedHit[] = []
  let focus = state.player.focusReady ? 2 : 0
  for (const [stepIndex, step] of BASH_PRESETS[presetIndex].steps.slice(0, steps).entries()) {
    const candidates = state.enemies.filter(enemy => hp[enemy.id] > 0 && inAttackRange(state.player.pos, enemy.pos, step))
    const targets = step.area === 'all'
      ? candidates
      : candidates.sort((a, b) => {
          const distanceA = Math.abs(state.player.pos.x - a.pos.x) + Math.abs(state.player.pos.y - a.pos.y)
          const distanceB = Math.abs(state.player.pos.x - b.pos.x) + Math.abs(state.player.pos.y - b.pos.y)
          return distanceA - distanceB || a.id.localeCompare(b.id)
        }).slice(0, 1)
    for (const target of targets) {
      const damage = stepDamage(step, state, target, stepIndex) + focus
      focus = 0
      const absorbed = Math.min(Math.max(0, shields[target.id] - (step.pierce ?? 0)), damage)
      shields[target.id] -= absorbed
      const before = hp[target.id]
      hp[target.id] = Math.max(0, before - (damage - absorbed))
      hits.push({ enemyId: target.id, stepIndex, damage, before, after: hp[target.id] })
    }
  }
  return hits
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
    ? '5×5 square / center excluded'
    : `Cross / arm length ${step.range} / center excluded`
}
