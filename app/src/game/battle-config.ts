import type { AttackPreset, FlagKind } from './battle-types'

export const BOARD_SIZE = 15
export const MAX_ACTIONS = 8
export const OVERLOAD_THRESHOLD = 5
export const STEP_MS = 180

export const BASH_PRESETS: AttackPreset[] = [
  {
    id: 'vector',
    name: 'VECTOR',
    description: '5×5 square · center excluded',
    steps: [
      { name: 'BASE', amount: 1, range: 2, area: 'nearest', shape: 'square' },
      { name: 'MANHATTAN', amount: 0, range: 2, area: 'nearest', shape: 'square', mode: 'manhattan' },
      { name: 'ARRAY', amount: 2, range: 2, area: 'all', shape: 'square' },
      { name: 'ZERO', amount: 5, range: 2, area: 'nearest', shape: 'square', pierce: 2 },
    ],
  },
  {
    id: 'cot',
    name: 'CoT',
    description: 'Cross · arm length 5 · center excluded',
    steps: [
      { name: 'OFF', amount: 3, range: 5, area: 'nearest', shape: 'cross', mode: 'random' },
      { name: 'ON', amount: 2, range: 5, area: 'nearest', shape: 'cross' },
      { name: 'HIGH', amount: 4, range: 5, area: 'all', shape: 'cross' },
      { name: 'ULTRA', amount: 7, range: 5, area: 'nearest', shape: 'cross', pierce: 3 },
    ],
  },
]

export const FLAG_WEIGHTS: [FlagKind, number][] = [
  ['bash', 34],
  ['privilege', 20],
  ['core', 18],
  ['overload', 8],
  ['blank', 20],
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
