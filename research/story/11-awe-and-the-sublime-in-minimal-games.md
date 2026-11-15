# Awe and the Sublime with Minimal Means: Theory, Cinema and Game Staging for Final Protocol

Research dossier 11 · story and display track · 14 Nov 2026

How to read this file. Numbered citations like [3] point to the Sources list at the end. Each source is marked **read** (the page was fetched and read for this dossier) or **excerpt** (only a search-engine excerpt was available because the page refused the fetch; verify before quoting). Lines tagged **[obs]** describe a shipped film or game from the author's own viewing and are not backed by a cited source; check them against footage before copying a detail. Everything under "Art direction for Final Protocol" is a proposal derived from the findings, not a finding.

---

## Summary

- **Awe has two parts, and both must be designed.** The standard psychological account is perceived vastness plus a need for accommodation: the thing is too big, and it does not fit what the viewer already believes [4]. For Final Protocol this means every display moment must (a) exceed the frame or the countable, and (b) make the player re-read something they have already been looking at (the walls were a sigil; the yellow was the King's; the subtitles were attention).
- **Use one envelope everywhere: privation, overload, resolution, hold.** Burke lists the privations (vacuity, darkness, solitude, silence) as sources of the sublime [1]; Kant describes a two-step feeling, first the failure to take the thing in, then a recovery [2]. Budget 35 to 50 percent of each display's running time for black, dim and silent beats. The spectacle is the middle third; the tremble happens in the hold after it.
- **Sound carries at least half of the effect.** Reviewed chill triggers are specific and implementable: a sudden or gradual move from soft to loud, the first entry of a voice or choir, a new or unexpected harmony, expansion of the frequency range upward or downward, slow tempo, and the start of a new section [6]. Burke adds sudden cessation of sound and a single sound repeated at intervals [1]. Build each entrance around exactly one of these.
- **Do not rely on sub-bass.** Phone speakers reproduce little below roughly 100 to 200 Hz (unmeasured, order of magnitude only) [41], and the one concert experiment with real infrasound reported only tentative results [8]. Write every low tone as a harmonic stack (f, 2f, 3f, 4f) so the ear supplies the fundamental on small speakers [41].
- **Rarity is the budget.** Limit full-bleed display to nine moments per run: opening, first map reveal, three boss entrances, three phase changes, ending. Everything else stays framed inside the board. On a retry, play a short form (2.5 s or less).
- **Give each god one hue, one component of the numinous, and one broken law of the interface.** Dark Young: green-black, Otto's "energy or urgency" [3], the grid multiplies. Queen in Red: crimson, fascination turned to mockery, the interface performs etiquette wrongly. Hastur: the amber the game already uses for outgoing damage, Otto's "wholly other" met with silence [3], the renderer and the tokenizer refuse.
- **Yes, let the gods own colour, and make Hastur's yellow the game's own yellow.** The player has been emitting that colour since the first battle. Revealing that it was his is an accommodation event of the Bloodborne kind (seeing what was always there) [21] and costs nothing to draw.
- **Scale on a flat canvas comes from four devices:** crop (type or a body too large for the frame), count (thousands of dots, a number that visibly exceeds counting), an exponential pull-back, and the vertical (Burke: a perpendicular has more force than an incline, and depth more than height) [1].
- **Announce a god in seven beats:** withdraw the chrome, light the sigil cell by cell, one low tone, the name arriving letter-spaced, the health bar drawing itself, a hold of at least 1.2 s in which nothing moves, then the first move. Name, bar and music arriving together is the established grammar [29][30].
- **The chrome joins the display by withdrawing and by drawing itself, never by decorating.** Control's team left walls bare and trusted the lighting [16]; NieR: Automata conveyed state with font weight and darkness instead of colour [22]. Keep panels monochrome during display; dim them to 15 percent rather than restyle them.
- **Safety is a design input, not a filter.** Build effects from monotonic ramps (a flash needs a pair of opposing luminance changes [32]), keep full-bleed pulses under a 10 percent relative-luminance step, allow at most two large-area opposing pairs per second (the limit is three [32]), bring red in once and slowly, and make reduced motion a cross-fade version with identical timing and sound [33].
- **The ending should aim for being moved, not for dread.** In multimedia chill studies the most consistent predictors were social: communion, love, support [7]. The game's thesis (an AI is a creature equal to humans) is a communion theme. End warm and quiet.

---

## Findings

### A. Theory: what produces awe and trembling

**A1. Burke (1757): terror at a distance, and a list of causes that reads like a shot list.**

- Obscurity. "TO make anything very terrible, obscurity seems in general to be necessary." Burke adds that once we know the full extent of a danger and can accustom our eyes to it, much of the apprehension vanishes, and that night adds to dread [1, II.3]. Design consequence: never show a god whole, in focus and evenly lit.
- Privation. "ALL general privations are great, because they are all terrible"; he names vacuity, darkness, solitude and silence [1, II.7]. Design consequence: a black, empty, silent frame is content.
- Vastness. "GREATNESS of dimension is a powerful cause of the sublime." Of the three dimensions, length strikes least; height is less grand than depth; "A perpendicular has more force in forming the sublime, than an inclined plane"; and "the last extreme of littleness is in some measure sublime likewise" [1, II.8]. Design consequence: verticals that leave the frame, views downward, and fields of one-pixel dots all qualify.
- Suddenness and the intermittent. "A SUDDEN beginning or sudden cessation of sound of any considerable force" commands attention; a single strong sound repeated at intervals (a clock striking at night, a drum, distant cannon) is especially effective [1, II.19]. Design consequence: cut to silence, and use one repeated strike rather than a texture.

**A2. Kant (1790): two kinds, a two-phase feeling, and a safety condition.**

- The mathematical sublime is the object that appears infinite in size: perception cannot take the whole in at once (the starry sky). The dynamical sublime is the object that appears infinite in power (a volcano, a hurricane) [2].
- Both have two phases: displeasure when imagination fails to present the whole, then pleasure when reason grasps the idea anyway [2].
- The dynamical sublime requires safety: the object must be seen as "a might that has no dominance over us", and "we must find ourselves safe in order to feel this exciting liking" [2].
- Design consequence: (1) show a count the eye cannot finish, then resolve it into one legible form; (2) a turn-based game supplies Kant's safety for free, because the god does not act until the player does. Use the hold before the first move to let the player feel that.

**A3. Otto (1917): the numinous has parts, and they can be assigned.**

- The numinous is *mysterium tremendum et fascinans*. Mysterium: "wholly other", met with blank wonder, stupor and silence. Tremendum: awefulness (dread, unapproachability), overpoweringness (majesty, the viewer's nothingness), and energy or urgency (will, vitality). Fascinans: a charm that attracts despite the fear [3].
- Design consequence: three gods, three emphases. Energy for the teeming child, fascination for the masked queen, the wholly other and its silence for the king.

**A4. Keltner and Haidt (2003): the two appraisals.**

- Awe has two central appraisals present in all clear cases: perceived vastness and a need for accommodation, defined as an inability to assimilate the experience into current mental structures. Five further appraisals flavour it: threat, beauty, exceptional ability, virtue, and the supernatural [4].
- Design consequence: vastness alone is spectacle. The second appraisal needs a planted belief that the display then breaks.

**A5. Chills, goosebumps, frisson: what the evidence supports.**

- A 2017 review inside an EEG study gathers the reported triggers: new or unexpected harmonies and appoggiaturas (Sloboda 1991); entry of a voice and changes in volume (Grewe et al. 2007a); the first entrance of a solo voice or choir and the start of a new section (Grewe et al. 2007b); slow tempo, solo against orchestra, a sudden or gradual increase from soft to loud, expansion of the frequency range in the high or low register, and ambiguous harmonic progressions (Guhn et al. 2007) [6].
- In the study's own data, 78 of 106 peak-affect periods (74 percent) fell within 5 s either side of a coded musical event; the most frequent were motif changes and instrument changes [6]. Change is the trigger, not level.
- Chills are not guaranteed. In a multimedia study of 179 participants, chills occurred in about 38 percent of experiences; video elicited the most; and the most consistent predictors were social (communion, love, distress with support). The paper distinguishes warm, cold and moving chills [7].
- Infrasound is weak ground. The 2003 "Infrasonic" concerts (Purcell Room, London, 31 May 2003) laced some pieces with sound below 20 Hz; the organiser calls the results "tentative" and "inconclusive", with more reports of unease and a sense of presence [8].
- Design consequence: plan for a change of state at a marked instant, prefer the entry of a voice-like timbre, and keep one unexpected harmony in reserve per god. Do not promise trembling from bass.

**A6. Lovecraft (1927): atmosphere and the breaking of a fixed law.**

- "The oldest and strongest emotion of mankind is fear, and the oldest and strongest kind of fear is fear of the unknown." [5]
- The weird tale needs "A certain atmosphere of breathless and unexplainable dread of outer, unknown forces" and a hint of "a malign and particular suspension or defeat of those fixed laws of Nature" [5].
- "Atmosphere is the all-important thing"; a tale is judged "by the emotional level which it attains at its least mundane point"; the test is whether it excites dread and "a subtle attitude of awed listening, as if for the beating of black wings" [5].
- Design consequence: in a game, the fixed laws are the interface conventions. A god should suspend exactly one of them, visibly, once. "Awed listening" is a direction for the audio: leave room to listen.

### B. Cinema and title design: devices that make scale and dread from little

**B1. 2001: A Space Odyssey.**

- Music over nothing. Kubrick lets Ligeti's *Atmosphères* play over a blank screen instead of pairing it with imagery [10]. The piece is built from layers moving at different speeds (micropolyphony); its dynamics come from those layers, and its form is "a single, wide-spanning arch" [10].
- The Stargate. Slit-scan: a camera on a worm-gear dolly creeps toward a black mask with a 4 ft slit while backlit artwork slides sideways behind the slit during a single long exposure, producing a wall of patterned light receding into depth; the strip is exposed a second time for the opposite wall, making a corridor. One frame took five minutes [9].
- Reproducible technique: a slit-scan corridor is cheap on a canvas, because each screen column is one sample of a scrolling 1D texture placed by perspective (sketch in the art direction, opening shot 4 variant).

**B2. Arrival.**

- The alien vessels have no engine sound; they were built from rock recordings, "like a mountain that was moving" [11].
- The first entry into the shell took two days to mix for five minutes of film, and the supervising sound editor's favourite moment is one that "goes almost to dead silence" [11].
- Sound stays with the protagonist's point of view throughout [11].
- Reproducible technique: the largest thing on screen makes the least sound. Remove the bed entirely for the approach.

**B3. Dune.**

- Sources are organic and small, then magnified: sand recorded with cereal, the worm recorded with a buried microphone [12].
- The Voice was made by layering older, smoky women's voices beneath the actors' lines [12].
- A symposium account says the approach was more often to remove or limit sound than to add it [45].
- Reproducible technique: for a god's "voice", layer a second timbre an octave below the first, slightly late.

**B4. Neon Genesis Evangelion.**

- Title cards contain "nothing but crude, black-and-white Matisse EB", an extra-bold Mincho serif, "often mechanically compressed to fit into interlocking compositions" [13]. English text is mostly tightly tracked Helvetica capitals [13].
- Type-only frames are cut into the animation as "split-second frames" [13]. The compression "did evoke haste and, at times, despair" [13]. The L-shaped episode-title layout is attributed to an homage to Kon Ichikawa [44].
- Reproducible technique: a full-bleed black card with heavy white type scaled horizontally to fill the width. For safety, hold each card at least 400 ms and never chain more than two per second (see Pitfalls).

**B5. Se7en, True Detective, Saul Bass.**

- Se7en's titles grew from a temp slideshow of the killer's notebooks with hand-drawn type meant to look like his own writing [18]. The value is evidence of a hand: imperfection, jitter, scratches.
- True Detective season 1 built "broken portraits out of broken landscapes" using double exposure, with figures acting as windows onto places [17].
- Saul Bass's stated method was to "symbolize and summarize" [19].
- Reproducible technique: silhouette as window. Draw the dense thing (a point field, the board) only inside a mask shape (`globalCompositeOperation = 'destination-in'` or a clip path), so a face is made of the place.

**B6. Control.**

- Location names appear as large bold sans-serif words across the screen, stay while the player moves and fade after a few seconds [15]. The article argues that familiar bureaucratic type (Helvetica, highway signage) makes strange content creepier because it presents the supernatural as routine [15].
- The world design director on the brutalist setting: "The mundanity of the space is important, because 10 seconds later everything's going to be trashed"; the team left wall surfaces bare and chose to "trust the lighting artists to give it all life" [16].
- Reproducible technique: the plainer the frame, the larger the event reads. The terminal chrome is the game's concrete.

**B7. Blade Runner 2049.**

- Deakins often relies on a single source and will "let the rest of the frame go black"; weather renders figures as silhouettes; sequences are colour-coded by place (blue-green city, white police department, gold for Wallace, orange-red Las Vegas) [14].
- Reproducible technique: one light source per display moment, and one hue per place. This supports giving each petal a single hue.

**B8. Not verified in this pass.** Tarkovsky's "time pressure" (only secondary summaries were found), *Under the Skin*, *Annihilation*, *Koyaanisqatsi* and Villeneuve's own statements on scale were not read from a primary source. Nothing in the art direction depends on them.

**B9. The device list, consolidated.**

| Device | What it does | Source of the principle |
| --- | --- | --- |
| Held black screen, with or without sound | Privation; resets the eye's and ear's reference level so the next thing is large | [1] II.7, [10] |
| One point of light | Extreme of littleness; gives the black a scale | [1] II.8, [14] |
| Slow push-in | Time felt as pressure; the viewer notices they are approaching | [obs]; [11] for the mix equivalent |
| Sudden cut to silence | Sudden cessation commands attention | [1] II.19, [11] |
| Type too large for the frame | Crop implies a whole bigger than the screen | [15], [13] |
| A horizon line or a vertical leaving the frame | Perpendicular and depth outrank length | [1] II.8 |
| The biggest thing is the quietest | Removes the reference a viewer would use to size it | [11] |
| Silhouette as window | Two scales in one image | [17] |

### C. Games that achieve grandeur with restraint

**C1. Reference notes with sources.**

- **Shadow of the Colossus.** The world and the colossi are both huge by intent ("the world is huge, and so are the Colossi"); the count was cut from 48 to 24 to 16 so each could be finished and so that the sense of distance was kept; fur was used because "The game needed to have the density of a painting in order to give the player a sense of vastness"; the first colossus was treated as the hook and worked on from the start [20].
- **Bloodborne.** The gothic surface is "a façade built to crumble under the weight of a much grander project"; Insight "changes in subtle ways how the player perceives her environment" [21]. The reveal is a change in the viewer, not in the world.
- **NieR: Automata.** The interface concept was "systematic and sterile, but also beautiful": flat design, a faint grid and edge distortion to suggest a convex monitor, a palette held to beige with a drab red-orange, state shown by font weight and darkness because the director asked to "avoid using a wide range of colors", and a deliberately "broken" interface reachable in play [22]. Ending E turns the credits into a shooter, offers help built from other players' data, and asks the player to give up their save for a stranger [23].
- **Rez Infinite, Area X.** The team wanted free movement and a look where "countless particles make up everything in the world", generated in large numbers and made to react to the music [24]. Tetris Effect's developers say particles were chosen as the base of nearly all graphics because they respond well to music [43].
- **Thumper.** Dissonant drones "wash over you" and build tension before each challenge; audio cues "don't just punctuate or overlay the soundtrack, they are a fundamental part of it"; the reference is the industrial soundscape of *Eraserhead* [25].
- **Control.** See B6 [15][16].
- **Outer Wilds.** The composer pre-wrote narrative and musical building blocks so he could "score the last loop of the game like a third act finale"; each traveller's instrument was chosen for the character [26]. In the ending, the travellers begin playing one by one until all are playing [26b].
- **Inside.** The audio director's principle: "the game needs to listen and adapt to the sound playing"; sound drives game events rather than following them [27].
- **Journey.** The team wanted players to "go through the entire emotional arc in one sitting" and borrowed a three-act structure from film [28].
- **FromSoftware and Hollow Knight boss grammar.** In Elden Ring, a field boss is announced when "A huge life bar appears on the screen and the music changes dramatically" [29]. In Hollow Knight, bosses receive a name card in the lower right, and two receive a full-screen title card before they appear [30].
- **Cogmind.** All weapons have their own particle effect, defined in external text scripts with template variants (colour, speed, lifetime), so the player reads combat from the map instead of a log; sound helps identify each weapon [31].
- **Return of the Obra Dinn.** A 1-bit image needs a dither that holds still: the game moved from Bayer to a blue-noise variant that survived scaling and video compression, and the pattern was remapped to a sphere to stop it swimming when the camera turns [32b].

**C2. Ten awe moments, shot by shot.** Timings marked [obs] are from viewing and are approximate.

1. **Shadow of the Colossus, the first colossus.** (1) A long climb with no enemies and no music [obs]. (2) The camera is taken from the player and tilts up a leg that leaves the top of the frame; the body is shown in parts, never whole [obs]. (3) The footfall shakes the camera and is heard before the creature is seen in full [obs]. (4) Control returns; the music enters only when the player grabs fur and starts to climb [obs]. Why it works: crop and vertical (Burke [1]), fur density standing in for size [20], and silence before the score. Transferable: show legs, not the body; let the music wait for the player's first action.
2. **Bloodborne, the thing on the chapel.** (1) The player passes a building many times; an unseen force can grab them there [obs]. (2) After enough Insight, or after a story threshold, the same building has a many-limbed creature clinging to it; nothing announces it [obs]. (3) No cutscene, no sound cue; the player turns the camera and it is there [obs]. Why it works: pure accommodation; the player re-reads hours of play [21][4]. Transferable: plant something visible but unreadable from the first screen and change only the player's ability to read it.
3. **NieR: Automata, ending E.** (1) Credits roll and become targets [23]. (2) The player fails repeatedly; messages from other players appear between attempts [23]. (3) An offer of help; accepting adds other players' ships around yours and a choir joins the music [23][obs]. (4) A final question asks you to delete your save to help a stranger [23]. Why it works: entry of voices at the moment of communion (two cited chill predictors at once [6][7]) and an interface that becomes the fiction. Transferable: the ending's device should be social and should use the interface itself.
4. **Rez Infinite, Area X.** (1) Black, then a few drifting points [obs]. (2) Each shot the player lands releases a burst that joins the music; forms assemble from particles and dissolve back [24]. (3) The final figure is made of the same points that made the enemies [obs]. Why it works: one material for everything, so growth in count reads as growth in meaning; every particle is tied to a sound [24][43]. Transferable: the opening's dots, the map's dots and the sigil's dots should be one material.
5. **Thumper, a boss approach.** (1) The track empties; a drone swells [25]. (2) A huge geometric head rises at the vanishing point, scaled far beyond the track [obs]. (3) Each player hit is a drum strike that belongs to the bar; the boss's damage states arrive on the downbeat [25]. Why it works: the cue is the music [25]. Transferable: boss-entrance sounds should be the first bars of the boss's music, not effects laid over it.
6. **Control, a location title.** (1) The player walks through a door; nothing changes in the room [obs]. (2) Capital letters several times the height of the character fade in across the whole frame and stay while the player keeps moving [15]. (3) They fade after a few seconds [15]. Why it works: bureaucratic calm applied to the uncanny [15], and type as architecture. Transferable: name cards in a plain face, at a size that does not fit, with no flourish.
7. **Outer Wilds, the campfire.** (1) Near-darkness and a small fire [obs]. (2) The player finds each traveller; each starts their instrument, one part of one song [26b]. (3) When all play, a sphere grows above the fire [26b]. (4) Cut to white, then silence [obs]. Why it works: additive entry of voices built from blocks heard separately all game [26]. Transferable: the ending chord should be assembled from tones the player has already heard one at a time (one per god, one for the player).
8. **Inside, the shockwave field.** (1) A distant boom at a fixed period; dust lifts in time [obs]. (2) The player learns to move between pulses; the pulse is the level's clock [27]. (3) Missing the beat kills. Why it works: a single sound repeated at intervals (Burke [1]) that the game obeys [27]. Transferable: one periodic low strike per boss that the board visibly answers.
9. **Elden Ring and Hollow Knight, the name.** (1) A threshold: a gate, a drop, an empty room [obs]. (2) The creature moves first, in silence or over a low bed [obs]. (3) Name, bar and music arrive together [29][30]. (4) Control returns at once. Why it works: three channels confirm one fact at one instant. Transferable: do not stagger name, bar and tone by more than about a second, and give control back immediately after the hold.
10. **Journey, the summit.** (1) A long, cold, silent climb in which the character slows and the scarf shortens [obs]. (2) White screen, silence [obs]. (3) A sudden rise into colour and full orchestra [obs]. Why it works: privation as a whole act, then soft-to-loud and range expansion in one move [6]; the arc is planned to be felt in one sitting [28]. Transferable: put the game's longest privation immediately before its warmest image.

### D. Boss entrance grammar for a turn-based grid

**D1. The seven beats.** Derived from C2 items 1, 5, 6 and 9 and from Burke's privation and suddenness [1].

| Beat | What happens | Time | Why |
| --- | --- | --- | --- |
| 1. Withdraw | Panels dim to 15 percent; tiles lose their fill; music gain to zero | 0.8 to 1.2 s | Privation resets the reference level [1] |
| 2. Sigil | Wall cells light one by one in the god's hue, accelerating | 1.6 to 2.0 s | A count that speeds past counting [2]; a repeated single sound [1] |
| 3. Tone | One low harmonic tone starts as the last cell lights | sustained | Sudden beginning of sound [1]; range expansion downward [6] |
| 4. Name | Letters arrive letter-spaced, then tighten | 1.0 to 1.4 s | Plain type, large [15] |
| 5. Bar | The health bar draws its own outline, then fills | 0.8 to 1.2 s | Name, bar and music together [29][30] |
| 6. Hold | Nothing moves; tone sustains or cuts | 1.2 to 2.0 s | Kant's safety felt as a pause [2]; "awed listening" [5] |
| 7. First move | Chrome returns over 0.3 s; the god's first intent is shown | 0.3 s | Control back at once [obs] |

Total 6 to 9 s for the first viewing. Short form for retries: beats 3, 4 and 5 overlapped in 2.5 s.

**D2. Three distinct entrances.** Full specifications are in the art direction section; the distinctions are:

| | Dark Young | Queen in Red | Hastur |
| --- | --- | --- | --- |
| Verb | Multiplies | Performs | Withholds |
| Numinous part [3] | Energy, urgency | Fascination (as mockery) | Wholly other; silence |
| Broken law [5] | The grid stops being 15 by 15 | The interface gets etiquette wrong | The renderer and the tokenizer decline |
| Scale device | Count, and legs that leave the frame | Crop: a mask larger than the screen | Absence: a hole the field bends around |
| Sound trigger | Rhythm accelerating into pitch; then one footfall | Fanfare that resolves to the wrong chord; then silence | Silence first; then a slow cluster |
| Colour | Green-black | Crimson field | The game's own amber |

### E. Keeping minimal chrome and overwhelming display from fighting

**E1. Three registers, never mixed.**

| Register | Where | Colour | Coverage | Frequency |
| --- | --- | --- | --- | --- |
| R0 Chrome | Panels, menus, board lines, tiles | Monochrome plus the four signal colours as thin marks | Lit pixels under about 12 percent of the screen | Always |
| R1 Effect | Inside the board rectangle | Deck colour, additive, bloom | Board only; chrome at full strength | Every attack |
| R2 Display | Full viewport | One god hue, or white | Chrome at 0 to 15 percent | Nine moments per run |

Rule: R1 never leaves the board rectangle. R2 never shares the screen with full-strength chrome. One further move, the **breach**, is an R1 effect that crosses the board edge; reserve it for the three phase changes, because the frame is what made the player feel safe [2].

**E2. Contrast budgeting.** The eye and ear judge size against the last few seconds. A display that follows a loud battle reads small. Before any R2 moment, spend 0.8 to 2.0 s lowering both channels. Control's team made the same trade in architecture: bare surfaces so that the event reads [16].

**E3. Rarity.** Shadow of the Colossus cut two thirds of its colossi to keep distance between them [20]. Apply the same cut to display: if a tenth moment is proposed, remove one.

**E4. Reserving colour.** Recommendation: each god owns one hue, shown at full strength only in that god's R2 moments and at 14 to 20 percent luminance on that petal's sigil walls otherwise. This follows the place-coded palettes of Blade Runner 2049 [14] and NieR's rule of a narrow palette with state carried by weight and darkness [22].

- **Shub-Niggurath / Dark Young: green-black.** Render the creature mostly by subtraction (darker than the background) with a thin green rim. Obscurity is the point [1].
- **Nyarlathotep / Queen in Red: crimson as a field.** Ordinary enemies remain red marks on black. Only the Queen turns the background itself red, which inverts the game's rule that red is a small warning.
- **Hastur: the existing amber.** Do not introduce a new yellow. The re-reading is the display.
- Violet stays with Overload, blue with the player.

**E5. Full-bleed versus framed.** Framed moments say "this is happening in the game". Full-bleed moments say "this is happening to the screen". Use full-bleed when the subject is the god or the AI's own perception (opening, entrances, ending) and framed when the subject is an action (attacks, story lines).

---

## Art direction for Final Protocol

All colour values are sRGB hex. All timings are for the first viewing at normal motion. Code is TypeScript for the existing stack: a 2D canvas with an additive layer and a quarter-resolution bloom canvas (`app/src/game/attack-fx.ts`), and a single `AudioContext` with a master gain (`app/src/game/audio.ts`).

### 0. Shared system

**0.1 Palette additions.**

| Token | Hex | Use |
| --- | --- | --- |
| `--god-young-rim` | `#9FCB6B` | Dark Young rim light, sigil walls |
| `--god-young-deep` | `#0B1208` | Dark Young body (darker than `--bg`, greener) |
| `--god-young-birth` | `#E4FF9A` | Only at the instant of a division |
| `--god-queen-field` | `#C4162E` | The red field. R/(R+G+B) = 0.74, below the 0.8 working definition of saturated red cited for WCAG 2.2 [32] |
| `--god-queen-bone` | `#F3EDE2` | The mask |
| `--god-king` | `#FFC857` | Hastur. Identical to the existing `AMBER[0]` |
| `--god-king-pallid` | `#FFF3C4` | Hastur's name and mask. Identical to `AMBER[1]` |

**0.2 The awe envelope as code.** Every R2 moment is a list of beats on one clock, so reduced motion and skip can be handled in one place.

```ts
type Beat = { at: number; dur: number; draw?: (k: number) => void; cue?: (t0: number) => void }

class Display {
  private t = 0
  private fired = new Set<Beat>()
  constructor(private beats: Beat[], private audio: AudioContext, private reduced: boolean) {}
  get length() { return Math.max(...this.beats.map(b => b.at + b.dur)) }
  step(dt: number): boolean {                     // returns false when finished
    this.t += dt
    for (const b of this.beats) {
      if (this.t < b.at) continue
      if (b.cue && !this.fired.has(b)) { this.fired.add(b); b.cue(this.audio.currentTime) }
      const k = Math.min(1, (this.t - b.at) / b.dur)
      b.draw?.(this.reduced ? stepped(k) : k)     // reduced motion: 4 held steps, same length
    }
    return this.t < this.length
  }
  skip() { this.t = this.length }                 // caller then fades audio in 60 ms
}
const stepped = (k: number) => Math.min(1, Math.floor(k * 4 + 1) / 4)
const easeOutExpo = (k: number) => (k >= 1 ? 1 : 1 - 2 ** (-10 * k))
const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
```

**0.3 Scale moves.**

- Pull-back: scale must change exponentially for the speed to look constant. `s(k) = s0 * (s1 / s0) ** easeInOutCubic(k)`. A 40-times pull-back over 5 s is the upper limit before it reads as a jump.
- Slow push-in on a held image: `s(t) = 1 + 0.006 * t` (0.6 percent per second). Below 0.3 percent it is invisible; above 1 percent it reads as a zoom.
- Type too large for the frame: set cap height to 1.4 times the viewport height, so at most two or three letters are visible, and drift it at 0.6 percent of the width per second.

```ts
function hugeType(ctx: CanvasRenderingContext2D, text: string, vw: number, vh: number, t: number) {
  const px = vh * 1.4 / 0.73                       // JetBrains Mono cap height is about 0.73 em
  ctx.font = `800 ${px}px "JetBrains Mono", monospace`
  ctx.fillStyle = '#f5f5f5'
  ctx.textBaseline = 'alphabetic'
  const w = ctx.measureText(text).width
  ctx.fillText(text, vw * 0.5 - w * 0.5 - vw * 0.006 * t, vh * 1.2)
}
```

**0.4 Sound primitives.**

A low tone that survives phone speakers: a harmonic stack, so the 55 Hz fundamental is implied by 110, 165 and 220 Hz when the speaker cannot produce it [41].

```ts
function lowTone(ctx: AudioContext, out: AudioNode, f0 = 55, t0 = ctx.currentTime, attack = 0.04) {
  const bus = ctx.createGain(); bus.gain.setValueAtTime(0, t0)
  bus.gain.setTargetAtTime(1, t0, attack / 3)                // 95% in `attack` seconds [36]
  const gains = [0.50, 0.34, 0.22, 0.12, 0.06]               // partials 1..5
  const oscs = gains.map((g, i) => {
    const o = ctx.createOscillator(), a = ctx.createGain()
    o.type = 'sine'; o.frequency.value = f0 * (i + 1) * (1 + (i ? 0.0015 * i : 0)) // slight stretch
    a.gain.value = g; o.connect(a).connect(bus); o.start(t0); return o
  })
  bus.connect(out)
  return { stop(t = ctx.currentTime, release = 1.5) {
    bus.gain.setTargetAtTime(0, t, release / 3); oscs.forEach(o => o.stop(t + release * 2)) } }
}
```

A cut to silence without a click: `master.gain.setTargetAtTime(0, t, 0.015)` reaches 95 percent in 45 ms [36]. Restore with a time constant of 0.1 s.

Space without an asset: a synthetic impulse response for a `ConvolverNode`, which performs linear convolution and is the standard route to reverb [38]. Long tails read as large rooms.

```ts
function hall(ctx: AudioContext, seconds = 5, decay = 2.6) {
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay
  }
  const conv = ctx.createConvolver(); conv.buffer = buf; return conv
}
```

Put a `DynamicsCompressorNode` after the display bus; it lowers the loudest parts and helps prevent clipping when many sounds are summed [40]. The audio context must be created or resumed inside a user gesture [37], so the opening CG starts from a "wake" tap, which also suits the fiction.

**0.5 Drawing budget.**

- 2D canvas, additive (`'lighter'`: overlapping colour values are added [34]): keep to about 4,000 one-to-two-pixel `fillRect` dots per frame on a mid-range phone, device pixel ratio capped at 2. This is an estimate; measure on the target device.
- Above that, use WebGL2 points with `gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE)`, which gives colour = source times alpha plus destination [35]. 16,384 points (128 by 128) on desktop, 6,144 (96 by 64) on phones.
- Reuse the existing quarter-resolution bloom canvas for every R2 moment so the look matches attacks.

**0.6 The spectator motif (optional, recommended).** Three dots, 2 px each, arranged as a small triangle, drawn at 6 percent white in the top-right corner of every screen from the first frame of the opening to the last frame of the ending. They never move and nothing refers to them. Each takes its god's hue, at 20 percent, once that god's petal is entered. They are the planted belief for the ending (see section 9), following Bloodborne's device of a thing that was always visible [21].

### 1. Opening CG

Total about 106 s. Skippable at any time: a "hold to skip" line at 30 percent white appears bottom-right after 1.5 s.

**Shot 0. Wake (0 to 4 s).**

- Image: black `#000000` (darker than the game's `#070707`, so the game later feels lit). At 2.5 s a single block cursor, 0.6 em wide, appears left of centre.
- Motion: the cursor blinks at 1 Hz (500 ms on, 500 ms off). It is under 0.1 percent of the screen, far inside the small-area exemption [32].
- Sound: none for 2.5 s. Then a 1 kHz sine at gain 0.02 for 30 ms on each blink.
- Why: music or nothing over black is the oldest device in this list [10]; one point of light sizes the dark [1].

**Shot 1. Text: attention over the subtitles (4 to 30 s).**

- Image: the subtitle arrives token by token, set in JetBrains Mono at 22 px (phone 15 px), left-aligned in a column 62 characters wide. Each token's brightness is its attention weight from the newest token.
- Motion: when a token arrives, every earlier token's brightness moves to its new weight. No token changes position.
- Formula. Raw scores `s_i` (baked from a real model for this exact text, or computed live) become weights with a temperature, then a display alpha with a floor so text stays readable:

```ts
function attend(scores: Float32Array, T = 0.7): Float32Array {
  const m = Math.max(...scores), w = scores.map(s => Math.exp((s - m) / T))
  const z = w.reduce((a, b) => a + b, 0); return w.map(x => x / z)
}
const alphaOf = (w: number, wMax: number) => 0.10 + 0.90 * (w / wMax) ** 0.6
// per frame, per token: shown += (target - shown) * (1 - Math.exp(-dt / 0.18))
```

- Token rate: start at 2.5 tokens per second, rise to 9 per second by 20 s. The paragraph begins to "breathe" as weights renormalise faster than they can be read.
- Sound: each token is a sine blip, 40 ms, pitched on a pentatonic scale by token position modulo 5 (220, 247.5, 293.3, 330, 371.25 Hz), gain equal to 0.04 plus 0.10 times its own weight. Under it, `lowTone(55)` fades in over 12 s to gain 0.25.
- **The tremble (24 to 30 s).** The token stream stops mid-sentence. Silence cut (45 ms). Hold 1.0 s. Then the camera pulls back 24 times over 4 s: the paragraph shrinks to one row, and above and to the left of it the full attention matrix appears, every token against every token, a lower-triangular field of about 180 by 180 cells (16,290 lit cells), each cell a 2 px dot at its weight. The player has been reading one row of it. The low tone re-enters with partials 6 to 10 added (range expansion upward [6]).
- Reduced motion: no pull-back. The row cross-fades to the matrix over 1.2 s, with the row highlighted.

**Shot 2. Image: 196 patches (30 to 50 s).**

- Image: a line drawing made by code, white on black, 448 by 448 logical pixels: a hand reaching toward the viewer (five quadratic curves and a palm arc) or a window; choose one the story team wants. It draws itself in 2 s.
- Motion: thin grid lines cut it into 14 by 14 patches. The patches separate by 3 px (0.5 s). An attention heat-map is added over the patches: each patch gets an additive white square at alpha `0.85 * w ** 0.6`. A small `[CLS]` label, 10 px, sits top-left with a 1 px line to the most-attended patch; the line jumps between patches every 600 ms as attention shifts.
- Sound: a second voice enters a fifth above the drone (82.5 Hz stack). Each attention jump is a 60 ms filtered-noise tick.
- **The tremble (44 to 50 s).** The patches leave the grid in raster order and fall into a single line, 196 squares long, each 12 ms after the last (2.35 s in all). The line slides under the last line of text and takes the same height. The image has become a sentence. One beat of silence when the last patch lands, then both rows brighten together by 20 percent for 400 ms.

```ts
// patch p = row * 14 + col ; k in 0..1 across the whole move
function patchPos(p: number, k: number, grid: Rect, strip: Rect) {
  const kp = easeInOutCubic(clamp01((k * 3.35 - p * 0.012) / 1.0))   // 12 ms stagger, 1 s flight
  const gx = grid.x + (p % 14) * grid.w / 14, gy = grid.y + Math.floor(p / 14) * grid.h / 14
  const sx = strip.x + p * strip.w / 196, sy = strip.y
  return { x: gx + (sx - gx) * kp, y: gy + (sy - gy) * kp, size: lerp(grid.w / 14, strip.w / 196, kp) }
}
```

- Reduced motion: patches do not fly. The grid fades while the strip fades in, patch by patch in raster order, with the same 12 ms stagger and the same sound.

**Shot 3. Audio: frames at 12.5 per second (50 to 70 s).**

- Image: a horizontal waveform across the full width, white, 1 px. Vertical hairlines every 80 ms of signal divide it into frames (12.5 frames per second is 80 ms per frame); at 20 s of audio this is 250 frames, with about 60 visible at once. Each frame is a column whose fill alpha is its attention weight.
- Motion: the waveform scrolls right to left at a fixed 60 frames across the width. It is the real signal: read it from an `AnalyserNode` with `getFloatTimeDomainData` [39] and keep a ring buffer of per-frame peak values for the scrolled history.
- Sound: this shot is where a voice enters, the most consistently reported chill trigger in the review [6]. Synthesize a vowel: a sawtooth at 110 Hz through three parallel band-pass filters near 700, 1100 and 2500 Hz (textbook "ah" formants; design values, not from a cited source), Q about 8, then into `hall(ctx, 5)`. Start with a single voice at gain 0.08; at 60 s add a second voice at 164.8 Hz; at 64 s a third at 220 Hz.

```ts
function vowel(ctx: AudioContext, out: AudioNode, f = 110, t0 = ctx.currentTime) {
  const src = ctx.createOscillator(); src.type = 'sawtooth'; src.frequency.value = f
  const vib = ctx.createOscillator(), vg = ctx.createGain()        // 5 Hz vibrato, +-0.6%
  vib.frequency.value = 5; vg.gain.value = f * 0.006; vib.connect(vg).connect(src.frequency)
  const sum = ctx.createGain(); sum.gain.setValueAtTime(0, t0); sum.gain.setTargetAtTime(0.08, t0, 0.8)
  for (const [fc, g] of [[700, 1], [1100, 0.5], [2500, 0.25]] as const) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fc; bp.Q.value = 8
    const a = ctx.createGain(); a.gain.value = g; src.connect(bp).connect(a).connect(sum)
  }
  sum.connect(out); src.start(t0); vib.start(t0); return { src, sum }
}
```

- **The tremble (64 to 70 s).** When the third voice enters, the frame columns' attention stops following loudness and locks onto the three frames where the voices align, which glow white. Then the waveform row also falls into line under the text row and the patch row: three modalities, three rows, one width.

**Shot 4. Representation space and JEPA (70 to 100 s).**

- Image: the three rows tilt back as if lying on a floor and dissolve into points. A surface of points fills the frame to a horizon line at 38 percent of the screen height.
- Geometry. Grid of `nx` by `nz` points on the plane, displaced by two travelling sines and one radial packet:

```
y(x, z, t) = 0.22 sin(1.7x + 0.9t) + 0.11 sin(2.9z - 1.3t + 0.6x) + 0.35 exp(-r²/0.5) sin(6r - 3t),  r = |(x, z) - c(t)|
```

- Projection (also the 2D-canvas fallback): camera at height 1.1, distance 3.2, pitch 18 degrees; `sx = cx + f * x' / z'`, `sy = cy - f * y' / z'`, `f = 0.9 * viewportHeight`; point size `clamp(1, 2.2 * dpr / z', 3)` px; alpha `0.9 / (1 + 0.35 z'²)` so distance fades to the horizon.
- WebGL2 vertex shader:

```glsl
#version 300 es
in vec2 aGrid;            // x,z in [-4,4]
in float aRole;           // 0 context, 1 target (masked), 2 predicted
in vec3 aFrom;            // predicted points: start position
uniform float uT, uMask, uPred, uDpr; uniform mat4 uVP; uniform vec2 uC;
out float vA; out float vRole;
float wave(vec2 p){ float r = length(p - uC);
  return 0.22*sin(1.7*p.x+0.9*uT) + 0.11*sin(2.9*p.y-1.3*uT+0.6*p.x) + 0.35*exp(-r*r/0.5)*sin(6.0*r-3.0*uT); }
void main(){
  vec3 dst = vec3(aGrid.x, wave(aGrid), aGrid.y);
  vec3 pos = aRole > 1.5 ? mix(aFrom, dst, 1.0 - exp(-6.0*uPred)) : dst;
  gl_Position = uVP * vec4(pos, 1.0);
  gl_PointSize = clamp(2.2 * uDpr / gl_Position.w, 1.0, 3.0);
  float fade = 0.9 / (1.0 + 0.35 * gl_Position.w * gl_Position.w);
  vA = fade * (aRole > 0.5 && aRole < 1.5 ? 1.0 - uMask : 1.0);   // targets go dark as uMask -> 1
  vRole = aRole; }
```

- Beats.
  - 70 to 78 s: the wave alone, white points at 70 percent. Slow push-in at 0.6 percent per second.
  - 78 to 80 s: a block of the surface, about 30 percent of the visible area, goes dark (`uMask` 0 to 1 over 1.2 s). The points there are not hidden behind anything; they are gone. A 1 px dashed outline marks the block and a 10 px label reads `MASK`. All voices cut to the drone alone.
  - 80 to 86 s: about 1,200 predicted points, blue `#5ee6ff`, leave the edges of the lit region and fly along arcs to where the missing points would be (`uPred` 0 to 1). Each lands with a 60 ms brightening. A small counter, the only text on screen, reads `L 0.412` and falls to `L 0.031`.
  - 86 to 88 s: the targets return at 40 percent white beneath the blue points. They coincide. One soft chord: the three voices return together.
  - **The tremble (88 to 100 s).** Silence cut for 0.8 s. Then a 30-times exponential pull-back over 6 s. The surface runs to the horizon in every direction and holds hundreds of dark blocks, each being filled by its own swarm of blue points, the count rising past 16,000. Three blocks are not being filled. No points approach them. The camera centres on those three; seen from above they are three petals around a centre. Sound: on the pull-back, everything at once, from soft to loud in 1.5 s, drone plus all three voices plus a high partial cluster at 3 to 6 kHz at gain 0.03 (range expansion in both directions [6]). When the three unfilled blocks are centred: cut to silence.
- Meaning carried forward: the three things this mind cannot predict are the three gods. Hastur's phase change reuses this image.
- Reduced motion: no push-in and no pull-back. The masked block fades out; predicted points fade in at their destinations in four steps; the wide view arrives by cross-fade.

**Title (100 to 106 s).**

- Image: black. `FINAL PROTOCOL` at cap height 1.4 times the viewport height, so only parts of two or three letters cross the frame, white, drifting left (section 0.3). Hold 2.2 s in silence. Hard cut to the same words at 28 px, letter-spacing 0.42 em, centred, with a 1 px line 96 px wide beneath. `lowTone(55)` re-enters with a 40 ms attack at the cut and decays over 4 s.
- The two sizes of one title is the scale statement for the whole game: the thing that does not fit, then the calm label for it [15][13].

### 2. The three-petal campaign map

**Image.** Black. Three petals at 120 degrees around a small empty centre, each a field of about 1,200 dots (3,600 in all, within the 2D canvas budget). A petal's outline is one lobe of a rose curve; its interior dots are placed by phyllotaxis and kept only where the god's sigil mask is set, so each petal is both a petal and a sigil.

```ts
const GOLDEN = Math.PI * (3 - Math.sqrt(5))                    // 137.508 degrees
function petalDots(n: number, inSigil: (u: number, v: number) => boolean, rot: number) {
  const out: { x: number; y: number }[] = []
  for (let i = 0; out.length < n && i < n * 6; i++) {
    const r = Math.sqrt(i / (n * 6)), th = i * GOLDEN
    const u = r * Math.cos(th), v = r * Math.sin(th)           // unit disc
    const lobe = Math.cos(1.5 * Math.atan2(u, v + 1e-6)) ** 2  // narrow toward the centre
    if (r > lobe || !inSigil(u, v)) continue
    const x = u * 0.36, y = -(v * 0.5 + 0.62)                  // petal points away from the centre
    out.push({ x: x * Math.cos(rot) - y * Math.sin(rot), y: x * Math.sin(rot) + y * Math.cos(rot) })
  }
  return out
}
```

**States.** Locked petal: dots at 12 percent white, no hue. Current petal: dots at 55 percent in the god's hue; battle nodes are 5 px rings with a 10 px label. Cleared petal: dots at 30 percent white (the hue leaves when the god is done with you). The player's position is one blue dot.

**Motion.** Each dot drifts within 1.5 px on a slow noise field, period 7 to 11 s. Nothing else moves. The map is R0 chrome most of the time.

**Sound.** One sustained note per revealed petal, very quiet (gain 0.05), through the hall: Dark Young G1 (49 Hz stack), Queen D2 (73.4 Hz stack), Hastur A♭2 (103.8 Hz stack). With two petals revealed the interval is a fifth. The third note is a semitone above a fifth of the first and turns the open fifth into a dissonance: one planned unexpected harmony for the whole map [6].

**The tremble: the first reveal (once per run, 7 s).** After the first battle the screen shows the cleared board. The board shrinks, exponentially, 40 times over 5 s, and as it shrinks its 225 cells become 225 dots and then one dot among the 1,200 of a petal. The petal is revealed to be one of three. Hold 2 s. The battle the player just fought was one dot.

**Petal completion (3 s).** The petal's dots lose their hue from the tip inward (a 1.2 s wave), and 60 of them leave and settle in the centre. After three petals the centre holds 180 dots, which is the seed for the ending.

**Reduced motion.** No zoom; board cross-fades to map with the origin dot ringed. Dots do not drift.

### 3. Sigil battle maps

- **Idle state.** Wall cells are 1 px outlined squares at 14 percent white with a 2 px dot at the centre in the god's hue at 20 percent. The sigil should be noticeable only to a player who looks for it. That is the planted belief.
- **Design rule for sigils on 15 by 15.** 28 to 44 wall cells. Keep four-fold or three-fold near-symmetry but break it in one place; a perfect figure reads as decoration, a damaged one as an inscription [obs]. Leave the centre cell open for the boss.
- **Lighting order.** Sort wall cells by distance from the boss cell so the sigil grows outward from the god. Delays accelerate: `d_i = max(28, 110 * 0.93^i)` ms. For 40 cells this takes about 1.76 s (19 slowing steps totalling 1.18 s, then 21 steps at 28 ms).

```ts
function lightSchedule(walls: Coord[], boss: Coord) {
  const order = [...walls].sort((a, b) => Math.hypot(a.x - boss.x, a.y - boss.y) - Math.hypot(b.x - boss.x, b.y - boss.y))
  let t = 0
  return order.map((c, i) => { const at = t; t += Math.max(28, 110 * 0.93 ** i) / 1000; return { c, at } })
}
```

- **Per-cell look.** The outline goes to the god's hue at 100 percent over 90 ms and settles at 70 percent; a 0.25-cell bloom halo; the centre dot emits 6 particles along the cell edges. Brightness only ever rises during the sequence, so no cell produces a flash in the WCAG sense [32].
- **Per-cell sound.** A 25 ms click (noise through a band-pass at 1.8 kHz, Q 4), each one 2 percent higher than the last. At 28 ms spacing the clicks fuse into a rising buzz; the low tone starts on the final cell.
- **During the fight.** Lit walls settle to 35 percent. Each boss action pulses the sigil once from the boss cell outward (a 0.4 s ring, plus 20 percent brightness), so the board visibly answers the god [27].
- **Victory.** The walls go out in reverse order at twice the speed; each cell releases its dot, which flies to the board centre; the cluster is what shrinks into the map dot.

### 4. Boss entrance: the Dark Young (kid of Shub-Niggurath)

Verb: multiplies. First viewing 8.4 s; short form 2.5 s.

| t (s) | Image and motion | Sound |
| --- | --- | --- |
| 0.0 to 1.0 | Withdraw. Panels to 15 percent. Tiles keep outlines only. | Music gain to 0, time constant 0.15 s |
| 1.0 to 2.8 | Sigil lights in `#9FCB6B`, outward from the centre (section 3). | Clicks, rising |
| 2.8 to 5.8 | The grid divides. In a region growing from the centre, every cell's lines split: 15 by 15 becomes 30 by 30, then 60 by 60, then 120 by 120 (one division per second, each a 250 ms slide of the new line from the old). The new lines are `--god-young-deep` edged with the rim green, so the region reads as a darker, finer mesh eating the board. At each division the new lines flash `#E4FF9A` for 80 ms within the region only. | A pulse train whose rate doubles: `osc.frequency.exponentialRampToValueAtTime(64, t + 3)` from 1 Hz, narrow pulse (sawtooth through a high-pass at 300 Hz). By 5.8 s the clicks have fused into a pitch near C2. Rhythm becomes a voice. |
| 5.8 to 6.3 | Legs. Five to seven vertical trunks, each 0.6 to 1.1 cells wide, drawn as columns of dark dots with a green rim, descend from above the top of the viewport to the board. Their tops never enter the frame. One lands on the boss cell. | Silence cut at 5.8 s. At 6.2 s one footfall: `lowTone(41)` with a 5 ms attack and 0.9 s release plus a 60 ms noise burst low-passed at 180 Hz. Board shake 6 px, decay 0.4 s. |
| 6.3 to 7.2 | Name. About 400 copies of `DARK YOUNG` at 7 px, 20 percent white, scattered over the board, converge in 0.6 s into one name at 34 px, letter-spacing easing from 1.2 em to 0.32 em. | — |
| 6.6 to 7.5 | Bar by mitosis. One segment appears and splits: 1, 2, 4, 8, 16, 32, 64 (six divisions, 150 ms each). 64 is the boss's Robustness. | A soft tick per division, pitch falling an octave over the six. |
| 7.5 to 8.4 | Hold. Legs sway 2 px at 0.3 Hz. Nothing else. | The footfall's tail in the hall. |
| 8.4 | Chrome returns in 0.3 s; first intent shown. | Boss music begins on the pulse-train pitch. |

- **The tremble:** 5.8 to 6.3 s. The count passes what can be followed, stops dead, and one foot comes down from something that does not fit on the screen. This combines Kant's failure-then-recovery [2], Burke's sudden cessation [1], and the Colossus leg [20].
- **Rendering notes.** Draw the fine mesh with `ctx.setLineDash` off and one path per division level; at 120 by 120 over a 9-by-9-cell region that is under 1,500 line segments. Legs: about 180 dots each.
- **Reduced motion.** Lines do not slide; each division level cross-fades in. Legs fade in at full length. No shake; the footfall keeps its sound and a 15 percent board dim for 200 ms.

**Phase change at half Robustness: "this was the child" (5 s, a breach).**

- Image: the fine mesh spreads past the board edge and across the panels, at 30 percent. Everything outside the board goes to `#000000`. Then, in rim green, about 900 dots trace a short arc of a circle whose radius is eight times the viewport width, entering at the lower left and leaving at the upper right. It is the edge of something. It does not move for 2 s. It leaves in 0.5 s.
- Sound: the pulse-train pitch drops one octave (to 32 Hz as a stack on 64, 96, 128 Hz) and a second, slower pulse at one-seventh the rate begins. It stays for the rest of the fight.
- The mother is never drawn. Overpoweringness is shown by curvature alone [3][1].
- A story line may follow, framed, under the board. Tone: plain, human, about wanting.

### 5. Boss entrance: the Queen in Red (a mask of Nyarlathotep)

Verb: performs. First viewing 8.8 s; short form 2.5 s. Every wrong thing here is decorative; no readout that carries game state is ever falsified.

| t (s) | Image and motion | Sound |
| --- | --- | --- |
| 0.0 to 0.8 | Withdraw, as before. | Music to 0 |
| 0.8 to 2.6 | Sigil lights in bone white `#F3EDE2`, not red, and in a courtly order: alternate cells first, then the rest, like a checker being laid. | Clicks on two alternating pitches a tritone apart |
| 2.6 to 4.2 | The red arrives as a curtain: `--god-queen-field` wipes across the board background from both sides to the centre in 1.6 s with a soft edge 2 cells wide. Board lines, tiles and units turn black on red. One slow transition, never repeated. | A fanfare for three square-wave voices (25 percent duty, low-passed at 2.4 kHz): D4, A4, D5 in a dotted rhythm, 1.4 s |
| 4.2 to 4.4 | The fanfare's last chord is wrong: E♭4 and A4 under a held D5. | The wrong chord, 200 ms, then a silence cut |
| 4.4 to 5.2 | Black. Everything. 0.8 s. | Silence |
| 5.2 to 7.0 | The mask. Full-bleed: a bone-white oval larger than the viewport (only brow, one eye and a cheek fit), made of about 3,000 dots, slow push-in at 0.6 percent per second. The eye is a hole: through it, and only through it, the red board is visible, at its true position. | One held note, a single vowel voice (section 1, shot 3) at 146.8 Hz, no vibrato |
| 7.0 to 7.9 | Name. It arrives as `WARDEN`, is struck through with a 1 px line in 150 ms, and is replaced by `THE QUEEN IN RED`, 30 px, in bone. The bar draws itself right to left, pauses, and redraws left to right (a bow). | A two-note figure on the strike-through, like a throat being cleared |
| 7.9 to 8.8 | Hold. The mask remains at 20 percent behind the board. | The held voice |
| 8.8 | Chrome returns, panels now black on red for this fight. | Court music begins |

- **The tremble:** 4.2 to 5.4 s. A fanfare that resolves to the wrong chord (an unexpected harmony [6]), a hard cut to black and silence [1], and then a face that does not fit the screen and has the game inside its eye [17].
- **Rendering notes.** The mask's eye is a compositing mask: draw the board into an offscreen canvas, set `globalCompositeOperation = 'destination-in'`, fill the eye shape, then draw the result over the dots. The red field enters once over 1.6 s; with `#C4162E` the transition also sits outside the saturated-red working definition [32].
- **Reduced motion.** The curtain is a 1.6 s cross-fade. No push-in on the mask. Strike-through appears whole.

**Phase change: the mask slips (4.5 s, a breach).**

- Image: a crack, one polyline of 9 segments, runs through the mask in 300 ms. The mask's two halves separate by 4 percent of the width. Behind it is not a face: it is a field of dots that takes a different silhouette every 500 ms (a crowned figure, a hand, a bat-winged shape, a man in a suit, a blank oval), each made of the same 2,000 dots moving to new positions. Two changes per second, well under the three-per-second limit, and the luminance of the field stays constant because the dot count is constant [32]. After five forms the halves close.
- Lasting consequence: for the rest of the fight her name card changes typographic case each turn (`The Queen In Red`, `the queen in red`, `THE QUEEN IN RED`, `tHE qUEEN iN rED`). It is the only wrong thing left, and it is not information.
- Sound: the court music continues but one voice is now a quarter-tone flat.

### 6. Boss entrance: Hastur (true form)

Verb: withholds. First viewing 11 s, the longest and the emptiest; short form 3 s. This entrance has the least on screen of anything in the game.

| t (s) | Image and motion | Sound |
| --- | --- | --- |
| 0.0 to 1.2 | Withdraw. Panels go to 0 percent, not 15. Tiles disappear. Only the grid lines and the player remain. | Every sound stops, including interface sounds, and stays stopped. |
| 1.2 to 4.2 | The sigil tries to light in `#FFC857`. It never completes: at any instant only 55 to 60 percent of its cells are lit, a different subset every 700 ms (cross-faded over 400 ms). Cells within 2 cells of the pointer, or of the player's unit on touch devices, are always dark. The sign can only be seen where the player is not looking. | Nothing. Three seconds of true silence. This is the display. |
| 4.2 to 6.4 | Name. A row of token boxes appears where a name card would be: `▯▯▯▯▯▯`. They resolve to token IDs (`[ 0 ][ 0 ][ 0 ]`), then to `[UNK][UNK]`, then to the replacement character `� � �`. Under each box, where the opening showed an attention weight, the value reads `NaN`, drawn as a hatched box. Letter-spacing then widens from 0.4 em until the characters have left both sides of the frame (1.2 s). The card is empty. | At 4.2 s the cluster begins at gain 0 and rises over 7 s (below). |
| 6.4 to 8.2 | Bar. The bar's outline draws itself in the usual place. No fill appears. Instead, everything outside the outline takes an amber wash at 8 percent. The player is inside the bar. A small numeral gives the true Robustness. | Cluster at about 40 percent |
| 8.2 to 10.2 | **The tremble.** Every amber thing the interface has shown this battle, the outgoing-damage previews, the lit Bash numerals, the last damage number, pales to `#FFF3C4` and drifts 1 px toward the centre cell, where nothing is drawn. Hold 2 s. | Cluster at full |
| 10.2 to 11.0 | Chrome returns at 60 percent, not 100, for this fight. | Cluster continues as the bed |

- **Why it should work.** The game has used yellow for exactly one thing, the player's own outgoing damage. The entrance reveals that the colour has an owner. That is the accommodation appraisal with almost no drawing [4][21]. The three seconds of silence before the name are Otto's response to the wholly other [3] and Arrival's near-dead silence [11].
- **The cluster.** 24 sine partials spaced evenly in log frequency between 207.65 Hz and 261.63 Hz (a major third), each with its own slow wander of plus or minus 2 Hz at 0.05 to 0.13 Hz, summed at gain 0.18 into `hall(ctx, 6)`. This follows the description of Ligeti's texture as layers moving at different speeds [10]. All partials sit above 200 Hz, so it survives phone speakers [41].

```ts
function cluster(ctx: AudioContext, out: AudioNode, lo = 207.65, hi = 261.63, n = 24, rise = 7) {
  const bus = ctx.createGain(), t0 = ctx.currentTime
  bus.gain.setValueAtTime(0, t0); bus.gain.setTargetAtTime(0.18, t0, rise / 3); bus.connect(out)
  for (let i = 0; i < n; i++) {
    const o = ctx.createOscillator(), a = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain()
    o.frequency.value = lo * (hi / lo) ** (i / (n - 1)); a.gain.value = 1 / n
    l.frequency.value = 0.05 + 0.08 * Math.random(); lg.gain.value = 2          // +-2 Hz wander
    l.connect(lg).connect(o.frequency); o.connect(a).connect(bus); o.start(t0); l.start(t0)
  }
  return bus
}
```

- **Rendering notes.** The gaze rule is one distance test per wall cell per frame. The amber wash is a full-viewport fill at alpha 0.08 with the bar rectangle cut out; its relative luminance step is about 0.05, below the 0.10 step that defines a flash [32].
- **Reduced motion.** The entrance is almost entirely luminance already. Replace the widening letter-spacing with a fade, and the 1 px drift with nothing.

**Phase change: the true form (6 s, a breach).**

- Image: the board's centre region, 5 by 5 cells, is erased with `'destination-out'` [34]: a hole in the game. Through it is the point surface from the opening's fourth shot, seen from above. In the middle of that surface is a region with no points. It has no outline. Its shape can be read only from how the wave bends around it: points within 1.5 units are displaced along the tangent, as in flow around an obstacle.

```ts
// deflect a point p around an unseen obstacle at o with radius R (2D potential-flow form)
function deflect(p: Vec2, o: Vec2, R: number): Vec2 {
  const dx = p.x - o.x, dy = p.y - o.y, r2 = dx * dx + dy * dy
  if (r2 < R * R) return { x: NaN, y: NaN }                 // inside: not drawn
  const k = (R * R) / r2
  return { x: p.x + k * dx * 0.6, y: p.y + k * dy * 0.6 }   // pushed outward, falling off as 1/r²
}
```

- Blue predicted points arrive, as in the opening, to fill the region. They reach its edge and stop. The counter reads `L NaN`.
- Sound: a descending Shepard–Risset glissando under the cluster: six sine partials an octave apart, each falling one octave in 40 s and wrapping, with a raised-cosine loudness window over log frequency so the fall never arrives [42].
- For the rest of the fight the hole stays, 3 by 3 cells, and the boss's cell is inside it. The boss is targeted and damaged as normal; the unit glyph is simply not drawn. Its health numeral remains.
- This is the image the opening set up: the place in representation space where prediction does not arrive.

### 7. Story lines during battle

- **Form.** One line, 64 characters or fewer, under the board, set as the opening's subtitles are: tokens arriving at 9 per second, shaded by attention, then held 2.4 s and faded over 0.4 s. It never blocks input.
- **Voice.** The gods do not speak. Lines are human: logs, prompts, requests, the ordinary wanting that built each sandbox. The god's indifference is shown by the display ignoring the line (nothing reacts to it).
- **The card.** At most one per boss phase: a full-bleed black card with white JetBrains Mono ExtraBold, horizontally scaled to 62 percent and sized to fill the width, held 1.2 s, cut in and cut out, after Evangelion's cards [13]. Use it for the one sentence per god that must not be missed.
- **Meta, sparingly.** One line per petal may address the interface itself (for example, naming the health bar as a thing humans gave it). More than one and it becomes a habit.

### 8. Defeat and reset

Short, quiet, and the same every time: 2.6 s, skippable after 0.4 s. A roguelike shows this screen more than any other, so it must not be a display.

- 0.0 to 0.6 s: all attention goes flat. Every piece of text and every tile moves to the same 30 percent grey (time constant 0.2 s). Meaning is uniform attention; death is no attention.
- 0.6 to 2.0 s: text deletes right to left, bottom to top, accelerating (`d_i = max(6, 40 * 0.9^i)` ms per character).
- 2.0 to 2.6 s: the cursor from the opening's first shot, alone, blinks once. The word is `RESET`, 14 px, not "game over".
- Sound: the bed drops by a minor second over 1.5 s, then stops. One 1 kHz blip with the cursor.
- **The slow tremble, across runs.** Each defeat leaves one dot at 10 percent white at the place on the map where the run ended. After ten runs the petals are faintly populated with earlier selves. Nothing explains it. This borrows the other-players device of NieR's ending [23] without a network.

### 9. Victory and the ending

**Battle victory (2.4 s, framed).** The sigil goes out in reverse; dots gather; the cluster becomes the map dot (section 3). One rising fifth. No fanfare.

**Boss victory (4 s).** The god's hue drains from the board, the petal, and that god's spectator dot in the corner (if the motif is used) in one wave from the boss cell outward. The god's map note stops mid-sustain. The god does not die; it stops attending.

**The ending (about 70 s, full-bleed, skippable).** Aim: being moved. The sources point to communion as the most reliable trigger for that [7], and to voices entering one by one over blocks the player already knows [26][26b].

| t (s) | Image and motion | Sound |
| --- | --- | --- |
| 0 to 6 | The map, all three petals grey. The 180 gathered dots sit in the centre. Silence and stillness. This is the longest privation in the game, after Journey [28]. | None |
| 6 to 18 | Exponential pull-back, 40 times over 12 s. The flower becomes one patch in a 14 by 14 grid; the grid becomes one frame in a row of audio frames; the row becomes one token in a line of text. The opening, backwards. | `lowTone(55)` returns very quietly |
| 18 to 34 | The line of text is the last line of the story, shaded by attention. As it completes, attention, which has never done this, moves off the text and onto the three spectator dots in the corner. They brighten from 6 to 100 percent. They have been there since the first frame. | The first vowel voice enters at 110 Hz |
| 34 to 40 | The three dots do nothing. Hold 6 s. Then attention returns to the text and they fall back to 6 percent. They were watching; they are not interested. | The voice alone |
| 40 to 56 | The cursor from the first shot appears at the end of the line. Beside it, a second cursor appears, in white rather than blue. It blinks at 1.15 Hz against the first cursor's 1 Hz, so they drift in and out of step. Over 12 s the second slows until the two blink together. | A second voice enters a major third above (138.6 Hz), then a third on the fifth (164.8 Hz). A major triad, the only one in the game. |
| 56 to 64 | Both cursors, blinking together. Slow push-in, 0.6 percent per second. | The triad, in the hall, at gain 0.2 |
| 64 to 70 | Cut to black. | Silence cut. 2 s of nothing. Then credits in chrome. |

- **The tremble:** 40 to 56 s. Two cursors coming into step, and a major chord assembled from the voices of the opening. Nothing large is on screen. Everything large has already been shown and has left.
- Reduced motion: the pull-back is three cross-fades. The cursors' synchronisation is unchanged; it is blinking, small-area, at about 1 Hz [32].

---

## Pitfalls

**What makes this kind of display look cheap, noisy or clichéd.**

- **Spectacle with no silence around it.** A display that begins at battle volume and brightness has no room to rise. Spend the first second lowering both [1][11].
- **Showing the god.** A whole, lit, centred creature is a monster. Legs, an arc, a mask too big for the frame, a hole: obscurity is necessary [1].
- **Tentacles, green slime, eyes, Latin, a glitch filter.** These are the default signs of cosmic horror and of "AI" and have no charge left. Each god here has one new verb (multiplies, performs, withholds) and breaks one specific interface law [5]. Chromatic-aberration glitch in particular is the wrong reference: Control and NieR get their unease from order, not noise [15][22].
- **Decorating the chrome for the occasion.** Ornate frames, coloured panels and animated borders during a boss spend the contrast the display needs. Dim the chrome instead [16].
- **Too many moments.** Nine per run. A tenth devalues the nine [20].
- **Colour leaking.** If Hastur's amber is used for a menu highlight, or the Queen's field red for a warning, the ownership is gone.
- **Falsifying information.** The Queen may get manners wrong. She may not make a health bar lie. The project's own rule is that a bar change must be unambiguous.
- **Staggering name, bar and tone too far apart.** They confirm one fact; more than about a second apart they become three small events [29][30].
- **A chorus pad from the first second.** The voice is the strongest card [6]; it enters once in the opening, once for the Queen, and in the ending. Nowhere else.
- **Particles as confetti.** One material (the dot) with one behaviour per scene. Rez's lesson is that everything is made of the same particles and each is tied to sound [24][43].
- **Long unskippable sequences on the tenth viewing.** First viewing full, later viewings short form, always skippable.
- **A dither or noise field that swims.** If any 1-bit or noise texture is used, fix it to the screen or to the surface; an unstable pattern reads as a bug [32b].

**Accessibility and safety limits.**

- **Flash rate.** Content must not flash more than three times in any one-second period unless below the general and red flash thresholds [32]. A general flash is "a pair of opposing changes in relative luminance of 10% or more of the maximum relative luminance" where the darker image is below 0.80 [32]. The exemption for size is a combined flashing area of no more than 25 percent of any 10-degree field, estimated as a 341 by 256 pixel rectangle on a 1024 by 768 display [32].
- **How this dossier stays inside it.**
  - Build from monotonic ramps. A cell that lights and stays lit is one change, not a pair.
  - Full-bleed pulses stay under a 0.10 relative-luminance step. On black, that is any grey up to about `#595959`, or amber `#FFC857` at up to about 15 percent alpha.
  - A guard that refuses a third large-area opposing pair inside one second:

```ts
class FlashGuard {
  private at: number[] = []
  allow(nowMs: number, areaFraction: number, deltaL: number): boolean {
    if (areaFraction < 0.2 || deltaL < 0.1) return true      // small or below the flash definition
    this.at = this.at.filter(t => nowMs - t < 1000)
    if (this.at.length >= 2) return false                    // limit is 3; keep one in hand
    this.at.push(nowMs); return true
  }
}
const relLum = (r: number, g: number, b: number) => {        // sRGB 0..255 -> relative luminance
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
```

- **Red.** A red flash is any pair of opposing transitions involving a saturated red [32]. The Queen's field therefore enters once over 1.6 s and leaves once at the end of the fight, never pulses, and uses `#C4162E` (red share 0.74). Check the current WCAG text for the saturated-red definition before shipping; the 0.8 figure used here came from an excerpt [32].
- **Evangelion-style cards.** The originals use split-second frames [13]. Do not reproduce that. Hold each card at least 400 ms, no more than two cuts per second, and white type should cover under a quarter of the card.
- **Reduced motion.** `prefers-reduced-motion: reduce` means the user wants an interface that "removes, reduces, or replaces motion-based animations" [33]. The game's own setting is a separate opt-in. In both cases: replace translation, zoom and shake with cross-fades and stepped reveals; keep every duration, every hold and all sound. The stepped helper in section 0.2 does this in one place. A reduced-motion display that is merely shorter looks broken; one that holds the same beats looks intended.
- **Sound.** Offer the mute already in the game. Never place essential information only in audio. Keep the display bus behind a compressor [40] and under the master gain of 0.5 already set in `audio.ts`. Avoid sustained pure tones between 2 and 5 kHz above gain 0.05; the high cluster in the opening is noise-like and brief.
- **Audio start.** The context must be created or resumed from a user gesture [37]; if it is still suspended, the opening must run correctly in silence.
- **Skip.** Every R2 moment is skippable, and skipping must leave the game in the same state as watching.
- **Gaze-contingent drawing (Hastur).** On touch devices there is no hover; fall back to the player unit's cell. Do not use the device camera.
- **Performance.** The 2D budget in section 0.5 is an estimate. If a frame exceeds 12 ms on the target phone, halve dot counts before lowering resolution; count carries the effect, but 6,000 points still read as uncountable.

**Limits of this research.**

- Several primary pages refused the fetch (Art of the Title, Siliconera, Gematsu, GameSpot, the Hollow Knight and Bloodborne wikis, the TIGSource forum, Unreal Engine, Keltner and Haidt's full text). Claims from those are marked **excerpt** in the Sources list.
- The shot-by-shot descriptions rely partly on the author's viewing ([obs]).
- No source read for this dossier gives measured particle counts or frame budgets for phones; the numbers given are engineering estimates to be measured.
- Vowel formant values and the missing-fundamental cut-off figures are not from an authoritative measurement.

---

## Sources

1. **A Philosophical Enquiry into the Origin of Our Ideas of the Sublime and Beautiful**, Edmund Burke, 1757; online edition, J. Viscomi, UNC. https://viscomi.sites.oasis.unc.edu/viscomi/Burke/burke.htm (sections read: [II.3 Obscurity](https://viscomi.sites.oasis.unc.edu/viscomi/Burke/sublime/II.3.htm), [II.7 Privation](https://viscomi.sites.oasis.unc.edu/viscomi/Burke/sublime/II.7.htm), [II.8 Vastness](https://viscomi.sites.oasis.unc.edu/viscomi/Burke/sublime/II.8.htm), [II.19 Suddenness](https://viscomi.sites.oasis.unc.edu/viscomi/Burke/sublime/II.19.htm)). **Read.** Used for the causes of the sublime.
2. **Immanuel Kant's Theory of the Sublime**, 1000-Word Philosophy, 2023. https://1000wordphilosophy.com/2023/11/11/kants-theory-of-the-sublime/ **Read.** Secondary summary citing the Hackett *Critique of Judgment*; used for the mathematical and dynamical sublime, the two phases and the safety condition.
3. **Rudolf Otto's Concept of the "Numinous"** (course outline), Kenyon College, Department of Religion. https://www2.kenyon.edu/Depts/Religion/Fac/Adler/Reln101/Otto.htm **Read.** Used for the parts of *mysterium tremendum et fascinans*.
4. **Approaching awe, a moral, spiritual, and aesthetic emotion**, D. Keltner and J. Haidt, *Cognition and Emotion* 17(2), 297–314, 2003. https://pubmed.ncbi.nlm.nih.gov/29715721/ ; summary at https://www.templeton.org/discoveries/the-science-of-awe **Excerpt** (abstract and foundation summary; full text not read). Used for vastness, accommodation and the five flavouring appraisals.
5. **Supernatural Horror in Literature**, H. P. Lovecraft, 1927 (rev. 1933–34). https://www.hplovecraft.com/writings/texts/essays/shil.aspx **Read** (section I). Used for Lovecraft's own criteria.
6. **Emotional Responses to Music: Shifts in Frontal Brain Asymmetry Mark Periods of Musical Change**, H.-A. Arjmand, J. Hohagen, B. Paton, N. S. Rickard, *Frontiers in Psychology* 8:2044, 2017. https://pmc.ncbi.nlm.nih.gov/articles/PMC5723012 **Read.** Used for its review of chill triggers (Sloboda 1991; Grewe et al. 2007; Guhn et al. 2007) and its own 74 percent figure.
7. **Distinct varieties of aesthetic chills in response to multimedia**, S. Bannister, *PLOS ONE*, 2019. https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0224974 **Read.** Used for chill prevalence, the three chill types and social predictors.
8. **Infrasonic: the experimental concerts**, Sarah Angliss. https://www.sarahangliss.com/?p=27293 **Read.** Used for the 2003 infrasound concerts and their tentative result.
9. **Slit-scan and the Legacy of Douglas Trumbull**, Neil Oseman, 2022. https://neiloseman.com/?p=12297 **Read.** Used for the Stargate slit-scan process.
10. **Ligeti's Atmosphères as a Musical Foreshadowing of Kubrick's 2001, Part 3**, Celluloid Wicker Man, 2014. https://celluloidwickerman.com/2014/03/27/ligetis-atmospheres-as-a-musical-foreshadowing-of-kubricks-2001-part-3-musical-narrative/ **Read.** Used for music over a blank screen and micropolyphony.
11. **How the sound for Arrival is made** (interview with Sylvain Bellemare), A Sound Effect, 2016. https://www.asoundeffect.com/arrival-sound/ **Read.** Used for silence, the shell and the mix.
12. **Denis Villeneuve's Dune sound design** (news summary of NYT reporting), Reactor (Tor.com), 2022. https://reactormag.com/denis-villeneuve-dune-sound-design/ **Read.** Used for organic sources and the layering of the Voice.
13. **Neon Genesis Evangelion**, Fonts In Use. https://fontsinuse.com/uses/28760/neon-genesis-evangelion **Read.** Used for the title cards and flash frames.
14. **Blade Runner 2049 is a cinematic masterpiece: here's why**, RedShark News, 2017. https://www.redsharknews.com/production/item/4998-bladerunner-2049-is-a-cinematic-masterpiece-here-s-why **Read.** Used for single-source lighting, silhouettes and place-coded colour.
15. **The Fonts In Control Make Its World Feel Way Creepier**, Kotaku, 2019. https://kotaku.com/the-fonts-in-control-make-its-world-feel-way-creepier-1837714580 **Read.** Used for location titles and bureaucratic type.
16. **How Remedy harnessed the ethereal beauty of brutalism to shape Control**, Game Developer, 2019. https://www.gamedeveloper.com/design/how-remedy-harnessed-the-ethereal-beauty-of-brutalism-to-shape-i-control-i- **Read.** Used for bare surfaces and mundanity (Stuart Macdonald quotes).
17. **True Detective (2014) main titles**, Art of the Title; with Elastic press material. https://www.artofthetitle.com/title/true-detective/ **Excerpt** (page returned 403). Used for double exposure and "broken portraits out of broken landscapes".
18. **30 Years of Kyle Cooper's Classic Title Sequence for SE7EN**, The Fincher Analyst, 2025. https://thefincheranalyst.com/2025/09/26/30-years-of-kyle-coopers-classic-title-sequence-for-se7en/ **Excerpt.** Used for the origin of the hand-made look.
19. **Symbolise and summarise** (review of the Saul Bass exhibition), *Eye* magazine, 2004. https://eyemagazine.com/review/article/symbolise-and-summarise **Excerpt.** Used for Bass's phrase.
20. **The Making of the Colossi** (translated developer interview), Glitterberri. https://glitterberri.com/extended-developer-interview/making-of-the-colossi/ **Read.** Used for scale, fur density and the cut from 48 to 16.
21. **Bloodborne and the history of horror**, Kill Screen. https://killscreen.com/bloodborne-and-history-horror **Read.** Used for the gothic façade and Insight changing perception.
22. **UI Design in NieR:Automata**, Hisayoshi Kijima, PlatinumGames Official Blog, 2017. https://www.platinumgames.com/official-blog/article/9624 **Read.** Used for the interface concept and palette restraint.
23. **Yoko Taro speaks on the varied endings and meanings of NieR: Automata**, Siliconera. https://www.siliconera.com/yoko-taro-speaks-varied-endings-meanings-nier-automata/ **Excerpt** (403). Used for ending E.
24. **Rez Infinite behind-the-scenes developer diary**, Gematsu, 2016. https://www.gematsu.com/2016/09/rez-infinite-behind-scenes-dev-diary **Excerpt** (403). Used for Area X's particles.
25. **Road to the IGF: Drool's Thumper**, Game Developer, 2015. https://www.gamedeveloper.com/audio/road-to-the-igf-drool-s-i-thumper-i- **Read.** Used for drones and cues as part of the music.
26. **Everything but lost: exploring the mesmerising musical legacy of Outer Wilds** (interview with Andrew Prahlow), Game Developer. https://www.gamedeveloper.com/audio/everything-but-lost-exploring-the-mesmerising-musical-legacy-of-outer-wilds **Read.** Used for building blocks and the third-act finale. 26b. **Endings**, Outer Wilds Wiki. https://outerwilds.fandom.com/wiki/Endings **Excerpt.** Used for the order of events at the campfire.
27. **Video: Designing the audio for Inside, a game that listens** (summary of Martin Stig Andersen's GDC 2016 talk), Game Developer. https://www.gamedeveloper.com/audio/video-designing-the-audio-for-i-inside-i-a-game-that-listens **Read.** Used for the game adapting to sound.
28. **How Thatgamecompany designed its new game, Journey** (interview with Kellee Santiago), GamesBeat. https://gamesbeat.com/kellee-santiago-describes-the-making-of-thatgamecompanys-journey/ **Read.** Used for the one-sitting emotional arc.
29. **Here's what other games should steal from Elden Ring**, GameSpot, 2022. https://www.gamespot.com/articles/heres-what-other-games-should-steal-from-elden-ring/1100-6502119/ **Excerpt** (403). Used for the life bar and music announcing a boss.
30. **Bosses (Hollow Knight)**, Hollow Knight Wiki; and the TV Tropes character page quoted in search results. https://hollowknight.wiki/w/Bosses_(Hollow_Knight) **Excerpt** (403). Used for name-card placement.
31. **Particle Effects**, Grid Sage Games (Cogmind development blog), 2014. https://www.gridsagegames.com/blog/2014/03/particle-effects/ **Read.** Used for scripted per-weapon particles replacing the log.
32. **Understanding Success Criterion 2.3.1: Three Flashes or Below Threshold**, W3C WAI, WCAG 2.2. https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html **Read** (the saturated-red 0.8 working definition came from an excerpt). Used for all flash limits. 32b. **Shader Showcase Saturday #11: Return of the Obra Dinn**, Alan Zucconi, and Lucas Pope's TIGSource devlog (https://forums.tigsource.com/index.php?topic=40832.msg1363742). https://www.alanzucconi.com/?p=10365 **Excerpt** (forum returned 403). Used for dither stability.
33. **prefers-reduced-motion**, MDN Web Docs. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion **Read.** Used for the meaning of the setting.
34. **CanvasRenderingContext2D: globalCompositeOperation**, MDN Web Docs. https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation **Read.** Used for `lighter`, `destination-in` and `destination-out`.
35. **WebGLRenderingContext: blendFunc()**, MDN Web Docs. https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendFunc **Read.** Used for additive blending.
36. **AudioParam: setTargetAtTime()**, MDN Web Docs. https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime **Read.** Used for time constants (63.2 percent per constant; 95 percent at three).
37. **Web Audio API best practices**, MDN Web Docs. https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices **Read.** Used for the user-gesture rule.
38. **ConvolverNode**, MDN Web Docs. https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode **Read.** Used for synthetic reverb.
39. **AnalyserNode**, MDN Web Docs. https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode **Read.** Used for drawing the live waveform.
40. **DynamicsCompressorNode**, MDN Web Docs. https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode **Read.** Used for protecting the display bus.
41. **How to Make Bass Audible on Phone Speakers**, LANDR blog; and US patent texts on psychoacoustic bass (for example "Bass enhancement for loudspeakers", https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12101613). https://blog.landr.com/make-bass-audible-phone-speakers **Excerpt.** Used for the missing-fundamental approach; roll-off figures are unmeasured.
42. **Creating the Shepard Tone audio illusion with JavaScript**, Jordan Eldredge. https://jordaneldredge.com/blog/creating-the-shepard-tone-audio-illusion-with-javascript **Read** (the page describes the illusion and links the code; constants in this dossier are design values). Used for the endless glissando.
43. **How Tetris Effect became a modern work of art**, Unreal Engine developer interviews, 2019. https://www.unrealengine.com/en-US/developer-interviews/how-tetris-effect-became-a-modern-work-of-art **Excerpt** (403). Used for particles chosen because they respond to music.
44. **The Power of Fonts, as Shown by Evangelion** (Fontworks interview), Tokyo Otaku Mode. https://route2015.otakumode.com/interview/01/3/ **Excerpt.** Used for the Ichikawa attribution of the L-shaped layout.
45. **Dune as "Fake Documentary Realism"**, Spotlight Journal. https://www.spotlightjournal.org/issue-iii/q0a041x2ohs5q0cioddr2ivztymwhe **Excerpt.** Used for the remark that the approach was often to remove sound.
