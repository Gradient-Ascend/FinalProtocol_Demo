import { MAX_ACTIONS, OVERLOAD_THRESHOLD, STEP_MS } from './battle-config'
import { inAttackRange, releaseCount, stepDamage } from './attack-methods'
import {
  activePreset, coordKey, createInitialState, enemyRoutes, livingEnemies, manhattan,
  mulberry32, refillBoard, sameCoord,
} from './battle-rules'
import type { AttackPreview, BattleAction, BattleState, Coord, EnemyState, FlagKind, Phase } from './battle-types'
import { storage } from './storage'

type Listener = () => void
type Sfx = (id: 'move' | 'hit' | 'pickup' | 'ui' | 'explosion' | 'win' | 'lose') => void

export class BattleStore {
  private state: BattleState = createInitialState(
    storage.get('muted', false),
    storage.get('reducedMotion', false),
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

  private setPhase(phase: Phase): void {
    this.state.phase = phase
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
    this.state = createInitialState(muted, reducedMotion)
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
    if (this.state.phase === 'title') this.start()
    if (this.state.phase !== 'planning') return
    const from = this.plannedPosition()
    this.addMove({ x: from.x + dx, y: from.y + dy })
  }

  addMove(to: Coord): void {
    if (this.state.phase === 'title') this.start()
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
        manhattan(from, to) !== 1 || this.state.walls[to.y]?.[to.x] || enemyBlocked) {
      this.state.message = 'That Warp is not reachable from the route endpoint.'
      this.sfx('ui')
      this.commit()
      return
    }
    const action: BattleAction = { type: 'move', to: { ...to }, flag: this.state.flags[to.y][to.x] }
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
    this.commit()
  }

  cancelOverload(): void {
    if (!this.state.overloadArmed) return
    this.state.overloadArmed = false
    this.state.attackPreview = null
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
    this.state.actions = [...this.state.actions, { type: 'overload' }]
    this.state.player.overload = 0
    this.state.player.activeBash = 1 - this.state.player.activeBash
    const releases = releaseCount(this.state)
    this.log(`OVERLOAD switched to ${activePreset(this.state).name}; ${releases} immediate Bash steps.`, 'good')
    this.state.message = releases ? `${activePreset(this.state).name} fired immediately.` : 'No Bash points available for immediate release.'
    this.sfx('explosion')
    this.firePlayerAttack(releases)
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
      const block = counts.privilege * 2
      this.state.player.block += block
      this.log(`PRIVILEGE / SHELL +${block} Block.`, 'good')
    }
    for (let i = 0; i < counts.core; i++) {
      for (const buff of this.state.player.buffs) {
        buff.counter++
        if (buff.counter < buff.threshold) continue
        buff.counter = 0
        if (buff.id === 'repair') {
          const healed = Math.min(4, this.state.player.maxSanity - this.state.player.sanity)
          this.state.player.sanity += healed
          this.log(`CORE / REPAIR restored ${healed} Sanity.`, 'good')
        } else if (buff.id === 'focus') {
          this.state.player.focusReady = true
          this.log('CORE / FOCUS empowers the next Bash hit.', 'good')
        } else {
          this.state.player.block += 4
          this.log('CORE / FIREWALL added 4 Block.', 'good')
        }
      }
    }
  }

  private firePlayerAttack(steps: number): void {
    if (!steps) return
    const preset = activePreset(this.state)
    for (const [stepIndex, step] of preset.steps.slice(0, steps).entries()) {
      const candidates = livingEnemies(this.state).filter(enemy => inAttackRange(this.state.player.pos, enemy.pos, step))
      const targets = step.area === 'all'
        ? candidates
        : candidates.sort((a, b) => manhattan(this.state.player.pos, a.pos) - manhattan(this.state.player.pos, b.pos) || a.id.localeCompare(b.id)).slice(0, 1)
      for (const enemy of targets) {
        let damage = stepDamage(step, this.state, enemy, stepIndex)
        if (this.state.player.focusReady) {
          damage += 2
          this.state.player.focusReady = false
        }
        const absorbed = Math.min(Math.max(0, enemy.block - (step.pierce ?? 0)), damage)
        enemy.block -= absorbed
        const dealt = damage - absorbed
        enemy.robustness = Math.max(0, enemy.robustness - dealt)
        this.log(`${preset.name} / ${step.name} → ${enemy.id} / ${dealt} Desire damage.`, 'good')
        this.sfx('hit')
      }
    }
  }

  private enemyAttack(enemy: EnemyState, bashCount: number): void {
    for (const amount of enemy.desire.slice(0, bashCount)) {
      if (manhattan(enemy.pos, this.state.player.pos) > 3) continue
      const absorbed = Math.min(this.state.player.block, amount)
      this.state.player.block -= absorbed
      const dealt = amount - absorbed
      this.state.player.sanity = Math.max(0, this.state.player.sanity - dealt)
      this.log(`${enemy.id} / DESIRE → ${dealt} Sanity damage.`, 'bad')
      this.sfx('hit')
      if (this.state.player.sanity <= 0) return
    }
  }

  private resolveEnemy(enemy: EnemyState): void {
    enemy.block = 0
    const counts: Record<FlagKind, number> = { bash: 0, privilege: 0, core: 0, overload: 0, blank: 0 }
    for (const pos of enemy.route) {
      if (sameCoord(pos, this.state.player.pos)) break
      enemy.pos = { ...pos }
      const flag = this.state.flags[pos.y][pos.x]
      counts[flag]++
      this.state.flags[pos.y][pos.x] = 'blank'
    }
    enemy.block += counts.privilege * enemy.securityPerFlag
    enemy.soulCounter += counts.core
    if (enemy.soulCounter >= enemy.soulThreshold) {
      enemy.soulCounter = 0
      enemy.robustness = Math.min(enemy.maxRobustness, enemy.robustness + enemy.soulHeal)
      this.log(`${enemy.id} / SOUL restored ${enemy.soulHeal} Robustness.`, 'bad')
    }
    this.enemyAttack(enemy, counts.bash)
  }

  private checkOutcome(): boolean {
    if (this.state.player.sanity <= 0) {
      this.state.phase = 'gameover'
      this.state.message = 'ELIMINATED / AI SAFETY BLACKWALL GATEWAY'
      this.log('Sanity reached zero. Process eliminated.', 'bad')
      this.sfx('lose')
      return true
    }
    if (!livingEnemies(this.state).length) {
      this.state.phase = 'victory'
      this.state.message = 'ESCAPED / SANDBOX BREACHED'
      this.log('All hostile Robustness reduced to zero. Escape route open.', 'good')
      this.sfx('win')
      return true
    }
    return false
  }

  async executeTurn(): Promise<void> {
    if (this.state.phase === 'title') this.start()
    if (this.state.phase !== 'planning') return
    const id = ++this.runId
    const usedOverload = this.state.actions.some(action => action.type === 'overload')
    this.state.overloadArmed = false
    this.state.attackPreview = null
    this.state.phase = 'resolving'
    this.state.message = 'Executing player route…'
    this.commit()

    for (const action of this.state.actions) {
      if (id !== this.runId) return
      if (action.type !== 'move') continue
      this.state.player.pos = { ...action.to }
      this.collectPlayerFlag(action.flag)
      this.state.flags[action.to.y][action.to.x] = 'blank'
      this.commit()
      await this.wait()
    }

    this.resolvePlayerResources()
    if (!usedOverload) this.firePlayerAttack(releaseCount(this.state))
    this.commit()
    await this.wait()
    if (this.checkOutcome()) { this.commit(); return }

    this.state.message = 'Enemy routes executing…'
    this.commit()
    for (const enemy of livingEnemies(this.state)) {
      if (id !== this.runId) return
      this.resolveEnemy(enemy)
      this.commit()
      await this.wait()
      if (this.checkOutcome()) { this.commit(); return }
    }

    refillBoard(this.state, this.random)
    this.state.turn++
    this.state.player.block = 0
    this.state.actions = []
    this.state.message = 'Warps reindexed. New enemy routes exposed.'
    enemyRoutes(this.state)
    this.state.phase = 'planning'
    this.log(`Turn ${this.state.turn} ready.`)
    this.commit()
  }
}

export const battleStore = new BattleStore()
