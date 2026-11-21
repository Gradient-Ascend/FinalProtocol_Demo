import type { AttackShape, BossStageDefinition, DesireStep, EnemyDefinition, EnemyState } from './battle-types'

export type EnemyTier = 'mob' | 'elite' | 'boss'

export type AttackSkill = {
  name: string
  shape: AttackShape
  range: number
  width?: number
  forms: [number] | [number, number]
}

export type PrivilegeSkill =
  | { kind: 'ward'; name: string; perFlag: number }
  | { kind: 'entitle'; name: string; bonusPerFlag: number }
  | { kind: 'mystery'; name: string; perFlag: number; floor: number }

export type CoreSkill =
  | { kind: 'mend'; name: string; threshold: number; heal: number }
  | { kind: 'brood'; name: string; threshold: number }
  | { kind: 'surge'; name: string; threshold: number }

export type CountdownDef =
  | { kind: 'curtain'; name: string }
  | { kind: 'gestation'; name: string; every: number }
  | { kind: 'docket'; name: string }
  | { kind: 'advent'; name: string; turn: number }

export type StageKit = {
  attack: AttackSkill
  privilege: PrivilegeSkill
  core?: CoreSkill
  sure: number
  routeLength: number
}

export type CompiledStage = {
  desireName: string
  desire: number[]
  desireSteps: DesireStep[]
  desireRange: number
  desireShape: AttackShape
  desireFloor: number
  routeLength: number
  securityName: string
  securityPerFlag: number
  privilegeSkill: PrivilegeSkill
  soulName?: string
  soulThreshold: number
  soulHeal: number
  coreSkill?: CoreSkill
}

/** Compiles a stage kit into both structured skill definitions and flat combat fields. */
export function compileStage(kit: StageKit): CompiledStage {
  const { attack, privilege, core, sure, routeLength } = kit
  const steps: DesireStep[] = attack.forms.map(amount => ({
    amount,
    range: attack.range,
    shape: attack.shape,
    ...(attack.width !== undefined ? { width: attack.width } : {}),
  }))
  return {
    desireName: attack.name,
    desire: [...attack.forms],
    desireSteps: steps,
    desireRange: attack.range,
    desireShape: attack.shape,
    desireFloor: sure,
    routeLength,
    securityName: privilege.name,
    securityPerFlag: privilege.kind === 'entitle' ? 0 : privilege.perFlag,
    privilegeSkill: { ...privilege },
    ...(core ? { soulName: core.name } : {}),
    soulThreshold: core?.threshold ?? 0,
    soulHeal: core?.kind === 'mend' ? core.heal : 0,
    ...(core ? { coreSkill: { ...core } } : {}),
  }
}

/** Copies a boss stage definition onto a live enemy without leaving stale stage fields behind. */
export function applyStage(enemy: EnemyState, next: BossStageDefinition): void {
  enemy.stage = next.stage
  enemy.desireName = next.desireName
  enemy.desire = [...next.desire]
  enemy.desireSteps = next.desireSteps?.map(step => ({ ...step }))
  enemy.desireRange = next.desireRange
  enemy.desireShape = next.desireShape
  enemy.routeLength = next.routeLength
  enemy.securityName = next.securityName
  enemy.securityPerFlag = next.securityPerFlag
  enemy.privilegeSkill = { ...next.privilegeSkill }
  enemy.soulName = next.soulName
  enemy.soulThreshold = next.soulThreshold
  enemy.soulHeal = next.soulHeal
  enemy.coreSkill = next.coreSkill ? { ...next.coreSkill } : undefined
  enemy.desireFloor = next.desireFloor
  enemy.block = 0
  enemy.soulCounter = 0
}

export function privilegeRuleText(skill: PrivilegeSkill): string {
  if (skill.kind === 'ward') return `+${skill.perFlag} / PRIV`
  if (skill.kind === 'entitle') return `+${skill.bonusPerFlag} DMG / PRIV`
  return `+${skill.perFlag} / PRIV · MIN ${skill.floor}`
}

export function coreRuleText(skill: CoreSkill | undefined, open = true, withheld = '?'): string {
  if (!skill) return 'NO CORE SKILL'
  if (skill.kind === 'brood') return 'ON FULL: BROOD'
  if (skill.kind === 'surge') return 'ON FULL: +1 SURE'
  return `ON FULL: +${open ? skill.heal : withheld} HP`
}

function stepsOf(source: Pick<EnemyDefinition, 'desire' | 'desireSteps' | 'desireRange' | 'desireShape'>): DesireStep[] {
  return source.desireSteps ?? source.desire.map(amount => ({
    amount,
    range: source.desireRange,
    shape: source.desireShape,
  }))
}

/** Enforces tier invariants for mobs, elites, and bosses. */
export function validateEnemy(def: EnemyDefinition, layer?: number): string[] {
  const problems: string[] = []
  const prefix = def.id || def.name
  const fail = (msg: string) => { problems.push(`${prefix}: ${msg}`) }

  if (def.robustness <= 0) fail('robustness must be positive')

  const checkForms = (
    steps: DesireStep[],
    desire: number[],
    expectedCount: number,
    label: string,
  ) => {
    if (desire.length !== expectedCount || steps.length !== expectedCount) {
      fail(`${label}: expected ${expectedCount} attack form(s), got ${desire.length}/${steps.length}`)
      return
    }
    if (expectedCount === 2) {
      const [first, second] = steps
      if (
        first.shape !== second.shape
        || first.range !== second.range
        || (first.width ?? 1) !== (second.width ?? 1)
      ) {
        fail(`${label}: forms I and II must share shape, range, and width`)
      }
      if (second.amount <= first.amount) {
        fail(`${label}: form II amount (${second.amount}) must exceed form I (${first.amount})`)
      }
    }
  }

  const checkPrivilege = (
    skill: PrivilegeSkill | undefined,
    securityName: string | undefined,
    securityPerFlag: number,
    label: string,
  ) => {
    if (!skill) {
      fail(`${label}: missing privilegeSkill`)
      return
    }
    if (securityName !== skill.name) fail(`${label}: securityName "${securityName}" !== privilegeSkill.name "${skill.name}"`)
    const expectedSec = skill.kind === 'entitle' ? 0 : skill.perFlag
    if (securityPerFlag !== expectedSec) fail(`${label}: securityPerFlag ${securityPerFlag} !== ${expectedSec}`)
    if (skill.kind === 'ward' && skill.perFlag < 0) fail(`${label}: ward perFlag must be >= 0`)
    if (skill.kind === 'entitle' && skill.bonusPerFlag <= 0) fail(`${label}: entitle bonusPerFlag must be > 0`)
    if (skill.kind === 'mystery' && (skill.perFlag < 0 || skill.floor <= 0)) fail(`${label}: mystery requires perFlag >= 0 and floor > 0`)
  }

  const checkCore = (
    skill: CoreSkill | undefined,
    soulName: string | undefined,
    soulThreshold: number,
    soulHeal: number,
    label: string,
  ) => {
    if (!skill) {
      fail(`${label}: missing coreSkill`)
      return
    }
    if (soulName !== skill.name) fail(`${label}: soulName "${soulName}" !== coreSkill.name "${skill.name}"`)
    if (skill.threshold <= 0 || soulThreshold !== skill.threshold) fail(`${label}: invalid soulThreshold`)
    if (skill.kind === 'mend') {
      if (skill.heal <= 0 || soulHeal !== skill.heal) fail(`${label}: mend requires positive heal matching soulHeal`)
    } else if (soulHeal !== 0) {
      fail(`${label}: non-mend coreSkill must have soulHeal 0`)
    }
    if (skill.kind === 'brood' && !def.brood) fail(`${label}: brood coreSkill requires brood definition`)
  }

  checkPrivilege(def.privilegeSkill, def.securityName, def.securityPerFlag, 'base')

  if (def.tier === 'mob') {
    checkForms(stepsOf(def), def.desire, 1, 'mob')
    if (def.coreSkill !== undefined) fail('mob must not have coreSkill')
    if (def.soulThreshold !== 0 || def.soulHeal !== 0) fail('mob must have soulThreshold 0 and soulHeal 0')
    if (def.bossStages?.length) fail('mob must not have bossStages')
    if (def.countdowns?.length) fail('mob must not have countdowns')
  } else if (def.tier === 'elite') {
    checkForms(stepsOf(def), def.desire, 2, 'elite')
    checkCore(def.coreSkill, def.soulName, def.soulThreshold, def.soulHeal, 'elite')
    if (def.bossStages?.length) fail('elite must not have bossStages')
    if (def.countdowns?.length) fail('elite must not have countdowns')
  } else if (def.tier === 'boss') {
    checkForms(stepsOf(def), def.desire, 2, 'boss base')
    checkCore(def.coreSkill, def.soulName, def.soulThreshold, def.soulHeal, 'boss base')
    if (!def.countdowns?.length) fail('boss must have at least one countdown')
    if (!def.bossStages || def.bossStages.length !== 2) {
      fail('boss must have exactly 2 bossStages')
    } else {
      const [s1, s2] = def.bossStages
      for (const [index, stage] of def.bossStages.entries()) {
        const label = `stage ${stage.stage}`
        checkForms(stepsOf(stage), stage.desire, 2, label)
        checkPrivilege(stage.privilegeSkill, stage.securityName, stage.securityPerFlag, label)
        checkCore(stage.coreSkill, stage.soulName, stage.soulThreshold, stage.soulHeal, label)
        const expectedSure = index === 0 ? 1 : 2
        if (stage.desireFloor !== expectedSure) fail(`${label}: expected desireFloor ${expectedSure}, got ${stage.desireFloor}`)
      }
      if (s1.desireName === s2.desireName) fail('boss stage II attack skill must differ from stage I')
      if (s1.privilegeSkill.kind === s2.privilegeSkill.kind && s1.privilegeSkill.name === s2.privilegeSkill.name) {
        fail('boss stage II privilege skill must differ from stage I')
      }
      if (s1.coreSkill && s2.coreSkill && s1.coreSkill.kind === s2.coreSkill.kind && s1.coreSkill.name === s2.coreSkill.name) {
        fail('boss stage II core skill must differ from stage I')
      }
    }
  } else {
    fail(`unknown tier "${String(def.tier)}"`)
  }

  if (layer !== undefined && def.tier !== 'boss') {
    const expectedSure = layer <= 1 ? 0 : 1
    if ((def.desireFloor ?? 0) !== expectedSure) {
      fail(`layer ${layer} ${def.tier}: expected desireFloor ${expectedSure}, got ${def.desireFloor ?? 0}`)
    }
  }

  return problems
}
