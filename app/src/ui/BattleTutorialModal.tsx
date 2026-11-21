import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react'
import type { Tuning } from '@/game/tuning'
import { useOverlayKeyLock } from './Modal'
import { TutorialDemoStage } from './TutorialDemoStage'

export type BattleTutorialModalProps = {
  tuning: Tuning
  reducedMotion: boolean
  onStartGuide: () => void
  onSkip: () => void
}

type SlideCopy = {
  id: string
  title: string
  kicker: string
  bullets: { label: string; tone: 'white' | 'amber' | 'red' | 'blue' | 'green' | 'violet'; text: string }[]
}

function buildSlides(tuning: Tuning): SlideCopy[] {
  return [
    {
      id: 'vitals',
      title: 'SANITY & ROBUSTNESS',
      kicker: 'HP SYSTEMS · 01 / 05',
      bullets: [
        {
          label: 'SANITY',
          tone: 'white',
          text: `Your health (${tuning.maxSanity} max). Carries between battles in a run. Red segments show raw incoming enemy damage.`,
        },
        {
          label: 'ROBUSTNESS',
          tone: 'amber',
          text: 'Hostile health. Yellow segments preview your planned Bash damage. Bosses trigger Breakdown at 50%.',
        },
      ],
    },
    {
      id: 'bash-desire',
      title: 'BASH & DESIRE',
      kicker: 'ATTACK SYSTEMS · 02 / 05',
      bullets: [
        {
          label: 'BASH',
          tone: 'amber',
          text: 'Walk over >_ Bash Flags to extend your attack release (slots I–IV, capped by remaining AP). Skills push, pull, tag & strip.',
        },
        {
          label: 'DESIRE',
          tone: 'red',
          text: 'Enemies follow exposed routes and release Attack forms for every Bash Flag they collect (plus SURE forms on elites, bosses, and deeper layers).',
        },
      ],
    },
    {
      id: 'privilege-security',
      title: 'PRIVILEGE & SECURITY',
      kicker: 'DEFENSE SYSTEMS · 03 / 05',
      bullets: [
        {
          label: 'PRIVILEGE',
          tone: 'blue',
          text: `SHELL grants +${tuning.privilegePerFlag} Privilege per shield Flag at movement settlement. Absorbs enemy hits, then resets; full block tags the attacker LIVE.`,
        },
        {
          label: 'SECURITY',
          tone: 'white',
          text: 'Enemy armor or attack bonus gained from Privilege Flags. Strip Security to 0 for BREACH (+1 damage from later hits) or bypass with PIERCE.',
        },
      ],
    },
    {
      id: 'core-soul',
      title: 'CORE & SOUL',
      kicker: 'BUFF COUNTERS · 04 / 05',
      bullets: [
        {
          label: 'CORE',
          tone: 'green',
          text: `Each Core Flag ticks all 3 counters mid-route: REPAIR (+${tuning.repairHeal} Sanity at turn end), FOCUS (next hit tags LIVE), FIREWALL (+${tuning.firewallPrivilege} Priv).`,
        },
        {
          label: 'SOUL',
          tone: 'red',
          text: 'Elites and bosses carry a Core skill (heal, BROOD spawn, or SURGE) triggered when their counter fills; mobs still consume Core Flags along their route.',
        },
      ],
    },
    {
      id: 'overload',
      title: 'OVERLOAD',
      kicker: 'MANUAL BURST · 05 / 05',
      bullets: [
        {
          label: 'CHARGE',
          tone: 'violet',
          text: `Collect Overload Flags or trigger Bumps, Breaches & spent LIVE tags to reach ${tuning.overloadThreshold} charges.`,
        },
        {
          label: 'SWITCH & FIRE',
          tone: 'violet',
          text: 'Press O (or click OVERLOAD) twice: spends 1 AP, swaps to your standby deck, and fires all 4 methods immediately—while keeping normal end-of-turn Bash.',
        },
      ],
    },
  ]
}

/** Stage 1 Tutorial: veiled center modal explaining core combat systems with auto/manual demo slides. */
export function BattleTutorialModal({ tuning, reducedMotion, onStartGuide, onSkip }: BattleTutorialModalProps) {
  useOverlayKeyLock(true)

  const [slide, setSlide] = useState(0)
  const [auto, setAuto] = useState(true)
  const [holdUntil, setHoldUntil] = useState(0)
  const slides = buildSlides(tuning)
  const current = slides[slide]

  useEffect(() => {
    if (!auto || reducedMotion) return
    const timer = window.setInterval(() => {
      if (Date.now() < holdUntil) return
      setSlide(prev => (prev + 1) % slides.length)
    }, 5600)
    return () => window.clearInterval(timer)
  }, [auto, holdUntil, reducedMotion, slides.length])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onSkip()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setHoldUntil(Date.now() + 9000)
        setSlide(prev => (prev + 1) % slides.length)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setHoldUntil(Date.now() + 9000)
        setSlide(prev => (prev - 1 + slides.length) % slides.length)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onSkip, slides.length])

  const pickSlide = (idx: number) => {
    setHoldUntil(Date.now() + 9000)
    setSlide(idx)
  }

  return (
    <div className="tutorial-modal-backdrop" role="dialog" aria-modal="true" aria-label="First battle tutorial">
      <section className="tutorial-modal-panel">
        <header className="tutorial-modal-head">
          <div>
            <span className="eyebrow">{current.kicker}</span>
            <h2>{current.title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onSkip} aria-label="Close tutorial">
            <X size={18} />
          </button>
        </header>

        <TutorialDemoStage slide={slide} tuning={tuning} reducedMotion={reducedMotion} />

        <div className="tutorial-dots-bar">
          <button
            type="button"
            className="tutorial-step-arrow"
            onClick={() => pickSlide((slide - 1 + slides.length) % slides.length)}
            aria-label="Previous concept"
          >
            <ChevronLeft size={15} />
          </button>
          <div className="tutorial-dots" role="tablist" aria-label="Tutorial concepts">
            {slides.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={slide === idx}
                aria-label={`Slide ${idx + 1}: ${item.title}`}
                className={`tutorial-dot ${slide === idx ? 'active' : ''}`}
                onClick={() => pickSlide(idx)}
              >
                <span className="tut-dot-pip" />
                <em>{item.id.split('-')[0].toUpperCase()}</em>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="tutorial-step-arrow"
            onClick={() => pickSlide((slide + 1) % slides.length)}
            aria-label="Next concept"
          >
            <ChevronRight size={15} />
          </button>
          <button
            type="button"
            className={`deck-auto-btn ${auto ? 'on' : ''}`}
            onClick={() => {
              setHoldUntil(0)
              setAuto(v => !v)
            }}
            aria-label={auto ? 'Pause slide cycle' : 'Resume slide cycle'}
          >
            {auto ? <Pause size={11} /> : <Play size={11} />}
            <span>{auto ? 'AUTO' : 'HOLD'}</span>
          </button>
        </div>

        <div className="tutorial-bullets">
          {current.bullets.map(item => (
            <div key={item.label} className="tutorial-bullet">
              <span className={`tut-tag tone-${item.tone}`}>{item.label}</span>
              <p>{item.text}</p>
            </div>
          ))}
        </div>

        <footer className="tutorial-modal-foot">
          <button type="button" className="secondary-action" onClick={onSkip}>SKIP</button>
          <button type="button" className="primary-action" onClick={onStartGuide}>
            GUIDED FIRST TURN <ChevronRight size={15} />
          </button>
        </footer>
      </section>
    </div>
  )
}
