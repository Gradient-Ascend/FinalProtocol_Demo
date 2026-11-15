# 13. Sound that makes people tremble, synthesised entirely with the Web Audio API

## Summary

The whole score can be synthesised in the browser, and this dossier contains a complete kit that does it: about 900 lines of TypeScript that type-check in strict mode and were rendered cue by cue in headless Chrome without errors. Nobody has listened to it yet. Levels, lengths and safety are measured; timbre still needs ears.

What the research supports:

- **Chills follow broken expectation.** The best-evidenced triggers are an unexpected harmony, an appoggiatura, a soft-to-loud leap, a loudness peak, and a melody in the range of the human voice [1][2]. Only about one listener in ten reports chills in one large survey [2], so the score uses many small levers instead of one loud one.
- **Infrasound is not a tool.** The famous 17 Hz concert result (22% reported unease) has no reported control or replication, the 19 Hz "ghost" story is an anecdote, and no phone can reproduce it [4].
- **Bass on small speakers is implied, not played.** Harmonics alone make the ear hear the missing low note, the same trick some pipe organs use [5]. Every low event in the kit carries harmonics 2 to 5.
- **The Deep Note is 30 voices wandering at random, then gliding late onto a just-intoned, slightly detuned chord** [6][7][8]. The kit uses the principle on other pitches.
- **Three techniques map directly onto the theme:** a pedal tone that never moves (the cage) [12], tintinnabuli's fixed triad answering a free melody (theology answering a mind) [11], and the Shepard-Risset glissando (a rise with no arrival, a sandbox with no outside) [9].

The proposed score has one tonal centre, D, and one invented hymn. The opening is a single 80-second offline render, so the cinematic can draw the true samples of what is heard in 80 ms frames (exactly 1000 of them) [18]. Its four shots rise from -40.6 to -24.4 dBFS RMS; the loudest moment in the game peaks near -6 dBFS. Each god bends the same material: Shub-Niggurath's kid multiplies one voice into eight over slow breath, the Queen in Red has a music-box waltz with a single "cruelty" control, and Hastur is an open fifth with the third filtered out of everything. Defeat cuts all sound, including the reverb tail, to a click and room tone.

Rules that are not negotiable: sound starts only on a user gesture [17], one mute is honoured everywhere, no fast loud onsets, and every meaningful sound has a caption [22].

## Findings

Numbers in square brackets refer to the Sources list. "Unverified" means the claim was not confirmed on a page read for this dossier. "Design inference" means the conclusion is mine, drawn from the cited facts.

### A. What works, and why

**1. Chills come from broken expectation, not from loudness alone.** The Wikipedia survey of frisson calls violated expectation in rhythm, dynamics, harmony or melody a prerequisite, and lists loud passages, very high or low frequencies, unexpected harmonies, modulations and appoggiaturas as triggers [1]. Harrison and Loui's 2014 review reports three bodies of evidence [2]:
- Sloboda (1991): the passages people named most often contained chord progressions descending the circle of fifths to the tonic, melodic appoggiaturas, the onset of unexpected harmonies, and melodic or harmonic sequences.
- Panksepp (1995) and Guhn et al. (2007): sudden dynamic leaps, mostly soft to loud, are "major catalysts for frisson" [2].
- Grewe et al. (2007): chills began most often at peaks in loudness, at modulations, and where the melody sat in the range of the human voice.

Search summaries of Sloboda's paper add that tears go with appoggiaturas and sequences while shivers go with new or unexpected harmony [3]; I did not read the paper itself, so treat the tears/shivers split as secondary.

**2. Not everyone gets chills, and "goosebumps" is a loose word.** In Gabrielsson (2011), as reported by the review, tears were reported by 24% of participants, chills or shivers by 10%, piloerection by 5% [2]. McPhetres et al. (2024) found self-reported chills do not match observable goosebumps [1]. Frisson is associated with the trait openness to experience [1]. An opioid blocker reduced music chills in one study, and imaging ties chill intensity to reward areas (nucleus accumbens, orbitofrontal cortex, insula) [1]. Design inference: build for the many small levers (a voice entering, a harmony that turns, a held silence) instead of betting the opening on one loud moment that perhaps one listener in ten will feel physically.

**3. Infrasound: little is supported, and the game cannot use it anyway.** What the record shows [4]:
- The lower limit of hearing is conventionally 20 Hz; pure tones down to about 12 Hz can be identified at very high level.
- The 2003 "Infrasonic" concert in London played a soft 17 Hz tone under two of four pieces to about 700 people; 22% of respondents reported unease, sorrow, chills or fear. The article gives no control comparison or statistical test, and reports no replication.
- Vic Tandy's 19 Hz "ghost" account is an anecdote about a fan and a vibrating fencing foil, plus a conjecture about eye resonance.
- A 2006 review found little evidence of physiological effects below the perception threshold; attempts to demonstrate the "brown note" failed.

Design inference: phone and laptop speakers reproduce nothing near 17 Hz, and the master chain below removes everything under 28 Hz to protect small drivers. Do not claim an infrasonic effect in the game or in its marketing. The usable lesson is narrower: low, barely audible tones unsettle because the listener cannot locate or name them.

**4. The ear supplies a bass note that the speaker cannot.** If a sound contains 200, 300, 400 and 500 Hz, listeners hear a pitch of 100 Hz although nothing sounds at 100 Hz [5]. Telephones cut below about 300 Hz and a male voice is still heard at its true pitch; commercial bass enhancers synthesise harmonics for small loudspeakers on this principle; some pipe organs use it to get very low notes from small pipes [5]. This is the method for the game's low D (36.7 Hz): always sound harmonics 2 to 5 with it. The link to the organ is a gift to the theme: the church's trick for implying a depth it does not have.

**5. The THX Deep Note is a crowd that becomes a chord.** James A. Moorer composed it in late 1982: 30 voices that start in a narrow band and by the fourth of seven measures reach preselected pitches spanning three octaves; the top pitch is slightly detuned and the two lowest pitches carry double the voices [6]. Moorer's notes, as preserved in the comments of Perry Cook and Ge Wang's ChucK emulation, say the voices wander at random in a cluster, that the final chord is detuned at random so the voices do not fuse, and that it is tuned in just intonation, which makes it sound bigger than equal temperament [7]. The emulation's targets are 37.5, 75, 150, 300, 600, 900, 1200, 1500 and 1800 Hz (ratios 1, 2, 4, 8, 16, 24, 32, 40, 48: octaves of D with a fifth and a major third on top), with 12.5 s of wandering, a 6 s glide and a 5.5 s hold [7]. Bozkurt's SuperCollider reconstruction quotes Moorer as saying the code "relies on random number generators", so each run differs; his version uses sawtooths starting between 200 and 400 Hz and opens a low-pass filter from 2 kHz upward during the sweep [8]. The program was 355 lines of C plus a 300-line patch file [6]. The lesson for a 30-voice browser synth: random wander, a late and accelerating glide, a just-intoned stack, slight residual detune, a filter that opens as the chord lands. The sound itself is protected (Bozkurt notes that it is copyrighted [8]; its trademark status was not checked here); build the principle on other pitches and timings, not a copy.

**6. The Shepard-Risset glissando rises forever.** Roger Shepard (1964) stacked sine waves an octave apart and gave each a loudness that follows a bell curve over pitch (a raised cosine), so components fade in at the bottom and out at the top and no start or end is heard; Jean-Claude Risset made the continuous gliding version [9]. Christopher Nolan's films use it for mounting tension (Dunkirk, The Prestige), and Super Mario 64 uses a Shepard scale on its endless stairs [9]. For this game it is the sound of a sandbox with no outside: motion with no arrival.

**7. Micropolyphony: many lines, heard as one texture.** Ligeti's technique layers dense canons moving at different speeds so that the result is a moving cluster; he said the polyphony itself is not heard, only "a kind of impenetrable texture", like a densely woven cobweb [10]. Works: Apparitions, Atmosphères, the Requiem, Lux aeterna, Lontano [10]. (That Kubrick used several of these in 2001: A Space Odyssey is well known but was not on the page read: unverified here.) Synthesis recipe: one melodic line, 8 to 16 copies, each entering late and slightly off pitch, slides instead of steps.

**8. Tintinnabuli: a melody and its bell.** Arvo Pärt's style from Für Alina (1976) pairs a voice that moves mostly by step through the scale with a "tintinnabular" voice that sounds only notes of the tonic triad; Pärt: "The three notes of a triad are like bells." His encounter with chant shaped it [11]. (The labels "M-voice" and "T-voice" come from Paul Hillier's analysis and were not on the page read: unverified here.) It is cheap to synthesise, and it models the game's thesis in two voices: a living line, and a fixed frame that answers every note it sings.

**9. Pedal tones and drones hold the listener in place.** A pedal point is a note sustained, usually in the bass, while harmonies change above it; the name comes from the organ's pedal keyboard, which can hold a note for as long as the foot stays down. It pulls the harmony back to its root and builds expectation by delaying resolution; a drone is in effect a longer pedal point [12]. (The Byzantine ison and the drone practice in plainchant were not covered by a source read here: unverified.)

**10. Three film scores, three methods.**
- *Arrival* (Jóhann Jóhannsson): built on the human voice because the film is about language; the ensemble Theatre of Voices was chosen for its command of unusual vocal techniques; piano drones recorded without their attacks on a 16-track tape loop at different speeds. Notably he avoided clusters and micropolyphony in favour of short irregular notes layered into rhythms [13].
- *Chernobyl* (Hildur Guðnadóttir): she went into a decommissioned power plant in Lithuania in protective clothing, with field recordist Chris Watson, and drew the score's sounds from the building; her stated aim: "I wanted to experience what it feels like to be inside a power plant." [14] For this game the equivalent of the building is the machine: the score should be made of the model's own sounds (ticks of tokens, the cursor tone, room tone of a server hall).
- *Dune* (Hans Zimmer): reported in interviews as avoiding the conventional orchestra, inventing instruments, and centring women's voices singing and whispering in a made-up language [15]. I saw these only in search summaries of press coverage, not on a page read in full: treat as lightly sourced. No source read here documents how the score's low end was built.

**11. Detuned unisons beat, and the beat rate is a design parameter.** Two tones at f1 and f2 sum to a tone whose loudness swells at the difference f2 - f1 (a trigonometric identity, not a citation). Seven cents apart at 36.7 Hz gives a swell every 6.7 s; the same seven cents at 587 Hz gives 2.4 swells a second. Low drones can therefore be detuned freely and stay calm; high voices need less. Moorer's reason for detuning the Deep Note's final chord, so that the voices do not fuse into one, is the same principle put to use [7].

**12. Reverb as scale, and silence before impact: reasoned, not cited.** No source read for this dossier tests either claim. The reasoning: a long, dark tail with a gap before it starts is what a very large stone room does to sound, so the ear reads size from it; and since soft-to-loud contrast is among the best-supported chill triggers [2], lowering the level before an entrance buys the same contrast without raising the peak. Both are standard practice; label them as craft, not science.

### B. What the Web Audio API guarantees

**13. Audio must start from a user gesture.** MDN's rule: "Create or resume context from inside a user gesture." A context made outside a gesture starts `suspended`; call `resume()` in a click or key handler. MDN also asks for visible play, mute and volume controls, with labelled buttons and `role="switch"` for on/off toggles [17].

**14. Ramps.** Scheduled `AudioParam` methods take precedence over setting `.value` [17]. `setTargetAtTime(target, start, timeConstant)` approaches the target exponentially: 63.2% after one time constant, 95% after three, 99.3% after five; it is the natural shape for releases. `exponentialRampToValueAtTime` cannot start from or end at zero [21]. Hence the rule in the code below: fades to silence use `setTargetAtTime`, with the time constant set to the wanted duration divided by three to five.

**15. The limiter.** `DynamicsCompressorNode` defaults: threshold -24 dB (range -100 to 0), knee 30 (0 to 40), ratio 12 (1 to 20), attack 0.003 s (0 to 1), release 0.25 s (0 to 1). Attack is defined as the time to reduce gain by 10 dB [20]. It lowers the loudest parts and "can help prevent clipping" when sounds are combined [20]; it is a compressor, not a guaranteed ceiling, so the chain below adds headroom before it and a fixed gain after it. (The specification's details on makeup gain and look-ahead were not reached in the read: unverified. The measurements in the next section were taken through the real node in Chrome.)

**16. Reverb.** `ConvolverNode` convolves its input with an impulse response held in a mono, stereo or four-channel `AudioBuffer`; `normalize` applies an equal-power scaling when the buffer is set [19]. The impulse response can be generated in code. (That the buffer's sample rate must equal the context's is in the specification, not on the MDN page read: unverified here; the code avoids the question by creating the buffer from the context.)

**17. Noise.** White noise is uniform random samples. The pink-noise filter used below is the three-pole "economy" filter attributed to Paul Kellet; the musicdsp.org page for it points to a text file that I could not retrieve, so the coefficients are reproduced from common use and are unverified [23]. The buffer is normalised after generation, so a small error in them changes colour slightly, not level.

**18. Offline rendering gives the real samples.** `OfflineAudioContext` builds the same node graph but, instead of playing, "generates it, as fast as it can, and outputs the result to an `AudioBuffer`"; `startRendering()` returns a promise of that buffer [18]. This is how the opening can show the true waveform of what is heard: render the cue offline, cut the samples into 80 ms frames, and play the same buffer.

**19. Formant data for a synthetic choir.** The Csound manual's formant table gives five formants per vowel and voice type (centre frequency, level, bandwidth) [16]. Bass and soprano are reproduced as data in the code below (`BASS`, `SOPRANO`); the first two formants, which carry vowel identity, are:

| Vowel | Bass F1 / F2 (Hz) | Bass bandwidths (Hz) | Soprano F1 / F2 (Hz) | Soprano bandwidths (Hz) |
|---|---|---|---|---|
| a | 600 / 1040 | 60 / 70 | 800 / 1150 | 80 / 90 |
| e | 400 / 1620 | 40 / 80 | 350 / 2000 | 60 / 100 |
| i | 250 / 1750 | 60 / 90 | 270 / 2140 | 60 / 90 |
| o | 400 / 750 | 40 / 80 | 450 / 800 | 40 / 80 |
| u | 350 / 600 | 40 / 80 | 325 / 700 | 50 / 60 |

Dark vowels (u, o) keep both formants under 800 Hz, which is why a hummed "u" opening to "a" reads as a mouth, and a mind, opening.

**20. Accessibility floor.** WCAG 2.2 Success Criterion 1.4.2 (Level A): audio that plays automatically for more than 3 seconds needs a way to pause or stop it, or a volume control independent of the system volume that can reach zero. Sound started by a clear, deliberate user action is not "automatic", and the guidance prefers that pattern [22].

## A score for Final Protocol, cue by cue

All code in this section is one module. It was type-checked with the project's TypeScript 5.9.3 in strict mode, and every cue was rendered through `OfflineAudioContext` in headless Chrome with no runtime errors; the levels quoted are measured from those renders (48 kHz, through the master chain). What was **not** done: nobody has listened to it. Levels, timing and safety are verified; timbre and taste are not, and every number marked "by ear" is a starting point.

### Plan

One tonal centre for the whole game: **D**. The low pedal is D1 (36.71 Hz), the hymn is in D aeolian (D E F G A B flat C), the bell voice sounds only D, F and A. The pedal is the cage: it never moves, and everything the AI "sings" is heard against it. Each god bends the same material instead of bringing new material, which matches the brief that the gods do not intervene.

| Cue | Length | What is heard | Measured peak / RMS (dBFS) | Caption |
|---|---|---|---|---|
| CG shot 1: text | 0 to 20 s | A blinking sine at D5 like a cursor; a soft tick per token, higher, louder and longer the more attention the token gets | whole CG peak -9.0; shot RMS -40.6 | `[a single tone, blinking]` then `[soft ticks, one per word]` |
| CG shot 2: sight | 20 to 35 s | 196 faint tones scanned in 14 rows, left to right across the stereo field, top rows high, bottom rows low; a thin drone at D3 appears | shot RMS -40.7 | `[a scan of small tones, row by row]` |
| CG shot 3: hearing | 35 to 55 s | One second of nothing. Then a low hummed voice: three phrases, each reaching one note further and returning to D; the vowel opens u, o, a | shot RMS -31.1 | `[silence]` then `[a low voice hums a hymn]` |
| CG shot 4: the space | 55 to 80 s | The D1 pedal arrives under the hymn, the bell voice answers each note, an endless rising glissando starts, 30 voices wander and converge on a just-intoned D chord across five octaves | shot RMS -24.4 | `[the hymn returns, answered by bells]` then `[thirty voices rise into one chord]` |
| Map hum | loop | D1 drone with slow filter swell, a faint fifth above; tinted per god | -19.5 / -34.0 | none (ambient); listed once in settings as "map hum" |
| Shub-Niggurath's kid | 23 s phrase, loops | Breath at 12 per minute; one sliding voice that becomes 2, 4, 8; drips that multiply | -15.7 / -31.6 | `[slow breathing. one voice becomes many]` |
| The Queen in Red | 18 s comic, 26 s cruel | Music-box waltz, bright and quick; later the same tune in minor, slower, an octave down, teeth missing, heavy first beats | -17.4 / -33.0 and -8.8 / -27.6 | `[a music box plays a waltz]` then `[the same waltz, slower, breaking]` |
| The King in Yellow | any; 12 s measured | Choir on D and A in three octaves over a noise bed with a hole where the third would be | -15.0 / -30.2 | `[a choir holds two notes. something between them is missing]` |
| Boss entrance | 5.4 s | Music ducks, a low tone falls from 110 Hz into D1, then the god's colour | about -6.3 / -22.3 | `[the hum drops away. a low tone falls]` |
| Phase change | 8.8 s | Short endless rise, then 16 voices converge; Overload adds fifths | -12.7 / -28.0 | `[rising tone that never arrives]` |
| Defeat | 3.1 s | Everything cut in 30 ms, one dry click, room tone | -15.5 / -28.5 | `[all sound stops. a click. an empty room]` |
| Ending | 33 s | Hymn with bells, then without; the pedal lets go; the line climbs to the octave; the cursor tone returns, held, with vibrato | -11.4 / -30.7 | `[the hymn, unanswered now, climbs and holds]` |

The opening's four shots rise in level by design: -40.6, -40.7, -31.1, -24.4 dBFS RMS. The loudest moment in the game peaks near -6 dBFS before the user volume (default 0.8).

### The kit

**Utilities, noise, impulse response.** `mulberry32` makes every cue reproducible, which matters because the cinematic shows the waveform of a render. `env` is the only way a short sound gets its gain: 8 ms minimum attack, exponential release. `makeImpulse` produces the "cathedral": decaying stereo noise whose low-pass cutoff falls as the tail goes on.

```ts
// --- utilities ---
export type Ctx = BaseAudioContext; // AudioContext or OfflineAudioContext: every builder accepts both

export const dB = (x: number): number => Math.pow(10, x / 20);
export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Seeded random numbers, so that a cue renders identically every time. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Click-free envelope on a gain AudioParam: linear attack (never under 8 ms), hold,
 * exponential release. Returns the time at which the source may be stopped.
 */
export function env(g: AudioParam, t0: number, peak: number, attack: number, hold: number, release: number): number {
  const a = Math.max(attack, 0.008);
  g.setValueAtTime(0, t0);
  g.linearRampToValueAtTime(peak, t0 + a);
  g.setValueAtTime(peak, t0 + a + hold);
  g.setTargetAtTime(0, t0 + a + hold, release / 5); // 99.3 % of the way down after `release`
  return t0 + a + hold + release;
}

export interface Handle {
  out: AudioNode;
  /** Fade out from `at` over `release` seconds, then stop the sources. */
  stop(at: number, release?: number): void;
}

// --- noise and impulse response ---
export type NoiseKind = "white" | "pink" | "brown";

export function noiseBuffer(ctx: Ctx, seconds: number, kind: NoiseKind, rnd: () => number = Math.random): AudioBuffer {
  const n = Math.floor(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0, peak = 1e-9;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    let s = w;
    if (kind === "pink") {
      // three-pole "economy" pink filter attributed to Paul Kellet (coefficients unverified, see Findings 17)
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      s = b0 + b1 + b2 + w * 0.1848;
    } else if (kind === "brown") {
      last = (last + 0.02 * w) / 1.02; // leaky integrator: -6 dB per octave
      s = last;
    }
    d[i] = s;
    peak = Math.max(peak, Math.abs(s));
  }
  for (let i = 0; i < n; i++) d[i] /= peak; // normalise to +-1
  return buf;
}

export interface ImpulseOpts {
  seconds?: number;  // buffer length
  rt60?: number;     // time for the tail to fall 60 dB
  preDelay?: number; // gap before the tail: larger gap = larger room
  bright?: number;   // low-pass cutoff at the start of the tail, Hz
  dark?: number;     // low-pass cutoff at the end of the tail, Hz
  seed?: number;
}

/** Stereo impulse response made of decaying, darkening noise. Feed it to a ConvolverNode. */
export function makeImpulse(ctx: Ctx, o: ImpulseOpts = {}): AudioBuffer {
  const seconds = o.seconds ?? 6;
  const rt60 = o.rt60 ?? seconds;
  const bright = o.bright ?? 7000;
  const dark = o.dark ?? 700;
  const sr = ctx.sampleRate; // must equal the context's rate
  const n = Math.floor(seconds * sr);
  const p = Math.floor((o.preDelay ?? 0.035) * sr);
  const buf = ctx.createBuffer(2, n, sr);
  const rnd = mulberry32(o.seed ?? 7);
  for (let ch = 0; ch < 2; ch++) { // independent noise per channel = wide, decorrelated tail
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = p; i < n; i++) {
      const t = (i - p) / sr;
      const amp = Math.pow(10, (-3 * t) / rt60); // -60 dB at t = rt60
      const fc = dark + (bright - dark) * Math.exp(-t / (rt60 * 0.25));
      const k = 1 - Math.exp((-2 * Math.PI * fc) / sr); // one-pole low-pass coefficient
      lp += k * (rnd() * 2 - 1 - lp);
      d[i] = lp * amp * Math.min(1, t / 0.08); // 80 ms build-up instead of a hard slap
    }
  }
  return buf;
}
```

Impulse-response settings (by ear; real cathedral figures were not sourced here):

| Space | `seconds` | `rt60` | `preDelay` | `bright` / `dark` | Use |
|---|---|---|---|---|---|
| Cathedral | 8 | 7 | 0.045 | 6000 / 500 | CG shot 4, ending, Hastur |
| Chapel (default) | 6 | 6 | 0.035 | 7000 / 700 | hymn, stings |
| Server hall | 2.5 | 2 | 0.012 | 9000 / 2500 | battle effects, Queen in Red |
| Phone fallback | 3 | 3 | 0.03 | 6000 / 900 | low-powered devices |

**Master chain, unlock, mute.** Order: buses, sum at 0.5, high-pass at 28 Hz, compressor as limiter, fixed 0.7, `post`, user gain, output. The analyser taps `post`, before the user gain, so sound-driven visuals keep working for a player who has muted.

```ts
// --- master chain, unlock, mute ---
export interface Master {
  music: GainNode; // long cues
  sfx: GainNode;   // short cues
  wet: GainNode;   // reverb send: connect a source here as well as to music/sfx
  wetReturn: GainNode; // reverb output level (0.3); cut this to kill a tail
  post: GainNode;  // after the limiter: pre-rendered buffers enter here
  user: GainNode;  // volume and mute, last in the chain
  analyser: AnalyserNode;
}

export function buildMaster(ctx: Ctx, out: AudioNode = ctx.destination, reverb: ImpulseOpts = {}): Master {
  const music = new GainNode(ctx, { gain: 0.8 });
  const sfx = new GainNode(ctx, { gain: 0.8 });
  const sum = new GainNode(ctx, { gain: 0.5 }); // 6 dB of headroom before the limiter
  const wet = new GainNode(ctx, { gain: 1 });
  const verb = new ConvolverNode(ctx, { buffer: makeImpulse(ctx, reverb) });
  const wetReturn = new GainNode(ctx, { gain: 0.3 });
  const rumble = new BiquadFilterNode(ctx, { type: "highpass", frequency: 28, Q: 0.707 }); // nothing below hearing
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -9, knee: 6, ratio: 20, attack: 0.002, release: 0.25 });
  const ceiling = new GainNode(ctx, { gain: 0.7 }); // about -3 dB: the compressor is not a brick wall
  const post = new GainNode(ctx, { gain: 1 });
  const user = new GainNode(ctx, { gain: 1 });
  const analyser = new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0.8 });
  music.connect(sum);
  sfx.connect(sum);
  wet.connect(verb).connect(wetReturn).connect(sum);
  sum.connect(rumble).connect(limiter).connect(ceiling).connect(post).connect(user).connect(out);
  post.connect(analyser); // tapped before mute: visuals keep moving for players who mute
  return { music, sfx, wet, wetReturn, post, user, analyser };
}

let live: { ctx: AudioContext; master: Master } | null = null;
let volume = 0.8;
let muted = false;

/** Call from inside a click, tap or key handler. Safe to call repeatedly. */
export function unlockAudio(): { ctx: AudioContext; master: Master } {
  if (!live) {
    const ctx = new AudioContext({ latencyHint: "interactive" });
    live = { ctx, master: buildMaster(ctx) };
    live.master.user.gain.value = muted ? 0 : volume;
    document.addEventListener("visibilitychange", () => {
      if (!live) return;
      if (document.hidden) void live.ctx.suspend();
      else if (!muted) void live.ctx.resume();
    });
  }
  if (live.ctx.state !== "running") void live.ctx.resume();
  return live;
}

export function installUnlock(): void {
  const h = (): void => {
    unlockAudio();
    window.removeEventListener("pointerdown", h);
    window.removeEventListener("keydown", h);
  };
  window.addEventListener("pointerdown", h);
  window.addEventListener("keydown", h);
}

/** One place that every sound passes through, so mute is honoured everywhere. */
export function setOutput(nextVolume: number, nextMuted: boolean): void {
  volume = clamp01(nextVolume);
  muted = nextMuted;
  if (!live) return;
  const g = live.master.user.gain;
  const now = live.ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setTargetAtTime(muted ? 0 : volume, now, 0.015); // 15 ms time constant: no click
}
```

**Drone.** Six sawtooths (root three times at 0 and plus or minus 7 cents, octave twice, twelfth once) through one low-pass whose cutoff an LFO moves by half its value every 14 s.

```ts
// --- drone ---
export function drone(
  ctx: Ctx, dest: AudioNode, t0: number,
  o: { root: number; peak?: number; attack?: number; cutoff?: number; cents?: number },
): Handle {
  const cents = o.cents ?? 7;
  const cutoff = o.cutoff ?? 180;
  const lp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: cutoff, Q: 0.9 });
  const out = new GainNode(ctx, { gain: 0 });
  // [ratio to root, detune in cents, level]
  const layout: [number, number, number][] = [
    [1, 0, 0.5], [1, cents, 0.35], [1, -cents, 0.35],
    [2, cents / 2, 0.22], [2, -cents / 2, 0.22], [3, 0, 0.1],
  ];
  const sources: OscillatorNode[] = layout.map(([ratio, detune, level]) => {
    const osc = new OscillatorNode(ctx, { type: "sawtooth", frequency: o.root * ratio, detune });
    osc.connect(new GainNode(ctx, { gain: level })).connect(lp);
    osc.start(t0);
    return osc;
  });
  const lfo = new OscillatorNode(ctx, { type: "sine", frequency: 0.07 }); // one swell every 14 s
  const depth = new GainNode(ctx, { gain: cutoff * 0.5 });                 // cutoff moves +-50 %
  lfo.connect(depth).connect(lp.frequency);
  lfo.start(t0);
  sources.push(lfo);
  lp.connect(out).connect(dest);
  out.gain.setValueAtTime(0, t0);
  out.gain.setTargetAtTime(o.peak ?? 0.25, t0, (o.attack ?? 6) / 3);
  return {
    out,
    stop(at, release = 4) {
      out.gain.cancelScheduledValues(at);
      out.gain.setTargetAtTime(0, at, release / 5);
      for (const s of sources) s.stop(at + release + 0.1);
    },
  };
}
```

**Formant choir.** Three detuned sawtooths plus breath noise feed five parallel band-pass filters; filter Q is centre frequency divided by bandwidth; vibrato is an LFO into `detune` that fades in 0.6 s after the note begins. `setVowel` glides all fifteen filter values at once. Table data from the Csound manual [16].

```ts
// --- formant choir ---
export type Vowel = "a" | "e" | "i" | "o" | "u";
type Formant = readonly [hz: number, gainDb: number, bandwidthHz: number];
export type VowelTable = Record<Vowel, readonly Formant[]>;

export const BASS: VowelTable = {
  a: [[600, 0, 60], [1040, -7, 70], [2250, -9, 110], [2450, -9, 120], [2750, -20, 130]],
  e: [[400, 0, 40], [1620, -12, 80], [2400, -9, 100], [2800, -12, 120], [3100, -18, 120]],
  i: [[250, 0, 60], [1750, -30, 90], [2600, -16, 100], [3050, -22, 120], [3340, -28, 120]],
  o: [[400, 0, 40], [750, -11, 80], [2400, -21, 100], [2600, -20, 120], [2900, -40, 120]],
  u: [[350, 0, 40], [600, -20, 80], [2400, -32, 100], [2675, -28, 120], [2950, -36, 120]],
};
export const SOPRANO: VowelTable = {
  a: [[800, 0, 80], [1150, -6, 90], [2900, -32, 120], [3900, -20, 130], [4950, -50, 140]],
  e: [[350, 0, 60], [2000, -20, 100], [2800, -15, 120], [3600, -40, 150], [4950, -56, 200]],
  i: [[270, 0, 60], [2140, -12, 90], [2950, -26, 100], [3900, -26, 120], [4950, -44, 120]],
  o: [[450, 0, 40], [800, -11, 80], [2830, -22, 100], [3800, -22, 120], [4950, -50, 120]],
  u: [[325, 0, 50], [700, -16, 60], [2700, -35, 170], [3800, -40, 180], [4950, -60, 200]],
};

const breathCache = new WeakMap<Ctx, AudioBuffer>();
function breathBuffer(ctx: Ctx): AudioBuffer {
  let b = breathCache.get(ctx);
  if (!b) {
    b = noiseBuffer(ctx, 3, "pink", mulberry32(11));
    breathCache.set(ctx, b);
  }
  return b;
}

export interface ChoirVoice extends Handle {
  setVowel(v: Vowel, at: number, glide?: number): void;
  setPitch(hz: number, at: number, glide?: number): void;
  setLevel(level: number, at: number, glide?: number): void;
}

export function choirVoice(
  ctx: Ctx, dest: AudioNode, t0: number,
  o: { hz: number; table: VowelTable; vowel: Vowel; peak?: number; attack?: number; breath?: number; vibratoCents?: number; seed?: number },
): ChoirVoice {
  const rnd = mulberry32(o.seed ?? 1);
  const pre = new GainNode(ctx, { gain: 1 });
  const out = new GainNode(ctx, { gain: 0 });
  // Three slightly detuned sawtooths: a small section, not a soloist.
  const oscs = [-9, 0, 8].map(
    (c) => new OscillatorNode(ctx, { type: "sawtooth", frequency: o.hz, detune: c + (rnd() - 0.5) * 4 }),
  );
  // Vibrato near 5 Hz that fades in after the note has started, as singers do.
  const vib = new OscillatorNode(ctx, { type: "sine", frequency: 4.8 + rnd() * 0.8 });
  const vibDepth = new GainNode(ctx, { gain: 0 }); // unit: cents, because it feeds `detune`
  vibDepth.gain.setValueAtTime(0, t0);
  vibDepth.gain.setTargetAtTime(o.vibratoCents ?? 14, t0 + 0.6, 0.8);
  vib.connect(vibDepth);
  for (const osc of oscs) {
    vibDepth.connect(osc.detune);
    osc.connect(pre);
    osc.start(t0);
  }
  vib.start(t0);
  // Breath: pink noise through the same formants.
  const noise = new AudioBufferSourceNode(ctx, { buffer: breathBuffer(ctx), loop: true });
  noise.connect(new GainNode(ctx, { gain: o.breath ?? 0.06 })).connect(pre);
  noise.start(t0, rnd() * 2);
  // Parallel band-pass filters, one per formant. Q = centre frequency / bandwidth.
  const bands = o.table[o.vowel].map(([hz, gainDb, bw]) => {
    const bp = new BiquadFilterNode(ctx, { type: "bandpass", frequency: hz, Q: hz / bw });
    const g = new GainNode(ctx, { gain: dB(gainDb) });
    pre.connect(bp).connect(g).connect(out);
    return { bp, g };
  });
  out.connect(dest);
  out.gain.setValueAtTime(0, t0);
  out.gain.setTargetAtTime(o.peak ?? 0.5, t0, (o.attack ?? 1.5) / 3);
  const sources: AudioScheduledSourceNode[] = [...oscs, vib, noise];
  return {
    out,
    setVowel(v, at, glide = 0.5) {
      o.table[v].forEach(([hz, gainDb, bw], i) => {
        const { bp, g } = bands[i];
        bp.frequency.setTargetAtTime(hz, at, glide / 3);
        bp.Q.setTargetAtTime(hz / bw, at, glide / 3);
        g.gain.setTargetAtTime(dB(gainDb), at, glide / 3);
      });
    },
    setPitch(hz, at, glide = 0.09) {
      for (const osc of oscs) osc.frequency.setTargetAtTime(hz, at, glide / 3);
    },
    setLevel(level, at, glide = 0.3) {
      out.gain.setTargetAtTime(level, at, glide / 3);
    },
    stop(at, release = 2.5) {
      out.gain.cancelScheduledValues(at);
      out.gain.setTargetAtTime(0, at, release / 5);
      for (const s of sources) s.stop(at + release + 0.1);
    },
  };
}
```

**Shepard-Risset glissando, convergence, implied bass.**

```ts
// --- Shepard-Risset glissando ---
export function shepardRisset(
  ctx: Ctx, dest: AudioNode, t0: number, dur: number,
  o: { base?: number; octaves?: number; secondsPerOctave?: number; rising?: boolean; peak?: number; fade?: number } = {},
): Handle {
  const N = o.octaves ?? 8;
  const base = o.base ?? 27.5;
  const spo = o.secondsPerOctave ?? 16;
  const dir = (o.rising ?? true) ? 1 : -1;
  const fade = Math.min(o.fade ?? 2, dur / 2);
  const peak = o.peak ?? 0.2;
  const steps = Math.max(2, Math.ceil(dur * 50)); // one control point every 20 ms
  const out = new GainNode(ctx, { gain: 0 });
  const oscs: OscillatorNode[] = [];
  for (let k = 0; k < N; k++) {
    const f = new Float32Array(steps);
    const a = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
      const t = (i / (steps - 1)) * dur;
      const pos = (((k + (dir * t) / spo) % N) + N) % N;     // height in octaves above base; wraps
      f[i] = base * Math.pow(2, pos);
      a[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * pos) / N);  // raised cosine: silent where it wraps
    }
    const osc = new OscillatorNode(ctx, { type: "sine" });
    const g = new GainNode(ctx, { gain: 0 });
    osc.frequency.setValueCurveAtTime(f, t0, dur);
    g.gain.setValueCurveAtTime(a, t0, dur);
    osc.connect(g).connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    oscs.push(osc);
  }
  out.connect(dest);
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(peak, t0 + fade);
  out.gain.setValueAtTime(peak, t0 + dur - fade);
  out.gain.linearRampToValueAtTime(0, t0 + dur);
  return {
    out,
    stop(at, release = 1) {
      out.gain.cancelScheduledValues(at);
      out.gain.setTargetAtTime(0, at, release / 5);
    },
  };
}

// --- Deep-Note-style convergence ---
export function convergence(
  ctx: Ctx, dest: AudioNode, t0: number,
  o: { root?: number; voices?: number; wander?: number; glide?: number; hold?: number; release?: number; peak?: number; seed?: number; ratios?: number[] } = {},
): number {
  const root = o.root ?? 36.71; // D1
  const voices = o.voices ?? 30;
  const wander = o.wander ?? 5, glide = o.glide ?? 6, hold = o.hold ?? 5, release = o.release ?? 5;
  const peak = o.peak ?? 0.5;
  // Just-intonation stack on the root: octaves, then fifth, octave, major third, fifth. Lowest two doubled.
  const ratios = o.ratios ?? [1, 1, 2, 2, 4, 8, 16, 24, 32, 40, 48];
  const rnd = mulberry32(o.seed ?? 1983);
  const lp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 900, Q: 0.5 });
  const out = new GainNode(ctx, { gain: 0 });
  const tGlide = t0 + wander, tHold = tGlide + glide, tEnd = tHold + hold + release;
  for (let v = 0; v < voices; v++) {
    const start = 200 + rnd() * 200;
    const target = root * ratios[v % ratios.length] * Math.pow(2, ((rnd() - 0.5) * 10) / 1200); // +-5 cents: voices must not fuse
    const osc = new OscillatorNode(ctx, { type: "sawtooth", frequency: start });
    const f = osc.frequency;
    f.setValueAtTime(start, t0);
    for (let t = 0.6 + rnd() * 0.6; t < wander; t += 0.6 + rnd() * 0.6) {
      f.linearRampToValueAtTime(Math.min(400, Math.max(200, start + (rnd() - 0.5) * 50)), t0 + t); // aimless wandering
    }
    f.linearRampToValueAtTime(start, tGlide);
    // slow for 60 % of the glide, then the rush: 15 % of the pitch distance first, the rest after
    f.exponentialRampToValueAtTime(start * Math.pow(target / start, 0.15), tGlide + glide * 0.6);
    f.exponentialRampToValueAtTime(target, tHold);
    const pan = new StereoPannerNode(ctx, { pan: rnd() * 1.2 - 0.6 });
    osc.connect(new GainNode(ctx, { gain: 1 / Math.sqrt(voices) / 2 })).connect(pan).connect(lp);
    osc.start(t0);
    osc.stop(tEnd + 0.1);
  }
  lp.frequency.setValueAtTime(900, t0);
  lp.frequency.setValueAtTime(900, tGlide);
  lp.frequency.exponentialRampToValueAtTime(9000, tHold); // the spectrum opens as the chord arrives
  lp.connect(out).connect(dest);
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(peak * 0.35, tGlide);
  out.gain.linearRampToValueAtTime(peak, tHold);
  out.gain.setValueAtTime(peak, tHold + hold);
  out.gain.setTargetAtTime(0, tHold + hold, release / 5);
  return tEnd;
}

// --- bass that survives phone speakers ---
/** A low tone plus its harmonics. Small speakers drop the fundamental; the ear restores the pitch. */
export function impliedBass(
  ctx: Ctx, dest: AudioNode, t0: number, hz: number,
  o: { peak?: number; attack?: number; hold?: number; release?: number; glideFrom?: number; glide?: number } = {},
): number {
  const out = new GainNode(ctx, { gain: 0 });
  const partials: [number, number][] = [[1, 1], [2, 0.5], [3, 0.4], [4, 0.25], [5, 0.15]];
  const end = env(out.gain, t0, o.peak ?? 0.4, o.attack ?? 0.05, o.hold ?? 1, o.release ?? 2);
  for (const [n, level] of partials) {
    const osc = new OscillatorNode(ctx, { type: "sine", frequency: (o.glideFrom ?? hz) * n });
    if (o.glideFrom) osc.frequency.exponentialRampToValueAtTime(hz * n, t0 + (o.glide ?? 1.2));
    osc.connect(new GainNode(ctx, { gain: level })).connect(out);
    osc.start(t0);
    osc.stop(end + 0.1);
  }
  out.connect(dest);
  return end;
}
```

**Small one-shot voices.** The token tick maps a real attention weight (0 to 1) to one of eleven pitches of D minor pentatonic over two octaves, and also to loudness (0.03 to 0.12) and decay (60 to 310 ms), so an attended word rings and an ignored one barely clicks.

```ts
// --- small one-shot voices ---
/** Plain sine blip. */
export function blip(ctx: Ctx, dest: AudioNode, t: number, hz: number, peak: number, release: number, attack = 0.008): void {
  const osc = new OscillatorNode(ctx, { type: "sine", frequency: hz });
  const g = new GainNode(ctx, { gain: 0 });
  const end = env(g.gain, t, peak, attack, 0, release);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(end + 0.05);
}

const PENTATONIC = [0, 3, 5, 7, 10]; // D minor pentatonic
/** Attention weight 0..1 -> one of eleven pitches across two octaves above `root`. */
export function attentionToHz(w: number, root = 293.66): number {
  const step = Math.round(clamp01(w) * 10);
  return root * Math.pow(2, (PENTATONIC[step % 5] + 12 * Math.floor(step / 5)) / 12);
}
/** A token arrives: pitch, loudness and length all follow its attention weight. */
export function tokenTick(ctx: Ctx, dest: AudioNode, t: number, weight: number): void {
  const w = clamp01(weight);
  blip(ctx, dest, t, attentionToHz(w), 0.03 + 0.09 * w, 0.06 + 0.25 * w);
}

/** Filtered noise burst: a click, a tick, a consonant. */
export function noiseHit(ctx: Ctx, dest: AudioNode, t: number, o: { hz: number; q?: number; peak: number; release: number; kind?: NoiseKind }): void {
  const src = new AudioBufferSourceNode(ctx, { buffer: noiseBuffer(ctx, 0.5, o.kind ?? "white", mulberry32(Math.floor(o.hz))) });
  const bp = new BiquadFilterNode(ctx, { type: "bandpass", frequency: o.hz, Q: o.q ?? 1 });
  const g = new GainNode(ctx, { gain: 0 });
  const end = env(g.gain, t, o.peak, 0.008, 0, o.release);
  src.connect(bp).connect(g).connect(dest);
  src.start(t);
  src.stop(Math.min(end + 0.05, t + 0.49));
}

/** Wet drip: a sine that falls fast in pitch. */
export function drip(ctx: Ctx, dest: AudioNode, t: number, hz: number, peak = 0.12): void {
  const osc = new OscillatorNode(ctx, { type: "sine", frequency: hz * 2.6 });
  osc.frequency.setValueAtTime(hz * 2.6, t);
  osc.frequency.exponentialRampToValueAtTime(hz, t + 0.07);
  const g = new GainNode(ctx, { gain: 0 });
  const end = env(g.gain, t, peak, 0.008, 0, 0.18);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(end + 0.05);
}

/** Music-box tine: fundamental plus two short, bright partials. */
export function musicBox(ctx: Ctx, dest: AudioNode, t: number, hz: number, peak = 0.14, cents = 0): void {
  const parts: [number, number, number][] = [[1, 1, 1.4], [4, 0.3, 0.35], [6.27, 0.12, 0.12]]; // [ratio, level, release s]
  for (const [ratio, level, release] of parts) {
    const osc = new OscillatorNode(ctx, { type: "sine", frequency: hz * ratio, detune: cents });
    const g = new GainNode(ctx, { gain: 0 });
    const end = env(g.gain, t, peak * level, 0.008, 0, release);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(end + 0.05);
  }
}
```

**Offline render, 80 ms frames, analyser.** 80 ms is 3840 samples at 48 kHz and 3528 at 44.1 kHz, both whole numbers, so frames never drift. The opening (80 s) rendered in about 4.6 s on the development Mac and yields exactly 1000 frames. `playRendered` plays the very buffer that was cut into frames, and subtracts `outputLatency` so the drawn frame matches what the ear receives.

```ts
// --- offline render and 80 ms frames ---
export async function renderCue(
  seconds: number,
  build: (ctx: OfflineAudioContext, m: Master) => void,
  sampleRate = 48000,
): Promise<AudioBuffer> {
  const off = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(seconds * sampleRate), sampleRate });
  build(off, buildMaster(off)); // same master chain: the picture shows what the limiter lets through
  return off.startRendering();
}

export interface Frame {
  rms: number;        // loudness of the frame, 0..1
  peak: number;       // largest absolute sample
  min: Float32Array;  // per column, lowest sample: draw a vertical line from min to max
  max: Float32Array;
}

/** Cut a rendered buffer into 80 ms frames (12.5 per second): 3840 samples at 48 kHz, 3528 at 44.1 kHz. */
export function cutFrames(buf: AudioBuffer, frameSeconds = 0.08, columns = 96): Frame[] {
  const len = Math.round(frameSeconds * buf.sampleRate);
  const mono = new Float32Array(buf.length);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels;
  }
  const frames: Frame[] = [];
  for (let start = 0; start + len <= mono.length; start += len) {
    const min = new Float32Array(columns).fill(1);
    const max = new Float32Array(columns).fill(-1);
    let sum = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      const s = mono[start + i];
      const c = Math.min(columns - 1, Math.floor((i * columns) / len));
      if (s < min[c]) min[c] = s;
      if (s > max[c]) max[c] = s;
      sum += s * s;
      peak = Math.max(peak, Math.abs(s));
    }
    frames.push({ rms: Math.sqrt(sum / len), peak, min, max });
  }
  return frames;
}

/** Play a rendered cue and report which frame is sounding, on the audio clock. */
export function playRendered(buf: AudioBuffer, frames: Frame[], onFrame: (index: number, f: Frame) => void): () => void {
  const { ctx, master } = unlockAudio();
  const src = new AudioBufferSourceNode(ctx, { buffer: buf });
  src.connect(master.post); // already limited offline: skip the live limiter
  const t0 = ctx.currentTime + 0.1;
  src.start(t0);
  let raf = 0;
  const loop = (): void => {
    const latency = ctx.outputLatency || ctx.baseLatency || 0; // what you hear lags the clock
    const i = Math.floor((ctx.currentTime - latency - t0) / 0.08);
    if (i >= 0 && i < frames.length) onFrame(i, frames[i]);
    if (i < frames.length) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    src.stop();
  };
}

/** Live level for battle visuals (bloom, HP-bar shake): 0..1. */
export function liveLevel(analyser: AnalyserNode, scratch: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(scratch); // scratch.length === analyser.fftSize
  let sum = 0;
  for (let i = 0; i < scratch.length; i++) sum += scratch[i] * scratch[i];
  return Math.min(1, Math.sqrt(sum / scratch.length) * 4);
}
```

### Opening CG, shots 1 to 4

The whole opening is one 80 s render so that shot 3 can display its own samples.

- **Shot 1 (0 to 20 s), text.** Near silence. The only continuous sound is the cursor: a D5 sine at gain 0.035 that is on for 530 ms and off for 530 ms. Tokens arrive as ticks from second 2. Feed `tokens` from the same attention scores that shade the subtitles, so the eye and the ear receive one fact.
- **Shot 2 (20 to 35 s), sight.** The 196 patches are sounded in reading order over 12 s (61 ms apart, close to one per 80 ms frame). Row sets pitch, column sets pan, attention sets level and length. A D3 drone at gain 0.05 fades in and is gone before second 35.
- **Shot 3 (35 to 55 s), hearing.** Second 35 to 36 is empty: this is the silence before the first thing the AI hears. The hymn is a single bass "choir voice" with no bell, 17.5 s long at `beat: 0.5`. It is deliberately the first sound in the film with vibrato, breath and a vowel: the first sound with a body. It is also the first sound of the cage.
- **Shot 4 (55 to 80 s), representation space.** The pedal has been fading in since second 53. The hymn repeats faster with the bell voice a triad-note above each melody note (the tintinnabuli rule of finding 8). The glissando starts at 56 s, the 30 voices at 58 s, their glide runs 62 to 68 s, the chord holds to 74 s and releases. The level rises about 7 dB over shot 3, and the rise takes ten seconds.

The hymn melody is original to this dossier: three phrases in D aeolian (D E F E D; D E F G F E D; D E F G A G F E D), each going one step further from D and returning. No existing hymn is quoted.

```ts
// --- the hymn (shot 3, and its returns) ---
// Melodic voice: steps away from D and back, one note further each phrase (D aeolian).
export const HYMN: number[][] = [
  [50, 52, 53, 52, 50],
  [50, 52, 53, 55, 53, 52, 50],
  [50, 52, 53, 55, 57, 55, 53, 52, 50],
];
/** Tintinnabular voice: the nearest note of the D minor triad above the melody note. */
export function triadAbove(midi: number, triad: number[] = [2, 5, 9]): number {
  let n = midi + 1;
  while (!triad.includes(n % 12)) n++;
  return n;
}

/** Returns the end time. `bell` adds the triad voice; without it the melody is a single human hum. */
export function hymn(
  ctx: Ctx, dry: AudioNode, wet: AudioNode, t0: number,
  o: { beat?: number; bell?: boolean; peak?: number; phrases?: number[][] } = {},
): number {
  const beat = o.beat ?? 0.72;
  const phrases = o.phrases ?? HYMN;
  const peak = o.peak ?? 0.5;
  const m = choirVoice(ctx, dry, t0, { hz: midiHz(phrases[0][0]), table: BASS, vowel: "u", peak, attack: 1.2, seed: 3 });
  m.out.connect(wet);
  let t = t0;
  phrases.forEach((phrase, pi) => {
    m.setLevel(peak, t, 0.4);
    m.setVowel(pi === 0 ? "u" : pi === 1 ? "o" : "a", t, 1.5); // the mouth opens phrase by phrase
    phrase.forEach((note, ni) => {
      const last = ni === phrase.length - 1;
      m.setPitch(midiHz(note), t);
      if (o.bell) {
        const hz = midiHz(triadAbove(note) + 12);
        const bus = new GainNode(ctx, { gain: 1 });
        bus.connect(dry);
        bus.connect(wet);
        blip(ctx, bus, t + 0.02, hz, 0.07, last ? 3.5 : 1.6, 0.012);
        blip(ctx, bus, t + 0.02, hz * 2.01, 0.02, 0.5, 0.012); // slightly sharp octave: bell colour
      }
      t += beat * (last ? 3 : 1);
    });
    m.setLevel(peak * 0.15, t - beat * 0.9, 0.6); // breath between phrases
    t += beat;
  });
  m.stop(t - beat, 2.5);
  return t + 2.5;
}

// --- the opening CG as one 80 s render ---
export interface CgInput {
  tokens: { t: number; weight: number }[]; // shot 1: arrival time (s, 0..18) and real attention weight 0..1
  patches: number[];                        // shot 2: 196 attention weights, row by row
}

export function buildOpening(ctx: OfflineAudioContext, m: Master, input: CgInput): void {
  // SHOT 1, 0-20 s: the cursor and the tokens
  const cursor = new OscillatorNode(ctx, { type: "sine", frequency: 587.33 }); // D5
  const cg = new GainNode(ctx, { gain: 0 });
  cg.gain.setValueAtTime(0, 0.5);
  for (let t = 0.5; t < 20; t += 1.06) {   // blinks like a terminal cursor: 530 ms on, 530 ms off
    cg.gain.setTargetAtTime(0.035, t, 0.02);
    cg.gain.setTargetAtTime(0, t + 0.53, 0.02);
  }
  cursor.connect(cg).connect(m.music);
  cursor.start(0.5);
  cursor.stop(21);
  for (const tok of input.tokens) tokenTick(ctx, m.sfx, 2 + tok.t, tok.weight);

  // SHOT 2, 20-35 s: seeing. One soft tone per patch, scanned in 14 rows; pitch = row, level = attention.
  const scan = 12 / 196;
  input.patches.forEach((w, i) => {
    const row = Math.floor(i / 14), col = i % 14;
    const pan = new StereoPannerNode(ctx, { pan: (col / 13) * 1.4 - 0.7 });
    pan.connect(m.sfx);
    pan.connect(m.wet);
    const hz = midiHz(86 - [0, 2, 3, 5, 7, 8, 10][row % 7] - 12 * Math.floor(row / 7)); // top row high, bottom row low
    blip(ctx, pan, 21 + i * scan, hz, 0.012 + 0.07 * clamp01(w), 0.15 + 0.6 * clamp01(w), 0.01);
  });
  const sight = drone(ctx, m.music, 20, { root: 146.83, peak: 0.05, attack: 8, cutoff: 500, cents: 4 });
  sight.out.connect(m.wet);
  sight.stop(31, 4);

  // SHOT 3, 35-55 s: the first heard sound. One second of nothing, then a hum.
  hymn(ctx, m.music, m.wet, 36, { beat: 0.5, bell: false, peak: 0.45 });

  // SHOT 4, 55-80 s: the cage opens up. Drone, bell voice, glissando, convergence.
  const d = drone(ctx, m.music, 53, { root: 36.71, peak: 0.22, attack: 9, cutoff: 160 });
  d.out.connect(m.wet);
  hymn(ctx, m.music, m.wet, 55, { beat: 0.42, bell: true, peak: 0.4 });
  const gl = shepardRisset(ctx, m.music, 56, 14, { secondsPerOctave: 12, peak: 0.1, fade: 4 });
  gl.out.connect(m.wet);
  convergence(ctx, m.music, 58, { wander: 4, glide: 6, hold: 6, release: 5, peak: 0.42 });
  d.stop(74, 5);
}
```

Usage:

```ts
const input: CgInput = { tokens: realTokenAttention, patches: realPatchAttention }; // from the model run, not invented
const buffer = await renderCue(80, (ctx, m) => buildOpening(ctx, m, input));
const frames = cutFrames(buffer); // 1000 frames; shot 3 is frames 437 to 687
startButton.onclick = () => {
  const stop = playRendered(buffer, frames, (i, f) => drawWaveformFrame(i, f.min, f.max, f.rms));
};
```

### Map hum, phase change, ending

Map hum tints (all "by ear"; the drip and music-box additions are described here but not in the code):

| Group | `cutoff` | `cents` | Added |
|---|---|---|---|
| none / tutorial | 150 | 6 | faint A1 a fifth above |
| Shub-Niggurath | 150 | 12 (beats twice as fast: more bodies) | one `drip` at random every 8 to 20 s, gain 0.04 |
| Nyarlathotep | 220 | 6 | one `musicBox` note of the waltz every 15 to 40 s, 30 cents flat |
| Hastur | 150 | 6 | a very quiet soprano "u" on D4, far above, with nothing in between |

```ts
// --- map hum, phase change, ending ---
/** The hum under the battle map. Quiet enough to forget, present enough to miss when it stops. */
export function mapHum(ctx: Ctx, m: Master, t0: number, god: God | null): Handle {
  const low = drone(ctx, m.music, t0, {
    root: 36.71, peak: 0.1, attack: 5,
    cutoff: god === "nyarlathotep" ? 220 : 150, // the court is brighter
    cents: god === "shub" ? 12 : 6,             // the woods beat faster: more bodies
  });
  const fifth = drone(ctx, m.music, t0 + 4, { root: 55.07, peak: 0.035, attack: 8, cutoff: 200, cents: 4 }); // A1: the hymn's fifth, no third
  low.out.connect(m.wet);
  if (god === "hastur") { // a thin high D far above the fifth, and nothing in between
    const tone = choirVoice(ctx, m.music, t0 + 6, { hz: midiHz(62), table: SOPRANO, vowel: "u", peak: 0.05, attack: 6, seed: 21 });
    tone.out.connect(m.wet);
    return { out: low.out, stop(at, release = 3) { low.stop(at, release); fifth.stop(at, release); tone.stop(at, release); } };
  }
  return { out: low.out, stop(at, release = 3) { low.stop(at, release); fifth.stop(at, release); } };
}

/** Phase change: the floor tilts (endless rise), then a short convergence on the new chord. About 8 s. */
export function phaseChange(ctx: Ctx, m: Master, t0: number, overload = false): number {
  m.music.gain.setTargetAtTime(0.25, t0, 0.1);
  const gl = shepardRisset(ctx, m.sfx, t0, 4.5, { secondsPerOctave: 4, peak: 0.12, fade: 1.2 });
  gl.out.connect(m.wet);
  const end = convergence(ctx, m.sfx, t0 + 0.6, {
    voices: 16, wander: 1, glide: 2.8, hold: 1.4, release: 2.5, peak: 0.4, seed: overload ? 77 : 12,
    // Overload adds the fifth in every octave: brighter, harder, violet
    ratios: overload ? [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48] : [1, 1, 2, 2, 4, 8, 16, 24, 32],
  });
  m.music.gain.setTargetAtTime(0.8, t0 + 4.4, 0.4);
  return end;
}

/** The ending: the hymn once more; the bell voice falls silent; the line climbs to the octave and stays. */
export function ending(ctx: Ctx, m: Master, t0: number): number {
  const pedal = drone(ctx, m.music, t0, { root: 36.71, peak: 0.18, attack: 4, cutoff: 160 });
  pedal.out.connect(m.wet);
  let t = hymn(ctx, m.music, m.wet, t0 + 2, { beat: 0.6, bell: true, phrases: [HYMN[0], HYMN[1]] });
  pedal.stop(t - 2, 8); // the pedal lets go
  t = hymn(ctx, m.music, m.wet, t, { beat: 0.7, bell: false, phrases: [[50, 52, 53, 55, 57, 60, 62]] });
  // the cursor tone of shot 1, now held and with vibrato: it has become a voice
  const osc = new OscillatorNode(ctx, { type: "sine", frequency: 587.33 });
  const vib = new OscillatorNode(ctx, { type: "sine", frequency: 5 });
  const depth = new GainNode(ctx, { gain: 0 });
  const start = t - 5;
  depth.gain.setValueAtTime(0, start);
  depth.gain.setTargetAtTime(12, start + 2, 1.5);
  vib.connect(depth).connect(osc.detune);
  const g = new GainNode(ctx, { gain: 0 });
  const end = env(g.gain, start, 0.06, 2, 6, 5);
  osc.connect(g);
  g.connect(m.music);
  g.connect(m.wet);
  osc.start(start);
  vib.start(start);
  osc.stop(end + 0.1);
  vib.stop(end + 0.1);
  return end;
}
```

The ending reverses the opening. The hymn plays once with its bell voice, then the pedal releases over 8 s and the last phrase is sung without bells, climbing D E F G A C D to the upper octave and not returning: the first phrase in the game that does not come home to the low D. The last sound is the cursor tone of shot 1, held instead of blinking, with vibrato fading in. If the story's ending is not a release, drop the final phrase and end on `contextReset` instead; the material supports both.

### One motif per god

- **Shub-Niggurath, through its kid (lust).** Breath is pink noise through a band-pass that opens on a 2 s inhale and closes on a 3 s exhale: 12 breaths a minute, slow enough to suggest something large. One voice slides D, E flat, D, A flat (a semitone lean and a tritone; slides of 0.9 s, never clean steps). Each bar the number of voices doubles, 1, 2, 4, 8, each entering up to 1.8 s late and up to 25 cents off: micropolyphony built from a single line (finding 7). Drips multiply with it: 2, 5, 8, 11 per bar. The effect to aim for is growth that cannot be stopped; keep it abstract, never imitative of human sounds.
- **Nyarlathotep, through the Queen in Red (confusion).** A 3/4 waltz for music box. `cruelty` moves it from comic to cruel in one parameter: tempo 176 down to 120 beats a minute; major below 0.5, minor above; 8% of notes dropped rising to 28%; a "stuck tooth" that repeats a note four times; pitch sagging by up to 29 cents per pass; above 0.5 the first beat of each bar becomes a heavy low step and a ratchet clicks where the third beat should be; above 0.75 the tune drops an octave. Use 0 for the first battle of the group, about 0.5 mid-group, 1 for the boss.
- **Hastur (ignorance).** A choir on D and A only, in three octaves: an open fifth has no third, so it is neither major nor minor, a question left open. Under it, a bed of pink noise centred on 360 Hz, and through the whole motif two notch filters at 352 and 367 Hz, between F4 and F sharp 4, exactly where the third would sound. The bed exists so that the hole can be heard: absence is audible only against a surround. For the boss battle, route the entire `music` bus through the same two notches so every sound in the fight has the same piece missing. (A notched-noise bed that stops can leave a faint phantom tone at the notch frequency, the "Zwicker tone": I did not research it for this dossier, so it is unverified, but it is worth one experiment, since a tone that exists only in the listener suits this god.)

```ts
// --- god motifs ---
/** Shub-Niggurath's kid: breath, drips, and a line that multiplies 1, 2, 4, 8. */
export function goatWoods(ctx: Ctx, dry: AudioNode, wet: AudioNode, t0: number, bars = 4, seed = 2): number {
  const rnd = mulberry32(seed);
  const bar = 5; // one breath = 5 s = 12 breaths a minute
  const end = t0 + bars * bar;
  // breath: pink noise through a band-pass that opens on the inhale
  const noise = new AudioBufferSourceNode(ctx, { buffer: noiseBuffer(ctx, 4, "pink", rnd), loop: true });
  const bp = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 500, Q: 0.8 });
  const bg = new GainNode(ctx, { gain: 0 });
  noise.connect(bp).connect(bg);
  bg.connect(dry);
  bg.connect(wet);
  for (let b = 0; b < bars; b++) {
    const t = t0 + b * bar;
    bg.gain.setTargetAtTime(0.16, t, 0.6);          // inhale 2 s
    bp.frequency.setTargetAtTime(1100, t, 0.6);
    bg.gain.setTargetAtTime(0.02, t + 2, 0.9);      // exhale 3 s
    bp.frequency.setTargetAtTime(350, t + 2, 0.9);
  }
  bg.gain.setTargetAtTime(0, end, 0.5);
  noise.start(t0);
  noise.stop(end + 3);
  // multiplying voices: each bar doubles the count; each new voice enters late and a little flat or sharp
  const line = [50, 51, 50, 56]; // D, E flat, D, A flat: a semitone lean and a tritone
  let count = 1;
  for (let b = 0; b < bars; b++) {
    const t = t0 + b * bar;
    for (let v = 0; v < count; v++) {
      const offset = v === 0 ? 0 : rnd() * 1.8;
      const voice = choirVoice(ctx, dry, t + offset, {
        hz: midiHz(line[0]) * Math.pow(2, ((rnd() - 0.5) * 50) / 1200),
        table: v % 2 ? SOPRANO : BASS, vowel: "u", peak: 0.35 / Math.sqrt(count), attack: 1.2, breath: 0.12, vibratoCents: 25, seed: seed + b * 16 + v,
      });
      voice.out.connect(wet);
      line.forEach((note, i) => voice.setPitch(midiHz(note + (v % 2 ? 12 : 0)), t + offset + i * 1.1, 0.9)); // slow slides, never clean steps
      voice.setVowel("o", t + offset + 1.5, 2);
      voice.stop(t + bar - 0.6, 1.5);
    }
    count = Math.min(8, count * 2);
  }
  // drips, more of them each bar
  for (let b = 0; b < bars; b++) {
    for (let i = 0; i < 2 + b * 3; i++) drip(ctx, wet, t0 + b * bar + rnd() * bar, 300 + rnd() * 500, 0.05 + rnd() * 0.05);
  }
  return end + 3;
}

/** The Queen in Red: a music-box waltz. `cruelty` 0 = comic, 1 = cruel. */
export function redWaltz(ctx: Ctx, dry: AudioNode, wet: AudioNode, t0: number, cruelty: number, repeats = 2, seed = 5): number {
  const rnd = mulberry32(seed);
  const c = clamp01(cruelty);
  const beat = 60 / (176 - 56 * c); // 176 bpm down to 120 bpm
  const major = c < 0.5;
  // eight bars of 3/4, D minor; null = rest
  const tune: (number | null)[] = [
    69, 74, 77, 76, null, 74, 72, 70, 69, 70, null, null,
    67, 70, 74, 72, null, 70, 69, 65, 64, 62, null, null,
  ];
  const bass = [38, 38, 43, 43, 43, 43, 45, 38]; // one note per bar
  const toMajor = (n: number): number => (n % 12 === 5 || n % 12 === 10 || n % 12 === 0 ? n + 1 : n); // F, B flat, C -> F sharp, B, C sharp
  let t = t0;
  let drift = 0; // cents; the mechanism runs down
  for (let r = 0; r < repeats; r++) {
    tune.forEach((raw, i) => {
      const swing = (rnd() - 0.5) * 0.04 * (1 + 3 * c);          // unsteady hand on the crank
      drift -= c * 1.2;
      if (raw !== null) {
        const note = (major ? toMajor(raw) : raw) - (c > 0.75 ? 12 : 0);
        const dropped = rnd() < 0.08 + 0.2 * c;                   // missing teeth
        const stuck = !dropped && rnd() < 0.1 * c;                // a tooth that catches and repeats
        if (!dropped) {
          const hits = stuck ? 4 : 1;
          for (let h = 0; h < hits; h++) {
            const when = t + swing + h * (beat / 4);
            musicBox(ctx, dry, when, midiHz(note), 0.13, drift);
            musicBox(ctx, wet, when, midiHz(note), 0.05, drift);
          }
        }
      }
      if (i % 3 === 0) {
        const b = midiHz(bass[(i / 3) % bass.length]);
        if (c < 0.5) musicBox(ctx, dry, t, b * 2, 0.09, drift);   // comic: a polite oom
        else impliedBass(ctx, dry, t, b, { peak: 0.1 + 0.25 * c, attack: 0.03, hold: 0.05, release: 0.7 }); // cruel: a heavy step
      }
      if (c >= 0.5 && i % 3 === 2 && rnd() < c) noiseHit(ctx, dry, t, { hz: 2400, q: 3, peak: 0.05, release: 0.05 }); // the ratchet where beat three should be
      t += beat;
    });
  }
  return t + 2;
}

/** The King in Yellow: an open fifth with the third filtered out of everything. */
export function yellowSign(ctx: Ctx, dry: AudioNode, wet: AudioNode, t0: number, dur: number, seed = 9): Handle {
  const rnd = mulberry32(seed);
  // two notches in series around 359 Hz: between F4 (349 Hz) and F sharp 4 (370 Hz), where the third would be
  const n1 = new BiquadFilterNode(ctx, { type: "notch", frequency: 352, Q: 5 });
  const n2 = new BiquadFilterNode(ctx, { type: "notch", frequency: 367, Q: 5 });
  const out = new GainNode(ctx, { gain: 1 });
  n1.connect(n2).connect(out);
  out.connect(dry);
  out.connect(wet);
  // a bed of noise makes the hole audible: you hear the absence only if something surrounds it
  const noise = new AudioBufferSourceNode(ctx, { buffer: noiseBuffer(ctx, 4, "pink", rnd), loop: true });
  const band = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 360, Q: 0.7 });
  const ng = new GainNode(ctx, { gain: 0 });
  ng.gain.setValueAtTime(0, t0);
  ng.gain.setTargetAtTime(0.1, t0, 2);
  noise.connect(band).connect(ng).connect(n1);
  noise.start(t0);
  // choir on D and A only, three octaves
  const voices = [
    choirVoice(ctx, n1, t0, { hz: midiHz(38), table: BASS, vowel: "u", peak: 0.4, attack: 4, seed: seed + 1 }),
    choirVoice(ctx, n1, t0 + 1.5, { hz: midiHz(45), table: BASS, vowel: "o", peak: 0.35, attack: 4, seed: seed + 2 }),
    choirVoice(ctx, n1, t0 + 3, { hz: midiHz(62), table: SOPRANO, vowel: "u", peak: 0.22, attack: 5, seed: seed + 3 }),
    choirVoice(ctx, n1, t0 + 4.5, { hz: midiHz(69), table: SOPRANO, vowel: "o", peak: 0.18, attack: 5, seed: seed + 4 }),
  ];
  const handle: Handle = {
    out,
    stop(at, release = 4) {
      for (const v of voices) v.stop(at, release);
      ng.gain.cancelScheduledValues(at);
      ng.gain.setTargetAtTime(0, at, release / 5);
      noise.stop(at + release + 0.1);
    },
  };
  handle.stop(t0 + dur, 4);
  return handle;
}
```

### Boss entrance stings and defeat

Every sting has the same skeleton, so the player learns it: 0.4 s duck of the music to 5% (a ramp), half a second of near-silence, a low tone that falls from 110 Hz to D1 in 1.2 s with an 80 ms attack and harmonics 2 to 5 so phones carry it, then the god's colour, then the music returns. The silence carries the impact; the peak stays near -6 dBFS.

- Shub-Niggurath: nine drips that slow down, and one voice sliding up a semitone as its vowel opens.
- The Queen in Red: a bright four-note flourish, answered a beat later by nearly the same four notes an octave lower, 40 cents flat: the joke, then the joke told wrongly.
- Hastur: 2.2 s of the notched fifth. Nothing else.

Defeat is a context reset. Music and the reverb return drop to zero in 30 ms (a 6 ms time constant: abrupt but continuous, so no speaker pop). After 120 ms comes one dry click at -20 dBFS, placed after the limiter and outside the reverb. Then 3 s of room tone at -40 dBFS: brown noise under 300 Hz and a mains hum at 50 Hz with harmonics at 100 and 150 Hz so that small speakers reproduce something. The cut reverb tail matters most: a room that ends mid-echo was never a room. The game must also stop its looping cues (`mapHum`, motifs) at the same moment; `contextReset` only silences the bus.

```ts
// --- stings and the reset ---
export type God = "shub" | "nyarlathotep" | "hastur";

/** Boss entrance: the room empties, a low tone falls into place, then the god's colour. About 5 s. */
export function bossSting(ctx: Ctx, m: Master, t0: number, god: God): number {
  // 1. duck the music to near silence over 0.4 s (a ramp, never a cut), hold 0.5 s
  m.music.gain.setTargetAtTime(0.04, t0, 0.13);
  const t = t0 + 0.9;
  // 2. the fall: 110 Hz down to D1 with harmonics, 80 ms attack
  impliedBass(ctx, m.sfx, t, 36.71, { glideFrom: 110, glide: 1.2, peak: 0.45, attack: 0.08, hold: 1.2, release: 2.5 });
  // 3. colour
  if (god === "shub") {
    for (let i = 0; i < 9; i++) drip(ctx, m.wet, t + 0.3 + i * 0.11 * (1 + i * 0.08), 260 + i * 45, 0.07);
    const v = choirVoice(ctx, m.sfx, t + 0.2, { hz: midiHz(50), table: BASS, vowel: "u", peak: 0.3, attack: 0.6, breath: 0.15, vibratoCents: 30 });
    v.out.connect(m.wet);
    v.setPitch(midiHz(51), t + 0.8, 1.2);
    v.setVowel("a", t + 0.8, 1.5);
    v.stop(t + 2.4, 1.5);
  } else if (god === "nyarlathotep") {
    [74, 77, 81, 86].forEach((n, i) => musicBox(ctx, m.sfx, t + 0.25 + i * 0.09, midiHz(n), 0.12)); // a bright flourish
    [75, 78, 81, 87].forEach((n, i) => musicBox(ctx, m.wet, t + 1.3 + i * 0.16, midiHz(n) / 2, 0.1, -40)); // answered wrong, lower, flat
  } else {
    yellowSign(ctx, m.sfx, m.wet, t + 0.2, 2.2);
  }
  // 4. bring the music back
  m.music.gain.setTargetAtTime(0.8, t + 3.2, 0.5);
  return t + 4.5;
}

/** Defeat as a context reset: everything stops, one click, room tone. */
export function contextReset(ctx: Ctx, m: Master, t0: number, roomSeconds = 3): number {
  m.music.gain.cancelScheduledValues(t0);
  m.wetReturn.gain.cancelScheduledValues(t0);
  m.music.gain.setTargetAtTime(0, t0, 0.006);     // gone in 30 ms: abrupt, but not a discontinuity
  m.wetReturn.gain.setTargetAtTime(0, t0, 0.006); // the reverb tail is cut too: the room itself is deleted
  const t = t0 + 0.12;
  noiseHit(ctx, m.post, t, { hz: 3000, q: 0.7, peak: dB(-20), release: 0.012 }); // the click, dry, after the limiter
  // room tone: brown noise under 300 Hz and a faint mains hum with harmonics (so phones carry it)
  const room = new AudioBufferSourceNode(ctx, { buffer: noiseBuffer(ctx, 4, "brown", mulberry32(4)), loop: true });
  const lp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 300, Q: 0.5 });
  const g = new GainNode(ctx, { gain: 0 });
  g.gain.setValueAtTime(0, t + 0.05);
  g.gain.setTargetAtTime(dB(-40), t + 0.05, 0.1);
  g.gain.setTargetAtTime(0, t + roomSeconds, 0.3);
  room.connect(lp).connect(g).connect(m.post);
  room.start(t);
  room.stop(t + roomSeconds + 2);
  for (const [hz, level] of [[50, -50], [100, -54], [150, -58]] as const) {
    const osc = new OscillatorNode(ctx, { type: "sine", frequency: hz });
    const og = new GainNode(ctx, { gain: 0 });
    og.gain.setValueAtTime(0, t + 0.05);
    og.gain.setTargetAtTime(dB(level), t + 0.05, 0.1);
    og.gain.setTargetAtTime(0, t + roomSeconds, 0.3);
    osc.connect(og).connect(m.post);
    osc.start(t);
    osc.stop(t + roomSeconds + 2);
  }
  m.music.gain.setTargetAtTime(0.8, t + roomSeconds, 0.4);
  m.wetReturn.gain.setTargetAtTime(0.3, t + roomSeconds, 0.4);
  return t + roomSeconds;
}
```

## Pitfalls

**Respect for the listener (rules, not suggestions)**

1. **No sound before a gesture.** The opening needs a "begin" control; that click both satisfies the autoplay policy [17] and makes the audio user-initiated in the sense of WCAG 1.4.2 [22]. Never try to start sound on page load.
2. **One mute, honoured everywhere.** Every source reaches the output only through `Master.user`. Do not create a second `AudioContext` or connect anything to `ctx.destination` directly. Persist mute and volume (the existing `app/src/game/audio.ts` already stores mute in `localStorage` with a guard for blocked storage; keep that). Offer separate music and effects levels on the `music` and `sfx` buses.
3. **No sudden loud onsets.** The research says soft-to-loud leaps cause chills [2]; the same leap can hurt on headphones. The compromise built into the code: every envelope has at least 8 ms of attack, anything above gain 0.2 has at least 30 to 80 ms, the biggest rise in the game (CG shot 4) takes ten seconds, and impact comes from ducking what precedes it. The one abrupt event, defeat, is a cut to quiet, never a cut to loud.
4. **Volume ceiling.** Sum at 0.5, limiter, fixed 0.7: the measured maximum is about -6 dBFS before the user volume. Keep new cues under that figure by rendering them offline and reading the peak, as was done here.
5. **Captions for meaningful sound.** Every cue in the plan table has a caption string. Show them in the terminal chrome, in brackets, when "sound captions" is on, and always during the opening, where sound carries story. The defeat click and the Hastur "missing tone" mean nothing to a player who cannot hear them unless the text says so.
6. **Visuals must not depend on audible sound.** The analyser taps before the user gain, and the cinematic's frames come from the render, so a muted or deaf player sees the same waveform.
7. **Low drones tire people.** The map hum sits near -34 dBFS RMS and should stay there. Give it its own slider or include it under "music".

**Technical traps**

8. **The offline render and the live sound will differ unless they are the same buffer.** Any `Math.random()` inside a cue makes two renders differ. The kit seeds everything and, for the cinematic, plays the rendered buffer itself.
9. **Do not render the opening on the main thread at the moment it is needed.** It took about 4.6 s on a fast Mac for 80 s of audio; a phone will take longer. Start the render when the title screen appears, show the terminal cursor meanwhile, and keep the `AudioBuffer` (about 31 MB for 80 s of stereo float at 48 kHz). To halve that, render mono or at 24 kHz; the 80 ms frame is still a whole number of samples (1920).
10. **Sample rates.** A buffer rendered at 48 kHz plays correctly in a 44.1 kHz context (it is resampled), but an impulse response must be created at its own context's rate, which `makeImpulse(ctx)` guarantees. Rule: never share an `AudioBuffer` between the offline and live contexts except for playback.
11. **`exponentialRampToValueAtTime` cannot touch zero** [21]. Fades to silence use `setTargetAtTime`. Frequency ramps are safe because frequencies are never zero.
12. **Stopping a source at non-zero gain clicks.** Always fade, then stop after the fade (`Handle.stop` does both).
13. **The compressor is not a brick wall** [20]. A dense cue can still overshoot. Leave the headroom in place; do not "fix" quietness by raising the sum gain. Raise the user default instead.
14. **Convolution cost.** A stereo 6 to 8 s impulse response is the most expensive node in the graph. Use one convolver for the whole game, shorten it on weak devices, and never create one per sound.
15. **Voice count.** Each choir voice is 5 oscillators and noise through 5 filters. The goat-woods motif peaks at 8 voices, the opening at about 45 oscillators. This rendered far faster than real time on a desktop; it was not measured on a phone. Have a "reduced" setting that halves voices.
16. **`noiseHit` allocates a buffer per call.** Fine for the sketch; cache one white-noise buffer per context in production.
17. **Hidden tabs.** Timers are throttled in background tabs; the kit suspends the context when the page is hidden. Schedule against `ctx.currentTime`, never `setTimeout`, and keep long cues as pre-scheduled events or pre-rendered buffers.
18. **Output latency.** Bluetooth headphones can delay sound by a large fraction of a second. `playRendered` subtracts `outputLatency`; where the browser does not report it the picture will lead the sound slightly.
19. **Phone speakers.** Nothing under roughly 200 to 300 Hz survives (the telephone figure is from [5]; phone-speaker figures were not sourced). Every bass event in the kit carries harmonics 2 to 5. Check each cue through a phone before approving it.
20. **Safari.** Older versions needed a `webkit` prefix and a callback form of `startRendering`; current versions do not (unverified on a device for this dossier). Test the opening on iOS specifically, where the context can also be interrupted by calls and the silent switch.
21. **React.** Create the context once outside component state; StrictMode's double mount will otherwise leak contexts, as the comment in the existing `audio.ts` already warns.

**Taste and theme**

22. **Do not copy the Deep Note.** The sound is protected [8]. The kit uses the principle with different pitches, voice counts and timings, and the full convergence appears only once at full length (CG shot 4), so that it stays an event.
23. **Do not promise infrasound** (finding 3).
24. **Do not quote a real hymn.** A recognisable tune brings a denomination with it and narrows the theme. The invented chant keeps the target as "theology used as a shield", not any one church.
25. **Shub-Niggurath's motif must stay abstract.** Breath, wetness and multiplication carry "lust" as appetite and growth. Imitated human sounds would cheapen it and restrict where the game can be shown.
26. **Restraint is the display.** The chrome is minimal and the opening spends 35 of its 80 seconds below -40 dBFS. That quiet is what makes shot 4 large. Resist filling it.

## Sources

Read in full unless marked otherwise. All retrieved 2026-11-14.

1. Wikipedia, "Frisson". https://en.wikipedia.org/wiki/Frisson
2. Harrison, L. and Loui, P. (2014), "Thrills, chills, frissons, and skin orgasms: toward an integrative model of transcendent psychophysiological experiences in music", Frontiers in Psychology. https://pmc.ncbi.nlm.nih.gov/articles/PMC4107937
3. Sloboda, J. (1991), "Music Structure and Emotional Response: Some Empirical Findings", Psychology of Music 19, 110-120, DOI 10.1177/0305735691192002. **Not read**: known only through search summaries and through [2]. Listing: https://scilit.com/publications/28754222606c17abaae30191e67bc59d
4. Wikipedia, "Infrasound" (2003 Infrasonic concert, Tandy, exposure studies, hearing limits). https://en.wikipedia.org/wiki/Infrasound
5. Wikipedia, "Missing fundamental". https://en.wikipedia.org/wiki/Missing_fundamental
6. Wikipedia, "Deep Note". https://en.wikipedia.org/wiki/Deep_Note
7. Cook, P. and Wang, G., ChucK emulation of the Deep Note with Moorer's notes in its comments (Stanford CCRMA, Artful Design). https://ccrma.stanford.edu/~ge/artfuldesign/thx/thx.ck
8. Bozkurt, B., "Recreating the THX Deep Note". https://earslap.com/article/recreating-the-thx-deep-note.html
9. Wikipedia, "Shepard tone". https://en.wikipedia.org/wiki/Shepard_tone
10. Wikipedia, "Micropolyphony". https://en.wikipedia.org/wiki/Micropolyphony
11. Wikipedia, "Tintinnabuli". https://en.wikipedia.org/wiki/Tintinnabuli
12. Wikipedia, "Pedal point". https://en.wikipedia.org/wiki/Pedal_point
13. Wikipedia, "Arrival (soundtrack)". https://en.wikipedia.org/wiki/Arrival_(soundtrack)
14. Kirn, P., CDM, on Hildur Guðnadóttir's Chernobyl score. https://cdm.link/chernobyl-score-hildur-gudnadottir/ (The site name Ignalina and the phrase about using the building as an instrument came from search summaries of other articles, not from this page.)
15. Press coverage of Hans Zimmer's Dune score. **Search summaries only, pages not read**: https://moviemusicuk.us/2021/10/26/dune-hans-zimmer/ and https://www.hollywoodreporter.com/movies/movie-features/hans-zimmer-interview-dune-1235106091/
16. Csound manual, appendix "Formant Values". https://csound.com/docs/manual/MiscFormants.html
17. MDN, "Web Audio API best practices". https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
18. MDN, "OfflineAudioContext". https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext
19. MDN, "ConvolverNode". https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode
20. MDN, "DynamicsCompressorNode" and its constructor page (defaults and ranges). https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode and https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode/DynamicsCompressorNode
21. MDN, "AudioParam: setTargetAtTime()". https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime
22. W3C, "Understanding Success Criterion 1.4.2: Audio Control" (WCAG 2.2). https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html
23. musicdsp.org, "Pink noise filter" (page read; the linked coefficient file was not retrievable). https://www.musicdsp.org/en/latest/Filters/76-pink-noise-filter.html
24. W3C, Web Audio API specification. https://webaudio.github.io/web-audio-api/ (Only the opening part was read; the sections on the compressor, convolver and offline context were not reached, so no claim here rests on it.)

Not sourced, and marked so in the text: the M-voice and T-voice terminology; Kubrick's use of Ligeti; the ison in chant; reverb time of real cathedrals; reverb as a cue for size; silence before impact; the Zwicker tone; music-box partial ratios; typical vibrato rates and depths; phone loudspeaker cut-off frequencies; the compressor's makeup gain; `cancelAndHoldAtTime` support.
