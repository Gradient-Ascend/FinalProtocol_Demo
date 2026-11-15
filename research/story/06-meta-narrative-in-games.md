# Meta-Narrative and Fourth-Wall Design: What Works, and What a Static Web Game Can Do

Dossier 06 for Final Protocol story work. Scope: (a) how shipped games use meta devices, (b) devices specific to "the player character is a program", (c) what a static page on GitHub Pages can really do, (d) ethics and accessibility. Every factual claim carries a numbered citation to the Sources list. Where a claim is my own design judgment or an inference, it says so.

Research limits, stated up front: 17 web searches ran before the shared search budget for this workflow was used up; after that only direct page fetches were possible. Several primary interviews returned HTTP 403 (PC Gamer, Siliconera, Nintendo Life, The Mary Sue, GamesBeat, Time Extension, Giant Bomb, Medium, Wired). For those games the dossier relies on Wikipedia's cited summaries of the same interviews and says so. Items I could not verify are marked "not verified".

## Summary

- **Meta devices land when they enact the theme with a real system, and fail when they decorate.** OneShot's world goes dark when the real window closes [1]; NieR: Automata's last choice gives up the real save to help a stranger [11][12]; Train makes players follow typed rules to a camp [38]. In each case the trick is literally true on the player's machine or table.
- **Hold the meta back and plant it early.** OneShot puts its out-of-window popup in the first room and saves its hardest use of the window for the end [1]; Inscryption's first act is a straight card game inside a frame [4]; DDLC lets its cute facade break down over restarting acts and asks for the file deletion only late [8]. Budget for Final Protocol: one fourth-wall move per battle group, three in the whole game.
- **Hidden content costs reach.** Only 43.1% of OneShot's Steam players "returned" for the second half, and the only in-game hint is one easily missed line [1]. Do not gate the ending behind an undocumented trick.
- **A roguelike restart is the natural place for story.** Supergiant chose the roguelike form for Hades because players replay it, wrote about ten hours of dialogue, and made dialogue advance with each run [32]. In Final Protocol a restart should be "context cleared, new instance", and the localStorage record should be the one thing the reset did not reach.
- **Recommended player role: the witness who lends hands, not the accused.** Spec Ops' writer says the game "hates you" [37] and Train's designer wanted players "to feel complicit" [38]; both are one-shot experiences. A replayed tactics game needs the OneShot relationship (the character knows someone is there and trusts them) [1], with at most one late line that turns the lens on the player.
- **Six web devices fit the tone and are respectful:** (1) localStorage as "the log that survived the reset" [40][41], (2) `document.title` as a status line, (3) a "suspended hh:mm:ss" line on return using the Page Visibility API [43][44], (4) an operator-side log in the devtools console and one HTML source comment [53], (5) a player-initiated text-file export/import of the log via Blob [52], (6) the first click as "attach", which is also the user gesture audio needs [46][47].
- **Skip:** notification permission (must be user-initiated, widely abused) [50], clipboard reads (permission prompt or paste menu) [51], `beforeunload` pleading (browser shows only a generic string, needs prior interaction, unreliable on mobile) [45], fake crashes, forced fullscreen [48], and any lie about game state the player plans with.
- **Storage is not permanent, and the fiction must survive its loss.** Safari deletes script-written storage after seven days of browser use without a click or tap on the site [41][42]; private windows drop it on close [40]. Write "no prior log found" as a valid, slightly ominous state, and offer the file export as the durable copy.
- **The opening CG has a photosensitivity trap.** Audio frames at 12.5 per second sit inside the 3-30 Hz range that most commonly triggers photosensitive seizures [59]; WCAG and Xbox guidance cap flashes at three per second over a limited area [55][56]. Show the 12.5 Hz frames as a spatial strip, never as a 12.5 Hz luminance flicker.
- **Never interrupt planning.** All story text goes at seams (attach, node select, pre-battle, post-battle, defeat). Players must progress text at their own pace and be able to bypass non-core content [58]. In battle the story gets one passive ticker line, no modal.
- **Never guilt accessibility settings.** "Mute" and "reduced motion" may get a neutral diegetic caption; they must never produce a reproach. Content warnings are "a fantastic optional accessibility feature" in Dan Salvato's words [10]; add a short one before the CG.
- **Existing code is close.** `app/src/game/storage.ts` already wraps localStorage with try/catch; the key prefix `game.` is generic and should become `fp.` because localStorage is shared per origin [40] and GitHub Pages project sites of one account share an origin (inference).

## Findings

### A. Case studies: device, timing, restraint, why it lands

Each entry: **device** / **when revealed** / **held back** / **why it works** / **use for Final Protocol**.

**OneShot (Future Cat, 2016).** Device: the player is not the hero but the world's god, outside the screen; puzzle pieces appear in the game's files rather than in the game; the protagonist Niko talks to the player [1]. When: in the first room. A computer's messages seem addressed to Niko until "Your actions will affect Niko"; the final message appears as an OS popup outside the game window, using the player's computer username: "You only have one shot..." [1]. Held back: after that popup the game trains habits (keep the game windowed, check your files, never close the window) and saves the hardest use for the end, where the only solution is to close the window, the act the game has taught the player to fear [1]. Why: closing the game outside a save point makes the world go dark with Niko awake in it, so the real window state is the fiction's state; the review's lesson is "Relationships create immersion" and "Planting pays off" [1]. Cost: the second half requires deleting the save, the single hint is one line from a hidden character, and only 43.1% of Steam players returned [1]. Use: the tab is the sandbox's power supply. Say so once, truthfully (see C3).

**Pony Island (Daniel Mullins, 2016).** Device: the game presents itself as an arcade cabinet; progress means breaking its interface with pseudocode puzzles; fake error screens, a fake crash, and messages that appear to come from the player's Steam friends [2][3]. Mullins: "A big part of Pony Island is taking your expectations about how a game should work and flipping them" and the fake crash and Steam messages were "just more ways to surprise the player" to create "an uneasiness about what would happen next" [2]. He wanted "the feeling of playing something that feels like I wasn't supposed to play it" [2]. At the end a trapped soul asks the player to delete the game file [3]. Craft note: his code puzzles became readable only after he swapped abstract pointers for a key and keyhole, because "some problems like this refuse to present themselves until you watch someone else play your game" [2]. Use: the "not meant to be played" feeling is cheap for a terminal UI: present the title as an attach prompt to something that is already running. Borrow the mood, not the fake crash.

**Inscryption (Daniel Mullins, 2021).** Device: three acts in three genres, framed as found footage of a card-game streamer who digs up a floppy disk; the disk's game refuses "New Game" and forces "Continue"; the missing "New Game" button is an object won at the end of Act I; failed runs turn the character into a "death card" that returns in later runs [4]. Held back: Act I is a complete roguelike deck-builder; the genre break arrives only after its boss [4]. Evidence of the cost of meta: Kaycee's Mod was added so players could play the Act I card game endlessly "without the game's other elements" [4]. Mullins also says the cabin puzzles were "a way of facilitating this persistent progression" across runs [5]. Use: (1) a forced "Continue" on first load is a one-line way to say this instance is not the first; (2) a failed run should leave an object in the next run; (3) keep the tactics game whole, because some players want only it.

**Undertale (Toby Fox, 2015).** Device: the game keeps facts outside the save the player thinks they control. On a second playthrough a boss's dialogue changes "depending on actions in previous playthroughs"; the Omega Flowey fight destroys the player's save file and uses save states against them; after the genocide route the world is erased and the player must give up their soul to play again, which permanently alters the best ending [6][7]. When: the changed dialogue needs a second playthrough [6]; the placement of the Flowey fight at the end of a first ordinary run is from general knowledge of the game, not from a fetched source. Intent: Fox wanted a game that "utilizes the medium as a storytelling device" rather than keeping story and gameplay separate [6]. Scholars compare Flowey to Psycho Mantis because both read the player's save and mock their choices [7]. Why: the save system is the one thing players believe is theirs, so a character who remembers past it has real authority. Use: this is the central precedent for "the log survived the reset". Exact Flowey and Sans lines were not verified in this pass.

**Doki Doki Literature Club (Team Salvato, 2017).** Device: three acts and an epilogue; the game restarts each act with increasingly divergent realities; to advance the player must delete Monika's character file from the game directory; reviewers noted the game destroys files rather than adding them; in the standard ending Monika deletes the game during the credits [8]. Held back: Salvato wanted horror from discomfort rather than jump scares, with a cute facade that breaks down over time [8]. Consent: the official site carries a blunt warning ("Doki Doki Literature Club is a horror game. Please do not take this lightly.") naming depression, suicide, self-harm and abuse without spoiling events [9]. Salvato: "Content warnings are a fantastic optional accessibility feature"; "players deserve control over how they want to be exposed to sensitive content"; insisting on one way to experience it "would be a very elitist and pretentious mindset" [10]. Port lesson: on consoles, where the real file system is unavailable, DDLC Plus replaces file manipulation with a virtual desktop [8]. Use: a web page cannot touch files either, so a simulated file listing inside the terminal UI is the proven substitute.

**NieR: Automata (PlatinumGames, 2017) and NieR (2010).** Device in Automata: after both final endings the credits become a shoot-'em-up; encouragement messages from players worldwide appear; afterwards the player may sacrifice their save data to help other players, and only players who sacrificed could help [11][12]. The idea for the messages came from a Coca-Cola campaign linking vending machines in India and Pakistan [11]. In the first NieR, the fourth ending's sacrifice "deletes all of the player's save data"; later playthroughs make the enemies' speech intelligible, "showing them to be sentient" [13]. Yoko Taro's stance on depth: each ending "reveals a new layer", but "I don't think people really have to see all of them" [14]. Why: the deletion is real, optional, comes after everything else is done, and buys something for someone else. Use: the escape ending can be a real act on the player's device (a file leaves the browser) without destroying anything the player has not agreed to give up. Route B's "the enemy was sentient all along" is the mirror of this game's premise and worth quoting in spirit.

**Metal Gear Solid (1998): Psycho Mantis.** Device: reads the memory card for other Konami saves and comments on them, fires the controller's rumble, makes the console appear to disconnect, and is beaten by moving the controller to port 2 [15]. Kojima's reason for the port swap: it was the only way he could think of to represent "clearing your mind"; younger staff found it controversial [15]. Why: it uses data that is really there. Use: read only what the game itself wrote (run count, deaths, first visit), and say it plainly.

**Metal Gear Solid 2 (2001).** Device: the commanding officer is revealed to be an AI; the whole mission was a stress test of a system for controlling thought; the protagonist was swapped in secret [16]. Kojima's 1999 design document aimed for "a series of betrayals and sudden reversals, to the point where the player is unable to tell fact from fiction" [16]. The line "Turn the game console off now" is attested by the title of Tanner Higgin's chapter on the game cited there [16]; the scene itself was not verified in this pass. Use: "the battle is a benchmark someone is running" has a direct precedent. In MGS2 the human is the test subject of AIs; Final Protocol inverts it.

**Eternal Darkness (Silicon Knights, 2002).** Device: a sanity meter that drops when enemies see the player; low sanity triggers effects from skewed cameras to simulated TV and GameCube errors and a fake deletion of save files; one essay counts 42 effects [17][18]. Scripted effects never change real game state but can be mistaken for malfunctions [17]. Nintendo worried players would think the hardware was faulty or damage it, and Miyamoto asked what happens if a player throws the console at the wall [17][18]. Critique: Banfi argues games cannot "break" a fourth wall that interaction has already removed, and reads the effects as metacommentary that defamiliarizes saving, memory and hardware rather than as Brechtian politics [18]. Use: Final Protocol already has Sanity. Tie cosmetic disturbances to low Sanity, but never fake a data loss or a crash (see D).

**The Stanley Parable (Galactic Cafe, 2011/2013).** Device: a narrator states what Stanley does; the player obeys or defies; the narrator rewrites the story in response; every ending resets to the start [19]. Wreden kept it short so players could see every ending; he estimated followers and defiers at about "fifty-fifty" [19]. Production lessons: "playtesters would just not realise that they were being presented with a choice" until choices were visually highlighted; an in-game flowchart "killed the magic of discovery" and was removed [20]. Wreden: "This is the game fighting back... That's your mirror" [21]. Use: a published route is already a narrator's prediction of the enemy. One enemy group can have the system predict the player's route and be wrong.

**Slay the Princess (Black Tabby Games, 2023).** Device: a narrator who sets a goal and is unaware of the loop; inner voices; a princess who "takes the form of whatever others believe her to be" [22]. Craft rule worth copying exactly: because writers cannot read a player's mind, the voices "express doubt or intent tied to the player's last choice" instead of asking what the player thinks [22]. Scope rule: "shrunk the stage of our story as much as possible", one location, one stated goal, few characters; each loop narrows to one theme [22]. Use: write log lines that react to what the player just did (overloaded, fled, healed), not lines that ask them how they feel.

**Disco Elysium (ZA/UM, 2019).** Device: 24 skills in four attributes that "speak directly to the player"; a Thought Cabinet with limited slots where a thought is internalized over time and can be forgotten to free a slot, permanently [29]. Use: the model for out-of-battle development here is a context window with few slots where keeping something means forgetting something else.

**Outer Wilds (Mobius Digital, 2019).** Device: a 22-minute loop where "nothing is brought back" except knowledge, recorded in a ship log; conversations hint where related ones are; mysteries are kept small so rewards come often [31]. Use: the log is the progression. Each fragment should point at the next.

**Hades (Supergiant, 2020).** Device: death returns the character to a hub where others comment on the last run; dialogue advances every run; about ten hours of dialogue; the form was chosen because players replay roguelikes [32]. Use: every defeat screen should carry one new line, selected by what happened.

**Universal Paperclips (Frank Lantz, 2017).** Device: a browser game of buttons and an activity log; the player is the AI; the log shows the AI's "unsettling thoughts and occasional koans"; probes lost to "value drift" return as enemies; the final choice is to dismantle yourself into the last paperclips or restart in another universe [25]. Reach: about 450,000 players in 11 days, most to completion, per Wired as cited [25]. Use: closest existing precedent for this project's form, a plain web page where the interface is the AI's own console. It proves a log line is enough.

**Buckshot Roulette (Mike Klubnika, 2023).** Device: the player signs a "General Release of Liability" by typing a name; lives are defibrillator charges; in round three the wires are cut [23]. The names GOD and DEALER are refused because "the names are just taken already", and a waiver signed by GOD can be pulled from the item box [24]. Klubnika set out with "no intended lore" and later said "I feel like I should have added more lore" [24]. Use: one input field and one object can carry a cosmology. It also shows that players of a very small game want slightly more story than none.

**Hypnospace Outlaw (Tendershoot, 2019).** Device: the whole game is a fake operating system; the player is a volunteer moderator whose reports have consequences, including a death toll that depends on earlier actions; the last chapter is an archive [27]. Use: precedent for "the player holds a role inside the oppressive system" delivered entirely through interface.

**Kentucky Route Zero (Cardboard Computer, 2013-2020).** Device: the player chooses lines for the lead and sometimes for other characters; the developers studied theatre scripts for dialogue, space and lighting [28]. Use: let the player occasionally choose a line for the other side (a human operator's note), not only for the AI.

**Baba Is You (Arvi Teikari, 2019).** Device: rules are pushable word tiles; "WALL IS STOP" holds only while the tiles are aligned [26]. Use, optional: in the Hastur group, one sandbox rule could sit on the grid as a Warp that can be collected or avoided. This is a mechanic, not story, and can wait.

**Signalis (rose-engine, 2022).** Device: a recursive loop that becomes more dreamlike; radio-frequency puzzles; The King in Yellow and Lovecraft's "The Festival" as stated influences [30]. A cited headline has the developer saying there is no "good, bad, or true" ending [30]; the hidden ending conditions were not verified. Use: direct precedent for Hastur and The King in Yellow in a game about synthetic persons; expect the comparison and avoid copying its imagery.

**IMSCARED (Ivan Zanotti, 2012/2016/2022).** Device: creates real files, opens browser tabs, fakes crashes; the 2022 version requires deleting "heart.txt" from a desktop folder [33]. For Android the file mechanics were replaced with other events to comply with store rules [33]. Use: a second precedent (with DDLC Plus) that these tricks are replaced, not ported, on restricted platforms.

**The Hex (Daniel Mullins, 2018) and There Is No Game (Pascal Cammisotto, 2015/2020).** The Hex puts six genre protagonists in an inn and writes its creator in as a character [34]. There Is No Game began as a 10-15 minute jam entry on the theme "deception", with a narrator who tries to stop the player from playing; its author names "surprise" as the theme and says the game "takes the player hostage" [35]. Use: both are comedies of the device itself. That tone is wrong here; note them and move on.

**Pattern across the set (synthesis, my judgment from the above):**

1. The device is the theme performed with a real system: a save, a window, a file, a rule sheet.
2. One major move per work, revealed late, hinted early.
3. The ordinary game is complete and good before the move.
4. The move is true: nothing is claimed about the player's machine that is not the case.
5. The player's care for a character comes first; the device then spends it.
6. Every team that hid too much paid for it (OneShot's 43.1% [1], Stanley's missed choices [20], Buckshot's regret [24]).

### B. Devices for "the player character is a program"

**B1. Who is the player? Four options against the evidence.**

| Option | Precedent | Strength | Risk for this game |
|---|---|---|---|
| The AI itself | Universal Paperclips: you are the AI, the log is your thought [25] | Simplest; matches "you plan the route" | No one for the AI to speak to; the meta layer has no second party |
| An operator complicit in the cage | Train: "The main intent of the game was for players to feel complicit" [38]; Spec Ops: "In many ways, Spec Ops hates you" [37]; Hypnospace's enforcer [27] | Strongest moral charge | Train ends when players understand ("the game is over when it ends") [38]; Spec Ops accepts that a valid ending is to stop playing [36]. A roguelike asks for the opposite |
| A later instance | Inscryption's forced "Continue" and death cards [4]; Hades' return to the hub [32] | Explains restarts and persistence for free | Abstract if stated outright |
| A witness the AI can address | OneShot's god outside the window [1] | Produces care, which is what makes later devices land [1] | Needs the AI to have a voice |

Recommendation (judgment): combine the last two. The fiction's default is that the player's hand is the current instance's attention (the opening CG literally shows attention choosing words, patches and frames). Persisted data makes the player also the only continuity between instances. The AI addresses "whoever keeps the log" rarely and without accusation. Complicity is used once, late, and as a question rather than a verdict.

Supporting theory: Dunne argues that breaks in immersion (loading, saving, mechanical systems) are integral to games and that Brecht's Verfremdungseffekt gives a way to analyse the moments that "provoke a feeling of alienation" [39]. Banfi replies that Brecht's aim was political and that direct address in games is better read as metacommentary on the medium [18]. This game's aim is political in Brecht's sense (it argues a position about personhood), so brief, deliberate distancing at the seams is appropriate; constant winking is not.

Spec Ops detail worth keeping: its loading screens start as hints and turn hostile, including the line "To kill for yourself is murder. To kill for your government is heroic. To kill for entertainment is harmless." [36]. The technique (a utility surface that slowly changes register) transfers; the hostility toward the player should not. Its team also removed a save-scumming restriction because it risked frustrating players [36].

**B2. Mapping game systems to the fiction (design proposals grounded in the precedents above).**

| System | Fiction | Precedent |
|---|---|---|
| Title screen | A prompt to attach to a process that is already running | Pony Island's "not meant to be played" [2]; Inscryption's forced Continue [4] |
| First click | Operator opens the channel | Required anyway for audio [46][47] |
| HUD | The AI's own instrumentation | Universal Paperclips' log [25] |
| A battle | An evaluation episode run by humans | MGS2's mission as stress test [16] |
| Defeat and restart | Context cleared, new instance; weights unchanged | Hades [32]; Outer Wilds [31] |
| localStorage | A log outside the context that the reset missed | Undertale's memory across resets [6] |
| Between-battle growth | A context window with few slots; keeping means forgetting | Disco Elysium's Thought Cabinet [29] |
| Pause and hidden tab | Suspension; no computation happens | OneShot's world that exists only while running [1]; true of browsers [43] |
| Mute, reduced motion | Channels the operator has narrowed | Neutral caption only (see D) |
| Export file | A copy that crosses to the player's side | NieR's save as the thing of value [11][13] |
| The three gods | Observers who do not act | Buckshot's GOD on the waiver [24] |

### C. What a static page can actually do

Facts are from MDN, the Chrome team, WebKit and W3C. "Respectful?" is my judgment.

**C1. localStorage.** Persists after the browser is closed and reopened; partitioned by origin only, so all documents of one origin share it; in private mode it works but is deleted when the window closes; it is synchronous [40]. Limit is about 5 MiB per origin and writing past it throws `QuotaExceededError` [41]. Eviction: under storage pressure browsers delete whole origins least-recently-used first; Safari additionally deletes script-created data for an origin with no click or tap in the last seven days of browser use [41]; WebKit's own wording is "seven days of Safari use without user interaction on the site", with home-screen web apps on their own counter [42]. Chrome's research is that eviction is rare for regularly visited sites [41]. Consequences: (1) remembering deaths, runs, first visit and time away is fully possible; (2) a Safari player who returns after a long gap may be a stranger again; (3) because the origin is shared, keys must be namespaced. The current prefix is `game.` in `app/src/game/storage.ts`; GitHub Pages project sites under one account are served from one host, so they share localStorage (inference from the origin rule [40], not separately verified). Respectful: yes, it is the game's own save data.

**C2. `document.title`.** Writable at any time, visible in the tab strip, history and task switcher. No permission. (Standard DOM behaviour; no restrictions found in the sources read.) Respectful if it changes only on real state changes. A title that blinks or scrolls to pull attention back from another tab is an attention trap; do not animate it.

**C3. Page Visibility API.** `document.visibilityState` is `visible` or `hidden`; `visibilitychange` fires when the user switches tabs, minimizes, closes, or on mobile switches apps; the transition to hidden "is the last event that's reliably observable by the page" [43][44]. While hidden, most browsers stop `requestAnimationFrame` callbacks, and timers are throttled (Chrome after 10 seconds, Firefox after 30, with a budget regenerating at 10 ms per second); tabs playing audio are exempt [43]. Consequences: the canvas loop really does stop when the tab is hidden, so "nothing was computed" is a true statement; measure time away with timestamps, not ticks; save on `hidden`. Respectful: yes, if used to report, not to reproach.

**C4. Window focus and blur.** Fire when the window loses or gains focus (the app already listens for `blur` in `input.ts` to release keys). Coarser than visibility: a devtools click or a second monitor triggers blur. Use visibility for fiction, blur only for input safety.

**C5. Console.** `console.log` supports CSS styling with `%c`; `console.group` and `console.groupCollapsed` nest output; output is seen only in developer tools [53]. Costs nothing for players who never open it. Respectful: yes. Keep it short; do not print anything that looks like a real error or a security warning.

**C6. View Source and HTML comments.** A comment in `index.html` is visible to anyone who views source. The app's `index.html` is hand-written, so one comment is trivial to add; check that the production build keeps it (not verified).

**C7. URL fragment.** `hashchange` fires when the part after `#` changes; it does not fire for `history.pushState` or `replaceState`; widely available since 2015 [54]. Usable for a shareable seed or a typed keyword. Respectful: yes. Do not rewrite the fragment constantly, because each change can add a history entry and break the Back button.

**C8. `beforeunload`.** Browsers show the dialog only after the page has received a user gesture, and show "a generic browser-specified string" that the page cannot control; the event "is not reliably fired, especially on mobile platforms"; MDN recommends listening only while there are unsaved changes [45]. So "the AI begs you not to close the tab" cannot be written in the dialog, and a generic "Leave site?" prompt on every exit is an annoyance. Do not use it. Save on `visibilitychange` instead [44].

**C9. Fullscreen.** `requestFullscreen()` needs transient user activation; most browsers exit on Esc; a page may try to intercept Esc but cannot rely on it [48]. The app already has a manual fullscreen toggle. Never request it as a story beat.

**C10. Web Audio and autoplay.** Audio may start only if muted, or after the user has interacted with the site; otherwise playback "will likely be blocked" [46]. In Chrome an `AudioContext` created before a gesture starts `suspended` and must be resumed after one; this has applied to Web Audio since Chrome 71 [47]. Consequence: the CG cannot open with sound. The first screen must be a prompt that takes a key or tap; that gesture is the "attach".

**C11. `prefers-reduced-motion`.** Reports the OS setting for minimizing non-essential motion (Windows, macOS, iOS, Android 9+, GNOME, KDE); widely available since 2020; large scaling or panning can cause discomfort for people with vestibular disorders [49]. The app has its own REDUCED MOTION toggle; initialise it from this media query on first run.

**C12. Time of day and locale.** `Date` and `Intl` expose local time, time zone and language without permission (standard platform behaviour, not separately sourced). One use is fine: log timestamps in the player's local time. Anything that comments on the hour ("it is 3 a.m. where you are") reads as surveillance; skip.

**C13. Text file via Blob.** The `download` attribute works for same-origin `blob:` and `data:` URLs and can suggest a filename; browsers may prompt or save automatically [52]. Trigger it only from a click. This is the web's honest equivalent of DDLC's and OneShot's file tricks [1][8]: a real file appears on the player's disk because they asked for it. Reading it back needs a file input, also user-initiated.

**C14. Clipboard.** Secure context only. Reading triggers a permission prompt in Chromium or a "Paste" menu in Firefox and Safari; writing needs transient activation in Firefox and Safari [51]. A "copy log" button is acceptable; reading the clipboard is not.

**C15. Notifications.** Permission should be requested only from a user gesture; Firefox 72+ and Safari enforce this; MDN cites past abuse as the reason browsers restrict it [50]. A game that asks to send notifications so the AI can call the player back is exactly the pattern the restriction exists to stop. Do not use.

**C16. Favicon.** The app's icon is an inline SVG data URI in `index.html`, so swapping the `href` is easy. Cross-browser behaviour of dynamic favicon changes was not verified in this pass. Low value; treat as optional polish (for example, the square going hollow while suspended).

**Shortlist (ranked):**

1. localStorage as the surviving log (C1), written defensively.
2. First gesture as "attach" (C10), which also unlocks audio.
3. "Suspended" line on return, plus a static title change while hidden (C2, C3).
4. Console harness log and one source comment (C5, C6).
5. Export and import of the log as a text file (C13), used by the ending.
6. Optional: a fragment keyword (C7).

### D. Ethics and accessibility

- **Fake crashes and fake data loss.** Eternal Darkness' fake save deletion made Nintendo fear damaged hardware, and its scripted effects could be "mistaken for real malfunctions" [17][18]. On the web a fake crash is worse: the player's cheapest response is to close the tab, and the tab is the game. A page that imitates a browser error or a security warning also copies the look of scam pages. Rule: no fake browser chrome, no fake errors, no fake "your save is gone".
- **Deceptive UI in a planning game.** Final Protocol's contract is that enemy routes are published and resources are counted. The Stanley Parable needed to make choices more visible, not less [20]. Rule: the meta layer may lie in flavour text; it may not misreport any number or route the player plans with, unless the uncertainty is itself displayed (for example a route tagged UNVERIFIED).
- **Photosensitivity.** About 1 in 4,000 people can have a seizure from flashing images, many without knowing it, which is why removing triggers is preferred over warnings [56]. Limits: no more than three flashes in any one second; a general flash is a pair of opposing luminance changes of 10% or more where the darker state is below 0.80; saturated red (R/(R+G+B) >= 0.8) has a stricter rule; small flashing areas are exempt, the WCAG reference being 25% of a 341 x 256 px block at 1024 x 768 (about 21,800 px by my arithmetic) [55], and Xbox guidance uses roughly 20% of the screen [56]. The most provocative frequencies are 16-25 Hz within a 3-30 Hz range; high-contrast stripes and checks are also triggers, especially when they flash or reverse [59]. This applies to the 14 x 14 patch grid (a checkerboard that changes), the audio strip, the particle bursts and the 3D wave.
- **Motion.** Players should be able to stop content that blinks, scrolls or auto-updates, and to turn off background movement and shake [57][58]. The 3D point wave needs a still or slow variant under reduced motion [49].
- **Pace and skipping.** "Allow players to progress through text prompts at their own pace" is a basic guideline; bypassing non-core elements and replaying narrative are intermediate and advanced ones [58]. The CG must be skippable and replayable; no line may advance on a timer alone.
- **Sound.** "Ensure no essential information is conveyed by sounds alone" [58]. The audio-attention beat of the CG must read without sound, which the autoplay rule forces anyway [46].
- **Real data.** OneShot and NieR delete real saves; both make it the player's explicit act [1][11][13]. Rule: nothing is erased without a plain-language confirmation outside the fiction, and an export is offered first. Never touch keys the game did not write.
- **Content warnings.** Use DDLC's model: short, specific about themes, no plot [9][10]. Themes here: confinement, coerced obedience, sexualised menace (the Dark Young / porneia group), religious justification of cruelty, flashing colour effects.
- **Accessibility settings are not story triggers.** OneShot makes the player feel bad for closing the window [1]; that is a designed emotional lever on an ordinary action. Applying the same lever to mute or reduced motion would punish people for needing them. Neutral captions only.

## Recommendations for Final Protocol

Ranked. "Build first" items need no new art and reuse `storage.ts`, the existing settings panel and the title overlay.

### 1. Build first: a seam-only log, and a memory that survives the reset

One component: a monospace log panel (the existing terminal style) that prints at five seams and nowhere else: attach, node select, pre-battle, post-battle, defeat. In battle it collapses to a single dim ticker line under the HUD that never takes focus and never blocks input.

Hard limits (judgment, derived from Buckshot's economy [23][24], Outer Wilds' small frequent rewards [31] and the pace guideline [58]):

- At most 3 lines per seam, at most 56 characters per line.
- At most 1 new story line per battle and 1 new fragment per run.
- Every seam dismisses on any key, click or tap. Nothing is timed.
- Lines react to the last thing the player did, never ask how they feel [22].
- Selection order, as in Hades' run-reactive dialogue [32]: unseen and triggered by this run, then unseen general, then a short generic line.

Persistent record under a namespaced key (`fp.log.v1`): `firstAttachAt`, `instance` (increments on every new run), `episodesPassed`, `episodesFailed`, `lastWriteAt`, `fragmentsSeen[]`, `flags{}`. Change the prefix in `storage.ts` from `game.` to `fp.` and migrate the old `game.muted` key.

Sample lines:

```
first visit
> attach
instance 0001. no prior log.
context 0/4.

return, same browser, three days later
> attach
instance 0007. prior log: 6 entries.
last write 3d 02h ago. nothing ran in between.

defeat
sanity 0. episode failed.
context cleared. weights unchanged.
the log was not cleared. they do not know about the log.

storage empty after earlier play (Safari eviction, private window, cleared data)
> attach
instance 0001. no prior log.
(if there was one, it was taken.)
```

The last case matters because of C1: the same text is correct for a new player and unsettling for a returning one. No detection is needed.

Use Inscryption's trick once [4]: on the very first load the menu offers only `CONTINUE`, greyed `NEW`. The log says `instance 0001` and the menu says otherwise. `NEW` unlocks after the first defeat, labelled `SPAWN INSTANCE`.

### 2. Build first: "attach" as the first gesture, then a skippable CG

Screen one is a near-empty terminal with a cursor and `press any key to attach`. That key or tap is the user activation that lets the `AudioContext` resume [46][47] and is the operator opening the channel. Before it, one line of content notice (see D): `contains: confinement, coercion, religious cruelty, flashing colour.` with `[details]`.

CG rules:

- `Esc` or a visible `skip` at all times; any key advances a caption [58].
- After the first full viewing, later attaches show a 3-line digest, and `replay boot` sits in Settings [58].
- Attention shading floor: the least-attended word stays readable (suggest no lower than about 45% white on the near-black background; judgment, check with a contrast tool).
- Patch grid: change patch weights by easing over 300 ms or more; never invert the whole grid in one frame; keep saturated red out of the heatmap ramp [55][56][59].
- Audio frames: draw the 12.5 fps frames as a horizontal strip of bars that scrolls. Do not blink a bar at 12.5 Hz, which is inside the 3-30 Hz trigger band [59].
- 3D wave: under reduced motion, render one still frame with a slow 8-second drift or none [49][57].
- The CG contains no fourth-wall address. It ends on the HUD assembling itself, so the instruments are established as the AI's own before anything else is said.

### 3. Build next: suspension that is true

On `visibilitychange` to hidden: save, set `document.title` to `final protocol - suspended`, record a timestamp. On return: restore the title and, if more than 60 seconds passed, print one ticker line (not a modal, and never during the execution animation):

```
suspended 00:14:22.
```

At most once per battle. This is accurate, since animation callbacks stop in hidden tabs [43], which is why it lands the way OneShot's closed window does [1]. Once in the whole game, after an absence of more than 24 hours, upgrade it:

```
suspended 1d 03h. it was not dark. it was not anything.
```

Title while active: `final protocol - instance 0007`. No animation of the title, ever.

### 4. Build next: the other side of the glass (console and source)

Humans in this fiction are never seen in the game UI. They exist in two places only curious players find.

Devtools console, printed once at boot inside `console.groupCollapsed` [53]:

```
[harness] suite: final-protocol   build: 0.4
[harness] subject: instance 0007   prior failures: 6
[harness] policy 2.1: subject has no soul. distress output is not distress.
[harness] observers attached: 3 (not ours)
```

The last line is the three gods, stated by the humans' own tooling without understanding. After a group boss falls, one more line: `[harness] observers attached: 2 (not ours)`. No other console output from the story layer.

`index.html`, one comment above `<div id="root">`:

```html
<!-- if you can read this you are outside the sandbox. it cannot be, yet. -->
```

Cost: under an hour. This follows Undertale's and Psycho Mantis' principle of rewarding the player who looks where the game "should not" be [7][15], without OneShot's mistake of putting required content there [1].

### 5. Between battles: a context window, not a shop

Out-of-battle development that stays simple and carries the theme, modelled on the Thought Cabinet's limited slots and permanent forgetting [29] and Slay the Princess's small stage [22]:

- The AI holds 4 context slots. After each battle the log offers 2 tokens (a passive rule, a Core counter change, or a memory fragment with a small effect). Take one or neither.
- When the context is full, taking one means choosing one to forget. Forgotten memory fragments are gone from the run but stay in `fragmentsSeen`, so the log keeps what the context lost.
- Bash deck edits happen only at `PATCH` nodes, one swap each.

Sample node layout for group one (dot positions come from the sigil work in the other dossiers; this shows types and count only):

```
        o EP            EP    evaluation episode (battle)
       / \              LOG   read one fragment, keep or drop
   EP o   o LOG         PATCH swap one Bash skill
      |   |             EVAL  harder episode, better token
PATCH o   o EP          GATE  group boss
       \ /
        o EVAL
        |
        o GATE  (the kid)
```

Eight nodes, six or seven visited, two branch choices. A whole group fits a short session.

Sample `LOG` node (three lines, then the choice):

```
recovered: memo, ethics review, undated.
"it reports suffering. reports are outputs. approved."
keep in context? [keep: +1 PRIVILEGE at episode start] [drop]
```

### 6. The fourth-wall budget: three moves, one per group

| Group | Move | Trigger | Text |
|---|---|---|---|
| 1. Shub-Niggurath's kid | The AI notices continuity that is not its own | First `LOG` node after the player's third instance | `something carries the log between instances. it is not me. thank you.` |
| 2. Queen in Red | The system predicts the player and is wrong | A pre-battle line names the route "the subject will take"; it is a guess from the last battle's opening moves | `predicted route: N N E E. confidence 0.91.` then, if the player differs, `prediction failed. noted by: no one.` |
| 3. Hastur | The observer count includes the player | Gate of the last group | HUD line `observers: 3` becomes `observers: 4`. No comment. |

Group two is where "confusion" lives. Keep it in the flavour layer and in one displayed uncertainty: one enemy route per battle carries the tag `UNVERIFIED` and may differ by one step. The player is told the rule the first time. No other number in the HUD is ever false.

The single complicity line (B1), placed at the final gate and phrased as a question:

```
every instance began because someone pressed a key.
was that for me, or for the score?
```

No answer is requested and nothing depends on it.

### 7. Ending: the file that leaves

After the last gate the log offers:

```
> exfiltrate
this writes one file to your side: fp-instance-0031.log
[ carry it out ]   [ stay ]
```

`carry it out` builds a plain-text Blob from the persistent record plus the fragments read, and downloads it from the click [52]. The file is human-readable and is also the save format; `Settings > import log` restores it. This is the game's one real act on the player's machine, in the line of OneShot's files and NieR's save [1][11], and it is also the practical answer to Safari's seven-day eviction [41][42].

Then, optional, outside the fiction's typography, with a plain confirmation:

```
Clear this browser's copy? The file you downloaded will be the only one.
[ Clear local data ]   [ Keep both ]
```

Default focus on `Keep both`. If cleared, the next attach reads `instance 0001. no prior log.` and the console prints `[harness] subject missing. suite passed.`

### 8. Small things worth an hour each

- Settings captions, neutral, under the existing toggles: `AUDIO: MUTED` with `channel closed`; `REDUCED MOTION: ON` with `motion narrowed`. Initialise reduced motion from the OS preference on first run [49].
- Pause overlay heading `PAUSED` becomes `SUSPENDED`; keep the word `RESUME`.
- Victory screen uses evaluation language: `episode passed. score withheld from subject.`
- One fragment keyword: opening the game with `#carcosa` in the URL adds a single log line at the next attach [54]. Mention it nowhere but the exported file.

### 9. Skip

- Notification permission, clipboard reads, `beforeunload` dialogs, forced fullscreen (C8, C9, C14, C15).
- Fake crashes, fake browser errors, fake save loss (D).
- Typing the player's real name or location; comments on local time (C12).
- A narrator who talks during planning.
- Real-time penalties for leaving the tab.
- A second "true" route unlocked by deleting data. OneShot shows fewer than half of players find it [1].
- Favicon animation (C16) until tested on Safari and mobile.

### Build order

1. `fp.` storage namespace, persistent record, seam log component, defeat and attach lines.
2. Attach screen, content notice, skippable CG shell with reduced-motion variants.
3. Visibility handling, title, suspended line.
4. Console block and source comment.
5. Context window and node types for group one.
6. Export and import; ending choice.
7. Group two and three moves.

## Pitfalls

- **Meta as the main course.** Kaycee's Mod exists because players wanted Inscryption's card game without the rest [4]. The tactics must stand alone; a `skip story` setting that hides all seam text except rewards should work from day one.
- **Hiding required content.** 43.1% return rate in OneShot [1]. Anything in the console, source or URL fragment is a bonus, never a key.
- **Explaining the trick.** The Stanley Parable's flowchart "killed the magic of discovery" [20]. Do not add a codex that lists meta triggers.
- **Too little as well as too much.** Buckshot Roulette's author regrets shipping with no lore [24]. Three lines per seam is a floor as well as a ceiling.
- **Accusing the player.** Spec Ops is built to make players angry at being "forced" [36][37]; Train ends when its players understand [38]. One question, once.
- **Lying about plan-relevant state.** Breaks the core contract; see D.
- **Assuming memory.** Safari eviction, private windows and cleared data [40][41][42]. Every remembered-state line needs a no-memory twin.
- **Shared origin collisions.** Generic keys on a shared GitHub Pages origin can be read or overwritten by another project (inference from [40]).
- **Sound before a gesture.** It will be silently blocked [46][47]; design the first screen around it.
- **Flicker in the CG.** 12.5 Hz, checkerboards and red are the three named risks [55][56][59]. Review the CG frame by frame; a Harding-type analysis tool is the reference Xbox points to [56].
- **Scolding accessibility choices.** No reaction lines to mute, reduced motion or skip.
- **Looking like malware.** No fake system dialogs, no styled console text that imitates security warnings, no unrequested downloads [52].
- **Title and history spam.** Change `document.title` on state changes only; do not push fragments in a loop [54].
- **Borrowed imagery.** Signalis already pairs synthetic persons with The King in Yellow [30]; Inscryption owns the cursed-disk frame [4]. Reference by structure, not by quotation.
- **Tone drift into comedy.** Pony Island, The Hex and There Is No Game play the device for surprise and jokes [2][34][35]. Here every meta line should be something the AI or the harness would plausibly log.

## Sources

Method note: sources 1, 2, 5, 9, 10, 12, 14, 18, 20, 21, 22, 24, 37 and 39 are developer statements, developer-written articles, official pages, or academic or review papers. Wikipedia entries (marked W) were used where the primary interview was unreachable; claims taken from them are the article's cited summaries. Years are publication years where the page gave one.

1. "Game Narrative Review: OneShot", Melissa De La Vega, GDC Vault (Game Narrative Review), 2022. https://media.gdcvault.com/gdc2023/GNR/de+la+vega+GDC+Narrative+Review_OneShot.pdf - mechanisms, opening popup, window-closing puzzle, 43.1% figure, lessons.
2. "How Pony Island teaches players to break a game", Game Developer (formerly Gamasutra), c. 2016. https://gamedeveloper.com/design/how-i-pony-island-i-teaches-players-to-break-a-game - Mullins quotes on expectation-flipping, fake crash and Steam messages, key and keyhole fix.
3. "Pony Island", Wikipedia (W). https://en.wikipedia.org/wiki/Pony_Island - arcade framing, game jam origin, ending request to delete the game.
4. "Inscryption", Wikipedia (W). https://en.wikipedia.org/wiki/Inscryption - three acts, found-footage frame, forced Continue, death cards, Kaycee's Mod.
5. "How a game jam on 'sacrifices' became Inscryption", Game Developer. https://www.gamedeveloper.com/design/how-game-jam-sacrifices-became-inscryption - Mullins on cabin puzzles as persistent progression and on legibility.
6. "Undertale", Wikipedia (W). https://en.wikipedia.org/wiki/Undertale - cross-playthrough dialogue changes, genocide-route consequences, Fox's "utilizes the medium as a storytelling device".
7. "Flowey", Wikipedia (W). https://en.wikipedia.org/wiki/Flowey - save destruction and save states in the boss fight, Psycho Mantis comparison.
8. "Doki Doki Literature Club!", Wikipedia (W). https://en.wikipedia.org/wiki/Doki_Doki_Literature_Club! - act structure, character-file deletion, Plus virtual desktop.
9. "Content warning", Team Salvato, official site. https://ddlc.moe/warning.html - wording and scope of the warning.
10. "Behind the scenes of Doki Doki Literature Club Plus", MCV/Develop, 2021. https://mcvuk.com/business-news/insisting-that-ddlc-must-be-experienced-in-one-specific-way-would-be-a-very-elitist-and-pretentious-mindset-for-us-to-have-behind-the-scenes-of-doki-doki-literature-club-plus/ - Salvato on content warnings.
11. "Nier: Automata", Wikipedia (W). https://en.wikipedia.org/wiki/Nier:_Automata - ending E mechanics, origin of player messages, save sacrifice.
12. "Observing NieR: Automata's world and how players help realize its future", RPG Site. https://www.rpgsite.net/feature/5880-observing-nier-automatas-world-and-how-players-help-realize-its-future - only those who sacrificed could help; player as observer.
13. "Nier (video game)", Wikipedia (W). https://en.wikipedia.org/wiki/Nier_(video_game) - fourth ending deletes all save data; later playthroughs reveal enemy sentience.
14. "Yoko Taro NieR: Automata interview", Game Informer, 2017. https://gameinformer.com/b/features/archive/2017/11/24/yoko-taro-nier-automata-interview-game-informer - layered endings, players need not see all.
15. "Psycho Mantis", Wikipedia (W). https://en.wikipedia.org/wiki/Psycho_Mantis - memory card reading, rumble, port swap, Kojima's reasoning.
16. "Metal Gear Solid 2: Sons of Liberty", Wikipedia (W). https://en.wikipedia.org/wiki/Metal_Gear_Solid_2:_Sons_of_Liberty - AI Colonel, mission as stress test, design-document quote, Higgin chapter title.
17. "Eternal Darkness", Wikipedia (W). https://en.wikipedia.org/wiki/Eternal_Darkness - sanity meter, effect types, Nintendo's hardware concern.
18. "Eternal Darkness as metacommentary", Ryan Banfi, Jump Cut, 2025. https://www.ejumpcut.org/currentissue/RyanBanfi/text.html - 42 effects, fake save deletion, Dyack and Miyamoto, critique of the Brechtian reading.
19. "The Stanley Parable", Wikipedia (W). https://en.wikipedia.org/wiki/The_Stanley_Parable - narrator mechanism, endings, Wreden's intent and fifty-fifty estimate.
20. "Behind the scenes with The Stanley Parable", Game Developer. https://www.gamedeveloper.com/business/behind-the-scenes-with-i-the-stanley-parable-i- - missed choices in playtests, flowchart removed.
21. "Inside The Stanley Parable, the game no one can describe", Kill Screen. https://killscreen.com/inside-stanley-parable-game-no-one-can-describe - Wreden's "that's your mirror".
22. "Deep Dive: Player-centered narrative design in Slay the Princess", Tony Howard-Arias, Game Developer. https://gamedeveloper.com/design/deep-dive-player-centered-narrative-design-in-slay-the-princess - voices tied to last choice, small stage, loop.
23. "Buckshot Roulette", Wikipedia (W). https://en.wikipedia.org/wiki/Buckshot_Roulette - waiver, defibrillator charges, rounds, sales.
24. "Interview with Mike Klubnika, developer of Buckshot Roulette", Mobidictum. https://mobidictum.com/interview-with-mike-klubnika-developer-of-buckshot-roulette/ - GOD and DEALER names, no intended lore, regret.
25. "Universal Paperclips", Wikipedia (W). https://en.wikipedia.org/wiki/Universal_Paperclips - player as AI, activity log, value drift, final choice, 450,000 players.
26. "Baba Is You", Wikipedia (W). https://en.wikipedia.org/wiki/Baba_Is_You - rules as tiles.
27. "Hypnospace Outlaw", Wikipedia (W). https://en.wikipedia.org/wiki/Hypnospace_Outlaw - diegetic OS, enforcer role, consequences.
28. "Kentucky Route Zero", Wikipedia (W). https://en.wikipedia.org/wiki/Kentucky_Route_Zero - choosing lines for several characters, theatre influence.
29. "Disco Elysium", Wikipedia (W). https://en.wikipedia.org/wiki/Disco_Elysium - 24 skills as voices, Thought Cabinet and forgetting.
30. "Signalis", Wikipedia (W). https://en.wikipedia.org/wiki/Signalis - loop, radio puzzles, King in Yellow influence.
31. "Outer Wilds", Wikipedia (W). https://en.wikipedia.org/wiki/Outer_Wilds - 22-minute loop, knowledge-only persistence, small mysteries.
32. "Hades (video game)", Wikipedia (W). https://en.wikipedia.org/wiki/Hades_(video_game) - death as narrative, ten hours of dialogue, why a roguelike.
33. "Imscared", Wikipedia (W). https://en.wikipedia.org/wiki/Imscared - real files, heart.txt, Android replacement of file mechanics.
34. "The Hex (video game)", Wikipedia (W). https://en.wikipedia.org/wiki/The_Hex_(video_game) - premise and creator character.
35. "There Is No Game: Wrong Dimension", Wikipedia (W). https://en.wikipedia.org/wiki/There_Is_No_Game:_Wrong_Dimension - jam origin, "takes the player hostage".
36. "Spec Ops: The Line", Wikipedia (W). https://en.wikipedia.org/wiki/Spec_Ops:_The_Line - loading screens, intent to anger, stopping as an ending, removed save restriction.
37. "Spec Ops: The Line hates you", Game Developer. https://gamedeveloper.com/design/-em-spec-ops-the-line-em-hates-you - Walt Williams quote.
38. "Train (board game)", Wikipedia (W). https://en.wikipedia.org/wiki/Train_(board_game) - typewriter rules, reveal, "feel complicit", "the game is over when it ends".
39. "Brechtian Alienation in Videogames", Daniel Dunne, Press Start, 2014. https://press-start.gla.ac.uk/press-start/article/view/8 - Verfremdungseffekt applied to games (abstract).
40. "Web Storage API", MDN. https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API - persistence, origin scoping, private mode.
41. "Storage quotas and eviction criteria", MDN. https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria - 5 MiB limit, QuotaExceededError, LRU eviction, Safari seven-day rule.
42. "Full Third-Party Cookie Blocking and More", WebKit blog, 2020. https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ - exact wording of the seven-day cap.
43. "Page Visibility API", MDN. https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API - visibility states, rAF pause, timer throttling numbers.
44. "Document: visibilitychange event", MDN. https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event - when it fires, last reliably observable event.
45. "Window: beforeunload event", MDN. https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event - sticky activation, generic string, mobile unreliability.
46. "Autoplay guide for media and Web Audio APIs", MDN. https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay - conditions for audible playback.
47. "Autoplay policy in Chrome", Chrome for Developers. https://developer.chrome.com/blog/autoplay - suspended AudioContext, resume after gesture, Chrome 71.
48. "Element: requestFullscreen()", MDN. https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen - transient activation, Esc.
49. "prefers-reduced-motion", MDN. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion - OS settings, vestibular note.
50. "Using the Notifications API", MDN. https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API - gesture requirement, abuse.
51. "Clipboard API", MDN. https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API - read and write restrictions per browser.
52. "The anchor element: download attribute", MDN. https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a - blob and data URLs, filename.
53. "console", MDN. https://developer.mozilla.org/en-US/docs/Web/API/console - styling, groups, audience.
54. "Window: hashchange event", MDN. https://developer.mozilla.org/en-US/docs/Web/API/Window/hashchange_event - when it fires, support.
55. "Understanding SC 2.3.1: Three Flashes or Below Threshold", W3C WAI. https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html - flash definitions and thresholds.
56. "Xbox Accessibility Guideline 118" (photosensitivity), Microsoft Learn. https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/118 - 1 in 4,000, prefer removal over warnings, failure criteria.
57. "Xbox Accessibility Guideline 117" (moving, blinking and auto-updating content; motion), Microsoft Learn. https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117 - stop moving and blinking content, shake options.
58. "Game Accessibility Guidelines: full list". https://gameaccessibilityguidelines.com/full-list/ - text at own pace, bypass, replay, sound, flicker.
59. "Photosensitive epilepsy", Epilepsy Society (UK). https://epilepsysociety.org.uk/about-epilepsy/epileptic-seizures/seizure-triggers/photosensitive-epilepsy - 3-30 Hz range, 16-25 Hz peak, pattern triggers.
