export type Coord = { x: number; y: number }
export type FlagKind = 'bash' | 'privilege' | 'core' | 'overload' | 'blank'
export type Phase = 'title' | 'planning' | 'resolving' | 'paused' | 'victory' | 'gameover'
export type Area = 'nearest' | 'all'
export type AttackShape = 'square' | 'cross' | 'rectangle'
export type AttackMode = 'fixed' | 'manhattan' | 'random'
export type EnemyBehavior = 'hunter' | 'collector' | 'disruptor' | 'warden'

export type AttackStep = {
  name: string
  amount: number
  range: number
  area: Area
  shape: AttackShape
  width?: number
  mode?: AttackMode
  pierce?: number
  fx?: string
  // Which skill the step comes from; its rider is resolved by that id.
  skill?: string
}

export type AttackPreset = {
  id: string
  name: string
  description: string
  steps: AttackStep[]
}

export type AttackPreview = {
  presetIndex: number
  stepIndex: number
}

export type CoreBuff = {
  id: 'repair' | 'focus' | 'firewall'
  name: string
  counter: number
  threshold: number
  description: string
}

export type PlayerState = {
  pos: Coord
  sanity: number
  maxSanity: number
  block: number
  overload: number
  activeBash: number
  focusReady: boolean
  buffs: CoreBuff[]
}

export type DesireStep = {
  amount: number
  range: number
  shape: AttackShape
  width?: number
}

export type BossStageDefinition = {
  stage: number
  desireName: string
  desire: number[]
  desireSteps?: DesireStep[]
  desireRange: number
  desireShape: AttackShape
  routeLength: number
  securityName: string
  securityPerFlag: number
  soulName: string
  soulThreshold: number
  soulHeal: number
  curtainLines: 1 | 2
  // Desire methods released even when no Bash Flag was collected.
  desireFloor: number
}

export type EnemyDefinition = {
  id: string
  name: string
  behavior: EnemyBehavior
  pos: Coord
  robustness: number
  desire: number[]
  desireSteps?: DesireStep[]
  desireRange: number
  desireShape: AttackShape
  routeLength: number
  securityPerFlag: number
  soulThreshold: number
  soulHeal: number
  desireName?: string
  securityName?: string
  soulName?: string
  breakdownAt?: number
  desireFloor?: number
  bossStages?: BossStageDefinition[]
}

export type EnemyState = EnemyDefinition & {
  maxRobustness: number
  block: number
  soulCounter: number
  stage: number
  route: Coord[]
  effectCell: Coord | null
  statuses: string[]
} & EnemyMarks

// What skills write on a Geek and other skills read. `live` is the turn the
// LIVE tag was applied (0 = none); it lasts until spent or until the end of
// the player's next release. The rest reset when the turn ends.
export type EnemyMarks = {
  live: number
  breached: boolean
  shifted: boolean
  struck: boolean
  dropped: number
}

export type Curtain = {
  axis: 'row' | 'column'
  index: number
  fireTurn: number
  locked: boolean
  unlockTurn: number | null
}

export type EnemyAttackPreview = {
  enemyId: string
  stepIndex: number
}

export type AttackEffect = {
  source: 'player' | 'enemy'
  presetId: string
  origin: Coord
  target: Coord
  stepIndex: number
  shape: AttackShape
  range: number
  width?: number
  fx?: string
  // Raw damage of the hit, and for a random skill the most it could roll.
  amount?: number
  cap?: number
  // What the hit takes off the target after block, and what block absorbs.
  dealt?: number
  absorbed?: number
  // Released by an Overload rather than at the end of the turn.
  overload?: boolean
  // Interaction words to print with the hit: PUSH, BUMP, PINNED, BREACH, LIVE…
  events?: string[]
}

export type BattleAction =
  | { type: 'move'; to: Coord; flag: FlagKind }
  | { type: 'overload' }

export type LogEntry = {
  id: number
  text: string
  tone: 'neutral' | 'good' | 'bad'
}

export type PredictedHit = {
  enemyId: string
  presetIndex: number
  stepIndex: number
  damage: number
  absorbed: number
  dealt: number
  focus: number
  before: number
  after: number
  // Interactions this hit triggered, and the target as the hit leaves it.
  events: string[]
  marks: EnemyMarks & { pos: Coord; block: number; route: Coord[]; effectCell: Coord | null }
  // A route Flag this hit overwrote with Blank.
  blank?: Coord
  // Overload charge earned by the interactions of this hit.
  charge: number
  // Collateral from a bump: applied with the hit before it, with no effect of its own.
  silent?: boolean
}

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

export type PlayerResourcePreview = {
  healing: number
  privilegeGain: number
  blockAfterResources: number
}

export type EnemyResourcePreview = {
  securityGain: number
  recovery: number
  soulCounterAfter: number
}

export type BattleState = {
  // The two Bash decks in play, built from the loadout chosen on the menu.
  presets: AttackPreset[]
  phase: Phase
  resumePhase: 'planning' | 'resolving' | null
  turn: number
  boardSize: number
  flags: FlagKind[][]
  incoming: FlagKind[][]
  walls: boolean[][]
  curtains: Curtain[]
  curtainCycle: number
  player: PlayerState
  playerTrail: Coord[]
  enemies: EnemyState[]
  actions: BattleAction[]
  resolvedMoves: number
  enemyPhaseIndex: number
  playerAttackResolved: boolean
  enemyResourcePreviews: Record<string, EnemyResourcePreview>
  // Running totals of what block has absorbed for each unit ('player' or a
  // Geek id), so its HP bar can show a blocked hit as blocked.
  absorbedTotals: Record<string, number>
  // Overload charge already earned from interactions this turn (capped).
  interactionCharge: number
  log: LogEntry[]
  muted: boolean
  reducedMotion: boolean
  message: string
  attackPreview: AttackPreview | null
  enemyAttackPreview: EnemyAttackPreview | null
  overloadArmed: boolean
  // Hits still to land this turn. Fixed when the turn starts and consumed as
  // each one resolves, so the HP bars never re-predict mid-animation.
  incomingForecast: PredictedEnemyHit[] | null
  outgoingForecast: PredictedHit[] | null
  // REPAIR earned this turn; it heals after the enemy phase.
  pendingRepair: number
  // False while the route is still being walked, so the panel keeps showing
  // the forecast PRIVILEGE and REPAIR until they are actually granted.
  resourcesResolved: boolean
}
