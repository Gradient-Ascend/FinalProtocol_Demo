import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { mountIntro, type IntroProbe } from '@/cinematic/intro'

// The opening sequence on its own, at #/preview/intro, for building and
// checking it. The hash query sets where and how it plays:
//
//   #/preview/intro?t=40             start 40 seconds in
//   #/preview/intro?t=40&speed=0.001 hold (nearly) still there: a frame to look at
//   #/preview/intro?speed=4          four times as fast (sound plays only at speed 1)
//   #/preview/intro?reduced=1        as shown under reduced motion
//   #/preview/intro?muted=1          no sound
//
// window.__introProbe() reports { t, shot, done } (and the frame count and the
// last frame's draw time), so a script can wait for a moment. Sound needs a
// key or a click first, as everywhere.

declare global {
  interface Window {
    __introProbe?: () => IntroProbe
    __introSkip?: () => void
  }
}

export default function PreviewIntro() {
  const root = useRef<HTMLDivElement>(null)
  const { search } = useLocation()
  const [done, setDone] = useState(false)
  const [run, setRun] = useState(0)

  useEffect(() => {
    const host = root.current
    if (!host) return
    const query = new URLSearchParams(search)
    const number = (key: string) => {
      const value = Number(query.get(key))
      return Number.isFinite(value) && value > 0 ? value : undefined
    }
    setDone(false)
    const intro = mountIntro(host, {
      reducedMotion: query.get('reduced') === '1',
      muted: query.get('muted') === '1',
      startAt: number('t'),
      speed: number('speed'),
      onDone: () => setDone(true),
    })
    window.__introProbe = intro.probe
    window.__introSkip = intro.skip
    return () => {
      intro.dispose()
      delete window.__introProbe
      delete window.__introSkip
    }
  }, [search, run])

  return (
    <div ref={root} data-preview-intro style={{ position: 'fixed', inset: 0, background: '#000' }}>
      {done && (
        <button
          type="button"
          data-replay
          onClick={() => setRun(n => n + 1)}
          style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 1, padding: '8px 14px', background: 'none', border: '1px solid #333', borderRadius: 6, color: '#858585', fontSize: 11, letterSpacing: '0.12em', cursor: 'pointer' }}
        >
          DONE · REPLAY
        </button>
      )}
    </div>
  )
}
