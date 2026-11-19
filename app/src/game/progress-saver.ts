import type { Loadout } from './skills'
import { DEFAULT_LOADOUT, cloneLoadout, sanitizeLoadout } from './skills'
import { DEFAULT_USER, normalizeUserId, storage } from './storage'
import { battleStore } from './battle-store'
import type { VfxQualitySetting } from './vfx-quality'
import { DEFAULT_VFX_QUALITY, vfxQualityStore } from './vfx-quality'
import { campaignStore, sanitizeMeta, sanitizeRun, sanitizeSaid } from '../campaign/campaign-store'
import { storyFeed } from '../ui/story-feed'

/**
 * Lightweight per-user single-save coordinator with host/subpath awareness and
 * portable JSON export/import. Preserves one isolated save slot per user ID.
 */

export type UserSaveSummary = {
  user: string
  badge: string
  headline: string
  hasProgress: boolean
  savedAt: number | null
  active: boolean
}

export type ProgressSaveBundle = {
  format: 'final-protocol-save'
  version: 1
  user: string
  exportedAt: string
  data: {
    run: unknown | null
    meta: unknown | null
    said: string[]
    seen: string[]
    loadout: Loadout
    settings: {
      muted: boolean
      reducedMotion: boolean | null
      vfxQuality: VfxQualitySetting
    }
  }
}

export type SaverSnapshot = {
  activeUser: string
  hostScope: string
  current: UserSaveSummary
  users: UserSaveSummary[]
  rev: number
}

const SAVE_KNOWN_FIELDS = ['run', 'meta', 'loadout', 'said', 'seen', 'settings'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeVfxSetting(raw: unknown): VfxQualitySetting {
  return raw === 'auto' || raw === 'low' || raw === 'medium' || raw === 'high'
    ? raw
    : DEFAULT_VFX_QUALITY
}

function sanitizeSeenList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((item): item is string => typeof item === 'string' && item.length <= 32))].slice(-64)
}

function defaultMetaPayload() {
  return sanitizeMeta(null)
}

function defaultRunHeadline(meta: ReturnType<typeof sanitizeMeta>, savedAt: number | null): { badge: string; headline: string; hasProgress: boolean } {
  if (meta.clears > 0 || meta.iteration > 1 || meta.introSeen) {
    const clearsPart = meta.clears > 0 ? ` · CLEARS ${meta.clears}` : ''
    return {
      badge: meta.clears > 0 ? 'CLR' : meta.iteration > 1 ? `IT${meta.iteration}` : 'LOG',
      headline: `TITLE STANDBY · ITERATION ${meta.iteration}${clearsPart}`,
      hasProgress: true,
    }
  }
  return {
    badge: 'NEW',
    headline: savedAt !== null ? 'CHECKPOINT SAVED · SANDBOX STANDBY' : 'FRESH SAVE · NO RUN RECORDED',
    hasProgress: savedAt !== null,
  }
}

function buildUserSummary(rawUser?: string): UserSaveSummary {
  const activeUser = storage.getUser()
  const user = rawUser === undefined ? activeUser : normalizeUserId(rawUser)
  const storedRun = sanitizeRun(storage.peekForUser<unknown>(user, 'run', null))
  const meta = sanitizeMeta(storage.peekForUser<unknown>(user, 'meta', null))
  const savedAt = storage.getSavedAt(user)
  const active = user === activeUser

  if (storedRun?.run && storedRun.run.layer >= 1) {
    const { run } = storedRun
    if (run.layer === 4) {
      return {
        user,
        badge: 'GATE',
        headline: `AT THE GATE · SANITY ${run.sanity}/${run.tuning.maxSanity} · ITERATION ${meta.iteration}`,
        hasProgress: true,
        savedAt,
        active,
      }
    }
    return {
      user,
      badge: `L${run.layer}`,
      headline: `LAYER ${run.layer} · ${run.broken.length} BROKEN · SANITY ${run.sanity}/${run.tuning.maxSanity}`,
      hasProgress: true,
      savedAt,
      active,
    }
  }

  const idle = defaultRunHeadline(meta, savedAt)
  return {
    user,
    badge: idle.badge,
    headline: idle.headline,
    hasProgress: idle.hasProgress,
    savedAt,
    active,
  }
}

function fingerprint(): string {
  const campaign = campaignStore.getSnapshot()
  const loadout = battleStore.getLoadout()
  const run = campaign.run
  return JSON.stringify([
    run?.seed ?? null,
    run?.layer ?? null,
    run?.broken ?? null,
    run?.sanity ?? null,
    run?.weights ?? null,
    run?.current ?? null,
    campaign.meta.introSeen,
    campaign.meta.iteration,
    campaign.meta.clears,
    campaign.meta.deepest,
    campaign.meta.door,
    campaign.meta.ghosts.length,
    campaign.meta.seenLines.length,
    loadout,
  ])
}

let rev = 0
let cachedRev = -1
let cachedSnapshot: SaverSnapshot | null = null
let syncing = false
let connected = false
let prevFingerprint = ''
let unsubs: Array<() => void> = []
const listeners = new Set<() => void>()

function emit(): void {
  rev++
  cachedSnapshot = null
  listeners.forEach((listener) => listener())
}

function computeSnapshot(): SaverSnapshot {
  const activeUser = storage.getUser()
  const hostScope = storage.getHostScope()
  const users = storage.listUsers().map((id) => buildUserSummary(id))
  const current = users.find((entry) => entry.user === activeUser) ?? buildUserSummary(activeUser)
  return { activeUser, hostScope, current, users, rev }
}

/** Reloads in-memory game stores to reflect the currently active user's single save. */
export function syncStoresToActiveUser(): void {
  syncing = true
  try {
    battleStore.reloadFromStorage()
    vfxQualityStore.reload()
    campaignStore.boot('?intro=0')
    storyFeed.seed()
    prevFingerprint = fingerprint()
  } finally {
    syncing = false
  }
  emit()
}

/** Attaches lightweight auto-save timestamp tracking once at boot. */
export function connectProgressSaver(): void {
  if (connected) return
  connected = true
  prevFingerprint = fingerprint()

  const checkProgress = () => {
    if (syncing) return
    const next = fingerprint()
    if (next === prevFingerprint) return
    prevFingerprint = next
    const snap = campaignStore.getSnapshot()
    const hasCustomLoadout = JSON.stringify(battleStore.getLoadout()) !== JSON.stringify(DEFAULT_LOADOUT)
    if (snap.run !== null || snap.meta.introSeen || snap.meta.iteration > 1 || snap.meta.clears > 0 || hasCustomLoadout) {
      storage.touchSavedAt()
    }
    emit()
  }

  unsubs.push(
    campaignStore.subscribe(checkProgress),
    battleStore.subscribe(checkProgress),
    storage.subscribeUser(() => emit()),
  )
}

export const progressSaver = {
  getSnapshot(): SaverSnapshot {
    if (cachedSnapshot === null || cachedRev !== rev) {
      cachedSnapshot = computeSnapshot()
      cachedRev = rev
    }
    return cachedSnapshot
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  summarizeUser(rawUser?: string): UserSaveSummary {
    return buildUserSummary(rawUser)
  },

  /** Flushes loadout/preferences and updates the checkpoint timestamp for the active user. */
  saveCheckpointNow(): UserSaveSummary {
    storage.set('loadout', battleStore.getLoadout())
    storage.set('muted', battleStore.getSnapshot().muted)
    storage.touchSavedAt()
    prevFingerprint = fingerprint()
    emit()
    return buildUserSummary()
  },

  /** Switches active profile (or creates a new isolated user ID with a fresh single save). */
  switchUser(rawUser: string): UserSaveSummary {
    storage.setUser(rawUser)
    syncStoresToActiveUser()
    return buildUserSummary()
  },

  /** Exports the active user's single save as a formatted portable JSON bundle. */
  exportSaveBundle(): { filename: string; json: string; bundle: ProgressSaveBundle } {
    const user = storage.getUser()
    const reducedRaw = storage.get<unknown>('reducedMotion', null)
    const bundle: ProgressSaveBundle = {
      format: 'final-protocol-save',
      version: 1,
      user,
      exportedAt: new Date().toISOString(),
      data: {
        run: storage.get<unknown>('run', null),
        meta: storage.get<unknown>('meta', defaultMetaPayload()),
        said: sanitizeSaid(storage.get<unknown>('said', [])),
        seen: sanitizeSeenList(storage.get<unknown>('seen', [])),
        loadout: sanitizeLoadout(storage.get<unknown>('loadout', cloneLoadout(DEFAULT_LOADOUT))),
        settings: {
          muted: storage.flag('muted'),
          reducedMotion: typeof reducedRaw === 'boolean' ? reducedRaw : null,
          vfxQuality: vfxQualityStore.getSnapshot(),
        },
      },
    }
    return {
      filename: `final-protocol-${user}.save.json`,
      json: JSON.stringify(bundle, null, 2),
      bundle,
    }
  },

  /** Imports and sanitizes a portable save JSON into the currently active user's save slot. */
  importSaveBundle(rawText: string): { ok: true; summary: UserSaveSummary } | { ok: false; error: string } {
    let parsed: unknown
    try {
      parsed = JSON.parse(rawText)
    } catch {
      return { ok: false, error: 'Invalid JSON file.' }
    }
    if (!isRecord(parsed)) {
      return { ok: false, error: 'Unrecognized save file format.' }
    }
    if (parsed.version !== undefined && parsed.version !== 1) {
      return { ok: false, error: `Unsupported save version: ${String(parsed.version)}.` }
    }

    const payload = parsed.format === 'final-protocol-save' && isRecord(parsed.data)
      ? parsed.data
      : parsed

    const hasKnownField = SAVE_KNOWN_FIELDS.some((key) => Object.hasOwn(payload, key))
    if (!hasKnownField) {
      return { ok: false, error: 'Unrecognized save file format.' }
    }

    if (Object.hasOwn(payload, 'run')) {
      const sanitizedRun = sanitizeRun(payload.run)
      if (sanitizedRun) {
        storage.set('run', { ...sanitizedRun.run, reward: sanitizedRun.reward, interlude: sanitizedRun.interlude })
      } else {
        storage.remove('run')
      }
    }

    if (Object.hasOwn(payload, 'meta')) {
      storage.set('meta', sanitizeMeta(payload.meta))
    }

    if (Object.hasOwn(payload, 'said')) {
      storage.set('said', sanitizeSaid(payload.said))
    }

    if (Object.hasOwn(payload, 'seen')) {
      storage.set('seen', sanitizeSeenList(payload.seen))
    }

    if (Object.hasOwn(payload, 'loadout')) {
      storage.set('loadout', sanitizeLoadout(payload.loadout))
    }

    if (isRecord(payload.settings)) {
      if (typeof payload.settings.muted === 'boolean') {
        storage.set('muted', payload.settings.muted)
      }
      if (typeof payload.settings.reducedMotion === 'boolean') {
        storage.set('reducedMotion', payload.settings.reducedMotion)
      } else if (payload.settings.reducedMotion === null) {
        storage.remove('reducedMotion')
      }
      if (Object.hasOwn(payload.settings, 'vfxQuality')) {
        storage.set('vfxQuality', sanitizeVfxSetting(payload.settings.vfxQuality))
      }
    }

    storage.touchSavedAt()
    syncStoresToActiveUser()
    return { ok: true, summary: buildUserSummary() }
  },

  /** Wipes the current user's save data (and optionally deletes a non-default profile). */
  resetCurrentSave(removeProfile = false): UserSaveSummary {
    const active = storage.getUser()
    if (removeProfile && active === DEFAULT_USER) {
      storage.clearUserSave(active, false)
    } else {
      storage.clearUserSave(active, removeProfile)
    }
    syncStoresToActiveUser()
    return buildUserSummary()
  },

  resetForTests(): void {
    unsubs.forEach((unsub) => unsub())
    unsubs = []
    connected = false
    syncing = false
    prevFingerprint = ''
    rev = 0
    cachedRev = -1
    cachedSnapshot = null
    listeners.clear()
  },
}
