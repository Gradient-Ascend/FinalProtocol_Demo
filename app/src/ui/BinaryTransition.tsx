import { useEffect, useRef } from 'react'
import { MONO } from '@/cinematic/display'
import { useOverlayKeyLock } from './Modal'

export type BinaryTransitionProps = {
  active: boolean
  reducedMotion: boolean
  onMidpoint: () => void
  onComplete: () => void
}

const TOTAL_MS = 580
const MID_MS = 270
const REDUCED_MS = 140

/** Full-screen procedural 01 binary stream transition between Title and Deck Builder. */
export function BinaryTransition({ active, reducedMotion, onMidpoint, onComplete }: BinaryTransitionProps) {
  useOverlayKeyLock(active)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const midRef = useRef(onMidpoint)
  const doneRef = useRef(onComplete)
  midRef.current = onMidpoint
  doneRef.current = onComplete

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) {
      midRef.current()
      doneRef.current()
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      midRef.current()
      doneRef.current()
      return
    }

    let raf = 0
    let midFired = false
    let finished = false
    const start = performance.now()
    const total = reducedMotion ? REDUCED_MS : TOTAL_MS
    const mid = reducedMotion ? REDUCED_MS / 2 : MID_MS

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = window.innerWidth
    const height = window.innerHeight
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const colPitch = 18
    const rowPitch = 16
    const cols = Math.ceil(width / colPitch) + 1
    const rows = Math.ceil(height / rowPitch) + 1
    const colSeed = Array.from({ length: cols }, (_, i) => ({
      offset: ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1,
      dir: i % 3 === 0 ? -1 : 1,
      speed: 0.9 + (((Math.cos(i * 78.233) * 19341.13) % 1 + 1) % 1) * 0.65,
      cyan: i % 7 === 0,
    }))

    const tick = (now: number) => {
      const elapsed = now - start
      if (!midFired && elapsed >= mid) {
        midFired = true
        midRef.current()
      }

      ctx.clearRect(0, 0, width, height)

      if (reducedMotion) {
        const k = elapsed < mid ? elapsed / mid : 1 - (elapsed - mid) / Math.max(1, total - mid)
        ctx.fillStyle = `rgba(7, 7, 7, ${Math.max(0, Math.min(1, k)).toFixed(3)})`
        ctx.fillRect(0, 0, width, height)
      } else {
        const entering = elapsed < mid
        const p = entering ? Math.min(1, elapsed / mid) : Math.min(1, (elapsed - mid) / (total - mid))
        const veilAlpha = entering ? Math.pow(p, 0.72) : Math.pow(1 - p, 0.85)
        ctx.fillStyle = `rgba(7, 7, 7, ${veilAlpha.toFixed(3)})`
        ctx.fillRect(0, 0, width, height)

        ctx.font = `600 12px ${MONO}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        const flipSeed = Math.floor(elapsed / 38)
        for (let c = 0; c < cols; c++) {
          const meta = colSeed[c]
          const x = c * colPitch + colPitch * 0.5
          const progress = entering
            ? p * (1.28 + meta.offset * 0.35) * meta.speed
            : p * (1.2 + meta.offset * 0.3) * meta.speed
          const headRow = entering
            ? (meta.dir > 0 ? progress * rows : (1 - progress) * rows)
            : (meta.dir > 0 ? (0.12 + progress) * rows : (0.88 - progress) * rows)
          const trailRows = Math.max(4, Math.round(rows * 0.48))

          for (let s = 0; s < trailRows; s++) {
            const r = Math.round(headRow - meta.dir * s)
            if (r < 0 || r >= rows) continue
            const fade = 1 - s / trailRows
            const alpha = (entering ? 0.92 : 0.86 * (1 - p * 0.55)) * fade
            if (alpha <= 0.04) continue
            const hash = ((c * 31 + r * 17 + flipSeed * (s === 0 ? 7 : 3)) >>> 0) & 1
            if (s === 0) {
              ctx.fillStyle = meta.cyan ? `rgba(94, 230, 255, ${alpha.toFixed(3)})` : `rgba(245, 245, 245, ${alpha.toFixed(3)})`
            } else if (s < 3) {
              ctx.fillStyle = `rgba(216, 216, 216, ${(alpha * 0.75).toFixed(3)})`
            } else {
              ctx.fillStyle = `rgba(110, 118, 129, ${(alpha * 0.58).toFixed(3)})`
            }
            ctx.fillText(hash ? '1' : '0', x, r * rowPitch + rowPitch * 0.5)
          }
        }
      }

      if (elapsed >= total) {
        if (!finished) {
          finished = true
          doneRef.current()
        }
        return
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [active, reducedMotion])

  if (!active) return null
  return <canvas ref={canvasRef} className="binary-transition-canvas" aria-hidden="true" />
}
