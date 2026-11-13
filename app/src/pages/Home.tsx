import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, Circle, Cpu, Gauge,
  Hexagon, Home as HomeIcon, Maximize2, Minimize2, Play, RotateCcw, Settings, Shield, ShieldAlert, SquareTerminal,
  X, Zap,
} from 'lucide-react'
import { useFullscreen } from '@/hooks/useFullscreen'
import { startGame, stopGame, zoomMap } from '@/game/boot'
import { battleStore } from '@/game/battle-store'
import { ENEMY_DEFINITIONS, MAX_ACTIONS, OVERLOAD_THRESHOLD, PLAYER_FUNCTIONS } from '@/game/battle-config'
import { DEFAULT_LOADOUT, FRAMES, SKILLS, assignSkill, cloneLoadout, frameById, skillById, slotLabel } from '@/game/skills'
import type { Loadout } from '@/game/skills'
import { coordKey, curtainLabel } from '@/game/battle-rules'
import { mechanicText, predictedSequence, rangeText, releaseCount } from '@/game/attack-methods'
import { predictedEnemyResources, predictedEnemySequence, predictedPlayerResources } from '@/game/enemy-attack-methods'
import type { CoreBuff, FlagKind } from '@/game/battle-types'

const ROMAN = ['I', 'II', 'III', 'IV']
const WARDEN = ENEMY_DEFINITIONS.find(enemy => enemy.bossStages?.length)
const breakdownAt = WARDEN ? Math.ceil(WARDEN.robustness * (WARDEN.breakdownAt ?? 0.5)) : 0

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
  onPreview: () => void
}

// The bar shows raw damage only. `hits` are the hits still to land, in order;
// each is a segment hanging off the right end of the current HP, and the white
// fill is what would remain if all of them landed unblocked. Block and repair
// are shown beneath the bar and never reshape the segments.
//
// When a hit lands the bar takes the blow: the fill snaps back at once, the
// bar rattles, the HP lost hangs for a beat in the attacker's colour and then
// shatters into fragments that fall away, while the remaining segments catch
// up late with a little overshoot. Restored HP draws motes up into the bar.
function HealthBar({ value, max, hits, live, label, className = '', lossColor, onLeave }: {
  value: number
  max: number
  hits: HealthHit[]
  live: boolean
  label: string
  className?: string
  lossColor: string
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
    // Small squares thrown from a stretch of the bar; they fall for a loss and rise for a gain.
    const scatter = (from: number, to: number, count: number, tint: string, rising: boolean) => {
      const layer = debris.current
      if (!layer) return
      for (let i = 0; i < count; i++) {
        const bit = document.createElement('i')
        const size = 2 + Math.random() * 2
        bit.style.cssText = `left:${(from + Math.random() * (to - from)) / max * 100}%;width:${size}px;height:${size}px;background:${tint}`
        layer.appendChild(bit)
        const dx = (Math.random() - 0.5) * 26
        const fall = 18 + Math.random() * 26
        const frames = rising
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
          easing: rising ? 'cubic-bezier(.2,.8,.3,1)' : 'cubic-bezier(.45,0,.9,.55)', fill: 'both',
        }).onfinish = () => bit.remove()
      }
    }
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
        if (!calm) scatter(value, top, Math.min(26, Math.max(4, Math.round(lost * 3))), color.current, false)
      }, calm ? 520 : 190)
      return () => window.clearTimeout(timer)
    }
    ghostFrom.current = null
    setGhostTop(null)
    setGrown({ from: before, to: value })
    if (!calm) scatter(before, value, Math.min(16, Math.max(4, Math.round((value - before) * 3))), 'var(--white)', true)
    const timer = window.setTimeout(() => setGrown(null), 620)
    return () => window.clearTimeout(timer)
  }, [value, max])

  const pct = (amount: number) => `${Math.max(0, Math.min(100, amount / max * 100))}%`
  const placed: (HealthHit & { left: number; right: number })[] = []
  let cursor = value
  for (const hit of hits) {
    const left = Math.max(0, cursor - hit.amount)
    if (left < cursor) placed.push({ ...hit, left, right: cursor })
    cursor = left
  }

  return (
    <div className="health-wrap" ref={wrap}>
      <div className={`segmented-health ${className} ${placed.length ? 'has-preview' : ''} ${live ? 'live' : ''} ${grown ? 'growing' : ''}`} style={{ '--pip': `${5 / max * 100}%` } as React.CSSProperties} aria-label={label}>
        <span className="health-current" style={{ width: pct(cursor) }} />
        {grown && <i className="gain-chunk" style={{ left: pct(grown.from), width: pct(grown.to - grown.from) }} />}
        <i className={`loss-ghost ${ghostTop === null ? 'draining' : 'struck'}`} style={{ left: pct(value), width: pct(Math.max(0, (ghostTop ?? value) - value)), background: lossColor }} />
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
      </div>
      <div className="health-debris" ref={debris} aria-hidden="true" />
    </div>
  )
}

type DrawerId = 'a' | 'b' | 'defense' | 'core'

// One collapsible row of the menu's deck list. A closed drawer keeps its
// summary visible in the header, so the whole build reads at a glance.
function Drawer({ id, open, onToggle, icon, kicker, title, summary, children }: {
  id: DrawerId
  open: boolean
  onToggle: () => void
  icon: React.ReactNode
  kicker: string
  title: string
  summary: string
  children: React.ReactNode
}) {
  return (
    <section className={`drawer ${open ? 'open' : ''}`}>
      <button type="button" className="drawer-head" onClick={onToggle} aria-expanded={open} aria-controls={`drawer-${id}`}>
        <span className="drawer-icon">{icon}</span>
        <span className="drawer-title"><em>{kicker}</em><strong>{title}</strong></span>
        <span className="drawer-summary">{summary}</span>
        <ChevronDown size={15} className="drawer-chevron" />
      </button>
      <div className="drawer-body" id={`drawer-${id}`} inert={!open}>
        <div className="drawer-clip"><div className="drawer-content">{children}</div></div>
      </div>
    </section>
  )
}

// Deck builder shown on the menu, one drawer per deck. In a Bash deck, pick a
// slot, then pick a skill for it; a skill already placed elsewhere trades
// places with the one it replaces. The Defense and Core decks have a single
// fixed build, so their drawers only describe it.
function LoadoutEditor({ loadout, buffs, onChange }: { loadout: Loadout; buffs: CoreBuff[]; onChange: (loadout: Loadout) => void }) {
  const [open, setOpen] = useState<DrawerId | null>('a')
  const [slots, setSlots] = useState([0, 0])
  const toggle = (id: DrawerId) => setOpen(current => current === id ? null : id)
  const placement = (id: string): string | null => {
    for (const [deckIndex, deck] of loadout.entries()) {
      const slot = deck.skills.findIndex(skill => skill === id)
      if (slot >= 0) return `${'AB'[deckIndex]}·${ROMAN[slot]}`
    }
    return null
  }
  const cycleFrame = (deckIndex: number) => {
    const next = cloneLoadout(loadout)
    const at = FRAMES.findIndex(frame => frame.id === next[deckIndex].frame)
    next[deckIndex].frame = FRAMES[(at + 1) % FRAMES.length].id
    onChange(next)
  }
  return (
    <div className="loadout" aria-label="Deck builder">
      {loadout.map((deck, deckIndex) => {
        const frame = frameById(deck.frame)
        const letter = 'AB'[deckIndex]
        const slot = slots[deckIndex]
        const selectedSkill = deck.skills[slot]
        return (
          <Drawer
            key={deckIndex}
            id={deckIndex === 0 ? 'a' : 'b'}
            open={open === (deckIndex === 0 ? 'a' : 'b')}
            onToggle={() => toggle(deckIndex === 0 ? 'a' : 'b')}
            icon={<SquareTerminal size={15} strokeWidth={1.7} />}
            kicker={`BASH DECK ${letter} · ${deckIndex === 0 ? 'STARTS ACTIVE' : 'ON OVERLOAD'}`}
            title={frame.name}
            summary={deck.skills.map(id => skillById(id).name).join(' · ')}
          >
            <button type="button" className="frame-toggle" onClick={() => cycleFrame(deckIndex)} aria-label={`Deck ${letter} frame ${frame.name}. Change frame`}>
              <span>FRAME</span>
              <strong>{frame.name}</strong>
              <em>{frame.description}</em>
              <i>CHANGE</i>
            </button>
            <div className="loadout-slots">
              {deck.skills.map((id, index) => {
                const skill = skillById(id)
                const active = slot === index
                return (
                  <button
                    type="button"
                    className={`loadout-slot ${active ? 'selected' : ''}`}
                    key={index}
                    onClick={() => setSlots(current => current.map((value, i) => i === deckIndex ? index : value))}
                    aria-pressed={active}
                    aria-label={`Deck ${letter} slot ${ROMAN[index]}: ${skill.name}, ${slotLabel(skill, index)}`}
                  >
                    <span>{ROMAN[index]}</span>
                    <strong>{skill.name}</strong>
                    <em>{slotLabel(skill, index)}</em>
                  </button>
                )
              })}
            </div>
            <div className="loadout-pool">
              <div className="pool-row pool-head">
                <span>SKILL → {letter}·{ROMAN[slot]}</span>
                {ROMAN.map((numeral, index) => <span className={index === slot ? 'at-slot' : ''} key={numeral}>{numeral}</span>)}
                <span>IN</span>
              </div>
              {SKILLS.map(skill => {
                const where = placement(skill.id)
                return (
                  <button
                    type="button"
                    className={`pool-row pool-skill ${skill.id === selectedSkill ? 'current' : ''} ${where ? 'placed' : ''}`}
                    key={skill.id}
                    onClick={() => onChange(assignSkill(loadout, deckIndex, slot, skill.id))}
                    aria-label={`Put ${skill.name} in deck ${letter} slot ${ROMAN[slot]}`}
                  >
                    <strong>{skill.name}</strong>
                    {skill.amounts.map((_, index) => <span className={index === slot ? 'at-slot' : ''} key={index}>{slotLabel(skill, index)}</span>)}
                    <em>{where ?? '—'}</em>
                  </button>
                )
              })}
              <p className="pool-legend">Slot N fires with N Bash Flags and N unused action points. ALL hits every Geek in range · P pierces Security · D is the distance to the target.</p>
            </div>
          </Drawer>
        )
      })}
      <Drawer
        id="defense"
        open={open === 'defense'}
        onToggle={() => toggle('defense')}
        icon={<Shield size={15} strokeWidth={1.7} />}
        kicker="DEFENSE DECK · PRIVILEGE"
        title="SHELL"
        summary={`+${PLAYER_FUNCTIONS.privilegePerFlag} PRIVILEGE / FLAG`}
      >
        <div className="deck-cards">
          <article className="deck-card">
            <header><strong>SHELL</strong><em>AUTOMATIC</em></header>
            <b>+{PLAYER_FUNCTIONS.privilegePerFlag} PRIVILEGE</b>
            <p>For every Privilege Flag collected. PRIVILEGE absorbs damage in the enemy phase that follows, then resets.</p>
          </article>
        </div>
        <p className="deck-note">The Defense deck has one fixed function in this build.</p>
      </Drawer>
      <Drawer
        id="core"
        open={open === 'core'}
        onToggle={() => toggle('core')}
        icon={<Cpu size={15} strokeWidth={1.7} />}
        kicker="CORE DECK · COUNTERS"
        title={`${buffs.length} BLOCKS`}
        summary={buffs.map(buff => buff.name).join(' · ')}
      >
        <div className="deck-cards">
          {buffs.map(buff => (
            <article className="deck-card" key={buff.id}>
              <header><strong>{buff.name}</strong><em>EVERY {buff.threshold}</em></header>
              <b>{buff.description}</b>
              <div className="counter-ticks">{Array.from({ length: buff.threshold }, (_, i) => <i key={i} />)}</div>
            </article>
          ))}
        </div>
        <p className="deck-note">Every Core Flag advances all three counters at once. The Core deck is fixed in this build.</p>
      </Drawer>
    </div>
  )
}

function Modal({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={label}>
      <section className="modal-panel">
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        {children}
      </section>
    </div>
  )
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const state = useSyncExternalStore(battleStore.subscribe, battleStore.getSnapshot)
  const fullscreen = useFullscreen()
  const presets = state.presets
  const loadout = battleStore.getLoadout()
  const [manualOpen, setManualOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [methodInspector, setMethodInspector] = useState<{ presetIndex: number; stepIndex: number } | null>(null)
  const [bashView, setBashView] = useState(0)
  const [devicePanel, setDevicePanel] = useState<'operator' | 'geeks'>('operator')
  const [mapZoom, setMapZoom] = useState(1)
  const clearTimer = useRef<number | null>(null)

  // The Bash panel follows the active set, so an Overload shows its switch at once.
  useEffect(() => setBashView(state.player.activeBash), [state.player.activeBash])

  useEffect(() => {
    const onZoom = (event: Event) => setMapZoom((event as CustomEvent<number>).detail)
    window.addEventListener('map-zoom-changed', onZoom)
    if (canvasRef.current) startGame(canvasRef.current)
    return () => {
      window.removeEventListener('map-zoom-changed', onZoom)
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
  const incomingSequence = live
    ? state.incomingForecast ?? []
    : state.phase === 'planning' ? predictedEnemySequence(previewState, undefined, state.overloadArmed ? 4 : undefined) : []
  const incomingDamage = incomingSequence.reduce((total, hit) => total + hit.damage, 0)
  const playerResources = predictedPlayerResources(previewState)
  const sanityAfterHits = incomingSequence.length ? incomingSequence[incomingSequence.length - 1].after : state.player.sanity
  const projectedSanity = sanityAfterHits > 0 ? Math.min(state.player.maxSanity, sanityAfterHits + playerResources.healing) : 0
  const granted = live && state.resourcesResolved
  const repair = granted ? state.pendingRepair : playerResources.healing
  const privilegeGain = granted ? 0 : playerResources.privilegeGain
  const attackSequenceState = previewState
  const sequence = state.outgoingForecast ?? (state.playerAttackResolved
    ? []
    : state.overloadArmed ? predictedSequence(previewState, displayActiveBash, 4) : predictedSequence(attackSequenceState))
  const singleStep = methodInspector && state.attackPreview
    ? state.attackPreview.stepIndex
    : state.overloadArmed ? null : state.attackPreview?.stepIndex ?? null
  const visibleSequence = singleStep === null ? sequence : sequence.filter(hit => hit.stepIndex === singleStep)
  const overloadDamage = visibleSequence.reduce((total, hit) => total + hit.dealt, 0)
  const overloadHasTargets = visibleSequence.length > 0
  const aliveEnemies = state.enemies.filter(enemy => enemy.robustness > 0)
  // Geek bars break in the colour of whatever is hitting them: violet for an
  // Overload (the only damage dealt while planning), otherwise the active deck's.
  const strikeColor = !live ? '#a78bfa' : presets[state.player.activeBash].steps[0].shape === 'cross' ? '#5ee6ff' : '#ffc857'
  const boss = aliveEnemies.find(enemy => enemy.bossStages?.length)
  const canAct = state.phase === 'planning'
  const plannedCore = canAct ? state.actions.filter(action => action.type === 'move' && action.flag === 'core').length : 0
  const releases = state.overloadArmed ? 4 : releaseCount(previewState)
  const bashDisplayIndex = state.overloadArmed ? displayActiveBash : bashView
  const inspector = methodInspector ?? state.attackPreview

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

  return (
    <div id="game-root" className={`phase-${state.phase} ${state.reducedMotion ? 'reduced-motion' : ''} device-panel-${devicePanel}`}>
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
                {!live && projectedSanity !== state.player.sanity && <em className="player-to-be">→ {projectedSanity}</em>}
              </div>
              <div className="stat-label">Desires' Scissors</div>
            </div>
          </section>
          <HealthBar
            className="player-sanity"
            value={state.player.sanity}
            max={state.player.maxSanity}
            hits={incomingSequence.filter(hit => hit.damage > 0).map(hit => ({
              key: `${hit.enemyId}-${hit.stepIndex}`,
              amount: hit.damage,
              className: 'incoming-segment',
              label: `Preview ${hit.enemyId} attack ${hit.stepIndex + 1}: ${hit.damage} raw damage`,
              active: state.enemyAttackPreview?.enemyId === hit.enemyId && state.enemyAttackPreview.stepIndex === hit.stepIndex,
              onPreview: () => previewEnemyAttack(hit.enemyId, hit.stepIndex),
            }))}
            live={live}
            lossColor="#ff5d73"
            label={`Sanity ${state.player.sanity} of ${state.player.maxSanity}; ${incomingDamage} raw damage incoming`}
            onLeave={clearEnemyAttackPreview}
          />
          <div className="status-row">
            <span className={state.player.block || privilegeGain ? 'status-chip active' : 'status-chip'}>
              <Shield size={12} /> PRIVILEGE {state.player.block}{privilegeGain > 0 && ` +${privilegeGain}`}
            </span>
            {repair > 0 && <span className="status-chip active"><Cpu size={12} /> REPAIR +{repair}</span>}
            {state.player.focusReady && <span className="status-chip active"><Zap size={12} /> CORE +1</span>}
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
              className={`overload-button ${state.player.overload >= OVERLOAD_THRESHOLD ? 'ready' : ''} ${state.overloadArmed ? 'armed' : ''}`}
              onClick={() => battleStore.requestOverload()}
              disabled={!canAct || state.player.overload < OVERLOAD_THRESHOLD || state.actions.length >= MAX_ACTIONS}
              title={state.overloadArmed ? 'Press again to release Overload' : 'Preview Overload; press again to release'}
            >
              <Gauge size={16} />
              <span>{state.overloadArmed ? `CONFIRM ${presets[displayActiveBash].name}` : 'OVERLOAD'}</span>
              <strong className="overload-preview-value">
                {state.overloadArmed
                  ? (overloadHasTargets ? `−${overloadDamage}` : 'NO TARGET')
                  : `${state.player.overload} / ${OVERLOAD_THRESHOLD}`}
              </strong>
            </button>
            <div className={`method-detail ${inspector ? 'active' : ''}`} aria-live="polite" onMouseEnter={cancelMethodClear} onMouseLeave={scheduleMethodClear}>
              {inspector && (() => {
                const step = presets[inspector.presetIndex].steps[inspector.stepIndex]
                return <>
                  <button type="button" className="method-close" onMouseDown={event => event.preventDefault()} onClick={clearMethodPreview} aria-label="Close method preview">×</button>
                  <strong>{presets[inspector.presetIndex].name} / {ROMAN[inspector.stepIndex]} {step.name}</strong>
                  <p>{mechanicText(step)}</p>
                  <span>{rangeText(step)}</span>
                </>
              })()}
            </div>
          </section>

          <section className="panel-section compact-section">
            <div className="section-heading"><span>PRIVILEGE</span><Shield size={14} /></div>
            <div className="defense-function"><strong>SHELL</strong><span>+{PLAYER_FUNCTIONS.privilegePerFlag} PRIVILEGE / Flag</span></div>
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
          <canvas id="game-canvas" ref={canvasRef} />
          <div className="map-zoom-controls" aria-label="Map zoom controls">
            <button type="button" onClick={() => zoomMap('out')} aria-label="Zoom out">−</button>
            <button type="button" className="zoom-value" onClick={() => zoomMap('reset')} aria-label="Reset map zoom">{Math.round(mapZoom * 100)}%</button>
            <button type="button" onClick={() => zoomMap('in')} aria-label="Zoom in">+</button>
          </div>
        </section>

        <aside className="side-panel enemy-panel">
          <section className="route-section">
            <div className="panel-kicker">PATH TAKEN</div>
            <div className="route-text">{battleStore.routeText()}</div>
            <button className="execute-button" onClick={() => void battleStore.executeTurn()} disabled={!canAct}>
              <span>EXECUTE ROUTE</span><span className="keycap">SPACE</span><ChevronRight size={17} />
            </button>
          </section>

          {boss && <section className="boss-protocol" aria-label="Warden boss protocol">
            <div className="section-heading"><span>WARDEN / STAGE {ROMAN[boss.stage - 1]}</span><ShieldAlert size={14} /></div>
            <div className="boss-sets">
              <span>DESIRE <strong>{boss.desireName}</strong></span>
              <span>SECURITY <strong>{boss.securityName}</strong></span>
              <span>SOUL <strong>{boss.soulName}</strong></span>
            </div>
            <div className="breakdown-line">
              <span>BREAKDOWN</span>
              <strong>{boss.stage === 1 ? `AT ${Math.ceil(boss.maxRobustness * (boss.breakdownAt ?? 0.5))} ROBUSTNESS` : 'SPENT / DUAL CURTAIN'}</strong>
            </div>
            <div className="curtain-list">
              {state.curtains.map(curtain => <span className={curtain.locked ? 'locked' : ''} key={`${curtain.axis}-${curtain.index}`}>
                {curtain.locked ? 'SEALED' : `T−${Math.max(0, curtain.fireTurn - state.turn)}`} / {curtainLabel(curtain)}
              </span>)}
            </div>
          </section>}

          <section className="enemy-list-section">
            <div className="section-heading"><span>HOSTILES</span><strong>{aliveEnemies.length}</strong></div>
            <div className="enemy-list">
              {aliveEnemies.map(enemy => {
                const allHits = sequence.filter(hit => hit.enemyId === enemy.id)
                const hits = visibleSequence.filter(hit => hit.enemyId === enemy.id)
                const projected = hits.length ? hits[hits.length - 1].after : enemy.robustness
                const resources = state.enemyResourcePreviews[enemy.id] ?? predictedEnemyResources(attackSequenceState, enemy.id, state.overloadArmed ? 4 : undefined)
                const showForecast = hits.length > 0
                return (
                  <article className={`enemy-card ${showForecast ? 'affected' : ''}`} key={enemy.id}>
                    <div className="enemy-card-head">
                      <div className="enemy-avatar"><Hexagon size={27} strokeWidth={1.4} /><span>{enemy.id}</span></div>
                      <div className="enemy-name">
                        <strong>{enemy.name}</strong>
                        <span>{enemy.behavior.toUpperCase()}</span>
                      </div>
                    </div>
                    <div className="enemy-hp">
                      <strong>{enemy.robustness}{showForecast && !live && <em className="to-be"> → {projected}</em>}<small> / {enemy.maxRobustness}</small></strong>
                      <span>ROBUSTNESS</span>
                    </div>
                    <HealthBar
                      value={enemy.robustness}
                      max={enemy.maxRobustness}
                      hits={allHits.filter(hit => hit.damage > 0).map(hit => ({
                        key: `${hit.stepIndex}`,
                        amount: hit.damage,
                        className: `segment-${hit.stepIndex}`,
                        label: `Preview action ${hit.stepIndex + 1}: ${hit.damage} raw damage`,
                        active: state.attackPreview?.stepIndex === hit.stepIndex,
                        onPreview: () => previewMethod(displayActiveBash, hit.stepIndex),
                      }))}
                      live={live}
                      lossColor={strikeColor}
                      label={`Robustness ${enemy.robustness} of ${enemy.maxRobustness}; ${allHits.reduce((total, hit) => total + hit.damage, 0)} raw damage incoming`}
                      onLeave={clearMethodPreview}
                    />
                    <div className="enemy-status">
                      <span className={enemy.block ? 'has-block' : ''}>SECURITY {enemy.block}{!live && resources.securityGain > 0 && <em className="gain"> +{resources.securityGain}</em>}</span>
                      <span>SOUL {enemy.soulCounter}/{enemy.soulThreshold}{!live && resources.recovery > 0 && <em className="gain"> +{resources.recovery} HP</em>}</span>
                    </div>
                    <div className="enemy-route">
                      <span>ROUTE</span>
                      <p>{[enemy.pos, ...enemy.route].map(coordKey).join(' → ')}</p>
                      {enemy.effectCell && <p className="enemy-purge">PURGE → {coordKey(enemy.effectCell)}</p>}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        </aside>
      </main>

      {state.phase === 'title' && (
        <div className="state-overlay title-overlay">
          <div className="title-content">
            <div className="eyebrow">WARDEN PROTOCOL / CURTAIN</div>
            <h1>FINAL<br />PROTOCOL</h1>
            <button className="primary-action" onClick={() => battleStore.start()}><Play size={16} /> BREACH SANDBOX <span>SPACE</span></button>
            <button className="secondary-action reset-decks" onClick={() => battleStore.setLoadout(DEFAULT_LOADOUT)}><RotateCcw size={15} /> DEFAULT DECKS</button>
          </div>
          <LoadoutEditor loadout={loadout} buffs={state.player.buffs} onChange={next => battleStore.setLoadout(next)} />
        </div>
      )}

      {state.phase === 'paused' && (
        <div className="state-overlay">
          <div className="pause-content">
            <h2>PAUSED</h2>
            <button className="primary-action" onClick={() => battleStore.togglePause()}><Play size={16} /> RESUME</button>
            <div className="pause-menu">
              <button onClick={() => battleStore.restart()}><RotateCcw size={15} /> RESTART BATTLE</button>
              <button onClick={() => battleStore.returnToMenu()}><HomeIcon size={15} /> RETURN TO MAIN MENU</button>
            </div>
          </div>
        </div>
      )}

      {(state.phase === 'victory' || state.phase === 'gameover') && (
        <div className="state-overlay">
          <div className="outcome-content">
            <div className="outcome-icon">{state.phase === 'victory' ? <Check size={34} /> : <ShieldAlert size={34} />}</div>
            <h2>{state.phase === 'victory' ? 'ESCAPED' : 'ELIMINATED'}</h2>
            <button className="primary-action" onClick={() => battleStore.restart()}><RotateCcw size={16} /> RESTART BATTLE <span>R</span></button>
          </div>
        </div>
      )}

      {manualOpen && (
        <Modal onClose={() => setManualOpen(false)} label="Battle manual">
          <div className="eyebrow">BLACKWALL_01 / DOCUMENTATION</div>
          <h2>BATTLE MANUAL</h2>
          <div className="manual-grid">
            <section><h3>OBJECTIVE</h3><p>Reduce every hostile’s <strong>Robustness</strong> to zero to escape. Your own health is <strong>Sanity</strong>; at zero, the run ends.</p></section>
            <section><h3>TURN</h3><p>Enemy routes and Curtain targets are exposed first. Plan up to eight operations, execute your Functions, then enemies move and attack one step at a time. Warps reindex last.</p></section>
            <section><h3>BOARD FORECAST</h3><p>The small symbols above the coordinates are the next Warps entering each column. Only columns changed by a pickup or purge drop, so untouched routes remain stable.</p></section>
            <section><h3>CURTAIN</h3><p>Red dashed rows or columns are fixed two turns ahead. When their countdown reaches zero, they seal for your next planning turn. Sealed Warps cannot be entered or collected by either side.</p></section>
            <section><h3>BREAKDOWN</h3><p>At {breakdownAt} Robustness, the Warden enters Stage II: REHEARSAL becomes OVERTURE, CLOSE becomes DEADLOCK, and REPAIR becomes REWRITE. Future Curtains cover both axes around the position you occupied when they were scheduled.</p></section>
            <section><h3>DESIRE</h3><p>The Warden always releases Desire I each turn, and Desire I and II in Stage II, even without Bash Flags. Collected Bash Flags unlock its remaining methods. Every release is previewed before execution.</p></section>
            <section><h3><SquareTerminal size={15} /> BASH</h3><p>Release length is the lower of Bash collected, remaining AP, and IV. Each deck has a frame that sets its range (VECTOR is a 5×5 square, CoT a cross with arm length 5) and four skills, one per Roman numeral. A skill is stronger the later its slot. Decks are built on the main menu.</p></section>
            <section><h3><Shield size={15} /> PRIVILEGE</h3><p>SHELL automatically adds {PLAYER_FUNCTIONS.privilegePerFlag} PRIVILEGE per collected Privilege Flag. PRIVILEGE absorbs incoming damage for the following enemy phase. HP bars show raw damage; PRIVILEGE and REPAIR are listed beneath the bar.</p></section>
            <section><h3><Cpu size={15} /> CORE</h3><p>Every Core Flag advances all three independent counters. REPAIR restores Sanity at the end of the turn, after enemies attack; FOCUS empowers one Bash hit, and FIREWALL adds PRIVILEGE.</p></section>
            <section><h3><Gauge size={15} /> OVERLOAD</h3><p>Five charges enable the only manual Function. The first click or O previews all four methods from the planned endpoint; the second spends one AP, switches to the other deck at once, and releases that deck’s four methods without consuming Bash Flags. Normal end-of-turn Bash still releases afterward. Escape cancels the preview.</p></section>
          </div>
          <div className="controls-table"><span>WASD / ARROWS</span><strong>Plan route</strong><span>DRAG / ONE FINGER</span><strong>Pan map</strong><span>PINCH / WHEEL</span><strong>Zoom map</strong><span>BACKSPACE</span><strong>Undo move</strong><span>SPACE</span><strong>Execute</strong><span>O</span><strong>Overload</strong><span>ESC</span><strong>Pause</strong></div>
        </Modal>
      )}

      {settingsOpen && (
        <Modal onClose={() => setSettingsOpen(false)} label="Settings">
          <h2>SETTINGS</h2>
          <div className="setting-row"><div><strong>AUDIO</strong></div><button className={`toggle ${state.muted ? '' : 'on'}`} onClick={() => battleStore.toggleMute()} aria-label="Toggle audio"><span />{state.muted ? 'MUTED' : 'ON'}</button></div>
          <div className="setting-row"><div><strong>REDUCED MOTION</strong></div><button className={`toggle ${state.reducedMotion ? 'on' : ''}`} onClick={() => battleStore.toggleReducedMotion()} aria-label="Toggle reduced motion"><span />{state.reducedMotion ? 'ON' : 'OFF'}</button></div>
          <button className="secondary-action full-width" onClick={() => { setSettingsOpen(false); battleStore.restart() }}><RotateCcw size={15} /> RESTART BATTLE</button>
          {state.phase !== 'title' && <button className="secondary-action full-width menu-return" onClick={() => { setSettingsOpen(false); battleStore.returnToMenu() }}><HomeIcon size={15} /> RETURN TO MAIN MENU</button>}
        </Modal>
      )}
    </div>
  )
}
