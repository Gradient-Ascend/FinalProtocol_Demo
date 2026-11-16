import script from '../story/script.json'
import { BOARD_SIZE } from './battle-config'
import { createEnemy, isOccupied, isWarpLocked, livingEnemies, manhattan, mulberry32 } from './battle-rules'
import type { Article, ArticleEffect, BattleState, Coord, EnemyState, FlagKind, MechanicState } from './battle-types'
import type { Encounter } from './encounters'
export type { Article, ArticleEffect, MechanicState } from './battle-types'

// The boss rules and TRACE. Each one acts at the turn boundary, or through
// state the pure planners already read, so a forecast made during planning is
// still what the turn does. Nothing here is consulted by `simulateRelease`.

const EFFECTS: ArticleEffect[] = ['swap_bash_privilege', 'swap_core_overload', 'mirror', 'floor_up', 'croquet']

// The Docket's Articles are authored text; an entry with an effect the rules
// do not know is left out rather than enacted as nothing.
export const ARTICLES: Article[] = (script.articles as Article[]).filter(article => EFFECTS.includes(article.effect))

export function articleById(id: string): Article | undefined {
  return ARTICLES.find(article => article.id === id)
}

// Stage I reads out a new Article every 2 turns, Stage II every turn.
function docketInterval(stage: number): number {
  return stage >= 2 ? 1 : 2
}

// The order is drawn once from the encounter's seed and then cycles, so the
// same Article never comes twice running.
function articleOrder(seed: number): string[] {
  const random = mulberry32((seed ^ 0xD0C4E7) >>> 0)
  const ids = ARTICLES.map(article => article.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const held = ids[i]
    ids[i] = ids[j]
    ids[j] = held
  }
  return ids
}

export function mysteryActive(enemy: Pick<EnemyState, 'mystery' | 'stage'>): boolean {
  return enemy.mystery !== undefined && enemy.stage < 2
}

// Security a Geek holds when its resolve ends, given what its route gained.
// The forecast and the store both ask here.
export function securityAfterResolve(enemy: Pick<EnemyState, 'mystery' | 'stage'>, gained: number): number {
  return mysteryActive(enemy) ? Math.max(gained, enemy.mystery ?? 0) : gained
}

// Whether this Geek's full Soul counter is a birth rather than a recovery.
export function broods(state: BattleState, enemy: Pick<EnemyState, 'id' | 'brood'>): boolean {
  return !!enemy.brood && state.mechanic?.kind === 'brood' && state.mechanic.bossId === enemy.id
}

// UNDISCLOSED is a rule about what is printed. The rules never withhold a
// number from themselves; a panel asks here before it prints one.
export function disclosed(_state: BattleState, enemy: Pick<EnemyState, 'undisclosed' | 'live' | 'stage'>): boolean {
  return !enemy.undisclosed || enemy.live > 0 || enemy.stage >= 2
}

// Turns left at base Desire, counting the one given; 0 once TRACE is rising.
export function traceLeft(encounter: Encounter, turn: number): number | null {
  return encounter.trace === undefined ? null : Math.max(0, encounter.trace + 1 - turn)
}

// How much TRACE has added to every Desire step so far.
export function traceLevel(state: BattleState): number {
  return state.encounter.trace === undefined ? 0 : Math.max(0, state.turn - state.encounter.trace)
}

export function createMechanic(encounter: Encounter, enemies: EnemyState[]): MechanicState | null {
  const boss = enemies.find(enemy => enemy.bossStages?.length)
  if (encounter.mechanic === 'curtain') return { kind: 'curtain' }
  if (encounter.mechanic === 'brood') {
    const parent = enemies.find(enemy => enemy.brood)
    if (!parent?.brood) return null
    return { kind: 'brood', bossId: parent.id, births: 0, count: 1, queued: 0, alive: 0, limit: parent.brood.limit }
  }
  if (encounter.mechanic === 'articles') {
    if (!boss || !ARTICLES.length) return null
    const order = articleOrder(encounter.seed)
    // The first Article is pending from turn 1, so it is read for a full
    // planning turn before anything changes.
    return {
      kind: 'articles', bossId: boss.id, order, drawn: 1,
      inForce: null, pending: articleById(order[0]) ?? null,
      pendingTurn: 1 + docketInterval(1), countdown: docketInterval(1),
    }
  }
  if (encounter.mechanic === 'undisclosed') {
    const veiled = enemies.find(enemy => enemy.undisclosed) ?? boss
    if (!veiled) return null
    return { kind: 'undisclosed', bossId: veiled.id, mystery: mysteryActive(veiled) ? veiled.mystery ?? null : null }
  }
  return null
}

// BROOD, during the enemy phase: the birth waits for the turn boundary.
export function queueBirth(state: BattleState): void {
  if (state.mechanic?.kind !== 'brood') return
  state.mechanic = { ...state.mechanic, queued: state.mechanic.queued + 1 }
}

export type MechanicEvent =
  | { type: 'birth'; enemy: EnemyState; births: number; count: number }
  // A queued birth that found the limit already alive, no free cell or no parent.
  | { type: 'birth_lost' }
  // `enacted` is false when the Article took force but had nothing to act on.
  | { type: 'article'; article: Article; repealed: Article | null; enacted: boolean }
  | { type: 'trace'; level: number }

function nearestFreeCell(state: BattleState, origin: Coord): Coord | null {
  let best: Coord | null = null
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const pos = { x, y }
      if (state.walls[y][x] || isOccupied(state, pos) || isWarpLocked(state, pos)) continue
      // Rows are scanned top to bottom, so a tie goes to the upper-left cell.
      if (!best || manhattan(pos, origin) < manhattan(best, origin)) best = pos
    }
  }
  return best
}

function bornAlive(state: BattleState): number {
  return livingEnemies(state).filter(enemy => enemy.born !== undefined).length
}

function placeBirths(state: BattleState, events: MechanicEvent[]): void {
  const mechanic = state.mechanic
  if (mechanic?.kind !== 'brood') return
  const parent = state.enemies.find(enemy => enemy.id === mechanic.bossId)
  const brood = parent && parent.robustness > 0 ? parent.brood : undefined
  let births = mechanic.births
  for (let queued = mechanic.queued; queued > 0; queued--) {
    const cell = parent && brood && bornAlive(state) < brood.limit ? nearestFreeCell(state, parent.pos) : null
    if (!brood || !cell) { events.push({ type: 'birth_lost' }); continue }
    births++
    const enemy = createEnemy({ ...brood.spawn, id: `N${String(births).padStart(2, '0')}`, pos: cell })
    enemy.born = state.turn
    // Appended, so it acts last and no living Geek changes its place in the order.
    state.enemies.push(enemy)
    events.push({ type: 'birth', enemy, births, count: 2 ** births })
  }
  state.mechanic = { ...mechanic, births, count: 2 ** births, queued: 0, alive: bornAlive(state) }
}

function swapFlags(state: BattleState, a: FlagKind, b: FlagKind): void {
  const swap = (flag: FlagKind): FlagKind => flag === a ? b : flag === b ? a : flag
  for (const row of state.flags) row.forEach((flag, x) => { row[x] = swap(flag) })
  for (const column of state.incoming) column.forEach((flag, index) => { column[index] = swap(flag) })
}

// Flags and the queue above them are mirrored left to right; walls and units stay.
function mirrorFlags(state: BattleState): void {
  for (const row of state.flags) row.reverse()
  state.incoming.reverse()
}

// Her guaranteed Desire steps, now and in any stage she has yet to enter, so
// a Breakdown while the Article is in force keeps it in force.
function shiftFloor(enemy: EnemyState, by: number): void {
  enemy.desireFloor = Math.max(0, (enemy.desireFloor ?? 0) + by)
  for (const stage of enemy.bossStages ?? []) stage.desireFloor = Math.max(0, stage.desireFloor + by)
}

function enact(state: BattleState, queen: EnemyState, article: Article): boolean {
  if (article.effect === 'swap_bash_privilege') swapFlags(state, 'bash', 'privilege')
  else if (article.effect === 'swap_core_overload') swapFlags(state, 'core', 'overload')
  else if (article.effect === 'mirror') mirrorFlags(state)
  else if (article.effect === 'floor_up') shiftFloor(queen, 1)
  else {
    // CHANGE PLACES: the farthest living Geek; the earlier in the order on a tie.
    const others = livingEnemies(state).filter(enemy => enemy !== queen)
    if (!others.length) return false
    const partner = others.reduce((far, enemy) => manhattan(enemy.pos, queen.pos) > manhattan(far.pos, queen.pos) ? enemy : far)
    const place = queen.pos
    queen.pos = partner.pos
    partner.pos = place
  }
  return true
}

// Only SENTENCE FIRST lasts; the others changed the board once and are done.
function repeal(queen: EnemyState, article: Article): void {
  if (article.effect === 'floor_up') shiftFloor(queen, -1)
}

function advanceDocket(state: BattleState, events: MechanicEvent[]): void {
  const mechanic = state.mechanic
  if (mechanic?.kind !== 'articles') return
  const queen = state.enemies.find(enemy => enemy.id === mechanic.bossId)
  if (!queen || queen.robustness <= 0) {
    // No one is left to read the next Article out.
    state.mechanic = { ...mechanic, pending: null, countdown: 0 }
    return
  }
  let next = mechanic
  if (mechanic.pending && state.turn >= mechanic.pendingTurn) {
    const article = mechanic.pending
    if (mechanic.inForce) repeal(queen, mechanic.inForce)
    const enacted = enact(state, queen, article)
    events.push({ type: 'article', article, repealed: mechanic.inForce, enacted })
    next = {
      ...mechanic, inForce: article,
      pending: articleById(mechanic.order[mechanic.drawn % mechanic.order.length]) ?? null,
      drawn: mechanic.drawn + 1,
      pendingTurn: state.turn + docketInterval(queen.stage),
    }
  }
  state.mechanic = { ...next, countdown: Math.max(0, next.pendingTurn - state.turn) }
}

function raiseDesire(enemy: EnemyState, by: number): void {
  enemy.desire.forEach((amount, index) => { enemy.desire[index] = amount + by })
  for (const step of enemy.desireSteps ?? []) step.amount += by
  // Stages still to come rise too, so a Breakdown does not shed the TRACE.
  for (const stage of enemy.bossStages ?? []) {
    stage.desire.forEach((amount, index) => { stage.desire[index] = amount + by })
    for (const step of stage.desireSteps ?? []) step.amount += by
  }
}

function advanceTrace(state: BattleState, events: MechanicEvent[]): void {
  const published = state.encounter.trace
  if (published === undefined) return
  if (state.turn > published) {
    for (const enemy of livingEnemies(state)) raiseDesire(enemy, 1)
    events.push({ type: 'trace', level: state.turn - published })
  }
  state.trace = traceLeft(state.encounter, state.turn)
}

// Figures the panel shows that follow from the board: called whenever a Geek
// may have died or a boss may have changed stage.
export function refreshMechanic(state: BattleState): void {
  const mechanic = state.mechanic
  if (mechanic?.kind === 'brood') {
    const alive = bornAlive(state)
    if (alive !== mechanic.alive) state.mechanic = { ...mechanic, alive }
  } else if (mechanic?.kind === 'undisclosed') {
    const veiled = state.enemies.find(enemy => enemy.id === mechanic.bossId)
    const mystery = veiled && veiled.robustness > 0 && mysteryActive(veiled) ? veiled.mystery ?? null : null
    if (mystery !== mechanic.mystery) state.mechanic = { ...mechanic, mystery }
  }
}

// The turn boundary, after the turn counter has advanced and before routes
// are drawn for the new turn: births are placed, a due Article takes effect,
// TRACE rises. Curtains keep their own step (`advanceCurtains`). The store
// logs and reports what is returned; the changes are already on the state.
export function advanceMechanics(state: BattleState): MechanicEvent[] {
  const events: MechanicEvent[] = []
  placeBirths(state, events)
  advanceDocket(state, events)
  advanceTrace(state, events)
  refreshMechanic(state)
  return events
}
