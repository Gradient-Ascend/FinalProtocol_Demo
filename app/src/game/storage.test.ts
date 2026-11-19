import { afterEach, describe, expect, it, vi } from 'vitest'

// localStorage as a browser gives it, held in a Map the test can read.
function onDisk(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (key: string): string | null => items.get(key) ?? null,
    setItem: (key: string, value: string): void => { items.set(key, String(value)) },
    removeItem: (key: string): void => { items.delete(key) },
  })
  return items
}

// A page load: the migration runs once per load, the first time storage is touched.
async function pageLoad() {
  vi.resetModules()
  return (await import('./storage')).storage
}

const LOADOUT = JSON.stringify([
  { frame: 'cot', skills: ['off', 'on', 'high', 'ultra'] },
  { frame: 'vector', skills: ['zero', 'manhattan', 'array', 'base'] },
])

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('storage', () => {
  it('moves the three old keys under the new prefix the first time it is touched', async () => {
    const before = { 'game.loadout': LOADOUT, 'game.muted': 'true', 'game.reducedMotion': 'false', 'game.highScore': '12', elsewhere: 'x' }
    const disk = onDisk(before)
    const storage = await pageLoad()
    // Loading the module reads nothing.
    expect(Object.fromEntries(disk)).toEqual(before)
    expect(storage.flag('muted')).toBe(true)
    // Only those three move; the old keys are gone and nothing else is touched.
    expect(Object.fromEntries(disk)).toEqual({
      'fp.loadout': LOADOUT, 'fp.muted': 'true', 'fp.reducedMotion': 'false', 'game.highScore': '12', elsewhere: 'x',
    })
    expect(storage.get<unknown>('loadout', null)).toEqual(JSON.parse(LOADOUT))
    expect(storage.flag('reducedMotion', true)).toBe(false)
  })

  it.each([
    ['1', true], ['0', false], ['true', true], ['false', false],
  ])('reads the old mute key in either of its two encodings: %s', async (raw, muted) => {
    const disk = onDisk({ 'game.muted': raw })
    const storage = await pageLoad()
    expect(storage.flag('muted', !muted)).toBe(muted)
    expect(Object.fromEntries(disk)).toEqual({ 'fp.muted': String(muted) })
  })

  it('drops an old setting it cannot read instead of carrying it over', async () => {
    const disk = onDisk({ 'game.muted': 'maybe', 'game.reducedMotion': '"1"' })
    const storage = await pageLoad()
    expect(storage.flag('muted')).toBe(false)
    expect(storage.flag('reducedMotion')).toBe(false)
    expect([...disk.keys()]).toEqual([])
  })

  it('keeps a value already saved under the new prefix', async () => {
    const disk = onDisk({ 'fp.muted': 'false', 'game.muted': '1', 'fp.loadout': '[]', 'game.loadout': LOADOUT })
    const storage = await pageLoad()
    storage.set('reducedMotion', true)
    expect(Object.fromEntries(disk)).toEqual({ 'fp.muted': 'false', 'fp.loadout': '[]', 'fp.reducedMotion': 'true' })
  })

  it('migrates once: a later load finds nothing old and changes nothing', async () => {
    const disk = onDisk({ 'game.muted': '1' })
    const first = await pageLoad()
    first.remove('loadout')
    first.set('muted', false)
    const second = await pageLoad()
    expect(second.flag('muted', true)).toBe(false)
    expect(Object.fromEntries(disk)).toEqual({ 'fp.muted': 'false' })
  })

  it('gives the battle store what the old build saved', async () => {
    onDisk({ 'game.loadout': LOADOUT, 'game.muted': '1', 'game.reducedMotion': 'true' })
    vi.resetModules()
    const { BattleStore } = await import('./battle-store')
    const store = new BattleStore()
    expect(store.getSnapshot()).toMatchObject({ muted: true, reducedMotion: true })
    expect(store.getLoadout()).toEqual(JSON.parse(LOADOUT))
    expect(store.getSnapshot().presets.map(preset => preset.name)).toEqual(['CoT', 'VECTOR'])
  })

  it('has the audio system and the battle store write one mute key in one encoding', async () => {
    const disk = onDisk()
    vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined })
    vi.resetModules()
    const { BattleStore } = await import('./battle-store')
    const { AudioSystem } = await import('./audio')
    const mute = () => [...disk].filter(([key]) => key.toLowerCase().includes('mute'))

    // The store mutes: the audio system of the next load starts muted.
    new BattleStore().toggleMute()
    expect(mute()).toEqual([['fp.muted', 'true']])
    const audio = new AudioSystem()
    expect(audio.muted).toBe(true)

    // The audio system unmutes: the store of the next load is not muted.
    expect(audio.toggleMute()).toBe(false)
    expect(mute()).toEqual([['fp.muted', 'false']])
    expect(new BattleStore().getSnapshot().muted).toBe(false)
    audio.dispose()
  })

  it('reads anything that is not a stored true or false as the fallback', async () => {
    const disk = onDisk()
    const storage = await pageLoad()
    for (const raw of ['"yes"', '1', '0', 'null', '{', '[true]', '']) {
      disk.set('fp.muted', raw)
      expect(storage.flag('muted'), raw).toBe(false)
      expect(storage.flag('muted', true), raw).toBe(true)
    }
    // What cannot be parsed is the fallback for any key.
    disk.set('fp.run', '{"seed":')
    expect(storage.get<unknown>('run', null)).toBeNull()
  })

  it('never throws without storage: reads give the fallback and writes are dropped', async () => {
    expect(typeof localStorage).toBe('undefined')
    const storage = await pageLoad()
    expect(storage.get('meta', 'none')).toBe('none')
    expect(storage.flag('muted', true)).toBe(true)
    expect(() => { storage.set('muted', true); storage.remove('run') }).not.toThrow()
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('quota') },
      removeItem: () => { throw new Error('blocked') },
    })
    const blocked = await pageLoad()
    expect(blocked.flag('muted')).toBe(false)
    expect(() => { blocked.set('muted', true); blocked.remove('run') }).not.toThrow()
  })
})

function onSession() {
  const items = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string): string | null => items.get(key) ?? null,
    setItem: (key: string, value: string): void => { items.set(key, String(value)) },
    removeItem: (key: string): void => { items.delete(key) },
  })
  return items
}

describe('host scoping & multi-user profiles', () => {
  it('resolves subpath host scopes cleanly for GitHub Pages and root localhost', async () => {
    vi.resetModules()
    const mod = await import('./storage')
    expect(mod.resolveHostScope('/')).toBe('')
    expect(mod.resolveHostScope('/index.html')).toBe('')
    expect(mod.resolveHostScope('/FinalProtocol_Demo/')).toBe('finalprotocol_demo')
    expect(mod.resolveHostScope('/FinalProtocol_Demo/index.html')).toBe('finalprotocol_demo')
    expect(mod.prefixFor('', 'default')).toBe('fp.')
    expect(mod.prefixFor('finalprotocol_demo', 'default')).toBe('fp@finalprotocol_demo.')
    expect(mod.prefixFor('finalprotocol_demo', 'alice')).toBe('fp@finalprotocol_demo:u/alice.')
  })

  it('seeds GitHub Pages subpath storage non-destructively from root fp.* once', async () => {
    const disk = onDisk({ 'fp.meta': JSON.stringify({ introSeen: true, iteration: 4 }) })
    onSession()
    vi.stubGlobal('window', { location: { pathname: '/FinalProtocol_Demo/', search: '', href: 'https://user.github.io/FinalProtocol_Demo/' } })
    const storage = await pageLoad()

    expect(storage.getHostScope()).toBe('finalprotocol_demo')
    expect(storage.get('meta', null)).toEqual({ introSeen: true, iteration: 4 })
    expect(disk.get('fp@finalprotocol_demo.meta')).toBe(JSON.stringify({ introSeen: true, iteration: 4 }))
    expect(disk.get('fp@finalprotocol_demo:__saver.seeded')).toBe('1')
    expect(disk.get('fp.meta')).toBe(JSON.stringify({ introSeen: true, iteration: 4 }))
  })

  it('isolates single save slots per user ID on a shared host and supports ?user= selection', async () => {
    const disk = onDisk()
    const session = onSession()
    let currentHref = 'https://user.github.io/FinalProtocol_Demo/?user=Alice'
    vi.stubGlobal('window', {
      location: { pathname: '/FinalProtocol_Demo/', search: '?user=Alice', href: currentHref },
      history: {
        replaceState: (_s: unknown, _t: string, nextUrl: string) => { currentHref = nextUrl },
      },
    })
    const storage = await pageLoad()

    expect(storage.getUser()).toBe('alice')
    storage.set('meta', { introSeen: true, iteration: 3 })
    expect(storage.listUsers()).toEqual(['default', 'alice'])
    expect(session.get('fp@finalprotocol_demo:__saver.active')).toBe('alice')

    storage.setUser('bob')
    expect(currentHref).toContain('user=bob')
    expect(storage.get('meta', null)).toBeNull()
    storage.set('meta', { introSeen: true, iteration: 7 })
    expect(storage.peekForUser('alice', 'meta', null)).toEqual({ introSeen: true, iteration: 3 })
    expect(storage.peekForUser('bob', 'meta', null)).toEqual({ introSeen: true, iteration: 7 })
    expect(disk.get('fp@finalprotocol_demo.meta')).toBeUndefined()

    const fallback = storage.clearUserSave('bob', true)
    expect(fallback).toBe('default')
    expect(currentHref).not.toContain('user=')
    expect(storage.listUsers()).toEqual(['default', 'alice'])
    expect(storage.peekForUser('bob', 'meta', null)).toBeNull()
  })
})
