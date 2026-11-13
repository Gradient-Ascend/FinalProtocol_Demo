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
