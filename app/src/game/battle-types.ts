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
}

export type BattleAction =
  | { type: 'move'; to: Coord; flag: FlagKind }
  | { type: 'overload' }

export type LogEntry = {
  id: number
  text: string
  tone: 'neutral' | 'good' | 'bad'
}

export type BattleState = {
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
  log: LogEntry[]
  muted: boolean
  reducedMotion: boolean
  message: string
  attackPreview: AttackPreview | null
  enemyAttackPreview: EnemyAttackPreview | null
  overloadArmed: boolean
}
