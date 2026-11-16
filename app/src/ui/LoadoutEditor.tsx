import { useState } from 'react'
import { ChevronDown, Cpu, Shield, SquareTerminal } from 'lucide-react'
import { FRAMES, SKILLS, assignSkill, cloneLoadout, frameById, skillById, slotLabel } from '@/game/skills'
import type { Loadout } from '@/game/skills'
import type { CoreBuff } from '@/game/battle-types'

const ROMAN = ['I', 'II', 'III', 'IV']

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
export function LoadoutEditor({ loadout, buffs, privilegePerFlag, onChange }: {
  loadout: Loadout
  buffs: CoreBuff[]
  // What SHELL gives per Flag in the run at hand; a weight can raise it.
  privilegePerFlag: number
  onChange: (loadout: Loadout) => void
}) {
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
                    className={`pool-skill ${skill.id === selectedSkill ? 'current' : ''} ${where ? 'placed' : ''}`}
                    key={skill.id}
                    onClick={() => onChange(assignSkill(loadout, deckIndex, slot, skill.id))}
                    aria-label={`Put ${skill.name} in deck ${letter} slot ${ROMAN[slot]}. ${skill.rider}`}
                  >
                    <span className="pool-row">
                      <strong>{skill.name}</strong>
                      {skill.amounts.map((_, index) => <span className={index === slot ? 'at-slot' : ''} key={index}>{slotLabel(skill, index)}</span>)}
                      <em>{where ?? '—'}</em>
                    </span>
                    <span className="pool-rider">
                      <i>{skill.writes ? 'WRITES' : 'READS'}</i>
                      <b>{skill.writes ?? skill.reads}</b>
                      <span>{skill.rider}</span>
                    </span>
                  </button>
                )
              })}
              <p className="pool-legend">Slot N fires with N Bash Flags and N unused action points. ALL hits every Geek in range · P pierces Security · D is the distance to the target. The second line of each skill is its interaction, the same in every slot: it writes a state other skills read (position, LIVE, Security, routes) or reads one.</p>
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
        summary={`+${privilegePerFlag} PRIVILEGE / FLAG`}
      >
        <div className="deck-cards">
          <article className="deck-card">
            <header><strong>SHELL</strong><em>AUTOMATIC</em></header>
            <b>+{privilegePerFlag} PRIVILEGE</b>
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
