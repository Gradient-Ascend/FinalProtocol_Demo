// The opening sequence on one clock. Every time below is seconds from the
// first frame; shots, sound and the preview's probe all read this plan and
// nothing else keeps a schedule.
//
// About 40 percent of it is dark, still or silent on purpose: the spectacle
// is the middle, and the tremble is in the hold after it.
import { CG_VOICE_ENTRIES, CG_VOICE_SECONDS } from '../cg-voice'
import { AUDIO, CONTEXT, bakedLine, movement, type BakedLine, type CgLine, type Movement } from './data'

export type LineCue = {
  line: CgLine
  movement: Movement['id']
  baked: BakedLine | null
  tokens: string[]
  times: number[]        // when each token arrives
  at: number             // first token
  end: number            // last token
  out: number            // when the line leaves the screen
}

// Token cadence: a base gap, a breath after a comma, a longer one after a full stop inside a line.
function schedule(tokens: string[], start: number, gap: number): number[] {
  const times: number[] = []
  let t = start
  tokens.forEach((token, i) => {
    times.push(t)
    const mark = token.trim()
    t += gap + (i < tokens.length - 1 ? (mark === ',' ? 0.15 : /^[.?!]$/.test(mark) ? 0.35 : 0) : 0)
  })
  return times
}

const text = movement('text'), image = movement('image'), audio = movement('audio'), latent = movement('latent')

// --- shot 0: wake ---
const WAKE = { blinks: [1.8, 2.8, 3.8], blinkOn: 0.5 }

// --- movement 1: text. The six lines are one context; token times are per context token. ---
const TEXT_START = 4.4
const textGaps = [0.40, 0.28, 0.16, 0.15, 0.135, 0.125]             // it reads faster as it goes
const textPauses = [1.2, 1.3, 0.6, 1.1, 0.8]                        // after each line but the last
const contextTimes: number[] = []
const textLines: LineCue[] = []
{
  let t = TEXT_START
  text.lines.forEach((line, n) => {
    const first = CONTEXT.lineOf.indexOf(n), last = CONTEXT.lineOf.lastIndexOf(n)
    const tokens = CONTEXT.tokens.slice(first, last + 1)
    const times = schedule(tokens, t, textGaps[Math.min(n, textGaps.length - 1)])
    contextTimes.push(...times)
    textLines.push({ line, movement: 'text', baked: bakedLine(line), tokens, times, at: times[0], end: times[times.length - 1], out: Infinity })
    t = times[times.length - 1] + (textPauses[n] ?? 0)
  })
}
const STOP = contextTimes[contextTimes.length - 1]                  // the stream stops here
const TEXT = {
  start: TEXT_START,
  stop: STOP,
  aside: STOP + 6.6,                // the aside enters the HUD on the wall
  pull: STOP + 1.25,                // silence, then the view pulls back
  rows: STOP + 2.1,                 // rows of the triangle begin to appear
  triangle: STOP + 3.7,             // the whole triangle is in frame
  wall: STOP + 5.85,                // the 36 matrices it was averaged from
  out: STOP + 8.15,                 // the wall fades; the row we read goes to the band
  end: STOP + 9.15,
}

// A subtitle line of the later movements, on its own baked row.
function subtitle(line: CgLine, id: Movement['id'], at: number, gap = 0.105): LineCue {
  const baked = bakedLine(line)
  const tokens = baked ? baked.tokens : line.text.split(/(?=\s)/)
  const times = schedule(tokens, at, gap)
  return { line, movement: id, baked, tokens, times, at, end: times[times.length - 1], out: Infinity }
}

// --- movement 2: image ---
const I0 = TEXT.end
const IMAGE = {
  start: I0,
  resolve: I0 + 0.5, resolved: I0 + 3.3,         // the hand arrives as dots, patch by patch
  cut: I0 + 3.3, apart: I0 + 4.5,                // hairlines, then the 196 pieces separate
  heads: I0 + 4.9, headDur: 0.9,                 // six heads, one after another
  mean: I0 + 4.9 + 6 * 0.9, meanDur: 2.8,
  fall: I0 + 4.9 + 6 * 0.9 + 2.8,                // patches leave in raster order
  stagger: 0.012, flight: 1.0,
  landed: 0, beat: 0, end: 0,
}
IMAGE.landed = IMAGE.fall + 195 * IMAGE.stagger + IMAGE.flight
IMAGE.beat = IMAGE.landed + 0.45                 // one beat of silence, then both rows brighten together
IMAGE.end = IMAGE.beat + 1.0
const imageLines = [
  subtitle(image.lines[0], 'image', I0 + 0.2),
  subtitle(image.lines[1], 'image', IMAGE.apart - 0.4),
  subtitle(image.lines[2], 'image', IMAGE.mean - 0.2),
]

// --- movement 3: audio ---
const A0 = IMAGE.end
const CHANT = A0 + 2.2                           // a second of nothing before the first sound with a body
const AUDIO_PLAN = {
  start: A0,
  strip: A0 + 0.3,
  chant: CHANT,
  second: CHANT + CG_VOICE_ENTRIES[1],
  lock: CHANT + CG_VOICE_ENTRIES[2],             // the third voice enters: the stream stops scrolling
  lockDur: 0.8,
  chantEnd: CHANT + CG_VOICE_SECONDS,
  fall: CHANT + CG_VOICE_SECONDS + 3.4,          // after the line said into the silence
  stagger: 0.02, flight: 0.9,
  landed: 0, beat: 0, end: 0,
  frames: AUDIO.frames,
}
AUDIO_PLAN.landed = AUDIO_PLAN.fall + (AUDIO.frames - 1) * AUDIO_PLAN.stagger + AUDIO_PLAN.flight
AUDIO_PLAN.beat = AUDIO_PLAN.landed + 0.15
AUDIO_PLAN.end = AUDIO_PLAN.beat + 1.1
const audioLines = [
  subtitle(audio.lines[0], 'audio', A0 + 0.2),
  subtitle(audio.lines[1], 'audio', AUDIO_PLAN.second + 0.3),
  subtitle(audio.lines[2], 'audio', AUDIO_PLAN.chantEnd + 0.7),
]

// --- movement 4: representation space ---
const L0 = AUDIO_PLAN.end
const LATENT = {
  start: L0,
  dissolve: L0, settled: L0 + 4.4,               // the three rows tilt back and become the field
  mask: L0 + 6.6, masked: L0 + 7.8,              // a block goes dark
  predict: L0 + 8.3, predicted: L0 + 12.7,       // guesses arrive along arcs; the error falls
  targets: L0 + 12.7, met: L0 + 14.1,            // what was hidden returns beneath them
  collapse: L0 + 14.6, flat: L0 + 15.3,          // everything flat: error 0.000, no sound
  rise: L0 + 17.3, risen: L0 + 18.5,             // it refuses to stay flat
  pull: L0 + 18.5, wide: L0 + 24.5,              // the long pull-back
  end: 0,
}
const latentLines = [
  subtitle(latent.lines[0], 'latent', L0 + 0.4, 0.11),
  subtitle(latent.lines[1], 'latent', LATENT.settled - 0.4),
  subtitle(latent.lines[2], 'latent', LATENT.masked + 0.2),
  subtitle(latent.lines[3], 'latent', LATENT.collapse, 0.13),
  subtitle(latent.lines[4], 'latent', LATENT.wide + 0.5, 0.14),
  subtitle(latent.lines[5], 'latent', LATENT.wide + 3.3, 0.13),
]
LATENT.end = latentLines[5].end + 3.1            // the last words go, the three places are held without them, then the dark

// --- title ---
const TITLE = {
  start: LATENT.end,
  huge: LATENT.end + 0.6,           // too large for the frame, drifting, in silence
  small: LATENT.end + 2.9,          // the same words, calm; the low tone returns
  end: LATENT.end + 6.6,
}

// A subtitle leaves when the next one of its movement arrives, or when its movement's picture does.
function close(cues: LineCue[], last: number): void {
  cues.forEach((cue, i) => { cue.out = i < cues.length - 1 ? cues[i + 1].at - 0.25 : last })
}
close(imageLines, IMAGE.landed - 0.4)
close(audioLines, AUDIO_PLAN.fall + 0.6)
close(latentLines, TITLE.start + 0.1)
latentLines[2].out = LATENT.targets + 0.9
latentLines[3].out = LATENT.rise + 0.6
latentLines[4].out = latentLines[5].at - 0.3
latentLines[5].out = latentLines[5].end + 1.5

export const PLAN = {
  length: TITLE.end,
  wake: WAKE,
  text: TEXT,
  image: IMAGE,
  audio: AUDIO_PLAN,
  latent: LATENT,
  title: TITLE,
  contextTimes,
  textLines,
  subtitles: [...imageLines, ...audioLines, ...latentLines],
}

export type ShotId = 'wake' | 'text' | 'image' | 'audio' | 'latent' | 'title'

/** Which shot owns a moment: for the probe, the HUD and tests. */
export function shotAt(t: number): ShotId {
  if (t < TEXT.start) return 'wake'
  if (t < TEXT.end) return 'text'
  if (t < IMAGE.end) return 'image'
  if (t < AUDIO_PLAN.end) return 'audio'
  if (t < TITLE.start) return 'latent'
  return 'title'
}
