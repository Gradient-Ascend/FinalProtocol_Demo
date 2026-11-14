import { INTERACTIONS, MAX_ACTIONS } from './battle-config'
import { IGNORES_SECURITY, SKILLS } from './skills'
import { inside, isWarpLocked, livingEnemies, manhattan, sameCoord } from './battle-rules'
import type { AttackStep, BattleState, Coord, EnemyMarks, EnemyState, PredictedHit } from './battle-types'
export type { PredictedHit } from './battle-types'

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

export function attackRoll(state: BattleState, stepIndex: number, targetId: string, sides = 4): number {
  const key = `${state.turn}:${state.player.pos.x},${state.player.pos.y}:${state.actions.length}:${stepIndex}:${targetId}`
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % sides
}

export function stepDamage(step: AttackStep, state: BattleState, target: EnemyState, stepIndex: number): number {
  // For these two modes `amount` is the slot's modifier: a bonus on top of the
  // distance, or the highest value the roll can reach.
  if (step.mode === 'manhattan') return Math.max(0, manhattan(state.player.pos, target.pos) + step.amount)
  if (step.mode === 'random') return attackRoll(state, stepIndex, target.id, step.amount + 1)
  return step.amount
}

export function presetFor(state: BattleState) {
  return state.presets[state.player.activeBash]
}

type SimEnemy = EnemyMarks & { id: string; pos: Coord; hp: number; block: number; route: Coord[]; effectCell: Coord | null }

export type ReleaseSim = {
  hits: PredictedHit[]
  // Every Geek that was alive before the release, as the release leaves it.
  enemies: SimEnemy[]
  // Route Flags the release overwrote with Blank, as "x,y" keys.
  blanked: Set<string>
}

// One step from `from` toward `to` along the longer axis; a tie goes sideways.
function axisStep(from: Coord, to: Coord): Coord {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) }
}

// FOCUS that the planned Core Flags will complete counts as ready, so the
// forecast made before the walk matches the release after it.
function focusWillBeReady(state: BattleState): boolean {
  if (state.player.focusReady) return true
  if (state.resourcesResolved) return false
  const focus = state.player.buffs.find(buff => buff.id === 'focus')
  const core = state.actions.filter(action => action.type === 'move' && action.flag === 'core').length
  return !!focus && focus.counter + core >= focus.threshold
}

// This pure planner is the single source of truth for the yellow forecast,
// the enemy forecast and the real release: the store applies exactly the hits
// it returns. `immediate` is an Overload fired mid-plan, from the route's end
// while the route is still to be walked.
export function simulateRelease(state: BattleState, presetIndex = state.player.activeBash, stepsOverride?: number, immediate = false): ReleaseSim {
  const steps = stepsOverride ?? releaseCount(state)
  const origin = state.player.pos
  const enemies: SimEnemy[] = livingEnemies(state).map(enemy => ({
    id: enemy.id, pos: { ...enemy.pos }, hp: enemy.robustness, block: enemy.block,
    route: enemy.route.map(pos => ({ ...pos })), effectCell: enemy.effectCell ? { ...enemy.effectCell } : null,
    live: enemy.live, breached: enemy.breached, shifted: enemy.shifted, struck: enemy.struck, dropped: enemy.dropped,
  }))
  const hits: PredictedHit[] = []
  const blanked = new Set<string>()
  // A LIVE tag written by a skill cannot be read in the same release: it is
  // set up now and cashed in by the next release or an Overload.
  const fresh = new Set<string>()
  const walked = state.actions.flatMap(action => action.type === 'move' ? [action.to] : [])
  let focusReady = immediate ? state.player.focusReady : focusWillBeReady(state)
  let budget = Math.max(0, INTERACTIONS.chargeCap - state.interactionCharge)
  const earn = (): number => budget > 0 ? (budget--, 1) : 0
  const open = (pos: Coord): boolean => inside(pos) && !state.walls[pos.y][pos.x] && !isWarpLocked(state, pos)
  // What stops a Geek entering a cell: solid ground, another Geek, or the player.
  const obstacle = (pos: Coord, self: SimEnemy): 'solid' | 'player' | SimEnemy | null => {
    if (!open(pos)) return 'solid'
    if (sameCoord(pos, origin) || (immediate && (sameCoord(pos, state.player.pos) || walked.some(cell => sameCoord(cell, pos))))) return 'player'
    return enemies.find(other => other !== self && other.hp > 0 && sameCoord(other.pos, pos)) ?? null
  }
  const snapshot = (enemy: SimEnemy): PredictedHit['marks'] => ({
    pos: { ...enemy.pos }, block: enemy.block, route: enemy.route.map(pos => ({ ...pos })),
    effectCell: enemy.effectCell ? { ...enemy.effectCell } : null,
    live: enemy.live, breached: enemy.breached, shifted: enemy.shifted, struck: enemy.struck, dropped: enemy.dropped,
  })
  // A push or pull. The route is kept as steps relative to the Geek, so it
  // moves with it and is cut where it would leave the board or enter a wall.
  const displace = (enemy: SimEnemy, dir: Coord, word: string, stepIndex: number, events: string[]): { bump: number; charge: number; collateral?: PredictedHit } => {
    const to = { x: enemy.pos.x + dir.x, y: enemy.pos.y + dir.y }
    const blocker = obstacle(to, enemy)
    if (blocker === 'player') return { bump: 0, charge: 0 }
    enemy.shifted = true
    if (!blocker) {
      enemy.pos = to
      const shifted: Coord[] = []
      for (const pos of enemy.route) {
        const next = { x: pos.x + dir.x, y: pos.y + dir.y }
        if (!inside(next) || state.walls[next.y][next.x]) break
        shifted.push(next)
      }
      enemy.route = shifted
      if (enemy.effectCell) {
        const cell = { x: enemy.effectCell.x + dir.x, y: enemy.effectCell.y + dir.y }
        enemy.effectCell = inside(cell) && !state.walls[cell.y][cell.x] ? cell : null
      }
      events.push(word)
      return { bump: 0, charge: 0 }
    }
    events.push('BUMP')
    const charge = earn()
    const bump = Math.min(enemy.hp, INTERACTIONS.bump)
    enemy.hp -= bump
    if (blocker === 'solid') return { bump, charge }
    const before = blocker.hp
    blocker.hp = Math.max(0, before - INTERACTIONS.bump)
    return {
      bump, charge,
      collateral: {
        enemyId: blocker.id, presetIndex, stepIndex, damage: INTERACTIONS.bump, absorbed: 0, dealt: before - blocker.hp,
        focus: 0, before, after: blocker.hp, events: ['BUMP'], marks: snapshot(blocker), charge: 0, silent: true,
      },
    }
  }

  for (const [stepIndex, step] of state.presets[presetIndex].steps.slice(0, steps).entries()) {
    const distance = (enemy: SimEnemy) => manhattan(origin, enemy.pos)
    const candidates = enemies.filter(enemy => enemy.hp > 0 && inAttackRange(origin, enemy.pos, step))
      .sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id))
    const targets = step.area === 'all' ? candidates : candidates.slice(0, 1)
    for (const target of targets) {
      if (target.hp <= 0) continue
      const events: string[] = []
      let charge = 0
      const focus = focusReady ? 1 : 0
      focusReady = false
      // FOCUS marks the first target LIVE before the hit resolves.
      if (focus && !target.live) { target.live = state.turn; events.push('LIVE') }
      const wasLive = target.live > 0 && !fresh.has(target.id)
      let damage = step.mode === 'manhattan' ? Math.max(0, distance(target) + step.amount)
        : step.mode === 'random' ? attackRoll(state, stepIndex, target.id, step.amount + 1)
        : step.amount
      const away = axisStep(origin, target.pos)
      if (step.skill === 'spike') {
        const behind = obstacle({ x: target.pos.x + away.x, y: target.pos.y + away.y }, target)
        if (behind && behind !== 'player') { damage += INTERACTIONS.pinnedBonus; events.push('PINNED') }
      }
      if (step.skill === 'high' && targets.length > 1) { damage += targets.length - 1; events.push('SPREAD') }
      if (step.skill === 'off' && wasLive) damage = step.amount
      if (step.skill === 'ultra') {
        const conditions = (wasLive ? 1 : 0) + (target.breached ? 1 : 0) + (target.shifted ? 1 : 0)
        if (conditions) { damage += conditions; events.push(`RAIL +${conditions}`) }
      }
      if (target.breached) damage += INTERACTIONS.breachBonus
      const blockBefore = target.block
      let pierce = step.pierce ?? 0
      if (step.skill === 'zero' && !target.struck && target.block > 0) {
        target.block -= Math.min(INTERACTIONS.zeroStrip, target.block)
        pierce = 0
      }
      const absorbed = Math.min(Math.max(0, target.block - pierce), damage)
      target.block -= absorbed
      if (blockBefore > 0 && target.block === 0 && !target.breached) {
        target.breached = true
        events.push('BREACH')
        charge += earn()
      }
      const before = target.hp
      let dealt = Math.min(before, damage - absorbed)
      target.hp -= dealt
      target.struck = true
      let blank: Coord | undefined
      let collateral: PredictedHit | undefined
      if (target.hp > 0) {
        if (step.skill === 'base' || step.skill === 'array') {
          const push = step.skill === 'base'
          const result = displace(target, push ? away : { x: -away.x, y: -away.y }, push ? 'PUSH' : 'PULL', stepIndex, events)
          dealt += result.bump
          charge += result.charge
          collateral = result.collateral
        }
        if ((step.skill === 'on' && dealt > 0 || step.skill === 'probe') && !target.live) {
          target.live = state.turn
          fresh.add(target.id)
          events.push('LIVE')
        }
        if (step.skill === 'off' && wasLive) {
          target.live = 0
          target.dropped++
          events.push('DROP')
          charge += earn()
        }
        if (step.skill === 'flood') {
          blank = target.route.find(pos => {
            const key = `${pos.x},${pos.y}`
            return state.flags[pos.y][pos.x] !== 'blank' && !blanked.has(key) && !walked.some(cell => sameCoord(cell, pos))
          })
          if (blank) { blanked.add(`${blank.x},${blank.y}`); events.push('FILL') }
        }
      }
      hits.push({
        enemyId: target.id, presetIndex, stepIndex, damage, absorbed, dealt, focus, before, after: target.hp,
        events, marks: snapshot(target), blank, charge,
      })
      // A collateral bump is listed right after the hit that caused it.
      if (collateral) hits.push(collateral)
    }
  }
  return { hits, enemies, blanked }
}

export function predictedSequence(state: BattleState, presetIndex = state.player.activeBash, stepsOverride?: number, immediate = false): PredictedHit[] {
  return simulateRelease(state, presetIndex, stepsOverride, immediate).hits
}

export function predictedDamage(state: BattleState, presetIndex = state.player.activeBash, stepsOverride?: number): Record<string, number> {
  const result: Record<string, number> = {}
  for (const hit of predictedSequence(state, presetIndex, stepsOverride)) {
    result[hit.enemyId] = (result[hit.enemyId] ?? 0) + hit.dealt
  }
  return result
}

export function mechanicText(step: AttackStep): string {
  const targets = step.area === 'all' ? 'every Geek in range' : 'the nearest Geek'
  const pierce = !step.pierce ? '' : step.pierce >= IGNORES_SECURITY ? '; ignore Security' : `; pierce ${step.pierce} Security`
  if (step.mode === 'manhattan') {
    const bonus = step.amount > 0 ? ` plus ${step.amount}` : step.amount < 0 ? ` minus ${-step.amount}` : ''
    return `Deal damage equal to the Manhattan distance${bonus} to ${targets}${pierce}.`
  }
  if (step.mode === 'random') return `Deal a deterministic random 0–${step.amount} damage to ${targets}${pierce}.`
  return `Deal ${step.amount} damage to ${targets}${pierce}.`
}

export function riderText(step: AttackStep): string {
  return SKILLS.find(skill => skill.id === step.skill)?.rider ?? ''
}

export function rangeText(step: AttackStep): string {
  return step.shape === 'square'
    ? `${step.range * 2 + 1}×${step.range * 2 + 1} square / center excluded`
    : `Cross / arm length ${step.range} / center excluded`
}
