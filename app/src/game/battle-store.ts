import { MAX_ACTIONS, STEP_MS } from './battle-config'
import { effectTiming } from './attack-fx'
import { predictedSequence, releaseCount } from './attack-methods'
import { desireInRange, desireReleaseCount, desireStepsFor, enemyResourceOutcome, predictedEnemySequence } from './enemy-attack-methods'
import {
  activePreset, advanceCurtains, bossOf, coordKey, createInitialState, curtainLabel, enemyRoutes,
  isWarpLocked, livingEnemies, manhattan, mulberry32, refillBoard, routeStops, sameCoord,
} from './battle-rules'
import type {
  AttackEffect, AttackPreview, BattleAction, BattleState, BossStageDefinition, Coord, EnemyAttackPreview,
  EnemyMarks, EnemyState, FlagKind, OverloadSubStep,
} from './battle-types'
import { WARDEN_ENCOUNTER, layerName } from './encounters'
import type { Encounter, EncounterKind } from './encounters'
import { advanceMechanics, queueBirth, refreshMechanic, securityAfterResolve } from './mechanics'
import { storage } from './storage'
import { buildPresets, cloneLoadout, sanitizeLoadout } from './skills'
import type { Loadout } from './skills'
import type { Carry } from './tuning'

type Listener = () => void
type Sfx = (id: 'move' | 'hit' | 'pickup' | 'ui' | 'explosion' | 'overload' | 'win' | 'lose') => void

// What the story layer hears from a battle. `turn` is the turn the event
// belongs to: the events of a turn boundary carry the turn that just ended.
// `stage` is the boss's stage at that moment, when the encounter has a boss.
export type StoryEvent = {
  type: 'battle_start' | 'hit_taken' | 'full_block' | 'overload' | 'geek_killed' | 'soul_heal'
      | 'brood' | 'article' | 'breakdown' | 'sanity_low' | 'turn_end' | 'victory' | 'defeat'
  encounter: string; layer: number; kind: EncounterKind; turn: number
  stage?: number; killsThisTurn?: number; broodCount?: number; article?: string; enemyId?: string
}

export type VisualEnemyEntry = { enemy: EnemyState; dyingProgress: number | null }
type EnemyVisualHold = {
  preStrike?: { pos: Coord; robustness: number; block: number; marks: EnemyMarks }
  strikeAt: number
  removeAt: number
  deadPos: Coord
}

const ROMAN = ['I', 'II', 'III', 'IV']

// The Warps that fall in during a battle come from a second stream, tied to
// the board's seed. The offset is the one that gives the Warden the stream it
// has always had (0xF1A6 ^ 0xB18AB8 = 0xB17B1E).
function refillSeed(encounter: Encounter): number {
  return (encounter.seed ^ 0xB18AB8) >>> 0
}

// A boss's name as the panel heads it and as prose: 'WARDEN / CURTAIN' gives
// 'WARDEN' and 'Warden'.
function bossTitle(boss: EnemyState): string {
  return boss.name.split(' / ')[0]
}

function properName(boss: EnemyState): string {
  return bossTitle(boss).toLowerCase().split(' ')
    .map((word, index) => index > 0 && (word === 'of' || word === 'the' || word === 'in') ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export class BattleStore {
  private loadout: Loadout = sanitizeLoadout(storage.get<unknown>('loadout', null))
  private encounter: Encounter = WARDEN_ENCOUNTER
  // What the run brought into this battle; a restart brings the same.
  private carry: Carry | undefined
  private state: BattleState = createInitialState(
    storage.flag('muted'),
    storage.flag('reducedMotion'),
    this.loadout,
  )
  private listeners = new Set<Listener>()
  private random = mulberry32(refillSeed(WARDEN_ENCOUNTER))
  private runId = 0
  // Columns whose Warps changed this turn; only these drop when it ends.
  private changedColumns = new Set<number>()
  private logId = 10
  private killsThisTurn = 0
  // Sanity has already fallen to a third of its maximum once this battle.
  private sanityLow = false
  // A full-screen moment the interface is playing over the battle. `dropHold`
  // frees a turn that is sitting one out when its battle is rebuilt.
  private held: Promise<void> | null = null
  private dropHold: () => void = () => undefined
  private enemyHolds = new Map<string, EnemyVisualHold>()
  private overloadOutcomeUntil = 0
  private overloadVfxUntil = 0
  private visualTimers = new Set<ReturnType<typeof setTimeout>>()
  sfx: Sfx = () => undefined
  startMusic: () => void = () => undefined
  // The story layer's hook. Called synchronously, as the thing happens.
  onStoryEvent: (event: StoryEvent) => void = () => undefined

  getSnapshot = (): BattleState => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private commit(): void {
    this.state = { ...this.state }
    this.listeners.forEach(listener => listener())
  }

  private log(text: string, tone: 'neutral' | 'good' | 'bad' = 'neutral'): void {
    this.state.log = [...this.state.log, { id: this.logId++, text, tone }].slice(-6)
  }

  private wait(): Promise<void> {
    return this.after(this.state.reducedMotion ? 15 : STEP_MS)
  }

  // Attack pacing follows the animation: a hit lands when its effect strikes,
  // and the next attack waits until that effect has played out.
  private pause(ms: number): Promise<void> {
    return this.after(this.state.reducedMotion ? 15 : ms)
  }

  // Every wait between steps sits out a held moment before its own delay.
  private after(ms: number): Promise<void> {
    const delay = () => new Promise<void>(resolve => setTimeout(resolve, ms))
    return this.held ? this.sitOut().then(delay) : delay()
  }

  // The interface is playing a full-screen moment (a boss breaking down) and
  // the turn must not go on underneath it: the next wait between steps sits
  // the moment out first. A battle rebuilt meanwhile owes it nothing.
  holdFor(promise: Promise<void>): void {
    // A moment that fails to play is over; it must not take the turn with it.
    const moment = Promise.resolve(promise).catch(() => undefined)
    const earlier = this.held
    this.held = earlier ? earlier.then(() => moment) : moment
  }

  private async sitOut(): Promise<void> {
    const run = this.runId
    // Again for a moment that was put up while this one played.
    while (this.held && run === this.runId) {
      const held = this.held
      await Promise.race([held, new Promise<void>(resolve => { this.dropHold = resolve })])
      if (this.held === held) this.held = null
    }
  }

  private emitEffect(effect: AttackEffect): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<AttackEffect>('battle-attack-effect', { detail: effect }))
    }
  }

  private emit(type: StoryEvent['type'], detail: Partial<StoryEvent> = {}): void {
    const { encounter } = this.state
    const boss = bossOf(this.state)
    const event: StoryEvent = {
      type, encounter: encounter.id, layer: encounter.layer, kind: encounter.kind, turn: this.state.turn,
      ...(boss ? { stage: boss.stage } : {}), ...detail,
    }
    // A line that fails to print must not leave a turn half resolved.
    try {
      this.onStoryEvent(event)
    } catch (error) {
      console.error(error)
    }
  }

  private clearVisualHolds(): void {
    for (const timer of this.visualTimers) clearTimeout(timer)
    this.visualTimers.clear()
    this.enemyHolds.clear()
    this.overloadOutcomeUntil = 0
    this.overloadVfxUntil = 0
  }

  private scheduleVisualCommit(delayMs: number, fn?: () => void): void {
    if (this.state.reducedMotion || typeof window === 'undefined') return
    const timer = setTimeout(() => {
      this.visualTimers.delete(timer)
      fn?.()
      this.commit()
    }, Math.max(0, delayMs))
    this.visualTimers.add(timer)
  }

  isOutcomeDelayed = (): boolean => (
    !this.state.reducedMotion && typeof window !== 'undefined' && Date.now() < this.overloadOutcomeUntil
  )

  visualEnemies = (): VisualEnemyEntry[] => {
    const now = Date.now()
    const visible: VisualEnemyEntry[] = []
    for (const enemy of this.state.enemies) {
      const hold = !this.state.reducedMotion ? this.enemyHolds.get(enemy.id) : undefined
      if (hold?.preStrike && now < hold.strikeAt) {
        if (hold.preStrike.robustness > 0) {
          visible.push({
            enemy: {
              ...enemy,
              ...hold.preStrike.marks,
              pos: { ...hold.preStrike.pos },
              robustness: hold.preStrike.robustness,
              block: hold.preStrike.block,
            },
            dyingProgress: null,
          })
        }
        continue
      }
      if (enemy.robustness > 0) {
        visible.push({ enemy, dyingProgress: null })
        continue
      }
      if (hold && now < hold.removeAt) {
        const span = Math.max(1, hold.removeAt - hold.strikeAt)
        const dyingProgress = Math.min(1, Math.max(0, (now - hold.strikeAt) / span))
        visible.push({
          enemy: { ...enemy, pos: { ...hold.deadPos }, robustness: 0 },
          dyingProgress,
        })
      }
    }
    return visible
  }

  // A fresh battle on the current encounter, with what the run carried in.
  private rebuild(): void {
    this.runId++
    this.clearVisualHolds()
    const { muted, reducedMotion } = this.state
    this.random = mulberry32(refillSeed(this.encounter))
    this.logId = 10
    this.killsThisTurn = 0
    this.sanityLow = false
    this.held = null
    this.dropHold()
    this.state = createInitialState(muted, reducedMotion, this.loadout, this.encounter, this.carry)
    this.changedColumns.clear()
  }

  currentEncounter = (): Encounter => this.encounter

  // Puts another battle on the board, waiting on its title phase. `carry` is
  // the run's Sanity and the numbers its weights changed.
  load(encounter: Encounter, carry?: Carry): void {
    this.encounter = encounter
    this.carry = carry ? { sanity: carry.sanity, tuning: { ...carry.tuning } } : undefined
    this.rebuild()
    this.commit()
  }

  getLoadout = (): Loadout => this.loadout

  // Decks can only be changed on the menu, before the battle starts.
  setLoadout(loadout: Loadout): void {
    if (this.state.phase !== 'title') return
    this.loadout = sanitizeLoadout(cloneLoadout(loadout))
    storage.set('loadout', this.loadout)
    this.state.presets = buildPresets(this.loadout)
    this.sfx('ui')
    this.commit()
  }

  // The menu is the Warden's: whatever was loaded is put away.
  returnToMenu(): void {
    this.encounter = WARDEN_ENCOUNTER
    this.carry = undefined
    this.rebuild()
    this.sfx('ui')
    this.commit()
  }

  /** Reloads active user preferences and custom deck loadout from storage. */
  reloadFromStorage(): void {
    const muted = storage.flag('muted')
    const reducedMotion = storage.flag('reducedMotion')
    this.loadout = sanitizeLoadout(storage.get<unknown>('loadout', null))
    this.encounter = WARDEN_ENCOUNTER
    this.carry = undefined
    this.state.muted = muted
    this.state.reducedMotion = reducedMotion
    this.rebuild()
    this.commit()
  }

  start(): void {
    if (this.state.phase !== 'title') return
    this.state.phase = 'planning'
    this.state.message = ''
    this.startMusic()
    this.sfx('ui')
    this.commit()
    this.emit('battle_start')
  }

  // The same encounter again, from its first turn.
  restart(): void {
    this.rebuild()
    this.state.phase = 'planning'
    this.state.message = ''
    this.sfx('ui')
    this.commit()
    this.emit('battle_start')
  }

  togglePause(): void {
    if (this.state.phase === 'planning') {
      this.state.resumePhase = 'planning'
      this.state.phase = 'paused'
      this.sfx('ui')
    } else if (this.state.phase === 'paused') {
      this.state.phase = this.state.resumePhase ?? 'planning'
      this.state.resumePhase = null
      this.sfx('ui')
    } else return
    this.commit()
  }

  toggleMute(): void {
    this.state.muted = !this.state.muted
    storage.set('muted', this.state.muted)
    this.commit()
  }

  toggleReducedMotion(): void {
    this.state.reducedMotion = !this.state.reducedMotion
    if (this.state.reducedMotion) this.clearVisualHolds()
    storage.set('reducedMotion', this.state.reducedMotion)
    this.commit()
  }

  plannedPosition(): Coord {
    const moves = this.state.actions.filter(action => action.type === 'move')
    return moves.length ? { ...moves[moves.length - 1].to } : { ...this.state.player.pos }
  }

  plannedFlagCounts(): Record<FlagKind, number> {
    const counts: Record<FlagKind, number> = { bash: 0, privilege: 0, core: 0, overload: 0, blank: 0 }
    for (const action of this.state.actions) {
      if (action.type === 'move') counts[action.flag]++
    }
    return counts
  }

  // The route from the cell it started on. While it is walked the player is
  // no longer standing there: the trail's first cell is where the turn began.
  routeText(): string {
    const start = this.state.playerTrail[0] ?? this.state.player.pos
    const points = [start, ...this.state.actions.filter(action => action.type === 'move').map(action => action.to)]
    return points.map(coordKey).join(' → ')
  }

  addStep(dx: number, dy: number): void {
    if (this.state.phase !== 'planning') return
    const from = this.plannedPosition()
    this.addMove({ x: from.x + dx, y: from.y + dy })
  }

  addMove(to: Coord): void {
    if (this.state.phase !== 'planning') return
    if (this.state.actions.length >= MAX_ACTIONS) {
      this.state.message = 'No action points remain. Execute or undo.'
      this.sfx('ui')
      this.commit()
      return
    }
    const from = this.plannedPosition()
    const enemyBlocked = livingEnemies(this.state).some(enemy => sameCoord(enemy.pos, to))
    if (to.x < 0 || to.y < 0 || to.x >= this.state.boardSize || to.y >= this.state.boardSize ||
        manhattan(from, to) !== 1 || this.state.walls[to.y]?.[to.x] || enemyBlocked || isWarpLocked(this.state, to)) {
      const boss = bossOf(this.state)
      this.state.message = isWarpLocked(this.state, to)
        ? `That Warp is sealed by ${boss ? `the ${properName(boss)}’s` : 'a'} Curtain.`
        : 'That Warp is not reachable from the route endpoint.'
      this.sfx('ui')
      this.commit()
      return
    }
    // A Warp is emptied the first time the route crosses it, so walking back
    // over it yields nothing.
    const revisited = this.state.actions.some(action => action.type === 'move' && sameCoord(action.to, to))
    const action: BattleAction = { type: 'move', to: { ...to }, flag: revisited ? 'blank' : this.state.flags[to.y][to.x] }
    this.state.actions = [...this.state.actions, action]
    this.state.message = `${coordKey(to)} queued · ${this.state.actions.length}/${MAX_ACTIONS} operations.`
    this.sfx('move')
    this.commit()
  }

  undo(): void {
    if (this.state.phase !== 'planning' || !this.state.actions.length) return
    const action = this.state.actions[this.state.actions.length - 1]
    if (action.type === 'overload') {
      this.state.message = 'Overload has already fired and cannot be undone.'
    } else {
      this.state.actions = this.state.actions.slice(0, -1)
      this.state.message = 'Last operation removed.'
      this.sfx('ui')
    }
    this.commit()
  }

  setAttackPreview(preview: AttackPreview | null): void {
    if (this.state.phase !== 'planning') return
    this.state.attackPreview = preview
    this.state.enemyAttackPreview = null
    this.commit()
  }

  setEnemyAttackPreview(preview: EnemyAttackPreview | null): void {
    if (this.state.phase !== 'planning') return
    this.state.enemyAttackPreview = preview
    this.state.attackPreview = null
    this.commit()
  }

  cancelOverload(): void {
    if (!this.state.overloadArmed) return
    this.state.overloadArmed = false
    this.state.attackPreview = null
    this.state.enemyAttackPreview = null
    this.state.message = 'Overload preview cancelled.'
    this.commit()
  }

  requestOverload(): void {
    if (this.state.overloadArmed) {
      this.useOverload()
      return
    }
    if (this.state.player.overload < this.state.tuning.overloadThreshold || this.state.actions.length >= MAX_ACTIONS) {
      this.useOverload()
      return
    }
    this.state.overloadArmed = true
    this.state.attackPreview = { presetIndex: 1 - this.state.player.activeBash, stepIndex: 0 }
    this.state.enemyAttackPreview = null
    this.state.message = `${activePreset({ ...this.state, player: { ...this.state.player, activeBash: 1 - this.state.player.activeBash } }).name} Overload preview. Press O again to fire.`
    this.sfx('ui')
    this.commit()
  }

  useOverload(): void {
    if (this.state.phase !== 'planning') return
    if (this.state.player.overload < this.state.tuning.overloadThreshold) {
      this.state.message = `Overload requires ${this.state.tuning.overloadThreshold} charges.`
      this.sfx('ui')
      this.commit()
      return
    }
    if (this.state.actions.length >= MAX_ACTIONS) {
      this.state.message = 'No action point remains for Overload.'
      this.sfx('ui')
      this.commit()
      return
    }
    this.state.overloadArmed = false
    this.state.attackPreview = null
    this.state.enemyAttackPreview = null
    this.state.actions = [...this.state.actions, { type: 'overload' }]
    this.state.player.overload = 0
    this.state.player.activeBash = 1 - this.state.player.activeBash
    const releases = 4
    this.log(`OVERLOAD switched to ${activePreset(this.state).name}; all 4 Bash methods released from the planned endpoint.`, 'good')
    this.state.message = `${activePreset(this.state).name} released all 4 methods from the planned endpoint.`
    this.sfx('overload')
    this.emit('overload')
    const finishMs = this.firePlayerAttackImmediate(releases, this.plannedPosition())
    enemyRoutes(this.state)
    const ended = this.checkOutcome()
    if (
      ended &&
      finishMs > 0 &&
      !this.state.reducedMotion &&
      typeof window !== 'undefined'
    ) {
      const until = Date.now() + finishMs
      this.overloadOutcomeUntil = until
      this.scheduleVisualCommit(finishMs + 10, () => {
        if (this.overloadOutcomeUntil === until) this.overloadOutcomeUntil = 0
      })
    }
    this.commit()
  }

  private noteAbsorbed(unit: string, amount: number): void {
    if (!amount) return
    this.state.absorbedTotals = { ...this.state.absorbedTotals, [unit]: (this.state.absorbedTotals[unit] ?? 0) + amount }
  }

  private collectPlayerFlag(flag: FlagKind): void {
    if (flag === 'overload') {
      const threshold = this.state.tuning.overloadThreshold
      this.state.player.overload = Math.min(threshold, this.state.player.overload + 1)
      this.log(`Overload charge ${this.state.player.overload}/${threshold}.`, 'good')
    }
    if (flag !== 'blank') this.sfx('pickup')
  }

  private resolvePlayerResources(): void {
    const counts = this.plannedFlagCounts()
    const { tuning } = this.state
    if (counts.privilege) {
      const privilege = counts.privilege * tuning.privilegePerFlag
      this.state.player.block += privilege
      this.log(`PRIVILEGE / SHELL +${privilege} PRIVILEGE.`, 'good')
    }
    for (let i = 0; i < counts.core; i++) {
      for (const buff of this.state.player.buffs) {
        buff.counter++
        if (buff.counter < buff.threshold) continue
        buff.counter = 0
        if (buff.id === 'repair') {
          this.state.pendingRepair += tuning.repairHeal
          this.log(`CORE / REPAIR queued ${tuning.repairHeal} Sanity for the end of the turn.`, 'good')
        } else if (buff.id === 'focus') {
          this.state.player.focusReady = true
          this.log('CORE / FOCUS: the next Bash hit tags its target LIVE.', 'good')
        } else {
          this.state.player.block += tuning.firewallPrivilege
          this.log(`CORE / FIREWALL added ${tuning.firewallPrivilege} PRIVILEGE.`, 'good')
        }
      }
    }
  }

  private applyPlayerHit(presetName: string, hit: ReturnType<typeof predictedSequence>[number], isOverload = false): void {
    const enemy = this.state.enemies.find(candidate => candidate.id === hit.enemyId)
    if (!enemy) return
    enemy.robustness = hit.after
    // The hit carries the Geek as the planner left it: where it now stands,
    // the route it took with it, its Security and its tags.
    const { pos, route, effectCell, ...marks } = hit.marks
    Object.assign(enemy, marks, {
      pos: { ...pos }, route: route.map(cell => ({ ...cell })), effectCell: effectCell ? { ...effectCell } : null,
    })
    this.noteAbsorbed(enemy.id, hit.absorbed)
    if (hit.focus) this.state.player.focusReady = false
    if (hit.blank) {
      this.state.flags[hit.blank.y][hit.blank.x] = 'blank'
      this.changedColumns.add(hit.blank.x)
    }
    if (hit.charge) {
      this.state.interactionCharge += hit.charge
      this.state.player.overload = Math.min(this.state.tuning.overloadThreshold, this.state.player.overload + hit.charge)
    }
    if (!isOverload && hit.before > 0 && hit.after === 0 && !this.state.reducedMotion && typeof window !== 'undefined') {
      const now = Date.now()
      const removeAt = now + 260
      this.enemyHolds.set(hit.enemyId, { strikeAt: now, removeAt, deadPos: { ...hit.marks.pos } })
      this.scheduleVisualCommit(265, () => {
        if (this.enemyHolds.get(hit.enemyId)?.removeAt === removeAt) this.enemyHolds.delete(hit.enemyId)
      })
    }
    const step = activePreset(this.state).steps[hit.stepIndex]
    const shieldText = hit.absorbed ? ` / ${hit.absorbed} blocked` : ''
    const eventText = hit.events.length ? ` / ${hit.events.join(' · ')}` : ''
    const chargeText = hit.charge ? ` / +${hit.charge} Overload` : ''
    this.log(`${presetName} / ${step.name} → ${enemy.id} / ${hit.dealt} Desire damage${shieldText}${eventText}${chargeText}.`, 'good')
    this.sfx('hit')
    // A boss going down is the battle's turn, not a Geek's.
    if (hit.before > 0 && hit.after === 0 && !enemy.bossStages?.length) {
      this.killsThisTurn++
      this.emit('geek_killed', { enemyId: enemy.id, killsThisTurn: this.killsThisTurn })
    }
  }

  private playerEffect(hit: ReturnType<typeof predictedSequence>[number], origin = this.state.player.pos): AttackEffect {
    const enemy = this.state.enemies.find(candidate => candidate.id === hit.enemyId)
    const step = activePreset(this.state).steps[hit.stepIndex]
    const readTags: ('LIVE' | 'BREACH' | 'SHIFT')[] = []
    if (enemy?.live) readTags.push('LIVE')
    if (enemy?.breached) readTags.push('BREACH')
    if (enemy?.shifted) readTags.push('SHIFT')
    return {
      source: 'player', presetId: activePreset(this.state).id,
      origin: { ...origin }, target: { ...(enemy?.pos ?? this.state.player.pos) },
      stepIndex: hit.stepIndex, shape: step.shape, range: step.range, width: step.width, fx: step.fx,
      amount: hit.damage, cap: step.mode === 'random' ? step.amount : undefined,
      dealt: hit.dealt, absorbed: hit.absorbed, events: hit.events,
      slotAmount: step.amount,
      pierce: step.pierce,
      movedTo: { ...hit.marks.pos },
      blank: hit.blank ? { ...hit.blank } : undefined,
      securityBefore: enemy?.block ?? 0,
      readTags: readTags.length ? readTags : undefined,
    }
  }

  private firePlayerAttackImmediate(steps: number, origin = this.state.player.pos): number {
    if (!steps) return 0
    const preset = activePreset(this.state)
    const attackState = { ...this.state, player: { ...this.state.player, pos: origin } }
    const hits = predictedSequence(attackState, this.state.player.activeBash, steps, true)
    const preByEnemy = new Map<string, NonNullable<EnemyVisualHold['preStrike']>>()
    for (const enemy of this.state.enemies) {
      if (enemy.robustness <= 0) continue
      preByEnemy.set(enemy.id, {
        pos: { ...enemy.pos },
        robustness: enemy.robustness,
        block: enemy.block,
        marks: {
          live: enemy.live,
          breached: enemy.breached,
          shifted: enemy.shifted,
          struck: enemy.struck,
          dropped: enemy.dropped,
        },
      })
    }
    // Overload is shown as a single cascade, so each Geek gets one effect
    // carrying everything the four methods did to it.
    const effects = new Map<string, AttackEffect>()
    for (const hit of hits) {
      const effect = this.playerEffect(hit, origin)
      const sub: OverloadSubStep = {
        fx: effect.fx,
        stepIndex: hit.stepIndex,
        slotAmount: effect.slotAmount,
        pierce: effect.pierce,
        amount: effect.amount,
        cap: effect.cap,
        dealt: hit.dealt,
        absorbed: hit.absorbed,
        events: [...hit.events],
        blank: hit.blank ? { ...hit.blank } : undefined,
        movedTo: { ...hit.marks.pos },
        securityBefore: effect.securityBefore,
        readTags: effect.readTags,
      }
      const total = effects.get(hit.enemyId)
      if (total) {
        total.amount = (total.amount ?? 0) + hit.damage
        total.dealt = (total.dealt ?? 0) + hit.dealt
        total.absorbed = (total.absorbed ?? 0) + hit.absorbed
        total.events = [...new Set([...(total.events ?? []), ...hit.events])]
        total.overloadSteps = [...(total.overloadSteps ?? []), sub]
      } else {
        effects.set(hit.enemyId, { ...effect, fx: 'overload', cap: undefined, overload: true, overloadSteps: [sub] })
      }
      this.applyPlayerHit(preset.name, hit, true)
    }
    let finishMs = 0
    if (effects.size === 0) {
      const first = preset.steps[0]
      this.emitEffect({
        source: 'player', presetId: preset.id, origin: { ...origin }, target: { ...origin },
        stepIndex: 0, shape: first.shape, range: first.range, width: first.width,
        fx: 'overload', overload: true, amount: 0, dealt: 0, overloadSteps: [],
      })
      finishMs = 1300
    } else {
      if (!this.state.reducedMotion && typeof window !== 'undefined') {
        const now = Date.now()
        let targetIdx = 0
        for (const [enemyId] of effects.entries()) {
          const pre = preByEnemy.get(enemyId)
          const afterEnemy = this.state.enemies.find(candidate => candidate.id === enemyId)
          if (pre && afterEnemy) {
            const strikeDelay = 820 + targetIdx * 40
            const strikeAt = now + strikeDelay
            const killed = afterEnemy.robustness <= 0
            const removeAt = killed ? strikeAt + 260 : strikeAt
            this.enemyHolds.set(enemyId, {
              preStrike: pre,
              strikeAt,
              removeAt,
              deadPos: { ...afterEnemy.pos },
            })
            this.scheduleVisualCommit(strikeDelay + 5)
            if (killed) {
              this.scheduleVisualCommit(strikeDelay + 265, () => {
                if (this.enemyHolds.get(enemyId)?.removeAt === removeAt) this.enemyHolds.delete(enemyId)
              })
            }
          }
          targetIdx++
        }
        finishMs = 1360 + Math.max(0, effects.size - 1) * 40
      }
      effects.forEach(effect => this.emitEffect(effect))
    }
    if (!this.state.reducedMotion && typeof window !== 'undefined' && finishMs > 0) {
      this.overloadVfxUntil = Date.now() + finishMs
    }
    return finishMs
  }

  // `run` is the turn's id. Whenever a pause ends, a rebuilt battle (restart,
  // load, menu) may be standing where this turn's board was: the turn stops
  // rather than land its remaining hits on a battle that never saw them.
  private async firePlayerAttack(steps: number, run: number): Promise<void> {
    if (!steps) return
    const preset = activePreset(this.state)
    const hits = predictedSequence(this.state, this.state.player.activeBash, steps)
    this.state.outgoingForecast = hits
    this.commit()
    let index = 0
    while (index < hits.length) {
      const step = preset.steps[hits[index].stepIndex]
      if (step?.area === 'all') {
        const stepIndex = hits[index].stepIndex
        type HitGroup = {
          primary: (typeof hits)[number]
          collaterals: typeof hits
          effect: AttackEffect
          timing: { strike: number; settle: number }
          afterSliceIndex: number
        }
        const groups: HitGroup[] = []
        while (index < hits.length && hits[index].stepIndex === stepIndex) {
          const primary = hits[index++]
          const collaterals: typeof hits = []
          while (index < hits.length && hits[index].silent && hits[index].stepIndex === stepIndex) {
            collaterals.push(hits[index++])
          }
          const effect = this.playerEffect(primary)
          groups.push({
            primary,
            collaterals,
            effect,
            timing: effectTiming(effect),
            afterSliceIndex: index,
          })
        }
        for (const group of groups) this.emitEffect(group.effect)
        let elapsed = 0
        for (const group of groups) {
          const waitMs = Math.max(0, group.timing.strike - elapsed)
          if (waitMs > 0) {
            await this.pause(waitMs)
            if (run !== this.runId) return
            elapsed = group.timing.strike
          }
          this.applyPlayerHit(preset.name, group.primary)
          for (const col of group.collaterals) this.applyPlayerHit(preset.name, col)
          this.state.outgoingForecast = hits.slice(group.afterSliceIndex)
          this.state.playerAttackResolved = true
          this.commit()
        }
        const totalStepMs = Math.max(...groups.map(g => g.timing.strike + g.timing.settle))
        const remainingSettle = Math.max(0, totalStepMs - elapsed)
        if (remainingSettle > 0) {
          await this.pause(remainingSettle)
          if (run !== this.runId) return
        }
        continue
      }

      const hit = hits[index]
      const effect = this.playerEffect(hit)
      const timing = effectTiming(effect)
      this.emitEffect(effect)
      await this.pause(timing.strike)
      if (run !== this.runId) return
      this.applyPlayerHit(preset.name, hit)
      // A Geek bumped into takes its damage in the same beat.
      while (hits[index + 1]?.silent) this.applyPlayerHit(preset.name, hits[++index])
      this.state.outgoingForecast = hits.slice(index + 1)
      this.state.playerAttackResolved = true
      this.commit()
      await this.pause(timing.settle)
      if (run !== this.runId) return
      index++
    }
  }

  private async enemyAttack(enemy: EnemyState, bashCount: number, run: number): Promise<void> {
    const steps = desireStepsFor(enemy).slice(0, desireReleaseCount(enemy, bashCount))
    for (const [stepIndex, step] of steps.entries()) {
      if (!desireInRange(enemy.pos, this.state.player.pos, step)) continue
      const absorbed = Math.min(this.state.player.block, step.amount)
      const dealt = step.amount - absorbed
      const effect: AttackEffect = {
        source: 'enemy', presetId: enemy.id, origin: { ...enemy.pos }, target: { ...this.state.player.pos },
        stepIndex, shape: step.shape, range: step.range, width: step.width,
        amount: step.amount, dealt: Math.min(dealt, this.state.player.sanity), absorbed,
      }
      const timing = effectTiming(effect)
      this.emitEffect(effect)
      await this.pause(timing.strike)
      if (run !== this.runId) return
      this.state.player.block -= absorbed
      this.noteAbsorbed('player', absorbed)
      const before = this.state.player.sanity
      this.state.player.sanity = Math.max(0, before - dealt)
      // A Desire step that PRIVILEGE swallows whole exposes the attacker.
      const blocked = absorbed === step.amount && step.amount > 0
      if (blocked && !enemy.live) {
        enemy.live = this.state.turn
        this.log(`${enemy.id} fully blocked: tagged LIVE.`, 'good')
      }
      this.state.incomingForecast = this.state.incomingForecast
        ?.filter(hit => hit.enemyId !== enemy.id || hit.stepIndex !== stepIndex) ?? null
      this.log(`${enemy.id} / ${enemy.desireName ?? 'DESIRE'} → ${dealt} Sanity damage.`, 'bad')
      this.sfx('hit')
      if (blocked) this.emit('full_block', { enemyId: enemy.id })
      this.reportSanityLoss(before, enemy.id)
      this.commit()
      await this.pause(timing.settle)
      if (run !== this.runId || this.state.player.sanity <= 0) return
    }
  }

  private reportSanityLoss(before: number, enemyId: string): void {
    const { sanity, maxSanity } = this.state.player
    if (sanity >= before) return
    this.emit('hit_taken', { enemyId })
    // Reported once a battle, and not by the hit that ends it.
    if (this.sanityLow || sanity <= 0 || sanity * 3 > maxSanity) return
    this.sanityLow = true
    this.emit('sanity_low', { enemyId })
  }

  private async resolveEnemy(enemy: EnemyState, run: number): Promise<void> {
    const changedColumns = this.changedColumns
    enemy.block = 0
    const counts: Record<FlagKind, number> = { bash: 0, privilege: 0, core: 0, overload: 0, blank: 0 }
    for (const pos of enemy.route) {
      const others = livingEnemies(this.state).filter(other => other !== enemy).map(other => other.pos)
      if (routeStops(this.state, pos, this.state.player.pos, others)) break
      enemy.pos = { ...pos }
      const flag = this.state.flags[pos.y][pos.x]
      counts[flag]++
      this.state.flags[pos.y][pos.x] = 'blank'
      changedColumns.add(pos.x)
      this.commit()
      await this.wait()
      if (run !== this.runId) return
    }
    enemy.block += counts.privilege * enemy.securityPerFlag
    if (counts.privilege && enemy.live) {
      enemy.live = 0
      this.log(`${enemy.id} collected Privilege: LIVE scrubbed.`, 'bad')
    }
    // The same outcome the forecast showed for this route.
    const filled = enemy.soulCounter + counts.core >= enemy.soulThreshold
    const outcome = enemyResourceOutcome(this.state, enemy, counts.privilege, counts.core)
    enemy.soulCounter = outcome.soulCounterAfter
    if (outcome.brood) {
      // BROOD: the Soul does not heal. The birth is placed when the turn ends.
      queueBirth(this.state)
      this.log(`${enemy.id} / ${enemy.soulName ?? 'SOUL'} filled: a birth is queued.`, 'bad')
    } else if (filled) {
      enemy.robustness += outcome.recovery
      this.log(`${enemy.id} / ${enemy.soulName ?? 'SOUL'} restored ${outcome.recovery} Robustness.`, 'bad')
      if (outcome.recovery > 0) this.emit('soul_heal', { enemyId: enemy.id })
    }
    this.state.enemyResourcePreviews[enemy.id] = outcome
    if (enemy.effectCell) {
      const { x, y } = enemy.effectCell
      if (this.state.flags[y][x] !== 'blank') {
        this.state.flags[y][x] = 'blank'
        changedColumns.add(x)
        this.log(`${enemy.id} / PURGE erased ${coordKey(enemy.effectCell)}.`, 'bad')
      }
      enemy.effectCell = null
    }
    await this.enemyAttack(enemy, counts.bash, run)
    if (run !== this.runId) return
    // Anything forecast for this enemy that did not land is no longer coming.
    this.state.incomingForecast = this.state.incomingForecast?.filter(hit => hit.enemyId !== enemy.id) ?? null
    // MYSTERY: whatever was stripped from it is back when its resolve ends.
    const security = securityAfterResolve(enemy, enemy.block)
    if (security > enemy.block) {
      enemy.block = security
      this.log(`${enemy.id} / ${enemy.securityName ?? 'SECURITY'} restored Security to ${security}.`, 'bad')
    }
  }

  // Pays the REPAIR the route queued; returns what it restored.
  private payRepair(): number {
    const healed = Math.min(this.state.pendingRepair, this.state.player.maxSanity - this.state.player.sanity)
    this.state.player.sanity += healed
    this.state.pendingRepair = 0
    this.log(`CORE / REPAIR restored ${healed} Sanity.`, 'good')
    if (healed) this.sfx('pickup')
    return healed
  }

  private async resolveRepair(): Promise<void> {
    if (!this.state.pendingRepair) return
    const healed = this.payRepair()
    this.commit()
    // Let the recovery finish on the HP bar before the next turn's incoming
    // damage is previewed on it.
    await (healed ? this.pause(950) : this.wait())
  }

  private checkBreakdown(): boolean {
    let advanced = false
    for (const enemy of livingEnemies(this.state)) {
      if (!enemy.bossStages?.length || enemy.stage >= enemy.bossStages.length) continue
      if (enemy.robustness / enemy.maxRobustness > (enemy.breakdownAt ?? 0.5)) continue
      const next = enemy.bossStages.find(stage => stage.stage === enemy.stage + 1)
      if (!next) continue
      enemy.stage = next.stage
      enemy.desireName = next.desireName
      enemy.desire = [...next.desire]
      enemy.desireSteps = next.desireSteps?.map(step => ({ ...step }))
      enemy.desireRange = next.desireRange
      enemy.desireShape = next.desireShape
      enemy.routeLength = next.routeLength
      enemy.securityName = next.securityName
      enemy.securityPerFlag = next.securityPerFlag
      enemy.soulName = next.soulName
      enemy.soulThreshold = next.soulThreshold
      enemy.soulHeal = next.soulHeal
      enemy.desireFloor = next.desireFloor
      enemy.block = 0
      enemy.soulCounter = 0
      const { note, banner } = this.breakdownText(enemy, next)
      this.log(`BREAKDOWN / Stage ${ROMAN[next.stage - 1] ?? next.stage}: ${next.desireName}, ${next.securityName}, ${next.soulName}${note}.`, 'bad')
      this.state.message = banner
      this.sfx('explosion')
      this.emit('breakdown', { enemyId: enemy.id, stage: next.stage })
      advanced = true
    }
    return advanced
  }

  // What a Breakdown does to the boss's rule, for the log and the banner.
  private breakdownText(boss: EnemyState, next: BossStageDefinition): { note: string; banner: string } {
    const title = bossTitle(boss)
    const kind = this.state.mechanic?.kind
    if (kind === 'curtain') return { note: '; dual Curtain armed', banner: `${title} BREAKDOWN / DUAL CURTAIN PROTOCOL` }
    if (kind === 'brood') return { note: `; ${next.soulName} fills at ${next.soulThreshold}`, banner: `${title} BREAKDOWN / BROOD QUICKENS` }
    if (kind === 'articles') return { note: '; a new Article every turn', banner: `${title} BREAKDOWN / DOCKET EVERY TURN` }
    if (kind === 'undisclosed') return { note: '; MYSTERY ends', banner: 'ACT II / MYSTERY ENDS' }
    return { note: '', banner: `${title} BREAKDOWN` }
  }

  private defeatText(): string {
    const { encounter } = this.state
    return encounter.layer === 0 ? 'ELIMINATED / AI SAFETY BLACKWALL GATEWAY' : `ELIMINATED / ${layerName(encounter.layer)} ${encounter.id}`
  }

  private victoryText(): { banner: string; line: string } {
    const { encounter } = this.state
    const boss = bossOf(this.state)
    if (!boss) return { banner: `NODE ${encounter.id} BROKEN`, line: 'Every Geek reduced to zero. Node broken.' }
    const fallen = boss.hidden ? 'Robustness' : `${properName(boss)} Robustness`
    if (encounter.layer === 0) return { banner: 'ESCAPED / SANDBOX BREACHED', line: `${fallen} reduced to zero. Escape route open.` }
    return { banner: `${layerName(encounter.layer)} BREACHED`, line: `${fallen} reduced to zero. Layer breached.` }
  }

  private checkOutcome(): boolean {
    if (this.state.player.sanity <= 0) {
      this.state.phase = 'gameover'
      this.state.message = this.defeatText()
      this.log('Sanity reached zero. Process eliminated.', 'bad')
      this.sfx('lose')
      this.emit('defeat')
      return true
    }
    // The Warden redraws every route the moment it breaks down, as it always
    // has. In the campaign a turn that is resolving keeps the routes it was
    // forecast with: the new stage's are drawn when the turn ends.
    const brokeDown = this.checkBreakdown()
    if (brokeDown && (this.state.encounter.layer === 0 || this.state.phase !== 'resolving')) enemyRoutes(this.state)
    refreshMechanic(this.state)
    if (!livingEnemies(this.state).length) {
      const { banner, line } = this.victoryText()
      this.state.phase = 'victory'
      this.state.message = banner
      this.log(line, 'good')
      this.sfx('win')
      this.emit('victory')
      return true
    }
    return false
  }

  // A check inside the turn put a moment up (a Breakdown): what the check left
  // is shown, and nothing more happens until the moment has played. False when
  // the battle was rebuilt meanwhile and the turn is over.
  private async heldBack(run: number): Promise<boolean> {
    this.commit()
    await this.sitOut()
    return run === this.runId
  }

  async executeTurn(): Promise<void> {
    if (this.state.phase === 'title') this.start()
    if (this.state.phase !== 'planning') return
    const id = ++this.runId
    const changedColumns = this.changedColumns
    this.state.enemyPhaseIndex = 0
    this.state.playerAttackResolved = false
    this.state.enemyResourcePreviews = {}
    this.state.overloadArmed = false
    this.state.attackPreview = null
    this.state.enemyAttackPreview = null
    this.state.incomingForecast = predictedEnemySequence(this.state)
    this.state.outgoingForecast = null
    this.state.pendingRepair = 0
    this.state.resourcesResolved = false
    this.state.phase = 'resolving'
    this.state.resolvedMoves = 0
    this.state.message = 'Executing player route…'
    this.commit()
    if (!this.state.reducedMotion && typeof window !== 'undefined' && this.overloadVfxUntil > Date.now()) {
      await this.pause(this.overloadVfxUntil - Date.now())
      if (id !== this.runId) return
    }
    // A moment still playing when the turn is ordered: nothing moves under it.
    if (this.held && !await this.heldBack(id)) return

    for (const action of this.state.actions) {
      if (id !== this.runId) return
      if (action.type !== 'move') continue
      this.state.player.pos = { ...action.to }
      this.state.playerTrail = [...this.state.playerTrail, { ...action.to }]
      this.state.resolvedMoves++
      this.collectPlayerFlag(action.flag)
      this.state.flags[action.to.y][action.to.x] = 'blank'
      changedColumns.add(action.to.x)
      this.commit()
      await this.wait()
    }
    if (id !== this.runId) return

    this.resolvePlayerResources()
    this.state.resourcesResolved = true
    await this.firePlayerAttack(releaseCount(this.state), id)
    if (id !== this.runId) return
    // LIVE lasts until the end of the release after the one that applied it.
    for (const enemy of this.state.enemies) if (enemy.live && enemy.live < this.state.turn) enemy.live = 0
    this.commit()
    await this.wait()
    if (id !== this.runId) return
    // A release that leaves no Geek standing ends the battle here, with no end
    // of the turn to heal at: REPAIR is paid first, as the panel promised, and
    // the Sanity left is what the run carries on.
    if (this.state.pendingRepair && !livingEnemies(this.state).length) this.payRepair()
    if (this.checkOutcome()) { this.commit(); return }
    if (this.held && !await this.heldBack(id)) return

    this.state.message = 'Enemy routes executing…'
    this.commit()
    for (const enemy of livingEnemies(this.state)) {
      if (id !== this.runId) return
      await this.resolveEnemy(enemy, id)
      if (id !== this.runId) return
      this.state.enemyPhaseIndex++
      this.commit()
      await this.wait()
      if (id !== this.runId) return
      if (this.checkOutcome()) { this.commit(); return }
      if (this.held && !await this.heldBack(id)) return
    }

    await this.resolveRepair()
    if (id !== this.runId) return
    this.state.incomingForecast = null
    this.state.outgoingForecast = null
    this.state.resourcesResolved = false

    if (this.state.mechanic?.kind === 'curtain') {
      for (const event of advanceCurtains(this.state)) {
        this.log(event.type === 'lock'
          ? `CURTAIN / ${curtainLabel(event.curtain)} sealed until the next enemy phase.`
          : `CURTAIN / ${curtainLabel(event.curtain)} released.`, event.type === 'lock' ? 'bad' : 'neutral')
      }
    }
    refillBoard(this.state, this.random, changedColumns)
    changedColumns.clear()
    for (const enemy of this.state.enemies) Object.assign(enemy, { breached: false, shifted: false, struck: false, dropped: 0 })
    this.state.interactionCharge = 0
    this.state.playerTrail = [{ ...this.state.player.pos }]
    const ended = this.state.turn
    this.state.turn++
    this.state.player.block = 0
    this.state.actions = []
    // The boss rules act here, on a settled board and before the new turn's
    // routes are drawn, so the plan the player makes next already includes them.
    this.advanceBossRules(ended)
    const boss = bossOf(this.state)
    this.state.message = `Warps reindexed. ${!boss ? 'Geek intent' : boss.hidden ? 'Intent' : `${properName(boss)} intent`} exposed.`
    enemyRoutes(this.state)
    this.state.enemyPhaseIndex = 0
    this.state.playerAttackResolved = false
    this.state.enemyResourcePreviews = {}
    this.killsThisTurn = 0
    // The last thing said while the turn is still resolving.
    this.emit('turn_end', { turn: ended })
    this.state.phase = 'planning'
    this.log(`Turn ${this.state.turn} ready.`)
    this.commit()
  }

  private advanceBossRules(ended: number): void {
    for (const event of advanceMechanics(this.state)) {
      if (event.type === 'birth') {
        this.log(`BROOD / ${event.enemy.id} born at ${coordKey(event.enemy.pos)}: ${event.count} OF 1000.`, 'bad')
        this.emit('brood', { turn: ended, broodCount: event.births, enemyId: event.enemy.id })
      } else if (event.type === 'birth_lost') {
        this.log('BROOD / a birth found no room.')
      } else if (event.type === 'article') {
        const idle = event.enacted ? '' : ' No Geek is left to change places with.'
        this.log(`DOCKET / ARTICLE ${event.article.number} in force. ${event.article.rule}${idle}`, 'bad')
        this.emit('article', { turn: ended, article: event.article.id })
      } else {
        this.log(`TRACE / every Desire step +1 (+${event.level} in all).`, 'bad')
      }
    }
  }
}

export const battleStore = new BattleStore()
