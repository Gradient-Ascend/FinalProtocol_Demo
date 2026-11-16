import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function media(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null
}

function subscribe(listener: () => void): () => void {
  const query = media()
  query?.addEventListener('change', listener)
  return () => query?.removeEventListener('change', listener)
}

// Reduced motion is on when either the game's own setting or the system asks
// for it, the same as the rest of the game's CSS.
export function useReducedMotion(setting?: boolean): boolean {
  const system = useSyncExternalStore(subscribe, () => media()?.matches ?? false, () => false)
  return setting === true || system
}
