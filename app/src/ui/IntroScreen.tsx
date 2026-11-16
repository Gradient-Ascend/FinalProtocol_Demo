import { useEffect, useRef } from 'react'
import { campaignStore } from '@/campaign/campaign-store'
import { mountIntro } from '@/cinematic/intro'

// The opening sequence. It draws on its own canvas inside this element and
// answers for its own keys (hold to skip); when it is over the title follows.
export function IntroScreen({ reducedMotion, muted }: { reducedMotion: boolean; muted: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  // The settings as they were when the sequence began: it is not restarted for a change.
  const options = useRef({ reducedMotion, muted })
  useEffect(() => {
    const host = root.current
    if (!host) return
    let live = true
    const intro = mountIntro(host, {
      ...options.current,
      // Deferred: the sequence reports from inside its own frame, and leaving
      // the scene takes its canvas down.
      onDone: () => window.setTimeout(() => { if (live) campaignStore.finishIntro() }, 0),
    })
    window.__introProbe = intro.probe
    window.__introSkip = intro.skip
    return () => {
      live = false
      intro.dispose()
      delete window.__introProbe
      delete window.__introSkip
    }
  }, [])
  return <div ref={root} className="scene intro-scene" />
}
