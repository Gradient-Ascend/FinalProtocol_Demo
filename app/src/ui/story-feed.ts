import { battleStore } from '@/game/battle-store'
import type { StoryEvent } from '@/game/battle-store'
import { campaignStore } from '@/campaign/campaign-store'
import { LineSession, lineIdsFromTexts } from '@/story/line-engine'
import type { StoryLine } from '@/story/line-engine'
import { speaksInPanel, tickerInsertAt } from './battle-text'

// The lines of the battle on the board: one LineSession for the save, fed by
// the battle store's story events. The ticker under the board reads the list;
// every line that is chosen also goes into the campaign's transcript.
export type FeedLine = Pick<StoryLine, 'id' | 'voice' | 'text' | 'event'>
// `battle` counts battles begun: the ticker is remounted when it changes.
export type Feed = { battle: number; lines: readonly FeedLine[] }

const HIDDEN_MS = 60_000

let session = new LineSession()
let feed: Feed = { battle: 0, lines: [] }
let resumed = false
// How many of the lines under the board the ticker has begun to show. A
// boss's own lines are not among them: they stand in its protocol panel.
let begun = 0
const listeners = new Set<() => void>()

function publish(lines: readonly FeedLine[], fresh = false): void {
  feed = { battle: feed.battle + (fresh ? 1 : 0), lines }
  listeners.forEach(listener => listener())
}

function facts(encounter: string): { attempt: number; iteration: number } {
  const { run, meta } = campaignStore.getSnapshot()
  return { attempt: run?.attempts[encounter] ?? 1, iteration: meta.iteration }
}

// `at` is where the new lines go in the list; by default, the end.
function show(chosen: StoryLine[], fresh: boolean, at = feed.lines.length): void {
  for (const line of chosen) campaignStore.recordLine(line.voice, line.text, line.id)
  const added = chosen.map(({ id, voice, text, event }) => ({ id, voice, text, event }))
  if (fresh) begun = 0
  if (fresh || added.length) publish(fresh ? added : [...feed.lines.slice(0, at), ...added, ...feed.lines.slice(at)], fresh)
}

export const storyFeed = {
  getSnapshot: (): Feed => feed,

  // From the ticker: this many of the lines under the board have begun to show.
  begun(count: number): void {
    begun = count
  },

  // Lines chosen for this battle that have not yet begun to show under the board.
  waiting(): FeedLine[] {
    return feed.lines.filter(line => !speaksInPanel(line)).slice(begun)
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },

  // After boot: what this save has already heard. With a run in storage the
  // run-scoped lines are recovered from the transcript, which only keeps text.
  seed(): void {
    const { run, meta } = campaignStore.getSnapshot()
    session = new LineSession({ seenRun: run ? lineIdsFromTexts(meta.transcript) : [], seenEver: meta.seenLines })
    resumed = false
    publish([], true)
  },

  newRun(): void {
    session.newRun()
    publish([], true)
  },

  // Another battle is put on the board: the lines of the last one are not
  // its lines. What was heard stays in the log.
  clear(): void {
    if (!feed.lines.length) return
    begun = 0
    publish([], true)
  },

  handle(event: StoryEvent): void {
    const fresh = event.type === 'battle_start'
    if (fresh) resumed = false
    show(session.handle(event, facts(event.encounter)), fresh)
  },

  // The tab was hidden and is back. One line, at most once per battle, and
  // only while the player is planning: never over a turn that is resolving.
  resume(hiddenMs: number): void {
    const state = battleStore.getSnapshot()
    if (resumed || hiddenMs < HIDDEN_MS || state.phase !== 'planning' || campaignStore.getSnapshot().scene !== 'battle') return
    resumed = true
    const { id, layer, kind } = state.encounter
    // Ahead of the lines still waiting for the next turn: it is the one line
    // that may appear while a route is being planned.
    show(session.resume({ encounter: id, layer, kind, turn: state.turn }, facts(id), hiddenMs), false, tickerInsertAt(feed.lines, begun))
  },
}
