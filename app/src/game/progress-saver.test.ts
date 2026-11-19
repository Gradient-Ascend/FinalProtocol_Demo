import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TUNING } from './tuning'

function createMemStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  return {
    items,
    getItem: (key: string): string | null => items.get(key) ?? null,
    setItem: (key: string, value: string): void => { items.set(key, String(value)) },
    removeItem: (key: string): void => { items.delete(key) },
  }
}

async function bootModules(opts: { pathname?: string; search?: string } = {}) {
  vi.resetModules()
  const disk = createMemStorage()
  const session = createMemStorage()
  let href = `https://gradient-ascend.github.io${opts.pathname ?? '/FinalProtocol_Demo/'}${opts.search ?? ''}`
  vi.stubGlobal('localStorage', disk)
  vi.stubGlobal('sessionStorage', session)
  vi.stubGlobal('window', {
    location: {
      pathname: opts.pathname ?? '/FinalProtocol_Demo/',
      search: opts.search ?? '',
      href,
    },
    history: {
      replaceState: (_s: unknown, _t: string, next: string) => { href = next },
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })
  const { storage } = await import('./storage')
  const { campaignStore } = await import('../campaign/campaign-store')
  const { battleStore } = await import('./battle-store')
  const { vfxQualityStore } = await import('./vfx-quality')
  const { progressSaver, connectProgressSaver } = await import('./progress-saver')
  storage.resetForTests()
  vfxQualityStore.resetForTests()
  progressSaver.resetForTests()
  campaignStore.boot('?intro=0')
  connectProgressSaver()
  return { disk, session, storage, campaignStore, battleStore, vfxQualityStore, progressSaver, getHref: () => href }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('progressSaver', () => {
  it('keeps one isolated save per user on a shared host and switches cleanly live', async () => {
    const { campaignStore, vfxQualityStore, progressSaver, storage } = await bootModules()

    // Progress default user to layer 1
    campaignStore.startRun()
    campaignStore.battleWon(30)
    campaignStore.finishInterlude()
    vfxQualityStore.set('medium')
    const defaultSummary = progressSaver.saveCheckpointNow()
    expect(defaultSummary.user).toBe('default')
    expect(defaultSummary.badge).toBe('L1')
    expect(defaultSummary.savedAt).not.toBeNull()

    // Switch to new user 'alice': clean slate with default HIGH VFX quality
    const aliceSummary = progressSaver.switchUser('Alice')
    expect(aliceSummary.user).toBe('alice')
    expect(aliceSummary.badge).toBe('NEW')
    expect(campaignStore.getSnapshot().run).toBeNull()
    expect(vfxQualityStore.getSnapshot()).toBe('high')
    expect(storage.listUsers()).toEqual(['default', 'alice'])

    // Switching back to default restores Layer 1 run + medium VFX setting
    const back = progressSaver.switchUser('default')
    expect(back.badge).toBe('L1')
    expect(campaignStore.getSnapshot().run?.layer).toBe(1)
    expect(vfxQualityStore.getSnapshot()).toBe('medium')
  })

  it('exports and imports portable save bundles with sanitization, rejecting invalid JSON', async () => {
    const { campaignStore, battleStore, vfxQualityStore, progressSaver } = await bootModules()

    campaignStore.startRun()
    campaignStore.battleWon(31)
    campaignStore.finishInterlude()
    battleStore.toggleMute()
    vfxQualityStore.set('low')
    const { filename, json } = progressSaver.exportSaveBundle()
    expect(filename).toBe('final-protocol-default.save.json')

    // Reject invalid / foreign JSON before mutating anything
    progressSaver.switchUser('guest')
    expect(progressSaver.importSaveBundle('{bad')).toMatchObject({ ok: false })
    expect(progressSaver.importSaveBundle(JSON.stringify({ hello: 'world' }))).toMatchObject({ ok: false })

    // Tamper Sanity upwards in exported JSON -> sanitizeRun clamps to maxSanity
    const tampered = JSON.parse(json) as { data: { run: { sanity: number } } }
    tampered.data.run.sanity = 999
    const imported = progressSaver.importSaveBundle(JSON.stringify(tampered))
    expect(imported.ok).toBe(true)
    expect(campaignStore.getSnapshot().run?.layer).toBe(1)
    expect(campaignStore.getSnapshot().run?.sanity).toBe(DEFAULT_TUNING.maxSanity)
    expect(battleStore.getSnapshot().muted).toBe(true)
    expect(vfxQualityStore.getSnapshot()).toBe('low')
  })

  it('resets a user save or removes a custom user profile back to default', async () => {
    const { campaignStore, progressSaver, storage } = await bootModules()
    progressSaver.switchUser('tester')
    campaignStore.startRun()
    campaignStore.battleWon(28)
    campaignStore.finishInterlude()
    expect(progressSaver.getSnapshot().current.badge).toBe('L1')

    const cleared = progressSaver.resetCurrentSave(false)
    expect(cleared.user).toBe('tester')
    expect(cleared.badge).toBe('NEW')
    expect(campaignStore.getSnapshot().run).toBeNull()

    const afterRemove = progressSaver.resetCurrentSave(true)
    expect(afterRemove.user).toBe('default')
    expect(storage.getUser()).toBe('default')
    expect(storage.listUsers()).toEqual(['default'])
  })
})
