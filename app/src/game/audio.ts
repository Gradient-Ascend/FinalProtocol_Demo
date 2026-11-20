/**
 * audio.ts — Web Audio synthesized SFX + simple adaptive music + mute toggle (remembered in localStorage).
 * No audio asset files at all — everything is synthesized at runtime.
 */

import { storage } from "./storage";

export type SfxId = "move" | "hit" | "pickup" | "ui" | "explosion" | "overload" | "win" | "lose";

export type OverloadSfxSchedule = {
  strikes: readonly [number, number, number];
  unleashAt: number;
  shockwaves: readonly [number, number, number];
};

const overloadNoiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function overloadNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = overloadNoiseCache.get(ctx);
  if (!buf) {
    const rate = Math.max(100, ctx.sampleRate || 44100);
    const len = Math.max(16, Math.floor(rate * 0.8));
    buf = ctx.createBuffer(1, len, rate);
    const data = buf.getChannelData(0);
    let s = 0x9e3779b9;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s ^ (s >>> 13), 1274126177) + 0x6d2b79f5) >>> 0;
      data[i] = ((s >>> 0) / 4294967295) * 2 - 1;
    }
    overloadNoiseCache.set(ctx, buf);
  }
  return buf;
}

/**
 * 3-stage accelerating turbine + silent time-pause strike pockets (0..0.70 s),
 * followed by quantized data-stream bursts & 3 shockwave sub-booms (0.70..1.20 s).
 */
export function scheduleOverloadSfx(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t0 = ctx.currentTime,
): OverloadSfxSchedule {
  const stages: readonly [offset: number, fStart: number, fEnd: number][] = [
    [0.0, 140, 330],
    [0.23, 235, 560],
    [0.46, 380, 960],
  ];
  const nBuf = overloadNoiseBuffer(ctx);

  for (let stage = 0; stage < stages.length; stage++) {
    const [offset, fStart, fEnd] = stages[stage];
    const tStart = t0 + offset;
    const tStrike = tStart + 0.15;
    const peak = 0.22 + stage * 0.04;

    const rotor = ctx.createOscillator();
    const whine = ctx.createOscillator();
    const bp = ctx.createBiquadFilter();
    const env = ctx.createGain();
    rotor.type = "sawtooth";
    whine.type = "triangle";
    rotor.frequency.setValueAtTime(fStart, tStart);
    rotor.frequency.exponentialRampToValueAtTime(fEnd, tStrike);
    whine.frequency.setValueAtTime(fStart * 2, tStart);
    whine.frequency.exponentialRampToValueAtTime(fEnd * 2.02, tStrike);

    bp.type = "bandpass";
    bp.Q.value = 4.2 + stage * 0.8;
    bp.frequency.setValueAtTime(fStart * 3, tStart);
    bp.frequency.exponentialRampToValueAtTime(fEnd * 4.2, tStrike);

    env.gain.setValueAtTime(0, tStart);
    env.gain.linearRampToValueAtTime(peak, tStart + 0.012);
    env.gain.setValueAtTime(peak, tStrike);
    env.gain.linearRampToValueAtTime(0.0001, tStrike + 0.014);

    rotor.connect(bp);
    whine.connect(bp);
    bp.connect(env).connect(dest);
    rotor.start(tStart);
    whine.start(tStart);
    rotor.stop(tStrike + 0.025);
    whine.stop(tStrike + 0.025);

    // Filtered intake jet noise sweeping upward with turbine RPM
    const jet = ctx.createBufferSource();
    const jetBp = ctx.createBiquadFilter();
    const jetGain = ctx.createGain();
    jet.buffer = nBuf;
    jetBp.type = "bandpass";
    jetBp.Q.value = 3.0;
    jetBp.frequency.setValueAtTime(550 + stage * 420, tStart);
    jetBp.frequency.exponentialRampToValueAtTime(1700 + stage * 1050, tStrike);
    const jetPeak = 0.11 + stage * 0.025;
    jetGain.gain.setValueAtTime(0, tStart);
    jetGain.gain.linearRampToValueAtTime(jetPeak, tStart + 0.014);
    jetGain.gain.setValueAtTime(jetPeak, tStrike);
    jetGain.gain.linearRampToValueAtTime(0.0001, tStrike + 0.014);
    jet.connect(jetBp).connect(jetGain).connect(dest);
    jet.start(tStart, (stage * 0.19) % 0.5);
    jet.stop(tStrike + 0.025);

    // Chrono-lock transient right as the battlefield time-pauses at tStrike
    const ping = ctx.createOscillator();
    const pingGain = ctx.createGain();
    ping.type = "sine";
    ping.frequency.setValueAtTime(880 * Math.pow(1.5, stage), tStrike);
    pingGain.gain.setValueAtTime(0, tStrike);
    pingGain.gain.linearRampToValueAtTime(0.15 + stage * 0.03, tStrike + 0.008);
    pingGain.gain.exponentialRampToValueAtTime(0.001, tStrike + 0.065);
    ping.connect(pingGain).connect(dest);
    ping.start(tStrike);
    ping.stop(tStrike + 0.075);

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(105, tStrike);
    sub.frequency.exponentialRampToValueAtTime(38, tStrike + 0.06);
    subGain.gain.setValueAtTime(0, tStrike);
    subGain.gain.linearRampToValueAtTime(0.20, tStrike + 0.008);
    subGain.gain.exponentialRampToValueAtTime(0.001, tStrike + 0.062);
    sub.connect(subGain).connect(dest);
    sub.start(tStrike);
    sub.stop(tStrike + 0.07);
  }

  // Unleash: rapid flashing digital data-stream telemetry + 3 expanding shockwave booms
  const tUnleash = t0 + 0.70;
  const dataFreqs = [1320, 1760, 1580, 2120, 1480, 2340, 1880, 2480];
  const dataLp = ctx.createBiquadFilter();
  dataLp.type = "lowpass";
  dataLp.frequency.setValueAtTime(3600, tUnleash);
  dataLp.connect(dest);
  for (let k = 0; k < dataFreqs.length; k++) {
    const tP = tUnleash + k * 0.032;
    const dOsc = ctx.createOscillator();
    const dGain = ctx.createGain();
    dOsc.type = "square";
    dOsc.frequency.setValueAtTime(dataFreqs[k], tP);
    dGain.gain.setValueAtTime(0, tP);
    dGain.gain.linearRampToValueAtTime(0.12, tP + 0.008);
    dGain.gain.exponentialRampToValueAtTime(0.001, tP + 0.032);
    dOsc.connect(dGain).connect(dataLp);
    dOsc.start(tP);
    dOsc.stop(tP + 0.04);
  }

  const shockwaves = [t0 + 0.70, t0 + 0.825, t0 + 0.95] as const;
  const boomGains = [0.24, 0.20, 0.17];
  const thumpGains = [0.14, 0.11, 0.09];
  for (let w = 0; w < shockwaves.length; w++) {
    const tBoom = shockwaves[w];
    const sOsc = ctx.createOscillator();
    const tOsc = ctx.createOscillator();
    const bGain = ctx.createGain();
    sOsc.type = "sine";
    tOsc.type = "triangle";
    sOsc.frequency.setValueAtTime(118, tBoom);
    sOsc.frequency.exponentialRampToValueAtTime(34, tBoom + 0.24);
    tOsc.frequency.setValueAtTime(96, tBoom);
    tOsc.frequency.exponentialRampToValueAtTime(29, tBoom + 0.24);
    bGain.gain.setValueAtTime(0, tBoom);
    bGain.gain.linearRampToValueAtTime(boomGains[w], tBoom + 0.01);
    bGain.gain.exponentialRampToValueAtTime(0.001, tBoom + 0.25);
    sOsc.connect(bGain);
    tOsc.connect(bGain);
    bGain.connect(dest);
    sOsc.start(tBoom);
    tOsc.start(tBoom);
    sOsc.stop(tBoom + 0.26);
    tOsc.stop(tBoom + 0.26);

    const thump = ctx.createBufferSource();
    const lp = ctx.createBiquadFilter();
    const tGain = ctx.createGain();
    thump.buffer = nBuf;
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(240, tBoom);
    lp.frequency.exponentialRampToValueAtTime(95, tBoom + 0.20);
    tGain.gain.setValueAtTime(0, tBoom);
    tGain.gain.linearRampToValueAtTime(thumpGains[w], tBoom + 0.01);
    tGain.gain.exponentialRampToValueAtTime(0.001, tBoom + 0.21);
    thump.connect(lp).connect(tGain).connect(dest);
    thump.start(tBoom, (w * 0.11) % 0.4);
    thump.stop(tBoom + 0.22);
  }

  return {
    strikes: [t0 + 0.15, t0 + 0.38, t0 + 0.61] as const,
    unleashAt: tUnleash,
    shockwaves,
  };
}

// The mute setting has one key and one encoding, the battle store's: a JSON boolean under
// "muted". This file used to write "1"/"0" to the same key, so each side misread the other.
// storage.ts never throws (storage disabled, private mode, blocked iframe), so neither do these.
function readMuted(): boolean {
  return storage.flag("muted");
}
function writeMuted(v: boolean): void {
  storage.set("muted", v);
}

// The level of the battle's pulse, and how fast it leaves and returns around a display moment.
const MUSIC_LEVEL = 0.06;
const DUCK_OUT = 0.05; // seconds, time constant
const DUCK_IN = 0.3;

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicOsc: OscillatorNode | null = null;
  private musicGain: GainNode | null = null;
  // A display moment is playing: the music is held at silence until it is over.
  private ducked = false;
  private disposed = false;
  muted = false;

  // browsers require a first user interaction before the AudioContext can start
  private readonly unlock = () => {
    this.ensureCtx();
    this.detachUnlock();
  };

  constructor() {
    this.muted = readMuted();
    window.addEventListener("pointerdown", this.unlock);
    window.addEventListener("keydown", this.unlock);
  }

  private detachUnlock(): void {
    window.removeEventListener("pointerdown", this.unlock);
    window.removeEventListener("keydown", this.unlock);
  }

  /**
   * Release everything: unlock listeners, the music oscillator and the AudioContext.
   * Call it from your teardown path (stopGame) next to input.dispose() — otherwise React
   * StrictMode's double mount / HMR leaks one AudioContext per mount, and Chrome caps a
   * page at about six of them.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachUnlock();
    this.stopMusic();
    this.master?.disconnect();
    this.master = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    writeMuted(this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  sfx(id: SfxId): void {
    if (this.disposed || this.muted) return; // muted: no context is created either
    const ctx = this.ensureCtx();
    if (!this.master) return;
    const t = ctx.currentTime;
    if (id === "overload") {
      scheduleOverloadSfx(ctx, this.master, t);
      return;
    }
    const spec: Record<Exclude<SfxId, "overload">, [type: OscillatorType, f0: number, f1: number, dur: number, gain: number]> = {
      move: ["triangle", 220, 180, 0.08, 0.15],
      hit: ["square", 160, 60, 0.12, 0.3],
      pickup: ["sine", 660, 990, 0.12, 0.25],
      ui: ["sine", 440, 520, 0.05, 0.15],
      explosion: ["sawtooth", 120, 30, 0.4, 0.4],
      win: ["sine", 523, 1046, 0.5, 0.3],
      lose: ["sawtooth", 220, 55, 0.6, 0.3],
    };
    const [type, f0, f1, dur, g] = spec[id];
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    env.gain.setValueAtTime(g, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  /** Minimal adaptive background pulse (replace with a full score). */
  startMusic(): void {
    if (this.disposed) return;
    const ctx = this.ensureCtx();
    if (this.musicOsc) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 55; // A1 sustained bass
    gain.gain.value = this.ducked ? 0 : MUSIC_LEVEL;
    osc.connect(gain).connect(this.master!);
    osc.start();
    this.musicOsc = osc;
    this.musicGain = gain;
  }

  stopMusic(): void {
    this.musicOsc?.stop();
    this.musicOsc = null;
    this.musicGain = null;
  }

  /**
   * Take the music down to silence under a display moment (true) and bring it back after
   * (false). The gain glides both ways, so neither edge clicks; sound effects are untouched.
   */
  duckMusic(on: boolean): void {
    this.ducked = on;
    const ctx = this.ctx;
    const gain = this.musicGain?.gain;
    if (!ctx || !gain) return;
    const now = ctx.currentTime;
    gain.cancelScheduledValues(now);
    if (on) {
      gain.setTargetAtTime(0, now, DUCK_OUT); // 95 percent down in three time constants
      gain.setValueAtTime(0, now + DUCK_OUT * 10); // then exactly silent (the step is 0.005 percent of the level)
    } else {
      gain.setTargetAtTime(MUSIC_LEVEL, now, DUCK_IN);
    }
  }
}
