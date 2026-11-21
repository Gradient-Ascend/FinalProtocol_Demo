# Final Protocol — Enemy Mechanics Specification

> **Scope:** Standardized three-tier enemy design (`mob`, `elite`, `boss`), closed skill libraries, unified Countdown (`T−n`) & Breakdown rules, and campaign roster across [enemy-kits.ts](file:///d:/Games/projects/Demo/FinalProtocol_Demo/app/src/game/enemy-kits.ts), [encounters.ts](file:///d:/Games/projects/Demo/FinalProtocol_Demo/app/src/game/encounters.ts), [battle-config.ts](file:///d:/Games/projects/Demo/FinalProtocol_Demo/app/src/game/battle-config.ts), [mechanics.ts](file:///d:/Games/projects/Demo/FinalProtocol_Demo/app/src/game/mechanics.ts), and [battle-store.ts](file:///d:/Games/projects/Demo/FinalProtocol_Demo/app/src/game/battle-store.ts).

---

## 1. Strategy-Game Research & Design Principles

| Reference Game | Core Pattern Studied | Applied Rule in *Final Protocol* |
|---|---|---|
| ***Into the Breach*** | Complete intent telegraphing ("show the threat, not the answer"); **Alpha Vek** share the exact attack geometry of common Vek and scale only impact/durability; Leaders alter board rules. | Forms **I** and **II** of an attack skill always share one geometry (`shape`, `range`, `width`); only damage increases. Forecasts match resolution identically. |
| ***Slay the Spire*** | Distinct **Normal / Elite / Boss** escalation; optional high-risk elites with bonus payoff; HP-threshold phase shifts (*The Champ* at 50%, *The Guardian* Mode Shift) that demand a new tactical answer. | **Elites** hold the optional `x.3` node (+4 Sanity bonus on clear). **Breakdown** at 50% HP swaps the boss's Attack, Privilege, and Core skills rather than inflating numbers alone. |
| ***Wildfrost*** | Explicit **Countdown** (`T−n`) counters visible on units so timing manipulation and speed syncing form a deterministic puzzle. | All boss timers (`CURTAIN`, `GESTATION`, `DOCKET`, `ADVENT`) and encounter `TRACE` share a unified `CountdownView` model (`T−n`). |
| ***XCOM 2: War of the Chosen*** | Named strengths and weaknesses drawn from a bounded library so every boss/elite creates specific counterplay dilemmas. | Privilege (`ward`, `entitle`, `mystery`) and Core (`mend`, `brood`, `surge`) skills are named rules composed from closed libraries. |
| ***Monster Train*** | **Relentless** boss phase stops passive stalling and turns the finale into a decisive race. | **Breakdown** pushes every unfired boss signature countdown to fire at the turn boundary when the current turn ends (leaving `TRACE` untouched). |

### Design Invariants
1. **Forecast Exactness:** Every enemy skill resolves at route settlement (end of the Geek's walk), which `predictedEnemySequence` and `enemyResourceOutcome` model deterministically. Player release simulation (`simulateRelease`) is untouched.
2. **Unified Geometry per Skill:** An enemy's Attack skill has one shape, reach, and band width; forms I and II scale only damage.
3. **Tier Defines Slot Budget:** Tier is structural (which skill slots exist), not purely statistical.
4. **Routing AI Separate from Kit:** `hunter`, `collector`, `disruptor`, `grazer`, and `warden` control pathfinding priority only; combat rules come from the unit's compiled kit.

---

## 2. Enemy Tier Rules

| Slot | MOB | ELITE | BOSS (per stage) |
|---|---|---|---|
| **Attack (Desire)** | 1 skill, **Form I only** | 1 skill, **Forms I + II** (same shape/reach/width; II > I) | 1 skill, **Forms I + II**; Stage II uses a different skill |
| **Privilege (Security)** | 1 skill | 1 skill | 1 skill; Stage II differs in kind or name |
| **Core (Soul)** | **None** (Core Flags walked over are still blanked/denied) | 1 skill | 1 skill; Stage II differs in kind or name |
| **Countdowns (`T−n`)** | — | — | ≥ 1 signature countdown (plus encounter `TRACE` where present) |
| **Breakdown** | — | — | At 50% Robustness: swaps Attack, Privilege, and Core skills; resets Security & Soul counter; pushes unfired signature countdowns to trigger when the current turn ends |
| **Sure Forms (`desireFloor`)** | Layers 0–1: `0`; Layers 2–3: `1` | Same as mobs (`0` in L1, `1` in L2–3) | Stage I: `1`; Stage II: `2` |

---

## 3. Closed Skill Libraries

### Privilege Skills (resolved per Privilege Flag collected)
*Note: Scrubbing `LIVE` when collecting any Privilege Flag remains a universal system rule across all tiers.*

| Kind | Rule | Forecast / UI |
|---|---|---|
| `ward(perFlag)` | Grants `+perFlag` Security per Privilege Flag. | `+n / PRIV` |
| `entitle(bonusPerFlag)` | Grants **0 Security**. Adds `+bonusPerFlag` damage to every armed Attack form this turn per Privilege Flag. | `+n DMG / PRIV` |
| `mystery(perFlag, floor)` | Grants `+perFlag` Security per Privilege Flag, and Security at the end of resolve is restored to at least `floor` (active in Stage I). | `+n / PRIV · MIN m` |

### Core Skills (resolved when `soulCounter >= threshold`, Elites & Bosses only)

| Kind | Rule | Forecast / UI |
|---|---|---|
| `mend(threshold, heal)` | Restores `heal` Robustness (capped at max). | `ON FULL: +h HP` |
| `brood(threshold)` | Queues a `DESIRE / AGAIN` birth (placed at turn boundary up to `brood.limit`). | `ON FULL: BROOD` |
| `surge(threshold)` | Grants `+1` `SURE` form for the following turn (`surge = turn + 1`, cleared after that turn). | `ON FULL: +1 SURE` |

### Boss Countdowns (`T−n`)

| Kind | Boss | Behavior at `T−0` | On Breakdown |
|---|---|---|---|
| `curtain` | `0.B` WARDEN | Seals scheduled row/column for the next planning turn (Stage I: 1 line, Stage II: 2 lines). | Schedules Stage II Curtains to seal at the end of the current turn (unless one is already locked). |
| `gestation(every)` | `1.B` DARK YOUNG | Queues `+1` `DESIRE / AGAIN` birth every `every` turns regardless of flags eaten. | Moves `gestationTurn` to fire when the current turn ends. |
| `docket` | `2.B` QUEEN IN RED | Enacts the pending Article (every 2 turns in Stage I, every 1 turn in Stage II). | Moves `pendingTurn` to fire when the current turn ends. |
| `advent(turn)` | `3.B` ▯▯▯▯▯▯ | Boss rises in Act I (`routeLength` 0 → 2) and begins walking. | Marks `ADVENT` risen (Act II already walks with `routeLength: 3`). |
| `trace` *(encounter-wide)* | All campaign nodes (`1.1`–`3.B`) | Raises every living Geek's Attack forms by `+1` each turn after `trace`. | **Unchanged by Breakdown** (encounter clock, displayed alongside boss countdowns). |

---

## 4. Campaign & Prologue Roster

### Mobs (Form I Only)
| Layer | Unit (AI) | Attack (Form I) | Privilege | Sure |
|---|---|---|---|---|
| **0** (`0.B`) | `DESIRE / RUSH` (`collector`) | `RUSH` · SQ R4 **3** | `WARD` (`ward 1`) | 0 |
| **0** (`0.B`) | `DESIRE / PATCH` (`disruptor`) | `PATCH` · ORTHO R6 **2** | `WARD` (`ward 2`) | 0 |
| **1** (`GROVE`) | `DESIRE / WANT` (`hunter`) | `GRASP` · SQ R4 **3** | `ROOT` (`ward 1`) | 0 |
| **1** (`GROVE`) | `DESIRE / MORE` (`collector`) | `GLUT` · SQ R5 **3** | `HOARD` (`ward 2`) | 0 |
| **1** (`GROVE`) | `DESIRE / AGAIN` (`hunter`) | `NIBBLE` · SQ R3 **2** | `HUDDLE` (`ward 1`) | 0 |
| **2** (`COURT`) | `DESIRE / AXE` (`hunter`) | `STRIKE` · SQ R3 **4** | `DECORUM` (`ward 1`) | 1 |
| **2** (`COURT`) | `DESIRE / CLERK` (`collector`) | `FILE` · SQ R5 **3** | `STAMP` (`ward 2`) | 1 |
| **2** (`COURT`) | `DESIRE / USHER` (`disruptor`) | `USHER` · BAND ±1 **3** | `OBJECTION` (`entitle 1`) | 1 |
| **3** (`CARCOSA`) | `DESIRE / AMEN` (`hunter`) | `AMEN` · SQ R4 **4** | `PIETY` (`ward 1`) | 1 |
| **3** (`CARCOSA`) | `DESIRE / AVERT` (`collector`) | `AVERT` · BAND ±2 **3** | `BLIND` (`ward 2`) | 1 |
| **3** (`CARCOSA`) | `DESIRE / HUSH` (`disruptor`) | `HUSH` · BAND ±1 **3** | `SILENCE` (`entitle 1`) | 1 |

### Elites (`x.3` Nodes — Optional Higher-Risk Node, `+4` Sanity Bonus on Win)
| Node | Unit (AI · HP) | Attack (I / II) | Privilege | Core | Sure |
|---|---|---|---|---|---|
| `1.3` | `DESIRE / SAPLING` (`grazer` · 15 HP) | `THORN` · SQ R4 **2 / 4** | `HERD` (`ward 2`) | `SAP` (`mend 3 → +4`) | 0 |
| `2.3` | `DESIRE / BAILIFF` (`hunter` · 18 HP) | `WRIT` · BAND ±1 **3 / 5** | `CONTEMPT` (`entitle 1`) | `RECESS` (`surge 2`) | 1 |
| `3.3` | `DESIRE / PALLID MASK` (`disruptor` · 13 HP) | `PALLOR` · BAND ±2 **4 / 6** | `MASK` (`mystery 1, min 2`) | `MERCY` (`mend 3 → +3`) | 1 |

### Bosses (Two-Stage Kits + Signature Countdown)
| Boss | Stage I Kit | Stage II Kit | Countdown |
|---|---|---|---|
| `0.B` **WARDEN** *(64 HP)* | `REHEARSAL` SQ R4 **3/5** · `CLOSE` (`ward 2`) · `REPAIR` (`mend 2→4`) | `OVERTURE` BAND ±3 **4/7** · `DEADLOCK` (`ward 3`) · `REWRITE` (`surge 2`) | `CURTAIN` (1 line → 2 lines) |
| `1.B` **DARK YOUNG** *(44 HP)* | `GRAZE` SQ R4 **2/3** · `HERD` (`ward 1`) · `LITTER` (`brood 3`) | `FEAST` SQ R5 **3/4** · `THICKET` (`entitle 1`) · `BROOD` (`brood 2`) | `GESTATION` (every 6 turns) |
| `2.B` **QUEEN IN RED** *(50 HP)* | `SENTENCE` SQ R5 **4/5** · `ETIQUETTE` (`ward 2`) · `PARDON` (`mend 3→4`) | `EXECUTION` BAND ±3 **5/7** · `PRECEDENT` (`entitle 1`) · `AMNESTY` (`surge 2`) | `DOCKET` (every 2 → every 1) |
| `3.B` **▯▯▯▯▯▯** *(60 HP)* | `███` SQ R5 **2/4** · `MYSTERY` (`mystery 2, min 3`) · `ABSOLUTION` (`mend 3→3`) · Static | `UNKNOWING` BAND ±5 **6/7** · `VEIL` (`ward 3`) · `FAITH` (`mend 2→5`) · Walks 3 | `ADVENT` (`T−6`, rises on turn 7) |
