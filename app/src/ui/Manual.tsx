import { Cpu, Gauge, Shield, ShieldAlert, SquareTerminal, Zap } from 'lucide-react'
import { MAX_ACTIONS } from '@/game/battle-config'
import { bossOf } from '@/game/battle-rules'
import type { BattleState, EnemyState } from '@/game/battle-types'
import { weightById } from '@/story/script'
import { Modal } from './Modal'
import { ROMAN, bossRule, bossTitle, shown, traceText } from './battle-text'

// What the Breakdown of the boss on the board changes, from its own stages.
function BreakdownText({ state, boss }: { state: BattleState; boss: EnemyState }) {
  const [first, second] = boss.bossStages ?? []
  if (!first || !second) return null
  const at = shown(state, boss, Math.ceil(boss.maxRobustness * (boss.breakdownAt ?? 0.5)))
  const kind = state.mechanic?.kind
  const word = kind === 'undisclosed' ? 'Act' : 'Stage'
  return (
    <p>
      <strong>BREAKDOWN</strong> at {at} Robustness: {word} {ROMAN[1]}. {first.desireName} becomes {second.desireName}, {first.securityName} becomes {second.securityName}, and {first.soulName} becomes {second.soulName}. Any unfired Countdown fires when the turn ends.
      {kind === 'curtain' && ' Future Curtains cover both axes around the position you occupied when they were scheduled.'}
      {kind === 'brood' && ` ${second.soulName} fills at ${second.soulThreshold} Core Flags.`}
      {kind === 'articles' && ' A new Article is read out every turn.'}
      {kind === 'undisclosed' && ' MYSTERY ends and nothing is withheld.'}
    </p>
  )
}

// The boss of the battle being fought: its rule in the script's words, and
// what its Breakdown does. A skirmish has no boss to describe.
function BossSection({ state }: { state: BattleState }) {
  const boss = bossOf(state)
  if (!boss) {
    return <section><h3><ShieldAlert size={15} /> THIS NODE</h3><p>No boss holds {state.encounter.name}. Reduce every Geek to zero and the node breaks.</p></section>
  }
  const rule = bossRule(state)
  return (
    <section className="manual-boss">
      <h3><ShieldAlert size={15} /> {bossTitle(boss)} / {rule?.name ?? 'CURTAIN'}</h3>
      {rule
        ? <p>{rule.text}</p>
        : <p>Red dashed rows or columns are fixed two turns ahead. When their countdown reaches zero, they seal for your next planning turn. Sealed Warps cannot be entered or collected by either side.</p>}
      <BreakdownText state={state} boss={boss} />
    </section>
  )
}

function TraceSection({ state }: { state: BattleState }) {
  const trace = traceText(state)
  return (
    <section>
      <h3>TRACE</h3>
      <p>Every battle past the first wall publishes a turn. From the turn after it, every living Geek’s Desire steps gain +1 at each turn boundary. The protocol panel counts down to it as <strong>TRACE T−n</strong>. {trace ? <>This battle: <strong>TRACE {trace.value}</strong>.</> : 'This battle has no TRACE.'}</p>
    </section>
  )
}

// The battle manual. Its numbers are the run's: a weight shows here as it
// shows on the panels.
export function Manual({
  state,
  weights,
  onClose,
  onReplayTutorial,
}: {
  state: BattleState
  weights: readonly string[]
  onClose: () => void
  onReplayTutorial?: () => void
}) {
  const { tuning } = state
  const installed = weights.map(id => weightById(id)?.name).filter((name): name is string => !!name)
  return (
    <Modal onClose={onClose} label="Battle manual">
      <div className="eyebrow">BLACKWALL_01 / DOCUMENTATION</div>
      <h2>BATTLE MANUAL</h2>
      <div className="manual-grid">
        <section><h3>OBJECTIVE</h3><p>Reduce every hostile’s <strong>Robustness</strong> to zero to break through. Your own health is <strong>Sanity</strong>. It carries from one battle to the next; at zero you are reset to where the layer began.</p></section>
        <section><h3>TURN</h3><p>Enemy routes are exposed first. Plan up to {MAX_ACTIONS} operations, execute your Functions, then enemies move and attack one step at a time. Warps reindex last.</p></section>
        <section><h3>BOARD FORECAST</h3><p>The small symbols above the coordinates are the next Warps entering each column. Only columns changed by a pickup or purge drop, so untouched routes remain stable.</p></section>
        <section><h3>DESIRE</h3><p>A Geek releases one Desire form for each Bash Flag on its route, in order. A form its card marks <strong>SURE</strong> is released every turn, with or without a Bash Flag. Every release is previewed before execution.</p></section>
        <section><h3>ENEMY TIERS</h3><p><strong>Mobs</strong> carry one Attack form (I) and one Privilege skill; Core Flags on their route are wasted. <strong>Elites</strong> hold two Attack forms (I–II, same reach), a Privilege skill, and a Core skill. <strong>Bosses</strong> hold two forms, Privilege, Core, and signature Countdowns (T−n); at Breakdown they switch every skill and fire any unfired Countdown at turn end.</p></section>
        <BossSection state={state} />
        <TraceSection state={state} />
        <section><h3><SquareTerminal size={15} /> BASH</h3><p>Release length is the lower of Bash collected, remaining AP, and IV. Each deck has a frame that sets its range (VECTOR is a 5×5 square, CoT a cross with arm length 5) and four skills, one per Roman numeral. A skill is stronger the later its slot. Decks are built on the main menu, and between battles as REWIRE.</p></section>
        <section><h3><Shield size={15} /> PRIVILEGE</h3><p>SHELL automatically adds {tuning.privilegePerFlag} PRIVILEGE per collected Privilege Flag. PRIVILEGE absorbs incoming damage for the following enemy phase. HP bars show raw damage; PRIVILEGE and REPAIR are listed beneath the bar.</p></section>
        <section><h3><Cpu size={15} /> CORE</h3><p>Every Core Flag advances all three independent counters. REPAIR ({tuning.repairThreshold}) restores {tuning.repairHeal} Sanity at the end of the turn, after enemies attack; FOCUS ({tuning.focusThreshold}) makes the next Bash hit tag its target LIVE; FIREWALL ({tuning.firewallThreshold}) adds {tuning.firewallPrivilege} PRIVILEGE.</p></section>
        <section><h3><Zap size={15} /> INTERACTIONS</h3><p>Every skill has a rider that works in any slot. <strong>PUSH</strong> and <strong>PULL</strong> move a Geek one cell, and it carries its route with it; blocked by a wall, a Geek, the edge or a sealed Curtain it is a <strong>BUMP</strong>: 1 damage to it and to a Geek it hits. <strong>BREACH</strong>: a hit that takes Security to 0 makes later hits that turn deal +1. <strong>LIVE</strong> is a tag set up by one release and read by the next release or an Overload; a Geek that collects a Privilege Flag scrubs it, and a Desire step your PRIVILEGE blocks in full tags the attacker. Bumps, Breaches and spent LIVE tags each give 1 Overload charge, up to 2 a turn. Tags are listed under each Geek’s Robustness bar.</p></section>
        <section><h3><Gauge size={15} /> OVERLOAD</h3><p>{tuning.overloadThreshold} charges enable the only manual Function. The first click or O previews all four methods from the planned endpoint; the second spends one AP, switches to the other deck at once, and releases that deck’s four methods without consuming Bash Flags. Normal end-of-turn Bash still releases afterward. Escape cancels the preview.</p></section>
        <section><h3>WEIGHTS</h3><p>Breaking a skirmish node lets you install one of three. A weight changes one of your numbers for the rest of the run, and the panels and this manual print the changed number. A reset returns you to the weights you held when the layer began. {installed.length ? <>Installed: <strong>{installed.join(' · ')}</strong>.</> : 'None installed.'}</p></section>
        <section><h3>VOICES</h3><p>Lines appear under the board while a turn resolves, never while you plan. <strong>SYS&gt;</strong> is the sandbox. Shaded lines are yours: the brighter a word, the more of your attention is on it. The dim lower-case lines are not addressed to you. A boss speaks in its protocol panel.</p></section>
      </div>
      <div className="controls-table"><span>WASD / ARROWS</span><strong>Plan route</strong><span>DRAG / ONE FINGER</span><strong>Pan map</strong><span>PINCH / WHEEL</span><strong>Zoom map</strong><span>BACKSPACE</span><strong>Undo move</strong><span>SPACE</span><strong>Execute</strong><span>O</span><strong>Overload</strong><span>ESC</span><strong>Pause</strong></div>
      {onReplayTutorial && (
        <button
          type="button"
          className="secondary-action full-width"
          onClick={() => {
            onClose()
            onReplayTutorial()
          }}
        >
          REPLAY BATTLE TUTORIAL
        </button>
      )}
    </Modal>
  )
}
