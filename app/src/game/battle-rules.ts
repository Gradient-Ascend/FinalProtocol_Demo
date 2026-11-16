import { BOARD_SIZE, FLAG_WEIGHTS } from './battle-config'
import { WARDEN_ENCOUNTER } from './encounters'
import type { Encounter } from './encounters'
import { createMechanic, traceLeft } from './mechanics'
import { DEFAULT_LOADOUT, buildPresets } from './skills'
import type { Loadout } from './skills'
import { DEFAULT_TUNING } from './tuning'
import type { Carry } from './tuning'
import type { AttackPreset, BattleState, Coord, Curtain, EnemyBehavior, EnemyDefinition, EnemyState, FlagKind } from './battle-types'

export function mulberry32(seed: number): () => number {
  return () => {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export function coordKey(pos: Coord): string {
  return `0x${pos.x.toString(16).toUpperCase()}${pos.y.toString(16).toUpperCase()}`
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y
}

export function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

export function inside(pos: Coord): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < BOARD_SIZE && pos.y < BOARD_SIZE
}

export function randomFlag(random: () => number, weights: [FlagKind, number][] = FLAG_WEIGHTS): FlagKind {
  let roll = random() * weights.reduce((total, [, weight]) => total + weight, 0)
  for (const [kind, weight] of weights) {
    roll -= weight
    if (roll <= 0) return kind
  }
  return 'blank'
}

export function livingEnemies(state: BattleState): EnemyState[] {
  return state.enemies.filter(enemy => enemy.robustness > 0)
}

// The encounter's boss, standing or fallen; a skirmish has none.
export function bossOf(state: BattleState): EnemyState | undefined {
  return state.enemies.find(enemy => enemy.bossStages?.length)
}

export function isOccupied(state: BattleState, pos: Coord): boolean {
  return sameCoord(state.player.pos, pos) || livingEnemies(state).some(enemy => sameCoord(enemy.pos, pos))
}

export function isWarpLocked(state: BattleState, pos: Coord): boolean {
  return state.curtains.some(curtain => curtain.locked && (curtain.axis === 'column' ? curtain.index === pos.x : curtain.index === pos.y))
}

export function canEnter(state: BattleState, from: Coord, to: Coord): boolean {
  return inside(to) && manhattan(from, to) === 1 && !state.walls[to.y][to.x] && !isWarpLocked(state, to) && !isOccupied(state, to)
}

// Where a Geek's walk along its route ends. A pushed or pulled Geek carries
// its route with it, so the walk also stops at walls and at other Geeks.
export function routeStops(state: BattleState, pos: Coord, playerPos: Coord, others: Coord[]): boolean {
  return !inside(pos) || state.walls[pos.y][pos.x] || sameCoord(pos, playerPos) || isWarpLocked(state, pos)
    || others.some(other => sameCoord(other, pos))
}

export function curtainLabel(curtain: Curtain): string {
  return `${curtain.axis === 'column' ? 'C' : 'R'}${curtain.index.toString(16).toUpperCase().padStart(2, '0')}`
}

// A curtain is scheduled two full planning turns before it fires. Its target is
// fixed at scheduling time and cannot follow the player's later route.
export function scheduleCurtains(state: BattleState, fireTurn: number): void {
  const boss = livingEnemies(state).find(enemy => enemy.bossStages?.length)
  // Curtains are the Warden's rule: no other boss draws one.
  if (!boss || state.encounter.mechanic !== 'curtain') { state.curtains = []; return }
  const stage = boss.bossStages?.find(candidate => candidate.stage === boss.stage) ?? boss.bossStages?.[0]
  const primaryAxis = state.curtainCycle % 2 === 0 ? 'column' as const : 'row' as const
  const lines: Curtain[] = [{
    axis: primaryAxis,
    index: primaryAxis === 'column' ? state.player.pos.x : state.player.pos.y,
    fireTurn, locked: false, unlockTurn: null,
  }]
  if (stage?.curtainLines === 2) {
    const secondaryAxis = primaryAxis === 'column' ? 'row' as const : 'column' as const
    lines.push({
      axis: secondaryAxis,
      index: secondaryAxis === 'column' ? state.player.pos.x : state.player.pos.y,
      fireTurn, locked: false, unlockTurn: null,
    })
  }
  state.curtains = lines
  state.curtainCycle++
}

export function advanceCurtains(state: BattleState): { type: 'lock' | 'unlock'; curtain: Curtain }[] {
  const events: { type: 'lock' | 'unlock'; curtain: Curtain }[] = []
  const remaining: Curtain[] = []
  for (const curtain of state.curtains) {
    if (curtain.locked && curtain.unlockTurn === state.turn) {
      events.push({ type: 'unlock', curtain })
      continue
    }
    if (!curtain.locked && curtain.fireTurn === state.turn) {
      curtain.locked = true
      curtain.unlockTurn = state.turn + 1
      events.push({ type: 'lock', curtain })
    }
    remaining.push(curtain)
  }
  state.curtains = remaining
  if (!state.curtains.length && livingEnemies(state).some(enemy => enemy.bossStages?.length)) {
    scheduleCurtains(state, state.turn + 2)
  }
  return events
}

const FLAG_PRIORITY: Record<EnemyBehavior, FlagKind[]> = {
  hunter: ['bash', 'core', 'privilege', 'overload', 'blank'],
  collector: ['overload', 'bash', 'core', 'privilege', 'blank'],
  disruptor: ['core', 'bash', 'overload', 'privilege', 'blank'],
  warden: ['bash', 'privilege', 'core', 'overload', 'blank'],
  // Led by Flags like a collector, but it wants Core: its Soul is its rule.
  grazer: ['core', 'bash', 'privilege', 'overload', 'blank'],
}

function flagScore(behavior: EnemyBehavior, flag: FlagKind): number {
  return FLAG_PRIORITY[behavior].length - FLAG_PRIORITY[behavior].indexOf(flag) - 1
}

function purgeTarget(state: BattleState, enemy: EnemyState, endpoint: Coord): Coord | null {
  const candidates: Coord[] = []
  for (let y = endpoint.y - 1; y <= endpoint.y + 1; y++) {
    for (let x = endpoint.x - 1; x <= endpoint.x + 1; x++) {
      const pos = { x, y }
      if (!inside(pos) || state.walls[y][x] || state.flags[y][x] === 'blank' || isWarpLocked(state, pos)) continue
      if (enemy.route.some(routePos => sameCoord(routePos, pos)) || isOccupied(state, pos)) continue
      candidates.push(pos)
    }
  }
  candidates.sort((a, b) => {
    const flagA = state.flags[a.y][a.x]
    const flagB = state.flags[b.y][b.x]
    return flagScore('disruptor', flagB) - flagScore('disruptor', flagA)
      || manhattan(a, state.player.pos) - manhattan(b, state.player.pos)
      || a.y - b.y || a.x - b.x
  })
  return candidates[0] ?? null
}

// Routes are exposed during planning and never re-rolled after the player commits.
export function enemyRoutes(state: BattleState): void {
  const reserved = new Set(livingEnemies(state).map(enemy => `${enemy.pos.x},${enemy.pos.y}`))
  for (const enemy of livingEnemies(state)) {
    enemy.route = []
    enemy.effectCell = null
    let cursor = { ...enemy.pos }
    const visited = new Set([`${cursor.x},${cursor.y}`])
    reserved.delete(`${cursor.x},${cursor.y}`)
    for (let step = 0; step < enemy.routeLength; step++) {
      const options = [
        { x: cursor.x + 1, y: cursor.y }, { x: cursor.x - 1, y: cursor.y },
        { x: cursor.x, y: cursor.y + 1 }, { x: cursor.x, y: cursor.y - 1 },
      ].filter(pos => inside(pos) && !state.walls[pos.y][pos.x] && !reserved.has(`${pos.x},${pos.y}`)
        && !visited.has(`${pos.x},${pos.y}`) && !sameCoord(pos, state.player.pos) && !isWarpLocked(state, pos))
      options.sort((a, b) => {
        const distanceA = manhattan(a, state.player.pos)
        const distanceB = manhattan(b, state.player.pos)
        if (enemy.behavior === 'hunter' || enemy.behavior === 'warden') {
          return distanceA - distanceB
            || flagScore(enemy.behavior, state.flags[b.y][b.x]) - flagScore(enemy.behavior, state.flags[a.y][a.x])
            || a.y - b.y || a.x - b.x
        }
        return flagScore(enemy.behavior, state.flags[b.y][b.x]) - flagScore(enemy.behavior, state.flags[a.y][a.x])
          || distanceA - distanceB || a.y - b.y || a.x - b.x
      })
      const next = options[0]
      if (!next || ((enemy.behavior === 'hunter' || enemy.behavior === 'warden')
        && manhattan(next, state.player.pos) >= manhattan(cursor, state.player.pos))) break
      enemy.route.push(next)
      reserved.add(`${next.x},${next.y}`)
      visited.add(`${next.x},${next.y}`)
      cursor = next
    }
    if (!enemy.route.length && state.flags[cursor.y][cursor.x] !== 'blank' && !isWarpLocked(state, cursor)) {
      enemy.route.push({ ...cursor })
    }
    if (enemy.behavior === 'disruptor') enemy.effectCell = purgeTarget(state, enemy, cursor)
    reserved.add(`${cursor.x},${cursor.y}`)
  }
}

// A Geek as it stands when it enters the board, from the roster or from a birth.
export function createEnemy(definition: EnemyDefinition): EnemyState {
  return {
    ...definition,
    pos: { ...definition.pos },
    desire: [...definition.desire],
    desireSteps: definition.desireSteps?.map(step => ({ ...step })),
    bossStages: definition.bossStages?.map(stage => ({
      ...stage,
      desire: [...stage.desire],
      desireSteps: stage.desireSteps?.map(step => ({ ...step })),
    })),
    maxRobustness: definition.robustness,
    // MYSTERY is already in place on the first turn.
    block: definition.mystery ?? 0,
    soulCounter: 0,
    stage: 1,
    route: [],
    effectCell: null,
    statuses: definition.bossStages ? ['DESIRE', 'SECURITY', 'SOUL', 'BREAKDOWN'] : ['DESIRE', 'SECURITY', 'SOUL'],
    live: 0, breached: false, shifted: false, struck: false, dropped: 0,
  }
}

// With no encounter this is the Warden battle. A run passes the encounter it
// selected and what it carries in: Sanity and the numbers its weights changed.
export function createInitialState(
  muted = false, reducedMotion = false, loadout: Loadout = DEFAULT_LOADOUT,
  encounter: Encounter = WARDEN_ENCOUNTER, carry?: Carry,
): BattleState {
  const random = mulberry32(encounter.seed)
  const weights = encounter.flagWeights ?? FLAG_WEIGHTS
  const flags = Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => randomFlag(random, weights)))
  const walls = Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => false))
  for (const [x, y] of encounter.walls) walls[y][x] = true
  for (const [key, flag] of Object.entries(encounter.explicitFlags ?? {})) {
    const [x, y] = key.split(',').map(Number)
    flags[y][x] = flag
  }
  const incoming = Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => randomFlag(random, weights)))
  const tuning = { ...(carry?.tuning ?? DEFAULT_TUNING) }
  const sanity = carry && Number.isFinite(carry.sanity)
    ? Math.max(1, Math.min(tuning.maxSanity, Math.round(carry.sanity)))
    : tuning.maxSanity
  const enemies = encounter.enemies.map(createEnemy)
  const state: BattleState = {
    presets: buildPresets(loadout),
    phase: 'title', resumePhase: null, turn: 1, boardSize: BOARD_SIZE,
    flags, incoming, walls, curtains: [], curtainCycle: 0,
    player: {
      pos: { ...encounter.playerStart }, sanity, maxSanity: tuning.maxSanity, block: 0, overload: 0,
      activeBash: 0, focusReady: false,
      buffs: [
        { id: 'repair', name: 'REPAIR', counter: 0, threshold: tuning.repairThreshold, description: `+${tuning.repairHeal} Sanity` },
        {
          id: 'focus', name: 'FOCUS', counter: Math.max(0, Math.min(tuning.focusStart, tuning.focusThreshold - 1)),
          threshold: tuning.focusThreshold, description: 'Next Bash hit tags LIVE',
        },
        { id: 'firewall', name: 'FIREWALL', counter: 0, threshold: tuning.firewallThreshold, description: `+${tuning.firewallPrivilege} PRIVILEGE` },
      ],
    },
    playerTrail: [{ ...encounter.playerStart }],
    enemies,
    actions: [], resolvedMoves: 0, enemyPhaseIndex: 0, playerAttackResolved: false, enemyResourcePreviews: {}, absorbedTotals: {}, interactionCharge: 0, log: [],
    muted, reducedMotion, message: '', attackPreview: null, enemyAttackPreview: null, overloadArmed: false,
    incomingForecast: null, outgoingForecast: null, pendingRepair: 0, resourcesResolved: false,
    encounter, tuning, mechanic: createMechanic(encounter, enemies), trace: traceLeft(encounter, 1),
  }
  scheduleCurtains(state, 3)
  enemyRoutes(state)
  return state
}

export function refillBoard(state: BattleState, random: () => number, changedColumns?: ReadonlySet<number>): void {
  const weights = state.encounter.flagWeights ?? FLAG_WEIGHTS
  for (let x = 0; x < BOARD_SIZE; x++) {
    if (changedColumns && !changedColumns.has(x)) continue
    let bottom = BOARD_SIZE - 1
    while (bottom >= 0) {
      if (state.walls[bottom][x]) { bottom--; continue }
      let top = bottom
      while (top >= 0 && !state.walls[top][x]) top--
      const remaining: FlagKind[] = []
      for (let y = bottom; y > top; y--) {
        const flag = state.flags[y][x]
        if (flag !== 'blank') remaining.push(flag)
      }
      let index = 0
      for (let y = bottom; y > top; y--) {
        state.flags[y][x] = index < remaining.length
          ? remaining[index++]
          : state.incoming[x].shift() ?? randomFlag(random, weights)
      }
      while (state.incoming[x].length < BOARD_SIZE) state.incoming[x].push(randomFlag(random, weights))
      bottom = top - 1
    }
  }
}

export function activePreset(state: BattleState): AttackPreset {
  return state.presets[state.player.activeBash]
}
