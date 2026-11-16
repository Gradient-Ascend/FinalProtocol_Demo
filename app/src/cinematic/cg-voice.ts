// The first sound the AI is given in the opening sequence: three wordless
// voices entering one after another on a slow chant, in parallel fifths and
// octaves like early church singing. It is a hymn, and in this story the hymn
// is the shield: the song is about who has a soul.
//
// Everything is synthesised here and is deterministic: a glottal pulse through
// vowel formants, with vibrato, breath and a small feedback-delay room. The
// bake (app/scripts/bake) feeds these samples to the audio model, and the
// sequence plays and draws these same samples.
//
// No imports and only erasable TypeScript: node runs this file directly when
// baking (see app/scripts/bake/render-inputs.mjs).

export const CG_VOICE_RATE = 24000
export const CG_VOICE_SECONDS = 6
/** Seconds at which each of the three voices enters. */
export const CG_VOICE_ENTRIES = [0, 1.52, 3.04]

export type CgVoice = { sampleRate: number; samples: Float32Array; entries: number[] }

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

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
const dB = (x: number) => Math.pow(10, x / 20)

// Five formants per vowel: centre Hz, level dB, bandwidth Hz (the Csound
// manual's table for a bass and a soprano; see CREDITS).
type Formant = readonly [number, number, number]
type Vowels = { a: readonly Formant[]; o: readonly Formant[]; u: readonly Formant[] }
const BASS: Vowels = {
  a: [[600, 0, 60], [1040, -7, 70], [2250, -9, 110], [2450, -9, 120], [2750, -20, 130]],
  o: [[400, 0, 40], [750, -11, 80], [2400, -21, 100], [2600, -20, 120], [2900, -40, 120]],
  u: [[350, 0, 40], [600, -20, 80], [2400, -32, 100], [2675, -28, 120], [2950, -36, 120]],
}
const SOPRANO: Vowels = {
  a: [[800, 0, 80], [1150, -6, 90], [2900, -32, 120], [3900, -20, 130], [4950, -50, 140]],
  o: [[450, 0, 40], [800, -11, 80], [2830, -22, 100], [3800, -22, 120], [4950, -50, 120]],
  u: [[325, 0, 50], [700, -16, 60], [2700, -35, 170], [3800, -40, 180], [4950, -60, 200]],
}

type Part = {
  enter: number
  release: number
  notes: readonly (readonly [number, number])[]     // [seconds, midi note]
  table: Vowels
  scale: number                                     // formant scale: a smaller throat for a higher voice
  vowels: readonly (readonly [number, 'u' | 'o' | 'a'])[]   // [seconds, vowel]: the mouth opens as it goes
  level: number
  vibrato: number                                   // Hz
  seed: number
}

// D dorian. The lowest voice steps away from D and back; the second sings the
// same line a fifth above, the third an octave above. They end on a bare fifth.
const PARTS: Part[] = [
  { enter: CG_VOICE_ENTRIES[0], release: 5.0, table: BASS, scale: 1, level: 1, vibrato: 4.9, seed: 3,
    notes: [[0, 50], [1.52, 52], [2.28, 53], [3.04, 52], [3.8, 50]],
    vowels: [[0, 'u'], [1.3, 'u'], [2.6, 'o'], [3.2, 'o'], [4.2, 'a']] },
  { enter: CG_VOICE_ENTRIES[1], release: 5.04, table: BASS, scale: 1.1, level: 0.8, vibrato: 5.3, seed: 5,
    notes: [[1.52, 59], [2.28, 60], [3.04, 59], [3.8, 57]],
    vowels: [[1.52, 'o'], [3.0, 'o'], [4.2, 'a']] },
  { enter: CG_VOICE_ENTRIES[2], release: 5.08, table: SOPRANO, scale: 0.94, level: 0.62, vibrato: 5.6, seed: 8,
    notes: [[3.04, 64], [3.8, 62]],
    vowels: [[3.04, 'o'], [3.7, 'a']] },
]

function vowelAt(part: Part, t: number, k: number): Formant {
  const v = part.vowels
  let i = 0
  while (i < v.length - 1 && t >= v[i + 1][0]) i++
  const a = part.table[v[i][1]][k]
  if (i === v.length - 1) return a
  const b = part.table[v[i + 1][1]][k]
  const m = Math.min(1, Math.max(0, (t - v[i][0]) / (v[i + 1][0] - v[i][0])))
  return [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m, a[2] + (b[2] - a[2]) * m]
}

// One breath of the glottis, phase 0..1: opens slowly, shuts fast, stays shut.
function glottis(p: number): number {
  if (p < 0.42) return 0.5 - 0.5 * Math.cos(Math.PI * p / 0.42)
  if (p < 0.58) return Math.cos(0.5 * Math.PI * (p - 0.42) / 0.16)
  return 0
}

function sing(part: Part, out: Float32Array, sr: number): void {
  const rnd = mulberry32(part.seed)
  const n = out.length
  const b0 = new Float64Array(5), a1 = new Float64Array(5), a2 = new Float64Array(5), gain = new Float64Array(5)
  const x1 = new Float64Array(5), x2 = new Float64Array(5), y1 = new Float64Array(5), y2 = new Float64Array(5)
  let phase = 0, hz = midiHz(part.notes[0][1]), last = 0
  let drift = 0, driftGoal = 0, shimmer = 1, shimmerGoal = 1
  const start = Math.floor(part.enter * sr)
  for (let i = start; i < n; i++) {
    const t = i / sr, since = t - part.enter
    if ((i - start) % 48 === 0) {                   // every 2 ms: retune the throat
      for (let k = 0; k < 5; k++) {
        const [fc, level, bw] = vowelAt(part, t, k)
        const w = 2 * Math.PI * Math.min(fc * part.scale, sr * 0.45) / sr
        const alpha = Math.sin(w) / (2 * fc / bw)
        b0[k] = alpha / (1 + alpha)
        a1[k] = -2 * Math.cos(w) / (1 + alpha)
        a2[k] = (1 - alpha) / (1 + alpha)
        gain[k] = dB(level)
      }
    }
    if ((i - start) % 2400 === 0) {                 // every 100 ms: a singer is never exactly steady
      driftGoal = (rnd() - 0.5) * 9                 // cents
      shimmerGoal = 1 + (rnd() - 0.5) * 0.10
    }
    drift += (driftGoal - drift) * 0.0006
    shimmer += (shimmerGoal - shimmer) * 0.0006

    let note = part.notes[0][1]
    for (const [at, m] of part.notes) if (t >= at) note = m
    hz += (midiHz(note) - hz) * (1 - Math.exp(-1 / (0.05 * sr)))            // slides, does not step
    const vibrato = 13 * (1 - Math.exp(-Math.max(0, since - 0.35) / 0.6)) * Math.sin(2 * Math.PI * part.vibrato * since)
    phase += hz * Math.pow(2, (vibrato + drift) / 1200) / sr
    if (phase >= 1) phase -= 1

    const flow = glottis(phase)
    const env = (1 - Math.exp(-since / 0.20)) * (t > part.release ? Math.exp(-(t - part.release) / 0.26) : 1)
    const source = (flow - last) * 9 + (rnd() - 0.5) * 0.05 * (0.4 + flow)  // lips radiate the change in flow; breath rides on it
    last = flow

    let s = 0
    for (let k = 0; k < 5; k++) {
      const y = b0[k] * (source - x2[k]) - a1[k] * y1[k] - a2[k] * y2[k]
      x2[k] = x1[k]; x1[k] = source; y2[k] = y1[k]; y1[k] = y
      s += y * gain[k]
    }
    out[i] += s * env * shimmer * part.level
  }
}

// A small stone room: six damped feedback delays in parallel, two all-pass
// stages after them. Lengths are primes so the echoes never line up.
function room(dry: Float32Array, sr: number): Float32Array {
  const n = dry.length, wet = new Float32Array(n)
  const combs = [601, 653, 701, 743, 787, 823].map(len => ({ buf: new Float32Array(len), i: 0, lp: 0 }))
  const passes = [167, 113].map(len => ({ buf: new Float32Array(len), i: 0 }))
  const pre = Math.floor(0.022 * sr)
  for (let i = 0; i < n; i++) {
    const x = i >= pre ? dry[i - pre] : 0
    let s = 0
    for (const c of combs) {
      const y = c.buf[c.i]
      c.lp += (y - c.lp) * 0.62                     // each trip round the room loses some treble
      c.buf[c.i] = x + c.lp * 0.865
      c.i = (c.i + 1) % c.buf.length
      s += y
    }
    s /= combs.length
    for (const p of passes) {
      const y = p.buf[p.i]
      const v = s + y * 0.5
      p.buf[p.i] = v
      p.i = (p.i + 1) % p.buf.length
      s = y - v * 0.5
    }
    wet[i] = s
  }
  return wet
}

let cached: CgVoice | null = null

/** Mono PCM, -1..1, exactly 75 frames of 80 ms. The result is cached; do not write to it. */
export function renderVoice(): CgVoice {
  if (cached) return cached
  const sr = CG_VOICE_RATE, n = sr * CG_VOICE_SECONDS
  const dry = new Float32Array(n)
  for (const part of PARTS) sing(part, dry, sr)
  const wet = room(dry, sr)
  const samples = new Float32Array(n)
  let peak = 1e-9
  for (let i = 0; i < n; i++) {
    samples[i] = dry[i] * 0.72 + wet[i] * 0.55
    peak = Math.max(peak, Math.abs(samples[i]))
  }
  const fade = Math.floor(0.2 * sr)
  for (let i = 0; i < n; i++) {
    const tail = i > n - fade ? (n - i) / fade : 1  // the last 200 ms goes to exact silence: no click
    samples[i] = samples[i] / peak * 0.85 * tail
  }
  cached = { sampleRate: sr, samples, entries: CG_VOICE_ENTRIES.slice() }
  return cached
}
