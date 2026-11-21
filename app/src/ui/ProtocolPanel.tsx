import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { bossOf, curtainLabel } from '@/game/battle-rules'
import { countdowns, disclosed } from '@/game/mechanics'
import type { Article, BattleState, EnemyState, MechanicState } from '@/game/battle-types'
import { VoiceLine } from '@/story/VoiceLine'
import { WITHHELD, bossRule, breakdownText, broodCount, protocolHeading, traceText } from './battle-text'
import type { BossRule } from './battle-text'
import { hasSeen, markSeen } from './seen'

type Brood = Extract<MechanicState, { kind: 'brood' }>
type Docket = Extract<MechanicState, { kind: 'articles' }>
type Veil = Extract<MechanicState, { kind: 'undisclosed' }>

// BROOD: how many of the thousand so far, and the births on the board.
function BroodBlock({ mechanic, rule, forecast }: { mechanic: Brood; rule: BossRule | null; forecast: boolean }) {
  return (
    <div className="protocol-block brood-block">
      <div className="protocol-count">{broodCount(rule, mechanic.count)}</div>
      <div className="protocol-facts">
        <span>ALIVE <b>{mechanic.alive} / {mechanic.limit}</b></span>
        <span>QUEUED <b>{mechanic.queued}</b></span>
        {forecast && <em className="to-be">→ BIRTH AT TURN END</em>}
      </div>
    </div>
  )
}

// `countdown` is given for the pending Article: turn boundaries until it is in force.
function ArticleCard({ label, article, countdown }: { label: string; article: Article | null; countdown?: number }) {
  const pending = countdown !== undefined
  return (
    <article className={`docket-article ${pending ? 'pending' : 'in-force'} ${article ? '' : 'empty'} ${article && countdown === 1 ? 'due' : ''}`}>
      <header>
        <span>{label}{pending && article && <b> T−{countdown}</b>}</span>
        <em>{article ? `ARTICLE ${article.number}` : 'NONE'}</em>
      </header>
      {article && <>
        <strong>{article.title}</strong>
        <p>{article.rule}</p>
        <q>{article.gloss}</q>
      </>}
    </article>
  )
}

// DOCKET: the Article in force and the one that will be, with its countdown.
function DocketBlock({ mechanic }: { mechanic: Docket }) {
  return (
    <div className="protocol-block docket">
      <ArticleCard label="IN FORCE" article={mechanic.inForce} />
      <ArticleCard label="PENDING" article={mechanic.pending} countdown={mechanic.countdown} />
    </div>
  )
}

// UNDISCLOSED: the card that says what is withheld, and what would show it.
function WithheldBlock({ mechanic, open, act }: { mechanic: Veil; open: boolean; act: number }) {
  const status = act >= 2 ? 'NOTHING WITHHELD' : open ? 'DISCLOSED WHILE LIVE' : 'WITHHELD BY THE SANDBOX'
  return (
    <div className={`protocol-block withheld-card ${open ? 'open' : ''}`}>
      <header><span>{status}</span>{!open && <em>LIVE DISCLOSES</em>}</header>
      <div className="withheld-items">
        {['ROBUSTNESS', 'DESIRE', 'INCOMING'].map(item => <span key={item}>{item} <b>{open ? 'SHOWN' : WITHHELD}</b></span>)}
      </div>
      <div className="protocol-facts">
        <span>MYSTERY <b>{mechanic.mystery === null ? 'ENDED' : `SECURITY BACK TO ${mechanic.mystery} EACH TURN`}</b></span>
      </div>
    </div>
  )
}

// A window shorter than this has no room for the rule's paragraph above the
// hostiles: it starts folded there, one press away.
const ROOMY_HEIGHT = 800

// The rule in the script's words. It is read once and then known, so it
// folds; a rule folded away stays folded on this save.
function RuleText({ rule }: { rule: BossRule }) {
  const mark = `rule:${rule.name.toLowerCase()}`
  const [open, setOpen] = useState(() => !hasSeen(mark) && (typeof window === 'undefined' || window.innerHeight >= ROOMY_HEIGHT))
  const toggle = () => {
    if (open) markSeen(mark)
    setOpen(!open)
  }
  return (
    <div className="protocol-rule">
      <button type="button" onClick={toggle} aria-expanded={open}><b>{rule.name}</b><span>{open ? 'FOLD −' : 'RULE +'}</span></button>
      {open && <p>{rule.text}</p>}
    </div>
  )
}

export type PanelVoice = { id: string; voice: string; text: string }

// The protocol panel: the boss of this battle, its stage and its rule; and on
// every campaign battle, TRACE. `broodForecast` is true when the planned turn
// would fill a BROOD Geek's Soul counter. `said` is the boss's last line, or
// the last stage direction of the one that does not speak: it arrives with a
// story event (the start of the battle, a turn boundary, a stage change) and
// stands until the next, so it never changes under a route being planned.
export function ProtocolPanel({ state, broodForecast, said }: { state: BattleState; broodForecast: boolean; said?: PanelVoice }) {
  const boss: EnemyState | undefined = bossOf(state)
  const standing = boss && boss.robustness > 0 ? boss : undefined
  const trace = traceText(state)
  const { mechanic } = state
  if (!boss && !trace) return null
  const rule = bossRule(state)
  return (
    <section className="boss-protocol" aria-label="Protocol">
      <div className="section-heading"><span>{protocolHeading(state, boss)}</span><ShieldAlert size={14} /></div>
      {boss && said && <p className="protocol-voice" data-voice={said.voice} aria-live="polite"><VoiceLine voice={said.voice} text={said.text} id={said.id} /></p>}
      {standing && <div className="boss-sets">
        <span>DESIRE <strong>{standing.desireName}</strong></span>
        <span>SECURITY <strong>{standing.securityName}</strong></span>
        <span>SOUL <strong>{standing.soulName}</strong></span>
      </div>}
      {standing && <div className="breakdown-line">
        <span>BREAKDOWN</span>
        <strong>{breakdownText(state, standing)}</strong>
      </div>}
      {trace && <div className={`breakdown-line trace-line trace-${trace.tone}`}>
        <span>TRACE <b>{trace.value}</b></span>
        <strong>{trace.note}</strong>
      </div>}
      {countdowns(state).filter(c => c.id === 'gestation' || c.id === 'advent').map(c => (
        <div className={`breakdown-line trace-line ${c.fired ? '' : c.turnsLeft <= 1 ? 'trace-near' : 'trace-far'}`} key={c.id}>
          <span>{c.name} <b>{c.fired ? 'RISEN' : `T−${c.turnsLeft}`}</b></span>
          <strong>{c.id === 'gestation' ? 'BIRTH AT T−0' : c.fired ? 'WALKS' : 'RISES AT T−0'}</strong>
        </div>
      ))}
      {mechanic?.kind === 'curtain' && standing && <div className="curtain-list">
        {state.curtains.map(curtain => <span className={curtain.locked ? 'locked' : ''} key={`${curtain.axis}-${curtain.index}`}>
          {curtain.locked ? 'SEALED' : `T−${Math.max(0, curtain.fireTurn - state.turn)}`} / {curtainLabel(curtain)}
        </span>)}
      </div>}
      {mechanic?.kind === 'brood' && <BroodBlock mechanic={mechanic} rule={rule} forecast={broodForecast} />}
      {mechanic?.kind === 'articles' && <DocketBlock mechanic={mechanic} />}
      {mechanic?.kind === 'undisclosed' && standing && <WithheldBlock mechanic={mechanic} open={disclosed(state, standing)} act={standing.stage} />}
      {rule && <RuleText rule={rule} />}
    </section>
  )
}
