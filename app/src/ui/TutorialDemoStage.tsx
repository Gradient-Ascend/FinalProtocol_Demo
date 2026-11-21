import { useEffect, useRef, useState } from 'react'
import { MONO } from '@/cinematic/display'
import { AttackFx, effectTiming } from '@/game/attack-fx'
import { inAttackRange } from '@/game/attack-methods'
import type { AttackEffect, Coord, FlagKind } from '@/game/battle-types'
import type { Tuning } from '@/game/tuning'

const C = {
  bg: '#090909',
  cell: '#0D0D0D',
  grid: '#343434',
  white: '#F4F4F4',
  light: '#D8D8D8',
  muted: '#777777',
  blue: '#79BFFF',
  red: '#FF7070',
}

function drawCellFlag(ctx: CanvasRenderingContext2D, center: Coord, cell: number, kind: FlagKind): void {
  const { x, y } = center
  const s = cell * 0.36
  ctx.strokeStyle = kind === 'blank' ? C.muted : C.white
  ctx.fillStyle = kind === 'blank' ? C.muted : C.white
  ctx.lineWidth = Math.max(1.2, cell * 0.045)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (kind === 'blank') {
    ctx.beginPath()
    ctx.arc(x, y, Math.max(1.4, cell * 0.045), 0, Math.PI * 2)
    ctx.fill()
    return
  }
  if (kind === 'bash') {
    ctx.font = `600 ${Math.max(9, s * 0.85)}px ${MONO}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('>_', x, y)
    return
  }
  if (kind === 'privilege') {
    ctx.beginPath()
    ctx.moveTo(x, y - s * 0.55)
    ctx.lineTo(x + s * 0.5, y - s * 0.35)
    ctx.lineTo(x + s * 0.42, y + s * 0.2)
    ctx.quadraticCurveTo(x + s * 0.22, y + s * 0.48, x, y + s * 0.55)
    ctx.quadraticCurveTo(x - s * 0.22, y + s * 0.48, x - s * 0.42, y + s * 0.2)
    ctx.lineTo(x - s * 0.5, y - s * 0.35)
    ctx.closePath()
    ctx.stroke()
    return
  }
  if (kind === 'core') {
    ctx.strokeRect(x - s * 0.42, y - s * 0.42, s * 0.84, s * 0.84)
    ctx.beginPath()
    ctx.arc(x, y, s * 0.1, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, center: Coord, cell: number, now: number, bracketed: boolean): void {
  const { x, y } = center
  if (bracketed) {
    const s = cell * 0.64
    const l = s * 0.25
    ctx.strokeStyle = C.white
    ctx.lineWidth = 1.6
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = x + sx * s * 0.5
      const cy = y + sy * s * 0.5
      ctx.beginPath()
      ctx.moveTo(cx - sx * l, cy)
      ctx.lineTo(cx, cy)
      ctx.lineTo(cx, cy - sy * l)
      ctx.stroke()
    }
    ctx.fillStyle = C.white
    ctx.beginPath()
    ctx.moveTo(x, y - s * 0.15)
    ctx.lineTo(x + s * 0.15, y)
    ctx.lineTo(x, y + s * 0.15)
    ctx.lineTo(x - s * 0.15, y)
    ctx.closePath()
    ctx.fill()
  }
  const breath = 0.5 + Math.sin(now / 420) * 0.5
  const r = cell * (0.1 + breath * 0.025)
  ctx.globalAlpha = 0.72 + breath * 0.28
  ctx.fillStyle = C.blue
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 0.18 + breath * 0.12
  ctx.beginPath()
  ctx.arc(x, y, r + cell * 0.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
}

function drawEnemy(ctx: CanvasRenderingContext2D, center: Coord, cell: number, id: string, badgeText?: string, badgeBlue = false): void {
  const { x, y } = center
  const r = cell * 0.33
  ctx.strokeStyle = C.light
  ctx.lineWidth = 1.6
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3
    const px = x + Math.cos(a) * r
    const py = y + Math.sin(a) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = 'rgba(9,9,9,0.75)'
  ctx.fill()
  ctx.stroke()

  ctx.strokeStyle = C.red
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x - r * 0.34, y - r * 0.34)
  ctx.lineTo(x + r * 0.34, y + r * 0.34)
  ctx.stroke()

  const fz = Math.max(8, Math.round(cell * 0.24))
  ctx.font = `600 ${fz}px ${MONO}`
  ctx.fillStyle = C.light
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(id, x - r, y - r - fz - 1)

  if (badgeText) {
    ctx.font = `600 ${Math.max(7, Math.round(cell * 0.2))}px ${MONO}`
    const tw = Math.ceil(ctx.measureText(badgeText).width) + 6
    const h = Math.max(10, Math.round(cell * 0.26))
    const bx = Math.round(x - tw / 2)
    const by = Math.round(y + r + 3)
    ctx.fillStyle = 'rgba(9,9,9,0.92)'
    ctx.fillRect(bx, by, tw, h)
    ctx.strokeStyle = badgeBlue ? 'rgba(121,191,255,0.65)' : 'rgba(244,244,244,0.65)'
    ctx.lineWidth = 1
    ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, h - 1)
    ctx.fillStyle = badgeBlue ? '#b7dcff' : C.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(badgeText, x, by + h / 2)
  }
}

/** Slide 0: Live animated Sanity / Robustness HP bar visual demonstration. */
function HealthBarsDemo({ reducedMotion }: { reducedMotion: boolean }) {
  const [phase, setPhase] = useState<'preview' | 'strike' | 'settled'>('preview')

  useEffect(() => {
    if (reducedMotion) {
      setPhase('preview')
      return
    }
    let idx = 0
    const phases: ('preview' | 'strike' | 'settled')[] = ['preview', 'strike', 'settled']
    const timer = window.setInterval(() => {
      idx = (idx + 1) % phases.length
      setPhase(phases[idx])
    }, 1500)
    return () => window.clearInterval(timer)
  }, [reducedMotion])

  const playerFill = phase === 'settled' ? 78 : phase === 'strike' ? 78 : 84
  const playerPreview = phase === 'preview' ? 14 : 0
  const enemyFill = phase === 'settled' ? 46 : phase === 'strike' ? 46 : 56
  const enemyPreview = phase === 'preview' ? 16 : 0

  return (
    <div className="tut-bars-demo">
      <div className="tut-bar-card">
        <div className="tut-bar-head">
          <span className="tut-bar-role is-player">OPERATOR // SANITY</span>
          <strong>
            {phase === 'settled' ? '28' : '32'}
            <small> / 36</small>
            {phase === 'preview' && <em className="tut-to-be"> → 28</em>}
          </strong>
        </div>
        <div className="tut-meter">
          <span className="tut-fill" style={{ width: `${playerFill}%` }} />
          {playerPreview > 0 && (
            <span className="tut-seg is-red" style={{ left: `${playerFill}%`, width: `${playerPreview}%` }} />
          )}
          {phase === 'strike' && (
            <span className="tut-seg is-block-peel" style={{ left: '84%', width: '8%' }} />
          )}
        </div>
        <div className="tut-bar-chips">
          <span className="tut-chip blue">PRIVILEGE 2</span>
          <span className="tut-chip">CARRIES ACROSS BATTLES</span>
        </div>
      </div>

      <div className="tut-bar-card">
        <div className="tut-bar-head">
          <span className="tut-bar-role is-enemy">HOSTILE // ROBUSTNESS</span>
          <strong>
            {phase === 'settled' ? '29' : '35'}
            <small> / 64</small>
            {phase === 'preview' && <em className="tut-to-be"> → 29</em>}
          </strong>
        </div>
        <div className="tut-meter">
          <span className="tut-fill" style={{ width: `${enemyFill}%` }} />
          {enemyPreview > 0 && (
            <span className="tut-seg is-amber" style={{ left: `${enemyFill}%`, width: `${enemyPreview}%` }} />
          )}
          <i className="tut-bd-tick" style={{ left: '50%' }} title="50% Breakdown" />
        </div>
        <div className="tut-bar-chips">
          <span className="tut-chip solid">LIVE</span>
          <span className="tut-chip solid">BREACH</span>
          <span className="tut-chip">BREAKDOWN AT 50%</span>
        </div>
      </div>
    </div>
  )
}

/** Procedural canvas animations for tutorial slides 1–4. */
export function TutorialDemoStage({
  slide,
  tuning,
  reducedMotion,
}: {
  slide: number
  tuning: Tuning
  reducedMotion: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef<AttackFx | null>(null)
  const [statusPill, setStatusPill] = useState('')
  const [counterTicks, setCounterTicks] = useState<{ repair: number; focus: number; firewall: number }>({
    repair: tuning.repairThreshold - 1,
    focus: tuning.focusThreshold - 1,
    firewall: tuning.firewallThreshold - 2,
  })
  const [overloadVal, setOverloadVal] = useState(tuning.overloadThreshold)

  useEffect(() => {
    if (slide === 0) return
    const wrap = wrapRef.current
    if (!wrap) return
    const fx = new AttackFx({ recordMemory: false })
    fx.attachOverlay(wrap, { webgl: true })
    fxRef.current = fx
    return () => {
      fx.dispose()
      fxRef.current = null
    }
  }, [slide === 0])

  useEffect(() => {
    if (slide === 0) return
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let fx = fxRef.current
    if (!fx) {
      fx = new AttackFx({ recordMemory: false })
      fx.attachOverlay(wrap, { webgl: true })
      fxRef.current = fx
    }

    let alive = true
    let raf = 0
    let timers: number[] = []
    let cycleStart = performance.now()
    const loopMs = reducedMotion ? 2200 : 3400

    let playerPos: Coord = { x: 7, y: 7 }
    let playerMoving = false
    let enemyPos: Coord = { x: 8, y: 5 }
    let enemyBadge = ''
    let enemyBadgeBlue = false
    let flags: Array<{ pos: Coord; kind: FlagKind }> = []
    let route: Coord[] = []
    let showPlayerRange = false
    let showEnemyRange = false
    let rangeOrigin: Coord = { x: 7, y: 6 }

    const clearTimers = () => {
      for (const t of timers) window.clearTimeout(t)
      timers = []
    }

    const schedule = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(() => { if (alive) fn() }, reducedMotion ? Math.min(ms, 240) : ms))
    }

    const setupSlide = (now: number) => {
      clearTimers()
      fx!.clear()
      cycleStart = now
      showPlayerRange = false
      showEnemyRange = false
      enemyBadge = ''
      enemyBadgeBlue = false

      if (slide === 1) {
        // BASH / DESIRE
        playerPos = { x: 7, y: 8 }
        playerMoving = false
        enemyPos = { x: 8, y: 5 }
        route = [{ x: 7, y: 8 }, { x: 7, y: 7 }, { x: 7, y: 6 }]
        flags = [{ pos: { x: 7, y: 7 }, kind: 'bash' }, { pos: { x: 7, y: 6 }, kind: 'bash' }]
        setStatusPill('PLANNING: 2 BASH FLAGS')

        schedule(380, () => {
          playerPos = { x: 7, y: 7 }
          playerMoving = true
          flags[0].kind = 'blank'
        })
        schedule(700, () => {
          playerPos = { x: 7, y: 6 }
          flags[1].kind = 'blank'
          rangeOrigin = { x: 7, y: 6 }
          showPlayerRange = true
          setStatusPill('BASH RELEASE: LV I → LV II')
        })
        schedule(980, () => {
          const eff1: AttackEffect = {
            source: 'player', presetId: 'deck-0', origin: { x: 7, y: 6 }, target: { x: 8, y: 5 },
            stepIndex: 0, shape: 'square', range: 2, fx: 'base', amount: 1, dealt: 1,
            events: ['PUSH'], movedTo: { x: 9, y: 5 },
          }
          fx!.play(eff1, reducedMotion)
          schedule(effectTiming(eff1).strike, () => {
            enemyPos = { x: 9, y: 5 }
            enemyBadge = 'SHIFT'
          })
        })
        schedule(1650, () => {
          const eff2: AttackEffect = {
            source: 'player', presetId: 'deck-0', origin: { x: 7, y: 6 }, target: { x: 9, y: 5 },
            stepIndex: 1, shape: 'square', range: 2, fx: 'manhattan', amount: 3, dealt: 3,
          }
          fx!.play(eff2, reducedMotion)
        })
        schedule(2280, () => {
          showPlayerRange = false
          showEnemyRange = true
          setStatusPill('ENEMY DESIRE INCOMING')
          fx!.play({
            source: 'enemy', presetId: 'B01', origin: { ...enemyPos }, target: { x: 7, y: 6 },
            stepIndex: 0, shape: 'square', range: 4, amount: 3, dealt: 3,
          }, reducedMotion)
        })
      } else if (slide === 2) {
        // PRIVILEGE / SECURITY
        playerPos = { x: 6, y: 8 }
        playerMoving = false
        enemyPos = { x: 9, y: 5 }
        enemyBadge = 'SEC 2'
        enemyBadgeBlue = true
        route = [{ x: 6, y: 8 }, { x: 7, y: 8 }, { x: 7, y: 7 }]
        flags = [{ pos: { x: 7, y: 8 }, kind: 'privilege' }, { pos: { x: 7, y: 7 }, kind: 'privilege' }]
        setStatusPill('PRIVILEGE 0 · COLLECTING')

        schedule(360, () => {
          playerPos = { x: 7, y: 8 }
          playerMoving = true
          flags[0].kind = 'blank'
        })
        schedule(680, () => {
          playerPos = { x: 7, y: 7 }
          flags[1].kind = 'blank'
        })
        schedule(980, () => {
          const priv = tuning.privilegePerFlag * 2
          setStatusPill(`SETTLEMENT: +${priv} PRIVILEGE`)
          fx!.playResourcePop({
            kind: 'privilege', pos: { x: 7, y: 7 }, text: `+${priv} PRIV`, subtext: 'SHELL', color: '#79bfff',
          }, reducedMotion)
        })
        schedule(1720, () => {
          playerMoving = false
          setStatusPill('FULL BLOCK → TARGET LIVE!')
          const incoming: AttackEffect = {
            source: 'enemy', presetId: 'B01', origin: { ...enemyPos }, target: { x: 7, y: 7 },
            stepIndex: 0, shape: 'square', range: 4, amount: 3, dealt: 0, absorbed: 3,
          }
          fx!.play(incoming, reducedMotion)
          schedule(effectTiming(incoming).strike, () => {
            enemyBadge = 'LIVE'
            enemyBadgeBlue = false
          })
        })
      } else if (slide === 3) {
        // CORE / SOUL
        playerPos = { x: 6, y: 7 }
        playerMoving = false
        enemyPos = { x: 9, y: 5 }
        route = [{ x: 6, y: 7 }, { x: 7, y: 7 }, { x: 8, y: 7 }]
        flags = [{ pos: { x: 7, y: 7 }, kind: 'core' }]
        setCounterTicks({
          repair: tuning.repairThreshold - 1,
          focus: tuning.focusThreshold - 1,
          firewall: tuning.firewallThreshold - 2,
        })
        setStatusPill('CORE COUNTERS ADVANCE TOGETHER')

        schedule(460, () => {
          playerPos = { x: 7, y: 7 }
          playerMoving = true
          flags[0].kind = 'blank'
          setCounterTicks({
            repair: tuning.repairThreshold,
            focus: tuning.focusThreshold,
            firewall: tuning.firewallThreshold - 1,
          })
          setStatusPill('COUNTERS TRIGGERED MID-ROUTE!')
          fx!.playResourcePop({
            kind: 'repair', pos: { x: 7, y: 7 }, text: `REPAIR +${tuning.repairHeal}`, subtext: 'CORE', color: '#7ee787', slotOffset: 0,
          }, reducedMotion)
          fx!.playResourcePop({
            kind: 'focus', pos: { x: 7, y: 7 }, text: 'FOCUS → LIVE', subtext: 'CORE', color: '#f2d16b', slotOffset: 1,
          }, reducedMotion)
        })
        schedule(1060, () => {
          playerPos = { x: 8, y: 7 }
        })
      } else if (slide === 4) {
        // OVERLOAD
        playerPos = { x: 7, y: 7 }
        playerMoving = true
        enemyPos = { x: 7, y: 4 }
        route = []
        flags = []
        setOverloadVal(tuning.overloadThreshold)
        setStatusPill(`OVERLOAD ${tuning.overloadThreshold}/${tuning.overloadThreshold} READY`)

        schedule(420, () => {
          setOverloadVal(0)
          setStatusPill('SWITCH VECTOR → CoT · ALL 4 METHODS')
          const ov: AttackEffect = {
            source: 'player', presetId: 'deck-1', origin: { x: 7, y: 7 }, target: { x: 7, y: 4 },
            stepIndex: 0, shape: 'cross', range: 5, fx: 'overload', overload: true, amount: 11, dealt: 11,
            events: ['DROP', 'LIVE'],
            overloadSteps: [
              { fx: 'off', stepIndex: 0, amount: 3, dealt: 3, events: ['DROP'] },
              { fx: 'on', stepIndex: 1, amount: 2, dealt: 2, events: ['LIVE'] },
              { fx: 'high', stepIndex: 2, amount: 3, dealt: 3 },
              { fx: 'ultra', stepIndex: 3, amount: 3, dealt: 3 },
            ],
          }
          fx!.play(ov, reducedMotion)
          schedule(940, () => {
            enemyBadge = 'LIVE · DROP'
          })
        })
      }
    }

    setupSlide(performance.now())

    const draw = (now: number) => {
      if (!alive) return
      const rect = wrap.getBoundingClientRect()
      const cssW = Math.max(200, Math.round(rect.width))
      const cssH = Math.max(150, Math.round(rect.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr)
        canvas.height = Math.round(cssH * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const cropCells = 7
      const cropMin = 4
      const cell = Math.max(18, Math.floor(Math.min((cssW - 24) / cropCells, (cssH - 16) / cropCells)))
      const gridPx = cell * cropCells
      const leftPx = Math.round((cssW - gridPx) / 2)
      const topPx = Math.round((cssH - gridPx) / 2)
      const origin = { x: leftPx - cropMin * cell, y: topPx - cropMin * cell }

      if (now - cycleStart >= loopMs) {
        setupSlide(now)
      }

      fx!.step(now)

      ctx.clearRect(0, 0, cssW, cssH)
      ctx.fillStyle = C.bg
      ctx.fillRect(0, 0, cssW, cssH)

      const shake = reducedMotion ? { x: 0, y: 0 } : fx!.shakeOffset()
      ctx.save()
      ctx.beginPath()
      ctx.rect(leftPx - 2, topPx - 2, gridPx + 4, gridPx + 4)
      ctx.clip()
      ctx.translate(shake.x, shake.y)

      const centerOf = (pos: Coord): Coord => {
        const off = fx!.cellOffset(pos.x, pos.y)
        return { x: origin.x + (pos.x + 0.5 + off.x) * cell, y: origin.y + (pos.y + 0.5 + off.y) * cell }
      }

      for (let y = cropMin; y < cropMin + cropCells; y++) {
        for (let x = cropMin; x < cropMin + cropCells; x++) {
          const warp = fx!.cellWarp(x, y)
          const size = cell * warp.scale
          const inset = (cell - size) * 0.5
          const px = origin.x + (x + warp.x) * cell + inset
          const py = origin.y + (y + warp.y) * cell + inset
          ctx.fillStyle = C.cell
          ctx.fillRect(px, py, size, size)
          ctx.strokeStyle = C.grid
          ctx.lineWidth = 0.75
          ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1)

          if (showPlayerRange && inAttackRange(rangeOrigin, { x, y }, { name: '', amount: 0, area: 'all', shape: 'square', range: 2 })) {
            ctx.fillStyle = 'rgba(242,209,107,0.14)'
            ctx.fillRect(px + 1, py + 1, size - 2, size - 2)
            ctx.strokeStyle = 'rgba(242,209,107,0.34)'
            ctx.strokeRect(px + 2, py + 2, size - 4, size - 4)
          }
          if (showEnemyRange && inAttackRange(enemyPos, { x, y }, { name: '', amount: 0, area: 'all', shape: 'square', range: 3 })) {
            ctx.fillStyle = 'rgba(255,112,112,0.11)'
            ctx.fillRect(px + 1, py + 1, size - 2, size - 2)
            ctx.strokeStyle = 'rgba(255,112,112,0.42)'
            ctx.strokeRect(px + 2, py + 2, size - 4, size - 4)
          }
        }
      }

      if (route.length > 1) {
        ctx.strokeStyle = C.white
        ctx.lineWidth = 2
        ctx.beginPath()
        const c0 = centerOf(route[0])
        ctx.moveTo(c0.x, c0.y)
        for (const p of route.slice(1)) {
          const c = centerOf(p)
          ctx.lineTo(c.x, c.y)
        }
        ctx.stroke()
      }

      for (const fl of flags) drawCellFlag(ctx, centerOf(fl.pos), cell, fl.kind)
      drawEnemy(ctx, centerOf(enemyPos), cell, 'B01', enemyBadge, enemyBadgeBlue)
      drawPlayer(ctx, centerOf(playerPos), cell, now, playerMoving)

      ctx.restore()
      fx!.draw(ctx, { origin, cell, dpr }, shake)
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      alive = false
      clearTimers()
      cancelAnimationFrame(raf)
    }
  }, [slide, tuning, reducedMotion])

  if (slide === 0) {
    return (
      <div className="tut-stage">
        <div className="tut-stage-head">
          <span>SYSTEM VITALS // SANITY &amp; ROBUSTNESS</span>
          <strong>LIVE PREVIEW</strong>
        </div>
        <HealthBarsDemo reducedMotion={reducedMotion} />
      </div>
    )
  }

  return (
    <div className="tut-stage">
      <div className="tut-stage-head">
        <span>
          {slide === 1
            ? 'BASH / DESIRE'
            : slide === 2
            ? 'PRIVILEGE / SECURITY'
            : slide === 3
            ? 'CORE / SOUL'
            : 'OVERLOAD'}
        </span>
        <strong>{statusPill}</strong>
      </div>
      <div className="tut-canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} className="tut-canvas" />
      </div>
      {slide === 3 && (
        <div className="tut-core-strip">
          <span className={counterTicks.repair >= tuning.repairThreshold ? 'firing' : ''}>
            REPAIR {Math.min(counterTicks.repair, tuning.repairThreshold)}/{tuning.repairThreshold}
            {counterTicks.repair >= tuning.repairThreshold && <em> FIRE</em>}
          </span>
          <span className={counterTicks.focus >= tuning.focusThreshold ? 'firing' : ''}>
            FOCUS {Math.min(counterTicks.focus, tuning.focusThreshold)}/{tuning.focusThreshold}
            {counterTicks.focus >= tuning.focusThreshold && <em> FIRE</em>}
          </span>
          <span>
            FIREWALL {counterTicks.firewall}/{tuning.firewallThreshold}
          </span>
        </div>
      )}
      {slide === 4 && (
        <div className="tut-ovl-strip">
          <span>OVERLOAD CHARGE</span>
          <div className="tut-ovl-pips">
            {Array.from({ length: tuning.overloadThreshold }, (_, i) => (
              <i key={i} className={i < overloadVal ? 'on' : ''} />
            ))}
          </div>
          <strong>{overloadVal}/{tuning.overloadThreshold}</strong>
        </div>
      )}
    </div>
  )
}
