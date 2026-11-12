import { predictedSequence } from './attack-methods'
import { isWarpLocked, livingEnemies, sameCoord } from './battle-rules'
import type { BattleState, Coord, DesireStep, EnemyState } from './battle-types'

export type PredictedEnemyHit = {
  enemyId: string
  stepIndex: number
  damage: number
  absorbed: number
  dealt: number
  before: number
  after: number
  origin: Coord
  target: Coord
  shape: DesireStep['shape']
  range: number
  width?: number
}

export function desireStepsFor(enemy: EnemyState): DesireStep[] {
  return enemy.desireSteps ?? enemy.desire.map(amount => ({
    amount,
    range: enemy.desireRange,
    shape: enemy.desireShape,
  }))
}

export function desireInRange(origin: Coord, target: Coord, step: DesireStep): boolean {
  const dx = Math.abs(origin.x - target.x)
  const dy = Math.abs(origin.y - target.y)
  if (dx === 0 && dy === 0) return false
  if (step.shape === 'square') return Math.max(dx, dy) <= step.range
  if (step.shape === 'rectangle') return Math.max(dx, dy) <= step.range && Math.min(dx, dy) <= (step.width ?? 1)
  return (dx === 0) !== (dy === 0) && dx + dy <= step.range
}

function effectiveEnemies(state: BattleState, playerPos: Coord, playerStepsOverride?: number): EnemyState[] {
  const playerHits = predictedSequence({ ...state, player: { ...state.player, pos: playerPos } }, undefined, playerStepsOverride)
  return livingEnemies(state).map(enemy => {
    if (!enemy.bossStages?.length || enemy.stage >= enemy.bossStages.length) return enemy
    const hits = playerHits.filter(hit => hit.enemyId === enemy.id)
    const projected = hits.length ? hits[hits.length - 1].after : enemy.robustness
    if (projected <= 0 || projected / enemy.maxRobustness > (enemy.breakdownAt ?? 0.5)) return enemy
    const next = enemy.bossStages.find(stage => stage.stage === enemy.stage + 1)
    return next ? { ...enemy, ...next, stage: next.stage } : enemy
  })
}

export function predictedEnemySequence(state: BattleState, playerPos?: Coord, playerStepsOverride?: number): PredictedEnemyHit[] {
  const moves = state.actions.filter(action => action.type === 'move')
  const targetPos = playerPos ?? (moves.length ? moves[moves.length - 1].to : state.player.pos)
  const removed = new Set(moves.map(action => `${action.to.x},${action.to.y}`))
  const counts = { bash: 0, privilege: 0, core: 0, overload: 0, blank: 0 }
  for (const action of moves) counts[action.flag]++
  let block = state.player.block + counts.privilege * 2
  let healing = 0
  const counters = Object.fromEntries(state.player.buffs.map(buff => [buff.id, buff.counter]))
  for (let i = 0; i < counts.core; i++) {
    for (const buff of state.player.buffs) {
      counters[buff.id]++
      if (counters[buff.id] < buff.threshold) continue
      counters[buff.id] = 0
      if (buff.id === 'repair') healing += 4
      if (buff.id === 'firewall') block += 4
    }
  }
  let sanity = Math.min(state.player.maxSanity, state.player.sanity + healing)
  const hits: PredictedEnemyHit[] = []

  for (const enemy of effectiveEnemies(state, targetPos, playerStepsOverride)) {
    let cursor = { ...enemy.pos }
    const enemyCounts = { bash: 0, privilege: 0, core: 0, overload: 0, blank: 0 }
    for (const pos of enemy.route) {
      if (sameCoord(pos, targetPos) || isWarpLocked(state, pos)) break
      cursor = { ...pos }
      const key = `${pos.x},${pos.y}`
      const flag = removed.has(key) ? 'blank' : state.flags[pos.y][pos.x]
      enemyCounts[flag]++
      removed.add(key)
    }
    const steps = desireStepsFor(enemy).slice(0, enemyCounts.bash)
    for (const [stepIndex, step] of steps.entries()) {
      if (!desireInRange(cursor, targetPos, step)) continue
      const absorbed = Math.min(block, step.amount)
      block -= absorbed
      const before = sanity
      const dealt = Math.min(before, step.amount - absorbed)
      sanity = Math.max(0, before - dealt)
      hits.push({
        enemyId: enemy.id, stepIndex, damage: step.amount, absorbed, dealt, before, after: sanity,
        origin: { ...cursor }, target: { ...targetPos }, shape: step.shape, range: step.range, width: step.width,
      })
    }
  }
  return hits
}
