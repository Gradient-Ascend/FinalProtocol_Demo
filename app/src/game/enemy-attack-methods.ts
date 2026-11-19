import { simulateRelease } from './attack-methods'
import { livingEnemies, routeStops } from './battle-rules'
import { broods, securityAfterResolve } from './mechanics'
import type {
  BattleState, Coord, DesireStep, EnemyResourcePreview, EnemyState, FlagKind, PlayerResourcePreview, PredictedEnemyHit,
} from './battle-types'
export type { EnemyResourcePreview, PlayerResourcePreview, PredictedEnemyHit } from './battle-types'

export function desireStepsFor(enemy: EnemyState): DesireStep[] {
  return enemy.desireSteps ?? enemy.desire.map(amount => ({
    amount,
    range: enemy.desireRange,
    shape: enemy.desireShape,
  }))
}

// A Desire step dropped by a skill is taken off the end of the release, even
// below a boss's guaranteed steps.
export function desireReleaseCount(enemy: EnemyState, bashCount: number): number {
  return Math.max(0, Math.max(enemy.desireFloor ?? 0, bashCount) - (enemy.dropped ?? 0))
}

export function desireInRange(origin: Coord, target: Coord, step: DesireStep): boolean {
  const dx = Math.abs(origin.x - target.x)
  const dy = Math.abs(origin.y - target.y)
  if (dx === 0 && dy === 0) return false
  if (step.shape === 'square') return Math.max(dx, dy) <= step.range
  if (step.shape === 'rectangle') return Math.max(dx, dy) <= step.range && Math.min(dx, dy) <= (step.width ?? 1)
  return (dx === 0) !== (dy === 0) && dx + dy <= step.range
}

export function predictedPlayerResources(state: BattleState): PlayerResourcePreview {
  const moves = state.actions.filter(action => action.type === 'move')
  const counts = { bash: 0, privilege: 0, core: 0, overload: 0, blank: 0 }
  for (const action of moves) counts[action.flag]++
  const { tuning } = state
  let blockAfterResources = state.player.block + counts.privilege * tuning.privilegePerFlag
  let healingPotential = 0
  const counters = Object.fromEntries(state.player.buffs.map(buff => [buff.id, buff.counter]))
  for (let i = 0; i < counts.core; i++) {
    for (const buff of state.player.buffs) {
      counters[buff.id]++
      if (counters[buff.id] < buff.threshold) continue
      counters[buff.id] = 0
      if (buff.id === 'repair') healingPotential += tuning.repairHeal
      if (buff.id === 'firewall') blockAfterResources += tuning.firewallPrivilege
    }
  }
  // REPAIR heals after the enemy phase, so it is reported as an amount and
  // never changes what the incoming hits take.
  return {
    healing: healingPotential,
    privilegeGain: blockAfterResources - state.player.block,
    blockAfterResources,
  }
}

// The board as the player's release will leave it: who is still alive, where
// they stand, the routes they carry, the Desire steps they dropped and the
// route Flags that were blanked. Once the release has resolved, the live state
// already is that board.
function projectedBoard(state: BattleState, playerPos: Coord, playerStepsOverride?: number): { enemies: EnemyState[]; blanked: Set<string> } {
  if (state.phase === 'resolving' && (state.playerAttackResolved || state.outgoingForecast)) {
    return { enemies: livingEnemies(state), blanked: new Set() }
  }
  const sim = simulateRelease({ ...state, player: { ...state.player, pos: playerPos } }, undefined, playerStepsOverride, playerStepsOverride !== undefined)
  const enemies = livingEnemies(state).flatMap(enemy => {
    const after = sim.enemies.find(candidate => candidate.id === enemy.id)
    if (!after || after.hp <= 0) return []
    const moved: EnemyState = {
      ...enemy, pos: after.pos, route: after.route, effectCell: after.effectCell, robustness: after.hp,
      live: after.live, dropped: after.dropped,
    }
    if (!enemy.bossStages?.length || enemy.stage >= enemy.bossStages.length) return [moved]
    if (after.hp / enemy.maxRobustness > (enemy.breakdownAt ?? 0.5)) return [moved]
    const next = enemy.bossStages.find(stage => stage.stage === enemy.stage + 1)
    // A Breakdown also empties the Soul counter and drops Security, as the store does.
    return [next ? { ...moved, ...next, stage: next.stage, soulCounter: 0, block: 0 } : moved]
  })
  return { enemies, blanked: sim.blanked }
}

// Walks every Geek still to act along its route, in order, and reports where
// each ends and what it collects. A Geek's PURGE erases its cell when its own
// walk is over, so only the Geeks acting after it find that Flag gone.
function projectedWalks(state: BattleState, targetPos: Coord, playerStepsOverride?: number) {
  const moves = state.actions.filter(action => action.type === 'move')
  const board = projectedBoard(state, targetPos, playerStepsOverride)
  const removed = new Set([...moves.map(action => `${action.to.x},${action.to.y}`), ...board.blanked])
  const positions = new Map(board.enemies.map(enemy => [enemy.id, enemy.pos]))
  return board.enemies.filter((_, index) => index >= state.enemyPhaseIndex).map(enemy => {
    let cursor = { ...enemy.pos }
    const counts = { bash: 0, privilege: 0, core: 0, overload: 0, blank: 0 }
    for (const pos of enemy.route) {
      const others = [...positions].filter(([id]) => id !== enemy.id).map(([, other]) => other)
      if (routeStops(state, pos, targetPos, others)) break
      cursor = { ...pos }
      const key = `${pos.x},${pos.y}`
      counts[removed.has(key) ? 'blank' : state.flags[pos.y][pos.x]]++
      removed.add(key)
    }
    if (enemy.effectCell) removed.add(`${enemy.effectCell.x},${enemy.effectCell.y}`)
    positions.set(enemy.id, cursor)
    return { enemy, cursor, counts }
  })
}

// What a Geek's resolve does with the Privilege and Core Flags on its route.
// The store resolves through this same function, so the forecast and the turn
// cannot drift apart: a full Soul counter heals, or on a BROOD Geek queues a
// birth; MYSTERY tops Security up to its fixed value.
export function enemyResourceOutcome(state: BattleState, enemy: EnemyState, privilege: number, core: number): EnemyResourcePreview {
  const securityGain = securityAfterResolve(enemy, privilege * enemy.securityPerFlag)
  const soulCounterAfter = enemy.soulCounter + core
  if (soulCounterAfter < enemy.soulThreshold) return { securityGain, recovery: 0, soulCounterAfter }
  if (broods(state, enemy)) return { securityGain, recovery: 0, soulCounterAfter: 0, brood: true }
  return { securityGain, recovery: Math.min(enemy.soulHeal, enemy.maxRobustness - enemy.robustness), soulCounterAfter: 0 }
}

export function predictedEnemyResources(state: BattleState, enemyId: string, playerStepsOverride?: number): EnemyResourcePreview {
  const moves = state.actions.filter(action => action.type === 'move')
  const targetPos = moves.length ? moves[moves.length - 1].to : state.player.pos
  const walk = projectedWalks(state, targetPos, playerStepsOverride).find(candidate => candidate.enemy.id === enemyId)
  if (!walk) return { securityGain: 0, recovery: 0, soulCounterAfter: 0 }
  return enemyResourceOutcome(state, walk.enemy, walk.counts.privilege, walk.counts.core)
}

export function predictedEnemySequence(state: BattleState, playerPos?: Coord, playerStepsOverride?: number): PredictedEnemyHit[] {
  const moves = state.actions.filter(action => action.type === 'move')
  const targetPos = playerPos ?? (moves.length ? moves[moves.length - 1].to : state.player.pos)
  let block = predictedPlayerResources(state).blockAfterResources
  let sanity = state.player.sanity
  const hits: PredictedEnemyHit[] = []
  for (const { enemy, cursor, counts } of projectedWalks(state, targetPos, playerStepsOverride)) {
    const steps = desireStepsFor(enemy).slice(0, desireReleaseCount(enemy, counts.bash))
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

export type PredictedEnemyStep = {
  stepIndex: number
  step: DesireStep
  sure: boolean
  armed: boolean
  hitsPlayer: boolean
  origin: Coord
}

export type PredictedEnemyIntent = {
  endpoint: Coord
  counts: Record<FlagKind, number>
  releaseCount: number
  steps: PredictedEnemyStep[]
}

/** Projects an enemy's walk endpoint, armed Desire steps, and whether each hits the player. */
export function predictedEnemyIntent(
  state: BattleState,
  enemyId: string,
  playerStepsOverride?: number,
): PredictedEnemyIntent | null {
  if (state.phase === 'victory' || state.phase === 'gameover') return null
  const moves = state.actions.filter(action => action.type === 'move')
  const targetPos = moves.length ? moves[moves.length - 1].to : state.player.pos
  const walk = projectedWalks(state, targetPos, playerStepsOverride).find(candidate => candidate.enemy.id === enemyId)
  if (!walk) return null
  const { enemy, cursor, counts } = walk
  const sureCount = Math.max(0, (enemy.desireFloor ?? 0) - (enemy.dropped ?? 0))
  const releaseCount = desireReleaseCount(enemy, counts.bash)
  const steps: PredictedEnemyStep[] = desireStepsFor(enemy).map((step, stepIndex) => {
    const armed = stepIndex < releaseCount
    return {
      stepIndex,
      step,
      sure: stepIndex < sureCount,
      armed,
      hitsPlayer: armed && desireInRange(cursor, targetPos, step),
      origin: { ...cursor },
    }
  })
  return { endpoint: { ...cursor }, counts: { ...counts }, releaseCount, steps }
}
