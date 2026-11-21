import { useEffect, useState } from 'react'
import { ArrowLeft, Cpu, RotateCcw, Shield, SquareTerminal } from 'lucide-react'
import type { CoreBuff } from '@/game/battle-types'
import {
  DEFAULT_LOADOUT, FRAMES, SKILLS, assignSkill, cloneLoadout, frameById, skillById, slotLabel,
} from '@/game/skills'
import type { Loadout, SkillId } from '@/game/skills'
import type { Tuning } from '@/game/tuning'
import { DeckPreviewStage } from './DeckPreviewStage'
import type { DeckPreviewSpec } from './DeckPreviewStage'
import { useOverlayKeyLock } from './Modal'
import { attackSkillCard, coreSkillCard, privilegeSkillCard } from './skill-descriptions'
import type { CardToken, SkillCardCopy } from './skill-descriptions'

export type DeckTabId = 'attack-1' | 'attack-2' | 'privilege' | 'core'

const ROMAN = ['I', 'II', 'III', 'IV']

export type DeckBuilderPageProps = {
  loadout: Loadout
  buffs: CoreBuff[]
  tuning: Tuning
  reducedMotion: boolean
  backLabel?: string
  onChange: (next: Loadout) => void
  onReset?: () => void
  onBack: () => void
}

function renderTokens(tokens: CardToken[]) {
  return tokens.map((tok, i) => {
    if (tok.kind === 'text') return <span key={i}>{tok.text}</span>
    return <span key={i} className={`card-tok tok-${tok.kind}`}>{tok.text}</span>
  })
}

function CardExplanation({
  copy,
  activeLevel,
  onSelectLevel,
  skillId,
}: {
  copy: SkillCardCopy
  activeLevel?: number
  onSelectLevel?: (level: number) => void
  skillId?: SkillId
}) {
  const skill = skillId ? skillById(skillId) : null
  return (
    <div className="deck-card-explain" aria-live="polite">
      <header className="explain-head">
        <div>
          <span className="explain-cat">{copy.category}</span>
          <h3>{copy.name}</h3>
        </div>
        <div className="explain-badges">
          {copy.roleBadges.map(b => (
            <span key={b.label} className={`explain-badge tone-${b.tone}`}>{b.label}</span>
          ))}
        </div>
      </header>

      {skill && activeLevel !== undefined && onSelectLevel && (
        <div className="explain-levels" role="group" aria-label="Level scaling">
          {ROMAN.map((num, idx) => (
            <button
              type="button"
              key={num}
              className={`explain-level-chip ${activeLevel === idx ? 'active' : ''}`}
              onClick={() => onSelectLevel(idx)}
            >
              <span>{num}</span>
              <strong>{slotLabel(skill, idx)}</strong>
            </button>
          ))}
        </div>
      )}

      <div className="explain-body">
        {copy.lines.map((line, i) => (
          <p key={i} className="explain-line">{renderTokens(line)}</p>
        ))}
      </div>

      <p className="explain-timing">{copy.timingNote}</p>

      {copy.glossary.length > 0 && (
        <dl className="explain-glossary">
          {copy.glossary.map(item => (
            <div key={item.term} className="explain-term">
              <dt>{item.term}</dt>
              <dd>{item.summary}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/** Windows 11 File Explorer-inspired 3-pane Deck Builder page. */
export function DeckBuilderPage({
  loadout,
  buffs,
  tuning,
  reducedMotion,
  backLabel = 'TITLE',
  onChange,
  onReset,
  onBack,
}: DeckBuilderPageProps) {
  useOverlayKeyLock(true)

  const [tab, setTab] = useState<DeckTabId>('attack-1')
  const [slots, setSlots] = useState<[number, number]>([0, 0])
  const [previewLevel, setPreviewLevel] = useState<number>(0)
  const [inspectedSkillId, setInspectedSkillId] = useState<SkillId>(() => loadout[0].skills[0])
  const [inspectedCoreId, setInspectedCoreId] = useState<CoreBuff['id']>(() => buffs[0]?.id ?? 'repair')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onBack()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onBack])

  const deckIndex = tab === 'attack-2' ? 1 : 0
  const isAttackTab = tab === 'attack-1' || tab === 'attack-2'
  const activeDeck = loadout[deckIndex]
  const activeFrame = frameById(activeDeck.frame)
  const activeSlot = slots[deckIndex]

  const switchTab = (next: DeckTabId) => {
    setTab(next)
    if (next === 'attack-1' || next === 'attack-2') {
      const idx = next === 'attack-2' ? 1 : 0
      const sl = slots[idx]
      setInspectedSkillId(loadout[idx].skills[sl])
      setPreviewLevel(sl)
    }
  }

  const selectSlot = (slotIdx: number) => {
    setSlots(prev => (deckIndex === 0 ? [slotIdx, prev[1]] : [prev[0], slotIdx]))
    setInspectedSkillId(activeDeck.skills[slotIdx])
    setPreviewLevel(slotIdx)
  }

  const cycleFrame = () => {
    const next = cloneLoadout(loadout)
    const at = FRAMES.findIndex(f => f.id === next[deckIndex].frame)
    next[deckIndex].frame = FRAMES[(at + 1) % FRAMES.length].id
    onChange(next)
  }

  const setFrame = (frameId: typeof FRAMES[number]['id']) => {
    if (activeDeck.frame === frameId) return
    const next = cloneLoadout(loadout)
    next[deckIndex].frame = frameId
    onChange(next)
  }

  const placementOf = (id: SkillId): string | null => {
    for (const [dIdx, deck] of loadout.entries()) {
      const sIdx = deck.skills.findIndex(s => s === id)
      if (sIdx >= 0) return `${'AB'[dIdx]}·${ROMAN[sIdx]}`
    }
    return null
  }

  const breadcrumb = tab === 'attack-1'
    ? 'ATTACK SET 1'
    : tab === 'attack-2'
    ? 'ATTACK SET 2'
    : tab === 'privilege'
    ? 'PRIVILEGE DECK'
    : 'CORE DECK'

  const inspectedSkill = skillById(inspectedSkillId)
  const inspectedBuff = buffs.find(b => b.id === inspectedCoreId) ?? buffs[0]

  const previewSpec: DeckPreviewSpec = isAttackTab
    ? {
        kind: 'attack',
        skill: inspectedSkill,
        frame: activeFrame,
        level: previewLevel,
        onLevelChange: setPreviewLevel,
      }
    : tab === 'privilege'
    ? { kind: 'privilege', privilegePerFlag: tuning.privilegePerFlag }
    : { kind: 'core', buff: inspectedBuff, tuning }

  const cardCopy: SkillCardCopy = isAttackTab
    ? attackSkillCard(inspectedSkill, previewLevel, activeFrame)
    : tab === 'privilege'
    ? privilegeSkillCard(tuning.privilegePerFlag)
    : coreSkillCard(inspectedBuff, tuning)

  const handleReset = () => {
    if (onReset) onReset()
    else onChange(cloneLoadout(DEFAULT_LOADOUT))
  }

  return (
    <div className="deck-page" role="dialog" aria-modal="true" aria-label="Deck builder">
      <header className="deck-topbar">
        <button type="button" className="deck-back-btn" onClick={onBack}>
          <ArrowLeft size={15} />
          <span>{backLabel}</span>
        </button>
        <nav className="deck-breadcrumb" aria-label="Deck path">
          <span>PROTOCOL</span>
          <i>›</i>
          <span>DECKS</span>
          <i>›</i>
          <strong>{breadcrumb}</strong>
        </nav>
        <div className="deck-topbar-actions">
          {isAttackTab && (
            <div className="deck-frame-switch" role="group" aria-label="Deck frame">
              {FRAMES.map(frame => (
                <button
                  key={frame.id}
                  type="button"
                  className={`deck-frame-btn ${activeDeck.frame === frame.id ? 'active' : ''}`}
                  aria-pressed={activeDeck.frame === frame.id}
                  onClick={() => setFrame(frame.id)}
                  title={frame.description}
                >
                  {frame.name}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="deck-reset-btn"
            onClick={handleReset}
            title="Restore default attack loadouts"
          >
            <RotateCcw size={13} />
            <span>DEFAULT</span>
          </button>
        </div>
      </header>

      <div className="deck-workbench">
        {/* Left: thin bare icon rail (no wrapping containers around icons) */}
        <nav className="deck-rail" aria-label="Deck categories">
          <button
            type="button"
            className={`deck-rail-item ${tab === 'attack-1' ? 'active' : ''}`}
            aria-label="Attack Set 1"
            aria-current={tab === 'attack-1' ? 'page' : undefined}
            title="Attack Set 1 (Starts Active)"
            onClick={() => switchTab('attack-1')}
          >
            <SquareTerminal size={19} strokeWidth={1.7} />
            <span>1</span>
          </button>
          <button
            type="button"
            className={`deck-rail-item ${tab === 'attack-2' ? 'active' : ''}`}
            aria-label="Attack Set 2"
            aria-current={tab === 'attack-2' ? 'page' : undefined}
            title="Attack Set 2 (On Overload)"
            onClick={() => switchTab('attack-2')}
          >
            <SquareTerminal size={19} strokeWidth={1.7} />
            <span>2</span>
          </button>
          <button
            type="button"
            className={`deck-rail-item ${tab === 'privilege' ? 'active' : ''}`}
            aria-label="Privilege Deck"
            aria-current={tab === 'privilege' ? 'page' : undefined}
            title="Privilege Deck"
            onClick={() => switchTab('privilege')}
          >
            <Shield size={19} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            className={`deck-rail-item ${tab === 'core' ? 'active' : ''}`}
            aria-label="Core Deck"
            aria-current={tab === 'core' ? 'page' : undefined}
            title="Core Deck"
            onClick={() => switchTab('core')}
          >
            <Cpu size={19} strokeWidth={1.7} />
          </button>
        </nav>

        {/* Middle: wide Explorer-style details list (only names and attributes) */}
        <section className="deck-list-pane" aria-label="Deck skills">
          {isAttackTab && (
            <>
              <div className="deck-pane-head">
                <div>
                  <span className="deck-pane-kicker">
                    BASH DECK {'AB'[deckIndex]} · {deckIndex === 0 ? 'STARTS ACTIVE' : 'ON OVERLOAD'}
                  </span>
                  <button
                    type="button"
                    className="deck-frame-inline"
                    onClick={cycleFrame}
                    title="Cycle attack frame"
                  >
                    <strong>{activeFrame.name}</strong>
                    <span>{activeFrame.description}</span>
                  </button>
                </div>
                <span className="deck-pane-meta">ASSIGN TO {'AB'[deckIndex]}·{ROMAN[activeSlot]}</span>
              </div>

              <div className="deck-slot-bar" role="group" aria-label="Equipped slots">
                {activeDeck.skills.map((id, idx) => {
                  const sk = skillById(id)
                  const selected = activeSlot === idx
                  return (
                    <button
                      type="button"
                      key={idx}
                      className={`deck-slot-pill ${selected ? 'selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => selectSlot(idx)}
                    >
                      <em>{ROMAN[idx]}</em>
                      <strong>{sk.name}</strong>
                      <span>{slotLabel(sk, idx)}</span>
                    </button>
                  )
                })}
              </div>

              <div className="deck-details-table" role="grid" aria-label="Attack skills pool">
                <div className="deck-details-head" role="row">
                  <span>NAME</span>
                  <span>AREA</span>
                  {ROMAN.map((num, idx) => (
                    <span key={num} className={idx === activeSlot ? 'at-slot' : ''}>{num}</span>
                  ))}
                  <span>ATTR</span>
                  <span>SLOT</span>
                </div>
                <div className="deck-details-rows">
                  {SKILLS.map(skill => {
                    const where = placementOf(skill.id)
                    const isEquippedHere = activeDeck.skills[activeSlot] === skill.id
                    const isInspected = inspectedSkillId === skill.id
                    return (
                      <button
                        type="button"
                        key={skill.id}
                        className={`deck-detail-row ${isEquippedHere ? 'equipped' : ''} ${isInspected ? 'inspected' : ''}`}
                        onMouseEnter={() => setInspectedSkillId(skill.id)}
                        onFocus={() => setInspectedSkillId(skill.id)}
                        onClick={() => {
                          setInspectedSkillId(skill.id)
                          onChange(assignSkill(loadout, deckIndex, activeSlot, skill.id))
                        }}
                      >
                        <strong className="col-name">{skill.name}</strong>
                        <span className="col-area">{skill.area === 'all' ? 'ALL' : 'NEAR'}</span>
                        {skill.amounts.map((_, idx) => (
                          <span key={idx} className={`col-lvl ${idx === activeSlot ? 'at-slot' : ''}`}>
                            {slotLabel(skill, idx)}
                          </span>
                        ))}
                        <span className="col-attr">
                          {skill.writes && <i className="attr-chip write">W:{skill.writes}</i>}
                          {skill.reads && <i className="attr-chip read">R:{skill.reads}</i>}
                        </span>
                        <em className={`col-slot ${where ? 'placed' : ''}`}>{where ?? '—'}</em>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {tab === 'privilege' && (
            <>
              <div className="deck-pane-head">
                <div>
                  <span className="deck-pane-kicker">DEFENSE DECK · FIXED MODULE</span>
                  <h2 className="deck-pane-title">PRIVILEGE</h2>
                </div>
                <span className="deck-pane-meta">AUTO SETTLEMENT</span>
              </div>
              <div className="deck-details-table is-resource" role="grid" aria-label="Privilege skills">
                <div className="deck-details-head is-priv" role="row">
                  <span>NAME</span>
                  <span>TRIGGER</span>
                  <span>GAIN</span>
                  <span>TIMING</span>
                  <span>WINDOW</span>
                </div>
                <div className="deck-details-rows">
                  <div className="deck-detail-row is-priv inspected">
                    <strong className="col-name">SHELL</strong>
                    <span className="col-attr"><i className="attr-chip auto">AUTO</i></span>
                    <span className="col-val">+{tuning.privilegePerFlag} PRIV / FLAG</span>
                    <span className="col-area">POST-MOVE</span>
                    <em className="col-slot placed">1 PHASE</em>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'core' && (
            <>
              <div className="deck-pane-head">
                <div>
                  <span className="deck-pane-kicker">CORE DECK · COUNTERS</span>
                  <h2 className="deck-pane-title">{buffs.length} BLOCKS</h2>
                </div>
                <span className="deck-pane-meta">SHARED TICK</span>
              </div>
              <div className="deck-details-table is-resource" role="grid" aria-label="Core skills">
                <div className="deck-details-head is-core" role="row">
                  <span>NAME</span>
                  <span>TRIGGER</span>
                  <span>EFFECT</span>
                  <span>TIMING</span>
                </div>
                <div className="deck-details-rows">
                  {buffs.map(buff => {
                    const effectLabel = buff.id === 'repair'
                      ? `+${tuning.repairHeal} SANITY`
                      : buff.id === 'focus'
                      ? 'NEXT HIT → LIVE'
                      : `+${tuning.firewallPrivilege} PRIV`
                    const timingLabel = buff.id === 'repair' ? 'TURN END' : 'IN MOTION'
                    const active = inspectedCoreId === buff.id
                    return (
                      <button
                        type="button"
                        key={buff.id}
                        className={`deck-detail-row is-core ${active ? 'inspected' : ''}`}
                        onMouseEnter={() => setInspectedCoreId(buff.id)}
                        onFocus={() => setInspectedCoreId(buff.id)}
                        onClick={() => setInspectedCoreId(buff.id)}
                      >
                        <strong className="col-name">{buff.name}</strong>
                        <span className="col-attr"><i className="attr-chip counter">EVERY {buff.threshold}</i></span>
                        <span className="col-val">{effectLabel}</span>
                        <em className="col-slot placed">{timingLabel}</em>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Right: medium Preview GIF + Card-game explanation */}
        <aside className="deck-inspector-pane" aria-label="Skill preview and details">
          <DeckPreviewStage spec={previewSpec} reducedMotion={reducedMotion} />
          <CardExplanation
            copy={cardCopy}
            activeLevel={isAttackTab ? previewLevel : undefined}
            onSelectLevel={isAttackTab ? setPreviewLevel : undefined}
            skillId={isAttackTab ? inspectedSkill.id : undefined}
          />
        </aside>
      </div>
    </div>
  )
}
