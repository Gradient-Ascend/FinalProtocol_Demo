import { describe, expect, it } from 'vitest'
import { ENCOUNTERS } from './encounters'
import { coreRuleText, privilegeRuleText, validateEnemy } from './enemy-kits'

describe('enemy-kits invariants', () => {
  it('validates every enemy across all encounters against tier rules', () => {
    for (const encounter of Object.values(ENCOUNTERS)) {
      for (const enemy of encounter.enemies) {
        expect(validateEnemy(enemy, encounter.layer), `${encounter.id} ${enemy.id}`).toEqual([])
      }
      if (encounter.kind === 'boss' || encounter.kind === 'prologue') {
        const boss = encounter.enemies.find(e => e.tier === 'boss')
        expect(boss, encounter.id).toBeDefined()
        expect(boss!.countdowns?.length, encounter.id).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('places elites exclusively on x.3 nodes alongside two mobs', () => {
    for (const encounter of Object.values(ENCOUNTERS)) {
      const elites = encounter.enemies.filter(e => e.tier === 'elite')
      if (encounter.id.endsWith('.3')) {
        expect(encounter.elite, encounter.id).toBe(true)
        expect(elites, encounter.id).toHaveLength(1)
        expect(encounter.enemies.filter(e => e.tier === 'mob'), encounter.id).toHaveLength(2)
      } else {
        expect(encounter.elite, encounter.id).toBeUndefined()
        expect(elites, encounter.id).toHaveLength(0)
      }
    }
  })

  it('formats privilege and core rule summaries cleanly', () => {
    expect(privilegeRuleText({ kind: 'ward', name: 'CLOSE', perFlag: 2 })).toBe('+2 / PRIV')
    expect(privilegeRuleText({ kind: 'entitle', name: 'CONTEMPT', bonusPerFlag: 1 })).toBe('+1 DMG / PRIV')
    expect(privilegeRuleText({ kind: 'mystery', name: 'MYSTERY', perFlag: 2, floor: 3 })).toBe('+2 / PRIV · MIN 3')
    expect(coreRuleText(undefined)).toBe('NO CORE SKILL')
    expect(coreRuleText({ kind: 'mend', name: 'SAP', threshold: 3, heal: 4 })).toBe('ON FULL: +4 HP')
    expect(coreRuleText({ kind: 'mend', name: 'ABSOLUTION', threshold: 3, heal: 3 }, false, '?')).toBe('ON FULL: +? HP')
    expect(coreRuleText({ kind: 'brood', name: 'LITTER', threshold: 3 })).toBe('ON FULL: BROOD')
    expect(coreRuleText({ kind: 'surge', name: 'RECESS', threshold: 2 })).toBe('ON FULL: +1 SURE')
  })
})
