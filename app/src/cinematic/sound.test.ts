import { afterEach, describe, expect, it, vi } from 'vitest'
import { cluster, driftCluster, lowTone, mapHum, pulseTrain, shepardFall, vowel, type Handle } from './sound'

// A sustained voice can be stopped at any moment, including the instant it
// was started, before the audio thread has run any of its envelope. Stopping
// cancels what was scheduled, and a cancelled gain falls back to its own
// value; a new gain node's own value is 1. These tests run the voices on a
// model of an AudioParam and hold them to this: a stopped voice is never
// louder than it was told to be.

type Event = { kind: 'set' | 'target' | 'linear'; time: number; value: number; tc: number }

class Param {
  private events: Event[] = []
  constructor(public value: number) {}
  private put(event: Event): this {
    // events at one time keep the order they were made in
    const at = this.events.findIndex(e => e.time > event.time)
    this.events.splice(at < 0 ? this.events.length : at, 0, event)
    return this
  }
  setValueAtTime(value: number, time: number) { return this.put({ kind: 'set', time, value, tc: 0 }) }
  setTargetAtTime(value: number, time: number, tc: number) { return this.put({ kind: 'target', time, value, tc }) }
  linearRampToValueAtTime(value: number, time: number) { return this.put({ kind: 'linear', time, value, tc: 0 }) }
  exponentialRampToValueAtTime(value: number, time: number) { return this.put({ kind: 'linear', time, value, tc: 0 }) }
  setValueCurveAtTime(curve: Float32Array, time: number, duration: number) { return this.put({ kind: 'set', time: time + duration, value: curve[curve.length - 1], tc: 0 }) }
  cancelScheduledValues(time: number) { this.events = this.events.filter(e => e.time < time); return this }
  /** What the param is at `time`, with nothing rendered yet: the events, over the param's own value. */
  valueAt(time: number): number {
    let v = this.value, from = -Infinity
    let target: Event | null = null
    const settle = (to: number) => { if (target) v = target.value + (v - target.value) * Math.exp(-(to - target.time) / target.tc) }
    for (const e of this.events) {
      if (e.kind === 'linear') {
        if (time >= e.time) { v = e.value; target = null; from = e.time; continue }
        return time <= from ? v : v + (e.value - v) * (time - from) / (e.time - from)
      }
      if (e.time > time) break
      settle(e.time)
      if (e.kind === 'set') { v = e.value; target = null } else target = e
      from = e.time
    }
    settle(time)
    return v
  }
}

class Node {
  readonly inputs: Node[] = []
  connect<T>(to: T): T { if (to instanceof Node) to.inputs.push(this); return to }
  disconnect() { /* nothing to model */ }
}
class Gain extends Node {
  readonly gain = new Param(1)
  constructor(readonly made = 0) { super() }           // when it was made: nothing runs through it before
}
class Source extends Node {
  type = 'sine'
  readonly frequency = new Param(440)
  readonly detune = new Param(0)
  started: number | null = null
  stopped: number | null = null
  start(at = 0) { this.started = at }
  stop(at = 0) { this.stopped = at }
  setPeriodicWave() { /* shape only */ }
}
class Filter extends Node { type = 'lowpass'; readonly frequency = new Param(350); readonly Q = new Param(1); readonly gain = new Param(0) }
class Plain extends Node { buffer: unknown = null; readonly threshold = new Param(0); readonly knee = new Param(0); readonly ratio = new Param(0); readonly attack = new Param(0); readonly release = new Param(0) }

class Context {
  currentTime = 0
  readonly sampleRate = 100                      // the hall is five seconds of noise: keep it short
  state = 'running'
  readonly destination = new Node()
  readonly gains: Gain[] = []
  createGain() { const g = new Gain(this.currentTime); this.gains.push(g); return g }
  createOscillator() { return new Source() }
  createBufferSource() { return new Source() }
  createBiquadFilter() { return new Filter() }
  createDynamicsCompressor() { return new Plain() }
  createConvolver() { return new Plain() }
  createBuffer(_channels: number, length: number) { const data = new Float32Array(length); return { getChannelData: () => data } }
  createPeriodicWave() { return {} }
  resume() { return Promise.resolve() }
  suspend() { return Promise.resolve() }
}

const asCtx = (ctx: Context) => ctx as unknown as AudioContext
const asNode = (node: Node) => node as unknown as AudioNode

const VOICES: [string, number, (ctx: Context, out: Node, t0: number) => Handle][] = [
  ['lowTone', 0.14, (ctx, out, t0) => lowTone(asCtx(ctx), asNode(out), 49, t0, 4, { gain: 0.14 })],
  ['vowel', 0.17, (ctx, out, t0) => vowel(asCtx(ctx), asNode(out), 110, t0, { gain: 0.17, attack: 0.4 })],
  ['cluster', 0.03, (ctx, out, t0) => cluster(asCtx(ctx), asNode(out), t0, { gain: 0.03 })],
  ['pulseTrain', 0.3, (ctx, out, t0) => pulseTrain(asCtx(ctx), asNode(out), t0, { gain: 0.3 })],
  ['driftCluster', 0.28, (ctx, out, t0) => driftCluster(asCtx(ctx), asNode(out), t0, { gain: 0.28 })],
  ['shepardFall', 0.16, (ctx, out, t0) => shepardFall(asCtx(ctx), asNode(out), t0, 8, { gain: 0.16 })],
]
const TIMES = [0, 0.001, 0.01, 0.05, 0.2, 1, 5, 30]

describe('a sustained voice stopped at any moment', () => {
  for (const [name, level, make] of VOICES) {
    it(`${name}: stopped the instant it starts, it never opens`, () => {
      const ctx = new Context(), out = new Node()
      ctx.currentTime = 3
      const voice = make(ctx, out, 3)
      voice.stop(3, 1.5)
      const bus = out.inputs[0] as Gain
      for (const dt of TIMES) expect(bus.gain.valueAt(3 + dt), `${dt} s after`).toBe(0)
    })

    it(`${name}: stopped before its start time, it never opens`, () => {
      const ctx = new Context(), out = new Node()
      const voice = make(ctx, out, 2)                       // scheduled two seconds ahead
      voice.stop(0, 0.06)                                   // and skipped at once
      const bus = out.inputs[0] as Gain
      for (const dt of TIMES) expect(bus.gain.valueAt(dt), `at ${dt} s`).toBe(0)
      for (const dt of TIMES) expect(bus.gain.valueAt(2 + dt), `${dt} s after its start`).toBe(0)
    })

    it(`${name}: stopped part of the way up, it falls from where it was`, () => {
      const ctx = new Context(), out = new Node()
      const voice = make(ctx, out, 0)
      const bus = out.inputs[0] as Gain
      const reached = bus.gain.valueAt(0.5)
      expect(reached).toBeGreaterThan(0)
      expect(reached).toBeLessThanOrEqual(level)
      voice.stop(0.5, 1.5)
      let last = reached
      for (const dt of TIMES) {
        const now = bus.gain.valueAt(0.5 + dt)
        expect(now, `${dt} s after`).toBeLessThanOrEqual(last + 1e-12)
        last = now
      }
      expect(last).toBeLessThan(1e-6)
    })

    it(`${name}: left alone, it settles at its level`, () => {
      const ctx = new Context(), out = new Node()
      make(ctx, out, 0)
      const bus = out.inputs[0] as Gain
      expect(bus.gain.valueAt(0)).toBe(0)
      expect(bus.gain.valueAt(60)).toBeCloseTo(level, 3)
      for (const dt of TIMES) expect(bus.gain.valueAt(dt)).toBeLessThanOrEqual(level)
    })
  }
})

describe('the map hum, started and stopped in any order', () => {
  afterEach(() => { mapHum.stop(); vi.unstubAllGlobals() })

  // The one shared context, standing in for the browser's. A note of the hum is the gain that
  // five partials and the upper range feed: six inputs.
  let shared: Context | null = null
  function world(): Context {
    if (!shared) {
      const made = new Context()
      shared = made
      vi.stubGlobal('window', { AudioContext: function () { return made }, setTimeout: () => 0 })
      vi.stubGlobal('document', { hidden: false, addEventListener: () => undefined })
      vi.stubGlobal('navigator', { userActivation: { hasBeenActive: true } })
    } else {
      vi.stubGlobal('window', { setTimeout: () => 0 })
    }
    return shared
  }
  const notes = (ctx: Context, since: number) => ctx.gains.slice(since).filter(g => g.inputs.length === 6)
  const loudest = (buses: Gain[], from: number) =>
    Math.max(...TIMES.map(dt => buses.reduce((sum, bus) => sum + (bus.made <= from + dt ? bus.gain.valueAt(from + dt) : 0), 0)))

  it('start, stop, start in one instant (a development double mount): no louder than one note', () => {
    const ctx = world(), since = ctx.gains.length
    ctx.currentTime = 10
    mapHum.start(1)
    mapHum.stop()
    mapHum.start(1)
    const buses = notes(ctx, since)
    expect(buses).toHaveLength(2)
    for (const dt of TIMES) expect(buses[0].gain.valueAt(10 + dt), `the first note, ${dt} s after`).toBe(0)
    expect(loudest(buses, 10)).toBeLessThanOrEqual(0.14)
    expect(buses[1].gain.valueAt(40)).toBeCloseTo(0.14, 3)
    expect(mapHum.playing).toBe(true)
  })

  it('start then stop in one instant: silence', () => {
    const ctx = world(), since = ctx.gains.length
    ctx.currentTime = 20
    mapHum.start(3)
    mapHum.stop()
    const buses = notes(ctx, since)
    expect(buses).toHaveLength(3)
    expect(loudest(buses, 20)).toBe(0)
    expect(mapHum.playing).toBe(false)
  })

  it('stop with nothing playing, twice, then start twice: one note', () => {
    const ctx = world(), since = ctx.gains.length
    ctx.currentTime = 30
    mapHum.stop()
    mapHum.stop()
    mapHum.start(1)
    mapHum.start(1)
    const buses = notes(ctx, since)
    expect(buses).toHaveLength(1)
    expect(loudest(buses, 30)).toBeLessThanOrEqual(0.14)
  })

  it('stop a little after starting, and start again at once: the two together stay under one note', () => {
    const ctx = world(), since = ctx.gains.length
    ctx.currentTime = 40
    mapHum.start(1)
    for (const gap of [0.005, 0.3, 2]) {
      ctx.currentTime += gap
      mapHum.stop()
      mapHum.start(1)
    }
    const buses = notes(ctx, since)
    expect(buses).toHaveLength(4)
    for (const from of [40, 40.005, 40.305, 42.305]) expect(loudest(buses, from)).toBeLessThanOrEqual(0.14 + 1e-9)
  })
})
