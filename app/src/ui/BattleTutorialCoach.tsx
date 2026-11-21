import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { livingEnemies } from '@/game/battle-rules'
import type { BattleState, Coord } from '@/game/battle-types'
import { getMapViewState } from '@/game/boot'

export type BattleTutorialCoachProps = {
  state: BattleState
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  hoveredEnemyId: string | null
  inspectedEnemyId: string | null
  onFinish: () => void
}

type Box = { left: number; top: number; width: number; height: number }

type CoachStep = {
  title: string
  body: string
  checks: { label: string; done: boolean }[]
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function projectCell(canvas: HTMLCanvasElement | null, cellCoord: Coord): Box | null {
  const view = getMapViewState()
  if (!canvas || !view) return null
  const rect = canvas.getBoundingClientRect()
  return {
    left: rect.left + view.x + cellCoord.x * view.cell,
    top: rect.top + view.y + cellCoord.y * view.cell,
    width: view.cell,
    height: view.cell,
  }
}

function placeBeside(anchor: Box, popW: number, popH: number, prefer: 'right' | 'left', avoid?: Box | null): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pad = 12
  const minTop = 68

  const fitsRight = anchor.left + anchor.width + pad + popW <= vw - 10
  const fitsLeft = anchor.left - pad - popW >= 10

  let left: number
  if (prefer === 'right') {
    left = fitsRight ? anchor.left + anchor.width + pad : fitsLeft ? anchor.left - popW - pad : clamp(anchor.left, 10, vw - popW - 10)
  } else {
    left = fitsLeft ? anchor.left - popW - pad : fitsRight ? anchor.left + anchor.width + pad : clamp(anchor.left, 10, vw - popW - 10)
  }
  let top = clamp(anchor.top - 8, minTop, vh - popH - 12)

  // If the floating EnemyDossierPopup overlaps our coach card, nudge above or below the dossier cleanly.
  if (avoid) {
    const overlapsX = left < avoid.left + avoid.width + 8 && left + popW + 8 > avoid.left
    const overlapsY = top < avoid.top + avoid.height + 8 && top + popH + 8 > avoid.top
    if (overlapsX && overlapsY) {
      const aboveTop = avoid.top - popH - 10
      const belowTop = avoid.top + avoid.height + 10
      if (aboveTop >= minTop) {
        top = aboveTop
      } else if (belowTop + popH <= vh - 10) {
        top = belowTop
      } else {
        const leftOfDossier = avoid.left - popW - 10
        if (leftOfDossier >= 10) left = leftOfDossier
      }
    }
  }

  return { left: Math.round(clamp(left, 10, vw - popW - 10)), top: Math.round(clamp(top, minTop, vh - popH - 10)) }
}

/** Stage 2 Tutorial: non-blocking contextual side pop-ups anchored beside live UI & board elements. */
export function BattleTutorialCoach({
  state,
  canvasRef,
  hoveredEnemyId,
  inspectedEnemyId,
  onFinish,
}: BattleTutorialCoachProps) {
  const [step, setStep] = useState(0)
  const [seenHoverIncoming, setSeenHoverIncoming] = useState(false)
  const [seenHoverEnemy, setSeenHoverEnemy] = useState(false)
  const [seenClickEnemy, setSeenClickEnemy] = useState(false)
  const [seenHoverCard, setSeenHoverCard] = useState(false)
  const cardRef = useRef<HTMLElement>(null)

  const [layout, setLayout] = useState<{
    popPos: { left: number; top: number }
    spotlight: Box | null
    hints: Box[]
  }>({ popPos: { left: 320, top: 140 }, spotlight: null, hints: [] })

  useEffect(() => {
    if (hoveredEnemyId && !seenHoverEnemy) setSeenHoverEnemy(true)
  }, [hoveredEnemyId, seenHoverEnemy])

  useEffect(() => {
    if (inspectedEnemyId && !seenHoverCard) setSeenHoverCard(true)
  }, [inspectedEnemyId, seenHoverCard])

  useEffect(() => {
    if (!state.enemyAttackPreview) return
    if (step === 1 && !seenHoverIncoming) setSeenHoverIncoming(true)
    if (step === 2 && !seenClickEnemy) setSeenClickEnemy(true)
  }, [state.enemyAttackPreview, step, seenHoverIncoming, seenClickEnemy])

  const targetEnemy = livingEnemies(state).find(e => e.id === 'B01') ?? livingEnemies(state)[0] ?? null
  const movedEnough = state.actions.length >= 2 || state.turn > 1

  const steps: CoachStep[] = [
    {
      title: 'FIRST MOVEMENT ROUTE',
      body: 'Press W twice (or click 0x76 → 0x75) to collect two >_ Bash Flags and aim your first VECTOR strikes at B01.',
      checks: [{ label: `Route queued (${Math.min(2, state.actions.length)}/2)`, done: movedEnough }],
    },
    {
      title: 'PLAYER HP DAMAGE PREVIEW',
      body: 'Red segments on your Sanity bar show raw incoming hits before Privilege. Hover a red segment to highlight that attacker’s reach on the grid.',
      checks: [{ label: 'Hover red Sanity segment', done: seenHoverIncoming }],
    },
    {
      title: 'ENEMY ICON: HOVER & CLICK',
      body: 'Hover an enemy icon on the board to see its full threat zone & linked Sanity segments. Click it to cycle individual Desire steps.',
      checks: [
        { label: 'Hover enemy icon', done: seenHoverEnemy },
        { label: 'Click to cycle step', done: seenClickEnemy },
      ],
    },
    {
      title: 'ENEMY HP BAR & CARD HOVER',
      body: 'Yellow segments preview your outgoing Bash hits. Hover the enemy card for its full Hostile Dossier, then press SPACE to execute your route.',
      checks: [{ label: 'Hover enemy card', done: seenHoverCard }],
    },
  ]

  useLayoutEffect(() => {
    const compute = () => {
      const popW = cardRef.current?.offsetWidth || 278
      const popH = cardRef.current?.offsetHeight || 176
      let anchor: Box | null = null
      let prefer: 'right' | 'left' = 'right'
      let hints: Box[] = []
      let avoid: Box | null = null

      if (step === 0) {
        anchor = projectCell(canvasRef.current, state.player.pos)
        prefer = 'right'
        if (state.encounter.id === '0.B' && state.turn === 1) {
          const c1 = projectCell(canvasRef.current, { x: 7, y: 6 })
          const c2 = projectCell(canvasRef.current, { x: 7, y: 5 })
          hints = [c1, c2].filter((b): b is Box => b !== null)
        }
      } else if (step === 1) {
        const el = document.querySelector('.player-sanity')
        if (el) {
          const r = el.getBoundingClientRect()
          anchor = { left: r.left, top: r.top, width: r.width, height: r.height }
          prefer = 'right'
        }
      } else if (step === 2 && targetEnemy) {
        anchor = projectCell(canvasRef.current, targetEnemy.pos)
        prefer = 'left'
      } else if (step === 3) {
        const cardSelector = targetEnemy ? `.enemy-card[data-enemy="${targetEnemy.id}"]` : '.enemy-card'
        const el = document.querySelector(cardSelector)
        if (el) {
          const r = el.getBoundingClientRect()
          anchor = { left: r.left, top: r.top, width: r.width, height: r.height }
          prefer = 'left'
        }
        const dossier = document.querySelector('.enemy-dossier-popup')
        if (dossier) {
          const dr = dossier.getBoundingClientRect()
          avoid = { left: dr.left, top: dr.top, width: dr.width, height: dr.height }
        }
      }

      if (!anchor) {
        anchor = { left: window.innerWidth * 0.45, top: 140, width: 40, height: 40 }
      }
      const popPos = placeBeside(anchor, popW, popH, prefer, avoid)
      setLayout({ popPos, spotlight: anchor, hints })
    }

    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('map-zoom-changed', compute)
    window.addEventListener('map-pan-changed', compute)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('map-zoom-changed', compute)
      window.removeEventListener('map-pan-changed', compute)
    }
  }, [step, state.player.pos, state.actions.length, targetEnemy?.id, targetEnemy?.pos, inspectedEnemyId, canvasRef])

  const active = steps[step]

  return (
    <div className="tutorial-coach-layer" aria-live="polite">
      {layout.spotlight && (
        <div
          className="tutorial-spotlight"
          style={{
            left: `${layout.spotlight.left - 4}px`,
            top: `${layout.spotlight.top - 4}px`,
            width: `${layout.spotlight.width + 8}px`,
            height: `${layout.spotlight.height + 8}px`,
          }}
          aria-hidden="true"
        />
      )}
      {layout.hints.map((hint, i) => (
        <div
          key={i}
          className="tutorial-cell-hint"
          style={{
            left: `${hint.left + 2}px`,
            top: `${hint.top + 2}px`,
            width: `${hint.width - 4}px`,
            height: `${hint.height - 4}px`,
          }}
          aria-hidden="true"
        />
      ))}

      <aside
        ref={cardRef}
        className="tutorial-coach-popup"
        data-coach-step={step}
        style={{ left: `${layout.popPos.left}px`, top: `${layout.popPos.top}px` }}
        aria-label={`Battle coach step ${step + 1} of ${steps.length}`}
      >
        <header className="coach-head">
          <span className="coach-kicker">GUIDE {step + 1} / {steps.length}</span>
          <button type="button" className="coach-close" onClick={onFinish} aria-label="Finish tutorial">
            <X size={14} />
          </button>
        </header>
        <h3>{active.title}</h3>
        <p>{active.body}</p>
        <div className="coach-checks">
          {active.checks.map(chk => (
            <span key={chk.label} className={`coach-check ${chk.done ? 'done' : ''}`}>
              <Check size={11} />
              <span>{chk.label}</span>
            </span>
          ))}
        </div>
        <footer className="coach-foot">
          <button
            type="button"
            className="coach-btn"
            disabled={step === 0}
            onClick={() => setStep(s => Math.max(0, s - 1))}
          >
            <ChevronLeft size={13} /> BACK
          </button>
          {step < steps.length - 1 ? (
            <button
              type="button"
              className="coach-btn primary"
              onClick={() => setStep(s => Math.min(steps.length - 1, s + 1))}
            >
              NEXT <ChevronRight size={13} />
            </button>
          ) : (
            <button type="button" className="coach-btn primary" onClick={onFinish}>
              DONE <Check size={13} />
            </button>
          )}
        </footer>
      </aside>
    </div>
  )
}
