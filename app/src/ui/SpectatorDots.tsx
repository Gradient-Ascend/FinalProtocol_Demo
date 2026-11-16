import type { CSSProperties } from 'react'
import { SPECTATOR } from '@/cinematic/display'
import { LAYER_HUES } from './layers'

// The three spectators: 2 px dots, top right, on every full-screen scene.
// Each takes its god's hue once the run has entered that petal. They sit
// where the opening draws them, so they do not move when the scene changes.
export function SpectatorDots({ entered }: { entered: number }) {
  const r = SPECTATOR.spread
  const spots: [number, number][] = [[0, -r], [-r * 0.866, r * 0.5], [r * 0.866, r * 0.5]]
  return (
    <div className="spectators" aria-hidden="true" style={{ top: SPECTATOR.inset, right: SPECTATOR.inset }}>
      {spots.map(([x, y], index) => {
        const lit = entered > index
        const style: CSSProperties = {
          left: Math.round(x) - 1, top: Math.round(y) - 1, width: SPECTATOR.size, height: SPECTATOR.size,
          background: lit ? LAYER_HUES[index + 1] : '#fff', opacity: lit ? 0.2 : 0.06,
        }
        return <i key={index} style={style} />
      })}
    </div>
  )
}
