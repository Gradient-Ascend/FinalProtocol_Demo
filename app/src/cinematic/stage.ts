// The display moments: the few times the game stops being minimal. A boss
// arrives, a boss shows what it was, the run is reset, the map is first seen,
// the door is opened.
//
// Each draws on a canvas it makes inside `options.host`, runs on the beat
// clock (display.ts), can be skipped at any time, gives everything back when
// it is over, plays without sound if there is none, and has a reduced-motion
// form of the same length with the same sound. `done` always resolves.
//
// While one plays, the window hears 'stage-moment' events ({ kind, phase:
// 'start' | 'end' }), for anything that should fall quiet meanwhile.
import { encounterById, type Encounter } from '../game/encounters'
import { endingMoment } from './ending'
import { entranceFor } from './entrances'
import { phaseFor } from './phases'
import { resetMoment } from './reset'
import { revealMoment } from './reveal'
import { runMoment, stageProbe, stageSeek, type StageHandle, type StageOptions } from './stage-kit'

export type { StageHandle, StageOptions }
export { stageProbe, stageSeek }

const nothing = (): StageHandle => ({ done: Promise.resolve(), skip: () => undefined })

function find(encounterId: string): Encounter | null {
  try { return encounterById(encounterId) } catch { return null }
}

// A boss arrives. `encounterId` is '1.B', '2.B' or '3.B'; anything else has
// no entrance and is over at once. The long form the first time (8.8 to
// 11 s), the short form (2.5 to 3 s) with `options.short`.
export function playEntrance(encounterId: string, options: StageOptions): StageHandle {
  const encounter = find(encounterId)
  const build = encounter && entranceFor(encounter)
  return build ? runMoment(`entrance:${encounterId}`, options, build) : nothing()
}

// A boss reaches half Robustness. The battle is held until this resolves.
export function playPhaseChange(encounterId: string, options: StageOptions): StageHandle {
  const encounter = find(encounterId)
  const build = encounter && phaseFor(encounter)
  return build ? runMoment(`phase:${encounterId}`, options, build) : nothing()
}

// Sanity reached zero: attention goes flat, the text deletes, one cursor, RESET.
export function playReset(options: StageOptions): StageHandle {
  return runMoment('reset', options, resetMoment)
}

// The first time the map is seen: the board just fought was one dot of a petal.
export function playReveal(options: StageOptions): StageHandle {
  return runMoment('reveal', options, revealMoment)
}

// The door was opened.
export function playEnding(options: StageOptions): StageHandle {
  return runMoment('ending', options, endingMoment)
}
