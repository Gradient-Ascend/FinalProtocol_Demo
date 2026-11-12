import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  Activity, ArrowRight, BookOpen, Check, ChevronRight, Circle, Cpu, Gauge,
  Hexagon, Maximize2, Minimize2, Play, RotateCcw, Settings, Shield, ShieldAlert, SquareTerminal,
  X, Zap,
} from 'lucide-react'
import { useFullscreen } from '@/hooks/useFullscreen'
import { startGame, stopGame, zoomMap } from '@/game/boot'
import { battleStore } from '@/game/battle-store'
import { BASH_PRESETS, MAX_ACTIONS, OVERLOAD_THRESHOLD } from '@/game/battle-config'
import { coordKey, curtainLabel } from '@/game/battle-rules'
import { mechanicText, predictedSequence, rangeText, releaseCount } from '@/game/attack-methods'
import { predictedEnemySequence } from '@/game/enemy-attack-methods'
import type { PredictedEnemyHit } from '@/game/enemy-attack-methods'
import type { PredictedHit } from '@/game/attack-methods'
import type { EnemyState, FlagKind } from '@/game/battle-types'

const ROMAN = ['I', 'II', 'III', 'IV']

function FlagIcon({ kind, size = 16 }: { kind: FlagKind; size?: number }) {
  if (kind === 'bash') return <SquareTerminal size={size} strokeWidth={1.7} />
  if (kind === 'privilege') return <Shield size={size} strokeWidth={1.7} />
  if (kind === 'core') return <Cpu size={size} strokeWidth={1.7} />
  if (kind === 'overload') return <Gauge size={size} strokeWidth={1.7} />
  return <Circle size={size * 0.45} strokeWidth={1.7} />
}

function Bar({ value, max, hits, onPreview, onLeave }: {
  value: number
  max: number
  hits: PredictedEnemyHit[]
  onPreview: (enemyId: string, stepIndex: number) => void
  onLeave: () => void
}) {
  const projected = hits.length ? hits[hits.length - 1].after : value
  return (
    <div className="stat-bar segmented-health player-sanity" aria-label={`Projected Sanity ${projected} of ${max}`}>
      <span className="health-current" style={{ width: `${Math.max(0, Math.min(100, projected / max * 100))}%` }} />
      {hits.filter(hit => hit.before > hit.after).map((hit, index) => (
        <button
          type="button"
          key={`${hit.enemyId}-${hit.stepIndex}-${index}`}
          className="health-segment incoming-segment"
          style={{ left: `${hit.after / max * 100}%`, width: `${(hit.before - hit.after) / max * 100}%` }}
          onMouseEnter={() => onPreview(hit.enemyId, hit.stepIndex)}
          onMouseLeave={onLeave}
          onFocus={() => onPreview(hit.enemyId, hit.stepIndex)}
          onBlur={onLeave}
          onClick={() => onPreview(hit.enemyId, hit.stepIndex)}
          aria-label={`Preview ${hit.enemyId} attack ${hit.stepIndex + 1}: ${hit.dealt} Sanity damage`}
        />
      ))}
    </div>
  )
}

function SegmentedHealth({ enemy, hits, previewStep, onPreview, onLeave }: {
  enemy: EnemyState
  hits: PredictedHit[]
  previewStep: number | null
  onPreview: (step: number) => void
  onLeave: () => void
}) {
  const projected = hits.length ? hits[hits.length - 1].after : enemy.robustness
  return (
    <div className="segmented-health" aria-label={`Projected Desire ${projected} of ${enemy.maxRobustness}`}>
      <span className="health-current" style={{ width: `${projected / enemy.maxRobustness * 100}%` }} />
      {hits.filter(hit => hit.before > hit.after).map(hit => (
        <button
          type="button"
          key={hit.stepIndex}
          className={`health-segment segment-${hit.stepIndex} ${previewStep === hit.stepIndex ? 'previewing' : ''}`}
          style={{ left: `${hit.after / enemy.maxRobustness * 100}%`, width: `${(hit.before - hit.after) / enemy.maxRobustness * 100}%` }}
          onMouseEnter={() => onPreview(hit.stepIndex)}
          onMouseLeave={onLeave}
          onFocus={() => onPreview(hit.stepIndex)}
          onBlur={onLeave}
          onClick={() => onPreview(hit.stepIndex)}
          aria-label={`Preview action ${hit.stepIndex + 1}: ${hit.dealt} damage`}
        />
      ))}
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
  const [manualOpen, setManualOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [methodInspector, setMethodInspector] = useState<{ presetIndex: number; stepIndex: number } | null>(null)
  const [bashView, setBashView] = useState(0)
  const [devicePanel, setDevicePanel] = useState<'operator' | 'geeks'>('operator')
  const [mapZoom, setMapZoom] = useState(1)
  const clearTimer = useRef<number | null>(null)

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
  const usedOverload = state.actions.some(action => action.type === 'overload')
  const displayActiveBash = state.overloadArmed ? 1 - state.player.activeBash : state.player.activeBash
  const previewState = state.overloadArmed
    ? {
        ...state,
        player: { ...state.player, activeBash: displayActiveBash },
        actions: [...state.actions, { type: 'overload' as const }],
      }
    : plannedState
  const incomingSequence = state.phase === 'planning' ? predictedEnemySequence(previewState) : []
  const incomingDamage = incomingSequence.reduce((total, hit) => total + hit.dealt, 0)
  const sequence = usedOverload ? [] : predictedSequence(previewState)
  const singleStep = methodInspector && state.attackPreview
    ? state.attackPreview.stepIndex
    : state.overloadArmed ? null : state.attackPreview?.stepIndex ?? null
  const visibleSequence = singleStep === null ? sequence : sequence.filter(hit => hit.stepIndex === singleStep)
  const expected: Record<string, number> = {}
  for (const hit of visibleSequence) expected[hit.enemyId] = (expected[hit.enemyId] ?? 0) + hit.dealt
  const aliveEnemies = state.enemies.filter(enemy => enemy.robustness > 0)
  const boss = aliveEnemies.find(enemy => enemy.bossStages?.length)
  const affectedEnemies = aliveEnemies.filter(enemy => visibleSequence.some(hit => hit.enemyId === enemy.id))
  const canAct = state.phase === 'planning'
  const releases = usedOverload ? 0 : releaseCount(previewState)
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
    selectBashView((bashView + direction + BASH_PRESETS.length) % BASH_PRESETS.length)
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
                {incomingDamage > 0 && <em className="player-to-be">→ {incomingSequence[incomingSequence.length - 1]?.after}</em>}
              </div>
              <div className="stat-label">Desires' Scissors</div>
              {incomingDamage > 0 && <div className="incoming-preview">INCOMING −{incomingDamage}</div>}
            </div>
          </section>
          <Bar value={state.player.sanity} max={state.player.maxSanity} hits={incomingSequence} onPreview={previewEnemyAttack} onLeave={clearEnemyAttackPreview} />
          <div className="status-row">
            <span className={state.player.block ? 'status-chip active' : 'status-chip'}><Shield size={12} /> PRIVILEGE {state.player.block}</span>
            {state.player.focusReady && <span className="status-chip active"><Zap size={12} /> CORE +2</span>}
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
                {BASH_PRESETS.map((preset, index) => (
                  <button
                    type="button"
                    className={bashView === index ? 'view-dot active' : 'view-dot'}
                    onClick={() => selectBashView(index)}
                    aria-label={`Show ${preset.name}`}
                    aria-pressed={bashView === index}
                    key={preset.id}
                  />
                ))}
              </div>
              {(() => {
                const preset = BASH_PRESETS[bashView]
                const index = bashView
                return <div className={`preset ${displayActiveBash === index ? 'selected' : ''}`}>
                  <div className="preset-title">
                    <strong>{preset.name}</strong>
                    <span>{displayActiveBash === index ? (releases ? ROMAN[releases - 1] : '—') : 'STANDBY'}</span>
                  </div>
                  <div className="action-indicators" aria-label={`${preset.name} release methods`}>
                    {preset.steps.map((step, i) => (
                      <button
                        type="button"
                        className={`action-indicator ${displayActiveBash === index && i < releases ? 'lit' : ''} ${inspector?.presetIndex === index && inspector.stepIndex === i ? 'inspecting' : ''}`}
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
              <span>{state.overloadArmed ? 'CONFIRM OVERLOAD' : 'OVERLOAD'}</span>
              <strong>{state.player.overload} / {OVERLOAD_THRESHOLD}</strong>
            </button>
            <div className={`method-detail ${inspector ? 'active' : ''}`} aria-live="polite" onMouseEnter={cancelMethodClear} onMouseLeave={scheduleMethodClear}>
              {inspector && (() => {
                const step = BASH_PRESETS[inspector.presetIndex].steps[inspector.stepIndex]
                return <>
                  <button type="button" className="method-close" onMouseDown={event => event.preventDefault()} onClick={clearMethodPreview} aria-label="Close method preview">×</button>
                  <strong>{BASH_PRESETS[inspector.presetIndex].name} / {ROMAN[inspector.stepIndex]} {step.name}</strong>
                  <p>{mechanicText(step)}</p>
                  <span>{rangeText(step)}</span>
                </>
              })()}
            </div>
          </section>

          <section className="panel-section compact-section">
            <div className="section-heading"><span>PRIVILEGE</span><Shield size={14} /></div>
            <div className="defense-function"><strong>SHELL</strong><span>+2 Block / Flag</span></div>
          </section>

          <section className="panel-section buff-section">
            <div className="section-heading"><span>CORE</span><Cpu size={14} /></div>
            <div className="buff-list">
              {state.player.buffs.map(buff => (
                <div className="buff-row" key={buff.id}>
                  <div><strong>{buff.name}</strong><span>{buff.description}</span></div>
                  <div className="buff-counter">
                    <div className="counter-ticks">
                      {Array.from({ length: buff.threshold }, (_, i) => <i className={i < buff.counter ? 'on' : ''} key={i} />)}
                    </div>
                    <span>{buff.counter}/{buff.threshold}</span>
                  </div>
                </div>
              ))}
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
            <div className="section-heading"><span>{boss ? 'WARDEN TARGET' : 'AFFECTED GEEKS'}</span><strong>{affectedEnemies.length}</strong></div>
            <div className="enemy-list">
              {affectedEnemies.map(enemy => {
                const hits = visibleSequence.filter(hit => hit.enemyId === enemy.id)
                const projected = hits.length ? hits[hits.length - 1].after : enemy.robustness
                return (
                  <article className="enemy-card affected" key={enemy.id}>
                    <div className="enemy-card-head">
                      <div className="enemy-avatar"><Hexagon size={27} strokeWidth={1.4} /><span>{enemy.id}</span></div>
                      <div className="enemy-name"><strong>{enemy.name}</strong><span className="damage-preview">{singleStep !== null ? 'THIS ACTION' : 'DAMAGE PREVIEW'} −{expected[enemy.id]}</span></div>
                    </div>
                    <div className="enemy-hp">
                      <strong>{enemy.robustness} <em className="to-be">→ {projected}</em><small> / {enemy.maxRobustness}</small></strong>
                      <span>DESIRE</span>
                    </div>
                    <SegmentedHealth
                      enemy={enemy}
                      hits={hits}
                      previewStep={state.attackPreview?.stepIndex ?? null}
                      onPreview={step => previewMethod(displayActiveBash, step)}
                      onLeave={clearMethodPreview}
                    />
                    <div className="enemy-status">
                      <span>SECURITY {enemy.block}</span><span>SOUL {enemy.soulCounter}/{enemy.soulThreshold}</span>
                    </div>
                    <div className="enemy-functions">
                      <span title={`${enemy.desireShape} Desire range ${enemy.desireRange}`}><Activity size={12} /> {enemy.desireName ?? 'DESIRE'}</span>
                      <span title="Security defense set"><Shield size={12} /> {enemy.securityName ?? 'SECURITY'}</span>
                      <span title="Soul buff set"><Cpu size={12} /> {enemy.soulName ?? 'SOUL'}</span>
                      {enemy.bossStages && <span title="Breakdown stage transition"><ShieldAlert size={12} /> BREAKDOWN</span>}
                    </div>
                    <div className="enemy-route">
                      <span>{enemy.behavior.toUpperCase()} / ROUTE</span>
                      <p>{[enemy.pos, ...enemy.route].map(coordKey).join(' → ')}</p>
                      {enemy.effectCell && <p className="enemy-purge">PURGE → {coordKey(enemy.effectCell)}</p>}
                    </div>
                  </article>
                )
              })}
              {!affectedEnemies.length && <div className="empty-geeks">{boss ? 'NO WARDEN IN EFFECT' : 'NO GEEKS IN EFFECT'}</div>}
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
          </div>
        </div>
      )}

      {state.phase === 'paused' && (
        <div className="state-overlay">
          <div className="pause-content">
            <h2>PAUSED</h2>
            <button className="primary-action" onClick={() => battleStore.togglePause()}><Play size={16} /> RESUME</button>
            <button className="secondary-action" onClick={() => battleStore.restart()}><RotateCcw size={15} /> RESTART BATTLE</button>
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
            <section><h3>BREAKDOWN</h3><p>At 18 Robustness, the Warden enters Stage II: REHEARSAL becomes OVERTURE, CLOSE becomes DEADLOCK, and REPAIR becomes REWRITE. Future Curtains cover both axes around the position you occupied when they were scheduled.</p></section>
            <section><h3><SquareTerminal size={15} /> BASH</h3><p>Release length is the lower of Bash collected, remaining AP, and IV. VECTOR uses a 5×5 square; CoT uses a cross with arm length 5. Each Roman numeral is a different attack method.</p></section>
            <section><h3><Shield size={15} /> PRIVILEGE</h3><p>SHELL automatically adds 2 Block per collected Privilege Flag. Block absorbs incoming damage for the following enemy phase.</p></section>
            <section><h3><Cpu size={15} /> CORE</h3><p>Every Core Flag advances all three independent counters. REPAIR heals, FOCUS empowers one Bash hit, and FIREWALL adds Block.</p></section>
            <section><h3><Gauge size={15} /> OVERLOAD</h3><p>Five charges enable the only manual Function. The first click or O previews its range and damage; the second releases it. It costs one action, switches Bash preset, and releases min(Bash collected, remaining AP, IV). Escape cancels the preview.</p></section>
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
        </Modal>
      )}
    </div>
  )
}
