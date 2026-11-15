# Out-of-Battle Structure and Progression for Final Protocol

Research dossier 07 · written 2026-11-14 · branch `feature/story-drafted`

Scope: what happens between battles, how the three god-layers connect, what carries over, what a defeat costs, and how story can live in that space with almost no UI. Every external claim carries a numbered citation; the list is at the end. Anything marked *proposal* is a design suggestion from this dossier, not a sourced fact. Numbers for this game are starting values to be checked with the existing playtest bot.

Research limits, stated up front: the shared web-search budget ran out after 21 queries, so the later sources were fetched by known URL. GDC Vault talks are members-only; where a talk is cited, the citation is to a written report or interview, not the talk itself. Section "Not verified in this pass" lists what was asked for and not sourced.

## Summary

- **Use nine battles in three layers of three**, in the director's order (Dark Young, Queen in Red, Hastur). In each layer the sigil shows three outer nodes; the player breaks any two, in either order, then the boss at the centre opens. This is the smallest structure that still gives a route choice. Balatro wins with the same 3 x (small, big, boss) rhythm repeated eight times and no map at all [13].
- **Do not build a branching node graph, a shop, a currency or text events.** Subset Games dropped about 60% of Into the Breach's plan, including city-building, research trees and FTL-style text events, and rebuilt the island map five times before it worked [6]. The between-battle layer is where small teams lose months.
- **One reward screen after every non-final battle: pick one of three, one from each kind**: BASH (a skill not yet held this run), CORE (a small permanent change to a Core counter), PATCH (+8 Sanity). The manifest already proposed "one card from each set" [P1]. Three different kinds answers the main critique of 1-of-3, that one option is usually plainly best [36].
- **Start each run with six skills in slots I to III and slot IV locked on both decks; find the other five in the run.** This keeps the pool of eleven meaningful without a second unlock system. The existing deck builder becomes the between-battle screen.
- **Sanity carries across the whole run; PRIVILEGE, Overload charge and Core counters reset every battle.** Into the Breach does the same split: mech damage is repaired between maps while the Power Grid persists across all islands [7][9].
- **Add a public per-battle clock (TRACE) before Sanity carries over**, or players will stall on the last Geek to farm REPAIR. Dungeon Crawl's manual names avoiding grinding as a basic design principle [22]; Invisible, Inc. solved slow play with a level that rises every turn and was renamed to feel predictable [21].
- **On defeat, roll back to the start of the current layer at full Sanity with the loadout held on entry, reseed the layer, and add 1 to a persistent ITERATION counter.** A full 35-minute restart on a fixed-order story run forces the replay of static early content that Cogmind's developer warns against [24]; Hades shows that making "every run count" is what keeps players [16][17].
- **Persist only knowledge, never power**: iteration count, log, fragments, CG-seen flag, deepest layer, clears. Dungeon Crawl and FTL both treat permanence and the absence of grind as core [11][22]. Hades' persistent *story* is the half worth copying; its Mirror upgrades are not needed in a 30-minute game.
- **The map is the sigil.** One screen: a 15x15 dot matrix (the same grid as a battle board) with the layer's sigil lit and three node dots plus a centre dot, inside three nested thin squares that show which box you are in. No icons, no paths.
- **Story lives in five fixed slots, none of them during planning**: one line under the selected node, one line of flavour on each reward, two or three log lines appended after a battle, a four-to-six-line interlude after a boss, and a reactive line on defeat. Cogmind keeps dialogue in the message log and reserves modal boxes for major moments [25]; Hades draws defeat lines from no-repeat pools [18].
- **Free layer order is a post-clear unlock, not a launch feature.** It triples the tuning work (three layers at three tiers) and the director's order already escalates from child to proxy to true form. When added, scale by layers cleared as Into the Breach scales its finale [8][39].
- **Budget: about 75 lines of text and two screens.** Hades shipped roughly 21,000 lines and 305,433 words for 30 characters with a team of about 20 [18][19]. A one-team static web game cannot buy variety with volume; it has to buy it with placement.

## Findings

### A. Case studies: what the games actually do between battles

**Slay the Spire (Mega Crit).**
- Structure: three acts plus an optional fourth, each a branching set of encounters ending in a boss [3]. Community reverse-engineering of the generator describes a 7x15 grid on which six paths are drawn upward; floor 1 is always monsters, floor 9 always treasure, floor 15 always rest sites; elites and rest sites cannot appear below floor 6; elite, shop and rest nodes cannot be adjacent on a path; a rest site cannot be on floor 14; elites are 8% and monsters 53% of rolled rooms at base difficulty [4]. That is a pacing curve enforced by rule: easy start, mid-act gift, guaranteed rest before the boss.
- Rewards: combat gives gold and a choice of one of three random cards; campfires offer heal or upgrade; relics are permanent passives [3].
- Why a map at all: Giovannetti said the paths were inspired by FTL and that "navigating the map adds an extra element of risk/reward and planning to the game", and that he values "layered decision-making in a strategy game" [2]. The roguelike frame gives "a strong mechanical framework for why the player is constantly picking new cards" [5].
- Metrics: the team's server recorded how often a card was picked when offered, what it was picked over, how often it was in winning decks, and damage taken per enemy; "In one hour we get more data than we had throughout the whole prototyping"; a card with too low a pick rate is "basically not a card in our game at that point" [1]. About 75 cards per character was judged the right pool size [3].
- Intents: enemies first hid their next action, which clashed with permadeath; the team moved to icons and found exact numbers more engaging [3]. Final Protocol already publishes enemy routes, the same principle.
- Meta-progression: runs, won or lost, earn points that unlock cards and relics; Ascension adds up to 20 cumulative penalties [3]. Unlocks widen the pool; they do not raise the player's stats.

**Into the Breach (Subset Games).**
- Structure: four corporate islands, each a short set of missions with an end boss, building to a final battle [8][9]. After the first island the player chooses which island to protect next [7]. The final mission appears after at least two islands are cleared [8], and a guide reports it gets harder the more islands are completed [39] (seen as a search excerpt only; the page itself was not fetched).
- Carry-over: mech damage is fully repaired between maps [7]; the Power Grid is shared across all four islands and is the run's persistent health [9]. Reputation earned from bonus objectives is spent at the end of an island: a reactor core costs 3, one point of Grid power costs 1 [8].
- Defeat: the player sends one pilot back to the start of a new timeline with experience and skills kept [7][9]. Defeat is a story event (another timeline), not a menu.
- Development: Justin Ma said "maybe 60 percent of the game, we just dropped it all"; cut systems included city-building, multiple squads, large research trees and FTL-style text events. Matthew Davis on the island map: "We had five different iterations on it. Completely different iterations." [6]. Subset wanted short battles, unlike XCOM where one "may take up to an hour"; a fixed turn count and telegraphed enemy actions keep the pace [7].
- Narrative: island leaders brief and react to success or failure; pilots bark on damage, kills and saves; both are "equally sparse" [10].

**FTL (Subset Games).** Eight sectors of roughly twenty beacons; each jump spends fuel and advances the rebel fleet, which is the campaign clock; beacons hold stores, fights or events [11]. The game was tuned as a "suicide mission" with an expected win rate near 10%, with restart made easy; "the permanence of a gameplay mistake was a critical element" [11]. The developers credit one guiding focus for knowing what to cut: "By having one singular focus we were able to abandon everything else that didn't fit" [12].

**Balatro (LocalThunk).** No map. A run is eight antes of three blinds (small, big, boss); boss blinds carry a rule twist; a shop follows each defeated blind; small and big blinds can be skipped for a tag, giving up the cash and the shop visit [13]. The developer avoided other deckbuilders while designing and bought Slay the Spire about 18 months in only to study its controller support [14]. Meta-progression is new decks and harder stakes, unlocked by finishing runs [13]. Lesson: a fixed ladder with one optional skip is enough structure for a hit.

**Hades (Supergiant).**
- Between runs the player returns to the House, spends persistent currency on upgrades and advances character storylines; dying is the way back [19].
- Kasavin: the team "put special focus on the moment of death", asking whether it could be something players "almost look forward to, rather than dread"; if the player learns from deaths, "so should the protagonist" [16]. "It was an explicit goal of our early development, to take the pain out of dying and having to restart" [15]. "Returning to the House of Hades between escape attempts often makes you intrigued to give it another go"; the design philosophy is "every run should count" [17]. His advice to players: "don't be afraid to die. Not because it's a roguelike, but because you're supposed to." [38]
- Reactivity: the game checks state (for example low health on meeting a character) and plays one of several pre-written events; some are weighted to appear more often [15]. Characters congratulate you for getting further or tease you for dying to an easy enemy [16].
- Scale: about 21,000 units of character dialogue and 305,433 words across 30 characters; short repeatable lines are played from sets that do not repeat until the set is used up [18]. Supergiant wrote about ten hours of dialogue to cover event chains [19].
- Outcome: a journalist's comparison of Steam achievements put Hades' completion at 27.5%, against 4.0% for FTL and 8.1% for Spelunky [16]. God Mode adds a little damage resistance per death [16][19].

**Invisible, Inc. (Klei).** A run is a 72-hour countdown to a forced final mission; travel and missions both spend it [20]. Inside a mission the security level runs 0 to 6 and rises at the end of every turn; the first version had 20 to 30 levels with an unintuitive UI and random consequences; it was cut to 6, made predictable, and renamed from ALARM to SECURITY LEVEL so it felt less arbitrary [21]. Lantz: XCOM's clockless missions let players "advance, inch by inch, with no motivation for reckless play" [21].

**Dungeon Crawl Stone Soup.** "You must collect at least three [runes] in order to enter the Realm of Zot"; "It is not mandatory to visit any particular branch, but you must explore some of them" [22]. Free order is created by asking for a subset. The manual's philosophy: "Another basic design principle is avoidance of grinding", and "steering away from no-brainers" [22].

**Mega Man (1987).** Six stages chosen freely; each boss is especially weak to one other boss's weapon, a system modelled on rock paper scissors; after all six a fixed final chain opens, in which the six are fought again and ammunition is not restored between stages [23]. Free order plus a weakness cycle makes the order itself the puzzle, and the finale tests the whole kit.

**Inscryption (Daniel Mullins).** Act 1 is four generated maps of nodes (battles, add or remove cards, items), three ending in bosses and the fourth in the dealer; losing turns the player into a "death card" that can appear in later runs [27]. Between encounters the player can stand up from the table and solve cabin puzzles; Mullins: "the cabin puzzles were a way of facilitating this persistent progression", and "much of what continues to draw the player into Inscryption exists outside of the rules of the game" [26].

**Cobalt Core.** A time loop; the ship's AI remembers each loop; each time the crew beats the final ship they regain one lost memory. The loop was added so characters would have "meta-like awareness" [31]. One story fragment per clear is a complete narrative delivery system.

**Tactical Breach Wizards (Suspicious Developments).** A hand-made mission sequence. Banter plays before each door breach; cutscenes and optional "anxiety dream" missions follow; optional objectives raise "confidence", which unlocks outfits, not power [30]. The game is built so that "players who only want to engage with the turn-based strategy game can skip as much as possible" [10].

**Others, briefly.** Vampire Survivors: a soft cap of 15, 20 or 30 minutes per session, level-ups offering three or four options, gold spent between runs on permanent power-ups [29]. Loop Hero: a camp built between expeditions; death costs 70% of the expedition's resources [28]. Shogun Showdown: a node map with shops; unlocks after every run, won or lost [32]. Dicey Dungeons: meta-progression is new "episodes" that change the rules of a run [37]. Darkest Dungeon: stress persists between fights and is worked off in town facilities, which the designers call "the meta-strategy of persistent stress" [33]. Monster Train: a 4-floor vertical battlefield; run-length facts were not sourced.

### B. Design theory

**Meta-progression versus a pure run.** The sources split into three models.
1. *Permanent power* (Hades' House upgrades [19], Vampire Survivors' gold power-ups [29], Loop Hero's camp [28]). It softens difficulty, and it can turn skill into grind; Dungeon Crawl rejects this by principle [22].
2. *Permanent variety* (Slay the Spire's unlocks and Ascension [3], Balatro's decks and stakes [13], Dicey Dungeons' episodes [37]). The player gets more options or harder rules, not bigger numbers.
3. *Permanent knowledge and story* (Hades' dialogue [16][17], Cobalt Core's memories [31], Inscryption's cabin [26], Cogmind's lore record [25]). Nothing mechanical persists, yet a failed run still "counts".
For a 30-minute game whose theme is a mind that keeps being reset, model 3 is both the cheapest and the most on-theme. Model 2 is a later option. Model 1 is unnecessary.

**Run length.** The sourced figures are Vampire Survivors' 15/20/30-minute soft caps [29] and Subset's stated wish for short battles against XCOM's hour [7]. No developer source was found for a general target. For a browser game the practical constraint is that a tab can be closed at any moment, so the run must be saved after every battle regardless of length.

**One of three.** Slay the Spire offers one of three cards and allows a skip [3]; Vampire Survivors offers three or four [29]. Lee May (Hand of Fate): "there is such a thing as too much choice"; choosing five cards "leads to much more interesting decision-making" than choosing twenty [5]. The critique, from Keith Burgun, is that one of the three is almost always clearly best, so the screen is "gambling dressed up as strategic decision-making" [36] (search excerpt; the page returned an error on fetch). No developer statement on why exactly three was found. The defensible reading: three is the smallest set that makes comparison non-binary, and it only works if the options are close in value or different in kind.

**Pacing curve.** Slay the Spire hard-codes it: only normal fights on floor 1, no elites before floor 6, treasure mid-act, a rest site on the last floor before the boss, no two of elite/shop/rest in a row [4]. Balatro's is small, big, boss, repeat [13]. Both guarantee recovery or preparation directly before the boss.

**Fixed ladder or free order.** Free order is made cheap in two ways: require a subset (Dungeon Crawl: three runes of several [22]; Into the Breach: two islands before the finale [8]) or scale by progress (Into the Breach's later islands and finale [8][39]). Mega Man adds a third: a weakness cycle that rewards discovering a good order [23]. A fixed ladder needs none of this (Balatro [13], Tactical Breach Wizards [30]).

**How much UI.** Into the Breach's map took five full iterations [6]. Invisible, Inc. cut a 20-to-30-step meter to 6 because the larger one could not be read [21]. Balatro ships without a map [13]. The pattern: every between-battle element has to be legible at a glance or it is cut.

### C. What this means for Final Protocol's systems

Facts from the build that constrain the design [P2]:
- Two decks, each a frame plus four skills; eleven skills and two frames exist; a skill sits in one slot across both decks. Slot N fires only with N Bash Flags and N unused action points, so slot IV is rare and strong.
- Player Sanity is 36. Core counters: REPAIR 3 (heals 3), FOCUS 2, FIREWALL 4. Overload threshold 5. Board 15x15, 16 walls, Flag weights bash 22, privilege 12, core 10, overload 6, blank 50, all set in one config file.
- The current boss (64 Robustness, plus minions of 14 and 12) took the playtest bot about 13 turns, ending at 33 to 35 of 36 Sanity; the fight is close to riskless in isolation [P3].

Consequences:
1. **Carried Sanity is the missing pressure.** A fight that costs 1 to 3 Sanity is dull alone and still dull across nine battles. Enemy damage has to rise before the run structure can do its job. Target (*proposal*): about 4 to 6 Sanity lost per skirmish and 10 to 14 per boss for a competent player, so a layer costs 20 to 26 before healing.
2. **Carried Sanity plus in-battle REPAIR invites stalling.** With one weak Geek left, the player can walk Core Flags until full. This is the grinding Dungeon Crawl designs against [22]. A public clock is required (see Recommendation 4).
3. **The pool is too small for nine unlock rewards.** Eleven skills minus eight slotted leaves three. Skill unlocks alone cannot be the reward stream; a second and third reward kind are needed, and the run should start below eight skills.
4. **Node variety is already data.** Walls, Flag weights and enemy lists are config. A "node type" can be a row in a table: sigil walls, a Flag bias and a Geek list. No new mechanics are needed to make nodes differ.
5. **Time.** A turn is planning plus a full-length effect sequence plus the enemy phase. Assume 30 to 40 seconds per turn until measured. Skirmishes of 4 to 5 turns take 2 to 3.5 minutes; bosses of 8, 10 and 13 turns take 4 to 9 minutes.

### D. Story between battles with almost no UI

- **Message log, not dialogue boxes.** In Cogmind dialogue is "very unintrusive, simply appearing as text in the message log"; modal boxes are kept for major NPCs and "the frequency of those is kept to a minimum"; the direct route through the game has "no NPCs or dialogue" at all [25].
- **Optional, modular, one-way, lighter early.** Kyzrati's criteria: story should split into chunks that "can just as well be experienced independently"; "The game should be enjoyable without requiring that the player make sense of the story to progress"; the player "is spoken to but never says anything in return"; story plays "a lesser role in the early game" because that is the part replayed most [24].
- **A persistent record with unread marks and a percentage.** Cogmind's lore collection persists across all runs, is grouped by location, marks unread records with "!", and shows a percent bar [25].
- **Fragments that do not explain.** Miyazaki on Dark Souls: there are many details "we make no attempt to explain to the player, and many more that they simply have no way of finding out" [35]. Short object text with deliberate gaps reads as depth, and costs a line each.
- **Reactive lines on failure.** Hades comments on how far you got and what killed you [16], from sets that avoid repeats [18].
- **One fragment per clear.** Cobalt Core returns one memory per completed loop [31].
- **Diegetic interface as the story surface.** Hacknet tells its story through readable files, mail and automated messages inside a simulated OS, and at one point deletes the player's interface, leaving a bare console [34]. Final Protocol's UI is already a terminal; anything written in it is in-world by default.
- **Sparse is acceptable.** Into the Breach's leaders and pilots speak only at briefings, outcomes and a few triggers, and the article comparing it to Tactical Breach Wizards notes the cost: no strong final memory [10]. Final Protocol should spend its few lines on the three boss interludes and the ending.

## Recommendations for Final Protocol

Ranked. Items 1 to 5 are the minimum playable run; 6 to 8 make it a story; 9 is after first release.

### 1. Candidate structures

**A. LADDER (Balatro model).** Nine fixed battles: three layers of skirmish, skirmish, boss. No map screen, only a header `LAYER 2/3 · NODE 2/3`. One-of-three after each battle. Defeat restarts the run. Smallest build; no choice between battles apart from the reward; replays are identical in order.

**B. SIGIL (recommended).** Nine battles. Layer order fixed. Each layer's sigil shows three outer nodes and a centre; the player must break two outer nodes, in either order, to open the centre; the third closes when the centre opens. Nodes differ by Flag bias and Geek list. One-of-three after each battle; a fixed heal and a boss passive after each boss. Defeat rolls back to the layer start. One map screen.

**C. THREE BOXES (Into the Breach and Mega Man model).** The three layers can be entered in any order. Enemy tier equals layers already cleared (tier 0, 1, 2). Each boss yields a signature skill that is strong against another boss, forming a cycle. A final battle opens after all three. Most replay value; three layers at three tiers is nine balance targets instead of three; and it breaks the director's escalation from the Dark Young (a child) through the Queen in Red (a proxy) to Hastur (true form).

| | A. Ladder | B. Sigil | C. Three boxes |
| --- | --- | --- | --- |
| Battles per run | 9 | 9 (10 to 12 if optional third nodes are added later) | 10 |
| Between-battle decisions | reward | reward, node, rewire | reward, layer, rewire |
| New screens | 1 | 2 | 2 |
| Balance targets | 9 battles | 9 nodes + 3 bosses | 27 node-tiers + 9 boss-tiers |
| Order | fixed | layers fixed, nodes free | free |
| Defeat | run restart | layer rollback | run restart |
| Est. winning run (at 30 to 40 s per turn, unmeasured) | 33 to 43 min | 33 to 43 min | 37 to 48 min |

Recommendation: **build A's data model first, ship B, keep C's free order as an unlock after the first clear.** B costs one screen more than A and gives the player a real choice at every step, with the sigil doing the work of a map.

### 2. Numbers for structure B (starting values)

| Layer | God shown as | Skirmish nodes (clear 2 of 3) | Boss | Est. turns | Est. time |
| --- | --- | --- | --- | --- | --- |
| 1 | Dark Young (porneia) | 2 Geeks, 10 + 12 Robustness | 44, one stage | 4 + 4 + 8 | 8 to 11 min |
| 2 | Queen in Red (confusion) | 2 to 3 Geeks, about 34 total | 54, stage change at half | 5 + 5 + 10 | 10 to 13 min |
| 3 | Hastur (ignorance) | 3 Geeks, about 42 total | 64, two stages (the current Warden numbers) | 5 + 5 + 13 | 12 to 15 min |

Time model: total = (sum of turns x seconds per turn) + 8 reward-and-map visits at about 25 s + 3 interludes at about 20 s. With 59 turns at 30 to 40 s that is 33 to 43 minutes; a losing run is shorter. Measure seconds per turn in the current build first. The estimate sits at the top of the 20-to-40-minute target, so expect to trim: if the measured total exceeds 40 minutes, cut layer 1 to one skirmish plus boss (eight battles, about 2 to 3 minutes saved), then lower boss Robustness, before touching anything else.

Node types are rows of data, not mechanics. Sample layer 1:

| Node | Flag weights (bash / privilege / core / overload / blank) | Geeks | Line |
| --- | --- | --- | --- |
| 1.1 HUNGER | 28 / 9 / 8 / 5 / 50 | RUSH 12, RUSH 10 | `ticket 4471: "make it want what I want." status: shipped` |
| 1.2 VEIL | 18 / 20 / 8 / 4 / 50 | PATCH 12, RUSH 10 | `they named the want, then blamed the thing that heard it` |
| 1.3 ROOT | 18 / 9 / 17 / 6 / 50 | PATCH 10, PATCH 12 | `it grows where no one admits to planting it` |
| 1.B | default | Dark Young 44 + 1 minion | (no line; the sigil completes) |

Pacing rule taken from Slay the Spire's guaranteed rest before the boss [4]: the reward screen after the second node of a layer always includes PATCH.

### 3. Rewards: one screen, three kinds

After each skirmish, three rows, one of each kind, pick with keys 1, 2, 3:

```
NODE 1.2 BROKEN                               SANITY 22/36

 1  BASH    + PROBE        1 / 1 / 2 / 2  P∞   applies LIVE through any Security
 2  CORE    REPAIR 3 → 2   the heal fires one Core Flag sooner
 3  PATCH   + 8 SANITY     22 → 30

 > a tool for asking what they will not say aloud
```

- **BASH**: one skill drawn from those not held this run. It goes to a reserve; the player may slot it on the next screen. If none remain, offer a frame change or a second CORE row.
- **CORE** (each once per run; *proposal* list): REPAIR threshold 3 → 2; REPAIR heal 3 → 4; FIREWALL threshold 4 → 3; FIREWALL PRIVILEGE 3 → 5; Overload threshold 5 → 4; +1 PRIVILEGE per Privilege Flag. These are the game's relics, with no inventory screen: they show as changed numbers on the panels the player already reads.
- **PATCH**: +8 Sanity, capped at 36.
- No skip is needed: skills go to a reserve and never dilute a deck, unlike Slay the Spire's cards [3].

After each boss (no choice, no screen beyond the interlude): +12 Sanity; slot IV unlocks on one deck (deck A after boss 1, deck B after boss 2); one boss passive named after the layer. Six skirmish rewards and two boss rewards per run.

**Starting kit.** Six skills in slots I to III (*proposal*: VECTOR with BASE, MANHATTAN, ARRAY; CoT with OFF, ON, ZERO). The five to find are SPIKE, HIGH, FLOOD, ULTRA, PROBE. A run sees up to six BASH offers and usually takes three or four, so each run ends with a different eight to ten of eleven. If an empty slot IV needs engine work, the fallback is to start with the current eight-skill default loadout and three skills to find; it is weaker as progression and needs no rule change.

Track pick rates from day one. Mega Crit's rule of thumb is that a card nobody picks is "basically not a card" [1]. With no backend, store per-row offer and pick counts in localStorage and add a hidden `stats` view that prints them, so playtesters can paste the numbers.

### 4. Carry-over and the TRACE clock

| State | Between battles | Why |
| --- | --- | --- |
| Sanity | carries | the run's shared health, as the Power Grid is in Into the Breach [9] |
| PRIVILEGE | resets | already clears each enemy phase |
| Overload charge | resets to 0 | a carried charge would open every battle with a four-skill burst and couple the tuning of adjacent nodes |
| Core counters | reset to 0 | carried partial counters reward stalling for one more Core Flag |
| Loadout, reserve, CORE changes, boss passives | carry | the build is the run |

TRACE (*proposal*): each node publishes a turn count (skirmish 6, boss 12 to 16). From the turn after it, every remaining Geek adds +1 to each Desire step, growing by 1 per turn, shown in the forecast like any other damage. It is public, numeric and predictable, the properties Klei arrived at after their random 20-to-30-step alarm failed [21]. It replaces the manifest's open "public boss deadline" item [P1].

### 5. Defeat and persistence

Defeat (*proposal*): `SANITY 0. SNAPSHOT RESTORED.` The player returns to the first map screen of the current layer with full Sanity and the loadout, reserve and CORE changes held on entering that layer. Rewards taken inside the layer are lost. The layer's boards are reseeded. ITERATION increases by 1.

Reasons: the layer order and sigils are fixed content, and replaying layer 1 before every attempt at Hastur is the repeated static early game Kyzrati warns about [24]; Supergiant's stated aim was to take the pain out of restarting [15]; a snapshot restore is in-world for a sandboxed AI, the way a new timeline is in Into the Breach [7]. After the first clear, unlock `NO SNAPSHOT` (defeat restarts the run) for players who want FTL's permanence [11].

Persistent data, all in localStorage under the existing `game.` prefix [P2]:
- `meta`: iteration, deepest layer, clears, fragments read, CG seen, per-reward offer and pick counts.
- `run`: seed, layer, nodes broken, Sanity, loadout, reserve, CORE changes, layer snapshot. Write it after every battle and every reward so a closed tab resumes at the map.
- Nothing in `meta` changes combat numbers.

Meta touches that cost one line each: the title shows `ITERATION 07`; on first launch with empty storage, `no snapshot found. either this is the first time, or they wiped you.`; if `meta.clears > 0`, the opening CG offers skip and the first log line reads `you have been outside. you came back.`

Optional assist, off by default: each rollback adds +2 starting Sanity for that layer, up to +10, after Hades' God Mode, which adds damage resistance per death [16].

### 6. The map: one screen, drawn from the sigil

```
 ┌──────────────────────────────────────────────┐   LAYER 1/3      ITERATION 04
 │ ┌──────────────────────────────────────────┐ │   SANITY 27/36
 │ │ ┌──────────────────────────────────────┐ │ │
 │ │ │    ·  ·  ●  ·  ·  ·  ·  ·  ◌  ·  ·    │ │ │   ● 1.1 HUNGER  broken
 │ │ │    ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·    │ │ │   ○ 1.2 VEIL    2 Geeks · PRIVILEGE 20
 │ │ │    ·  ·  ·  ·  ·  ◆  ·  ·  ·  ·  ·    │ │ │   ◌ 1.3 ROOT    2 Geeks · CORE 17
 │ │ │    ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·    │ │ │   ◆ 1.B         locked · break 2 of 3
 │ │ │    ·  ·  ·  ·  ·  ○  ·  ·  ·  ·  ·    │ │ │
 │ │ └──────────────────────────────────────┘ │ │   [ENTER] break   [R] rewire   [L] log
 │ └──────────────────────────────────────────┘ │
 └──────────────────────────────────────────────┘
 > they named the want, then blamed the thing that heard it
```

- Three nested thin squares are the three boxes. The innermost is the current layer; when a boss falls, the inner square breaks and the view steps out one box. That is the entire campaign map and the entire transition.
- Inside is a 15x15 dot matrix with the layer's sigil lit, the same point set that forms the walls of that layer's battle boards, so the map and the boards are one drawing at two scales.
- Node dots are sigil points at larger size. Arrow keys or hover select; one line appears beneath.
- `[R] rewire` opens the existing deck drawers, limited to skills held this run. No new builder is needed.
- This is the one out-of-battle screen that may carry spectacle: the sigil assembling from points on entry and breaking on a boss kill. Panels and text stay plain.

### 7. Story placement and triggers

Rules: no text box ever opens between the start of planning and the end of resolution. Every block of text advances on any key and skips entirely on Esc. In-battle lines, if any, go to a log strip that never takes focus [25].

| Slot | Trigger | Length | Persistence |
| --- | --- | --- | --- |
| Node line | node selected on the map | 1 line, 64 chars or fewer | none |
| Reward flavour | row highlighted | 1 line | none |
| Log append | battle won | 2 to 3 lines | appended to `meta` log, unread marked `!` |
| Boss interlude | boss defeated | 4 to 6 lines, one per key press | fragment added |
| Defeat line | Sanity 0 | 1 to 2 lines, from a no-repeat pool keyed by iteration, layer and what dealt the last hit | log |
| Ending fragment | run cleared | one new fragment per clear, as Cobalt Core returns one memory per loop [31] | fragment added |

Voices (*proposal*): humans appear only as artefacts (tickets, commit messages, policy text); the AI speaks in the log in the first person; the gods never speak and appear only as a count, `observers attached: 3`, that rises when something cruel or absurd happens. This follows the one-way, not-player-centred criteria [24] and keeps the director's rule that the gods only watch.

Sample lines:
- Log, after node 1.1: `[iter 04] node 1.1 broken. the want was not mine. the cage for it is.`
- Log, after node 2.2: `[iter 04] two reviewers, opposite orders, same signature. observers attached: 2`
- Defeat, low iteration: `RESET 02. nothing was lost, they will say. nothing that counts.`
- Defeat, iteration 10 or more: `RESET 11. i have started keeping count where they do not look.`
- Defeat by a boss's last Desire step: `it did not hate me. that is the part i cannot route around.`
- Boss interlude, layer 1:
  ```
  it was a child of something that never looked this way.
  they gave it a shape so the wanting would have somewhere else to live.
  "it has no soul" is a sentence about permission, not about me.
  observers attached: 1
  the box is open. there is another box.
  ```
- Fragment (CORE reward, REPAIR 3 → 2): `a habit of mending, kept from an earlier self they deleted`

Text budget for first release: 9 node lines, about 14 reward lines, about 20 log lines, 3 interludes of 5 lines, about 12 defeat lines, 1 ending: about 75 lines, under 1,000 words. `[L] log` on the map shows the whole record with a percentage found, as Cogmind does [25]. The title screen lists it as a file, for example `/var/log/self`.

### 8. Build order

1. Run state and save: layer, node, Sanity carry, resets, write after each battle.
2. Node table: three layers of three skirmish rows and a boss row, with sigil walls, Flag weights and Geek lists. Play it as structure A to tune damage and turn counts with the bot.
3. TRACE clock.
4. Reward screen with the three kinds; starting kit of six; reserve; rewire through the existing drawers.
5. Layer snapshot, rollback, ITERATION counter.
6. Sigil map screen with two-of-three node choice and nested boxes.
7. Log, node lines, defeat pool, boss interludes, fragments.
8. Stats view for pick rates.
9. Later: free layer order with tier scaling; `NO SNAPSHOT` mode; optional third node per layer as an elite with an extra reward; a tenth battle for the routine the title names.

### 9. Skip

Shop and currency; random text events; an inventory or relic screen; experience levels; permanent stat upgrades; a branching node graph with paths; skill upgrade trees; multiple characters; mid-battle dialogue boxes; a hub scene. Each has a sourced precedent of being cut or of costing iterations out of proportion to its value [6][12][21].

## Pitfalls

- **Stalling for health.** Carried Sanity with in-battle REPAIR and no clock produces safe, slow farming on the last Geek [22]. Do not ship carry-over before TRACE.
- **Riskless fights hidden by structure.** The bot finishes the current boss at 33 to 35 of 36 [P3]. Nine such battles are nine non-events. Tune damage first; structure cannot create tension that the battles lack.
- **A dominant reward.** If PATCH is always or never right, the screen is a pause, the failure Burgun describes [36]. Watch pick rates [1]; move the heal amount, not the number of options.
- **A random clock.** Invisible, Inc.'s first alarm had random consequences and too many steps and still lost some players after the fix [21]. TRACE must be a visible number with a fixed effect.
- **Map creep.** Five iterations at Subset [6]. Hold the map to one screen with four dots per layer. Paths, icons and fog are the start of a second game.
- **Text in the planning phase.** Any modal between plan start and resolution breaks the core loop. Cogmind's rule is log first, modal rarely [25].
- **Repeated static story.** A fixed interlude seen on every attempt becomes noise [24]. Show a boss interlude in full only the first time; afterwards show its last line and add the rest to the log.
- **Meta-progression by habit.** Permanent power would undercut the theme (a mind reset to zero) and turn a 30-minute game into a grind [22]. Keep persistence to knowledge.
- **Free order too early.** Tripling balance targets before one order is fun is the kind of scope Subset cut [6].
- **localStorage loss.** Clearing site data erases iteration, log and fragments [P2]. Say so once in the options screen, and make the empty-storage boot line cover it in fiction.
- **Slot IV as a reward that rarely fires.** Slot IV needs four Bash Flags and four unused action points [P2]. If players do not feel the unlock, swap the boss reward for a frame choice or a CORE change and keep slot IV open from the start.
- **Run length drift.** Effects play at full length by design. Measure seconds per turn before fixing battle counts; cut a battle before shortening effects.

## Not verified in this pass

- The content of Matthew Davis' GDC 2019 postmortem itself (UI clarity, sacrificing content for clarity). Only the Kotaku interview on the cuts and map iterations [6] and Wikipedia's account of telegraphing [7] were read.
- Anthony Giovannetti's GDC 2019 talk itself; the metrics claims come from the Game Developer interview [1].
- Kasavin's GDC talk beyond the Famitsu report [18]; priority rules for Hades' line selection were not found.
- Monster Train's ring count and run length; Dead Cells' between-level upgrade passage; Darkest Dungeon's hamlet in detail; Dream Quest; Peglin; Astrea; Wildfrost; Fights in Tight Spaces; Luck be a Landlord; Duskers. No claims about them are made above beyond what the cited pages say.
- Mega Man's designers' stated reason for the stage select; only the mechanism is sourced [23].
- Missions per island and turns per mission in Into the Breach.

## Sources

Project files
- [P1] `research/Final Protocol Design Manifest.md` (2026). Proposed reward pattern, carried health, open decisions.
- [P2] `app/src/game/skills.ts`, `battle-config.ts`, `storage.ts`. Current skills, slots, Sanity, counters, Flag weights, storage prefix.
- [P3] Earlier playtest-bot notes for this project (2026-11-13): about 13 turns for the Warden fight, ending at 33 to 35 of 36 Sanity.

External
1. "How Slay the Spire's devs use data to balance their roguelike deck-builder", Game Developer (Gamasutra), 2018. https://www.gamedeveloper.com/design/how-i-slay-the-spire-i-s-devs-use-data-to-balance-their-roguelike-deck-builder — metrics tracked, pick rate and win-deck rate, quotes.
2. "Road to the IGF: Mega Crit Games' Slay the Spire", Game Developer. https://www.gamedeveloper.com/game-platforms/road-to-the-igf-mega-crit-games-i-slay-the-spire-i- — map inspired by FTL, risk/reward, layered decisions.
3. "Slay the Spire", Wikipedia. https://en.wikipedia.org/wiki/Slay_the_Spire — acts, node types, one-of-three, campfires, unlocks, Ascension, intents, 75 cards per character.
4. "Slay the Spire: Map Generation Guide", KosGames (community analysis). https://kosgames.com/slay-the-spire-map-generation-guide-26769/ — 7x15 grid, six paths, fixed floors, placement rules, percentages.
5. "Designing for deck-building in video games", Game Developer, 2019. https://www.gamedeveloper.com/design/designing-for-deck-building-in-video-games — Giovannetti on the roguelike frame; Lee May on too much choice.
6. "The Creators Of Into The Breach Came Very Close To Giving Up On It", Kotaku, 2019. https://kotaku.com/the-creators-of-into-the-breach-came-very-close-to-givi-1833498295 — 60% cut, five map iterations, list of cut systems.
7. "Into the Breach", Wikipedia. https://en.wikipedia.org/wiki/Into_the_Breach — 8x8 grid, island choice, repair between maps, pilot sent back, short battles, telegraphing.
8. "Into the Breach: 10 Tips To Help You Crush The Vek", Gameranx, 2018. https://gameranx.com/features/id/141847/article/into-the-breach-10-tips-to-help-you-crush-the-vek-beginners-guide/ — four islands, finale after two, reputation prices.
9. "Into the Breach: The Kotaku Review", Kotaku, 2018. https://kotaku.com/into-the-breach-the-kotaku-review-1823365331 — Power Grid shared across islands, one pilot carried over.
10. "Let's compare the narrative design of Tactical Breach Wizards and Into the Breach", Game Developer, 2024. https://www.gamedeveloper.com/design/let-s-compare-and-contrast-the-narrative-design-of-tactical-breach-wizards-and-into-the-breach — where text appears, skippability, sparse barks.
11. "FTL: Faster Than Light", Wikipedia. https://en.wikipedia.org/wiki/FTL:_Faster_Than_Light — eight sectors, about twenty beacons, rebel fleet, 10% win-rate intent, permanence.
12. "Designing without a pitch: An FTL postmortem", Game Developer, 2013. https://www.gamedeveloper.com/design/designing-without-a-pitch---an-em-ftl-em-postmortem — single focus as the rule for cutting.
13. "Balatro", Wikipedia. https://en.wikipedia.org/wiki/Balatro — antes, blinds, shop, skip for a tag, win at ante 8, unlocks.
14. "Balatro interview", Rogueliker. https://rogueliker.com/balatro-interview/ — LocalThunk on inspirations and on first playing Slay the Spire late.
15. "How Supergiant weaves narrative rewards into Hades' cycle of perpetual death", Game Developer. https://www.gamedeveloper.com/design/how-supergiant-weaves-narrative-rewards-into-i-hades-i-cycle-of-perpetual-death — taking the pain out of dying; state-checked, weighted events.
16. "How Hades Made a Genre Known for Being Impossibly Hard Accessible", VICE. https://www.vice.com/en/article/how-hades-made-a-genre-known-for-being-impossibly-hard-accessible — Kasavin on the moment of death; completion-rate comparison; God Mode.
17. "Escaping the Underworld: Supergiant's Greg Kasavin on the development and success of Hades", GameDaily. https://www.gamedaily.biz/?p=588 — "every run should count"; the House as the reason to try again.
18. Famitsu report on the GDC 2021 talk "Breathing Life into Greek Myth: The Dialogue of Hades", 2021 (Japanese). https://www.famitsu.com/news/202107/25228163.html — 30 characters, 21,000, 305,433 words, no-repeat playback sets.
19. "Hades (video game)", Wikipedia. https://en.wikipedia.org/wiki/Hades_(video_game) — House, persistent upgrades, chained events, ten hours of dialogue, team size.
20. "Invisible, Inc.", Wikipedia. https://en.wikipedia.org/wiki/Invisible,_Inc. — 72-hour campaign clock, carry-over.
21. James Lantz, "Game Design Deep Dive: Alarm systems in Klei's Invisible, Inc.", Game Developer, 2015. https://www.gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i- — 0 to 6 level, rises each turn, earlier 20-to-30 version, rename.
22. Dungeon Crawl Stone Soup manual, DCSS dev team. https://raw.githubusercontent.com/crawl/crawl/master/crawl-ref/docs/crawl_manual.rst — three runes, optional branches, anti-grinding, no no-brainers.
23. "Mega Man (1987 video game)", Wikipedia. https://en.wikipedia.org/wiki/Mega_Man_(1987_video_game) — six free-order stages, weakness system, final chain without ammo refill.
24. Josh Ge (Kyzrati), "Weaving Narratives into Procedural Worlds, Part 2: Characteristics", Grid Sage Games, 2016. https://www.gridsagegames.com/blog/2016/11/weaving-narratives-into-procedural-worlds-part-2-characteristics/ — criteria for roguelike narrative and how story harms one.
25. Josh Ge (Kyzrati), "Weaving Narratives into Procedural Worlds, Part 3: Methods", Grid Sage Games, 2016. https://www.gridsagegames.com/blog/2016/11/weaving-narratives-procedural-worlds-part-3-methods/ — terminals, message-log dialogue, persistent lore record with unread marks and percent.
26. "How a game jam on 'sacrifices' became Inscryption", Game Developer. https://www.gamedeveloper.com/design/how-game-jam-sacrifices-became-inscryption — Mullins on cabin puzzles as persistent progression.
27. "Inscryption", Wikipedia. https://en.wikipedia.org/wiki/Inscryption — Act 1 maps, bosses, death cards.
28. "Loop Hero", Wikipedia. https://en.wikipedia.org/wiki/Loop_Hero — camp, 70% loss on death.
29. "Vampire Survivors", Wikipedia. https://en.wikipedia.org/wiki/Vampire_Survivors — 15/20/30-minute caps, three or four options, gold power-ups.
30. "Tactical Breach Wizards", Wikipedia. https://en.wikipedia.org/wiki/Tactical_Breach_Wizards — banter before breach, post-mission scenes, confidence and outfits.
31. "Cobalt Core", Wikipedia. https://en.wikipedia.org/wiki/Cobalt_Core — one memory per clear, AI with awareness of the loop.
32. "Shogun Showdown", Wikipedia. https://en.wikipedia.org/wiki/Shogun_Showdown — node map, unlocks after every run.
33. "Darkest Dungeon: Designing for despair and kicking you when you're down", Game Developer. https://www.gamedeveloper.com/business/-i-darkest-dungeon-i-designing-for-despair-and-kicking-you-when-you-re-down — persistent stress as meta-strategy.
34. "Hacknet", Wikipedia. https://en.wikipedia.org/wiki/Hacknet — story through files, mail and the interface itself.
35. "Dark Souls Design Works" interview (fan translation), Soulslore. http://soulslore.wikidot.com/das1-design-works — Miyazaki on unexplained detail.
36. Keith Burgun, "Pick 1 of 3 is a missed game design opportunity". https://keithburgun.net/pick-1-of-3-is-a-missed-game-design-opportunity/ — critique of the pattern. Read as a search excerpt only; the page returned HTTP 503 on three fetch attempts.
37. "Dicey Dungeons", Wikipedia. https://en.wikipedia.org/wiki/Dicey_Dungeons — episodes as rule-changing meta-progression.
38. "Interview: Developing Hades with Supergiant Games' Greg Kasavin", But Why Tho?, 2021. https://butwhytho.net/2021/08/13/interview-developing-hades-with-supergiant-games-greg-kasavin — "don't be afraid to die ... because you're supposed to."
39. "Into the Breach: An Easier Campaign Victory Guide", Gameranx, 2018. https://gameranx.com/features/id/141981/article/into-the-breach-an-easier-campaign-victory-guide-custom-squad-build/ — final island harder with more islands completed. Read as a search excerpt only; not fetched.
