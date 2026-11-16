// Sound for the display moments: one shared AudioContext, one master chain,
// and a small kit of synthesised primitives. No audio files anywhere.
//
// Rules this module keeps:
//  - the context is created only by unlockAudio(), which must be called from
//    inside a user gesture (or after one: see canUnlock);
//  - every sound reaches the speakers through master.user, so one mute is
//    honoured everywhere;
//  - nothing clicks: envelopes have at least 8 ms of attack, releases are
//    exponential, and a cut to silence is a 45 ms fade on master.cut.
//
// Nobody has listened to these levels with their ears; they were set from
// the numbers in research/story/13 and checked for clipping by rendering.

export type Master = {
  music: GainNode        // long tones
  sfx: GainNode          // short sounds
  wet: GainNode          // reverb send: connect a source here as well as to music or sfx
  cut: GainNode          // 1 normally; silence() and restore() move it
  user: GainNode         // mute, last in the chain
}

export type Sound = { ctx: AudioContext; master: Master }
export type Handle = { stop(at?: number, release?: number): void }

type Ctx = BaseAudioContext

let live: Sound | null = null
let muted = false
let hooked = false

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A generated hall: decaying stereo noise that darkens as it dies. Long tails
 * read as large rooms. The buffer is made at the context's own rate.
 */
export function hall(ctx: Ctx, seconds = 5, decay = 2.6, seed = 7): ConvolverNode {
  const rate = ctx.sampleRate, len = Math.floor(rate * seconds), pre = Math.floor(rate * 0.035)
  const buf = ctx.createBuffer(2, len, rate)
  const rnd = mulberry32(seed)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = pre; i < len; i++) {
      const k = (i - pre) / (len - pre)
      const cutoff = 600 + 6400 * Math.exp(-k * 4)                    // the tail loses its treble first
      lp += (1 - Math.exp(-2 * Math.PI * cutoff / rate)) * (rnd() * 2 - 1 - lp)
      d[i] = lp * (1 - k) ** decay * Math.min(1, (i - pre) / (rate * 0.08))   // 80 ms build-up, not a slap
    }
  }
  const node = ctx.createConvolver()
  node.buffer = buf
  return node
}

/** music/sfx -> sum (0.5) -> 28 Hz high-pass -> limiter -> 0.7 -> cut -> user -> out. */
export function buildMaster(ctx: Ctx, out: AudioNode = ctx.destination): Master {
  const gain = (value: number) => { const g = ctx.createGain(); g.gain.value = value; return g }
  const music = gain(0.8), sfx = gain(0.8), wet = gain(1), wetReturn = gain(0.3)
  const sum = gain(0.5)                                               // 6 dB of headroom before the limiter
  const rumble = ctx.createBiquadFilter()
  rumble.type = 'highpass'; rumble.frequency.value = 28; rumble.Q.value = 0.707
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -9; limiter.knee.value = 6; limiter.ratio.value = 20
  limiter.attack.value = 0.002; limiter.release.value = 0.25
  const ceiling = gain(0.7)                                           // the compressor is not a brick wall
  const cut = gain(1), user = gain(1)
  music.connect(sum)
  sfx.connect(sum)
  wet.connect(hall(ctx)).connect(wetReturn).connect(sum)
  sum.connect(rumble).connect(limiter).connect(ceiling).connect(cut).connect(user).connect(out)
  return { music, sfx, wet, cut, user }
}

/** True once the page has had a user gesture, so a context may start. */
export function canUnlock(): boolean {
  if (typeof navigator === 'undefined') return false
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  return !!activation && activation.hasBeenActive
}

/**
 * Create (once) or resume the shared context. Call from a click, tap or key
 * handler. Returns null where audio is unavailable; never throws.
 */
export function unlockAudio(): Sound | null {
  try {
    if (!live) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      const ctx = new Ctor({ latencyHint: 'interactive' })
      live = { ctx, master: buildMaster(ctx) }
      live.master.user.gain.value = muted ? 0 : 1
    }
    if (!hooked) {
      hooked = true
      // Audio keeps a hidden tab awake and runs on without its picture.
      document.addEventListener('visibilitychange', () => {
        if (!live || live.ctx.state === 'closed') return
        if (document.hidden) void live.ctx.suspend().catch(() => undefined)
        else void live.ctx.resume().catch(() => undefined)
      })
    }
    if (live.ctx.state === 'suspended' && !document.hidden) void live.ctx.resume().catch(() => undefined)
    return live
  } catch {
    return null
  }
}

/** The shared context if one exists. Never creates one. */
export function sharedAudio(): Sound | null { return live }

export function setMuted(next: boolean): void {
  muted = next
  if (!live) return
  const g = live.master.user.gain, now = live.ctx.currentTime
  g.cancelScheduledValues(now)
  g.setTargetAtTime(muted ? 0 : 1, now, 0.015)                        // 15 ms time constant: no click
}

export function isMuted(): boolean { return muted }

/** A cut to silence without a click: 95 percent down in 45 ms. */
export function silence(sound: Sound, at = sound.ctx.currentTime): void {
  const g = sound.master.cut.gain
  g.cancelScheduledValues(at)
  g.setTargetAtTime(0, at, 0.015)
}

/** Undo silence(). */
export function restore(sound: Sound, at = sound.ctx.currentTime, timeConstant = 0.1): void {
  const g = sound.master.cut.gain
  g.cancelScheduledValues(at)
  g.setTargetAtTime(1, at, timeConstant)
}

/** Click-free envelope: linear attack (never under 8 ms), hold, exponential release. Returns the end time. */
export function envelope(g: AudioParam, t0: number, peak: number, attack: number, hold: number, release: number): number {
  const a = Math.max(attack, 0.008)
  g.setValueAtTime(0, t0)
  g.linearRampToValueAtTime(peak, t0 + a)
  g.setValueAtTime(peak, t0 + a + hold)
  g.setTargetAtTime(0, t0 + a + hold, release / 5)
  return t0 + a + hold + release
}

// The gain a sustained voice fades in on. Its own value is 0 before anything is scheduled on it.
// stop() cancels what is scheduled, a param with nothing scheduled falls back to its own value, and
// a new gain's own value is 1: on such a gain, a voice stopped in the instant it was started (a
// development double mount does exactly that), or before its start time, opens fully and dies away,
// several times louder than it was ever meant to be. On this one it stays shut.
function closedGain(ctx: Ctx): GainNode {
  const g = ctx.createGain()
  g.gain.value = 0
  return g
}

// Wherever `out` fades in on a schedule it is a closedGain, so stop() is safe at any time: before the
// attack, in the instant of it, during it or after. (playPcm's gain has no schedule to cancel.)
function sustained(ctx: Ctx, out: GainNode, sources: AudioScheduledSourceNode[]): Handle {
  let stopped = false
  return {
    stop(at = ctx.currentTime, release = 1.5) {
      if (stopped) return
      stopped = true
      out.gain.cancelScheduledValues(at)
      out.gain.setTargetAtTime(0, at, release / 5)
      for (const s of sources) { try { s.stop(at + release + 0.1) } catch { /* already stopped */ } }
    },
  }
}

export type LowToneOptions = {
  gain?: number          // level it settles at
  upper?: number         // level of partials 6..10, for a range that opens upward
  upperAt?: number       // when the upper partials begin to rise
  upperAttack?: number
}

/**
 * A low tone that survives phone speakers: a harmonic stack, so the
 * fundamental is implied by partials 2 to 5 when the speaker cannot make it.
 * Returns a handle; `upper(level, at, seconds)` opens the range upward later.
 */
export function lowTone(ctx: Ctx, out: AudioNode, f0 = 55, t0 = ctx.currentTime, attack = 0.04, options: LowToneOptions = {})
  : Handle & { upper(level: number, at?: number, seconds?: number): void; level(value: number, at?: number, seconds?: number): void } {
  const bus = closedGain(ctx)
  bus.gain.setValueAtTime(0, t0)
  bus.gain.setTargetAtTime(options.gain ?? 1, t0, attack / 3)        // 95 percent in `attack` seconds
  const high = ctx.createGain()
  high.gain.setValueAtTime(0, t0)
  if (options.upper) high.gain.setTargetAtTime(options.upper, options.upperAt ?? t0, (options.upperAttack ?? 2) / 3)
  high.connect(bus)
  const sources: OscillatorNode[] = []
  const partial = (n: number, level: number, dest: AudioNode) => {
    const o = ctx.createOscillator(), a = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = f0 * n * (1 + 0.0015 * (n - 1))               // a slight stretch keeps it from sounding like an organ stop
    a.gain.value = level
    o.connect(a).connect(dest)
    o.start(t0)
    sources.push(o)
  }
  ;[0.50, 0.34, 0.22, 0.12, 0.06].forEach((g, i) => partial(i + 1, g, bus))
  ;[0.05, 0.04, 0.032, 0.024, 0.018].forEach((g, i) => partial(i + 6, g, high))
  bus.connect(out)
  const handle = sustained(ctx, bus, sources)
  return {
    stop: handle.stop,
    upper(level, at = ctx.currentTime, seconds = 2) { high.gain.setTargetAtTime(level, at, seconds / 3) },
    level(value, at = ctx.currentTime, seconds = 1) { bus.gain.setTargetAtTime(value, at, seconds / 3) },
  }
}

/** Plain sine blip. */
export function blip(ctx: Ctx, out: AudioNode, t: number, hz: number, peak: number, release: number, attack = 0.008): void {
  const osc = ctx.createOscillator(), g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = hz
  g.gain.value = 0
  const end = envelope(g.gain, t, peak, attack, 0, release)
  osc.connect(g).connect(out)
  osc.start(t)
  osc.stop(end + 0.05)
}

const PENTATONIC = [0, 3, 5, 7, 10]                                   // D minor pentatonic

/**
 * A token arrives. Its place in the line picks the pitch (five notes, so a
 * sentence has a contour); its attention weight, 0..1, sets loudness and
 * length, so an attended word rings and an ignored one barely clicks.
 */
export function tokenBlip(ctx: Ctx, out: AudioNode, t: number, index: number, weight: number, level = 1): void {
  const w = clamp01(weight)
  const hz = 293.66 * Math.pow(2, PENTATONIC[((index % 5) + 5) % 5] / 12 + (w > 0.66 ? 1 : 0))
  blip(ctx, out, t, hz, level * (0.03 + 0.09 * w), 0.06 + 0.25 * w)
}

const noiseCache = new WeakMap<Ctx, AudioBuffer>()
function noise(ctx: Ctx): AudioBuffer {
  let buf = noiseCache.get(ctx)
  if (!buf) {
    buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate)
    const d = buf.getChannelData(0), rnd = mulberry32(11)
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1
    noiseCache.set(ctx, buf)
  }
  return buf
}

/** Filtered noise burst: a tick, a landing, a consonant. */
export function noiseTick(ctx: Ctx, out: AudioNode, t: number, hz: number, peak: number, release = 0.06, q = 2): void {
  const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain()
  src.buffer = noise(ctx)
  bp.type = 'bandpass'; bp.frequency.value = hz; bp.Q.value = q
  g.gain.value = 0
  const end = envelope(g.gain, t, peak, 0.008, 0, release)
  src.connect(bp).connect(g).connect(out)
  src.start(t, (hz * 0.0137) % 1)
  src.stop(end + 0.05)
}

export type VowelOptions = {
  gain?: number
  attack?: number
  formants?: readonly (readonly [number, number])[]   // [Hz, level]; default is an open "ah"
  vibrato?: number                                    // Hz
}

/**
 * A wordless voice: a sawtooth with slow vibrato through three vowel formants.
 * This is the live voice for chords and swells; the chant itself is
 * cg-voice.ts, played with playPcm so picture and sound are one signal.
 */
export function vowel(ctx: Ctx, out: AudioNode, f = 110, t0 = ctx.currentTime, options: VowelOptions = {})
  : Handle & { level(value: number, at?: number, seconds?: number): void } {
  const src = ctx.createOscillator()
  src.type = 'sawtooth'
  src.frequency.value = f
  const twin = ctx.createOscillator()                                 // a second singer, 7 cents away
  twin.type = 'sawtooth'
  twin.frequency.value = f
  twin.detune.value = 7
  const vib = ctx.createOscillator(), depth = ctx.createGain()
  vib.frequency.value = options.vibrato ?? 5
  depth.gain.setValueAtTime(0, t0)
  depth.gain.setTargetAtTime(f * 0.006, t0 + 0.5, 0.6)                // vibrato arrives after the note, as singers do
  vib.connect(depth)
  depth.connect(src.frequency)
  depth.connect(twin.frequency)
  const sum = closedGain(ctx)
  sum.gain.setValueAtTime(0, t0)
  sum.gain.setTargetAtTime(options.gain ?? 0.08, t0, (options.attack ?? 2.4) / 3)
  for (const [hz, level] of options.formants ?? [[700, 1], [1100, 0.5], [2500, 0.25]]) {
    const bp = ctx.createBiquadFilter(), a = ctx.createGain()
    bp.type = 'bandpass'; bp.frequency.value = hz; bp.Q.value = 8
    a.gain.value = level
    src.connect(bp)
    twin.connect(bp)
    bp.connect(a).connect(sum)
  }
  sum.connect(out)
  src.start(t0); twin.start(t0); vib.start(t0)
  const handle = sustained(ctx, sum, [src, twin, vib])
  return {
    stop: handle.stop,
    level(value, at = ctx.currentTime, seconds = 1) { sum.gain.setTargetAtTime(value, at, seconds / 3) },
  }
}

export type ClusterOptions = { low?: number; high?: number; voices?: number; gain?: number; attack?: number; seed?: number }

/**
 * A high cluster: many faint sines packed between `low` and `high` Hz, each
 * drifting a little, heard as one bright texture. The range opening upward.
 */
export function cluster(ctx: Ctx, out: AudioNode, t0 = ctx.currentTime, options: ClusterOptions = {}): Handle {
  const low = options.low ?? 3000, high = options.high ?? 6000, voices = options.voices ?? 14
  const rnd = mulberry32(options.seed ?? 23)
  const bus = closedGain(ctx)
  bus.gain.setValueAtTime(0, t0)
  bus.gain.setTargetAtTime(options.gain ?? 0.03, t0, (options.attack ?? 1.5) / 3)
  const sources: OscillatorNode[] = []
  for (let v = 0; v < voices; v++) {
    const o = ctx.createOscillator(), a = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = low * Math.pow(high / low, (v + rnd() * 0.8) / voices)
    const lfo = ctx.createOscillator(), amount = ctx.createGain()     // each voice breathes at its own slow rate
    lfo.frequency.value = 0.11 + rnd() * 0.3
    amount.gain.value = 0.4 / voices
    a.gain.value = 0.6 / voices
    lfo.connect(amount).connect(a.gain)
    o.connect(a).connect(bus)
    o.start(t0); lfo.start(t0)
    sources.push(o, lfo)
  }
  bus.connect(out)
  return sustained(ctx, bus, sources)
}

/**
 * Play mono PCM from an AudioBuffer made at the samples' own rate. `offset`
 * starts part-way in. `position()` is where the ear is in the signal, in
 * seconds, on the audio clock: draw from it and picture and sound agree.
 */
export function playPcm(ctx: AudioContext, out: AudioNode, samples: Float32Array, sampleRate: number, t0 = ctx.currentTime, offset = 0, gain = 1)
  : Handle & { position(): number } {
  const buf = ctx.createBuffer(1, samples.length, sampleRate)
  buf.getChannelData(0).set(samples)
  const src = ctx.createBufferSource(), g = ctx.createGain()
  src.buffer = buf
  g.gain.value = gain
  src.connect(g).connect(out)
  const from = Math.max(0, Math.min(offset, samples.length / sampleRate))
  src.start(t0, from)
  const handle = sustained(ctx, g, [src])
  return {
    stop: handle.stop,
    position() {
      const latency = ctx.outputLatency || ctx.baseLatency || 0      // what is heard lags the clock
      return from + (ctx.currentTime - latency - t0)
    },
  }
}

// ── Motifs for the display moments ───────────────────────────────────────
// Entrances, phase changes, the reset, the ending and the map are built from
// the primitives above plus these. Levels were set by metering the master
// output, not by ear.

/** A bus that feeds both the dry mix and the hall. */
export function both(sound: Sound, dry: 'music' | 'sfx' = 'sfx', level = 1): GainNode {
  const g = sound.ctx.createGain()
  g.gain.value = level
  g.connect(sound.master[dry])
  g.connect(sound.master.wet)
  return g
}

export type PulseTrainOptions = {
  from?: number          // pulses per second at the start
  to?: number            // and after `seconds`
  seconds?: number
  gain?: number
  attack?: number
  under?: number         // a second, slower train at this fraction of the rate (0 = none)
}

/**
 * A train of narrow pulses whose rate slides: a sawtooth with its body
 * filtered away, so only the edge is left. At one a second it is a tick; as
 * the rate doubles the ticks fuse and by 64 a second it is a pitch near C2.
 * Rhythm becomes a voice. `rate()` moves it again later.
 */
export function pulseTrain(ctx: Ctx, out: AudioNode, t0 = ctx.currentTime, options: PulseTrainOptions = {})
  : Handle & { rate(hz: number, at?: number, seconds?: number): void; level(value: number, at?: number, seconds?: number): void } {
  const from = options.from ?? 1, to = options.to ?? 64, seconds = options.seconds ?? 3
  const bus = closedGain(ctx)
  bus.gain.setValueAtTime(0, t0)
  bus.gain.setTargetAtTime(options.gain ?? 0.2, t0, (options.attack ?? 0.05) / 3)
  const edge = ctx.createBiquadFilter()
  edge.type = 'highpass'; edge.frequency.value = 300; edge.Q.value = 0.5
  // Once the ticks are a tone, a little of the body is let back in so the pitch has weight.
  const body = ctx.createBiquadFilter(), bodyGain = ctx.createGain()
  body.type = 'lowpass'; body.frequency.value = 260; body.Q.value = 0.7
  bodyGain.gain.setValueAtTime(0, t0)
  bodyGain.gain.setTargetAtTime(0.5, t0 + seconds * 0.6, seconds * 0.25)
  const sources: OscillatorNode[] = []
  const train = (ratio: number, level: number) => {
    const osc = ctx.createOscillator(), g = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(from * ratio, t0)
    osc.frequency.exponentialRampToValueAtTime(to * ratio, t0 + seconds)
    g.gain.value = level
    osc.connect(g)
    g.connect(edge)
    g.connect(body)
    osc.start(t0)
    sources.push(osc)
    return osc
  }
  const main = train(1, 1)
  const slow = options.under ? train(options.under, 0.8) : null
  edge.connect(bus)
  body.connect(bodyGain).connect(bus)
  bus.connect(out)
  const handle = sustained(ctx, bus, sources)
  return {
    stop: handle.stop,
    rate(hz, at = ctx.currentTime, glide = 1) {
      for (const [osc, ratio] of [[main, 1], [slow, options.under ?? 0]] as const) {
        if (!osc) continue
        osc.frequency.cancelScheduledValues(at)
        osc.frequency.setTargetAtTime(hz * ratio, at, glide / 3)
      }
    },
    level(value, at = ctx.currentTime, glide = 1) { bus.gain.setTargetAtTime(value, at, glide / 3) },
  }
}

/** One step of something heavy: a 41 Hz stack with a short attack and a thud of low noise, left to ring in the hall. */
export function footfall(sound: Sound, t: number, level = 1): void {
  const { ctx } = sound
  const bus = both(sound, 'sfx')
  const tone = lowTone(ctx, bus, 41, t, 0.012, { gain: 0.62 * level })
  tone.stop(t + 0.1, 0.9)
  const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain()
  src.buffer = noise(ctx)
  lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 0.5
  g.gain.value = 0
  const end = envelope(g.gain, t, 0.5 * level, 0.008, 0.02, 0.09)
  src.connect(lp).connect(g).connect(bus)
  src.start(t, 0.31)
  src.stop(end + 0.05)
}

const pulseWaves = new WeakMap<Ctx, PeriodicWave>()
/** A pulse wave at a quarter duty: thinner and more nasal than a square. A court trumpet made of two levels. */
function quarterPulse(ctx: Ctx): PeriodicWave {
  let wave = pulseWaves.get(ctx)
  if (!wave) {
    const n = 32, real = new Float32Array(n), imag = new Float32Array(n)
    for (let k = 1; k < n; k++) real[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * 0.25)
    wave = ctx.createPeriodicWave(real, imag)
    pulseWaves.set(ctx, wave)
  }
  return wave
}

/** One note of the court's brass. */
export function brass(ctx: Ctx, out: AudioNode, t: number, hz: number, seconds: number, peak = 0.05, cents = 0): void {
  const osc = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain()
  osc.setPeriodicWave(quarterPulse(ctx))
  osc.frequency.value = hz
  osc.detune.value = cents
  lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.6
  g.gain.value = 0
  const end = envelope(g.gain, t, peak, 0.012, Math.max(0, seconds - 0.05), 0.09)
  osc.connect(lp).connect(g).connect(out)
  osc.start(t)
  osc.stop(end + 0.05)
}

const D4 = 293.66, EB4 = 311.13, A4 = 440, D5 = 587.33

/**
 * The court's fanfare: three voices on D, A and D in a dotted rhythm, and a
 * last chord that is wrong, E flat and A under the held D. `seconds` is the
 * length of the fanfare before that chord. Returns when the wrong chord ends:
 * the caller cuts to silence there.
 */
export function courtFanfare(sound: Sound, t0: number, seconds = 1.4, level = 1): number {
  const { ctx } = sound
  const bus = both(sound, 'sfx', level)
  const u = seconds / 16
  // [start, length, pitch] in sixteenths: dotted figures climbing D, A, D, then the open chord struck three times
  const notes: [number, number, number][] = [
    [0, 3, D4], [3, 1, D4], [4, 3, A4], [4, 3, D4], [7, 1, A4],
    [8, 4, D5], [8, 4, A4], [8, 4, D4],
    [12, 1.2, D5], [12, 1.2, A4], [12, 1.2, D4], [13.33, 1.2, D5], [13.33, 1.2, A4], [14.66, 1.3, D5], [14.66, 1.3, A4], [14.66, 1.3, D4],
  ]
  for (const [at, len, hz] of notes) brass(ctx, bus, t0 + at * u, hz, len * u * 0.86, hz === D5 ? 0.05 : 0.04)
  // the resolution that is not one
  const wrong = t0 + seconds
  brass(ctx, bus, wrong, D5, 0.2, 0.055)
  brass(ctx, bus, wrong, A4, 0.2, 0.045)
  brass(ctx, bus, wrong, EB4, 0.2, 0.05)
  return wrong + 0.2
}

export type DriftClusterOptions = { low?: number; high?: number; voices?: number; gain?: number; rise?: number; wander?: number; seed?: number }

/**
 * A close cluster: many sines packed evenly (in pitch) between two notes a
 * third apart, each wandering a couple of hertz at its own slow rate, so the
 * whole never settles on a chord. Everything sits above 200 Hz and survives
 * a phone speaker. It rises from nothing over `rise` seconds.
 */
export function driftCluster(ctx: Ctx, out: AudioNode, t0 = ctx.currentTime, options: DriftClusterOptions = {})
  : Handle & { level(value: number, at?: number, seconds?: number): void } {
  const low = options.low ?? 207.65, high = options.high ?? 261.63, voices = options.voices ?? 24
  const rnd = mulberry32(options.seed ?? 31)
  const bus = closedGain(ctx)
  bus.gain.setValueAtTime(0, t0)
  bus.gain.setTargetAtTime(options.gain ?? 0.18, t0, (options.rise ?? 7) / 3)
  const sources: OscillatorNode[] = []
  for (let v = 0; v < voices; v++) {
    const o = ctx.createOscillator(), a = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = low * Math.pow(high / low, v / Math.max(1, voices - 1))
    a.gain.value = 1 / Math.sqrt(voices)
    lfo.frequency.value = 0.05 + 0.08 * rnd()
    depth.gain.value = options.wander ?? 2
    lfo.connect(depth).connect(o.frequency)
    o.connect(a).connect(bus)
    o.start(t0); lfo.start(t0)
    sources.push(o, lfo)
  }
  bus.connect(out)
  const handle = sustained(ctx, bus, sources)
  return {
    stop: handle.stop,
    level(value, at = ctx.currentTime, seconds = 1) { bus.gain.setTargetAtTime(value, at, seconds / 3) },
  }
}

export type ShepardOptions = { low?: number; octaves?: number; secondsPerOctave?: number; gain?: number; attack?: number }

/**
 * A fall that never arrives: sines an octave apart all sliding down together,
 * each fading out as it reaches the bottom and returning, silent, at the top.
 * Scheduled for `seconds`; stop() ends it sooner.
 */
export function shepardFall(ctx: Ctx, out: AudioNode, t0 = ctx.currentTime, seconds = 8, options: ShepardOptions = {}): Handle {
  const low = options.low ?? 55, octaves = options.octaves ?? 6, per = options.secondsPerOctave ?? 40
  const bus = closedGain(ctx)
  bus.gain.setValueAtTime(0, t0)
  bus.gain.setTargetAtTime(options.gain ?? 0.1, t0, (options.attack ?? 1.2) / 3)
  const sources: OscillatorNode[] = []
  const end = t0 + seconds + 4
  const windowAt = (p: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * p / octaves)   // loudness over position, 0 at both ends
  for (let i = 0; i < octaves; i++) {
    const o = ctx.createOscillator(), a = ctx.createGain()
    o.type = 'sine'
    let p = i + 0.5, t = t0                                           // position in octaves above `low`
    o.frequency.setValueAtTime(low * Math.pow(2, p), t)
    while (t < end) {
      // a stretch of the slide: down to the bottom, or to the end of the cue
      const reach = Math.min(p * per, end - t)
      const steps = Math.max(2, Math.ceil(reach / 0.25))
      const curve = new Float32Array(steps + 1)
      for (let k = 0; k <= steps; k++) curve[k] = windowAt(p - reach / per * k / steps) / octaves * 2
      o.frequency.exponentialRampToValueAtTime(low * Math.pow(2, p - reach / per), t + reach)
      a.gain.setValueCurveAtTime(curve, t, reach)
      t += reach
      p -= reach / per
      if (p <= 1e-6 && t < end) {                                     // silent at the bottom: back to the top
        p = octaves
        t += 0.01
        o.frequency.setValueAtTime(low * Math.pow(2, p), t)
      }
    }
    o.connect(a).connect(bus)
    o.start(t0)
    sources.push(o)
  }
  bus.connect(out)
  return sustained(ctx, bus, sources)
}

/** A low stack that sinks by `cents` over `seconds` and then stops: something being let go of. */
export function sinkTone(ctx: Ctx, out: AudioNode, t0: number, f0 = 55, cents = -100, seconds = 1.5, gain = 0.3): void {
  const bus = ctx.createGain()
  bus.gain.setValueAtTime(0, t0)
  bus.gain.linearRampToValueAtTime(gain, t0 + 0.25)
  bus.gain.setValueAtTime(gain, t0 + seconds)
  bus.gain.setTargetAtTime(0, t0 + seconds, 0.05)
  const ratio = Math.pow(2, cents / 1200)
  ;[0.5, 0.34, 0.22, 0.12].forEach((level, i) => {
    const o = ctx.createOscillator(), a = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(f0 * (i + 1), t0)
    o.frequency.setValueAtTime(f0 * (i + 1), t0 + 0.2)
    o.frequency.exponentialRampToValueAtTime(f0 * (i + 1) * ratio, t0 + seconds)
    a.gain.value = level
    o.connect(a).connect(bus)
    o.start(t0)
    o.stop(t0 + seconds + 0.5)
  })
  bus.connect(out)
}

// ── The map's hum ────────────────────────────────────────────────────────
// One sustained note per petal the run has entered, very quiet, in the hall:
// G1, then D2 a fifth above it, then A flat 2, a semitone over the next fifth,
// which turns the open sound into a question. start() needs a user gesture to
// have happened; without sound every call does nothing.

const HUM_NOTES = [49, 73.42, 103.83]
const HUM_LEVEL = 0.14
let hum: { sound: Sound; notes: (ReturnType<typeof lowTone> | null)[]; bus: GainNode } | null = null

export const mapHum = {
  /** Begin (or carry on) the hum with this many petals revealed, 0 to 3. */
  start(revealed = 1): void {
    try {
      const sound = live ?? (canUnlock() ? unlockAudio() : null)
      if (!sound) return
      if (!hum) hum = { sound, notes: [null, null, null], bus: both(sound, 'music') }
      mapHum.setRevealed(revealed)
    } catch { /* no sound is not an error */ }
  },
  /** Bring notes in or let them go so that `revealed` petals sound. */
  setRevealed(revealed: number, seconds = 4): void {
    if (!hum) return
    const { ctx } = hum.sound, now = ctx.currentTime
    for (let i = 0; i < 3; i++) {
      const wanted = i < revealed
      if (wanted && !hum.notes[i]) hum.notes[i] = lowTone(ctx, hum.bus, HUM_NOTES[i], now, seconds, { gain: HUM_LEVEL * (i === 2 ? 0.7 : 1) })
      else if (!wanted && hum.notes[i]) { hum.notes[i]!.stop(now, 2); hum.notes[i] = null }
    }
  },
  /** Let the hum go. */
  stop(release = 1.5): void {
    if (!hum) return
    const now = hum.sound.ctx.currentTime
    for (const note of hum.notes) note?.stop(now, release)
    const bus = hum.bus
    window.setTimeout(() => { try { bus.disconnect() } catch { /* already gone */ } }, (release + 0.5) * 1000)
    hum = null
  },
  get playing(): boolean { return hum !== null },
}

export { midiHz }
