import { simulateRelease } from './attack-methods'
import { MAX_ACTIONS } from './battle-config'
import { isWarpLocked, livingEnemies, manhattan } from './battle-rules'
import { BattleStore } from './battle-store'
import type { BattleAction, BattleState, Coord, FlagKind } from './battle-types'
import { WARDEN_ENCOUNTER } from './encounters'
import type { Encounter } from './encounters'
import { predictedEnemyResources, predictedEnemySequence, predictedPlayerResources } from './enemy-attack-methods'
import { traceLevel } from './mechanics'
import type { Carry } from './tuning'
import { runCarry } from '../campaign/campaign-store'
import type { CampaignStore, RunState } from '../campaign/campaign-store'

// A headless player, for measuring the encounters. It plays through the same
// store the shell does and reads the same forecast the panels print, so a
// battle it wins is one a person could win with what is on screen.
//
// 'strong' weighs everything the forecast says: damage and kills against
// Sanity lost and REPAIR gained, Core and Overload collected, what the Geeks
// are left to collect, and the TRACE deadline. It spends Sanity while Sanity
// is cheap and guards it as it runs out. 'careless' takes whichever route
// with a Bash Flag hits hardest and never reads what is coming back: it
// shows how hard a fight punishes a player who only looks at their own damage.
export type BotPolicy = 'strong' | 'careless'

type Route = { cells: Coord[]; flags: FlagKind[] }

// What one route does this turn, as the game's own forecast gives it.
type Forecast = {
  steps: number
  bash: number
  // Robustness taken off, Geeks brought to zero, and whether that is all of them.
  dealt: number
  kills: number
  won: boolean
  // Sanity the enemy phase takes, and what REPAIR gives back after it.
  sanityLost: number
  lethal: boolean
  healed: number
  // PRIVILEGE the route's Flags give. It is gone when the turn ends, so it is
  // worth exactly the Sanity it saves, which `sanityLost` already counts.
  privilege: number
  core: number
  // Overload charge from Flags and from interactions.
  charge: number
  // What the Geeks left standing take from their own routes.
  enemyRecovery: number
  enemySecurity: number
  births: number
  // From the route's end to the nearest Geek left standing.
  distance: number
}

const DIRECTIONS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

// Routes are compared on at most this many Geek route cells; a board with
// more of them still plays, with a few equal-looking routes kept apart.
const ROUTE_BITS = 20

function plannedEnd(state: BattleState): Coord {
  for (let index = state.actions.length - 1; index >= 0; index--) {
    const action = state.actions[index]
    if (action.type === 'move') return action.to
  }
  return state.player.pos
}

// Every route the remaining action points allow, each Warp entered once.
// Two routes that end on the same cell with the same Flags and cross the
// same Geek routes forecast identically, so only the first is kept.
function routesFrom(state: BattleState, budget: number): Route[] {
  const size = state.boardSize
  const shut = new Uint8Array(size * size)
  state.walls.forEach((row, y) => row.forEach((solid, x) => { if (solid || isWarpLocked(state, { x, y })) shut[y * size + x] = 1 }))
  const bits = new Map<number, number>()
  for (const enemy of livingEnemies(state)) {
    shut[enemy.pos.y * size + enemy.pos.x] = 1
    for (const cell of enemy.route) {
      const at = cell.y * size + cell.x
      if (!bits.has(at) && bits.size < ROUTE_BITS) bits.set(at, bits.size)
    }
  }
  for (const action of state.actions) if (action.type === 'move') shut[action.to.y * size + action.to.x] = 1

  const routes: Route[] = []
  const seen = new Set<number>()
  const cells: Coord[] = []
  const flags: FlagKind[] = []
  const counts: Record<FlagKind, number> = { bash: 0, privilege: 0, core: 0, overload: 0, blank: 0 }
  const walk = (x: number, y: number, crossed: number): void => {
    const signature = (((((y * size + x) * 9 + cells.length) * 9 + counts.bash) * 9 + counts.privilege) * 9 + counts.core) * 9 + counts.overload
    const key = signature * 2 ** ROUTE_BITS + crossed
    if (!seen.has(key)) {
      seen.add(key)
      routes.push({ cells: [...cells], flags: [...flags] })
    }
    if (cells.length >= budget) return
    for (const [dx, dy] of DIRECTIONS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      const at = ny * size + nx
      if (shut[at]) continue
      const flag = state.flags[ny][nx]
      shut[at] = 1
      cells.push({ x: nx, y: ny })
      flags.push(flag)
      counts[flag]++
      walk(nx, ny, bits.has(at) ? crossed | 1 << bits.get(at)! : crossed)
      counts[flag]--
      flags.pop()
      cells.pop()
      shut[at] = 0
    }
  }
  const from = plannedEnd(state)
  walk(from.x, from.y, 0)
  return routes
}

// The state the forecast functions are asked about: the route queued after
// what is already planned, and the player standing at its end.
function planState(state: BattleState, route: Route): BattleState {
  const moves: BattleAction[] = route.cells.map((to, index) => ({ type: 'move', to, flag: route.flags[index] }))
  const actions = [...state.actions, ...moves]
  const plan = { ...state, actions }
  return { ...plan, player: { ...state.player, pos: plannedEnd(plan) } }
}

function forecast(state: BattleState, route: Route): Forecast {
  const plan = planState(state, route)
  const release = simulateRelease(plan)
  const standing = release.enemies.filter(enemy => enemy.hp > 0)
  const incoming = predictedEnemySequence(plan)
  const resources = predictedPlayerResources(plan)
  const sanityAfter = incoming.length ? incoming[incoming.length - 1].after : state.player.sanity
  const lethal = sanityAfter <= 0
  let enemyRecovery = 0
  let enemySecurity = 0
  let births = 0
  for (const enemy of standing) {
    const outcome = predictedEnemyResources(plan, enemy.id)
    enemyRecovery += outcome.recovery
    enemySecurity += outcome.securityGain
    if (outcome.brood) births++
  }
  const count = (kind: FlagKind): number => route.flags.filter(flag => flag === kind).length
  const room = state.tuning.overloadThreshold - state.player.overload
  return {
    steps: route.cells.length,
    bash: count('bash'),
    dealt: release.hits.reduce((total, hit) => total + hit.dealt, 0),
    kills: release.enemies.length - standing.length,
    won: standing.length === 0,
    sanityLost: state.player.sanity - sanityAfter,
    lethal,
    healed: lethal ? 0 : Math.min(resources.healing, state.player.maxSanity - sanityAfter),
    privilege: resources.privilegeGain,
    core: count('core'),
    charge: Math.max(0, Math.min(room, count('overload') + release.hits.reduce((total, hit) => total + hit.charge, 0))),
    enemyRecovery, enemySecurity, births,
    distance: standing.length ? Math.min(...standing.map(enemy => manhattan(enemy.pos, plan.player.pos))) : 0,
  }
}

// How the strong player trades one thing for another. A point of damage
// dealt is the unit.
const WEIGH = {
  dealt: 1, kill: 5, core: 0.4, charge: 1.2,
  enemyRecovery: 0.9, enemySecurity: 0.4, birth: 7, distance: 0.25,
  // A point of Sanity is worth `sanity` with the bar full and `sanity + strain`
  // with it empty; the last `reserve` points are worth `last` more each.
  sanity: 0.3, strain: 4, reserve: 6, last: 3,
  // Robustness cleared in a turn at an ordinary pace; what damage counts for
  // once TRACE is due, and how much more for each turn after; the TRACE level
  // from which it stops hiding.
  pace: 6, late: 2.5, urgency: 0.5, lastStand: 8,
}

// What the point of Sanity at `level` is worth. The top of the bar is cheap:
// PATCH and the restore after a boss stop at the maximum, so Sanity held
// above them is given back anyway, and a turn saved is worth more than the
// points it costs. It gets dear quickly as the bar empties. (Plain products
// only, so every machine scores a route the same.)
function sanityWorth(level: number, max: number): number {
  const missing = 1 - level / max
  return WEIGH.sanity + WEIGH.strain * missing * missing + (level <= WEIGH.reserve ? WEIGH.last : 0)
}

// The worth of every point between two levels; negative when Sanity falls.
function sanityChange(from: number, to: number, max: number): number {
  let worth = 0
  for (let level = Math.min(from, to) + 1; level <= Math.max(from, to); level++) worth += sanityWorth(level, max)
  return to < from ? -worth : worth
}

// TRACE is a public deadline. Damage counts for more when the Robustness
// still standing cannot be cleared at an ordinary pace before it, and for
// more again every turn after it: waiting then only makes the next turn worse.
function traceUrgency(state: BattleState): number {
  if (state.trace === null) return 1
  if (state.trace === 0) return WEIGH.late + WEIGH.urgency * traceLevel(state)
  const standing = livingEnemies(state).reduce((total, enemy) => total + enemy.robustness, 0)
  return Math.max(1, Math.min(WEIGH.late, standing / (state.trace * WEIGH.pace)))
}

function strongScore(state: BattleState, f: Forecast): number {
  if (f.won) return 1e6 - f.steps
  // It does not hide from a clock that only runs one way: once TRACE has
  // risen this far, dying a turn later is no better than dying now.
  if (f.lethal) return (traceLevel(state) >= WEIGH.lastStand ? -1e3 : -1e6) + f.dealt
  const { sanity, maxSanity } = state.player
  const urgency = traceUrgency(state)
  return (f.dealt * WEIGH.dealt + f.kills * WEIGH.kill) * urgency
    + sanityChange(sanity, sanity - f.sanityLost + f.healed, maxSanity)
    + f.core * WEIGH.core + f.charge * WEIGH.charge
    - f.enemyRecovery * WEIGH.enemyRecovery - f.enemySecurity * WEIGH.enemySecurity - f.births * WEIGH.birth
    - f.distance * WEIGH.distance
}

// Only its own damage counts, and only routes that pick up a Bash Flag; with
// nothing to hit it walks at the nearest Geek.
function carelessScore(_state: BattleState, f: Forecast): number {
  if (f.won) return 1e6 - f.steps
  return (f.bash ? 1000 : 0) + f.dealt * 10 - f.distance - f.steps * 0.01
}

const SCORE: Record<BotPolicy, (state: BattleState, f: Forecast) => number> = { strong: strongScore, careless: carelessScore }

function bestRoute(state: BattleState, policy: BotPolicy): Route {
  let best: Route = { cells: [], flags: [] }
  let bestScore = -Infinity
  for (const route of routesFrom(state, MAX_ACTIONS - state.actions.length)) {
    const score = SCORE[policy](state, forecast(state, route))
    if (score > bestScore) {
      bestScore = score
      best = route
    }
  }
  return best
}

// Overload fires the other deck's four methods from the end of what is
// planned so far, so where to fire from is a route of its own.
function overloadFrom(state: BattleState, route: Route): { dealt: number; kills: number } {
  const plan = planState(state, route)
  const before = livingEnemies(plan)
  const sim = simulateRelease(plan, 1 - plan.player.activeBash, 4, true)
  return {
    dealt: sim.hits.reduce((total, hit) => total + hit.dealt, 0),
    kills: before.length - sim.enemies.filter(enemy => enemy.hp > 0).length,
  }
}

// The strong player walks to where the burst hits hardest, keeps the Flags
// on the way, and holds the charge when the burst would be wasted. The
// careless one fires from where it stands as soon as anything is in reach.
function overloadRoute(state: BattleState, policy: BotPolicy): Route | null {
  if (state.player.overload < state.tuning.overloadThreshold) return null
  const room = MAX_ACTIONS - state.actions.length - 1
  if (room < 0) return null
  const reach = policy === 'careless' ? 0 : Math.min(room, 4)
  let best: Route | null = null
  let bestScore = 0
  for (const route of routesFrom(state, reach)) {
    const burst = overloadFrom(state, route)
    if (!burst.dealt) continue
    if (policy === 'strong' && burst.dealt < 5 && !burst.kills) continue
    const kept = route.flags.filter(flag => flag !== 'blank').length
    const score = burst.dealt + burst.kills * WEIGH.kill + kept * 0.4 - route.cells.length * 0.5
    if (score > bestScore) {
      bestScore = score
      best = route
    }
  }
  return best
}

// Plans one turn on the store: the moves are queued and an Overload, if one
// is worth firing, has already fired. The turn itself is not executed.
export function planTurn(store: BattleStore, policy: BotPolicy = 'strong'): void {
  if (store.getSnapshot().phase !== 'planning') return
  const burst = overloadRoute(store.getSnapshot(), policy)
  if (burst) {
    for (const cell of burst.cells) store.addMove(cell)
    store.useOverload()
    // The burst may have ended the battle.
    if (store.getSnapshot().phase !== 'planning') return
  }
  for (const cell of bestRoute(store.getSnapshot(), policy).cells) store.addMove(cell)
}

// The store paces a turn with timers even under reduced motion. A headless
// battle has no one to pace it for: while `run` resolves, every timer fires
// as a microtask, so nothing else can interleave before the clock is put back.
async function withoutPacing<T>(run: () => Promise<T>): Promise<T> {
  const real = globalThis.setTimeout
  globalThis.setTimeout = ((handler: () => void) => {
    queueMicrotask(handler)
    return 0
  }) as unknown as typeof globalThis.setTimeout
  try {
    return await run()
  } finally {
    globalThis.setTimeout = real
  }
}

export type BattleOptions = {
  policy?: BotPolicy
  // A battle still undecided after this many turns is reported as 'timeout'.
  maxTurns?: number
  // False keeps the store's own pacing, for watching the bot play in a browser.
  instant?: boolean
}

export type BattleReport = {
  encounter: string
  policy: BotPolicy
  result: 'victory' | 'gameover' | 'timeout'
  // The turn the battle ended on.
  turns: number
  sanityStart: number
  sanityEnd: number
  // Start minus end: what the battle cost the run, REPAIR included.
  sanityLost: number
  // Every point of Sanity damage taken, before REPAIR gave any back.
  damageTaken: number
  overloads: number
  // The boss's stage when the battle ended; absent in a skirmish.
  stage?: number
}

export const DEFAULT_MAX_TURNS = 40

// Plays the battle loaded on the store to its end.
export async function playBattle(store: BattleStore, options: BattleOptions = {}): Promise<BattleReport> {
  const policy = options.policy ?? 'strong'
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS
  // Reduced motion for this battle only: nothing is written to storage.
  store.getSnapshot().reducedMotion = true
  if (store.getSnapshot().phase === 'title') store.start()
  const sanityStart = store.getSnapshot().player.sanity
  let damageTaken = 0
  let overloads = 0
  // Each hit is committed on its own, so every fall in Sanity is seen here.
  let seen = sanityStart
  const unsubscribe = store.subscribe(() => {
    const { sanity } = store.getSnapshot().player
    if (sanity < seen) damageTaken += seen - sanity
    seen = sanity
  })
  try {
    while (store.getSnapshot().phase === 'planning' && store.getSnapshot().turn <= maxTurns) {
      planTurn(store, policy)
      if (store.getSnapshot().actions.some(action => action.type === 'overload')) overloads++
      if (store.getSnapshot().phase !== 'planning') break
      await (options.instant === false ? store.executeTurn() : withoutPacing(() => store.executeTurn()))
      // Let whatever else is waiting on the event loop run between turns.
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    }
  } finally {
    unsubscribe()
  }
  const state = store.getSnapshot()
  const boss = state.enemies.find(enemy => enemy.bossStages?.length)
  return {
    encounter: state.encounter.id, policy,
    result: state.phase === 'victory' ? 'victory' : state.phase === 'gameover' ? 'gameover' : 'timeout',
    turns: state.turn,
    sanityStart, sanityEnd: state.player.sanity, sanityLost: sanityStart - state.player.sanity,
    damageTaken, overloads,
    ...(boss ? { stage: boss.stage } : {}),
  }
}

// One encounter on a store of its own.
export async function fight(encounter: Encounter, options: BattleOptions & { carry?: Carry } = {}): Promise<BattleReport> {
  const store = new BattleStore()
  store.getSnapshot().reducedMotion = true
  store.load(encounter, options.carry)
  return playBattle(store, options)
}

// Weights in the order a player who knows the game would take them.
const WEIGHT_ORDER = [
  'repair_threshold', 'shell_privilege', 'overload_threshold', 'firewall_threshold',
  'repair_heal', 'max_sanity', 'firewall_privilege', 'focus_start',
]

// A weight lasts the run and PATCH does not, so PATCH is taken only when it
// is needed: at half Sanity or less, or at two thirds with the boss next.
export function sensibleWeight(offer: string[], run: RunState): string {
  const { maxSanity } = run.tuning
  const bossNext = run.broken.filter(id => id.startsWith(`${run.layer}.`)).length >= 2
  if (offer.includes('patch') && run.sanity * (bossNext ? 3 : 2) <= maxSanity * (bossNext ? 2 : 1)) return 'patch'
  return WEIGHT_ORDER.find(id => offer.includes(id)) ?? offer[0]
}

export type RunOptions = BattleOptions & {
  // Which two skirmish nodes to break in a layer, in order. Default: the first two.
  nodes?: (layer: number) => string[]
  pickWeight?: (offer: string[], run: RunState) => string
  // The run is given up after this many defeats; 0 stops at the first.
  maxDefeats?: number
}

export type RunBattle = BattleReport & { weights: string[]; reward?: string }

export type RunReport = {
  battles: RunBattle[]
  outcome: 'gate' | 'defeat'
  defeats: number
  // Sanity standing at the gate, after the last boss's restore.
  sanity: number
  weights: string[]
}

// A whole run through the campaign store, as the shell drives it: prologue,
// two nodes and the boss of each layer, a weight after each skirmish.
export async function playRun(campaign: CampaignStore, options: RunOptions = {}): Promise<RunReport> {
  const nodes = options.nodes ?? ((layer: number) => [`${layer}.1`, `${layer}.2`])
  const pickWeight = options.pickWeight ?? sensibleWeight
  const maxDefeats = options.maxDefeats ?? 0
  const store = new BattleStore()
  store.getSnapshot().reducedMotion = true
  const battles: RunBattle[] = []
  let defeats = 0
  const battle = async (encounter: Encounter, carry?: Carry): Promise<void> => {
    store.load(encounter, carry)
    const report = await playBattle(store, options)
    battles.push({ ...report, weights: [...(campaign.getSnapshot().run?.weights ?? [])] })
    if (report.result === 'victory') campaign.battleWon(report.sanityEnd)
    else {
      defeats++
      campaign.battleLost()
    }
  }
  campaign.boot('?intro=0')
  campaign.startRun()
  // Every pass of the loop either ends a battle or leaves a scene, and a run
  // has a bounded number of each; the cap only guards against a broken store.
  for (let guard = 0; guard < 400; guard++) {
    const { scene, run, offer } = campaign.getSnapshot()
    if (!run || scene === 'gate' || defeats > maxDefeats) break
    if (scene === 'battle') {
      // Only the prologue is entered without a node being selected.
      await battle(WARDEN_ENCOUNTER)
    } else if (scene === 'map') {
      const wanted = [...nodes(run.layer), `${run.layer}.B`].find(id => campaign.nodeState(id) === 'open')
      const encounter = wanted ? campaign.selectNode(wanted) : null
      if (!encounter) break
      const carry = runCarry(campaign.getSnapshot().run ?? run)
      campaign.beginBattle()
      await battle(encounter, carry)
    } else if (scene === 'reward' && offer) {
      const choice = pickWeight(offer, run)
      battles[battles.length - 1].reward = choice
      campaign.chooseWeight(choice)
    } else if (scene === 'interlude') campaign.finishInterlude()
    else if (scene === 'reset') campaign.finishReset()
    else break
  }
  const end = campaign.getSnapshot()
  return {
    battles, defeats,
    outcome: end.scene === 'gate' ? 'gate' : 'defeat',
    sanity: end.run?.sanity ?? 0,
    weights: end.run?.weights ?? [],
  }
}

// The run as a table: one row a battle.
export function runTable(report: RunReport): string {
  const head = 'node  result    turns  in  out  lost  taken  ovl  reward'
  const rows = report.battles.map(battle => [
    battle.encounter.padEnd(5), battle.result.padEnd(9), String(battle.turns).padStart(5),
    String(battle.sanityStart).padStart(3), String(battle.sanityEnd).padStart(4), String(battle.sanityLost).padStart(5),
    String(battle.damageTaken).padStart(6), String(battle.overloads).padStart(4), ` ${battle.reward ?? ''}`,
  ].join(' '))
  const last = report.battles[report.battles.length - 1]
  const foot = report.outcome === 'gate'
    ? `gate reached: ${last.sanityEnd} Sanity left after ${last.encounter}, ${report.sanity} after its restore`
    : `run ended in defeat at ${last.encounter}`
  const held = `defeats ${report.defeats}; weights ${report.weights.join(', ') || 'none'}`
  return [head, ...rows, foot, held].join('\n')
}
