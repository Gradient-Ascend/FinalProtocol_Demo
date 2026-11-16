// M mutes, in every scene. The opening and the display moments take the keys
// while they play (any key held is the way out of them), so they answer for
// this one themselves: it changes the setting and is never a held key.
//
// There is one mute setting, the battle store's: it keeps it in memory, writes
// it through game/storage.ts under 'muted', and the game's own sound follows
// it. The shared sound of the opening and the moments is told here as well,
// for a page where nothing else is listening to the store (the previews).
import { battleStore } from '../game/battle-store'
import { setMuted } from './sound'

export const isMuteKey = (event: KeyboardEvent): boolean => event.code === 'KeyM'

/** Flip the mute setting. Returns what it is now. */
export function toggleMute(): boolean {
  battleStore.toggleMute()
  const muted = battleStore.getSnapshot().muted
  setMuted(muted)
  return muted
}
