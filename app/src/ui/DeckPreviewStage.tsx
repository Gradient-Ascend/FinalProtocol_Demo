import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { MONO } from '@/cinematic/display'
import { AttackFx, effectTiming } from '@/game/attack-fx'
import { inAttackRange } from '@/game/attack-methods'
import type { AttackEffect, CoreBuff, Coord, FlagKind } from '@/game/battle-types'
import type { Frame, Skill } from '@/game/skills'
import { slotLabel } from '@/game/skills'
import type { Tuning } from '@/game/tuning'

export type DeckPreviewSpec =
  | { kind: 'attack'; skill: Skill; frame: Frame; level: number; onLevelChange: (level: number) => void }
  | { kind: 'privilege'; privilegePerFlag: number }
  | { kind: 'core'; buff: CoreBuff; tuning: Tuning }

const ROMAN = ['I', 'II', 'III', 'IV']

const C = {
  bg: '#090909',
  cell: '#0D0D0D',
  grid: '#343434',
  wall: '#272727',
  white: '#F4F4F4',
  light: '#D8D8D8',
  muted: '#777777',
  faint: '#484848',
  blue: '#79BFFF',
  red: '#FF7070',
}

type SimEnemy = {
  id: string
  pos: Coord
  sec: number
  tags: string[]
  route?: Coord[]
  routeFlag?: { pos: Coord; kind: FlagKind }
}

type AttackScenario = {
  origin: Coord
  walls: Coord[]
  enemies: SimEnemy[]
  onStrike?: (enemies: SimEnemy[], fx: AttackEffect) => void
  effects: AttackEffect[]
}

function buildAttackScenario(skill: Skill, frame: Frame, level: number): AttackScenario {
  const origin: Coord = { x: 7, y: 7 }
  const isCross = frame.shape === 'cross'
  const amt = skill.amounts[level]
  const pierce = skill.pierce?.[level]
  const presetId = isCross ? 'deck-1' : 'deck-0'

  const baseFx = (target: Coord, dealt: number, extra: Partial<AttackEffect> = {}): AttackEffect => ({
    source: 'player',
    presetId,
    origin,
    target,
    stepIndex: level,
    shape: frame.shape,
    range: frame.range,
    fx: skill.fx,
    amount: dealt,
    dealt,
    pierce,
    slotAmount: amt,
    ...extra,
  })

  switch (skill.id) {
    case 'base': {
      const target = isCross ? { x: 9, y: 7 } : { x: 8, y: 6 }
      const dest = isCross ? { x: 10, y: 7 } : { x: 9, y: 6 }
      return {
        origin,
        walls: [],
        enemies: [{ id: 'E01', pos: { ...target }, sec: 0, tags: [] }],
        effects: [baseFx(target, amt, { events: ['PUSH'], movedTo: dest })],
        onStrike: enemies => {
          enemies[0].pos = { ...dest }
          enemies[0].tags = ['SHIFT']
        },
      }
    }
    case 'on': {
      const target = isCross ? { x: 10, y: 7 } : { x: 8, y: 7 }
      const dealt = Math.max(0, amt - 1)
      return {
        origin,
        walls: [],
        enemies: [{ id: 'E01', pos: { ...target }, sec: 1, tags: [] }],
        effects: [baseFx(target, dealt, { absorbed: 1, securityBefore: 1, events: dealt > 0 ? ['LIVE'] : [] })],
        onStrike: enemies => {
          enemies[0].sec = 0
          if (dealt > 0) enemies[0].tags = ['LIVE']
        },
      }
    }
    case 'spike': {
      const target = isCross ? { x: 10, y: 7 } : { x: 9, y: 7 }
      const wall = isCross ? { x: 11, y: 7 } : { x: 10, y: 7 }
      return {
        origin,
        walls: [wall],
        enemies: [{ id: 'E01', pos: { ...target }, sec: 0, tags: [] }],
        effects: [baseFx(target, amt + 2, { events: ['PINNED'] })],
      }
    }
    case 'manhattan': {
      const target = isCross ? { x: 11, y: 7 } : { x: 9, y: 5 }
      const dist = Math.abs(target.x - origin.x) + Math.abs(target.y - origin.y)
      return {
        origin,
        walls: [],
        enemies: [{ id: 'E01', pos: { ...target }, sec: 0, tags: [] }],
        effects: [baseFx(target, Math.max(0, dist + amt))],
      }
    }
    case 'off': {
      const target = isCross ? { x: 10, y: 7 } : { x: 8, y: 7 }
      return {
        origin,
        walls: [],
        enemies: [{ id: 'E01', pos: { ...target }, sec: 0, tags: ['LIVE'] }],
        effects: [baseFx(target, amt, { cap: amt, events: ['DROP'] })],
        onStrike: enemies => {
          enemies[0].tags = ['DROP']
        },
      }
    }
    case 'array': {
      const t1 = isCross ? { x: 10, y: 7 } : { x: 9, y: 6 }
      const d1 = isCross ? { x: 9, y: 7 } : { x: 8, y: 6 }
      const t2 = isCross ? { x: 7, y: 4 } : { x: 6, y: 9 }
      const d2 = isCross ? { x: 7, y: 5 } : { x: 6, y: 8 }
      return {
        origin,
        walls: [],
        enemies: [
          { id: 'E01', pos: { ...t1 }, sec: 0, tags: [] },
          { id: 'E02', pos: { ...t2 }, sec: 0, tags: [] },
        ],
        effects: [
          baseFx(t1, amt, { events: ['PULL'], movedTo: d1 }),
          baseFx(t2, amt, { events: ['PULL'], movedTo: d2 }),
        ],
        onStrike: (enemies, fx) => {
          const hitIdx = fx.target.x === t1.x && fx.target.y === t1.y ? 0 : 1
          enemies[hitIdx].pos = hitIdx === 0 ? { ...d1 } : { ...d2 }
          enemies[hitIdx].tags = ['SHIFT']
        },
      }
    }
    case 'high': {
      const pts = isCross
        ? [{ x: 9, y: 7 }, { x: 7, y: 4 }, { x: 4, y: 7 }]
        : [{ x: 8, y: 6 }, { x: 6, y: 6 }, { x: 7, y: 9 }]
      return {
        origin,
        walls: [],
        enemies: pts.map((pos, idx) => ({ id: `E0${idx + 1}`, pos: { ...pos }, sec: 0, tags: [] })),
        effects: pts.map(pos => baseFx(pos, amt + 2, { events: ['SPREAD'] })),
      }
    }
    case 'flood': {
      const t1 = isCross ? { x: 9, y: 7 } : { x: 8, y: 6 }
      const f1 = isCross ? { x: 9, y: 6 } : { x: 9, y: 5 }
      const t2 = isCross ? { x: 7, y: 10 } : { x: 6, y: 8 }
      const f2 = isCross ? { x: 6, y: 10 } : { x: 5, y: 8 }
      const pVal = pierce ?? 1
      const absorbed = Math.max(0, 1 - pVal)
      const dealt = Math.max(0, amt - absorbed)
      return {
        origin,
        walls: [],
        enemies: [
          { id: 'E01', pos: { ...t1 }, sec: 1, tags: [], route: [f1], routeFlag: { pos: f1, kind: 'bash' } },
          { id: 'E02', pos: { ...t2 }, sec: 0, tags: [], route: [f2], routeFlag: { pos: f2, kind: 'core' } },
        ],
        effects: [
          baseFx(t1, dealt, { absorbed, securityBefore: 1, blank: f1, events: ['FILL'] }),
          baseFx(t2, amt, { blank: f2, events: ['FILL'] }),
        ],
        onStrike: (enemies, fx) => {
          const idx = fx.target.x === t1.x && fx.target.y === t1.y ? 0 : 1
          if (enemies[idx].routeFlag) enemies[idx].routeFlag = { ...enemies[idx].routeFlag!, kind: 'blank' }
          if (idx === 0) enemies[0].sec = Math.max(0, enemies[0].sec - absorbed)
        },
      }
    }
    case 'manifold': {
      const target = isCross ? { x: 10, y: 7 } : { x: 9, y: 6 }
      return {
        origin,
        walls: [],
        enemies: [{ id: 'E01', pos: { ...target }, sec: 2, tags: [] }],
        effects: [baseFx(target, amt, { absorbed: 0, securityBefore: 2, events: ['BREACH'] })],
        onStrike: enemies => {
          enemies[0].sec = 0
          enemies[0].tags = ['BREACH']
        },
      }
    }
    case 'ultra': {
      const target = isCross ? { x: 10, y: 7 } : { x: 8, y: 6 }
      const secBefore = 2
      const pVal = pierce ?? 0
      const raw = amt + 2 + 1 // +2 from LIVE+BREACH tags, +1 from BREACH bonus
      const absorbed = Math.min(Math.max(0, secBefore - pVal), raw)
      const dealt = raw - absorbed
      return {
        origin,
        walls: [],
        enemies: [{ id: 'E01', pos: { ...target }, sec: secBefore, tags: ['LIVE', 'BREACH'] }],
        effects: [
          baseFx(target, dealt, {
            absorbed,
            securityBefore: secBefore,
            readTags: ['LIVE', 'BREACH'],
            events: ['RAIL +2'],
          }),
        ],
        onStrike: enemies => {
          enemies[0].sec = Math.max(0, enemies[0].sec - absorbed)
        },
      }
    }
    case 'probe': {
      const target = isCross ? { x: 11, y: 7 } : { x: 9, y: 7 }
      return {
        origin,
        walls: [],
        enemies: [{ id: 'E01', pos: { ...target }, sec: 4, tags: [] }],
        effects: [baseFx(target, amt, { absorbed: 0, securityBefore: 4, events: ['LIVE'] })],
        onStrike: enemies => {
          enemies[0].tags = ['LIVE']
        },
      }
    }
  }
}

function drawPreviewFlag(ctx: CanvasRenderingContext2D, center: Coord, cell: number, kind: FlagKind): void {
  const s = cell * 0.36
  ctx.strokeStyle = kind === 'blank' ? C.muted : C.white
  ctx.fillStyle = kind === 'blank' ? C.muted : C.white
  ctx.lineWidth = Math.max(1.2, cell * 0.045)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const { x, y } = center
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

function drawPreviewPlayer(ctx: CanvasRenderingContext2D, center: Coord, cell: number, timeMs: number, inAction: boolean): void {
  const { x, y } = center
  if (inAction) {
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
  const breath = 0.5 + Math.sin(timeMs / 420) * 0.5
  const r = cell * (0.1 + breath * 0.025)
  ctx.globalAlpha = 0.7 + breath * 0.3
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

function drawPreviewEnemy(ctx: CanvasRenderingContext2D, center: Coord, cell: number, enemy: SimEnemy): void {
  const { x, y } = center
  const r = cell * 0.33
  ctx.strokeStyle = C.light
  ctx.lineWidth = 1.6
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 6 + (i * Math.PI) / 3
    const px = x + Math.cos(angle) * r
    const py = y + Math.sin(angle) * r
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

  const fontSize = Math.max(8, Math.round(cell * 0.24))
  ctx.font = `600 ${fontSize}px ${MONO}`
  ctx.fillStyle = C.light
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(enemy.id, x - r, y - r - fontSize - 1)

  if (enemy.sec > 0 || enemy.tags.length > 0) {
    const badge = enemy.sec > 0 ? `SEC ${enemy.sec}${enemy.tags.length ? ` · ${enemy.tags.join(' ')}` : ''}` : enemy.tags.join(' · ')
    ctx.font = `600 ${Math.max(7, Math.round(cell * 0.2))}px ${MONO}`
    const tw = Math.ceil(ctx.measureText(badge).width) + 6
    const bx = Math.round(x - tw / 2)
    const by = Math.round(y + r + 3)
    ctx.fillStyle = 'rgba(9,9,9,0.9)'
    ctx.fillRect(bx, by, tw, Math.max(10, Math.round(cell * 0.26)))
    ctx.strokeStyle = enemy.sec > 0 ? 'rgba(121,191,255,0.65)' : 'rgba(244,244,244,0.65)'
    ctx.lineWidth = 1
    ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, Math.max(9, Math.round(cell * 0.26) - 1))
    ctx.fillStyle = enemy.sec > 0 ? '#b7dcff' : C.white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(badge, x, by + Math.max(5, Math.round(cell * 0.13)))
  }
}

/** Procedural live animation stage for Attack levels (I–IV), Privilege settlement, and Core mid-move triggers. */
export function DeckPreviewStage({ spec, reducedMotion }: { spec: DeckPreviewSpec; reducedMotion: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef<AttackFx | null>(null)
  const specRef = useRef(spec)
  specRef.current = spec

  const [autoCycle, setAutoCycle] = useState(true)
  const [holdUntil, setHoldUntil] = useState(0)
  const [replayNonce, setReplayNonce] = useState(0)
  const [hudStatus, setHudStatus] = useState<string>('')

  const attackKey = spec.kind === 'attack'
    ? `atk:${spec.skill.id}:${spec.frame.id}:${spec.level}:${replayNonce}`
    : spec.kind === 'privilege'
    ? `priv:${spec.privilegePerFlag}:${replayNonce}`
    : `core:${spec.buff.id}:${spec.buff.threshold}:${spec.tuning.repairHeal}:${spec.tuning.firewallPrivilege}:${replayNonce}`

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const fx = new AttackFx({ recordMemory: false })
    fx.attachOverlay(wrap, { webgl: true })
    fxRef.current = fx
    return () => {
      fx.dispose()
      fxRef.current = null
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let fx = fxRef.current
    if (!fx) {
      fx = new AttackFx({ recordMemory: false })
      fx.attachOverlay(wrap, { webgl: true })
      fxRef.current = fx
    }
    fx.clear()

    const current = specRef.current
    const isCotAttack = current.kind === 'attack' && current.frame.shape === 'cross'
    const cropCells = isCotAttack ? 11 : 7
    const cropMin = isCotAttack ? 2 : 4

    let scenario: AttackScenario | null = null
    let fired = false
    let strikeFired = false
    let strikeTimer: number | null = null
    let alive = true
    let cycleStart = performance.now()
    const attackLoopMs = reducedMotion ? 1600 : 2350
    const resourceLoopMs = reducedMotion ? 1800 : 2850

    let privStep = 0
    let privSettled = false
    let coreStep = 0
    let coreTriggered = false

    const resetScenario = (now: number) => {
      if (strikeTimer !== null) {
        window.clearTimeout(strikeTimer)
        strikeTimer = null
      }
      cycleStart = now
      fx!.clear()
      fired = false
      strikeFired = false
      privStep = 0
      privSettled = false
      coreStep = 0
      coreTriggered = false
      if (current.kind === 'attack') {
        scenario = buildAttackScenario(current.skill, current.frame, current.level)
        setHudStatus(slotLabel(current.skill, current.level))
      } else if (current.kind === 'privilege') {
        setHudStatus(`PRIV 0 / +${current.privilegePerFlag * 2} AT END`)
      } else {
        setHudStatus(`${current.buff.counter}/${current.buff.threshold} → +1 STEP`)
      }
    }

    resetScenario(performance.now())

    let raf = 0

    const draw = (now: number) => {
      if (!alive) return
      const rect = wrap.getBoundingClientRect()
      const cssW = Math.max(180, Math.round(rect.width))
      const cssH = Math.max(140, Math.round(rect.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr)
        canvas.height = Math.round(cssH * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const cell = Math.max(16, Math.floor(Math.min((cssW - 22) / cropCells, (cssH - 18) / cropCells)))
      const gridPx = cell * cropCells
      const leftPx = Math.round((cssW - gridPx) / 2)
      const topPx = Math.round((cssH - gridPx) / 2)
      const origin = { x: leftPx - cropMin * cell, y: topPx - cropMin * cell }

      const elapsed = now - cycleStart

      if (current.kind === 'attack' && scenario) {
        if (elapsed >= 220 && !fired) {
          fired = true
          const peers = current.skill.fx === 'high' ? scenario.enemies.map(e => ({ ...e.pos })) : undefined
          for (const eff of scenario.effects) {
            fx!.play(eff, reducedMotion, undefined, { peers })
          }
          const strikeMs = reducedMotion ? 120 : Math.max(120, ...scenario.effects.map(e => effectTiming(e).strike))
          strikeTimer = window.setTimeout(() => {
            if (!alive || strikeFired || !scenario) return
            strikeFired = true
            if (scenario.onStrike) {
              for (const eff of scenario.effects) scenario.onStrike(scenario.enemies, eff)
            }
          }, strikeMs)
        }
        if (elapsed >= attackLoopMs) {
          if (autoCycle && Date.now() >= holdUntil) {
            current.onLevelChange((current.level + 1) % 4)
          }
          resetScenario(now)
          return
        }
      } else if (current.kind === 'privilege') {
        if (elapsed >= 380 && privStep < 1) privStep = 1
        if (elapsed >= 760 && privStep < 2) privStep = 2
        if (elapsed >= 1120 && !privSettled) {
          privSettled = true
          const gained = current.privilegePerFlag * 2
          setHudStatus(`SETTLED: +${gained} PRIV`)
          fx!.playResourcePop(
            {
              kind: 'privilege',
              pos: { x: 7, y: 7 },
              text: `+${gained} PRIV`,
              subtext: 'SHELL',
              color: '#79bfff',
            },
            reducedMotion,
          )
        }
        if (elapsed >= resourceLoopMs) resetScenario(now)
      } else if (current.kind === 'core') {
        if (elapsed >= 440 && coreStep < 1) {
          coreStep = 1
          if (!coreTriggered) {
            coreTriggered = true
            setHudStatus(`${current.buff.name}: TRIGGERED!`)
            const popText = current.buff.id === 'repair'
              ? `REPAIR +${current.tuning.repairHeal}`
              : current.buff.id === 'focus'
              ? 'FOCUS → LIVE'
              : `FIREWALL +${current.tuning.firewallPrivilege}`
            const popColor = current.buff.id === 'repair' ? '#7ee787' : current.buff.id === 'focus' ? '#f2d16b' : '#79bfff'
            fx!.playResourcePop(
              {
                kind: current.buff.id,
                pos: { x: 7, y: 7 },
                text: popText,
                subtext: 'CORE',
                color: popColor,
              },
              reducedMotion,
            )
          }
        }
        if (elapsed >= 920 && coreStep < 2) coreStep = 2
        if (elapsed >= resourceLoopMs) resetScenario(now)
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

      const wallSet = new Set((scenario?.walls ?? []).map(w => `${w.x},${w.y}`))

      for (let y = cropMin; y < cropMin + cropCells; y++) {
        for (let x = cropMin; x < cropMin + cropCells; x++) {
          const warp = fx!.cellWarp(x, y)
          const size = cell * warp.scale
          const inset = (cell - size) * 0.5
          const px = origin.x + (x + warp.x) * cell + inset
          const py = origin.y + (y + warp.y) * cell + inset
          const isWall = wallSet.has(`${x},${y}`)
          ctx.fillStyle = isWall ? C.wall : C.cell
          ctx.fillRect(px, py, size, size)
          ctx.strokeStyle = C.grid
          ctx.lineWidth = 0.75
          ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1)
          if (isWall) {
            ctx.strokeStyle = C.faint
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(px + 6, py + size - 6)
            ctx.lineTo(px + size - 6, py + 6)
            ctx.stroke()
          } else if (current.kind === 'attack' && inAttackRange({ x: 7, y: 7 }, { x, y }, { name: '', amount: 0, area: 'all', shape: current.frame.shape, range: current.frame.range })) {
            ctx.fillStyle = isCotAttack ? 'rgba(94,230,255,0.12)' : 'rgba(242,209,107,0.13)'
            ctx.fillRect(px + 1, py + 1, size - 2, size - 2)
            ctx.strokeStyle = isCotAttack ? 'rgba(94,230,255,0.34)' : 'rgba(242,209,107,0.32)'
            ctx.lineWidth = 0.85
            ctx.strokeRect(px + 2, py + 2, size - 4, size - 4)
          }
        }
      }

      if (current.kind === 'attack' && scenario) {
        for (const enemy of scenario.enemies) {
          if (enemy.route?.length) {
            ctx.strokeStyle = C.muted
            ctx.lineWidth = 1.4
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            const startC = centerOf(enemy.pos)
            ctx.moveTo(startC.x, startC.y)
            for (const step of enemy.route) {
              const sc = centerOf(step)
              ctx.lineTo(sc.x, sc.y)
            }
            ctx.stroke()
            ctx.setLineDash([])
          }
          if (enemy.routeFlag) {
            drawPreviewFlag(ctx, centerOf(enemy.routeFlag.pos), cell, enemy.routeFlag.kind)
          }
          drawPreviewEnemy(ctx, centerOf(enemy.pos), cell, enemy)
        }
        drawPreviewPlayer(ctx, centerOf(scenario.origin), cell, now, true)
      } else if (current.kind === 'privilege') {
        const stops: Coord[] = [{ x: 6, y: 8 }, { x: 7, y: 8 }, { x: 7, y: 7 }]
        const playerPos = stops[privStep]
        ctx.strokeStyle = C.white
        ctx.lineWidth = 2
        ctx.beginPath()
        const s0 = centerOf(stops[0])
        ctx.moveTo(s0.x, s0.y)
        for (const pt of stops.slice(1)) {
          const c = centerOf(pt)
          ctx.lineTo(c.x, c.y)
        }
        ctx.stroke()

        if (privStep < 1) drawPreviewFlag(ctx, centerOf(stops[1]), cell, 'privilege')
        else drawPreviewFlag(ctx, centerOf(stops[1]), cell, 'blank')
        if (privStep < 2) drawPreviewFlag(ctx, centerOf(stops[2]), cell, 'privilege')
        else drawPreviewFlag(ctx, centerOf(stops[2]), cell, 'blank')

        drawPreviewPlayer(ctx, centerOf(playerPos), cell, now, privStep > 0 && !privSettled)
      } else if (current.kind === 'core') {
        const stops: Coord[] = [{ x: 6, y: 7 }, { x: 7, y: 7 }, { x: 8, y: 7 }]
        const playerPos = stops[coreStep]
        ctx.strokeStyle = C.white
        ctx.lineWidth = 2
        ctx.beginPath()
        const s0 = centerOf(stops[0])
        ctx.moveTo(s0.x, s0.y)
        for (const pt of stops.slice(1)) {
          const c = centerOf(pt)
          ctx.lineTo(c.x, c.y)
        }
        ctx.stroke()

        drawPreviewFlag(ctx, centerOf(stops[1]), cell, coreStep < 1 ? 'core' : 'blank')
        drawPreviewPlayer(ctx, centerOf(playerPos), cell, now, coreStep > 0 && elapsed < 1500)
      }

      ctx.restore()
      fx!.draw(ctx, { origin, cell, dpr }, shake)

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      alive = false
      if (strikeTimer !== null) window.clearTimeout(strikeTimer)
      cancelAnimationFrame(raf)
    }
  }, [attackKey, autoCycle, holdUntil, reducedMotion])

  const selectLevel = (idx: number) => {
    if (spec.kind !== 'attack') return
    setHoldUntil(Date.now() + 5200)
    spec.onLevelChange(idx)
    setReplayNonce(n => n + 1)
  }

  return (
    <div className="deck-preview-stage">
      <div className="deck-preview-hud">
        <span className="deck-preview-mode">
          {spec.kind === 'attack'
            ? `${spec.frame.name} · LV ${ROMAN[spec.level]}`
            : spec.kind === 'privilege'
            ? 'PRIVILEGE · SETTLEMENT'
            : `${spec.buff.name} · IN MOTION`}
        </span>
        <strong className="deck-preview-stat">{hudStatus}</strong>
      </div>
      <div className="deck-preview-canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} className="deck-preview-canvas" />
      </div>
      {spec.kind === 'attack' ? (
        <div className="deck-preview-controls">
          <div className="deck-level-dots" role="tablist" aria-label="Skill level preview">
            {ROMAN.map((numeral, idx) => (
              <button
                key={numeral}
                type="button"
                role="tab"
                aria-selected={spec.level === idx}
                aria-label={`Preview level ${numeral}`}
                className={`deck-level-dot ${spec.level === idx ? 'active' : ''}`}
                onClick={() => selectLevel(idx)}
              >
                <span className="dot-pip" />
                <em>{numeral}</em>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`deck-auto-btn ${autoCycle ? 'on' : ''}`}
            onClick={() => {
              setHoldUntil(0)
              setAutoCycle(v => !v)
            }}
            aria-label={autoCycle ? 'Pause level cycle' : 'Resume level cycle'}
          >
            {autoCycle ? <Pause size={11} /> : <Play size={11} />}
            <span>{autoCycle ? 'AUTO' : 'HOLD'}</span>
          </button>
        </div>
      ) : (
        <div className="deck-preview-controls is-single">
          <span className="deck-preview-loop-tag">
            {spec.kind === 'privilege'
              ? 'LIVE LOOP · SETTLES AFTER MOVEMENT'
              : 'LIVE LOOP · TRIGGERS MID-ROUTE'}
          </span>
        </div>
      )}
    </div>
  )
}
