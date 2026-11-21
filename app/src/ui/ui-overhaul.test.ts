import { afterEach, describe, expect, it, vi } from 'vitest'
import { AttackFx, amberMemory } from '@/game/attack-fx'
import { BattleStore } from '@/game/battle-store'
import type { ResourcePopEffect } from '@/game/battle-types'
import { ENCOUNTERS } from '@/game/encounters'
import { FRAMES, SKILLS } from '@/game/skills'
import { DEFAULT_TUNING } from '@/game/tuning'
import { attackSkillCard, coreSkillCard, privilegeSkillCard } from './skill-descriptions'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('card-game skill descriptions', () => {
  it('builds complete semantic copy and contextual glossary for all 11 attack skills across all 4 levels', () => {
    for (const frame of FRAMES) {
      for (const skill of SKILLS) {
        for (let level = 0; level < 4; level++) {
          const copy = attackSkillCard(skill, level, frame)
          expect(copy.name).toBe(skill.name)
          expect(copy.lines).toHaveLength(2)
          expect(copy.lines[0].length).toBeGreaterThan(2)
          expect(copy.lines[1].length).toBeGreaterThan(1)
          expect(copy.timingNote).toContain(`SLOT ${['I', 'II', 'III', 'IV'][level]}`)
          expect(copy.roleBadges.length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('builds privilege and core descriptions reflecting live tuning numbers', () => {
    const tuned = { ...DEFAULT_TUNING, privilegePerFlag: 4, repairHeal: 5, firewallPrivilege: 6, repairThreshold: 2 }
    const priv = privilegeSkillCard(tuned.privilegePerFlag)
    expect(priv.name).toBe('SHELL')
    expect(priv.lines.flat().map(tok => tok.text).join('')).toContain('+4 PRIVILEGE')

    const state = new BattleStore().getSnapshot()
    const repair = coreSkillCard({ ...state.player.buffs[0], threshold: 2 }, tuned)
    expect(repair.lines.flat().map(tok => tok.text).join('')).toContain('+5 SANITY')
    const focus = coreSkillCard(state.player.buffs[1], tuned)
    expect(focus.lines.flat().map(tok => tok.text).join('')).toContain('LIVE')
    const firewall = coreSkillCard(state.player.buffs[2], tuned)
    expect(firewall.lines.flat().map(tok => tok.text).join('')).toContain('+6 PRIVILEGE')
  })
})

describe('real-battle Privilege and Core popups', () => {
  it('emits Core pop during player movement and Privilege pop at settlement without changing logs or state', async () => {
    const bus = new EventTarget()
    const pops: ResourcePopEffect[] = []
    bus.addEventListener('battle-resource-pop', event => {
      pops.push((event as CustomEvent<ResourcePopEffect>).detail)
    })
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => bus.dispatchEvent(event),
      addEventListener: bus.addEventListener.bind(bus),
      removeEventListener: bus.removeEventListener.bind(bus),
    })

    const store = new BattleStore()
    store.load(ENCOUNTERS['1.1'])
    store.getSnapshot().reducedMotion = true
    store.start()

    const state = store.getSnapshot()
    for (const enemy of state.enemies.slice(1)) enemy.robustness = 0
    state.enemies[0].pos = { x: 0, y: 0 }
    state.enemies[0].route = []

    const { x, y } = state.player.pos
    state.walls[y - 1][x] = false
    state.walls[y - 2][x] = false
    state.flags[y - 1][x] = 'core'
    state.flags[y - 2][x] = 'privilege'

    // Set REPAIR and FOCUS one Core Flag short so both pop simultaneously on step 1.
    state.player.buffs.find(b => b.id === 'repair')!.counter = state.tuning.repairThreshold - 1
    state.player.buffs.find(b => b.id === 'focus')!.counter = state.tuning.focusThreshold - 1

    store.addStep(0, -1)
    store.addStep(0, -1)
    await store.executeTurn()

    const corePops = pops.filter(p => p.kind === 'repair' || p.kind === 'focus')
    expect(corePops).toHaveLength(2)
    expect(corePops[0].pos).toEqual({ x, y: y - 1 })
    expect(corePops[1].pos).toEqual({ x, y: y - 1 })
    expect(corePops.map(p => p.slotOffset)).toEqual([0, 1])

    const privPops = pops.filter(p => p.kind === 'privilege')
    expect(privPops).toHaveLength(1)
    expect(privPops[0]).toMatchObject({
      kind: 'privilege',
      pos: { x, y: y - 2 },
      text: `+${state.tuning.privilegePerFlag} PRIV`,
      subtext: 'SHELL',
    })
  })

  it('keeps AttackFx preview instances out of amberMemory when recordMemory is false', () => {
    const before = amberMemory().length
    const fx = new AttackFx({ recordMemory: false })
    fx.play({
      source: 'player',
      presetId: 'deck-0',
      origin: { x: 7, y: 7 },
      target: { x: 8, y: 7 },
      stepIndex: 0,
      shape: 'square',
      range: 2,
      fx: 'base',
      amount: 3,
      dealt: 3,
    }, true)
    fx.playResourcePop({
      kind: 'privilege',
      pos: { x: 7, y: 7 },
      text: '+2 PRIV',
      subtext: 'SHELL',
      color: '#79bfff',
    }, true)
    fx.step(100)
    expect(amberMemory().length).toBe(before)
    fx.dispose()
  })
})
