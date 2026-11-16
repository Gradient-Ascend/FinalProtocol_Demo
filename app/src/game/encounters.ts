import script from '../story/script.json'
import { ENEMY_DEFINITIONS, EXPLICIT_FLAGS, FLAG_WEIGHTS, WALLS } from './battle-config'
import type { BossStageDefinition, BroodDefinition, Coord, DesireStep, EnemyDefinition, FlagKind } from './battle-types'
import { SIGILS, sigilPart } from './sigils'

export type GodId = 'none' | 'grove' | 'court' | 'carcosa'
export type BossMechanic = 'curtain' | 'brood' | 'articles' | 'undisclosed'
export type EncounterKind = 'prologue' | 'skirmish' | 'boss'

// One battle: a board, who stands on it and the one rule its boss brings.
export type Encounter = {
  id: string                      // '0.B', '1.1' … '3.B'
  layer: 0 | 1 | 2 | 3
  kind: EncounterKind
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

// The prologue is the battle the game shipped with, unchanged: the constants
// in battle-config.ts are still where its numbers live.
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

type GeekStats = Omit<EnemyDefinition, 'id' | 'name' | 'pos' | 'robustness'>

const square = (amount: number, range: number): DesireStep => ({ amount, range, shape: 'square' })
// A band along the Geek's row and column, `width` cells to either side, the
// length of the board.
const band = (amount: number, width: number): DesireStep => ({ amount, range: 15, shape: 'rectangle', width })

// Desire as a list of steps. Steps that share one reach are written in the
// flat fields alone, as the prologue's Geeks are; a list with mixed reaches,
// or a band wider than 1, needs `desireSteps` to say so.
function desire(steps: DesireStep[]): Pick<GeekStats, 'desire' | 'desireSteps' | 'desireRange' | 'desireShape'> {
  const [first] = steps
  const flat = { desire: steps.map(step => step.amount), desireRange: first.range, desireShape: first.shape }
  const uniform = steps.every(step => step.range === first.range && step.shape === first.shape && (step.width ?? 1) === 1)
  return uniform ? flat : { ...flat, desireSteps: steps }
}

// Minor Geeks: the three existing behaviours under each layer's names, with
// that layer's numbers. `brood` is the Grove's small hunter.
//
// A Desire floor of 1 means the first step is released every turn, Bash Flag
// or not; steps past it still have to be collected. The Grove has none: its
// Geeks strike only on what they eat, as the prologue's do. From the Court on
// every Geek has one, small enough to block with a Privilege Flag or two.
// Without it a player who reads the forecast takes next to nothing from a
// skirmish: every strike can be denied by walking the Geek's route first.
const GEEKS: Record<number, Record<string, GeekStats>> = {
  // GROVE, appetite. They are led by what lies on the board and grow on it:
  // long routes, three steps to feed, Souls that fill fast.
  1: {
    hunter: { behavior: 'hunter', ...desire([square(2, 4), square(3, 4)]), routeLength: 3, securityPerFlag: 1, soulThreshold: 3, soulHeal: 3 },
    collector: { behavior: 'collector', ...desire([square(1, 5), square(2, 5), square(3, 5)]), routeLength: 4, securityPerFlag: 2, soulThreshold: 2, soulHeal: 4 },
    brood: { behavior: 'hunter', ...desire([square(2, 3), square(2, 3)]), routeLength: 3, securityPerFlag: 1, soulThreshold: 4, soulHeal: 2 },
  },
  // COURT, confusion. They take the board apart and strike along its lines:
  // the Usher's band is its row and column, one cell to either side.
  2: {
    hunter: { behavior: 'hunter', ...desire([square(3, 3), square(4, 3)]), routeLength: 3, securityPerFlag: 1, soulThreshold: 3, soulHeal: 3, desireFloor: 1 },
    collector: { behavior: 'collector', ...desire([square(1, 5), square(3, 5)]), routeLength: 4, securityPerFlag: 2, soulThreshold: 3, soulHeal: 3, desireFloor: 1 },
    disruptor: { behavior: 'disruptor', ...desire([band(2, 1), band(3, 1)]), routeLength: 2, securityPerFlag: 2, soulThreshold: 3, soulHeal: 3, desireFloor: 1 },
  },
  // CARCOSA, ignorance. Few walls and long reach: bands the length of the
  // board, and hunters that strike from four cells off.
  3: {
    hunter: { behavior: 'hunter', ...desire([square(3, 4), square(5, 4)]), routeLength: 3, securityPerFlag: 1, soulThreshold: 3, soulHeal: 3, desireFloor: 1 },
    collector: { behavior: 'collector', ...desire([band(2, 2), band(4, 2)]), routeLength: 4, securityPerFlag: 2, soulThreshold: 3, soulHeal: 4, desireFloor: 1 },
    disruptor: { behavior: 'disruptor', ...desire([band(2, 1), band(4, 1)]), routeLength: 2, securityPerFlag: 2, soulThreshold: 4, soulHeal: 3, desireFloor: 1 },
  },
}

function geek(layer: number, kind: string, id: string, x: number, y: number, robustness: number): EnemyDefinition {
  return { id, name: geekName(layer, kind), pos: { x, y }, robustness, ...GEEKS[layer][kind] }
}

type StageNumbers = {
  desire: DesireStep[]
  routeLength: number
  securityPerFlag: number
  soulThreshold: number
  soulHeal: number
  desireFloor: number
}

// A boss stage under the names script.json gives that boss's sets.
function stage(layer: number, index: number, numbers: StageNumbers): BossStageDefinition {
  const set = LAYERS[layer]?.boss?.sets[index] ?? { desire: 'DESIRE', security: 'SECURITY', soul: 'SOUL' }
  return {
    stage: index + 1,
    desireName: set.desire, securityName: set.security, soulName: set.soul,
    desire: numbers.desire.map(step => step.amount), desireSteps: numbers.desire,
    desireRange: numbers.desire[0].range, desireShape: numbers.desire[0].shape,
    routeLength: numbers.routeLength, securityPerFlag: numbers.securityPerFlag,
    soulThreshold: numbers.soulThreshold, soulHeal: numbers.soulHeal,
    desireFloor: numbers.desireFloor, curtainLines: 1,
  }
}

type BossBase = Pick<EnemyDefinition, 'id' | 'name' | 'behavior' | 'pos' | 'robustness'>
  & Partial<Pick<EnemyDefinition, 'breakdownAt' | 'hidden' | 'undisclosed' | 'mystery' | 'brood'>>

// A boss starts the battle as its first stage.
function boss(base: BossBase, stages: BossStageDefinition[]): EnemyDefinition {
  const first = stages[0]
  return {
    breakdownAt: 0.5, ...base,
    desireName: first.desireName, desire: [...first.desire], desireSteps: first.desireSteps?.map(step => ({ ...step })),
    desireRange: first.desireRange, desireShape: first.desireShape, routeLength: first.routeLength,
    securityName: first.securityName, securityPerFlag: first.securityPerFlag,
    soulName: first.soulName, soulThreshold: first.soulThreshold, soulHeal: first.soulHeal,
    desireFloor: first.desireFloor,
    bossStages: stages,
  }
}

// What the Dark Young gives birth to: the Grove's small hunter, without a place
// yet. A point slighter than the brood of 1.3: the births are what a player
// who only chases damage is worn down by, on top of the boss's own sure steps.
const AGAIN: BroodDefinition = {
  limit: 3,
  spawn: { name: geekName(1, 'brood'), robustness: 5, ...GEEKS[1].brood },
}

// Flag weights are bash / privilege / core / overload / blank, out of 100.
const weights = (bash: number, privilege: number, core: number, overload: number, blank: number): [FlagKind, number][] =>
  [['bash', bash], ['privilege', privilege], ['core', core], ['overload', overload], ['blank', blank]]

const CAMPAIGN: Encounter[] = [
  // Layer 1, GROVE: abundance. Fewer blanks, more Core and Overload: the
  // board feeds whoever walks it, and the Geeks walk it too. It is the gentle
  // layer: a player who only chases damage still gets through it.
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
    id: '1.3', layer: 1, kind: 'skirmish', name: nodeName('1.3'), god: 'grove', seed: 0x6A0113,
    walls: sigilPart('1.3'), sigil: SIGILS.grove, playerStart: { x: 7, y: 9 },
    enemies: [
      geek(1, 'brood', 'E01', 4, 5, 6), geek(1, 'brood', 'E02', 7, 4, 6), geek(1, 'brood', 'E03', 10, 5, 6),
      geek(1, 'collector', 'E04', 7, 12, 8),
    ],
    flagWeights: weights(24, 8, 16, 10, 42),
    trace: 5,
  },
  {
    id: '1.B', layer: 1, kind: 'boss', name: nodeName('1.B'), god: 'grove', seed: 0x6A011B,
    walls: SIGILS.grove, sigil: SIGILS.grove, playerStart: { x: 7, y: 13 },
    enemies: [
      // It goes for Core first: its Soul is how it multiplies. The Core on
      // this board is what it breeds on and what REPAIR runs on, so denying
      // it and mending are the same walk.
      // What it grazes thickens it too: 3 Security for each Privilege Flag,
      // in both stages.
      boss({ id: 'B01', name: nodeName('1.B'), behavior: 'grazer', pos: { x: 7, y: 5 }, robustness: 44, brood: AGAIN }, [
        stage(1, 0, { desire: [square(2, 4), square(3, 4), square(4, 4)], routeLength: 3, securityPerFlag: 3, soulThreshold: 3, soulHeal: 0, desireFloor: 1 }),
        // Stage II fills its Soul one Core Flag sooner and, like every other
        // boss's second stage, releases two steps a turn whatever it eats.
        // That is what the fight costs a player who denies it everything else.
        stage(1, 1, { desire: [square(3, 5), square(4, 5), square(5, 5)], routeLength: 3, securityPerFlag: 3, soulThreshold: 2, soulHeal: 0, desireFloor: 2 }),
      ]),
      geek(1, 'collector', 'E02', 11, 7, 10),
    ],
    flagWeights: weights(24, 8, 12, 10, 46),
    mechanic: 'brood', trace: 11,
  },

  // Layer 2, COURT: confusion. Core is scarce, so little is mended here, and
  // from here on a Geek strikes once a turn whatever it collects.
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
    id: '2.3', layer: 2, kind: 'skirmish', name: nodeName('2.3'), god: 'court', seed: 0xC0A223,
    walls: sigilPart('2.3'), sigil: SIGILS.court, playerStart: { x: 7, y: 9 },
    enemies: [geek(2, 'hunter', 'E01', 5, 3, 9), geek(2, 'hunter', 'E02', 9, 3, 9), geek(2, 'disruptor', 'E03', 7, 2, 8)],
    flagWeights: weights(26, 9, 5, 6, 54),
    trace: 5,
  },
  {
    id: '2.B', layer: 2, kind: 'boss', name: nodeName('2.B'), god: 'court', seed: 0xC0A22B,
    walls: SIGILS.court, sigil: SIGILS.court, playerStart: { x: 7, y: 11 },
    enemies: [
      // Moderate numbers: the Docket is the difficulty. She walks down the
      // board's axis and holds the waist of the hourglass.
      boss({ id: 'B01', name: nodeName('2.B'), behavior: 'hunter', pos: { x: 7, y: 3 }, robustness: 50 }, [
        stage(2, 0, { desire: [square(4, 5), band(4, 2), square(5, 5)], routeLength: 2, securityPerFlag: 2, soulThreshold: 3, soulHeal: 4, desireFloor: 1 }),
        stage(2, 1, { desire: [band(5, 3), square(5, 6), band(7, 4)], routeLength: 3, securityPerFlag: 3, soulThreshold: 2, soulHeal: 4, desireFloor: 2 }),
      ]),
      // CHANGE PLACES needs someone to change places with.
      geek(2, 'hunter', 'E02', 3, 7, 10),
      geek(2, 'disruptor', 'E03', 11, 7, 8),
    ],
    flagWeights: weights(22, 8, 3, 6, 61),
    mechanic: 'articles', trace: 14,
  },

  // Layer 3, CARCOSA: ignorance. Open ground, thin Flags, long reach: almost
  // no Privilege to block with and almost no Core to mend with.
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
    id: '3.3', layer: 3, kind: 'skirmish', name: nodeName('3.3'), god: 'carcosa', seed: 0xCA5033,
    walls: sigilPart('3.3'), sigil: SIGILS.carcosa, playerStart: { x: 4, y: 10 },
    enemies: [geek(3, 'hunter', 'E01', 7, 5, 11), geek(3, 'hunter', 'E02', 9, 7, 11), geek(3, 'disruptor', 'E03', 5, 3, 10)],
    flagWeights: weights(24, 6, 4, 6, 60),
    trace: 5,
  },
  {
    id: '3.B', layer: 3, kind: 'boss', name: nodeName('3.B'), god: 'carcosa', seed: 0xCA503B,
    walls: SIGILS.carcosa, sigil: SIGILS.carcosa, playerStart: { x: 11, y: 12 },
    enemies: [
      // It stands in the empty centre of the ring and does not rise until
      // Act II. Stage I is mild on purpose: one small step and MYSTERY. Stage
      // II is the hardest thing in the game: two sure steps that reach nearly
      // the whole board, and it walks. On the turn it rises it still stands
      // where Stage I left it (that turn keeps the routes it was forecast
      // with), so the two sure steps carry Act II on their own: 6 and 7.
      boss({ id: 'B01', name: nodeName('3.B'), behavior: 'hunter', pos: { x: 7, y: 5 }, robustness: 60, hidden: true, undisclosed: true, mystery: 3 }, [
        stage(3, 0, { desire: [square(2, 5), band(3, 2), square(4, 5)], routeLength: 0, securityPerFlag: 2, soulThreshold: 3, soulHeal: 3, desireFloor: 1 }),
        stage(3, 1, { desire: [band(6, 5), square(7, 8), band(8, 7)], routeLength: 3, securityPerFlag: 3, soulThreshold: 2, soulHeal: 5, desireFloor: 2 }),
      ]),
      geek(3, 'disruptor', 'E02', 1, 5, 10),
      geek(3, 'hunter', 'E03', 13, 5, 10),
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
