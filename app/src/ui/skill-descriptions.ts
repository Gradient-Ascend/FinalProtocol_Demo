import type { CoreBuff } from '@/game/battle-types'
import { IGNORES_SECURITY } from '@/game/skills'
import type { Frame, Skill, SkillId } from '@/game/skills'
import type { Tuning } from '@/game/tuning'

export type CardTokenKind = 'text' | 'dmg' | 'pierce' | 'priv' | 'heal' | 'overload' | 'kw'

export type CardToken = {
  kind: CardTokenKind
  text: string
}

export type CardGlossaryItem = {
  term: string
  summary: string
}

export type RoleBadge = {
  label: string
  tone: 'write' | 'read' | 'auto' | 'counter'
}

export type SkillCardCopy = {
  id: string
  name: string
  category: string
  timingNote: string
  roleBadges: RoleBadge[]
  lines: CardToken[][]
  glossary: CardGlossaryItem[]
}

const ROMAN = ['I', 'II', 'III', 'IV']

const GLOSSARY: Record<string, string> = {
  PUSH: 'Moves target 1 cell away along the longer axis, carrying its planned route.',
  PULL: 'Moves target 1 cell closer along the longer axis, carrying its planned route.',
  BUMP: 'Triggered if PUSH/PULL hits a wall, edge, Curtain, or Geek: deals 1 damage to it (and any Geek hit) and grants +1 Overload.',
  PINNED: 'Target has a wall, board edge, another Geek, or sealed Curtain directly behind it.',
  LIVE: 'Status tag readable by the next Bash release or Overload. Scrubbed if the Geek collects Privilege.',
  BREACH: 'Triggered when Security drops to 0. Later hits this turn deal +1 damage and grant +1 Overload.',
  DROP: 'Removes 1 Desire step from the target’s upcoming release this turn.',
  SPREAD: 'Scales damage upward when multiple hostiles sit inside the attack footprint.',
  FILL: 'Overwrites the next non-blank Flag on each target’s route with Blank.',
  PIERCE: 'Bypasses up to P points of Security before raw damage hits Robustness.',
  SHELL: 'Automatic settlement at the end of Player movement; absorbs incoming Desire during the enemy phase, then resets.',
  COUNTER: 'Every Core Flag stepped on advances all 3 Core counters simultaneously during movement.',
}

const t = (text: string): CardToken => ({ kind: 'text', text })
const dmg = (text: string): CardToken => ({ kind: 'dmg', text })
const pierce = (text: string): CardToken => ({ kind: 'pierce', text })
const priv = (text: string): CardToken => ({ kind: 'priv', text })
const heal = (text: string): CardToken => ({ kind: 'heal', text })
const ovl = (text: string): CardToken => ({ kind: 'overload', text })
const kw = (text: string): CardToken => ({ kind: 'kw', text })

function pickGlossary(terms: string[]): CardGlossaryItem[] {
  return terms
    .filter(term => Object.hasOwn(GLOSSARY, term))
    .map(term => ({ term, summary: GLOSSARY[term] }))
}

function skillRoleBadges(skill: Skill): RoleBadge[] {
  const badges: RoleBadge[] = []
  if (skill.writes) badges.push({ label: `WRITES ${skill.writes}`, tone: 'write' })
  if (skill.reads) badges.push({ label: `READS ${skill.reads}`, tone: 'read' })
  return badges
}

function manhattanExpr(bonus: number): string {
  if (bonus > 0) return `D+${bonus}`
  if (bonus < 0) return `D−${-bonus}`
  return 'D'
}

/** Builds structured card-game copy for one Attack skill at a selected slot level (0–3). */
export function attackSkillCard(skill: Skill, slotIndex: number, frame: Frame): SkillCardCopy {
  const lvl = Math.max(0, Math.min(3, slotIndex))
  const amt = skill.amounts[lvl]
  const p = skill.pierce?.[lvl] ?? 0
  const targetToken = skill.area === 'all' ? kw('ALL') : kw('NEAREST')
  const pierceToken = p >= IGNORES_SECURITY ? pierce('PIERCE ∞') : p > 0 ? pierce(`PIERCE ${p}`) : null

  let line1: CardToken[]
  if (skill.mode === 'manhattan') {
    line1 = [t('Deal '), dmg(manhattanExpr(amt)), t(' damage to '), targetToken, t(' hostile in '), kw(frame.name), t(' range.')]
  } else if (skill.mode === 'random') {
    line1 = [t('Roll '), dmg(`0–${amt}`), t(' damage to '), targetToken, t(' hostile in '), kw(frame.name), t(' range.')]
  } else if (pierceToken) {
    line1 = [t('Deal '), dmg(`${amt}`), t(' damage ('), pierceToken, t(') to '), targetToken, t(' hostile in '), kw(frame.name), t('.')]
  } else {
    line1 = [t('Deal '), dmg(`${amt}`), t(' damage to '), targetToken, t(' hostile in '), kw(frame.name), t(' range.')]
  }

  let line2: CardToken[]
  let glossaryTerms: string[]

  const byId: Record<SkillId, () => { line2: CardToken[]; terms: string[] }> = {
    base: () => ({
      line2: [kw('PUSH'), t(' target 1 cell away. Blocked = '), kw('BUMP'), t(': '), dmg('1'), t(' to both & '), ovl('+1 OVERLOAD'), t('.')],
      terms: ['PUSH', 'BUMP'],
    }),
    on: () => ({
      line2: [t('If damage bypasses '), priv('SECURITY'), t(', tag '), kw('LIVE'), t(' for the next release or Overload.')],
      terms: ['LIVE'],
    }),
    spike: () => ({
      line2: [dmg('+2'), t(' bonus damage vs a '), kw('PINNED'), t(' target (wall, edge, Geek, or Curtain behind it).')],
      terms: ['PINNED'],
    }),
    manhattan: () => ({
      line2: [t('Distance '), dmg('D'), t(' is measured after earlier '), kw('PUSH'), t(' / '), kw('PULL'), t(' in the same release.')],
      terms: ['PUSH', 'PULL'],
    }),
    off: () => ({
      line2: [t('Against '), kw('LIVE'), t(': rolls max '), dmg(String(amt)), t(', target '), kw('DROP'), t('s 1 Desire step, '), ovl('+1 OVERLOAD'), t('.')],
      terms: ['LIVE', 'DROP'],
    }),
    array: () => ({
      line2: [kw('PULL'), t(' every Geek hit 1 cell closer. Blocked = '), kw('BUMP'), t(' ('), dmg('1'), t(' & '), ovl('+1 OVERLOAD'), t(').')],
      terms: ['PULL', 'BUMP'],
    }),
    high: () => ({
      line2: [kw('SPREAD'), t(': gain '), dmg('+1'), t(' damage for every hostile hit beyond the first.')],
      terms: ['SPREAD'],
    }),
    flood: () => ({
      line2: [kw('FILL'), t(': blanks the next non-blank Flag on each hit Geek’s planned route.')],
      terms: ['PIERCE', 'FILL'],
    }),
    manifold: () => ({
      line2: [t('First hit on shielded target strips '), priv('2 SECURITY'), t(' instead of piercing; 0 triggers '), kw('BREACH'), t('.')],
      terms: ['BREACH', 'PIERCE'],
    }),
    ultra: () => ({
      line2: [dmg('+1'), t(' damage for each active tag on target: '), kw('LIVE'), t(', '), kw('BREACH'), t(', '), kw('SHIFT'), t('.')],
      terms: p > 0 ? ['LIVE', 'BREACH', 'PIERCE'] : ['LIVE', 'BREACH'],
    }),
    probe: () => ({
      line2: [t('Ignores all Security and tags target '), kw('LIVE'), t(' for the next release or Overload.')],
      terms: ['PIERCE', 'LIVE'],
    }),
  }

  const extra = byId[skill.id]()
  line2 = extra.line2
  glossaryTerms = extra.terms

  return {
    id: skill.id,
    name: skill.name,
    category: `BASH · ${frame.name} (${frame.description})`,
    timingNote: `SLOT ${ROMAN[lvl]} — Fires when ≥ ${lvl + 1} Bash Flag(s) & ${lvl + 1} AP remain (or on Overload).`,
    roleBadges: skillRoleBadges(skill),
    lines: [line1, line2],
    glossary: pickGlossary(glossaryTerms),
  }
}

/** Builds structured card-game copy for the fixed SHELL Privilege deck. */
export function privilegeSkillCard(privilegePerFlag: number): SkillCardCopy {
  return {
    id: 'shell',
    name: 'SHELL',
    category: 'PRIVILEGE DECK · AUTOMATIC DEFENSE',
    timingNote: 'Settles immediately once Player movement finishes, before Bash & enemy releases.',
    roleBadges: [{ label: 'AUTOMATIC', tone: 'auto' }, { label: 'SETTLEMENT', tone: 'write' }],
    lines: [
      [t('Gain '), priv(`+${privilegePerFlag} PRIVILEGE`), t(' for each Privilege Flag collected along your route.')],
      [priv('PRIVILEGE'), t(' absorbs incoming Desire damage in the enemy phase; a fully blocked hit tags the attacker '), kw('LIVE'), t('.')],
    ],
    glossary: pickGlossary(['SHELL', 'LIVE']),
  }
}

/** Builds structured card-game copy for one Core counter block (REPAIR / FOCUS / FIREWALL). */
export function coreSkillCard(buff: CoreBuff, tuning: Tuning): SkillCardCopy {
  let line2: CardToken[]
  let timingNote: string
  let terms = ['COUNTER']

  if (buff.id === 'repair') {
    line2 = [t('At '), kw(`EVERY ${buff.threshold}`), t(' Core Flags: queues '), heal(`+${tuning.repairHeal} SANITY`), t(' restored at turn end.')]
    timingNote = 'Triggers during Player movement on the step the counter fills; Sanity heals after enemies act.'
  } else if (buff.id === 'focus') {
    line2 = [t('At '), kw(`EVERY ${buff.threshold}`), t(' Core Flags: arms '), dmg('FOCUS'), t(' so your next Bash hit tags its target '), kw('LIVE'), t('.')]
    timingNote = 'Arms immediately during movement and applies to your upcoming Bash release.'
    terms = ['COUNTER', 'LIVE']
  } else {
    line2 = [t('At '), kw(`EVERY ${buff.threshold}`), t(' Core Flags: immediately grants '), priv(`+${tuning.firewallPrivilege} PRIVILEGE`), t(' shield.')]
    timingNote = 'Triggers mid-route as soon as the counter completes; stacks with SHELL.'
    terms = ['COUNTER', 'SHELL']
  }

  return {
    id: buff.id,
    name: buff.name,
    category: `CORE DECK · COUNTER (${buff.threshold} FLAGS)`,
    timingNote,
    roleBadges: [{ label: `EVERY ${buff.threshold}`, tone: 'counter' }, { label: 'IN MOTION', tone: 'auto' }],
    lines: [
      [t('Every Core Flag stepped on advances all 3 Core counters simultaneously by '), kw('+1'), t('.')],
      line2,
    ],
    glossary: pickGlossary(terms),
  }
}
