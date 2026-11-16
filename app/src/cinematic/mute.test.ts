import { afterEach, describe, expect, it, vi } from 'vitest'
import { battleStore } from '../game/battle-store'
import { storage } from '../game/storage'
import { isMuteKey, toggleMute } from './mute'
import { isMuted } from './sound'

// M during the opening and the display moments. There is one mute setting:
// the battle store's, kept through game/storage.ts under 'muted'. The key
// flips that one and the shared sound of the moments with it, so the game,
// its settings screen and a reload all agree with what was heard.

describe('the mute key of the opening and the display moments', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('flips the setting the game keeps, where the game keeps it, and the shared sound with it', () => {
    const kept = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => { kept.set(key, value) },
      removeItem: (key: string) => { kept.delete(key) },
    })
    const before = battleStore.getSnapshot().muted
    let told = 0
    const unsubscribe = battleStore.subscribe(() => { told++ })

    expect(toggleMute()).toBe(!before)
    expect(battleStore.getSnapshot().muted).toBe(!before)
    expect(kept.get('fp.muted')).toBe(JSON.stringify(!before))
    expect(storage.flag('muted')).toBe(!before)
    expect(isMuted()).toBe(!before)
    expect(told).toBe(1)                                   // whoever follows the store (the game's own sound) hears of it, once

    expect(toggleMute()).toBe(before)
    expect(battleStore.getSnapshot().muted).toBe(before)
    expect(kept.get('fp.muted')).toBe(JSON.stringify(before))
    expect(isMuted()).toBe(before)
    expect(told).toBe(2)
    unsubscribe()
  })

  it('is M, wherever the layout puts the letter, and no other key', () => {
    const key = (code: string, key = '') => ({ code, key }) as KeyboardEvent
    expect(isMuteKey(key('KeyM', 'm'))).toBe(true)
    expect(isMuteKey(key('KeyM', 'M'))).toBe(true)
    for (const code of ['Space', 'Escape', 'Enter', 'KeyN', 'KeyR', 'Comma']) expect(isMuteKey(key(code))).toBe(false)
  })
})
