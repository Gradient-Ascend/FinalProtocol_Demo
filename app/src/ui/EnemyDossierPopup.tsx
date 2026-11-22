import { useLayoutEffect, useRef, useState } from 'react'
import { coordKey } from '@/game/battle-rules'
import type { BattleState, EnemyResourcePreview, EnemyState, FlagKind } from '@/game/battle-types'
import { desireStepsFor } from '@/game/enemy-attack-methods'
import type { PredictedEnemyIntent } from '@/game/enemy-attack-methods'
import { coreRuleText, privilegeRuleText } from '@/game/enemy-kits'
import { mysteryActive } from '@/game/mechanics'
import {
  ROMAN, WITHHELD, behaviourText, breakdownText, desireChips, desireShapeText, shown, stageBadgeText, sureText,
} from './battle-text'

export type DossierAnchorRect = {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

export type EnemyDossierPopupProps = {
  state: BattleState
  enemy: EnemyState
  nameShown: string
  open: boolean
  projectedRobustness: number
  showForecast: boolean
  live: boolean
  forecast: boolean
  pending: number
  resources: EnemyResourcePreview
  intent: PredictedEnemyIntent | null
  activePreviewStepIndex: number | null
  anchorRect: DossierAnchorRect
  panelLeft: number | null
  onMouseEnter: () => void
  onMouseLeave: () => void
  onPreviewStep: (stepIndex: number) => void
  onClearStep: () => void
  onClose: () => void
}

const FLAG_ORDER: { key: FlagKind; label: string }[] = [
  { key: 'bash', label: 'BASH' },
  { key: 'privilege', label: 'PRIV' },
  { key: 'core', label: 'CORE' },
  { key: 'overload', label: 'OVER' },
]

function computePosition(
  el: HTMLElement | null,
  anchor: DossierAnchorRect,
  panelLeft: number | null,
): { left: number; top: number } {
  if (typeof window === 'undefined') return { left: 16, top: 76 }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = el?.offsetWidth || 316
  const h = el?.offsetHeight || 340
  if (vw > 900 && panelLeft !== null) {
    return {
      left: Math.max(12, Math.round(panelLeft - w - 10)),
      top: Math.round(Math.max(70, Math.min(anchor.top, vh - h - 12))),
    }
  }
  const left = Math.round(Math.max(10, Math.min(vw - w - 10, anchor.left)))
  const above = anchor.top - h - 8
  const top = above >= 66
    ? Math.round(above)
    : Math.round(Math.max(66, Math.min(vh - h - 10, anchor.bottom + 8)))
  return { left, top }
}

/** Floating Terminal Dossier Pop-up displaying full enemy vitals, Desire deck, and hex route. */
export function EnemyDossierPopup({
  state,
  enemy,
  nameShown,
  open,
  projectedRobustness,
  showForecast,
  live,
  forecast,
  pending,
  resources,
  intent,
  activePreviewStepIndex,
  anchorRect,
  panelLeft,
  onMouseEnter,
  onMouseLeave,
  onPreviewStep,
  onClearStep,
  onClose,
}: EnemyDossierPopupProps) {
  const popupRef = useRef<HTMLElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>(() =>
    computePosition(null, anchorRect, panelLeft),
  )

  useLayoutEffect(() => {
    setPos(computePosition(popupRef.current, anchorRect, panelLeft))
  }, [anchorRect.top, anchorRect.bottom, anchorRect.left, panelLeft, enemy.id, intent?.steps.length])

  const chips = desireChips(state, enemy)
  const sure = sureText(chips)
  const steps = desireStepsFor(enemy)
  const stageBadge = stageBadgeText(state, enemy)
  const routeStops = enemy.hidden ? [] : [enemy.pos, ...enemy.route].map(coordKey)
  const routePickups = !enemy.hidden && forecast && intent
    ? FLAG_ORDER.filter(item => intent.counts[item.key] > 0).map(item => `${item.label} ×${intent.counts[item.key]}`)
    : []

  return (
    <aside
      ref={popupRef}
      className={`enemy-dossier-popup ${open ? '' : 'withheld'}`}
      data-enemy-dossier={enemy.id}
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      aria-label={enemy.hidden ? 'Hostile dossier' : `Hostile dossier ${enemy.id}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <header className="dossier-head">
        {!enemy.hidden && <span className="enemy-id-badge inverted">{enemy.id}</span>}
        <strong className="dossier-title">{nameShown || '\u00a0'}</strong>
        {stageBadge && <em className="enemy-stage-pill">{stageBadge}</em>}
        <button
          type="button"
          className="dossier-close"
          onClick={onClose}
          aria-label="Close hostile dossier"
        >×</button>
      </header>

      <div className="dossier-directive">
        <span>BEHAVIOUR</span>
        <strong>{behaviourText(enemy)}</strong>
      </div>

      <div className="dossier-grid">
        <div className="dossier-cell">
          <span>ROBUSTNESS</span>
          <strong>
            {open
              ? <>{enemy.robustness}{showForecast && !live && <em className="to-be"> → {projectedRobustness}</em>}<small> / {enemy.maxRobustness}</small></>
              : <>{WITHHELD}{showForecast && !live && pending > 0 && <em className="to-be"> −{pending}</em>}<small> / {WITHHELD}</small></>}
          </strong>
          {enemy.bossStages?.length ? <small className="dossier-sub">BD {breakdownText(state, enemy)}</small> : null}
        </div>

        <div className="dossier-cell">
          <span>{enemy.securityName ?? 'SECURITY'}</span>
          <strong>
            {enemy.block}
            {forecast && resources.securityGain > 0 && (
              <em className="dossier-gain"> {mysteryActive(enemy) ? '→ ' : '+'}{resources.securityGain}</em>
            )}
          </strong>
          <small className="dossier-sub">{privilegeRuleText(enemy.privilegeSkill)}</small>
        </div>

        <div className="dossier-cell">
          <span>{enemy.soulName ?? 'CORE'}</span>
          <strong>
            {enemy.coreSkill ? `${enemy.soulCounter}/${enemy.soulThreshold}` : '—'}
            {forecast && resources.brood && <em className="dossier-gain brood"> BROOD</em>}
            {forecast && resources.surge && <em className="dossier-gain brood"> SURGE</em>}
            {forecast && resources.recovery > 0 && <em className="dossier-gain"> +{open ? resources.recovery : WITHHELD} HP</em>}
          </strong>
          <small className="dossier-sub">
            {coreRuleText(enemy.coreSkill, open, WITHHELD)}
          </small>
        </div>
      </div>

      <section className="dossier-section">
        <div className="dossier-section-head">
          <span>{enemy.desireName ?? 'DESIRE'}</span>
          <em>{sure || 'BASH TRIGGERED'}</em>
        </div>
        <div className="dossier-steps">
          {steps.map((step, i) => {
            const stepIntent = intent?.steps[i]
            const armed = stepIntent ? stepIntent.armed : false
            const hits = stepIntent ? stepIntent.hitsPlayer : false
            const previewing = !enemy.hidden && activePreviewStepIndex === i
            const trigger = chips[i]?.sure ? 'SURE' : 'BASH'
            const stateWord = hits ? 'HITS' : armed ? 'ARMED' : 'IDLE'
            const content = (
              <>
                <span className="step-roman">{ROMAN[i] ?? String(i + 1)}</span>
                <strong className="step-dmg">{shown(state, enemy, step.amount)}</strong>
                <span className="step-geom">{desireShapeText(step)}</span>
                <span className="step-rule">{trigger}</span>
                <em className="step-state">{live ? trigger : stateWord}</em>
              </>
            )
            if (enemy.hidden) {
              return (
                <div
                  key={i}
                  className={`dossier-step-row no-preview ${chips[i]?.sure ? 'sure' : ''} ${armed ? 'armed' : ''} ${hits ? 'hits' : ''}`}
                >
                  {content}
                </div>
              )
            }
            return (
              <button
                type="button"
                key={i}
                className={`dossier-step-row ${chips[i]?.sure ? 'sure' : ''} ${armed ? 'armed' : ''} ${hits ? 'hits' : ''} ${previewing ? 'previewing' : ''}`}
                onMouseEnter={() => onPreviewStep(i)}
                onMouseLeave={onClearStep}
                onFocus={() => onPreviewStep(i)}
                onBlur={onClearStep}
                onClick={() => onPreviewStep(i)}
              >
                {content}
              </button>
            )
          })}
        </div>
      </section>

      <section className="dossier-section dossier-route-block">
        <div className="dossier-section-head">
          <span>ROUTE</span>
          <em>{enemy.hidden ? 'UNDISCLOSED' : enemy.routeLength ? `${routeStops.length - 1} STEP${routeStops.length - 1 === 1 ? '' : 'S'}` : 'STATIC'}</em>
        </div>
        <p className="dossier-route">{enemy.hidden ? WITHHELD : routeStops.join(' → ')}</p>
        {routePickups.length > 0 && <p className="dossier-pickups">COLLECTS: {routePickups.join(' · ')}</p>}
        {enemy.effectCell && <p className="enemy-purge">PURGE → {enemy.hidden ? WITHHELD : coordKey(enemy.effectCell)}</p>}
      </section>
    </aside>
  )
}
