import { describe, expect, it } from 'vitest'
import raw from './script.json'
import {
  CRITERIA_KEYS, allLines, articleById, defeatSelf, enemyName, fillText, interlude, layerAt, layerOfNode,
  lineById, nodeById, placeholdersIn, quoteById, script, validateScript, weightById,
} from './script'

type Loose = Record<string, any>

// A copy of the authored file with one thing changed.
function broken(change: (copy: Loose) => void): string[] {
  const copy = structuredClone(raw) as Loose
  change(copy)
  return validateScript(copy)
}

describe('script.json shape', () => {
  it('is valid as authored', () => {
    expect(validateScript()).toEqual([])
  })

  it('fails loudly on a misspelt scope, tier, voice or event', () => {
    expect(broken(copy => { copy.lines[0].once = 'runn' })).toEqual(['lines[0] (g.block).once: expected one of battle, run, ever'])
    expect(broken(copy => { copy.lines[0].tier = 4 })).toEqual(['lines[0] (g.block).tier: expected 0, 1, 2 or 3'])
    expect(broken(copy => { copy.lines[0].voice = 'SELFF' })).toEqual(['lines[0] (g.block).voice: expected one of SYS, SELF, GOD, BOSS, STAGE'])
    expect(broken(copy => { copy.lines[0].event = 'fullblock' })).toEqual(['lines[0] (g.block).event: unknown event "fullblock"'])
  })

  it('fails on a misspelt key, criterion or placeholder', () => {
    expect(broken(copy => { copy.lines[1].onec = 'run' })).toEqual(['lines[1] (g.overload).onec: unknown key'])
    expect(broken(copy => { copy.lines[3].when = { attempts_gte: 3 } })).toEqual(['lines[3] (g.low3).when.attempts_gte: unknown criterion'])
    expect(broken(copy => { copy.lines[3].when = { attempt_gte: '3' } })).toEqual(['lines[3] (g.low3).when.attempt_gte: expected a whole number'])
    expect(broken(copy => { copy.lines[0].text = 'Attempt {attemp}.' })).toEqual(['lines[0] (g.block).text: unknown placeholder {attemp}'])
  })

  it('fails on a dangling reference or a repeated id', () => {
    const first = raw.lines.findIndex(line => line.when && 'encounter' in line.when)
    expect(broken(copy => { copy.lines[first].when.encounter = '1.C' })[0]).toMatch(/when\.encounter: no node with id "1\.C"/)
    expect(broken(copy => { copy.lines[0].quote = 'nobody' })).toEqual(['lines[0] (g.block).quote: no quote with id "nobody"'])
    expect(broken(copy => { copy.lines[1].id = copy.lines[0].id })).toEqual(['lines[1] (g.block).id: "g.block" is used twice'])
    expect(broken(copy => { copy.interludes['2'][0].id = 'i0.1' })).toEqual(['interludes.2[0].id: "i0.1" is used twice'])
  })

  it('fails on a missing section or a wrong structure', () => {
    expect(broken(copy => { delete copy.gate })).toContain('gate: expected an object')
    expect(broken(copy => { delete copy.interludes['3'] })).toContain('interludes.3: expected a list')
    expect(broken(copy => { copy.layers[1].nodes.pop() })).toContain('layers[1].nodes: expected three skirmishes then a boss')
    expect(broken(copy => { copy.layers[2].boss.sets.pop() })).toContain('layers[2].boss.sets: expected one set per stage (2)')
    expect(broken(copy => { copy.articles[0].effect = 'swap' })).toContain('articles[0].effect: unknown effect "swap"')
    expect(broken(copy => { copy.weights[0].kind = 'CORES' })).toContain('weights[0].kind: expected CORE, FUNCTION or PATCH')
    expect(broken(copy => { copy.defeat.self[1].attempt = 2 })).toContain('defeat.self[1].attempt: expected attempts in rising order')
    expect(validateScript(null)).toEqual(['script: expected an object'])
  })

  it('uses only criteria the line engine knows', () => {
    for (const line of script.lines) {
      for (const key of Object.keys(line.when ?? {})) expect(CRITERIA_KEYS, line.id).toContain(key)
    }
  })

  // Spec section 2, "The three voices".
  it('keeps the watchers lower case and out of layer 3', () => {
    const gods = allLines().filter(line => line.voice === 'GOD')
    expect(gods.length).toBeGreaterThan(0)
    for (const line of gods) expect(line.text, line.id).toBe(line.text.toLowerCase())
    for (const line of script.lines.filter(candidate => candidate.voice === 'GOD')) {
      expect(line.when?.layer, line.id).not.toBe(3)
      expect(line.when?.encounter?.startsWith('3.') ?? false, line.id).toBe(false)
    }
    expect(interlude(3).some(line => line.voice === 'GOD')).toBe(false)
  })
})

describe('script lookups', () => {
  it('finds layers, nodes and enemy names', () => {
    expect(layerAt(2)?.name).toBe('COURT')
    expect(nodeById('1.B')?.name).toBe('YEANLING / THOUSAND')
    expect(nodeById('0.B')?.kind).toBe('prologue')
    expect(layerOfNode('3.2')?.id).toBe('carcosa')
    expect(nodeById('9.9')).toBeUndefined()
    expect(enemyName(1, 'hunter')).toBe('DESIRE / WANT')
    expect(enemyName(0, 'hunter')).toBeUndefined()
  })

  it('finds lines, interludes and tables by id', () => {
    expect(lineById('g.block')?.voice).toBe('SELF')
    expect(interlude(0).map(line => line.id)).toEqual(['i0.1', 'i0.2', 'i0.3', 'i0.4'])
    expect(interlude(7)).toEqual([])
    expect(quoteById('chambers-mask')?.text).toBe('I wear no mask.')
    expect(weightById('patch')?.kind).toBe('PATCH')
    expect(articleById('a7')?.effect).toBe('mirror')
  })

  it('picks the defeat line by how many times this battle has been tried', () => {
    expect(defeatSelf(1)).toBeUndefined()
    expect(defeatSelf(2)?.id).toBe('def.2')
    expect(defeatSelf(4)?.id).toBe('def.3')
    expect(defeatSelf(12)?.id).toBe('def.5')
  })

  it('lists every line that has an id exactly once', () => {
    const ids = allLines().map(line => line.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('cg.t2')
    expect(ids).toContain('gate.k1')
    expect(ids).toContain('def.3')
    expect(ids.length).toBeGreaterThan(script.lines.length)
  })

  it('fills placeholders and leaves an unknown one visible', () => {
    expect(placeholdersIn('Attempt {attempt}. Iteration {iteration}.')).toEqual(['attempt', 'iteration'])
    expect(fillText('Attempt {attempt}. It does not remember.', { attempt: 3 })).toBe('Attempt 3. It does not remember.')
    expect(fillText('{count} OF 1000', { count: 8 })).toBe('8 OF 1000')
    expect(fillText('Suspended {duration}.', {})).toBe('Suspended {duration}.')
  })
})
