import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowRight, BookOpen, Check, ChevronRight, Circle, Cpu, Gauge,
  Home as HomeIcon, Maximize2, Minimize2, Play, RotateCcw, Settings, Shield, ShieldAlert, SquareTerminal,
  Zap,
} from 'lucide-react'
import { useCampaign } from '@/hooks/useCampaign'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useSuspension } from '@/hooks/useSuspension'
import { hoverEnemyOnMap, startGame, stopGame, zoomMap } from '@/game/boot'
import { battleStore } from '@/game/battle-store'
import { MAX_ACTIONS } from '@/game/battle-config'
import { mechanicText, predictedSequence, rangeText, releaseCount, riderText } from '@/game/attack-methods'
import { predictedEnemyIntent, predictedEnemyResources, predictedEnemySequence, predictedPlayerResources } from '@/game/enemy-attack-methods'
import { disclosed } from '@/game/mechanics'
import { VFX_QUALITY_MODES, vfxQualityDescription, vfxQualityStore } from '@/game/vfx-quality'
import type { Coord, EnemyMarks, FlagKind } from '@/game/battle-types'
import { Transcript } from '@/story/Transcript'
import { VoiceLine } from '@/story/VoiceLine'
import { BattleTicker } from '@/ui/BattleTicker'
import { EnemyDossierPopup } from '@/ui/EnemyDossierPopup'
import type { DossierAnchorRect } from '@/ui/EnemyDossierPopup'
import { Manual } from '@/ui/Manual'
import { Modal } from '@/ui/Modal'
import { ProgressSaver } from '@/ui/ProgressSaver'
import { ProtocolPanel } from '@/ui/ProtocolPanel'
import { Scenes } from '@/ui/Scenes'
import { TitleScreen } from '@/ui/TitleScreen'
import { ROMAN, WITHHELD, glitchName, heardSoFar, panelLine, routeAhead, segmentKeys, shown, stageBadgeText } from '@/ui/battle-text'
import { bootCampaign, campaignBattle, reportOutcome, returnToTitle } from '@/ui/flow'
import { layerHue, layerInk } from '@/ui/layers'
import { storyFeed } from '@/ui/story-feed'

const BLOCK_COLOR = '#f5f5f5'

function FlagIcon({ kind, size = 16 }: { kind: FlagKind; size?: number }) {
  if (kind === 'bash') return <SquareTerminal size={size} strokeWidth={1.7} />
  if (kind === 'privilege') return <Shield size={size} strokeWidth={1.7} />
  if (kind === 'core') return <Cpu size={size} strokeWidth={1.7} />
  if (kind === 'overload') return <Gauge size={size} strokeWidth={1.7} />
  return <Circle size={size * 0.45} strokeWidth={1.7} />
}

type HealthHit = {
  key: string
  amount: number
  className: string
  label: string
  active?: boolean
  // Its size is withheld: it is drawn as part of one unmeasured stretch.
  unknown?: boolean
  onPreview: () => void
}

// The bar shows raw damage only. `hits` are the hits still to land, in order;
// each is a segment hanging off the right end of the current HP, and the white
// fill is what would remain if all of them landed unblocked. Block and repair
// are shown beneath the bar and never reshape the segments. A hit whose size
// is withheld takes no measured place: such hits share one hatched stretch
// that fades out over what is left, so no width on the bar stands for them.
//
// When a hit lands the bar takes the blow: the fill snaps back at once, the
// bar rattles, the HP lost hangs for a beat in the attacker's colour and then
// shatters into fragments that fall away, while the remaining segments catch
// up late with a little overshoot. Restored HP draws motes up into the bar.
// Damage that block absorbed is never shown as HP coming back: that stretch
// turns into a hatched block strip that is peeled off, with chips deflected
// upward.
function HealthBar({ value, max, hits, live, label, className = '', lossColor, absorbed, onLeave }: {
  value: number
  max: number
  hits: HealthHit[]
  live: boolean
  label: string
  className?: string
  lossColor: string
  absorbed: number
  onLeave: () => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const debris = useRef<HTMLDivElement>(null)
  const previous = useRef(value)
  const ghostFrom = useRef<number | null>(null)
  const [ghostTop, setGhostTop] = useState<number | null>(null)
  const [grown, setGrown] = useState<{ from: number; to: number } | null>(null)
  const color = useRef(lossColor)
  color.current = lossColor
  useEffect(() => {
    const before = previous.current
    if (value === before) return
    previous.current = value
    const calm = !wrap.current || !debris.current || wrap.current.closest('.reduced-motion') !== null
    if (value < before) {
      const top = Math.max(ghostFrom.current ?? before, before)
      const lost = top - value
      ghostFrom.current = top
      setGhostTop(top)
      setGrown(null)
      if (!calm) {
        // A fast, decaying rattle: harder the more HP the hit took.
        const power = Math.min(7, 1.5 + lost * 0.8)
        wrap.current?.animate([0, -1, 0.8, -0.6, 0.45, -0.3, 0.15, 0].map((k, i) => ({
          transform: `translate(${k * power}px, ${i % 2 ? 1 : -1}px)`,
        })), { duration: 300, easing: 'linear' })
      }
      // The lost HP lags behind the hit, then breaks off.
      const timer = window.setTimeout(() => {
        ghostFrom.current = null
        setGhostTop(null)
        if (!calm) scatter(value, top, Math.min(26, Math.max(4, Math.round(lost * 3))), color.current, 'fall')
      }, calm ? 520 : 190)
      return () => window.clearTimeout(timer)
    }
    ghostFrom.current = null
    setGhostTop(null)
    setGrown({ from: before, to: value })
    if (!calm) scatter(before, value, Math.min(16, Math.max(4, Math.round((value - before) * 3))), 'var(--white)', 'rise')
    const timer = window.setTimeout(() => setGrown(null), 620)
    return () => window.clearTimeout(timer)
  }, [value, max])

  // Block absorbing a hit: the absorbed stretch sits just under the current HP.
  const absorbedBefore = useRef(absorbed)
  const [blocked, setBlocked] = useState<{ amount: number; seq: number } | null>(null)
  useEffect(() => {
    const amount = absorbed - absorbedBefore.current
    absorbedBefore.current = absorbed
    if (amount <= 0) return
    setBlocked(current => ({ amount, seq: (current?.seq ?? 0) + 1 }))
    if (wrap.current && !wrap.current.closest('.reduced-motion')) {
      scatter(Math.max(0, value - amount), value, Math.min(14, Math.max(4, amount * 3)), BLOCK_COLOR, 'deflect')
    }
  }, [absorbed])

  // Small squares thrown from a stretch of the bar: they fall for lost HP,
  // rise into the bar for restored HP, and fly up and away for a block.
  const scatter = (from: number, to: number, count: number, tint: string, mode: 'fall' | 'rise' | 'deflect') => {
    const rising = mode === 'rise'
    const layer = debris.current
    if (!layer) return
    for (let i = 0; i < count; i++) {
      const bit = document.createElement('i')
      const size = 2 + Math.random() * 2
      bit.style.cssText = `left:${(from + Math.random() * (to - from)) / max * 100}%;width:${size}px;height:${size}px;background:${tint}`
      layer.appendChild(bit)
      const dx = (Math.random() - 0.5) * 26
      const fall = 18 + Math.random() * 26
      const frames = mode === 'deflect'
        ? [
            { transform: 'translate(0, 0)', opacity: 1 },
            { transform: `translate(${dx * 1.3}px, ${-10 - Math.random() * 16}px) rotate(${dx * 10}deg)`, opacity: 0 },
          ]
        : rising
        ? [
            { transform: `translate(${dx}px, ${fall}px)`, opacity: 0 },
            { transform: `translate(${dx * 0.4}px, ${fall * 0.45}px)`, opacity: 1, offset: 0.35 },
            { transform: 'translate(0, 0)', opacity: 0 },
          ]
        : [
            { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${dx * 0.35}px, ${-4 - Math.random() * 7}px) rotate(${dx * 4}deg)`, opacity: 1, offset: 0.22 },
            { transform: `translate(${dx}px, ${fall}px) rotate(${dx * 14}deg)`, opacity: 0 },
          ]
      bit.animate(frames, {
        duration: 480 + Math.random() * 420, delay: Math.random() * (rising ? 160 : 70),
        easing: mode === 'fall' ? 'cubic-bezier(.45,0,.9,.55)' : 'cubic-bezier(.2,.8,.3,1)', fill: 'both',
      }).onfinish = () => bit.remove()
    }
  }

  const pct = (amount: number) => `${Math.max(0, Math.min(100, amount / max * 100))}%`
  const placed: (HealthHit & { left: number; right: number })[] = []
  let cursor = value
  const veiled = hits.filter(hit => hit.unknown)
  for (const hit of hits) {
    if (hit.unknown) continue
    const left = Math.max(0, cursor - hit.amount)
    if (left < cursor) placed.push({ ...hit, left, right: cursor })
    cursor = left
  }

  return (
    <div className="health-wrap" ref={wrap}>
      <div className={`segmented-health ${className} ${placed.length || veiled.length ? 'has-preview' : ''} ${live ? 'live' : ''} ${grown ? 'growing' : ''}`} style={{ '--pip': `${5 / max * 100}%` } as React.CSSProperties} aria-label={label}>
        <span className="health-current" style={{ width: pct(cursor) }} />
        {grown && <i className="gain-chunk" style={{ left: pct(grown.from), width: pct(grown.to - grown.from) }} />}
        <i className={`loss-ghost ${ghostTop === null ? 'draining' : 'struck'}`} style={{ left: pct(value), width: pct(Math.max(0, (ghostTop ?? value) - value)), background: lossColor }} />
        {blocked && <i className="block-strip" key={blocked.seq} style={{ left: pct(value - blocked.amount), width: pct(Math.min(value, blocked.amount)) }} />}
        {placed.map((hit, index) => (
          <button
            type="button"
            key={hit.key}
            className={`health-segment ${hit.className} ${hit.active ? 'previewing' : ''} ${index === placed.length - 1 ? 'left-edge' : ''} ${index === 0 ? 'right-edge' : ''}`}
            style={{ left: pct(hit.left), width: pct(hit.right - hit.left), transitionDelay: live ? `${60 + index * 45}ms` : undefined }}
            onMouseEnter={hit.onPreview}
            onMouseLeave={onLeave}
            onFocus={hit.onPreview}
            onBlur={onLeave}
            onClick={hit.onPreview}
            aria-label={hit.label}
          />
        ))}
        {veiled.length > 0 && cursor > 0 && (
          <div className={`health-unknown ${veiled.some(hit => hit.active) ? 'previewing' : ''}`} style={{ width: pct(cursor) }}>
            {veiled.map(hit => (
              <button
                type="button"
                key={hit.key}
                onMouseEnter={hit.onPreview}
                onMouseLeave={onLeave}
                onFocus={hit.onPreview}
                onBlur={onLeave}
                onClick={hit.onPreview}
                aria-label={hit.label}
              />
            ))}
          </div>
        )}
      </div>
      <div className="health-debris" ref={debris} aria-hidden="true" />
    </div>
  )
}

// The tags a Geek carries, in the order they are listed beside its HP bar.
function tagList(marks: EnemyMarks): string[] {
  return [
    ...(marks.live ? ['LIVE'] : []),
    ...(marks.breached ? ['BREACH'] : []),
    ...(marks.shifted ? ['SHIFT'] : []),
    ...(marks.dropped ? [`DROP${marks.dropped > 1 ? ` ×${marks.dropped}` : ''}`] : []),
  ]
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const state = useSyncExternalStore(battleStore.subscribe, battleStore.getSnapshot)
  // Once, before the first frame: the log decides whether this visit starts
  // on the attach screen or on the title.
  useState(() => { bootCampaign(); return null })
  const campaign = useCampaign()
  const { scene } = campaign
  const story = useSyncExternalStore(storyFeed.subscribe, storyFeed.getSnapshot)
  const vfxQuality = useSyncExternalStore(vfxQualityStore.subscribe, vfxQualityStore.getSnapshot)
  useSuspension()
  const fullscreen = useFullscreen()
  const presets = state.presets
  const [manualOpen, setManualOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [methodInspector, setMethodInspector] = useState<{ presetIndex: number; stepIndex: number } | null>(null)
  const [bashView, setBashView] = useState(0)
  const [devicePanel, setDevicePanel] = useState<'operator' | 'geeks'>('operator')
  const [mapZoom, setMapZoom] = useState(1)
  const clearTimer = useRef<number | null>(null)
  const dossierTimer = useRef<number | null>(null)
  const enemyPanelRef = useRef<HTMLElement>(null)
  const [mapHover, setMapHover] = useState<Coord | null>(null)
  const [inspectedEnemy, setInspectedEnemy] = useState<{
    id: string
    rect: DossierAnchorRect
    panelLeft: number | null
    pinned?: boolean
  } | null>(null)
  const enemyList = useRef<HTMLDivElement>(null)

  // The Bash panel follows the active set, so an Overload shows its switch at once.
  useEffect(() => setBashView(state.player.activeBash), [state.player.activeBash])

  useEffect(() => {
    const onZoom = (event: Event) => setMapZoom((event as CustomEvent<number>).detail)
    const onHover = (event: Event) => setMapHover((event as CustomEvent<Coord | null>).detail)
    window.addEventListener('map-zoom-changed', onZoom)
    window.addEventListener('map-hover-changed', onHover)
    if (canvasRef.current) startGame(canvasRef.current)
    return () => {
      window.removeEventListener('map-zoom-changed', onZoom)
      window.removeEventListener('map-hover-changed', onHover)
      stopGame()
    }
  }, [])

  const plannedState = {
    ...state,
    player: { ...state.player, pos: battleStore.plannedPosition() },
  }
  const displayActiveBash = state.overloadArmed ? 1 - state.player.activeBash : state.player.activeBash
  const previewState = state.overloadArmed
    ? {
        ...state,
        player: { ...state.player, activeBash: displayActiveBash, pos: battleStore.plannedPosition() },
        actions: [...state.actions, { type: 'overload' as const }],
      }
    : plannedState
  const live = state.phase === 'resolving'
  const outcomeDelayed = battleStore.isOutcomeDelayed()
  // The battle is over: nothing more will happen, so nothing is forecast.
  const over = (state.phase === 'victory' || state.phase === 'gameover') && !outcomeDelayed
  const forecast = !live && !over
  const sequence = over ? [] : state.outgoingForecast ?? (state.playerAttackResolved
    ? []
    : state.overloadArmed ? predictedSequence(previewState, displayActiveBash, 4, true) : predictedSequence(previewState))
  // What lies on the planned route is forecast only while the route is still
  // to be walked: an armed Overload that leaves no Geek standing ends the
  // battle as it fires, and the route is never walked.
  const ahead = routeAhead(state, sequence)
  const incomingSequence = live
    ? state.incomingForecast ?? []
    : state.phase === 'planning' ? predictedEnemySequence(previewState, undefined, state.overloadArmed ? 4 : undefined) : []
  // Geeks whose numbers the sandbox withholds: their hits have no size on
  // screen, and neither has anything that could be worked back to one.
  const veiledIds = new Set(state.enemies.filter(enemy => enemy.robustness > 0 && !disclosed(state, enemy)).map(enemy => enemy.id))
  const veiledIncoming = incomingSequence.some(hit => veiledIds.has(hit.enemyId))
  const incomingDamage = incomingSequence.reduce((total, hit) => total + (veiledIds.has(hit.enemyId) ? 0 : hit.damage), 0)
  const playerResources = ahead
    ? predictedPlayerResources(previewState)
    : { healing: 0, privilegeGain: 0, blockAfterResources: state.player.block }
  const sanityAfterHits = incomingSequence.length ? incomingSequence[incomingSequence.length - 1].after : state.player.sanity
  const projectedSanity = sanityAfterHits > 0 ? Math.min(state.player.maxSanity, sanityAfterHits + playerResources.healing) : 0
  const granted = live && state.resourcesResolved
  const repair = granted ? state.pendingRepair : playerResources.healing
  const privilegeGain = granted ? 0 : playerResources.privilegeGain
  const attackSequenceState = previewState
  const singleStep = methodInspector && state.attackPreview
    ? state.attackPreview.stepIndex
    : state.overloadArmed ? null : state.attackPreview?.stepIndex ?? null
  const visibleSequence = singleStep === null ? sequence : sequence.filter(hit => hit.stepIndex === singleStep)
  // What a hit takes after Security. On a withheld Geek it is not capped by
  // the Robustness left, which would give that number away.
  const landed = (hit: { enemyId: string; damage: number; absorbed: number; dealt: number }) =>
    veiledIds.has(hit.enemyId) ? Math.max(0, hit.damage - hit.absorbed) : hit.dealt
  const overloadDamage = visibleSequence.reduce((total, hit) => total + landed(hit), 0)
  const overloadHasTargets = visibleSequence.length > 0
  const aliveEnemies = battleStore.visualEnemies().map(entry => entry.enemy)
  // Geek bars break in the colour of whatever is hitting them: violet for an
  // Overload (the only damage dealt while planning), otherwise the active deck's.
  const strikeColor = !live ? '#a78bfa' : presets[state.player.activeBash].steps[0].shape === 'cross' ? '#5ee6ff' : '#ffc857'
  const { tuning } = state
  const overloadReady = state.player.overload >= tuning.overloadThreshold
  const canAct = state.phase === 'planning'
  // What each Geek's route will give it this turn; fixed once the turn starts.
  const enemyResources = (enemyId: string) => state.enemyResourcePreviews[enemyId]
    ?? predictedEnemyResources(attackSequenceState, enemyId, state.overloadArmed ? 4 : undefined)
  const broodForecast = state.mechanic?.kind === 'brood' && aliveEnemies.some(enemy => enemyResources(enemy.id).brood)
  const plannedCore = canAct && ahead ? state.actions.filter(action => action.type === 'move' && action.flag === 'core').length : 0
  const releases = state.overloadArmed ? 4 : releaseCount(previewState)
  const bashDisplayIndex = state.overloadArmed ? displayActiveBash : bashView
  const inspector = methodInspector ?? state.attackPreview
  // The Geek under the cursor on the map lights its card in the list.
  const hoveredEnemy = mapHover ? aliveEnemies.find(enemy => enemy.pos.x === mapHover.x && enemy.pos.y === mapHover.y)?.id ?? null : null
  const focusedEnemyId = state.enemyAttackPreview?.enemyId ?? inspectedEnemy?.id ?? hoveredEnemy
  const focusedEnemy = focusedEnemyId ? aliveEnemies.find(enemy => enemy.id === focusedEnemyId) ?? null : null
  const enemyHoverLinking = !state.enemyAttackPreview && focusedEnemyId !== null
  useEffect(() => {
    if (!hoveredEnemy) return
    enemyList.current?.querySelector(`[data-enemy="${hoveredEnemy}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [hoveredEnemy])
  useEffect(() => {
    hoverEnemyOnMap(inspectedEnemy?.id ?? hoveredEnemy)
  }, [inspectedEnemy?.id, hoveredEnemy])

  const measureEnemyAnchor = (el: HTMLElement | null): { rect: DossierAnchorRect; panelLeft: number | null } => {
    const r = el?.getBoundingClientRect()
    const panelRect = enemyPanelRef.current?.getBoundingClientRect()
    const rect: DossierAnchorRect = r
      ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
      : { top: 80, bottom: 160, left: window.innerWidth - 340, right: window.innerWidth - 14, width: 326, height: 80 }
    return { rect, panelLeft: panelRect ? panelRect.left : null }
  }
  const cancelDossierClose = () => {
    if (dossierTimer.current !== null) window.clearTimeout(dossierTimer.current)
    dossierTimer.current = null
  }
  const openDossier = (id: string, el: HTMLElement | null, pinned = false) => {
    cancelDossierClose()
    const { rect, panelLeft } = measureEnemyAnchor(el)
    setInspectedEnemy(prev => ({ id, rect, panelLeft, pinned: pinned || (prev?.id === id && prev?.pinned) }))
  }
  const scheduleCloseDossier = () => {
    cancelDossierClose()
    dossierTimer.current = window.setTimeout(() => {
      setInspectedEnemy(prev => (prev?.pinned ? prev : null))
    }, 130)
  }
  const closeDossier = () => {
    cancelDossierClose()
    setInspectedEnemy(null)
    battleStore.setEnemyAttackPreview(null)
  }
  useEffect(() => () => cancelDossierClose(), [])

  const previewMethod = (presetIndex: number, stepIndex: number) => {
    cancelMethodClear()
    setMethodInspector({ presetIndex, stepIndex })
    battleStore.setAttackPreview(presetIndex === displayActiveBash ? { presetIndex, stepIndex } : null)
  }
  const previewEnemyAttack = (enemyId: string, stepIndex: number) => {
    cancelMethodClear()
    setMethodInspector(null)
    battleStore.setEnemyAttackPreview({ enemyId, stepIndex })
  }
  const clearEnemyAttackPreview = () => battleStore.setEnemyAttackPreview(null)
  const clearMethodPreview = () => {
    cancelMethodClear()
    setMethodInspector(null)
    battleStore.setAttackPreview(state.overloadArmed ? { presetIndex: displayActiveBash, stepIndex: 0 } : null)
  }
  const selectBashView = (index: number) => {
    setBashView(index)
    clearMethodPreview()
  }
  const cycleBashView = (direction: number) => {
    selectBashView((bashView + direction + presets.length) % presets.length)
  }
  const cancelMethodClear = () => {
    if (clearTimer.current !== null) window.clearTimeout(clearTimer.current)
    clearTimer.current = null
  }
  const scheduleMethodClear = () => {
    cancelMethodClear()
    clearTimer.current = window.setTimeout(clearMethodPreview, 180)
  }

  // A full-screen scene is over the battle: the board stays mounted under it,
  // out of reach of the pointer and the Tab key.
  const covered = scene !== 'battle' && scene !== 'title'
  const ended = scene === 'battle' && over
  // Inside a layer a defeat counts the moment it happens, so the battle is not
  // offered again: no RESTART BATTLE while it is fought, and only CONTINUE
  // once it is lost. (Both stores are subscribed to above.)
  const inLayer = campaignBattle()
  const lostInLayer = inLayer && state.phase === 'gameover'
  const outcomeLines = story.lines.filter(line => line.event === 'victory' || line.event === 'defeat')

  useEffect(() => {
    if (covered || ended || state.phase === 'paused' || (inspectedEnemy && !aliveEnemies.some(enemy => enemy.id === inspectedEnemy.id))) {
      setInspectedEnemy(null)
    }
  }, [covered, ended, state.phase, inspectedEnemy, aliveEnemies])

  let incomingFocusText: string | null = null
  if ((forecast || live) && focusedEnemy) {
    const tagId = focusedEnemy.hidden ? 'HOSTILE' : focusedEnemy.id
    if (state.enemyAttackPreview?.enemyId === focusedEnemy.id) {
      const stepIdx = state.enemyAttackPreview.stepIndex
      const stepNumeral = ROMAN[stepIdx] ?? String(stepIdx + 1)
      const matched = incomingSequence.filter(hit => hit.enemyId === focusedEnemy.id && hit.stepIndex === stepIdx && hit.damage > 0)
      const raw = veiledIds.has(focusedEnemy.id)
        ? WITHHELD
        : String(matched.reduce((total, hit) => total + hit.damage, 0))
      incomingFocusText = matched.length > 0
        ? `${tagId} / ${stepNumeral} · −${raw}`
        : `${tagId} / ${stepNumeral} · OUT OF RANGE`
    } else {
      const matched = incomingSequence.filter(hit => hit.enemyId === focusedEnemy.id && hit.damage > 0)
      if (matched.length > 0) {
        const raw = veiledIds.has(focusedEnemy.id)
          ? WITHHELD
          : String(matched.reduce((total, hit) => total + hit.damage, 0))
        const stepsLabel = matched.map(hit => ROMAN[hit.stepIndex] ?? String(hit.stepIndex + 1)).join('+')
        incomingFocusText = `${tagId} · −${raw} (${stepsLabel})`
      } else {
        incomingFocusText = `${tagId} · NO HIT`
      }
    }
  }

  const enemyCards = aliveEnemies.map(enemy => {
    const allHits = sequence.filter(hit => hit.enemyId === enemy.id)
    const barHits = allHits.filter(hit => hit.damage > 0)
    const barKeys = segmentKeys(barHits.map(hit => hit.stepIndex))
    const hits = visibleSequence.filter(hit => hit.enemyId === enemy.id)
    const projected = hits.length ? hits[hits.length - 1].after : enemy.robustness
    const resources = enemyResources(enemy.id)
    const intent = forecast || live
      ? predictedEnemyIntent(attackSequenceState, enemy.id, state.overloadArmed ? 4 : undefined)
      : null
    const showForecast = hits.length > 0
    // Tags the Geek has now, and how the hits still to land change them.
    const tags = tagList(enemy)
    const tagsAfter = hits.length && !live ? tagList(hits[hits.length - 1].marks) : tags
    const events = live ? [] : [...new Set(hits.flatMap(hit => hit.events))]
      .filter(word => !['LIVE', 'BREACH', 'DROP'].includes(word))
    // UNDISCLOSED: its Robustness and Desire amounts are printed only while the sandbox allows.
    const open = !veiledIds.has(enemy.id)
    const pending = hits.reduce((total, hit) => total + landed(hit), 0)
    // A Geek with nothing to print has a glitch in its name slot. It is
    // picked by what the card shows (never by a withheld number), so it
    // changes when the card does and at no other time.
    const nameShown = enemy.hidden
      ? glitchName(state.encounter.layer, JSON.stringify([state.turn, live, enemy.block, enemy.soulCounter, tags, tagsAfter, events, pending, resources.securityGain, resources.soulCounterAfter, enemy.route]))
      : enemy.name
    return {
      enemy, allHits, barHits, barKeys, projected, resources, intent,
      showForecast, tags, tagsAfter, events, open, pending, nameShown,
    }
  })
  const inspectedCard = inspectedEnemy ? enemyCards.find(card => card.enemy.id === inspectedEnemy.id) ?? null : null

  return (
    <>
    <div
      id="game-root"
      className={`phase-${state.phase} scene-${scene} ${state.reducedMotion ? 'reduced-motion' : ''} device-panel-${devicePanel}`}
      style={{ '--story-accent': layerHue(state.encounter.layer), '--layer-ink': layerInk(state.encounter.layer) } as React.CSSProperties}
      inert={covered}
    >
      <header className="top-bar">
        <div className="sandbox-id">
          <span className="status-dot" />
          <strong>BLACKWALL_01</strong>
          <span className="top-divider">//</span>
          <span>SANDBOX</span>
        </div>
        <div className="turn-readout">TURN {String(state.turn).padStart(2, '0')} <span>/</span> {state.phase.toUpperCase()}</div>
        <div className="top-actions">
          <button
            type="button"
            className="icon-button fullscreen-button"
            onClick={() => void fullscreen.toggle()}
            disabled={!fullscreen.available}
            aria-label={fullscreen.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={fullscreen.available ? (fullscreen.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen') : 'Fullscreen is not supported by this browser'}
          >
            {fullscreen.isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <button className="icon-button" onClick={() => setManualOpen(true)} aria-label="Open manual" title="Manual"><BookOpen size={18} /></button>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings" title="Settings"><Settings size={18} /></button>
        </div>
      </header>
      {fullscreen.notice && <div className="fullscreen-notice" role="status">{fullscreen.notice}</div>}

      <main className="battle-layout">
        <nav className="device-tabs" aria-label="Battle panel">
          <button type="button" className={devicePanel === 'operator' ? 'active' : ''} onClick={() => setDevicePanel('operator')} aria-pressed={devicePanel === 'operator'}>OPERATOR</button>
          <button type="button" className={devicePanel === 'geeks' ? 'active' : ''} onClick={() => setDevicePanel('geeks')} aria-pressed={devicePanel === 'geeks'}>GEEKS</button>
        </nav>
        <aside className="side-panel player-panel">
          <div className="panel-kicker">OPERATOR</div>
          <section className="identity-block">
            <div className="avatar" aria-label="User avatar"><span /><i /><i /><i /><i /></div>
            <div className="identity-stats">
              <div className="hp-number">
                {state.player.sanity}<span> / {state.player.maxSanity}</span>
                {forecast && veiledIncoming
                  ? <em className="player-to-be">→ {WITHHELD}</em>
                  : forecast && projectedSanity !== state.player.sanity && <em className="player-to-be">→ {projectedSanity}</em>}
              </div>
              <div className="stat-label">
                <span>Desires' Scissors</span>
                {incomingFocusText && <strong className="incoming-focus-tag">{incomingFocusText}</strong>}
              </div>
            </div>
          </section>
          <HealthBar
            className={`player-sanity ${focusedEnemyId && veiledIds.has(focusedEnemyId) ? 'veiled-linked' : ''}`}
            value={state.player.sanity}
            max={state.player.maxSanity}
            hits={incomingSequence.filter(hit => hit.damage > 0).map(hit => {
              const isStepMatch = state.enemyAttackPreview?.enemyId === hit.enemyId && state.enemyAttackPreview.stepIndex === hit.stepIndex
              const isEnemyMatch = enemyHoverLinking && hit.enemyId === focusedEnemyId
              const dimmed = (state.enemyAttackPreview !== null && !isStepMatch) || (enemyHoverLinking && hit.enemyId !== focusedEnemyId)
              return {
                key: `${hit.enemyId}-${hit.stepIndex}`,
                amount: hit.damage,
                unknown: veiledIds.has(hit.enemyId),
                className: ['incoming-segment', isEnemyMatch ? 'enemy-linked' : '', dimmed ? 'enemy-dimmed' : ''].filter(Boolean).join(' '),
                label: `Preview ${hit.enemyId} attack ${hit.stepIndex + 1}: ${veiledIds.has(hit.enemyId) ? 'withheld' : hit.damage} raw damage`,
                active: isStepMatch || isEnemyMatch,
                onPreview: () => previewEnemyAttack(hit.enemyId, hit.stepIndex),
              }
            })}
            live={live}
            lossColor="#ff5d73"
            absorbed={state.absorbedTotals.player ?? 0}
            label={`Sanity ${state.player.sanity} of ${state.player.maxSanity}; ${incomingDamage} raw damage incoming${veiledIncoming ? ', and hits of a withheld size' : ''}`}
            onLeave={clearEnemyAttackPreview}
          />
          <div className="status-row">
            <span className={state.player.block || privilegeGain ? 'status-chip active' : 'status-chip'}>
              <Shield size={12} /> PRIVILEGE {state.player.block}{privilegeGain > 0 && ` +${privilegeGain}`}
            </span>
            {repair > 0 && <span className="status-chip active"><Cpu size={12} /> REPAIR +{repair}</span>}
            {state.player.focusReady && <span className="status-chip active"><Zap size={12} /> FOCUS → LIVE</span>}
          </div>

          <section className="panel-section">
            <div className="section-heading"><span>ACTION POINTS</span><strong>{state.actions.length} / {MAX_ACTIONS}</strong></div>
            <div className="action-slots">
              {Array.from({ length: MAX_ACTIONS }, (_, index) => {
                const action = state.actions[index]
                return (
                  <div className={`action-slot ${action ? 'filled' : ''}`} key={index} title={action?.type === 'move' ? action.flag : action?.type === 'overload' ? 'Overload' : 'Unused action'}>
                    {action ? <FlagIcon kind={action.type === 'overload' ? 'overload' : action.flag} size={12} /> : <span />}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="panel-section bash-section">
            <div className="section-heading"><span>BASH</span><SquareTerminal size={14} /></div>
            <div className="bash-viewer" onWheel={event => cycleBashView(event.deltaY > 0 ? 1 : -1)}>
              <div className="bash-dots" aria-label="Displayed Bash preset">
                {presets.map((preset, index) => (
                  <button
                    type="button"
                    className={bashDisplayIndex === index ? 'view-dot active' : 'view-dot'}
                    onClick={() => selectBashView(index)}
                    aria-label={`Show ${preset.name}`}
                    aria-pressed={bashDisplayIndex === index}
                    key={preset.id}
                  />
                ))}
              </div>
              {(() => {
                const preset = presets[bashDisplayIndex]
                const index = bashDisplayIndex
                return <div className={`preset ${displayActiveBash === index ? 'selected' : ''}`}>
                  <div className="preset-title">
                    <strong>{preset.name}</strong>
                    <span>{displayActiveBash === index ? (releases ? ROMAN[releases - 1] : '—') : 'STANDBY'}</span>
                  </div>
                  <div className="action-indicators" aria-label={`${preset.name} release methods`}>
                    {preset.steps.map((step, i) => (
                      <button
                        type="button"
                        className={`action-indicator ${state.overloadArmed && displayActiveBash === index ? 'overload-lit' : (displayActiveBash === index && i < releases ? `lit ${canAct ? 'pending' : ''}` : '')} ${inspector?.presetIndex === index && inspector.stepIndex === i ? 'inspecting' : ''}`}
                        key={step.name}
                        onMouseEnter={() => previewMethod(index, i)}
                        onMouseLeave={scheduleMethodClear}
                        onFocus={() => previewMethod(index, i)}
                        onBlur={scheduleMethodClear}
                        onClick={() => previewMethod(index, i)}
                        aria-label={`${ROMAN[i]} ${step.name}`}
                      >{ROMAN[i]}</button>
                    ))}
                  </div>
                </div>
              })()}
            </div>
            <button
              className={`overload-button ${overloadReady ? 'ready' : ''} ${state.overloadArmed ? 'armed' : ''}`}
              onClick={() => battleStore.requestOverload()}
              disabled={!canAct || !overloadReady || state.actions.length >= MAX_ACTIONS}
              title={state.overloadArmed ? 'Press again to release Overload' : 'Preview Overload; press again to release'}
            >
              <Gauge size={16} />
              <span>{state.overloadArmed ? `CONFIRM ${presets[displayActiveBash].name}` : 'OVERLOAD'}</span>
              <strong className="overload-preview-value">
                {state.overloadArmed
                  ? (overloadHasTargets ? `−${overloadDamage}` : 'NO TARGET')
                  : `${state.player.overload} / ${tuning.overloadThreshold}`}
              </strong>
            </button>
            <div className={`method-detail ${inspector ? 'active' : ''}`} aria-live="polite" onMouseEnter={cancelMethodClear} onMouseLeave={scheduleMethodClear}>
              {inspector && (() => {
                const step = presets[inspector.presetIndex].steps[inspector.stepIndex]
                return <>
                  <button type="button" className="method-close" onMouseDown={event => event.preventDefault()} onClick={clearMethodPreview} aria-label="Close method preview">×</button>
                  <strong>{presets[inspector.presetIndex].name} / {ROMAN[inspector.stepIndex]} {step.name}</strong>
                  <p>{mechanicText(step)}</p>
                  {riderText(step) && <p className="method-rider">{riderText(step)}</p>}
                  <span>{rangeText(step)}</span>
                </>
              })()}
            </div>
          </section>

          <section className="panel-section compact-section">
            <div className="section-heading"><span>PRIVILEGE</span><Shield size={14} /></div>
            <div className="defense-function"><strong>SHELL</strong><span>+{tuning.privilegePerFlag} PRIVILEGE / Flag</span></div>
          </section>

          <section className="panel-section buff-section">
            <div className="section-heading"><span>CORE</span><Cpu size={14} /></div>
            <div className="buff-list">
              {state.player.buffs.map(buff => {
                // Planned Core Flags are previewed on the counters: the ticks
                // they would fill pulse, and a counter that would trip says so.
                const total = buff.counter + plannedCore
                const fires = Math.floor(total / buff.threshold)
                const after = total % buff.threshold
                return (
                  <div className={`buff-row ${fires ? 'firing' : ''}`} key={buff.id}>
                    <div><strong>{buff.name}</strong><span>{buff.description}</span></div>
                    <div className="buff-counter">
                      <div className="counter-ticks">
                        {Array.from({ length: buff.threshold }, (_, i) => (
                          <i className={i < buff.counter ? 'on' : plannedCore && (fires || i < after) ? 'pending' : ''} key={i} />
                        ))}
                      </div>
                      <span>
                        {buff.counter}/{buff.threshold}
                        {plannedCore > 0 && <em className="to-be"> → {fires ? `FIRE${fires > 1 ? ` ×${fires}` : ''}` : after}</em>}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </aside>

        <section className="board-area" aria-label="Battle map with hexadecimal Warp coordinates">
          <div className="board-stage">
            <canvas id="game-canvas" ref={canvasRef} />
          </div>
          <div className="board-foot">
            {/* The story's one line slot. Nothing in it appears, moves or leaves while a route is being planned. */}
            <BattleTicker
              frozen={state.phase !== 'resolving' && state.phase !== 'victory' && state.phase !== 'gameover'}
              reducedMotion={state.reducedMotion}
            />
            <div className="map-zoom-controls" aria-label="Map zoom controls">
              <button type="button" onClick={() => zoomMap('out')} aria-label="Zoom out">−</button>
              <button type="button" className="zoom-value" onClick={() => zoomMap('reset')} aria-label="Reset map zoom">{Math.round(mapZoom * 100)}%</button>
              <button type="button" onClick={() => zoomMap('in')} aria-label="Zoom in">+</button>
            </div>
          </div>
        </section>

        <aside className="side-panel enemy-panel" ref={enemyPanelRef}>
          <section className="route-section">
            <div className="panel-kicker">PATH TAKEN</div>
            <div className="route-text">{battleStore.routeText()}</div>
            <button className="execute-button" onClick={() => void battleStore.executeTurn()} disabled={!canAct}>
              <span>EXECUTE ROUTE</span><span className="keycap">SPACE</span><ChevronRight size={17} />
            </button>
          </section>

          {/* The feed keeps the last battle's lines until the next one starts: outside a battle the panel says nothing. */}
          <ProtocolPanel key={state.encounter.id} state={state} broodForecast={forecast && broodForecast} said={scene === 'battle' ? panelLine(story.lines) : undefined} />

          <section className="enemy-list-section">
            <div className="section-heading"><span>HOSTILES</span><strong>{aliveEnemies.length}</strong></div>
            <div className="enemy-list" ref={enemyList}>
              {enemyCards.map(({ enemy, allHits, barHits, barKeys, projected, intent, showForecast, tags, tagsAfter, events, open, pending, nameShown }) => {
                const mapFocused = hoveredEnemy === enemy.id || state.enemyAttackPreview?.enemyId === enemy.id
                const panelFocused = inspectedEnemy?.id === enemy.id
                const stageBadge = stageBadgeText(state, enemy)
                const armedSteps = intent?.steps.filter(step => step.armed) ?? []
                return (
                  <article
                    className={`enemy-card ${showForecast ? 'affected' : ''} ${mapFocused ? 'map-hover' : ''} ${panelFocused ? 'is-inspected' : ''} ${open ? '' : 'withheld'}`}
                    key={enemy.id}
                    data-enemy={enemy.id}
                    tabIndex={0}
                    onMouseEnter={event => openDossier(enemy.id, event.currentTarget)}
                    onMouseLeave={scheduleCloseDossier}
                    onFocus={event => {
                      if (event.target === event.currentTarget) openDossier(enemy.id, event.currentTarget)
                    }}
                    onBlur={event => {
                      if (!event.currentTarget.contains(event.relatedTarget)) scheduleCloseDossier()
                    }}
                    onClick={event => {
                      if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) {
                        if (inspectedEnemy?.id === enemy.id && inspectedEnemy.pinned) closeDossier()
                        else openDossier(enemy.id, event.currentTarget, true)
                      }
                    }}
                  >
                    <div className="enemy-card-top">
                      <div className="enemy-identity">
                        {!enemy.hidden && <span className="enemy-id-badge">{enemy.id}</span>}
                        <strong className="enemy-name-text">{nameShown || '\u00a0'}</strong>
                        {stageBadge && <em className="enemy-stage-pill">{stageBadge}</em>}
                      </div>
                      <div className="enemy-hp">
                        {open
                          ? <strong>{enemy.robustness}{showForecast && !live && <em className="to-be"> → {projected}</em>}<small> / {enemy.maxRobustness}</small></strong>
                          : <strong>{WITHHELD}{showForecast && !live && pending > 0 && <em className="to-be"> −{pending}</em>}<small> / {WITHHELD}</small></strong>}
                      </div>
                    </div>
                    {open ? <HealthBar
                      value={enemy.robustness}
                      max={enemy.maxRobustness}
                      hits={barHits.map((hit, at) => ({
                        key: barKeys[at],
                        amount: hit.damage,
                        className: `segment-${hit.stepIndex}`,
                        label: `Preview action ${hit.stepIndex + 1}: ${hit.damage} raw damage`,
                        active: state.attackPreview?.stepIndex === hit.stepIndex,
                        onPreview: () => previewMethod(displayActiveBash, hit.stepIndex),
                      }))}
                      live={live}
                      lossColor={strikeColor}
                      absorbed={state.absorbedTotals[enemy.id] ?? 0}
                      label={`Robustness ${enemy.robustness} of ${enemy.maxRobustness}; ${allHits.reduce((total, hit) => total + hit.damage, 0)} raw damage incoming`}
                      onLeave={clearMethodPreview}
                    /> : (
                      // No fill, no pips: nothing on this bar can be measured.
                      <div className="health-wrap"><div className={`health-withheld ${showForecast && !live ? 'struck' : ''}`} role="img" aria-label="Robustness withheld" /></div>
                    )}
                    <div className="enemy-card-meta">
                      <div className="enemy-tags" aria-label={`Tags on ${enemy.id}`}>
                        {enemy.block > 0 && <span className="enemy-tag sec">SEC {enemy.block}</span>}
                        {tags.map(tag => <span className={`enemy-tag ${tagsAfter.includes(tag) ? '' : 'spent'}`} key={tag}>{tag}</span>)}
                        {tagsAfter.filter(tag => !tags.includes(tag)).map(tag => <span className="enemy-tag pending" key={tag}>→ {tag}</span>)}
                        {events.map(word => <span className="enemy-tag event pending" key={word}>{word}</span>)}
                        {!enemy.block && !tags.length && tagsAfter.length === 0 && !events.length && <span className="enemy-tag none">NO TAGS</span>}
                      </div>
                      <div className="enemy-next-attack" aria-label={`Next attacks of ${enemy.id}`}>
                        <span>NEXT</span>
                        {armedSteps.length > 0 ? armedSteps.map(step => {
                          const previewing = state.enemyAttackPreview?.enemyId === enemy.id && state.enemyAttackPreview.stepIndex === step.stepIndex
                          return (
                            <button
                              type="button"
                              key={step.stepIndex}
                              className={`next-chip ${step.hitsPlayer ? 'hits' : ''} ${previewing ? 'previewing' : ''}`}
                              onMouseEnter={() => previewEnemyAttack(enemy.id, step.stepIndex)}
                              onMouseLeave={clearEnemyAttackPreview}
                              onFocus={() => previewEnemyAttack(enemy.id, step.stepIndex)}
                              onBlur={clearEnemyAttackPreview}
                              onClick={event => {
                                event.stopPropagation()
                                previewEnemyAttack(enemy.id, step.stepIndex)
                              }}
                              aria-label={`Preview ${enemy.id} attack ${ROMAN[step.stepIndex] ?? step.stepIndex + 1}: ${open ? step.step.amount : 'withheld'}`}
                            >
                              <i>{ROMAN[step.stepIndex] ?? String(step.stepIndex + 1)}</i>
                              <b>{shown(state, enemy, step.step.amount)}</b>
                            </button>
                          )
                        }) : <span className="next-idle">—</span>}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        </aside>
      </main>

      {inspectedEnemy && inspectedCard && !covered && !ended && state.phase !== 'paused' && (
        <EnemyDossierPopup
          state={state}
          enemy={inspectedCard.enemy}
          nameShown={inspectedCard.nameShown}
          open={inspectedCard.open}
          projectedRobustness={inspectedCard.projected}
          showForecast={inspectedCard.showForecast}
          live={live}
          forecast={forecast}
          pending={inspectedCard.pending}
          resources={inspectedCard.resources}
          intent={inspectedCard.intent}
          activePreviewStepIndex={state.enemyAttackPreview?.enemyId === inspectedCard.enemy.id ? state.enemyAttackPreview.stepIndex : null}
          anchorRect={inspectedEnemy.rect}
          panelLeft={inspectedEnemy.panelLeft}
          onMouseEnter={cancelDossierClose}
          onMouseLeave={scheduleCloseDossier}
          onPreviewStep={stepIndex => previewEnemyAttack(inspectedCard.enemy.id, stepIndex)}
          onClearStep={clearEnemyAttackPreview}
          onClose={closeDossier}
        />
      )}

      {scene === 'title' && state.phase === 'title' && <TitleScreen state={state} campaign={campaign} />}

      {state.phase === 'paused' && (
        <div className="state-overlay pause-overlay">
          <div className="pause-content with-context">
            <div className="pause-controls">
              <h2>PAUSED</h2>
              <button className="primary-action" onClick={() => battleStore.togglePause()}><Play size={16} /> RESUME</button>
              <div className="pause-menu">
                {!inLayer && <button onClick={() => battleStore.restart()}><RotateCcw size={15} /> RESTART BATTLE</button>}
                <button onClick={returnToTitle}><HomeIcon size={15} /> RETURN TO MAIN MENU</button>
              </div>
            </div>
            {/* Everything said so far, without the lines still waiting for a turn to resolve. It is still: nothing here arrives or leaves. */}
            <Transcript className="pause-context" entries={heardSoFar(campaign.meta.transcript, storyFeed.waiting())} limit={120} />
          </div>
        </div>
      )}

      {/* The battle is over, and inside a layer its result is in the run from the moment it happened. CONTINUE goes on from it. R fights the same battle again and gives a win up; a defeat inside a layer cannot be fought again, so there CONTINUE is all there is. */}
      {ended && (
        <div className="state-overlay outcome-overlay">
          <div className="outcome-content">
            <div className="outcome-icon">{state.phase === 'victory' ? <Check size={34} /> : <ShieldAlert size={34} />}</div>
            <div className="eyebrow">{state.message}</div>
            <h2>{state.phase !== 'victory' ? 'ELIMINATED' : state.encounter.layer === 0 ? 'ESCAPED' : state.encounter.kind === 'boss' ? 'BREACHED' : 'BROKEN'}</h2>
            <div className="outcome-lines" aria-live="polite">
              {outcomeLines.map(line => <p key={line.id} data-voice={line.voice}><VoiceLine voice={line.voice} text={line.text} id={line.id} live reducedMotion={state.reducedMotion} /></p>)}
            </div>
            <button className="primary-action" onClick={reportOutcome}><ArrowRight size={16} /> CONTINUE <span>SPACE</span></button>
            {!lostInLayer && (
              <div className="pause-menu">
                <button onClick={() => battleStore.restart()}><RotateCcw size={15} /> RESTART BATTLE <span>R</span></button>
                <button onClick={returnToTitle}><HomeIcon size={15} /> RETURN TO MAIN MENU</button>
              </div>
            )}
          </div>
        </div>
      )}

      {manualOpen && <Manual state={state} weights={campaign.run?.weights ?? []} onClose={() => setManualOpen(false)} />}

      {settingsOpen && (
        <Modal onClose={() => setSettingsOpen(false)} label="Settings">
          <h2>SETTINGS</h2>
          <div className="setting-row"><div><strong>AUDIO</strong></div><button className={`toggle ${state.muted ? '' : 'on'}`} onClick={() => battleStore.toggleMute()} aria-label="Toggle audio"><span />{state.muted ? 'MUTED' : 'ON'}</button></div>
          <div className="setting-row"><div><strong>REDUCED MOTION</strong></div><button className={`toggle ${state.reducedMotion ? 'on' : ''}`} onClick={() => battleStore.toggleReducedMotion()} aria-label="Toggle reduced motion"><span />{state.reducedMotion ? 'ON' : 'OFF'}</button></div>
          <div className="setting-row setting-row-quality">
            <div>
              <strong>VISUAL QUALITY</strong>
              <p>{vfxQualityDescription(vfxQuality)}</p>
            </div>
            <div className="quality-lever" role="group" aria-label="Visual quality">
              {VFX_QUALITY_MODES.map(mode => (
                <button
                  type="button"
                  key={mode}
                  className={`quality-stop ${vfxQuality === mode ? 'active' : ''}`}
                  aria-pressed={vfxQuality === mode}
                  aria-label={`Visual quality ${mode}`}
                  onClick={() => { battleStore.sfx('ui'); vfxQualityStore.set(mode) }}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row setting-row-saver">
            <ProgressSaver compact />
          </div>
          {!inLayer && <button className="secondary-action full-width" onClick={() => { setSettingsOpen(false); battleStore.restart() }}><RotateCcw size={15} /> RESTART BATTLE</button>}
          {state.phase !== 'title' && <button className="secondary-action full-width menu-return" onClick={() => { setSettingsOpen(false); returnToTitle() }}><HomeIcon size={15} /> RETURN TO MAIN MENU</button>}
        </Modal>
      )}
    </div>
    <Scenes campaign={campaign} state={state} />
    </>
  )
}
