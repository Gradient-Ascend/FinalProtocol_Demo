// The sound of the opening sequence, read off the same plan as the picture.
//
// Each shot is built around one event: a blip in the dark; a cut to silence
// when the stream stops; a range opening upward on the pull-back; a voice
// entering; three voices; nothing at all when everything goes flat; then
// everything at once, and a cut to silence on the three places nothing reaches.
//
// One-shot sounds are cues, long ones are spans. Both are driven from the
// sequence clock every frame, so pausing, seeking and a late unlock (sound
// allowed only after the sequence began) all do the right thing.
import { CG_VOICE_RATE, renderVoice } from '../cg-voice'
import { renderHand } from '../cg-image'
import { mulberry32 } from '../point-field'
import {
  blip, canUnlock, cluster, lowTone, noiseTick, playPcm, restore, setMuted, sharedAudio, silence, tokenBlip, unlockAudio, vowel,
  type Handle, type Sound,
} from '../sound'
import { CONTEXT, VISION } from './data'
import { PLAN } from './plan'

type Cue = { at: number; fire: (s: Sound, when: number) => void }
type Span = { from: number; to: number; release: number; start: (s: Sound, when: number, offset: number) => Handle; handle?: Handle | null; ended?: () => void }

const D2 = 73.42, A2 = 110, D3 = 146.83, A3 = 220, D4 = 293.66, D5 = 587.33
const LOOKAHEAD = 0.08

const { text: TX, image: IM, audio: AU, latent: LA, title: TI } = PLAN

// Windows in which the master is cut to silence.
const SILENCES: [number, number][] = [
  [TX.stop + 0.03, TX.pull + 0.15],          // the stream stops
  [IM.landed + 0.02, IM.beat - 0.02],        // one beat after the last patch lands
  [LA.collapse + 0.12, LA.rise],             // everything flat
  [LA.wide, TI.small - 0.03],                // the three places; then the title too large for the frame
]

function buildCues(): Cue[] {
  const cues: Cue[] = []
  const both = (s: Sound) => {                // a bus that feeds the dry mix and the hall
    const g = s.ctx.createGain()
    g.connect(s.master.sfx)
    g.connect(s.master.wet)
    return g
  }

  // shot 0: a blip per blink
  for (const at of PLAN.wake.blinks) cues.push({ at, fire: (s, when) => blip(s.ctx, s.master.sfx, when, D5, 0.03, 0.05) })

  // movement 1: a blip per token; an attended word rings, an ignored one barely clicks
  PLAN.contextTimes.forEach((at, i) => {
    const row = CONTEXT.rows[i]
    const own = row[i] / Math.max(...row)
    const inLine = i - CONTEXT.lineOf.indexOf(CONTEXT.lineOf[i])
    cues.push({ at, fire: (s, when) => tokenBlip(s.ctx, s.master.sfx, when, inLine, own) })
  })

  // subtitles of the image and representation movements: the same blip, much softer.
  // Nothing under the chant, and nothing in the silences.
  for (const cue of PLAN.subtitles) {
    if (cue.movement === 'audio' || cue.line.beat) continue
    cue.times.forEach((at, i) => {
      const row = cue.baked ? cue.baked.rows[i] : [1]
      const own = row[row.length - 1] / Math.max(...row)
      cues.push({ at, fire: (s, when) => tokenBlip(s.ctx, s.master.sfx, when, i, own, 0.32) })
    })
  }

  // movement 2: the picture is read as a sequence. One small tone per patch as it arrives:
  // row sets the pitch (top high, bottom low), the patch's brightness sets the level.
  cues.push({
    at: IM.resolve,
    fire: (s, when) => {
      const lum = renderHand(), bus = both(s)
      const scan = (IM.resolved - IM.resolve) * 0.72 / 196
      for (let p = 0; p < 196; p++) {
        const r = Math.floor(p / 14), c = p % 14
        let sum = 0
        for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x += 4) sum += lum[(r * 16 + y) * 224 + c * 16 + x]
        const level = Math.min(1, sum / 16 * 1.6)
        const hz = 440 * Math.pow(2, (86 - [0, 2, 3, 5, 7, 8, 10][r % 7] - 12 * Math.floor(r / 7) - 69) / 12)
        blip(s.ctx, bus, when + 0.25 + p * scan, hz, 0.006 + 0.03 * level, 0.12 + 0.35 * level, 0.01)
      }
    },
  })
  // each time the class token looks somewhere else: a small tick
  for (let h = 0; h < 6; h++) cues.push({ at: IM.heads + h * IM.headDur, fire: (s, when) => noiseTick(s.ctx, s.master.sfx, when, 2400, 0.05, 0.06) })
  for (let j = 0; j < 4; j++) cues.push({ at: IM.mean + j * 0.7, fire: (s, when) => noiseTick(s.ctx, s.master.sfx, when, 1800, j ? 0.035 : 0.06, 0.07) })
  // the patches land, 12 ms apart: the ticks fuse into a buzz. The image is heard becoming a sequence.
  cues.push({
    at: IM.fall + IM.flight - 0.1,
    fire: (s, when) => {
      for (let p = 0; p < 196; p++) {
        const hz = 880 * Math.pow(2, -Math.floor(p / 14) / 12)
        blip(s.ctx, s.master.sfx, when + 0.1 + p * IM.stagger, hz, 0.012 + 0.02 * (VISION.mean[p] / 255), 0.03, 0.008)
      }
    },
  })
  // both rows brighten together
  cues.push({ at: IM.beat, fire: (s, when) => { const bus = both(s); blip(s.ctx, bus, when, D4, 0.05, 0.9, 0.02); blip(s.ctx, bus, when, D4 * 1.5, 0.025, 0.7, 0.02) } })

  // movement 3: the frames land, then three rows breathe once
  cues.push({
    at: AU.fall + AU.flight - 0.1,
    fire: (s, when) => { for (let j = 0; j < AU.frames; j++) blip(s.ctx, s.master.sfx, when + 0.1 + j * AU.stagger, 660, 0.014, 0.03, 0.008) },
  })
  cues.push({
    at: AU.beat,
    fire: (s, when) => { const bus = both(s); for (const [hz, g] of [[D4, 0.05], [D4 * 1.5, 0.03], [D4 * 2, 0.02]]) blip(s.ctx, bus, when, hz, g, 1.1, 0.02) },
  })

  // movement 4: the mask falls; guesses arrive
  cues.push({ at: LA.mask, fire: (s, when) => noiseTick(s.ctx, both(s), when, 140, 0.1, 0.35, 0.8) })
  cues.push({
    at: LA.predict,
    fire: (s, when) => {
      const rnd = mulberry32(41), bus = both(s), dur = LA.predicted - LA.predict
      for (let i = 0; i < 46; i++) {                                 // sparse, then dense, then sparse: the swarm landing
        const at = dur * (0.12 + 0.8 * (i + rnd() * 0.8) / 46)
        const hz = D5 * Math.pow(2, [0, 3, 5, 7, 10, 12][Math.floor(rnd() * 6)] / 12)
        blip(s.ctx, bus, when + at, hz, 0.012 + 0.012 * rnd(), 0.12, 0.008)
      }
    },
  })
  return cues.sort((a, b) => a.at - b.at)
}

function buildSpans(position: { voice: (Handle & { position(): number }) | null }): Span[] {
  const wetBus = (s: Sound, send: number) => {
    const g = s.ctx.createGain(), w = s.ctx.createGain()
    w.gain.value = send
    g.connect(s.master.music)
    g.connect(w).connect(s.master.wet)
    return g
  }
  const at = (when: number, offset: number, from: number, x: number) => Math.max(when, when + (x - from - offset))
  return [
    // movement 1: under the words, a low tone that takes twelve seconds to arrive
    { from: TX.start + 1, to: TX.stop + 0.03, release: 0.06,
      start: (s, when, offset) => lowTone(s.ctx, wetBus(s, 0.3), D2, when, Math.max(0.5, 12 - offset), { gain: 0.25 }) },
    // the pull-back: the same tone returns and its range opens upward
    { from: TX.pull + 0.15, to: IM.landed + 0.02, release: 0.08,
      start: (s, when, offset) => {
        const tone = lowTone(s.ctx, wetBus(s, 0.35), D2, when, 1.4, { gain: 0.3, upper: 1, upperAt: when, upperAttack: 3.5 })
        tone.upper(0, at(when, offset, TX.pull + 0.15, TX.out), 2.5)   // and closes again as the wall lets go
        tone.level(0.17, at(when, offset, TX.pull + 0.15, TX.out), 3)
        return tone
      } },
    // movement 2: a second voice a fifth above
    { from: IM.start + 0.3, to: IM.landed + 0.02, release: 0.08,
      start: (s, when, offset) => lowTone(s.ctx, wetBus(s, 0.35), A2, when, Math.max(0.5, 5 - offset), { gain: 0.14 }) },
    // movement 3: the chant. The buffer played is the buffer drawn.
    { from: AU.chant, to: AU.chantEnd + 0.05, release: 0.05,
      start: (s, when, offset) => {
        const voice = renderVoice()
        const handle = playPcm(s.ctx, s.master.music, voice.samples, CG_VOICE_RATE, when, offset, 0.95)
        position.voice = handle
        return handle
      },
      ended: () => { position.voice = null } },
    // movement 4: the floor
    { from: LA.start + 0.6, to: LA.collapse + 0.12, release: 0.08,
      start: (s, when, offset) => lowTone(s.ctx, wetBus(s, 0.35), D2, when, Math.max(0.5, 5 - offset), { gain: 0.22 }) },
    // what was hidden returns beneath the guesses: the three voices, together, softly
    { from: LA.targets + 0.2, to: LA.collapse + 0.12, release: 0.08,
      start: (s, when) => chord(s, wetBus(s, 0.6), when, 1.2, [0.05, 0.04, 0.034]) },
    // it refuses to stay flat
    { from: LA.rise + 0.15, to: LA.wide, release: 0.05,
      start: (s, when, offset) => {
        const tone = lowTone(s.ctx, wetBus(s, 0.4), D2, when, 1.2, { gain: 0.12 })
        const swell = at(when, offset, LA.rise + 0.15, LA.pull + 0.2)
        tone.level(0.36, swell, 2.6)
        tone.upper(1.2, swell, 3)
        return tone
      } },
    // the long pull-back: everything at once, soft to loud
    { from: LA.pull + 0.2, to: LA.wide, release: 0.05,
      start: (s, when) => {
        const bus = wetBus(s, 0.6)
        const voices = chord(s, bus, when, 2.4, [0.085, 0.07, 0.06])
        const high = cluster(s.ctx, bus, when, { low: 3000, high: 6000, gain: 0.03, attack: 3 })
        return { stop(t, release) { voices.stop(t, release); high.stop(t, release) } }
      } },
    // the title, small and calm: the low tone returns and dies away
    { from: TI.small, to: PLAN.length + 0.5, release: 0.3,
      start: (s, when, offset) => {
        const tone = lowTone(s.ctx, wetBus(s, 0.4), D2, when, 0.04, { gain: 0.34 })
        tone.level(0, at(when, offset, TI.small, TI.small + 0.35), 3.4)
        return tone
      } },
  ]
}

function chord(s: Sound, out: AudioNode, when: number, attack: number, gains: number[]): Handle {
  const voices = [D3, A3, D4].map((hz, i) => vowel(s.ctx, out, hz, when, { gain: gains[i], attack, vibrato: 4.9 + i * 0.35 }))
  return { stop(t, release) { for (const v of voices) v.stop(t, release) } }
}

export class Score {
  private readonly cues = buildCues()
  private readonly position: { voice: (Handle & { position(): number }) | null } = { voice: null }
  private readonly spans = buildSpans(this.position)
  private sound: Sound | null = null          // the shared context, seen through this sequence's own buses
  private shared: Sound | null = null
  private buses: GainNode[] = []
  private last: number | null = null
  private cut = false
  private stopped = false
  private readonly enabled: boolean

  constructor(private muted: boolean, speed: number) {
    this.enabled = speed === 1               // sound cannot follow a clock that is not real time
    setMuted(muted)
  }

  /** A key or pointer went down: the moment a context is allowed to start. */
  gesture(): void {
    if (!this.enabled || this.stopped || this.muted) return
    const shared = unlockAudio()
    if (!this.sound) this.adopt(shared)
  }

  // Everything this sequence plays goes through three gains of its own, so stopping
  // the sequence silences sounds it has already scheduled without touching anyone else's.
  private adopt(shared: Sound | null): Sound | null {
    if (!shared) return null
    const { ctx, master } = shared
    const own = (dest: AudioNode) => { const g = ctx.createGain(); g.connect(dest); return g }
    this.buses = [own(master.music), own(master.sfx), own(master.wet)]
    this.shared = shared
    this.sound = { ctx, master: { ...master, music: this.buses[0], sfx: this.buses[1], wet: this.buses[2] } }
    return this.sound
  }

  private acquire(): Sound | null {
    if (this.sound) return this.sound
    return this.adopt(sharedAudio() ?? (!this.muted && canUnlock() ? unlockAudio() : null))
  }

  /** Bring the sound to sequence time t. Call every frame. */
  update(t: number): void {
    if (!this.enabled || this.stopped) return
    try {
      const s = this.acquire()
      if (!s || s.ctx.state !== 'running') { this.last = t; return }
      const now = s.ctx.currentTime
      const cut = SILENCES.some(([from, to]) => t >= from && t < to)
      if (cut !== this.cut || this.last === null) {
        this.cut = cut
        if (cut) silence(s, now)
        else restore(s, now, this.last === null ? 0.02 : 0.1)
      }
      for (const span of this.spans) {
        if (!span.handle && t + LOOKAHEAD >= span.from && t < span.to - 0.1) {
          span.handle = span.start(s, now + Math.max(0.01, span.from - t), Math.max(0, t - span.from))
        } else if (span.handle && t >= span.to) {
          span.handle.stop(now, span.release)
          span.handle = null
          span.ended?.()
        }
      }
      if (this.last !== null) {
        for (const cue of this.cues) {
          if (cue.at <= this.last + LOOKAHEAD) continue
          if (cue.at > t + LOOKAHEAD) break
          cue.fire(s, now + Math.max(0.005, cue.at - t))
        }
      }
      this.last = t
    } catch {
      // Sound is never worth a broken picture.
    }
  }

  /** Seconds into the chant that the ear has reached, on the audio clock; null when it is not sounding. */
  voicePosition(): number | null {
    const v = this.position.voice
    if (!v || !this.sound || this.sound.ctx.state !== 'running') return null
    return v.position()
  }

  /** Fade everything this sequence started, then give the master back as it was found. */
  stop(fade = 0.06): void {
    if (this.stopped) return
    this.stopped = true
    const s = this.sound
    if (!s) return
    try {
      const now = s.ctx.currentTime
      for (const span of this.spans) { span.handle?.stop(now, fade); span.handle = null }
      this.position.voice = null
      for (const bus of this.buses) {
        bus.gain.cancelScheduledValues(now)
        bus.gain.setTargetAtTime(0, now, fade / 3)
      }
      const buses = this.buses
      window.setTimeout(() => { for (const bus of buses) bus.disconnect() }, (fade + 0.5) * 1000)
      // If we were inside one of our silences, reopen the master for whoever plays next.
      if (this.shared) restore(this.shared, now + fade, 0.05)
    } catch {
      // nothing to release
    }
  }
}
