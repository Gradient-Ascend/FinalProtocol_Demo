import script from '../story/script.json'
import { ENEMY_DEFINITIONS, EXPLICIT_FLAGS, FLAG_WEIGHTS, WALLS } from './battle-config'
import type { BossStageDefinition, BroodDefinition, Coord, EnemyBehavior, EnemyDefinition, FlagKind } from './battle-types'
import { compileStage } from './enemy-kits'
import type { AttackSkill, CoreSkill, CountdownDef, PrivilegeSkill, StageKit } from './enemy-kits'
import { SIGILS, sigilPart } from './sigils'

export type GodId = 'none' | 'grove' | 'court' | 'carcosa'
export type BossMechanic = 'curtain' | 'brood' | 'articles' | 'undisclosed'
export type EncounterKind = 'prologue' | 'skirmish' | 'boss'

// One battle: a board, who stands on it and the one rule its boss brings.
export type Encounter = {
  id: string                      // '0.B', '1.1' … '3.B'
  layer: 0 | 1 | 2 | 3
  kind: EncounterKind
  elite?: boolean
  name: string
  god: GodId
  // Seeds the board and, through it, the Warps that fall in later.
  seed: number
  walls: [number, number][]       // solid cells
  sigil: [number, number][]       // the god's whole sign, for drawing; walls ⊆ sigil on campaign maps
  playerStart: Coord
  enemies: EnemyDefinition[]
  explicitFlags?: Record<string, FlagKind>
  flagWeights?: [FlagKind, number][]
  mechanic?: BossMechanic
  // The last turn fought at base Desire: from the turn after it every living
  // Geek's Desire steps gain +1 at each turn boundary.
  trace?: number
}

type LayerText = {
  name: string
  nodes: { id: string; name: string }[]
  enemies?: Record<string, string>
  elite?: { key: string; name: string }
  kits?: Record<string, { attack: string; privilege: string; core?: string }>
  boss?: { sets: { desire: string; security: string; soul: string }[] }
}
const LAYERS = script.layers as LayerText[]

function nodeName(id: string): string {
  return LAYERS.flatMap(layer => layer.nodes).find(node => node.id === id)?.name ?? id
}

// 'BLACKWALL', 'GROVE', 'COURT', 'CARCOSA'.
export function layerName(layer: number): string {
  return LAYERS[layer]?.name ?? `LAYER ${layer}`
}

// The prologue is the battle the game shipped with, unchanged in structure:
// its kit constants live in battle-config.ts.
export const WARDEN_ENCOUNTER: Encounter = {
  id: '0.B', layer: 0, kind: 'prologue', name: nodeName('0.B'), god: 'none',
  seed: 0xF1A6,
  walls: WALLS, sigil: [],
  playerStart: { x: 7, y: 7 },
  enemies: ENEMY_DEFINITIONS,
  explicitFlags: EXPLICIT_FLAGS,
  flagWeights: FLAG_WEIGHTS,
  mechanic: 'curtain',
}

// ─────────────────────────────────────────────────────────────────────────
// CAMPAIGN DATA. Everything from here to the closing rule is data: rosters,
// numbers, positions and Flag weights, tuned against the bots in bot.ts (see
// campaign-content.test.ts). Nothing else in the engine holds campaign
// numbers. The signs themselves are drawn in sigils.ts.
// ─────────────────────────────────────────────────────────────────────────

function geekName(layer: number, key: string): string {
  return LAYERS[layer]?.enemies?.[key] ?? `DESIRE / ${key.toUpperCase()}`
}

function kitNames(layer: number, key: string): { attack: string; privilege: string; core?: string } {
  return LAYERS[layer]?.kits?.[key] ?? { attack: 'DESIRE', privilege: 'SECURITY', core: 'SOUL' }
}

type GeekKit = Omit<EnemyDefinition, 'id' | 'name' | 'pos' | 'robustness'>
type Nameless<T> = T extends unknown ? Omit<T, 'name'> : never

function mobKit(
  layer: number,
  key: string,
  behavior: EnemyBehavior,
  attack: Nameless<AttackSkill>,
  privilege: Nameless<PrivilegeSkill>,
  routeLength: number,
  sure: number,
): GeekKit {
  const names = kitNames(layer, key)
  return {
    tier: 'mob',
    behavior,
    ...compileStage({
      attack: { ...attack, name: names.attack } as AttackSkill,
      privilege: { ...privilege, name: names.privilege } as PrivilegeSkill,
      sure,
      routeLength,
    }),
  }
}

function eliteKit(
  layer: number,
  behavior: EnemyBehavior,
  attack: Nameless<AttackSkill>,
  privilege: Nameless<PrivilegeSkill>,
  core: Nameless<CoreSkill>,
  routeLength: number,
  sure: number,
): GeekKit {
  const key = LAYERS[layer]?.elite?.key ?? 'elite'
  const names = kitNames(layer, key)
  return {
    tier: 'elite',
    behavior,
    ...compileStage({
      attack: { ...attack, name: names.attack } as AttackSkill,
      privilege: { ...privilege, name: names.privilege } as PrivilegeSkill,
      core: { ...core, name: names.core ?? 'CORE' } as CoreSkill,
      sure,
      routeLength,
    }),
  }
}

const GEEKS: Record<number, Record<string, GeekKit>> = {
  // GROVE, appetite. Mobs carry no Core skill and no sure forms; the Sapling
  // elite holds THORN (I/II), HERD ward, and SAP mend.
  1: {
    hunter: mobKit(1, 'hunter', 'hunter', { shape: 'square', range: 4, forms: [3] }, { kind: 'ward', perFlag: 1 }, 3, 0),
    collector: mobKit(1, 'collector', 'collector', { shape: 'square', range: 5, forms: [3] }, { kind: 'ward', perFlag: 2 }, 4, 0),
    brood: mobKit(1, 'brood', 'hunter', { shape: 'square', range: 3, forms: [2] }, { kind: 'ward', perFlag: 1 }, 3, 0),
    elite: eliteKit(
      1, 'grazer',
      { shape: 'square', range: 4, forms: [2, 4] },
      { kind: 'ward', perFlag: 2 },
      { kind: 'mend', threshold: 3, heal: 4 },
      3, 0,
    ),
  },
  // COURT, confusion. From here on every non-boss has 1 sure form; Usher
  // introduces entitle, and the Bailiff elite brings surge.
  2: {
    hunter: mobKit(2, 'hunter', 'hunter', { shape: 'square', range: 3, forms: [4] }, { kind: 'ward', perFlag: 1 }, 3, 1),
    collector: mobKit(2, 'collector', 'collector', { shape: 'square', range: 5, forms: [3] }, { kind: 'ward', perFlag: 2 }, 4, 1),
    disruptor: mobKit(2, 'disruptor', 'disruptor', { shape: 'rectangle', range: 15, width: 1, forms: [3] }, { kind: 'entitle', bonusPerFlag: 1 }, 2, 1),
    elite: eliteKit(
      2, 'hunter',
      { shape: 'rectangle', range: 15, width: 1, forms: [3, 5] },
      { kind: 'entitle', bonusPerFlag: 1 },
      { kind: 'surge', threshold: 2 },
      3, 1,
    ),
  },
  // CARCOSA, ignorance. Long reach and thin Flags; the Pallid Mask elite holds
  // mystery Security and mend.
  3: {
    hunter: mobKit(3, 'hunter', 'hunter', { shape: 'square', range: 4, forms: [4] }, { kind: 'ward', perFlag: 1 }, 3, 1),
    collector: mobKit(3, 'collector', 'collector', { shape: 'rectangle', range: 15, width: 2, forms: [3] }, { kind: 'ward', perFlag: 2 }, 4, 1),
    disruptor: mobKit(3, 'disruptor', 'disruptor', { shape: 'rectangle', range: 15, width: 1, forms: [3] }, { kind: 'entitle', bonusPerFlag: 1 }, 2, 1),
    elite: eliteKit(
      3, 'disruptor',
      { shape: 'rectangle', range: 15, width: 2, forms: [4, 6] },
      { kind: 'mystery', perFlag: 1, floor: 2 },
      { kind: 'mend', threshold: 3, heal: 3 },
      3, 1,
    ),
  },
}

function geek(layer: number, kind: string, id: string, x: number, y: number, robustness: number): EnemyDefinition {
  return { id, name: geekName(layer, kind), pos: { x, y }, robustness, ...GEEKS[layer][kind] }
}

function elite(layer: number, id: string, x: number, y: number, robustness: number): EnemyDefinition {
  const name = LAYERS[layer]?.elite?.name ?? `DESIRE / ELITE ${layer}`
  return { id, name, pos: { x, y }, robustness, ...GEEKS[layer].elite }
}

type StageSpec = {
  attack: Nameless<AttackSkill>
  privilege: Nameless<PrivilegeSkill>
  core: Nameless<CoreSkill>
  routeLength: number
  sure: number
}

// A boss stage under the names script.json gives that boss's sets.
function stage(layer: number, index: number, spec: StageSpec): BossStageDefinition {
  const set = LAYERS[layer]?.boss?.sets[index] ?? { desire: 'DESIRE', security: 'SECURITY', soul: 'SOUL' }
  const kit: StageKit = {
    attack: { ...spec.attack, name: set.desire } as AttackSkill,
    privilege: { ...spec.privilege, name: set.security } as PrivilegeSkill,
    core: { ...spec.core, name: set.soul } as CoreSkill,
    sure: spec.sure,
    routeLength: spec.routeLength,
  }
  return {
    stage: index + 1,
    curtainLines: 1,
    ...compileStage(kit),
  }
}

type BossBase = Pick<EnemyDefinition, 'id' | 'name' | 'behavior' | 'pos' | 'robustness'>
  & Partial<Pick<EnemyDefinition, 'breakdownAt' | 'hidden' | 'undisclosed' | 'brood'>>
  & { countdowns: CountdownDef[] }

// A boss starts the battle as its first stage.
function boss(base: BossBase, stages: BossStageDefinition[]): EnemyDefinition {
  const first = stages[0]
  return {
    tier: 'boss',
    breakdownAt: 0.5,
    ...base,
    desireName: first.desireName,
    desire: [...first.desire],
    desireSteps: first.desireSteps?.map(step => ({ ...step })),
    desireRange: first.desireRange,
    desireShape: first.desireShape,
    routeLength: first.routeLength,
    securityName: first.securityName,
    securityPerFlag: first.securityPerFlag,
    privilegeSkill: { ...first.privilegeSkill },
    soulName: first.soulName,
    soulThreshold: first.soulThreshold,
    soulHeal: first.soulHeal,
    coreSkill: first.coreSkill ? { ...first.coreSkill } : undefined,
    desireFloor: first.desireFloor,
    bossStages: stages,
  }
}

// What the Dark Young gives birth to: the Grove's small hunter, without a place
// yet.
const AGAIN: BroodDefinition = {
  limit: 3,
  spawn: { name: geekName(1, 'brood'), robustness: 4, ...GEEKS[1].brood },
}

// Flag weights are bash / privilege / core / overload / blank, out of 100.
const weights = (bash: number, privilege: number, core: number, overload: number, blank: number): [FlagKind, number][] =>
  [['bash', bash], ['privilege', privilege], ['core', core], ['overload', overload], ['blank', blank]]

const CAMPAIGN: Encounter[] = [
  // Layer 1, GROVE: abundance. Fewer blanks, more Core and Overload: the
  // board feeds whoever walks it, and the Geeks walk it too.
  {
    id: '1.1', layer: 1, kind: 'skirmish', name: nodeName('1.1'), god: 'grove', seed: 0x6A0111,
    walls: sigilPart('1.1'), sigil: SIGILS.grove, playerStart: { x: 7, y: 8 },
    enemies: [geek(1, 'hunter', 'E01', 4, 4, 12), geek(1, 'hunter', 'E02', 10, 4, 10)],
    flagWeights: weights(26, 8, 12, 10, 44),
    trace: 5,
  },
  {
    id: '1.2', layer: 1, kind: 'skirmish', name: nodeName('1.2'), god: 'grove', seed: 0x6A0112,
    walls: sigilPart('1.2'), sigil: SIGILS.grove, playerStart: { x: 7, y: 12 },
    enemies: [geek(1, 'collector', 'E01', 5, 6, 10), geek(1, 'collector', 'E02', 9, 6, 10), geek(1, 'hunter', 'E03', 7, 3, 8)],
    flagWeights: weights(22, 10, 14, 12, 42),
    trace: 5,
  },
  {
    id: '1.3', layer: 1, kind: 'skirmish', elite: true, name: nodeName('1.3'), god: 'grove', seed: 0x6A0113,
    walls: sigilPart('1.3'), sigil: SIGILS.grove, playerStart: { x: 7, y: 9 },
    enemies: [
      elite(1, 'E01', 7, 12, 15),
      geek(1, 'brood', 'E02', 4, 5, 6), geek(1, 'collector', 'E03', 10, 5, 8),
    ],
    flagWeights: weights(24, 8, 16, 10, 42),
    trace: 5,
  },
  {
    id: '1.B', layer: 1, kind: 'boss', name: nodeName('1.B'), god: 'grove', seed: 0x6A011B,
    walls: SIGILS.grove, sigil: SIGILS.grove, playerStart: { x: 7, y: 13 },
    enemies: [
      boss({
        id: 'B01', name: nodeName('1.B'), behavior: 'grazer', pos: { x: 7, y: 5 }, robustness: 44, brood: AGAIN,
        countdowns: [{ kind: 'gestation', name: 'GESTATION', every: 6 }],
      }, [
        stage(1, 0, {
          attack: { shape: 'square', range: 4, forms: [2, 3] },
          privilege: { kind: 'ward', perFlag: 1 },
          core: { kind: 'brood', threshold: 3 },
          routeLength: 3, sure: 1,
        }),
        stage(1, 1, {
          attack: { shape: 'square', range: 5, forms: [3, 4] },
          privilege: { kind: 'entitle', bonusPerFlag: 1 },
          core: { kind: 'brood', threshold: 2 },
          routeLength: 3, sure: 2,
        }),
      ]),
      geek(1, 'collector', 'E02', 11, 7, 7),
    ],
    flagWeights: weights(24, 8, 12, 10, 46),
    mechanic: 'brood', trace: 11,
  },

  // Layer 2, COURT: confusion. Core is scarce, so little is mended here, and
  // from here on every Geek has 1 sure form.
  {
    id: '2.1', layer: 2, kind: 'skirmish', name: nodeName('2.1'), god: 'court', seed: 0xC0A221,
    walls: sigilPart('2.1'), sigil: SIGILS.court, playerStart: { x: 7, y: 10 },
    enemies: [geek(2, 'disruptor', 'E01', 5, 5, 10), geek(2, 'disruptor', 'E02', 9, 5, 10), geek(2, 'hunter', 'E03', 7, 4, 10)],
    flagWeights: weights(24, 9, 5, 6, 56),
    trace: 5,
  },
  {
    id: '2.2', layer: 2, kind: 'skirmish', name: nodeName('2.2'), god: 'court', seed: 0xC0A222,
    walls: sigilPart('2.2'), sigil: SIGILS.court, playerStart: { x: 7, y: 12 },
    enemies: [geek(2, 'collector', 'E01', 4, 7, 12), geek(2, 'collector', 'E02', 10, 7, 10), geek(2, 'hunter', 'E03', 7, 3, 10)],
    flagWeights: weights(22, 10, 5, 6, 57),
    trace: 6,
  },
  {
    id: '2.3', layer: 2, kind: 'skirmish', elite: true, name: nodeName('2.3'), god: 'court', seed: 0xC0A223,
    walls: sigilPart('2.3'), sigil: SIGILS.court, playerStart: { x: 7, y: 9 },
    enemies: [
      elite(2, 'E01', 5, 3, 18),
      geek(2, 'hunter', 'E02', 9, 3, 9), geek(2, 'disruptor', 'E03', 7, 2, 8),
    ],
    flagWeights: weights(26, 9, 5, 6, 54),
    trace: 5,
  },
  {
    id: '2.B', layer: 2, kind: 'boss', name: nodeName('2.B'), god: 'court', seed: 0xC0A22B,
    walls: SIGILS.court, sigil: SIGILS.court, playerStart: { x: 7, y: 11 },
    enemies: [
      boss({
        id: 'B01', name: nodeName('2.B'), behavior: 'hunter', pos: { x: 7, y: 3 }, robustness: 50,
        countdowns: [{ kind: 'docket', name: 'DOCKET' }],
      }, [
        stage(2, 0, {
          attack: { shape: 'square', range: 5, forms: [4, 5] },
          privilege: { kind: 'ward', perFlag: 2 },
          core: { kind: 'mend', threshold: 3, heal: 4 },
          routeLength: 2, sure: 1,
        }),
        stage(2, 1, {
          attack: { shape: 'rectangle', range: 15, width: 3, forms: [5, 7] },
          privilege: { kind: 'entitle', bonusPerFlag: 1 },
          core: { kind: 'surge', threshold: 2 },
          routeLength: 3, sure: 2,
        }),
      ]),
      // CHANGE PLACES needs someone to change places with.
      geek(2, 'hunter', 'E02', 3, 7, 10),
      geek(2, 'disruptor', 'E03', 11, 7, 8),
    ],
    flagWeights: weights(22, 8, 3, 6, 61),
    mechanic: 'articles', trace: 14,
  },

  // Layer 3, CARCOSA: ignorance. Open ground, thin Flags, long reach.
  {
    id: '3.1', layer: 3, kind: 'skirmish', name: nodeName('3.1'), god: 'carcosa', seed: 0xCA5031,
    walls: sigilPart('3.1'), sigil: SIGILS.carcosa, playerStart: { x: 7, y: 7 },
    enemies: [geek(3, 'disruptor', 'E01', 3, 3, 12), geek(3, 'disruptor', 'E02', 11, 3, 10), geek(3, 'hunter', 'E03', 7, 2, 10)],
    flagWeights: weights(22, 6, 4, 6, 62),
    trace: 5,
  },
  {
    id: '3.2', layer: 3, kind: 'skirmish', name: nodeName('3.2'), god: 'carcosa', seed: 0xCA5032,
    walls: sigilPart('3.2'), sigil: SIGILS.carcosa, playerStart: { x: 10, y: 10 },
    enemies: [geek(3, 'collector', 'E01', 7, 5, 12), geek(3, 'collector', 'E02', 5, 7, 10), geek(3, 'hunter', 'E03', 10, 3, 10)],
    flagWeights: weights(22, 6, 4, 6, 62),
    trace: 5,
  },
  {
    id: '3.3', layer: 3, kind: 'skirmish', elite: true, name: nodeName('3.3'), god: 'carcosa', seed: 0xCA5033,
    walls: sigilPart('3.3'), sigil: SIGILS.carcosa, playerStart: { x: 4, y: 10 },
    enemies: [
      elite(3, 'E01', 7, 5, 13),
      geek(3, 'hunter', 'E02', 9, 7, 8), geek(3, 'disruptor', 'E03', 5, 3, 8),
    ],
    flagWeights: weights(24, 6, 4, 6, 60),
    trace: 5,
  },
  {
    id: '3.B', layer: 3, kind: 'boss', name: nodeName('3.B'), god: 'carcosa', seed: 0xCA503B,
    walls: SIGILS.carcosa, sigil: SIGILS.carcosa, playerStart: { x: 11, y: 12 },
    enemies: [
      boss({
        id: 'B01', name: nodeName('3.B'), behavior: 'hunter', pos: { x: 7, y: 5 }, robustness: 60,
        hidden: true, undisclosed: true,
        countdowns: [{ kind: 'advent', name: 'ADVENT', turn: 7 }],
      }, [
        stage(3, 0, {
          attack: { shape: 'square', range: 5, forms: [2, 4] },
          privilege: { kind: 'mystery', perFlag: 2, floor: 3 },
          core: { kind: 'mend', threshold: 3, heal: 3 },
          routeLength: 0, sure: 1,
        }),
        stage(3, 1, {
          attack: { shape: 'rectangle', range: 15, width: 5, forms: [6, 7] },
          privilege: { kind: 'ward', perFlag: 3 },
          core: { kind: 'mend', threshold: 2, heal: 5 },
          routeLength: 3, sure: 2,
        }),
      ]),
      geek(3, 'disruptor', 'E02', 1, 5, 8),
      geek(3, 'hunter', 'E03', 13, 5, 8),
    ],
    flagWeights: weights(22, 6, 4, 6, 62),
    mechanic: 'undisclosed', trace: 12,
  },
]

// ─────────────────────────────────────────────────────────────────────────
// End of campaign data.
// ─────────────────────────────────────────────────────────────────────────

export const ENCOUNTERS: Record<string, Encounter> = Object.fromEntries(
  [WARDEN_ENCOUNTER, ...CAMPAIGN].map(encounter => [encounter.id, encounter]),
)

// An id that names no encounter is a bug in the caller, not a state to play.
export function encounterById(id: string): Encounter {
  const encounter = ENCOUNTERS[id]
  if (!encounter) throw new Error(`unknown encounter: ${id}`)
  return encounter
}
