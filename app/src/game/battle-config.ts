import type { AttackPreset, BossStageDefinition, EnemyDefinition, FlagKind } from './battle-types'
import { compileStage } from './enemy-kits'
import { DEFAULT_LOADOUT, buildPresets } from './skills'

export const BOARD_SIZE = 15
export const MAX_ACTIONS = 8
export const OVERLOAD_THRESHOLD = 5
export const STEP_MS = 180
export const PLAYER_SANITY = 36

export const PLAYER_FUNCTIONS = {
  privilegePerFlag: 2,
  repairHeal: 3,
  focusBonus: 1,
  firewallPrivilege: 3,
}

// Skill interactions. A push or pull that is blocked deals `bump` to the Geek
// moved and to any Geek it hits; a Breached Geek takes `breachBonus` more from
// every later hit that turn; interactions earn at most `chargeCap` Overload
// charge per turn.
export const INTERACTIONS = {
  bump: 1,
  pinnedBonus: 2,
  breachBonus: 1,
  zeroStrip: 2,
  chargeCap: 2,
}

// The default decks. A battle uses the presets stored on its state, which
// come from the loadout picked on the menu.
export const BASH_PRESETS: AttackPreset[] = buildPresets(DEFAULT_LOADOUT)

const WARDEN_STAGES: BossStageDefinition[] = [
  {
    stage: 1,
    curtainLines: 1,
    ...compileStage({
      attack: { name: 'REHEARSAL', shape: 'square', range: 4, forms: [3, 5] },
      privilege: { kind: 'ward', name: 'CLOSE', perFlag: 2 },
      core: { kind: 'mend', name: 'REPAIR', threshold: 2, heal: 4 },
      sure: 1,
      routeLength: 3,
    }),
  },
  {
    stage: 2,
    curtainLines: 2,
    ...compileStage({
      attack: { name: 'OVERTURE', shape: 'rectangle', range: 15, width: 3, forms: [4, 7] },
      privilege: { kind: 'ward', name: 'DEADLOCK', perFlag: 3 },
      core: { kind: 'surge', name: 'REWRITE', threshold: 2 },
      sure: 2,
      routeLength: 3,
    }),
  },
]

export const ENEMY_DEFINITIONS: EnemyDefinition[] = [
  {
    id: 'B01',
    name: 'WARDEN / CURTAIN',
    tier: 'boss',
    behavior: 'warden',
    pos: { x: 7, y: 4 },
    robustness: 64,
    breakdownAt: 0.5,
    ...WARDEN_STAGES[0],
    bossStages: WARDEN_STAGES,
    countdowns: [{ kind: 'curtain', name: 'CURTAIN' }],
  },
  {
    id: 'E02',
    name: 'DESIRE / RUSH',
    tier: 'mob',
    behavior: 'collector',
    pos: { x: 10, y: 7 },
    robustness: 14,
    ...compileStage({
      attack: { name: 'RUSH', shape: 'square', range: 4, forms: [3] },
      privilege: { kind: 'ward', name: 'WARD', perFlag: 1 },
      sure: 0,
      routeLength: 3,
    }),
  },
  {
    id: 'E03',
    name: 'DESIRE / PATCH',
    tier: 'mob',
    behavior: 'disruptor',
    pos: { x: 4, y: 7 },
    robustness: 12,
    ...compileStage({
      attack: { name: 'PATCH', shape: 'cross', range: 6, forms: [2] },
      privilege: { kind: 'ward', name: 'WARD', perFlag: 2 },
      sure: 0,
      routeLength: 2,
    }),
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
