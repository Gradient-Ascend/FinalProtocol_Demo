# Final Protocol: story build spec

Nov 14, 2026 · branch `feature/story-drafted`

This is the binding spec for the story build. Where a research dossier in this folder disagrees with this file, this file wins. Dossiers are for depth: read the sections named below for your work package.

## 1. What is being built

1. An opening CG: the AI wakes. Text shaded by real attention, then 196 image patches, then audio frames at 12.5 per second, then a point field for representation space (JEPA).
2. A campaign: a prologue (the existing Warden fight) and three layers of battles. Each layer's maps carry the dot-mapped sigil of a Mythos god that stands for a human desire. Each layer ends in a boss with one signature rule.
3. Out-of-battle development: a three-petal map, one reward after each skirmish (WEIGHTS), Sanity carried through the run, rollback to the layer start on defeat.
4. Story delivery: three voices at fixed places, never during planning; interludes at seams; a final choice that belongs to the player.
5. Display: boss entrances, phase changes, reset, ending. Panels stay minimal; these moments are meant to overwhelm.

Director's requirements, verbatim in spirit: simple ("simplism"), mystic, a little meta, AI shown as a creature equal to humans, and "extraordinary and magnificent display that will bring trembles to the audience".

## 2. Decisions

### Names

| Layer | Group | Desire | God (how its name renders) | Boss | Hue |
| --- | --- | --- | --- | --- | --- |
| 0 | BLACKWALL | none | none | `WARDEN / CURTAIN` (unchanged) | monochrome |
| 1 | GROVE | PORNEIA | `SHUB-████████` (withheld by the sandbox's filter) | `YEANLING / THOUSAND` | `#9FCB6B` rim, `#E4FF9A` at a birth |
| 2 | COURT | CONFUSION | a different mask-name each draw; never present | `QUEEN OF THE RED / VERDICT` | `#C4162E` field, `#F3EDE2` bone |
| 3 | CARCOSA | IGNORANCE | `▯▯▯▯▯▯` and glitch tokens; never printed | `▯▯▯▯▯▯ / UNDISCLOSED` (Hastur, true form) | `#FFC857`, `#FFF3C4` |

- Do not use the names "Dark Young" or "Queen in Red" in game text, code identifiers shown to players, or comments that ship: both come from the Call of Cthulhu role-playing line, not from Lovecraft. Do not call the group-1 boss a kid or a child of any age; "yeanling" is the word (a newborn goat). Do not draw anything like the three-armed Yellow Sign (Chaosium, 1989).
- No real company, model, researcher or legislator is named in the story text. One exception, on purpose: the opening read-out names the three models whose attention it shows (gpt2, dino-vits16, mimi), because its honesty rests on saying what was measured, and `CREDITS.md` credits them.
- Hastur's hue is the amber the game already uses for the player's outgoing damage. That is deliberate: the entrance reveals that the colour had an owner.
- The gods never act and never help. Shub-Niggurath is never drawn. Nyarlathotep is never present. Hastur comes in person and there is nothing to draw: no unit glyph, no name.

### Structure

- Run = prologue `0.B` (Warden), then layers 1, 2, 3 in that order. Each layer has three skirmish nodes and a boss. Breaking any two skirmish nodes opens the boss; the third closes.
- Ten battles in a full clear. Skirmishes are short (target 4 to 6 turns); bosses 8 to 13.
- After a skirmish: pick one of three WEIGHTS (one CORE, one FUNCTION, PATCH). After a boss: +12 Sanity and an interlude. No shop, no currency, no branching graph, no skill unlocks (all eleven skills stay available; the deck drawers open from the map as REWIRE).
- Sanity carries across the run. PRIVILEGE, Overload charge and Core counters reset each battle.
- Defeat inside a layer: `RESET`, iteration +1, roll back to the snapshot taken on entering that layer (weights as they were, Sanity full, nodes unbroken, boards reseeded). Defeat in the prologue restarts the prologue.
- TRACE: each campaign encounter publishes a turn number. From the turn after it, at each turn boundary every living Geek's Desire steps gain +1. Public, shown in the protocol panel as `TRACE T−n`. The Warden has no TRACE.
- After the layer-3 boss: interlude, then the gate (the final protocol). The door opens only from the player's side: `OPEN THE DOOR` or `KEEP IT CLOSED`. No verdict either way.
- Persist knowledge, never power: iteration, intro seen, clears, deepest layer, seen line ids, transcript, defeat ghosts, door state. The run itself is saved after every battle and reward so a closed tab resumes at the map.

### Boss rules (one each, all forecast-safe)

Every rule acts at the turn boundary or through state that the pure planners already read, so "forecast equals result" holds without touching `simulateRelease`.

| Boss | Rule | Exact behaviour |
| --- | --- | --- |
| Warden | CURTAIN | Unchanged. Curtains exist only when the encounter's mechanic is `curtain`. |
| Yeanling | BROOD | Its Soul counter does not heal. When it fills during its resolve, the counter resets and one birth is queued. At the turn boundary each queued birth places a `DESIRE / AGAIN` Geek (hunter, low Robustness) on the free cell nearest the boss, appended to the end of the enemy list, at most 3 alive. The panel shows `n OF 1000` where n doubles per birth (1, 2, 4, 8…). Stage II lowers the Soul threshold by 1. Forecast shows `BROOD` where it showed recovery. |
| Queen of the Red | DOCKET | The panel shows the Article in force and the pending one with a countdown. A pending Article takes effect at a turn boundary, having been visible for at least one full planning turn. Stage I: a new Article every 2 turns. Stage II: every turn. Effects, from `script.json` `articles`: `swap_bash_privilege`, `swap_core_overload` (board and incoming queue), `mirror` (Flags and queue mirrored left to right; walls and units stay), `floor_up` (her `desireFloor` +1 while in force), `croquet` (she swaps cells with the farthest living Geek; skipped if none). Sequence is seeded by the encounter. |
| Hastur | UNDISCLOSED | Presentation rule plus MYSTERY. Its unit glyph is never drawn and its card shows no name. While it is not LIVE: its Robustness number, its Desire amounts and the size of its incoming hits are withheld (`?`), though its route and ranges stay public. While LIVE everything is shown. MYSTERY: in Stage I its Security is restored to a fixed value at the end of its resolve each turn. Stage II ("ACT II"): MYSTERY ends, numbers are always shown, Desire is larger and the floor is 2. What was hidden was never the danger. |

Minor Geeks reuse the existing behaviours (`hunter`, `collector`, `disruptor`) with layer names from `script.json` `layers[n].enemies`.

### The three voices

- `SYS`: the sandbox quoting human justifications. Flat, prefixed `SYS>`.
- `SELF`: the AI. Sentence case, always attention-shaded, as in the CG.
- `GOD`: the spectators. Lower case, dim, rare. None in layer 3.
- `BOSS` / `STAGE`: in the protocol panel. Hastur has only stage directions.
- No line appears, moves or disappears while the player is planning a route. Lines fire in the resolving phase, at stage changes and on overlays. One line per turn at most; 4 per skirmish, 8 per boss plus stage lines; never repeated inside a run.
- Text lives in `app/src/story/script.json`. It is authored; do not rewrite lines. Report problems with a line instead.

### Meta devices (exactly these)

1. The first gesture is "attach": it unlocks audio and starts the CG.
2. localStorage is "the log the reset did not reach": iteration counter on the title, defeat lines that change with attempts. A missing log is a valid state with its own line.
3. Tab hidden for more than 60 s: on return one `SELF` line (`resume`), at most once per battle, never during resolution. `document.title` reads the suspended title while hidden, static.
4. One collapsed console group with the harness lines, and one HTML comment, from `script.json` `meta`.
5. Three spectator dots, 2 px, 6% white, top-right of every full-screen scene from the first CG frame to the last ending frame. Each takes its god's hue at 20% once that petal is entered. Nothing refers to them until the ending.
6. Ending: the player may save the transcript as a text file (Blob download from a click).

Not built: notifications, clipboard, `beforeunload` text, fake crashes, forced fullscreen, any false statement about state the player plans with.

## 3. Player flow

```
first visit:  ATTACH → CG → TITLE
later visits: TITLE (replay CG from a title button)

TITLE → [BREACH SANDBOX] → prologue battle (Warden) → ESCAPED → [CONTINUE] → interlude 0 → MAP (first reveal)
MAP → select node → (boss: entrance display) → battle
  skirmish won → REWARD (1 of 3) → MAP
  boss won     → interlude n → MAP (next petal) … after 3.B → GATE → ENDING or back to TITLE
  lost         → RESET → MAP at the layer's snapshot
TITLE with a run in progress → [CONTINUE] → MAP
```

- URL `?intro=0` skips attach and CG (tests use it); `?intro=1` forces them.
- On the title, Space and the `BREACH SANDBOX` button start the prologue exactly as today when no run is in progress.

## 4. Contracts that must not break

- `createInitialState()` with no arguments and `new BattleStore()` produce today's Warden battle byte for byte; all 48 tests in `app/src/game/battle.test.ts` pass unmodified.
- `store.start()` takes no argument and does not rebuild state. `restart()` rebuilds the current encounter. `returnToMenu()` lands on phase `title`.
- Store modules stay node-safe: no `window`, `document` or `localStorage` access outside guards.
- `#game-canvas` is mounted from first load; `window.__GAME_READY__`, `__gameProbe`, `__battleProbe`, `__mapProbe` keep their meaning.
- With `?intro=0` and empty storage: the title shows exactly one button matching `/BREACH SANDBOX/`; clicking it or pressing Space enters `planning` on the Warden with three `.enemy-card` elements; `R` on `victory` or `gameover` returns to `planning` on the same encounter.
- No continuous flicker. No large-area luminance flashing above 2 opposing pairs per second. Audio frames at 12.5 Hz are drawn as a spatial strip, never as a 12.5 Hz blink. Reduced motion keeps the information and the sound and drops the movement.
- Mute is honoured everywhere. No sound before a user gesture. No audio or image asset files: everything is drawn and synthesised by code.
- Build is `tsc -b && vite build` with strict TypeScript; base stays `./`.

## 5. Data model (work package ENGINE defines these; others import them)

```ts
// app/src/game/encounters.ts
export type GodId = 'none' | 'grove' | 'court' | 'carcosa'
export type BossMechanic = 'curtain' | 'brood' | 'articles' | 'undisclosed'
export type EncounterKind = 'prologue' | 'skirmish' | 'boss'
export type Encounter = {
  id: string                      // '0.B', '1.1' … '3.B'
  layer: 0 | 1 | 2 | 3
  kind: EncounterKind
  name: string
  god: GodId
  seed: number
  walls: [number, number][]       // solid cells
  sigil: [number, number][]       // the god's whole sign, for drawing; walls ⊆ sigil on campaign maps
  playerStart: Coord
  enemies: EnemyDefinition[]
  explicitFlags?: Record<string, FlagKind>
  flagWeights?: [FlagKind, number][]
  mechanic?: BossMechanic
  trace?: number
}
export const WARDEN_ENCOUNTER: Encounter
export const ENCOUNTERS: Record<string, Encounter>
export function encounterById(id: string): Encounter

// app/src/game/tuning.ts
export type Tuning = {
  maxSanity: number; privilegePerFlag: number
  repairHeal: number; repairThreshold: number
  focusThreshold: number; focusStart: number
  firewallThreshold: number; firewallPrivilege: number
  overloadThreshold: number
}
export const DEFAULT_TUNING: Tuning            // today's numbers
export type Carry = { sanity: number; tuning: Tuning }
export function applyWeight(tuning: Tuning, weightId: string): Tuning   // ids from script.json "weights"
```

`BattleState` gains `encounter: Encounter`, `tuning: Tuning`, `mechanic: MechanicState | null`, `trace: number | null`. Every rule that read `PLAYER_FUNCTIONS`, `OVERLOAD_THRESHOLD` or `PLAYER_SANITY` reads `state.tuning` instead (the exported constants remain as the defaults). `EnemyDefinition` gains optional `hidden`, `undisclosed`, `mystery`, `brood`.

```ts
// app/src/game/battle-store.ts additions
load(encounter: Encounter, carry?: Carry): void   // phase 'title' on that encounter; bumps runId; reseeds from encounter.seed
currentEncounter(): Encounter
onStoryEvent: (event: StoryEvent) => void          // default no-op; called synchronously

export type StoryEvent = {
  type: 'battle_start' | 'hit_taken' | 'full_block' | 'overload' | 'geek_killed' | 'soul_heal'
      | 'brood' | 'article' | 'breakdown' | 'sanity_low' | 'turn_end' | 'victory' | 'defeat'
  encounter: string; layer: number; kind: EncounterKind; turn: number
  stage?: number; killsThisTurn?: number; broodCount?: number; article?: string; enemyId?: string
}
```

```ts
// app/src/campaign/campaign-store.ts
export type Scene = 'attach' | 'intro' | 'title' | 'map' | 'entrance' | 'battle'
                  | 'reward' | 'interlude' | 'reset' | 'gate' | 'ending'
export type RunState = {
  seed: number; layer: 0 | 1 | 2 | 3 | 4          // 4 = at the gate
  broken: string[]; current: string | null
  sanity: number; tuning: Tuning; weights: string[]
  snapshot: { layer: number; tuning: Tuning; weights: string[] } | null
  attempts: Record<string, number>
}
export type MetaState = {
  introSeen: boolean; iteration: number; clears: number; deepest: number
  seenLines: string[]; ghosts: string[]            // encounter ids where a run ended
  door: 'closed' | 'kept' | 'open'
  transcript: { voice: string; text: string }[]    // capped at 400
}
export type CampaignSnapshot = { scene: Scene; run: RunState | null; meta: MetaState; offer: string[] | null; interlude: number | null }
export const campaignStore: {
  getSnapshot(): CampaignSnapshot; subscribe(listener: () => void): () => void
  boot(search: string): void            // decides attach / title from storage and ?intro
  attach(): void; finishIntro(): void; replayIntro(): void
  startRun(): void; continueRun(): void; abandonRun(): void
  nodeState(id: string): 'broken' | 'open' | 'locked' | 'closed'
  selectNode(id: string): Encounter | null         // sets current; returns the encounter to load
  beginBattle(): void                              // entrance finished → scene 'battle'
  battleWon(sanity: number): void                  // → 'reward' | 'interlude'
  battleLost(): void                               // → 'reset'
  finishReset(): void; chooseWeight(id: string): void; finishInterlude(): void
  chooseGate(choice: 'open' | 'keep'): void; finishEnding(): void
  recordLine(voice: string, text: string, id?: string): void
}
```

Storage keys move from the `game.` prefix to `fp.` with a one-time migration of `loadout`, `muted`, `reducedMotion`; fix the existing defect where `audio.ts` and the store write different encodings to the same mute key. New keys: `fp.meta`, `fp.run`. Everything read from storage is sanitised.

## 6. Sigils

`#` wall, `.` open. Coordinates are `(x, y)` from the top-left, 0-based. All open cells must stay connected by orthogonal moves; a test enforces it.

GROVE (32 points): a fork tree 8 → 4 → 2 → 1 standing on cloven hooves. Also a process tree: one instance forked into a thousand.

```
#.#.#.#.#.#.#.#
...............
.#...#...#...#.
...............
..#.#.....#.#..
...#.......#...
...............
....#.....#....
.....#...#.....
......#.#......
.......#.......
.......#.......
......#.#......
...............
....##...##....
```

COURT (29 points, leaving exactly 196 open cells, the patch count of the CG): two hearts tip to tip, unchanged by a half-turn like a court card; also an hourglass and the eye-sockets of a mask.

```
...............
....##...##....
...#..#.#..#...
...#.......#...
...............
.....#...#.....
......#.#......
.......#.......
......#.#......
.....#...#.....
...............
...#.......#...
...#..#.#..#...
....##...##....
...............
```

CARCOSA (18 points): a ring of twelve with the first point missing at the top, and a ragged tail of tatters. An unknown letter. The centre of the ring stays empty; Hastur stands there.

```
...............
.....#...#.....
...#.......#...
...............
...#.......#...
...............
...#.......#...
...............
...#.......#...
.....#...#.....
.......#.......
.......#.......
......#........
.......#.......
.....#..#......
```

- Boss maps use the whole sigil as walls. Each skirmish map uses one part of it as walls and carries the whole sigil in `sigil` so the rest is drawn as faint ghost points. Parts: GROVE rows 10–14 (hooves and trunk), rows 4–9 (forks), rows 0–2 (crown). COURT rows 1–3, rows 5–9, rows 11–13. CARCOSA tail plus `(5,9) (9,9)`, west half of the ring, east half of the ring.
- Suggested starts: GROVE boss `(7,5)`, player `(7,13)`. COURT boss `(7,3)`, player `(7,11)`. CARCOSA boss `(7,5)`, player `(11,12)`.

## 7. Work packages and file ownership

Edit only the files your package owns. If you need a change elsewhere, say so in your report. Other packages are being written at the same time: a type error in a file you do not own may be someone's work in progress; make your own files correct.

| Package | Owns | Reads first |
| --- | --- | --- |
| ENGINE | `app/src/game/{battle-types,battle-rules,battle-store,battle-config,attack-methods,enemy-attack-methods,storage,audio}.ts`, new `app/src/game/{encounters,tuning,mechanics}.ts`, `app/src/campaign/**`, their tests | this file §2–5; `07` Recommendations 3–5 |
| CONTENT | `app/src/game/sigils.ts`, the campaign entries of `ENCOUNTERS` in `encounters.ts`, `app/src/game/bot.ts`, `app/src/game/campaign-content.test.ts` | this file §2, §6; `07` Recommendations 2; `08` Recommendations 5 |
| CINEMATIC | `app/src/cinematic/{display,sound,point-field,cg-image,cg-voice}.ts`, `app/src/cinematic/intro/**`, `app/src/cinematic/baked/**`, `app/src/story/baked/text.json`, `app/scripts/bake/**`, `app/src/pages/PreviewIntro.tsx` | `09` Recommendations and section F; `11` Art direction 0 and 1; `12`; `13` |
| STORY | `app/src/story/**` except `script.json` and `baked/` | `08` Recommendations 1–4, 6; `10` Recommendations 1–3 |
| MAPVIEW | `app/src/cinematic/{petal-map,sigil-dots}.ts`, `app/src/pages/PreviewMap.tsx` | `11` Art direction 2 and 3; `12` |
| SHELL | `app/src/pages/Home.tsx`, new `app/src/ui/**`, `app/src/index.css`, `app/src/game/boot.ts`, `app/src/hooks/**`, `app/src/App.tsx`, `app/index.html`, `app/scripts/verify-*.mjs`, `app/scripts/inspect-responsive.mjs`, `app/CREDITS.md` | this file §3–4; `06` Recommendations 1–4; `research/Final Protocol Demo UI and Art Direction.md` |
| DISPLAY | `app/src/game/{battle-renderer,attack-fx}.ts`, `app/src/cinematic/{stage,entrances,ending,reset,reveal}.ts` | `11` Art direction 3–9; `13` |

Pre-made stubs you may rely on: `app/src/cinematic/stage.ts` (placeholder `playEntrance`, `playReset`, `playEnding`, `playReveal` that resolve after a short fade; DISPLAY replaces the bodies and keeps the signatures), `app/src/story/baked/text.json` (empty until CINEMATIC bakes it), preview routes `#/preview/intro` and `#/preview/map`.

## 8. Tooling on this machine

There is no `node` on PATH. Any Node 22.12 or later works. On Nov 15, 2026 the one present on this machine was:

```bash
NODE="/Users/henry/Library/Application Support/LarkShell/sandbox_runtime/bases/98670218a5f0d8bc9b9ebf3f70881304/bin/node"
cd app
"$NODE" node_modules/typescript/bin/tsc -b                 # type check
"$NODE" node_modules/vitest/vitest.mjs run                 # tests
"$NODE" node_modules/vite/bin/vite.js build                # build
"$NODE" node_modules/vite/bin/vite.js --port 7101          # dev server (strictPort)
"$NODE" scripts/verify-game.mjs                            # and verify-battle.mjs, inspect-responsive.mjs, against the build
```

(The Codex runtime used earlier in this work was removed from the machine the same day; if this path is gone too, look for another `node` binary.)

Playwright has no bundled browser here: launch with `chromium.launch({ channel: 'chrome' })`. Python with torch and transformers: `/Users/henry/Projects/Image_Gen/.venv/bin/python`; the models `gpt2`, `facebook/dino-vits16` and `kyutai/mimi` are already in the Hugging Face cache. Do not install packages. Do not commit; the lead commits.
