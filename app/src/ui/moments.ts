import { battleStore } from '@/game/battle-store'
import type { StageHandle, StageOptions } from '@/cinematic/stage'

// A display moment on its own full-viewport element. The element is made
// here and removed here; the moment only draws in it.
export type Moment = {
  done: Promise<void>
  skip(): void
  // Ends it at once and removes the element (the scene went away).
  cancel(): void
}

function systemReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function playMoment(play: (options: StageOptions) => StageHandle, short = false): Moment {
  const host = document.createElement('div')
  host.className = 'moment-host'
  document.body.appendChild(host)
  const { reducedMotion, muted } = battleStore.getSnapshot()
  let handle: StageHandle
  try {
    handle = play({ host, reducedMotion: reducedMotion || systemReducedMotion(), muted, short })
  } catch (error) {
    // A picture that cannot be drawn must not strand the player.
    console.error(error)
    handle = { done: Promise.resolve(), skip: () => undefined }
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    event.preventDefault()
    handle.skip()
  }
  let over = false
  const end = () => {
    if (over) return
    over = true
    window.removeEventListener('keydown', onKey, true)
    host.remove()
  }
  window.addEventListener('keydown', onKey, true)
  return {
    done: handle.done.then(end, end),
    skip: () => handle.skip(),
    cancel: () => { handle.skip(); end() },
  }
}
