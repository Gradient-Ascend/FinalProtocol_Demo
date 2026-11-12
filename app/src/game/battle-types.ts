export type Coord = { x: number; y: number }
export type FlagKind = 'bash' | 'privilege' | 'core' | 'overload' | 'blank'
export type Phase = 'title' | 'planning' | 'resolving' | 'paused' | 'victory' | 'gameover'
export type Area = 'nearest' | 'all'
export type AttackShape = 'square' | 'cross'
export type AttackMode = 'fixed' | 'manhattan' | 'random'

export type AttackStep = {
  name: string
  amount: number
  range: number
  area: Area
  shape: AttackShape
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

export type EnemyState = {
  id: string
  name: string
  pos: Coord
  robustness: number
  maxRobustness: number
  block: number
  desire: number[]
  securityPerFlag: number
  soulCounter: number
  soulThreshold: number
  soulHeal: number
  route: Coord[]
  statuses: string[]
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
  walls: boolean[][]
  player: PlayerState
  enemies: EnemyState[]
  actions: BattleAction[]
  log: LogEntry[]
  muted: boolean
  reducedMotion: boolean
  message: string
  attackPreview: { presetIndex: number; stepIndex: number } | null
  overloadArmed: boolean
}
