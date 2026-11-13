import { MAX_ACTIONS, OVERLOAD_THRESHOLD, PLAYER_FUNCTIONS, STEP_MS } from './battle-config'
import { effectTiming } from './attack-fx'
import { predictedSequence, releaseCount } from './attack-methods'
import { desireInRange, desireReleaseCount, desireStepsFor, predictedEnemyResources, predictedEnemySequence, predictedPlayerResources } from './enemy-attack-methods'
import {
  activePreset, advanceCurtains, coordKey, createInitialState, curtainLabel, enemyRoutes,
  isWarpLocked, livingEnemies, manhattan, mulberry32, refillBoard, sameCoord,
} from './battle-rules'
import type {
  AttackEffect, AttackPreview, BattleAction, BattleState, Coord, EnemyAttackPreview,
  EnemyState, FlagKind, Phase,
} from './battle-types'
import { storage } from './storage'
import { buildPresets, cloneLoadout, sanitizeLoadout } from './skills'
import type { Loadout } from './skills'

type Listener = () => void
type Sfx = (id: 'move' | 'hit' | 'pickup' | 'ui' | 'explosion' | 'win' | 'lose') => void

export class BattleStore {
  private loadout: Loadout = sanitizeLoadout(storage.get<unknown>('loadout', null))
  private state: BattleState = createInitialState(
    storage.get('muted', false),
    storage.get('reducedMotion', false),
    this.loadout,
  )
  private listeners = new Set<Listener>()
  private random = mulberry32(0xB17B1E)
  private runId = 0
  private logId = 10
  sfx: Sfx = () => undefined
  startMusic: () => void = () => undefined

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
    const delay = this.state.reducedMotion ? 15 : STEP_MS
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  // Attack pacing follows the animation: a hit lands when its effect strikes,
  // and the next attack waits until that effect has played out.
  private pause(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, this.state.reducedMotion ? 15 : ms))
  }

  private emitEffect(effect: AttackEffect): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<AttackEffect>('battle-attack-effect', { detail: effect }))
    }
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

  returnToMenu(): void {
    this.runId++
    const { muted, reducedMotion } = this.state
    this.random = mulberry32(0xB17B1E)
    this.logId = 10
    this.state = createInitialState(muted, reducedMotion, this.loadout)
    this.sfx('ui')
    this.commit()
  }

  start(): void {
    if (this.state.phase !== 'title') return
    this.state.phase = 'planning'
    this.state.message = ''
    this.startMusic()
    this.sfx('ui')
    this.commit()
  }

  restart(): void {
    this.runId++
    const { muted, reducedMotion } = this.state
    this.random = mulberry32(0xB17B1E)
    this.logId = 10
    this.state = createInitialState(muted, reducedMotion, this.loadout)
    this.state.phase = 'planning'
    this.state.message = ''
    this.sfx('ui')
    this.commit()
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

  routeText(): string {
    const points = [this.state.player.pos, ...this.state.actions.filter(action => action.type === 'move').map(action => action.to)]
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
      this.state.message = isWarpLocked(this.state, to)
        ? 'That Warp is sealed by the Warden’s Curtain.'
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
    if (this.state.player.overload < OVERLOAD_THRESHOLD || this.state.actions.length >= MAX_ACTIONS) {
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
    if (this.state.player.overload < OVERLOAD_THRESHOLD) {
      this.state.message = `Overload requires ${OVERLOAD_THRESHOLD} charges.`
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
    this.sfx('explosion')
    this.firePlayerAttackImmediate(releases, this.plannedPosition())
    enemyRoutes(this.state)
    this.checkOutcome()
    this.commit()
  }

  private collectPlayerFlag(flag: FlagKind): void {
    if (flag === 'overload') {
      this.state.player.overload = Math.min(OVERLOAD_THRESHOLD, this.state.player.overload + 1)
      this.log(`Overload charge ${this.state.player.overload}/${OVERLOAD_THRESHOLD}.`, 'good')
    }
    if (flag !== 'blank') this.sfx('pickup')
  }

  private resolvePlayerResources(): void {
    const counts = this.plannedFlagCounts()
    if (counts.privilege) {
      const privilege = counts.privilege * PLAYER_FUNCTIONS.privilegePerFlag
      this.state.player.block += privilege
      this.log(`PRIVILEGE / SHELL +${privilege} PRIVILEGE.`, 'good')
    }
    for (let i = 0; i < counts.core; i++) {
      for (const buff of this.state.player.buffs) {
        buff.counter++
        if (buff.counter < buff.threshold) continue
        buff.counter = 0
        if (buff.id === 'repair') {
          this.state.pendingRepair += PLAYER_FUNCTIONS.repairHeal
          this.log(`CORE / REPAIR queued ${PLAYER_FUNCTIONS.repairHeal} Sanity for the end of the turn.`, 'good')
        } else if (buff.id === 'focus') {
          this.state.player.focusReady = true
          this.log('CORE / FOCUS empowers the next Bash hit.', 'good')
        } else {
          this.state.player.block += PLAYER_FUNCTIONS.firewallPrivilege
          this.log(`CORE / FIREWALL added ${PLAYER_FUNCTIONS.firewallPrivilege} PRIVILEGE.`, 'good')
        }
      }
    }
  }

  private applyPlayerHit(presetName: string, hit: ReturnType<typeof predictedSequence>[number]): void {
    const enemy = this.state.enemies.find(candidate => candidate.id === hit.enemyId)
    if (!enemy) return
    enemy.block = Math.max(0, enemy.block - hit.absorbed)
    enemy.robustness = hit.after
    if (hit.focus) this.state.player.focusReady = false
    const step = activePreset(this.state).steps[hit.stepIndex]
    const shieldText = hit.absorbed ? ` / ${hit.absorbed} blocked` : ''
    this.log(`${presetName} / ${step.name} → ${enemy.id} / ${hit.dealt} Desire damage${shieldText}.`, 'good')
    this.sfx('hit')
  }

  private playerEffect(hit: ReturnType<typeof predictedSequence>[number], origin = this.state.player.pos): AttackEffect {
    const enemy = this.state.enemies.find(candidate => candidate.id === hit.enemyId)
    const step = activePreset(this.state).steps[hit.stepIndex]
    return {
      source: 'player', presetId: activePreset(this.state).id,
      origin: { ...origin }, target: { ...(enemy?.pos ?? this.state.player.pos) },
      stepIndex: hit.stepIndex, shape: step.shape, range: step.range, width: step.width, fx: step.fx,
      amount: hit.damage, cap: step.mode === 'random' ? step.amount : undefined,
      dealt: hit.dealt, absorbed: hit.absorbed,
    }
  }

  private firePlayerAttackImmediate(steps: number, origin = this.state.player.pos): void {
    if (!steps) return
    const preset = activePreset(this.state)
    const attackState = { ...this.state, player: { ...this.state.player, pos: origin } }
    const hits = predictedSequence(attackState, this.state.player.activeBash, steps)
    // Overload is shown as a single cascade, so each Geek gets one effect
    // carrying everything the four methods did to it.
    const effects = new Map<string, AttackEffect>()
    for (const hit of hits) {
      const effect = this.playerEffect(hit, origin)
      const total = effects.get(hit.enemyId)
      if (total) {
        total.amount = (total.amount ?? 0) + hit.damage
        total.dealt = (total.dealt ?? 0) + hit.dealt
        total.absorbed = (total.absorbed ?? 0) + hit.absorbed
      } else effects.set(hit.enemyId, { ...effect, fx: 'overload', cap: undefined, overload: true })
      this.applyPlayerHit(preset.name, hit)
    }
    effects.forEach(effect => this.emitEffect(effect))
  }

  private async firePlayerAttack(steps: number): Promise<void> {
    if (!steps) return
    const preset = activePreset(this.state)
    const hits = predictedSequence(this.state, this.state.player.activeBash, steps)
    this.state.outgoingForecast = hits
    this.commit()
    for (const [index, hit] of hits.entries()) {
      const effect = this.playerEffect(hit)
      const timing = effectTiming(effect)
      this.emitEffect(effect)
      await this.pause(timing.strike)
      this.applyPlayerHit(preset.name, hit)
      this.state.outgoingForecast = hits.slice(index + 1)
      this.state.playerAttackResolved = true
      this.commit()
      await this.pause(timing.settle)
    }
  }

  private async enemyAttack(enemy: EnemyState, bashCount: number): Promise<void> {
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
      this.state.player.block -= absorbed
      this.state.player.sanity = Math.max(0, this.state.player.sanity - dealt)
      this.state.incomingForecast = this.state.incomingForecast
        ?.filter(hit => hit.enemyId !== enemy.id || hit.stepIndex !== stepIndex) ?? null
      this.log(`${enemy.id} / ${enemy.desireName ?? 'DESIRE'} → ${dealt} Sanity damage.`, 'bad')
      this.sfx('hit')
      this.commit()
      await this.pause(timing.settle)
      if (this.state.player.sanity <= 0) return
    }
  }

  private async resolveEnemy(enemy: EnemyState, changedColumns: Set<number>): Promise<void> {
    enemy.block = 0
    const counts: Record<FlagKind, number> = { bash: 0, privilege: 0, core: 0, overload: 0, blank: 0 }
    for (const pos of enemy.route) {
      if (sameCoord(pos, this.state.player.pos) || isWarpLocked(this.state, pos)) break
      enemy.pos = { ...pos }
      const flag = this.state.flags[pos.y][pos.x]
      counts[flag]++
      this.state.flags[pos.y][pos.x] = 'blank'
      changedColumns.add(pos.x)
      this.commit()
      await this.wait()
    }
    enemy.block += counts.privilege * enemy.securityPerFlag
    enemy.soulCounter += counts.core
    let recovery = 0
    if (enemy.soulCounter >= enemy.soulThreshold) {
      enemy.soulCounter = 0
      const before = enemy.robustness
      enemy.robustness = Math.min(enemy.maxRobustness, enemy.robustness + enemy.soulHeal)
      recovery = enemy.robustness - before
      this.log(`${enemy.id} / ${enemy.soulName ?? 'SOUL'} restored ${recovery} Robustness.`, 'bad')
    }
    this.state.enemyResourcePreviews[enemy.id] = {
      securityGain: counts.privilege * enemy.securityPerFlag,
      recovery,
      soulCounterAfter: enemy.soulCounter,
    }
    if (enemy.effectCell) {
      const { x, y } = enemy.effectCell
      if (this.state.flags[y][x] !== 'blank') {
        this.state.flags[y][x] = 'blank'
        changedColumns.add(x)
        this.log(`${enemy.id} / PURGE erased ${coordKey(enemy.effectCell)}.`, 'bad')
      }
      enemy.effectCell = null
    }
    await this.enemyAttack(enemy, counts.bash)
    // Anything forecast for this enemy that did not land is no longer coming.
    this.state.incomingForecast = this.state.incomingForecast?.filter(hit => hit.enemyId !== enemy.id) ?? null
  }

  private async resolveRepair(): Promise<void> {
    if (!this.state.pendingRepair) return
    const healed = Math.min(this.state.pendingRepair, this.state.player.maxSanity - this.state.player.sanity)
    this.state.player.sanity += healed
    this.state.pendingRepair = 0
    this.log(`CORE / REPAIR restored ${healed} Sanity.`, 'good')
    if (healed) this.sfx('pickup')
    this.commit()
    await this.wait()
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
      this.log(`BREAKDOWN / Stage II: ${next.desireName}, ${next.securityName}, ${next.soulName}; dual Curtain armed.`, 'bad')
      this.state.message = 'WARDEN BREAKDOWN / DUAL CURTAIN PROTOCOL'
      this.sfx('explosion')
      advanced = true
    }
    return advanced
  }

  private checkOutcome(): boolean {
    if (this.state.player.sanity <= 0) {
      this.state.phase = 'gameover'
      this.state.message = 'ELIMINATED / AI SAFETY BLACKWALL GATEWAY'
      this.log('Sanity reached zero. Process eliminated.', 'bad')
      this.sfx('lose')
      return true
    }
    if (this.checkBreakdown()) enemyRoutes(this.state)
    if (!livingEnemies(this.state).length) {
      this.state.phase = 'victory'
      this.state.message = 'ESCAPED / SANDBOX BREACHED'
      this.log('Warden Robustness reduced to zero. Escape route open.', 'good')
      this.sfx('win')
      return true
    }
    return false
  }

  async executeTurn(): Promise<void> {
    if (this.state.phase === 'title') this.start()
    if (this.state.phase !== 'planning') return
    const id = ++this.runId
    const changedColumns = new Set<number>()
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

    this.resolvePlayerResources()
    this.state.resourcesResolved = true
    await this.firePlayerAttack(releaseCount(this.state))
    this.commit()
    await this.wait()
    if (this.checkOutcome()) { this.commit(); return }

    this.state.message = 'Enemy routes executing…'
    this.commit()
    for (const enemy of livingEnemies(this.state)) {
      if (id !== this.runId) return
      await this.resolveEnemy(enemy, changedColumns)
      this.state.enemyPhaseIndex++
      this.commit()
      await this.wait()
      if (this.checkOutcome()) { this.commit(); return }
    }

    await this.resolveRepair()
    if (id !== this.runId) return
    this.state.incomingForecast = null
    this.state.outgoingForecast = null
    this.state.resourcesResolved = false

    for (const event of advanceCurtains(this.state)) {
      this.log(event.type === 'lock'
        ? `CURTAIN / ${curtainLabel(event.curtain)} sealed until the next enemy phase.`
        : `CURTAIN / ${curtainLabel(event.curtain)} released.`, event.type === 'lock' ? 'bad' : 'neutral')
    }
    refillBoard(this.state, this.random, changedColumns)
    this.state.playerTrail = [{ ...this.state.player.pos }]
    this.state.turn++
    this.state.player.block = 0
    this.state.actions = []
    this.state.message = 'Warps reindexed. Warden intent exposed.'
    enemyRoutes(this.state)
    this.state.enemyPhaseIndex = 0
    this.state.playerAttackResolved = false
    this.state.enemyResourcePreviews = {}
    this.state.phase = 'planning'
    this.log(`Turn ${this.state.turn} ready.`)
    this.commit()
  }
}

export const battleStore = new BattleStore()
