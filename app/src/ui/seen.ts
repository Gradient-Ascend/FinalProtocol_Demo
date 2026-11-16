import { storage } from '@/game/storage'

// Display moments already shown on this save: the first reveal of the map,
// each boss's long entrance, and which layers' words this run has read.
// Knowledge only; nothing here changes a battle.
const KEY = 'seen'
// Per-run marks ('layer:<seed>:<n>') are the only ones that pile up, so they
// are the only ones dropped: the rest are a handful and are kept for good.
const RUN_MARK = 'layer:'
const RUN_MARKS_KEPT = 12

function read(): string[] {
  const raw = storage.get<unknown>(KEY, [])
  return Array.isArray(raw)
    ? [...new Set(raw.filter((item): item is string => typeof item === 'string' && item.length <= 32))].slice(-64)
    : []
}

export function hasSeen(moment: string): boolean {
  return read().includes(moment)
}

export function markSeen(moment: string): void {
  const list = read()
  if (list.includes(moment)) return
  const next = [...list, moment]
  const runMarks = next.filter(item => item.startsWith(RUN_MARK)).slice(-RUN_MARKS_KEPT)
  storage.set(KEY, next.filter(item => !item.startsWith(RUN_MARK) || runMarks.includes(item)))
}
