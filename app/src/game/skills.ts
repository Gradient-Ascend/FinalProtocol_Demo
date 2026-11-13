import type { AttackPreset, AttackShape, AttackStep } from './battle-types'

// A skill is one rule with four strengths, one per slot I–IV. Later slots fire
// less often (slot N needs N Bash Flags and N unused action points), so every
// skill is at least as strong the later it sits.
export type SkillId =
  | 'base' | 'on' | 'spike' | 'manhattan' | 'off'
  | 'array' | 'high' | 'flood' | 'zero' | 'ultra' | 'probe'

export type Skill = {
  id: SkillId
  name: string
  area: 'nearest' | 'all'
  mode?: 'manhattan' | 'random'
  // fixed: damage. manhattan: bonus added to the distance. random: highest roll.
  amounts: [number, number, number, number]
  pierce?: [number, number, number, number]
  // Which attack animation the renderer plays.
  fx: string
}

export type FrameId = 'vector' | 'cot'
export type Frame = { id: FrameId; name: string; shape: AttackShape; range: number; description: string }
export type Deck = { frame: FrameId; skills: [SkillId, SkillId, SkillId, SkillId] }
export type Loadout = [Deck, Deck]

export const IGNORES_SECURITY = 99

export const SKILLS: Skill[] = [
  { id: 'base', name: 'BASE', area: 'nearest', amounts: [1, 2, 3, 4], fx: 'base' },
  { id: 'on', name: 'ON', area: 'nearest', amounts: [2, 2, 3, 3], fx: 'on' },
  { id: 'spike', name: 'SPIKE', area: 'nearest', amounts: [0, 1, 3, 6], fx: 'spike' },
  { id: 'manhattan', name: 'MANHATTAN', area: 'nearest', mode: 'manhattan', amounts: [-1, 0, 1, 2], fx: 'manhattan' },
  { id: 'off', name: 'OFF', area: 'nearest', mode: 'random', amounts: [3, 4, 5, 6], fx: 'off' },
  { id: 'array', name: 'ARRAY', area: 'all', amounts: [1, 2, 2, 3], fx: 'array' },
  { id: 'high', name: 'HIGH', area: 'all', amounts: [0, 1, 3, 5], fx: 'high' },
  { id: 'flood', name: 'FLOOD', area: 'all', amounts: [1, 1, 1, 2], pierce: [1, 1, 2, 2], fx: 'flood' },
  { id: 'zero', name: 'ZERO', area: 'nearest', amounts: [1, 2, 3, 4], pierce: [2, 2, 2, 2], fx: 'zero' },
  { id: 'ultra', name: 'ULTRA', area: 'nearest', amounts: [1, 1, 3, 5], pierce: [0, 0, 1, 3], fx: 'ultra' },
  { id: 'probe', name: 'PROBE', area: 'nearest', amounts: [1, 1, 2, 2], pierce: [IGNORES_SECURITY, IGNORES_SECURITY, IGNORES_SECURITY, IGNORES_SECURITY], fx: 'probe' },
]

export const FRAMES: Frame[] = [
  { id: 'vector', name: 'VECTOR', shape: 'square', range: 2, description: '5×5 square · center excluded' },
  { id: 'cot', name: 'CoT', shape: 'cross', range: 5, description: 'Cross · arm length 5 · center excluded' },
]

export const DEFAULT_LOADOUT: Loadout = [
  { frame: 'vector', skills: ['base', 'manhattan', 'array', 'zero'] },
  { frame: 'cot', skills: ['off', 'on', 'high', 'ultra'] },
]

export function skillById(id: SkillId): Skill {
  return SKILLS.find(skill => skill.id === id) ?? SKILLS[0]
}

export function frameById(id: FrameId): Frame {
  return FRAMES.find(frame => frame.id === id) ?? FRAMES[0]
}

export function skillStep(skill: Skill, slot: number, frame: Frame): AttackStep {
  return {
    name: skill.name,
    amount: skill.amounts[slot],
    range: frame.range,
    area: skill.area,
    shape: frame.shape,
    mode: skill.mode ?? 'fixed',
    pierce: skill.pierce?.[slot] || undefined,
    fx: skill.fx,
  }
}

// Short strength label for one slot, e.g. "3", "ALL 2", "4 P2", "D+1", "0–5".
export function slotLabel(skill: Skill, slot: number): string {
  const amount = skill.amounts[slot]
  const value = skill.mode === 'manhattan'
    ? `D${amount > 0 ? `+${amount}` : amount < 0 ? `−${-amount}` : ''}`
    : skill.mode === 'random' ? `0–${amount}` : `${amount}`
  const pierce = skill.pierce?.[slot]
  return `${skill.area === 'all' ? 'ALL ' : ''}${value}${pierce ? ` P${pierce >= IGNORES_SECURITY ? '∞' : pierce}` : ''}`
}

export function buildPresets(loadout: Loadout): AttackPreset[] {
  const sameFrame = loadout[0].frame === loadout[1].frame
  return loadout.map((deck, index) => {
    const frame = frameById(deck.frame)
    return {
      id: `deck-${index}`,
      name: sameFrame ? `${frame.name}·${'AB'[index]}` : frame.name,
      description: frame.description,
      steps: deck.skills.map((id, slot) => skillStep(skillById(id), slot, frame)),
    }
  })
}

// Stored loadouts come from localStorage, so anything malformed, unknown or
// using a skill twice falls back to the default.
export function sanitizeLoadout(raw: unknown): Loadout {
  if (!Array.isArray(raw) || raw.length !== 2) return cloneLoadout(DEFAULT_LOADOUT)
  const seen = new Set<string>()
  const decks: Deck[] = []
  for (const deck of raw as Partial<Deck>[]) {
    if (!deck || !FRAMES.some(frame => frame.id === deck.frame)) return cloneLoadout(DEFAULT_LOADOUT)
    if (!Array.isArray(deck.skills) || deck.skills.length !== 4) return cloneLoadout(DEFAULT_LOADOUT)
    for (const id of deck.skills) {
      if (!SKILLS.some(skill => skill.id === id) || seen.has(id)) return cloneLoadout(DEFAULT_LOADOUT)
      seen.add(id)
    }
    decks.push({ frame: deck.frame as FrameId, skills: [...deck.skills] as Deck['skills'] })
  }
  return decks as Loadout
}

export function cloneLoadout(loadout: Loadout): Loadout {
  return loadout.map(deck => ({ frame: deck.frame, skills: [...deck.skills] })) as Loadout
}

// Put a skill into a slot. A skill can sit in only one slot across both decks,
// so if it is already placed, the two slots trade.
export function assignSkill(loadout: Loadout, deckIndex: number, slot: number, id: SkillId): Loadout {
  const next = cloneLoadout(loadout)
  const displaced = next[deckIndex].skills[slot]
  for (const deck of next) {
    const at = deck.skills.indexOf(id)
    if (at >= 0) deck.skills[at] = displaced
  }
  next[deckIndex].skills[slot] = id
  return next
}
