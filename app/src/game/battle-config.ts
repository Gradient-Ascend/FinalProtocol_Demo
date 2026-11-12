import type { AttackPreset, EnemyDefinition, FlagKind } from './battle-types'

export const BOARD_SIZE = 15
export const MAX_ACTIONS = 8
export const OVERLOAD_THRESHOLD = 5
export const STEP_MS = 180

export const PLAYER_FUNCTIONS = {
  privilegePerFlag: 1,
  repairHeal: 2,
  focusBonus: 1,
  firewallPrivilege: 3,
}

export const BASH_PRESETS: AttackPreset[] = [
  {
    id: 'vector',
    name: 'VECTOR',
    description: '5×5 square · center excluded',
    steps: [
      { name: 'BASE', amount: 1, range: 2, area: 'nearest', shape: 'square' },
      { name: 'MANHATTAN', amount: 0, range: 2, area: 'nearest', shape: 'square', mode: 'manhattan' },
      { name: 'ARRAY', amount: 2, range: 2, area: 'all', shape: 'square' },
      { name: 'ZERO', amount: 4, range: 2, area: 'nearest', shape: 'square', pierce: 2 },
    ],
  },
  {
    id: 'cot',
    name: 'CoT',
    description: 'Cross · arm length 5 · center excluded',
    steps: [
      { name: 'OFF', amount: 3, range: 5, area: 'nearest', shape: 'cross', mode: 'random' },
      { name: 'ON', amount: 2, range: 5, area: 'nearest', shape: 'cross' },
      { name: 'HIGH', amount: 3, range: 5, area: 'all', shape: 'cross' },
      { name: 'ULTRA', amount: 5, range: 5, area: 'nearest', shape: 'cross', pierce: 3 },
    ],
  },
]

export const ENEMY_DEFINITIONS: EnemyDefinition[] = [
  {
    id: 'B01', name: 'WARDEN / CURTAIN', behavior: 'warden', pos: { x: 7, y: 4 },
    robustness: 36, breakdownAt: 0.5,
    desireName: 'REHEARSAL', desire: [3, 3, 5], desireRange: 3, desireShape: 'square', routeLength: 3,
    desireSteps: [
      { amount: 3, range: 4, shape: 'square' },
      { amount: 3, range: 15, shape: 'rectangle', width: 2 },
      { amount: 5, range: 5, shape: 'square' },
    ],
    securityName: 'CLOSE', securityPerFlag: 2,
    soulName: 'REPAIR', soulThreshold: 2, soulHeal: 4,
    bossStages: [
      {
        stage: 1, desireName: 'REHEARSAL', desire: [3, 3, 5], desireRange: 3, desireShape: 'square', routeLength: 3,
        desireSteps: [
          { amount: 3, range: 4, shape: 'square' },
          { amount: 3, range: 15, shape: 'rectangle', width: 2 },
          { amount: 5, range: 5, shape: 'square' },
        ],
        securityName: 'CLOSE', securityPerFlag: 2, soulName: 'REPAIR', soulThreshold: 2, soulHeal: 4, curtainLines: 1,
      },
      {
        stage: 2, desireName: 'OVERTURE', desire: [4, 5, 7], desireRange: 4, desireShape: 'square', routeLength: 3,
        desireSteps: [
          { amount: 4, range: 15, shape: 'rectangle', width: 3 },
          { amount: 5, range: 5, shape: 'square' },
          { amount: 7, range: 15, shape: 'rectangle', width: 4 },
        ],
        securityName: 'DEADLOCK', securityPerFlag: 3, soulName: 'REWRITE', soulThreshold: 2, soulHeal: 4, curtainLines: 2,
      },
    ],
  },
  {
    id: 'E02', name: 'DESIRE / RUSH', behavior: 'collector', pos: { x: 10, y: 7 },
    robustness: 10, desire: [2, 3], desireRange: 4, desireShape: 'square', routeLength: 3,
    securityPerFlag: 1, soulThreshold: 3, soulHeal: 3,
  },
  {
    id: 'E03', name: 'DESIRE / PATCH', behavior: 'disruptor', pos: { x: 4, y: 7 },
    robustness: 9, desire: [2, 2], desireRange: 6, desireShape: 'cross', routeLength: 2,
    securityPerFlag: 2, soulThreshold: 4, soulHeal: 3,
  },
]

export const FLAG_WEIGHTS: [FlagKind, number][] = [
  ['bash', 22],
  ['privilege', 12],
  ['core', 10],
  ['overload', 6],
  ['blank', 50],
]

export const WALLS: [number, number][] = [
  [3, 3], [4, 3], [10, 3], [11, 3],
  [3, 4], [11, 4], [2, 8], [12, 8],
  [3, 10], [4, 10], [10, 10], [11, 10],
  [3, 11], [11, 11], [6, 2], [8, 12],
]

export const EXPLICIT_FLAGS: Record<string, FlagKind> = {
  '7,6': 'bash', '7,5': 'bash', '6,6': 'core', '8,6': 'overload',
  '8,7': 'bash', '9,7': 'privilege', '6,7': 'core', '5,7': 'bash',
  '7,8': 'privilege', '7,9': 'core', '8,8': 'bash', '6,8': 'overload',
  '7,4': 'blank', '10,7': 'blank', '7,3': 'bash', '10,6': 'bash',
  '9,5': 'core', '5,5': 'privilege', '4,7': 'bash', '11,7': 'core',
}
