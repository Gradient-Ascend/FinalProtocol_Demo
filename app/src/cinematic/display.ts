// The beat clock for full-screen display moments, and the few helpers every
// such moment shares: easing, staggering, the pull-back curve, the flash
// gate and the three spectator dots.
//
// A moment is a list of beats on one clock, so that skip, seek and reduced
// motion are handled in one place instead of in every shot.

export type Beat = {
  at: number                         // seconds from the start of the moment
  dur: number
  // Called every step while the beat is running (and once more at k = 1 if a
  // long frame stepped over its end). k runs 0..1; under reduced motion it
  // arrives in four held steps unless `smooth` is set.
  draw?: (k: number, t: number) => void
  // Called once, when the clock first passes `at`. t0 is the audio clock at
  // that moment (0 when there is no audio), late is how far past `at` we are.
  cue?: (t0: number, late: number) => void
  // Keep reduced motion from stepping this beat: for fades and for shots that
  // handle reduced motion themselves.
  smooth?: boolean
}

export type AudioClock = { currentTime: number }

export const clamp01 = (k: number) => (k < 0 ? 0 : k > 1 ? 1 : k)
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k
export const stepped = (k: number) => Math.min(1, Math.floor(k * 4 + 1) / 4)
export const easeOutCubic = (k: number) => 1 - (1 - k) ** 3
export const easeOutExpo = (k: number) => (k >= 1 ? 1 : 1 - 2 ** (-10 * k))
export const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
export const easeInOutSine = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * k)
export const smoother = (k: number) => k * k * k * (k * (6 * k - 15) + 10)

/** Progress 0..1 of `t` through the window that starts at `start` and lasts `dur`. */
export const span = (t: number, start: number, dur: number) => clamp01((t - start) / Math.max(1e-6, dur))

/** Local clock of item i in a staggered move: 0 before its start, 1 after its end. */
export const local = (t: number, start: number, i: number, stagger: number, flight: number) =>
  clamp01((t - start - i * stagger) / flight)

/** A scale that changes at a constant apparent speed: exponential between s0 and s1. */
export const pullBack = (s0: number, s1: number, k: number) => s0 * (s1 / s0) ** easeInOutCubic(clamp01(k))

/** Frame-rate independent ease toward a goal with time constant tau (seconds). */
export const approach = (value: number, goal: number, dt: number, tau: number) =>
  value + (goal - value) * (1 - Math.exp(-dt / Math.max(1e-4, tau)))

export class Display {
  private t = 0
  private readonly fired = new Set<Beat>()
  private readonly ended = new Set<Beat>()
  readonly length: number

  constructor(private readonly beats: Beat[], private readonly audio: AudioClock | null = null, private readonly reduced = false) {
    this.length = beats.reduce((end, b) => Math.max(end, b.at + b.dur), 0)
  }

  get time() { return this.t }
  get done() { return this.t >= this.length }

  /** Advance the clock and run every beat that is due. Returns false when finished. */
  step(dt: number): boolean {
    this.t = Math.min(this.length, this.t + Math.max(0, dt))
    for (const b of this.beats) {
      if (this.t < b.at) continue
      if (!this.fired.has(b)) {
        this.fired.add(b)
        b.cue?.(this.audio ? this.audio.currentTime : 0, this.t - b.at)
      }
      if (!b.draw || this.ended.has(b)) continue
      const k = b.dur > 0 ? Math.min(1, (this.t - b.at) / b.dur) : 1
      if (k >= 1) this.ended.add(b)
      b.draw(this.reduced && !b.smooth ? stepped(k) : k, this.t)
    }
    return this.t < this.length
  }

  /** Jump to a time without sounding the cues that lie before it. */
  seek(t: number): void {
    this.t = Math.max(0, Math.min(this.length, t))
    this.fired.clear()
    this.ended.clear()
    for (const b of this.beats) {
      if (b.at < this.t) this.fired.add(b)
      if (b.at + b.dur < this.t) this.ended.add(b)
    }
  }

  /** Go to the end. The caller fades the sound (60 ms is enough). */
  skip(): void { this.seek(this.length) }
}

// One gate for every large-area brightness jump: never more than `max`
// starts in any rolling second (the legal line is three).
const flashStamps: number[] = []
export function allowFlash(nowMs: number, max = 2): boolean {
  while (flashStamps.length && nowMs - flashStamps[0] >= 1000) flashStamps.shift()
  if (flashStamps.length >= max) return false
  flashStamps.push(nowMs)
  return true
}

/** For anything that pulses over a large area: cap its rate of change. */
export function slew(current: number, goal: number, dt: number, maxPerSecond = 0.6): number {
  const step = maxPerSecond * dt
  return current + Math.max(-step, Math.min(step, goal - current))
}

// The one face for every word drawn on a canvas, the board's as well as the moments'. The stylesheet
// names the same stack. No face is downloaded, so the first that the machine has is the one used.
export const MONO = '"JetBrains Mono", "Cascadia Code", "SF Mono", SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", monospace'

// The three spectators: 2 px dots at 6 percent white, top-right of every
// full-screen scene from the first frame of the opening to the last frame of
// the ending. Nothing refers to them. `hues` tints one dot per entered petal
// (CSS colours, drawn at 20 percent); the order is grove, court, carcosa.
export const SPECTATOR = { inset: 26, spread: 5, size: 2 }

export function spectatorDots(width: number): [number, number][] {
  const cx = width - SPECTATOR.inset, cy = SPECTATOR.inset, r = SPECTATOR.spread
  return [[cx, cy - r], [cx - r * 0.866, cy + r * 0.5], [cx + r * 0.866, cy + r * 0.5]]
}

/** Draw the spectators on a context whose units are CSS pixels. */
export function drawSpectators(ctx: CanvasRenderingContext2D, width: number, hues: (string | null | undefined)[] = []): void {
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  spectatorDots(width).forEach(([x, y], i) => {
    const hue = hues[i]
    ctx.globalAlpha = hue ? 0.2 : 0.06
    ctx.fillStyle = hue || '#ffffff'
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, SPECTATOR.size, SPECTATOR.size)
  })
  ctx.restore()
}
