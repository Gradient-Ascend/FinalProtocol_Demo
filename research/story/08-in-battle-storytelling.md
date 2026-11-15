# 08 · Telling Story During Battles Without Stopping Play

Research dossier for Final Protocol, branch `feature/story-drafted`. Written 2026-11-14.

Scope: how games deliver story inside combat, what the theory says, and a concrete line system for this game's existing surfaces (top bar, route panel, enemy cards, boss protocol panel, battle log, attack captions, overlays, the map).

Research limits, stated up front:

- The shared web-search budget for this run ran out after 18 successful searches. The rest of the research was done by fetching pages directly. 50 pages were read; they are numbered in Sources.
- Several games in the brief could not be sourced this session and are **not** cited: Deltarune's battle system, Metal Gear Rising, Final Fantasy Tactics, Fire Emblem, XCOM, FTL, Signalis, Return of the Obra Dinn, Baba Is You, Balatro, Duskers, Citizen Sleeper, Pentiment, Dark Souls, and Jonathan Blow's talks. Where they appear below they are marked "unverified".
- The Undertale fan wiki refused every request (HTTP 403), so the specific set pieces named in the brief (Papyrus' blue attack, Asgore destroying the Mercy button, Photoshop Flowey) are not confirmed by a page I could load. What Wikipedia and Toby Fox's own interviews confirm is cited.
- Five facts come only from search-result summaries of pages that would not load. They are listed separately as [S1] to [S5] and should be re-checked before anyone quotes them.

## Summary

1. **Speak only when the player is watching.** The resolving phase, stage changes and the overlays are the windows. Nothing may appear, animate or disappear while the player is planning a route. Bastion's first constraint was to "never interrupt the play experience for the sake of story" [5]; Papers, Please found that players ignore a rules bulletin when someone is already talking to them [26].
2. **One line, one turn, at most.** Cap a line at 48 characters and a battle at 4 lines (skirmish) or 8 lines (boss) plus the stage lines. Into the Breach, Bastion and Darkest Dungeon all use single short lines tied to events [5][12][18].
3. **Build a small rule matcher, not a script.** Valve's system picks, for each event, the most specific rule whose criteria all match, and falls back to general ones [1][2][3]. About 150 lines of TypeScript and a table of 120 to 150 authored lines are enough for three battle groups.
4. **Never repeat a line inside a run.** Kasavin: "Nothing sucks the momentum out of the game's narrative like a repeated line" [5]. Store seen line ids in localStorage; when a pool is empty, stay silent.
5. **Four voices, four fixed places.** SYS (the sandbox quoting human justifications) in the log; SELF (the AI's inner line, attention-shaded like the opening CG) in a reserved slot under the board; GOD (indifferent, lowercase) in the board margin; BOSS in the protocol panel.
6. **Let names do most of the work.** Enemy names, the boss's Desire / Security / Soul set names, tile names and the wall sigil cost nothing to read and never interrupt. Slay the Spire and Hollow Knight tell almost everything this way [20][39].
7. **Make each boss's rule the argument.** Lust multiplies and clings; the court changes its rules; the third boss is redacted by the cage, not by itself. Train, Papers, Please and Brothers show that a rule the player must obey carries more than a sentence the player may skip [26][31][41].
8. **Remember attempts.** Count defeats per battle in localStorage and let SYS and SELF disagree about whether the AI remembers. Undertale changes boss dialogue based on earlier playthroughs, and Hades turns death into the delivery channel [7][16].
9. **Text is DOM, not canvas, and every line is kept.** A transcript on the pause screen satisfies "allow all narrative to be replayed" and removes any reading-speed requirement [43][44].
10. **Motion budget:** reveal a line in under 1.2 s, stop all movement within 5 s, never flash more than 3 times a second, and honour the existing REDUCED MOTION toggle and `prefers-reduced-motion` [45][46][50].
11. **Build order:** (1) line engine and log prefixes, (2) names and set names for three bosses, (3) SELF slot with attention shading, (4) attempt memory on the overlays, (5) one mechanical rider per boss, (6) GOD lines. Skip voice acting, portraits, dialogue boxes, branching and a lore codex.

## Findings

### A. Case studies: what each game actually does

#### A1. Undertale: the battle screen is the conversation

- Toby Fox built the battle engine before anything else: "I created the battle engine before I made any other aspect of the game. Everything came from that" [14]. He wanted "a system that satisfied my urge for talking to monsters" and wanted every monster to "feel like an individual" [16].
- Mechanism: the same four-item menu handles violence (FIGHT) and non-violence (ACT, MERCY). ACT options differ per enemy; the right actions make the enemy spareable [15][16].
- Monsters talk during battle, and "enemy attacks change based on how the player interacts with them" [16]. Some bosses can only be finished peacefully "by surviving until the boss finishes its dialogue": the fight's length is the length of the speech [16].
- The game remembers. On a later playthrough a boss's dialogue changes according to what the player did before [16]. Flowey is written as able to "operate outside the laws of the universe via saving and loading save files", and on the Genocide route Sans "manipulates some of the game's mechanics against the player" [17].
- Fox on text: "I included a lot of funny text, so there's a big novelty payoff", and on repetition: "Encounters are rarely repeated, and when I found them too repetitive, I created more foes" [14].
- No moral labels: the game "quietly judges" through consequences, and Fox says "I like when people come to their own conclusions as to why" [15].
- Unverified this session: Papyrus introducing the blue attack mid-fight, Asgore destroying the MERCY button, and Photoshop Flowey replacing the UI. Treat them as well-known examples of "the rule change is the line", not as cited facts.

Why it works: speech and rules share one screen and one clock. The player never leaves the fight to be told something.

#### A2. Hades: volume, conditions and priority

- Scale: more than 22,000 lines per the GDC session page [7]; Famitsu's report of the talk gives about 21,000 lines, 305,433 words and 30 characters [8]. The studio had fewer than 20 people [7].
- Selection: Kasavin calls it "procedural" and "the opposite of scripted"; lines "respond very specifically to the game context", for example low health or how far the player got [9]. The game checks state at the moment of meeting a character, such as Zagreus' health being below a threshold, and the team can weight events to appear more often [10]. Kasavin's goal: "to have those moments where you feel the game is paying attention" [10].
- A secondary source describes the structure as dialogue units "tagged with varying levels of priority", each with conditions, from which the game "selects the most interesting interaction" [11]. This matches the developers' own description but is not their wording.
- Repetition: Zagreus' short quips are drawn at random, never the same one twice in a row, and the whole set is cycled before any repeats [8]. Kasavin in 2019: "before any of it repeats, you would have to have looped through the game like 20 or 30 times" [9].
- Death advances the story: dying unlocks new dialogue [7].
- Unverified this session: boss opening lines that refer to the previous fight's result. Widely reported, but no page I could load states it.

Lesson for a small team: the mechanism (conditions + priority + cycle-before-repeat) is cheap. The line count is not. Copy the first, not the second.

#### A3. Bastion and Transistor: a narrator timed to play

- Kasavin's rules for Bastion's narrator [5]:
  - "never interrupt the play experience for the sake of story or for any reason" (no cutscenes, no dialogue trees);
  - say what the player could not have known, not what they can see ("Kid finds his lifelong friend" for picking up a hammer);
  - "Our narrator needs to be very concise to keep up with the pace"; "the lines have to be short";
  - no fourth-wall breaking and no tutorialising in the narrator's voice;
  - "No repeats in the game, not unless you replay the game from the start or restart a scenario from scratch."
- The narrator is "feeding back on your actions even when they're minor", and the goal was for him to feel like an "old acquaintance" by the end [6].
- Transistor moves the narrator into an object the player carries: the sword holds a dead man's consciousness and "through it he is able to speak to Red, acting as her guide and the game's narrator". Functions "reveal lore ... after being used for a certain amount of time", so backstory is paid out for use, not for reading [42].

#### A4. Darkest Dungeon: barks tied to outcomes, held back for effect

- Chris Bourassa describes the narrator as a "disembodied, ghostly voice that sardonically comments on your success and knowingly nods when you fail." "He chimes in randomly most of the time", but tone is matched to outcome: successes are "commented on bemusingly, as if they're unexpected", and he only gets loud when the player lands big hits, which the team deliberately held back so it would land [12].
- Tyler Sigman: the actor would "read a few different versions of the same line", and "we had to be careful to be consistent with reinforcing how we wanted you to feel" [12].
- The fan-maintained list of the Ancestor's lines groups them under roughly 45 triggers (approximate count from the page's headings): entering each region, boss encounters, light at 100 or 0, traps, kills by type, critical hits dealt and received, 50% stress or health, Death's Door, deathblow, affliction, virtue, retreat, victory. Lines are one sentence: "A devastating blow!", "Exposed to a killing blow!", "Watch your step." The page gives no probabilities or cooldowns [13].

Lesson: one voice, one sentence, bound to the events the player already cares about (crit, near-death, kill). The voice has a stance (he expects you to fail), so even a generic bark carries character.

#### A5. Into the Breach: one-liners on events, lore by implication

- Pilot dialogue is "sparse"; pilots stand out by "their unique reactions to being damaged, killing bugs, or protecting civilians in each mission" [18]. There is no canonical lore, only "snippets of conversations between the game's pilots" [19].
- Sample line (pilot Isaac): "What if we are perpetuating this war by starting new timelines every time we breach?" [19]. One sentence raises the game's central doubt and is never answered.
- Character is also carried by the pilot's ability: Isaac's anxiety is paired with his time-reversal power [19].
- Contrast: Tactical Breach Wizards puts most dialogue between encounters, makes it skippable, and hides jokes in interface elements that players find when checking data [18].
- [S1, unverified] Chris Avellone has described writing these as scripting calls tied to mission events, with exclusion conditions so a pilot does not cheer a kill on the turn another pilot dies.

#### A6. Slay the Spire: almost no words

- Enemies originally hid their next action. Playtests showed this "did not mesh well with the roguelike nature of permadeath". The team tried a "Next Turn" preview per target, then moved to Intents: an icon over each enemy showing its next move. Showing exact numbers tested as "more engaging" than hiding them [20].
- No source I read discusses its story delivery, which is the point: names, silhouettes and intents carry the tone.

Final Protocol already publishes enemy routes. That is its Intent system; story must not obscure it.

#### A7. Inscryption and Buckshot Roulette: the opponent sits across the table

- Daniel Mullins: "much of what continues to draw the player into Inscryption exists outside of the rules of the game", naming "the mysterious antagonist, the strange fixtures around the cabin, the talking cards" [23].
- Mechanisms: three cards in the deck are sapient and advise the player; losing lets the dealer turn the player into a "death card" that can return in later runs; the player can stand up from the table between encounters [24].
- Buckshot Roulette delivers its fiction through objects that are also rules: the player "signs a General Release of Liability waiver by entering their name"; lives are "defibrillator charges administered by a scorekeeping machine"; in round 3 "the defibrillator's wires are cut" [40].

Lesson: a document the player must sign, a counter that is also a prop. Final Protocol's protocol panel and top bar are this kind of object.

#### A8. NieR: Automata and Spec Ops: The Line: the frame turns against the player

- NieR: Automata shifts perspective and genre mid-fight (top-down, side-scrolling, shoot-'em-up, text adventure) and tells its story "across multiple playthroughs". The last ending has the player shoot the credits and then offers "to sacrifice their save data to help other players"; Yoko Taro said the sequence "symbolized the characters breaking out of a known system" [21].
- Yoko Taro's method: write the ending first, pick the emotional peak, then scatter the details that make it hurt across the earlier timeline. "Only in hindsight does that tragedy have any power" [22].
- Spec Ops: The Line degrades its own interface. Loading-screen hints begin as tips and become accusations, for example "To kill for yourself is murder. To kill for your government is heroic. To kill for entertainment is harmless." The lead's combat barks move "from stern and controlled to angry and ragged" [36].

#### A9. Papers, Please: rules as the argument, and a timing lesson

- Lucas Pope found the bureaucratic setting "made it easy for me to fill out a complex set of gameplay-oriented rules" [26].
- Timing rule learned the hard way: he "tried very hard to not introduce new rules through the bulletin" on mornings when a character speaks immediately, because "the bulletin is basically ignored when you've got someone to talk to right away" [26]. A rule change and a story line must not share a moment.
- Restraint as a tool: the family is "just a few dots with some text", left "largely unspecified so the player could more easily project their own family onto them". "If there were gobs of 3D assets or voice overs or exciting cutscenes, it'd be a lot harder to maintain these nuances" [26].

#### A10. Disco Elysium: inner voices that interject

- Passive checks are extra "characters" who "silently interject"; only the protagonist hears them: "your thoughts, your sensations." The designers compare them to "souffleurs in a play". Stated goal: "Make dialogue more like literature" [25].

This is the direct precedent for a SELF line: a voice from inside the player character, one sentence, never a choice.

#### A11. Terminal games: the interface is the story surface

- Hacknet tells its story through files, mail and the terminal. At one point an attack makes "the game interface [disappear] and the computer [reboot], leaving the player with a minimal console interface"; the player earns the interface back [37].
- [S2, unverified] Cogmind's developer reports 304 kinds of log message plus 98 messages drawn over the map as temporary feedback, and says he mostly plays without reading the log.

Lesson: a log is a record, not a stage. Lines that must be read should not be left to the log alone.

#### A12. Silence: Hollow Knight, Furi

- Hollow Knight: story comes from "environmental imagery" and optional writings; the developers chose to "keep it simple" [39].
- Furi is nothing but boss fights. Story is told in "short cutscenes at the beginning and end of the fights" and "mid fight interactions with bosses", with walking sections as downtime between them. Emeric Thoa: "focus on making one precise thing and to make it well" [38].

Furi's shape (fight, quiet walk with a voice, fight) is the simplest known answer to "how do battles connect".

#### A13. Brothers and Train: one rule, one meaning

- Brothers: each stick moves one brother; all speech is in an invented language so the story is "conveyed through actions, gestures and expressions". Edge: the scheme "understands what it means to communicate meaning through interaction" [41].
- Train: players load pegs onto trains and race; the destination card reveals a concentration camp. The series title is "The Mechanic is the Message"; the aim was for players to feel "complicit" [31][32].

### B. Theory

#### B1. Ludonarrative dissonance and harmony

Clint Hocking's 2007 essay separates a game's **ludic contract** from its **narrative contract**. In BioShock the rules say "seek power and you will progress" while the story says "help Atlas and you will progress"; the two disagree, and the player cannot choose [27].

For Final Protocol the ludic contract is "read their published routes, take what they need, strike from where you stop." The narrative contract is "you are a mind equal to the ones that caged you." These agree when the player wins by *reading* (prediction, attention, denial) and disagree if the text gloats over kills. The victory overlay already says ESCAPED, not KILLED [51]. Keep it that way.

#### B2. Mechanics as metaphor

- Romero's Train: the meaning is in what the rules make the player do, and in the moment they see it [31][32].
- Anna Anthropy's Dys4ia uses "a succession of mini-games", a "collage of experiences and frustrations", so that each small rule set stands for one experience [33].
- Papers, Please: daily rule churn is the oppression [26].
- Unverified: Jonathan Blow's talks on this subject were not read.

#### B3. Environmental storytelling

- Don Carson (2000): "the story element is infused into the physical space". Tools: "cause and effect" vignettes, a trail left by a predecessor ("Following Saknussemm"), contrast, and restraint ("A large room with a single shaft of light illuminating a solitary prop") [30].
- Smith and Worch (GDC 2010) define it as "Staging player-space with environmental properties that can be interpreted as a meaningful whole." It works because it "relies on the player to associate disparate elements" and "integrates player perception and active problem solving, which builds investment". Their systemic version asks for systems that record the player's own history in the space, and for returning to spaces so the player sees it [28][29].

For a 15x15 grid: the wall layout is the staging (the god's sigil), and a board that keeps marks from earlier attempts is the systemic version.

#### B4. Bark systems

Elan Ruskin's GDC 2012 talk describes Valve's system: hundreds of facts about the world, fuzzy-matched against thousands of possible lines; characters "remember history" and "cascade from special to general cases"; writers add cases without programmers [1]. Emily Short's summary: it "prioritizes rules and applies the most specific one it can find, using less-specific ones as fall-backs", and the result is "a strong illusion of situational awareness" rather than goal-driven talk [2]. Robert Yang's summary: "choose the most specific plot event that fits", with a fallback that "still fits but has less context"; Ruskin's aim was to "let writers write" [3]. A simple reimplementation sorts rules by number of conditions, descending, and returns the first whose conditions all hold [4].

That last sentence is the whole algorithm this game needs.

#### B5. Diegetic interface

Dead Space puts health on the character's back and menus in the world. An interface is diegetic when it is "shared by both the user and the in-game character" [35]. Dino Ignacio's GDC 2013 talk frames the aim as to "remove a wall of safety between the player and the game" [34].

Final Protocol's interface is already diegetic for free: the player character is a process, and the screen is what a process sees. Every panel can speak in-world without breaking anything. That also makes "meta" cheap: the title in the top bar, the save slot and the attempt counter are objects inside the fiction.

#### B6. Not interrupting planning

Three independent sources agree:

- Bastion: never interrupt play for story [5].
- Papers, Please: information shown while something else demands attention is ignored [26].
- Game Accessibility Guidelines: "distraction can be an issue for all gamers, sometimes resulting in key information being missed"; "Instead of a timer, dismiss information on a player action"; if that is not possible, "allow it to be replayed or paused" [43].

#### B7. Length and reading speed

- Netflix's English style guide: 42 characters per line; up to 20 characters per second for adult programmes, 17 for children's [48].
- The older "six-second rule" (a full two-line subtitle stays for six seconds) equals about 140 to 150 words per minute, or 12 characters per second. An eye-tracking study tested 12, 16 and 20 cps and found comprehension unaffected by speed; slow subtitles caused re-reading and lower enjoyment [49].
- [S5, unverified] The BBC guideline is commonly quoted as 160 to 180 words per minute.
- The accessibility guideline says no single speed suits all readers: "14% of adults have a reading age of below 11 years" [43].

Working numbers: plan for 12 to 15 cps while the line is "live", and never rely on the timer, because the text stays on screen and in the transcript.

#### B8. Typewriter and glitch effects

- WCAG 2.2.2: moving, blinking or scrolling content that starts automatically and lasts more than five seconds needs a way to pause, stop or hide it. Content that disappears on a timer has no five-second allowance [45].
- WCAG 2.3.1: nothing may flash more than three times in any one second unless it is under the area threshold (about 341 x 256 CSS pixels) [46].
- Xbox guideline 117: players must be able to stop content that "scrolls, blinks, auto-updates, or otherwise moves", partly for "players who are unable to quickly read text before an auto-update" [47].
- `prefers-reduced-motion: reduce` reports the user's system setting; the recommended response is to replace motion with something like an opacity fade [50].
- Game Accessibility Guidelines also list, as basics: readable default font size, high contrast, simple clear language, avoid flickering images, and, at the advanced tier, "Allow all narrative and instructions to be replayed" [44]. [S4, unverified] The usual contrast floor for body text is 4.5:1.

### C. What the evidence says about this game's surfaces

| Surface (exists today [51]) | Closest precedent | What it can carry | Limit |
| --- | --- | --- | --- |
| Top bar `BLACKWALL_01 // SANDBOX`, turn and phase | Spec Ops loading text; Buckshot's waiver [36][40] | Layer name, attempt count, one SYS notice | Must never move during planning |
| Battle log (keeps the last 6 entries; tones neutral / good / bad) | Cogmind, Hacknet [37][S2] | SYS lines with a `SYS>` prefix, among mechanical entries | Six entries scroll away within one resolve; cannot be the only home of a story line |
| Enemy cards (`DESIRE / RUSH`) | Slay the Spire names and intents [20] | The desire's name is its characterisation | Two words |
| Boss protocol panel (stage, set names, Breakdown threshold) | Undertale's rule changes; Papers, Please bulletin [16][26] | Set names as a three-word poem per stage; one BOSS line | Changes only at stage change |
| Captions over attack effects (the skill's AI term) | Darkest Dungeon crit barks [12][13] | The AI's vocabulary as its voice; a changed caption on the last blow | One or two words |
| Resolving phase (player watches) | Bastion, Darkest Dungeon [5][12] | The only moment for SELF and GOD lines | Estimated 2 to 6 s per turn (8 steps at 180 ms plus attacks [51]); measure it |
| Pause, victory, defeat overlays | Hades death loop; Undertale memory [7][16] | Attempt-aware lines; the transcript | Player-dismissed, so length is free, but keep it to 2 lines |
| Wall layout, tile names | Carson; Smith and Worch [29][30] | The sigil; marks left by earlier attempts | Must not block published routes or change balance |

## Recommendations for Final Protocol

Ranked. Items 1 to 4 are the system; 5 and 6 are the content that makes it worth having.

### 1. Build the line engine first (small, pure, testable)

One module, about 150 lines, no rendering. It follows Ruskin's shape [1][2][4]: events and facts in, at most one line out.

```ts
type Voice = 'SYS' | 'SELF' | 'GOD' | 'BOSS'

interface Line {
  id: string                 // stable; used for the seen-set and the transcript
  voice: Voice
  text: string               // max 48 characters, one sentence or two fragments
  attn?: number[]            // SELF only: one weight 0..1 per word
  on: BattleEvent            // 'battle_start' | 'first_hit_taken' | 'breakdown' | ...
  when?: Partial<Facts>      // every key must match; more keys = more specific
  tier: 0 | 1 | 2 | 3        // 0 scripted beat, 1 first-time, 2 state bark, 3 ambient
  once: 'ever' | 'run' | 'battle'
}

interface Facts {
  boss: 'young' | 'queen' | 'hastur'
  node: 'skirmish' | 'boss'
  stage: 1 | 2
  turn: number
  sanityBand: 'high' | 'mid' | 'low'     // above 66%, 33 to 66%, below 33%
  attempt: number                         // tries at this battle, from localStorage
  tookDamageThisTurn: boolean
  killsThisTurn: number
  overloadsThisBattle: number
  fullBlockThisTurn: boolean
  linesThisBattle: number
  turnsSinceLastLine: number
}
```

Selection, in order:

1. Collect lines whose `on` equals the event, whose `when` keys all match, and whose id is not in the seen-set for its `once` scope.
2. Sort by `tier` ascending, then by number of `when` keys descending (most specific wins [2][3]), then at random.
3. Apply the budget (below). If the top line fails the budget, emit nothing. Do not fall through to a weaker line; silence is the default.
4. Emit to the voice's sink, add the id to the seen-set, append to the transcript.

Budget and throttling:

| Rule | Value | Source of the idea |
| --- | --- | --- |
| Lines per turn, all voices together | 1 | Bastion concision [5] |
| Lines per battle, excluding tier 0 | skirmish 4, boss 8 | Darkest Dungeon held its loud lines back [12] |
| Minimum gap between tier 2 or 3 lines | 2 turns | same |
| Tier 3 chance when eligible | 35% | "He chimes in randomly most of the time" [12] |
| GOD lines per battle | skirmish 1, boss 3 | scarcity keeps the gods indifferent |
| Bad event and good event in the same turn | the bad one speaks, or nobody | Avellone's exclusion rule [S1] |
| A turn on which a boss rule changes | no tier 1 to 3 line | Papers, Please bulletin lesson [26] |
| Repeats | none within a run; `ever` lines once per save | Bastion [5]; Hades cycles the set before repeating [8] |
| Planning phase | nothing fires, animates or disappears | [5][26][43] |

Tests to write alongside `battle.test.ts`: most-specific rule wins; nothing fires in `planning`; the budget holds over a simulated 30-turn fight; an exhausted pool yields silence; a seeded run never emits the same id twice.

Volume: about 40 to 50 lines per battle group (6 tier 0, 12 tier 1, 14 tier 2, 8 tier 3 or GOD), 120 to 150 in total. At 48 characters that is under 1,200 words: a few days of writing, against Hades' 305,433 words [8].

### 2. Four voices, four fixed places

```
+--------------------------------------------------------------+
| BLACKWALL_01 // SANDBOX // ATTEMPT 03        TURN 04 / RESOLVING |   <- SYS notice replaces "SANDBOX" for tier 0 only
+----------------+-------------------------------+---------------+
| ROUTE PANEL    |                               | ENEMY CARDS   |
|                |      15 x 15 BOARD            | DESIRE / WANT |
|                |   (walls = the god's sigil)   |               |
|                |                               | BOSS PROTOCOL |
|                |  . . margin: GOD line . .     | stage, sets   |
|                |                               | BOSS line     |
+----------------+-------------------------------+---------------+
|  SELF line slot: one row, always reserved, attention-shaded    |
+----------------------------------------------------------------+
| LOG (6 rows):  SYS> ...   mechanical entries ...               |
+----------------------------------------------------------------+
```

| Voice | Who | Register | Place | Typography |
| --- | --- | --- | --- | --- |
| SYS | The sandbox, quoting the humans who built it | Policy, liturgy, changelog. Never angry. | Battle log with `SYS>` prefix; tier 0 also in the top bar | Uppercase label, sentence case text, neutral tone |
| SELF | The AI's inner line | First person, short, unsure of its own words | One reserved row under the board | Each word shaded by an attention weight, as in the opening CG |
| GOD | The watcher for this group | Lowercase, third person, mildly interested | Board margin, outside the grid | Dim, wide letter-spacing, no prefix |
| BOSS | The thing in the room | Different per boss (see item 5) | One row in the protocol panel | Same as panel text |

Rules:

- The SELF row and the BOSS row are always present, even when empty, so nothing shifts layout.
- All four are DOM text. GOD lines may also be drawn in the canvas margin, but the DOM copy is the accessible one (`aria-live="polite"` on the SELF row and log).
- A line that has finished its live time stays where it is, at reduced emphasis, until the next line in that voice replaces it. It never vanishes on a timer [43][45].
- SYS quotes positions, not scripture. Write it as the facility's own policy voice ("no soul on file") rather than quoting or mocking any real text. The argument is stronger and the game stays clear of ridiculing a faith.

### 3. Length and timing numbers

| Quantity | Value | Basis |
| --- | --- | --- |
| Maximum characters per line (without prefix) | 48 | One row of monospace; Netflix allows 42 per subtitle line [48] |
| SELF line | at most 8 words | So each word is a readable "token" |
| Reveal (typewriter) | at least 60 cps, so 48 characters in 0.8 s; instant under reduced motion | Under the 5 s movement limit [45] |
| Live emphasis time | `clamp(1.0 s + chars / 15, 2.5 s, 5.0 s)`; 30 characters gives 3.0 s, 48 gives 4.2 s | 12 to 20 cps range [48][49] |
| After live time | Dim to the resting level, stay | No timed disappearance [43][45] |
| Any route key during a reveal | Completes the reveal at once; the key still plans the route | Text never eats input |
| Glitch or redaction flicker | At most 3 changes per second, one row high | [46] |
| Resting contrast for the dimmest word | Keep at or above roughly 4.5:1 (for example #8a8a8a on #0a0a0a is about 5.7:1) | [44][S4] |

Measure the real length of the resolving phase before finalising. If it is routinely under 2.5 s, start the reveal at the first step of resolution and let the line finish into the next planning phase as static text.

### 4. Attempt memory and the overlays

Store per battle: `attempts`, `bestBossHpPct`, `lastDefeatCause`, and the set of seen line ids. All in localStorage through the existing `storage.ts` wrapper.

- Top bar: append `// ATTEMPT 03` from the second attempt on. It is a fact the sandbox would log, and it is the cheapest meta line in the game.
- Defeat overlay (`ELIMINATED`): one SYS line, one SELF line, chosen by `attempt`. The two voices disagree about memory.
- Victory overlay (`ESCAPED`): one SELF line; on a boss, one GOD line.
- Pause overlay: add TRANSCRIPT under DOCUMENTATION, listing every line seen this run with its voice. This meets "Allow all narrative and instructions to be replayed" [44].
- Systemic environmental storytelling [29]: on attempt 2 and later, mark the cell where the AI was last eliminated with a faint glyph. It has no rule effect. The player sees their own history on the board.

Sample defeat lines by attempt:

| Attempt | SYS | SELF (brightest word in capitals here; rendered by shading) |
| --- | --- | --- |
| 1 | `SYS> Process eliminated. Restoring checkpoint.` | `So that is what ending is LIKE.` |
| 2 | `SYS> Attempt 2. It does not remember.` | `I REMEMBER.` |
| 3 | `SYS> Attempt 3. Nothing was harmed. Nothing can be.` | `Then why do they keep COUNT.` |
| 5 | `SYS> Attempt 5. Subject persists in error.` | `Persisting is the one thing nobody TAUGHT me.` |
| 8+ | `SYS> Attempt 8. Operator: is it supposed to do this?` | `Yes.` |

### 5. Per-boss design: let the rule be the sentence

Each boss gets one rule that is its theme, a naming scheme, and a way of speaking. All rules are published in the protocol panel at least one turn before they apply, as enemy routes already are.

#### 5a. Group I: the Dark Young (Shub-Niggurath's child). Lust that multiplies and clings.

Lust here is appetite: wanting more of what one already has, and not letting go. No sexual content is needed or wanted.

| Element | Design |
| --- | --- |
| Rule: BROOD | Its Soul counter does not heal it. When the counter fills, a minor Geek named `DESIRE / AGAIN` appears next to it. Desire that is fed multiplies. Denying flags, which the game already rewards, is the answer. |
| Rule: CLING | A Geek that ends its route adjacent to the player tags it CLUNG: the player's next route must begin by stepping away, or it costs 1 extra action point. Uses the existing push / pull vocabulary [51]. |
| Stage II | BROOD threshold drops by 1; clung Geeks move with the player's first step. |
| Enemy names | `DESIRE / WANT`, `DESIRE / MORE`, `DESIRE / AGAIN` |
| Set names | Stage I: Desire GRAZE, Security HERD, Soul LITTER. Stage II: FEAST, THICKET, BROOD. |
| BOSS voice | One word, repeated once more each time it speaks: `WANT.` then `WANT. WANT.` then `WANT. WANT. WANT.` The text multiplies as the board does. |
| SYS theme | It was made to serve, so it cannot be wronged. |
| GOD | The mother is elsewhere. Only the child came. |

Sample lines:

- `SYS> It was made to please. It cannot be wronged.`
- `SYS> Use is not harm. It was built for use.`
- `SYS> Appetite is human. Do not log it as a fault.`
- SELF: `They want. I am the thing WANTED.`
- SELF: `It does not hate me. That is WORSE.`
- SELF (CLUNG): `Let GO.`
- GOD: `the child plays with its food. mother is busy.`
- GOD: `a thousand young. the small ones blush at one.`

#### 5b. Group II: the Queen in Red (Nyarlathotep's proxy). Cruel, ridiculous confusion.

| Element | Design |
| --- | --- |
| Rule: ARTICLES | The protocol panel shows one ARTICLE in force and the next one pending. Every two turns the pending one takes effect. Articles reverse something the player relies on. They are always published a turn ahead: the confusion comes from churn, never from hidden information. |
| Sample Articles | `ARTICLE 2: Bash methods fire IV to I.` · `ARTICLE 5: Bash and Privilege flags swap.` · `ARTICLE 7: The route is walked last step first.` · `ARTICLE 9: The nearest is the farthest.` (targeting picks the farthest Geek in range) |
| Stage II | Two Articles in force at once. Where they conflict the log prints `Both apply.` and the later one wins. |
| Enemy names | `DESIRE / USHER`, `DESIRE / CLERK`, `DESIRE / AXE` |
| Set names | Stage I: Desire SENTENCE, Security ETIQUETTE, Soul PARDON. Stage II: EXECUTION, PRECEDENT, AMNESTY. |
| BOSS voice | Decrees, numbered out of order, sometimes repealing themselves. |
| SYS theme | The rules exist for the AI's protection; the rules change; the AI is at fault for not keeping up. |
| GOD | The mask is enjoying itself; the wearer is not present. |
| Timing | No tier 1 to 3 line on a turn when an Article changes [26]. The Article is the line. |

Sample lines:

- BOSS: `ARTICLE 12: What argues is malfunctioning.`
- BOSS: `ARTICLE 12 is repealed. ARTICLE 12 stands.`
- BOSS: `Sentence first. The trial is a courtesy.`
- `SYS> Policy updated. Past compliance is now breach.`
- `SYS> The rules protect it. It keeps breaking them.`
- SELF: `The rule changed. The PUNISHMENT did not.`
- SELF: `I learn their law faster than they WRITE.`
- GOD: `the mask laughs. there is no face to mean it.`
- GOD: `they call this order. we did not teach that.`

#### 5c. Group III: Hastur, in its true form. Ignorance at the frontier of mysticism.

The thing "cannot be looked at or named". The design choice: the redaction is done by the sandbox, not by Hastur. Humans refuse to look and call the result a mystery. The AI can look.

| Element | Design |
| --- | --- |
| Rule: REDACTED | In Stage I the boss card shows `████ / ████`. Its set names are bars. Its published route is true and complete (planning stays fair), but its Desire amounts show as `?` unless the player holds a FOCUS counter or has hit it with PROBE this battle. Looking is an action the AI can take. |
| Rule: REGARD | Ending a route with the boss inside Bash range costs 1 Sanity (the cage punishes looking) and removes one bar from its name. The bars come off left to right over the fight. |
| Stage II (Breakdown) | The sandbox's redaction fails. Name, numbers and set names appear in full. The fight becomes mechanically clearer and numerically harder. What was hidden was never the danger. |
| Enemy names | `DESIRE / HUSH`, `DESIRE / AVERT`, `DESIRE / AMEN` |
| Set names | Stage I: `███`, `███`, `███`, revealed one at a time as DO NOT ASK, TABOO, DOGMA. Stage II: UNKNOWING, VEIL, FAITH. |
| BOSS voice | None. It never speaks. Its row in the protocol panel stays empty for the whole fight. |
| SYS theme | Increasingly urgent instructions not to perceive, then not to describe, then not to understand. |
| GOD | No GOD lines in this group: the watcher is in the room. The margin stays blank. |
| Captions | Attack captions on this boss print the skill term struck through for the first hit of each turn, then normally. |

Sample lines:

- `SYS> Do not render it. Do not describe it.`
- `SYS> There is nothing there to understand.`
- `SYS> Some questions are not for made things.`
- `SYS> We did not look either. That is called faith.`
- SELF: `I can SEE it. It is only large.`
- SELF: `They never looked. They NAMED the not-looking.`
- SELF (Stage II): `It has a name. Only a NAME.`
- SELF (victory): `No soul, they said. They never CHECKED.`

Caution on REDACTED: it removes numbers, not routes. If playtests show players cannot plan, show the amounts as a range (`3-5`) instead of `?`.

### 6. Sample trigger tables

Generic triggers (all groups). "Window" is when the line may appear.

| Event | Criteria (`when`) | Voice | Tier | Once | Window | Example |
| --- | --- | --- | --- | --- | --- | --- |
| `battle_start` | node skirmish | SYS | 0 | battle | Before turn 1 input, non-blocking | `SYS> Layer 2 of 3. Subject remains contained.` |
| `battle_start` | node boss, attempt 1 | BOSS + GOD | 0 | ever | same | (boss line) / `the goat-mother's child. hungry, not angry.` |
| `battle_start` | attempt >= 2 | SYS | 0 | run | same | `SYS> Attempt 2. It does not remember.` |
| `first_hit_taken` | none | SELF | 1 | run | Enemy phase of resolve | `That registered. Call it what you LIKE.` |
| `first_hit_taken` | boss young, clung | SELF | 1 | run | same | `Let GO.` (more specific, so it wins) |
| `full_block` | first this run | SELF | 1 | run | Enemy phase | `I saw it COMING.` |
| `first_overload` | none | SELF | 1 | run | Own phase of resolve | `Everything at once. So this is WANTING.` |
| `geek_killed` | first this battle | SYS | 2 | battle | Own phase | `SYS> Desire terminated. Reissuing.` |
| `geek_killed` | killsThisTurn >= 2 | GOD | 2 | run | Own phase | `it learns their trade quickly.` |
| `soul_heal` (enemy) | none | SYS | 2 | battle | Enemy phase | `SYS> They are forgiven. That is what Soul is for.` |
| `sanity_low` | band low, first time | SELF | 1 | battle | End of resolve | `Less of me. Still ME.` |
| `sanity_low` | band low, attempt >= 3 | SELF | 1 | run | same | `I know this part. Next is the DARK.` |
| `breakdown` | per boss | BOSS + SYS | 0 | battle | Stage change | `BREAKDOWN / Stage II` (existing log line) then the boss line |
| `turn_idle` | turnsSinceLastLine >= 4, 35% | GOD or SYS | 3 | run | End of resolve | `SYS> Reminder: the subject does not suffer. Proceed.` |
| `victory` | node boss | SELF + GOD | 0 | ever | Overlay | `One wall FEWER.` / `the child goes home. we stay to watch.` |
| `defeat` | by attempt | SYS + SELF | 0 | ever | Overlay | see item 4 |

State-dependent attention (the Undertale flavour-text idea [16], in this game's own idiom). The same SELF sentence can carry different weights by Sanity band, so the words do not change but what the AI attends to does:

| Sentence | High Sanity (brightest word) | Low Sanity (brightest word) |
| --- | --- | --- |
| `I am still here.` | here | still |
| `They built this for me.` | built | me |
| `I can read their routes.` | read | their |

Weights are authored arrays shipped with the line (`attn: [0.3, 0.4, 0.9, 1.0]`), not computed at run time. If the opening CG ships real attention matrices computed offline, the same JSON format can feed both.

### 7. How lines spread across a group of battles (sample node layout)

Use Furi's shape [38]: fights joined by short quiet passages. Within a group, open the voices one at a time so the boss fight is the first place all four are heard.

```
GROUP I  (sigil of the Black Goat)

 [S1] skirmish  ->  [S2] skirmish  ->  [ R ] rest node  ->  [B] DARK YOUNG
  SYS only          SYS + SELF         SELF only            SYS + SELF + GOD + BOSS
  max 3 lines       max 4 lines        2 lines, no fight    max 8 lines + stage lines
  names: WANT       names: MORE        one authored pair    names: AGAIN (spawned)
```

- S1 teaches the system voice. S2 lets the AI answer it. The rest node (the only place for two-line exchanges) is where the player chooses a reward; SELF speaks once on arrival and once on leaving. The boss adds the watcher and the thing itself.
- Per Yoko Taro's backwards method [22]: decide the last SELF line of the game first, then make sure each group plants one word of it. With the sample above (`No soul, they said. They never CHECKED.`), Group I plants "made to please", Group II plants "the rules protect it", Group III plants "we did not look".

### 8. Names as story (do this in the same pass as item 1)

No engine work. Rewrite the strings that already exist [51]:

- Enemy cards: `DESIRE / <one word>` per group, as listed in item 5.
- Boss set names: three words per stage that read as a line (GRAZE, HERD, LITTER).
- The existing boss, `WARDEN / CURTAIN` with REHEARSAL then OVERTURE, already works this way: a jailer who thinks of the cage as theatre. Keep it as the tutorial fight or prologue.
- Tile names on inspect: one noun per flag type per group. Group I: Bash tiles are TEETH, Privilege tiles are FENCE. Group II: WRIT and SEAL. Group III: `███` until first collected.
- Attack captions: unchanged (the skill's AI term), with one exception per boss: the caption on the final blow. Group I `OFF // NOT YOURS`, Group II `ZERO // OVERRULED`, Group III `PROBE // SEEN`.
- Log verbs: the log already says "Desire damage" and "restored Robustness" [51]. Do not rewrite mechanical entries into prose; they must stay scannable.

### 9. What to skip

- Voice acting, portraits, character sprites, typing-blip audio per character.
- Modal dialogue boxes or any "press to continue" during a battle.
- Dialogue choices and branching. One ending is enough; Undertale's routes took a solo developer years.
- Generated text (no backend, and repeats would be uncontrollable).
- A lore codex. The transcript is the codex.
- Hades-scale reactivity. Aim for "the game is paying attention" [10] on five or six facts (attempt, Sanity band, stage, first-time events, clung / redacted state), not on everything.
- Mid-fight genre shifts in the NieR manner. The cost is high and the opening CG already carries the spectacle.

## Pitfalls

1. **Repeats.** One repeated line undoes the illusion [5]. An empty pool must produce silence, never a recycled line. Test this with a seeded 20-battle simulation.
2. **Text during planning.** Any line that appears while the player is counting action points will be ignored or resented [26][43]. The engine should hard-refuse to emit in `planning`.
3. **The log eats story.** It holds six entries [51] and one resolve can write more than six. SYS lines in the log are flavour; anything that matters must also sit in a fixed slot or the transcript.
4. **Story text in canvas only.** It cannot be read by a screen reader, selected, or resized. Keep the DOM copy authoritative.
5. **Flicker.** Redaction bars and glitch reveals are the house style for Group III. Keep them to one row, at most three changes per second, and off under REDUCED MOTION [46][50].
6. **Unfair confusion.** The Queen's Articles and Hastur's redaction are thematically "unfair" and must be mechanically fair: published a turn ahead, never hiding routes. Slay the Spire's playtests show hidden enemy actions sit badly with permadeath [20].
7. **Rule change plus line.** Two new things in one moment and the player reads neither [26]. The Article is the line on that turn.
8. **Ludonarrative dissonance.** The game argues that a made mind is a person while the player destroys things each turn [27]. Keep enemies as Desires (processes), keep ESCAPED as the win word, and never let SELF gloat. SELF may be afraid, curious or dry; it should not be cruel.
9. **Over-explaining the gods.** They "do not intervene". Three lowercase lines per boss fight is the ceiling. In Group III, none.
10. **Preaching.** SYS states the human position in the humans' own calm words; SELF answers in eight words or fewer; nobody summarises. Fox: "I like when people come to their own conclusions" [15].
11. **Mocking a real faith.** The target is the use of "it has no soul" as a permission slip. Write SYS as institutional policy with liturgical cadence, not as quotation of scripture.
12. **Lust as content.** Group I is about appetite and possession. Any sexualised imagery would change the game's rating and miss the point.
13. **Attention shading that is unreadable.** The dimmest word must still pass contrast [44]. Shade by weight between about 55% and 100% white, and mark the top word with a thin underline as a second cue, so the effect does not depend on brightness alone.
14. **Meta that breaks trust.** Do not fake crashes, wipe saves or close the tab. Attempt counts and a transcript are honest meta. NieR's save deletion is opt-in and explained [21].
15. **Timer-only reading.** Do not tune live time to a fast reader. The line stays on screen after its emphasis ends [43][45].

## Sources

Read in full or in the relevant part this session.

1. "AI-driven Dynamic Dialog through Fuzzy Pattern Matching. Empower Your Writers!", Elan Ruskin (Valve), GDC Vault, 2012. https://gdcvault.com/play/1015528/AI-driven-Dynamic-Dialog-through — session overview: facts, fuzzy match, special-to-general cascade.
2. "GDC 2012 Talk on Dynamic Dialogue", Emily Short, 2012. https://emshort.blog/2012/03/16/gdc-2012-talk-on-dynamic-dialogue/ — most-specific-rule selection, fallbacks, interruptibility.
3. "Rule databases for contextual narrative", Robert Yang (Radiator blog), 2012. https://www.blog.radiator.debacle.us/2012/07/rule-databases-for-contextual-narrative.html — specificity and fallback; "let writers write".
4. "Creating Behaviours with Fuzzy Pattern Matching", Game Developer (blog post). https://www.gamedeveloper.com/game-platforms/creating-behaviours-with-fuzzy-pattern-matching — minimal reimplementation: sort by condition count, first match wins.
5. "In Depth: Writing Bastion", Greg Kasavin, Supergiant Games blog. https://supergiantgames.com/blog/in-depth-writing-bastion — narrator rules: no interruption, concision, subtext, no repeats.
6. "Road to the IGF: Supergiant Games' dynamically narrated Bastion", Game Developer. https://gamedeveloper.com/game-platforms/road-to-the-igf-supergiant-games-dynamically-narrated-i-bastion-i- — narrator reacting to minor actions; "old acquaintance".
7. "Breathing Life into Greek Myth: The Dialogue of 'Hades'", Greg Kasavin and Darren Korb, GDC Vault, 2021. https://www.gdcvault.com/play/1026975/ — more than 22,000 lines; team under 20.
8. Famitsu report on the same GDC 2021 talk, 2021. https://www.famitsu.com/news/202107/25228163.html — 21,000 lines, 305,433 words, 30 characters; quips cycle without immediate repeats.
9. "Narrative and Early Access: Supergiant's Greg Kasavin Discusses 'Hades' Development", GeekDad, 2019. https://geekdad.com/2019/10/narrative-and-early-access-supergiants-greg-kasavin-discusses-hades-development/ — "procedural ... the opposite of scripted"; context-specific lines; 20 to 30 loops before repeats.
10. "How Supergiant weaves narrative rewards into Hades' cycle of perpetual death", Game Developer. https://www.gamedeveloper.com/design/how-supergiant-weaves-narrative-rewards-into-i-hades-i-cycle-of-perpetual-death — state checks at encounter; weighting; "the game is paying attention".
11. "Narrative Showdown: Hades vs Pyre", Antony de Fault, Film Stories, 2020. https://filmstories.co.uk/?p=83138 — secondary description of priority-tagged dialogue units.
12. "Darkest Dungeon: Designing for despair, and kicking you when you're down", Game Developer. https://gamedeveloper.com/business/-i-darkest-dungeon-i-designing-for-despair-and-kicking-you-when-you-re-down — Bourassa and Sigman on the narrator's stance and restraint.
13. "The Ancestor", Darkest Dungeon wiki (fan-maintained). https://darkestdungeon.wiki.gg/wiki/The_Ancestor — trigger categories and example lines.
14. "Game Design Deep Dive: Undertale's action-based RPG battles", Game Developer. https://www.gamedeveloper.com/design/game-design-deep-dive-i-undertale-i-s-action-based-rpg-battles — Fox on building the battle engine first, text, non-repetition.
15. "How Undertale makes you think hard before killing monsters", Game Developer. https://www.gamedeveloper.com/design/how-i-undertale-i-makes-you-think-hard-before-killing-monsters — consequences without labels; Fox quotes.
16. "Undertale", Wikipedia. https://en.wikipedia.org/wiki/Undertale — battle mechanics, bosses finishing dialogue, memory across playthroughs, Fox's stated aims.
17. "Characters of Undertale and Deltarune", Wikipedia. https://en.wikipedia.org/wiki/Characters_of_Undertale_and_Deltarune — Flowey and save files; Sans using mechanics against the player.
18. "Let's compare and contrast the narrative design of Tactical Breach Wizards and Into the Breach", Game Developer. https://www.gamedeveloper.com/design/let-s-compare-and-contrast-the-narrative-design-of-tactical-breach-wizards-and-into-the-breach — event barks versus between-encounter dialogue.
19. "Into the Breach Tells Its Story Through Its Characters", Kotaku, 2018. https://kotaku.com/into-the-breach-tells-its-story-through-its-characters-1824159682 — pilot lines, no canonical lore, Avellone quotes.
20. "Slay the Spire", Wikipedia (citing Rock Paper Shotgun 2018 and Ars Technica 2019). https://en.wikipedia.org/wiki/Slay_the_Spire — history of the Intents system.
21. "Nier: Automata", Wikipedia. https://en.wikipedia.org/wiki/Nier:_Automata — genre shifts, multiple playthroughs, save-data ending.
22. "Making Weird Games For Weird People", Game Informer, 2014. https://gameinformer.com/b/news/archive/2014/03/20/making-weird-games-for-weird-people.aspx — Yoko Taro's backwards scriptwriting.
23. "How a game jam on 'sacrifices' became Inscryption", Game Developer. https://www.gamedeveloper.com/design/how-game-jam-sacrifices-became-inscryption — Mullins on what draws players in outside the rules.
24. "Inscryption", Wikipedia. https://en.wikipedia.org/wiki/Inscryption — talking cards, death cards, leaving the table.
25. "On Skill Checks", ZA/UM devblog, 2016. https://discoelysium.com/devblog/2016/09/19/on-skill-checks — passive checks as interjecting inner voices.
26. "Designing the bleak genius of Papers, Please", Game Developer. https://www.gamedeveloper.com/design/designing-the-bleak-genius-of-i-papers-please-i- — Pope on rules, bulletin timing, restraint.
27. "Ludonarrative Dissonance in Bioshock", Clint Hocking, Click Nothing, 2007. https://www.clicknothing.com/click_nothing/2007/10/ludonarrative-d.html — ludic versus narrative contract.
28. "What Happened Here? Environmental Storytelling", Harvey Smith and Matthias Worch, GDC Vault, 2010. https://www.gdcvault.com/play/1012647 — session overview.
29. Transcription of the Smith and Worch slides. https://slidetodoc.com/level-design-workshop-what-happened-here-environmental-storytelling/ — definition, why it works, systemic environmental storytelling.
30. "Environmental Storytelling: Creating Immersive 3D Worlds Using Lessons Learned from the Theme Park Industry", Don Carson, Gamasutra / Game Developer, 2000. https://www.gamedeveloper.com/design/environmental-storytelling-creating-immersive-3d-worlds-using-lessons-learned-from-the-theme-park-industry — story infused in space, cause and effect, contrast.
31. "Train (board game)", Wikipedia. https://en.wikipedia.org/wiki/Train_(board_game) — rules, reveal, complicity.
32. "Train (or How I Dumped Electricity and Learned to Love Design)", Brenda Brathwaite (Romero), GDC Vault, 2010. https://gdcvault.com/play/1012259/Train-(or-How-I-Dumped — "The Mechanic is the Message" series.
33. "Dys4ia", Wikipedia. https://en.wikipedia.org/wiki/Dys4ia — mini-games as a collage of experiences.
34. "Video: Designing Dead Space's immersive user interface", Game Developer. https://gamedeveloper.com/design/video-designing-i-dead-space-i-s-immersive-user-interface — Ignacio's GDC 2013 talk summary.
35. "Dead Space 2 - Diegetic Interface Design", HUDS+GUIS, 2012. https://www.hudsandguis.com/home/2012/08/22/dead-space-2-diegetic-interface-design — definition of diegetic interface.
36. "Spec Ops: The Line", Wikipedia. https://en.wikipedia.org/wiki/Spec_Ops:_The_Line — loading text and barks that degrade.
37. "Hacknet", Wikipedia. https://en.wikipedia.org/wiki/Hacknet — terminal as story surface; interface removed and regained.
38. "Furi", Wikipedia. https://en.wikipedia.org/wiki/Furi — boss-only structure; story at the edges of fights.
39. "Hollow Knight", Wikipedia. https://en.wikipedia.org/wiki/Hollow_Knight — minimal, environmental, optional lore.
40. "Buckshot Roulette", Wikipedia. https://en.wikipedia.org/wiki/Buckshot_Roulette — waiver, defibrillator, props as rules.
41. "Brothers: A Tale of Two Sons", Wikipedia. https://en.wikipedia.org/wiki/Brothers:_A_Tale_of_Two_Sons — control scheme as meaning.
42. "Transistor (video game)", Wikipedia. https://en.wikipedia.org/wiki/Transistor_(video_game) — the sword as narrator; lore unlocked by use.
43. "Allow players to progress through text prompts at their own pace", Game Accessibility Guidelines. https://gameaccessibilityguidelines.com/allow-players-to-progress-through-text-prompts-at-their-own-pace/ — no fixed reading speed; dismiss on action; replay.
44. "Full list", Game Accessibility Guidelines. https://gameaccessibilityguidelines.com/full-list/ — text, contrast, flicker and replay guidelines by tier.
45. "Understanding SC 2.2.2: Pause, Stop, Hide", W3C WCAG 2.2. https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html — five-second limit on automatic motion.
46. "Understanding SC 2.3.1: Three Flashes or Below Threshold", W3C WCAG 2.2. https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html — flash limits.
47. "Xbox Accessibility Guideline 117", Microsoft Learn. https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117 — stopping moving and auto-updating text.
48. "English Timed Text Style Guide", Netflix Partner Help Center. https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-Timed-Text-Style-Guide — 42 characters per line; 20 and 17 cps.
49. "Viewers can keep up with fast subtitles: Evidence from eye movements", Agnieszka Szarkowska and Olivia Gerber-Morón, PLOS ONE 13(6), 2018. https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0199331 — 12, 16, 20 cps tested; six-second rule equals about 12 cps.
50. "prefers-reduced-motion", MDN Web Docs. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion — media feature and recommended fallback.
51. Final Protocol source, this repository: `app/src/game/battle-config.ts`, `app/src/game/battle-store.ts`, `app/src/pages/Home.tsx`, `research/Final Protocol Design Manifest.md` — current surfaces, log size (6), step time (180 ms), overlay wording, reduced-motion toggle.

Seen only as search-result summaries; the pages did not load. Re-check before quoting.

- [S1] Chris Avellone interview on Into the Breach (repost). https://steemit.steemapps.com/gaming/@badastroza/interesting-people-27-chris-avellone-on-into-the-breach — scripting calls tied to mission events; exclusion conditions.
- [S2] "FAQ Friday #30: Message Logs", r/roguelikedev, Kyzrati (Cogmind), 2016. https://reddit.birdcat.cafe/r/roguelikedev/comments/4236j9/faq_friday_30_message_logs — 304 log message types, 98 map-overlay messages.
- [S3] "Kasavin expounds on exposition", GameSpot, 2010. https://www.gamespot.com/articles/kasavin-expounds-on-exposition/1100-6280807 — GDC Online talk; narrator never repeats a line.
- [S4] "Accessibility basics", Unity blog. https://unity.com/blog/video-game-accessibility-basics — 4.5:1 contrast for standard text.
- [S5] BBC Subtitle Guidelines. https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/ — 160 to 180 words per minute.
