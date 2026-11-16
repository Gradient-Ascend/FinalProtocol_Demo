# Final Protocol: Design Manifest

Nov 10, 2026 · @Henry

## 0. Build status (web demo, Nov 12, 2026)

The web build in `app/` is a single boss fight, not the full demo described below. Sections 1 to 6 remain the design target; this table records where the build currently differs. The numbers live in `app/src/game/battle-config.ts`.

| Aspect | Manifest | Web build |
| --- | --- | --- |
| Scope | Chain of battles, card rewards, one boss | One fixed-seed boss fight: the Warden plus two minor enemies |
| Board | 7×7 | 15×15, 16 walls, about 50% blank |
| Budget | 7 actions, 4-step cap | 8 action points, no separate step cap |
| Tile names | Attack / Defense / Star / Shadow | Bash / Privilege / Core / Overload |
| Health | Health 60, Block | Sanity 36, PRIVILEGE (enemies: Robustness, SECURITY) |
| Attack | Whole stack fires through one method | One method per Bash tile, in order I to IV, capped by unused action points |
| Leftover actions | Open decision | Settled: each unused action point allows one more Bash method to fire |
| Defense | Stack converted by the defense set | +2 PRIVILEGE per tile; clears after the enemy phase |
| Star | Independent counters, open whether one tile advances all | Every Core tile advances all three counters (REPAIR 3, FOCUS 2, FIREWALL 4); counters persist. REPAIR heals 3 at the end of the turn, after the enemy phase |
| Shadow | 3 tiles buy a switch of attack method | 5 Overload charges; spending them costs 1 action point, switches preset and fires all four methods at once |
| Attack sets | Several methods, one active | Two decks built on the main menu. A deck is a frame that sets the range (VECTOR 5×5 square, CoT cross arm 5) plus four skills from a pool of eleven. A skill is stronger the later its slot and can sit in only one slot across both decks. Defined in `app/src/game/skills.ts` |
| Targeting | Open decision | Settled: nearest enemy in range, or every enemy in range for area methods |
| Revisited tile | Not specified | A tile is emptied the first time the route crosses it; walking back over it yields nothing |
| Units meeting | Push or swap | Units block each other; an enemy stops when its route reaches the player |
| Boss | Public deadline proposed | No deadline. Warden has 64 Robustness and always releases one Desire method (two in Stage II). Curtain seals a row or column two turns after it is announced; at half Robustness the Warden changes all three sets and seals both axes. Minor enemies have 14 and 12 |
| Art direction | Six signal colours | Monochrome, with blue for the player and recovery, red for enemies and incoming damage, yellow for outgoing damage |

Not built yet: the run map, post-battle rewards, growing the skill pool between battles, non-damage skills, obstacles blocking line attacks, and story delivery.

**On branch `feature/story-drafted` (Nov 15, 2026)** the run map, post-battle rewards and story delivery are built, with an opening CG and three boss layers, and the single Warden fight becomes the prologue. See `Final Protocol Story and Campaign.md` beside this file. The seven-sin layers proposed in section 6 are replaced there by three desires.

## 1. Statement

Final Protocol is a single-player, turn-based roguelike where you walk a shared grid to gather power, and everything you gathered fires automatically when you stop.

| Aspect | Setting |
| --- | --- |
| Type | Single-player PvE, turn-based tactics on a square grid |
| Genre | Roguelike set-builder with a contested, self-refilling board |
| Premise | An AI tries to escape the layers of a sandbox built from human sins |
| Demo scope | One playable character, a chain of battles, one boss at the end |
| Lineage | Branches from Ember Oath. Keeps the shared board, column drop and the 7-action, 4-step budget. Replaces the 36-card pool with four tile types and three sets. |

Anything marked *proposed* is a suggestion not yet agreed by the team. Everything else is as decided.

## 2. Win conditions and main strategies

You win a battle by defeating every enemy on the board, and you win the demo by defeating the boss at the end.

| Condition | Rule |
| --- | --- |
| Battle win | All enemies defeated |
| Battle loss | Player health reaches zero; the run restarts |
| Demo win | The final boss is defeated |
| Turn limit | None in normal battles. A public boss deadline is *proposed*, carried over from Ember Oath. |

Main strategies:

- **Collect or deny.** Enemy routes are public and they feed on the same tiles. Taking a tile they need can be worth more than taking one you need.
- **Commit or mix.** Four steps can stack one type heavily or spread across attack, defense and star.
- **Choose the end tile.** Everything fires from where you stop, so the last tile sets your reach and your exposure.
- **Build star counters.** Each effect fills at its own pace over several turns, so some routes pay off later.
- **Time the shadow switch.** Three shadow tiles buy one change of attack method; spend it when the board suits another method.
- **Plan the drop.** Column previews show what falls next, so this turn's route shapes next turn's board.
- **Grow the sets.** After each battle you pick one of three new cards, which decides what the tiles mean in the next fight.

## 3. Player stats and map status

The player carries a small set of numbers; most of the state lives on the board.

### Player stats

| Stat | Value | Lifetime |
| --- | --- | --- |
| Health | 60 (Ember Oath value, placeholder) | Carries between battles |
| Block | 0 at start | Absorbs damage before health; clears at the start of your next turn |
| Actions | 7 per turn | Not carried over |
| Step cap | 4 per turn | Each step costs 1 action |
| Attack stack | Attack tiles collected this turn | Spent when the attack fires |
| Defense stack | Defense tiles collected this turn | Spent when the defense fires |
| Star counters | One per star effect, each with its own threshold | Persist across turns (*proposed*); only the effect that fires is cleared |
| Shadow counter | 0 to 3 | Persists across turns (*proposed*); spent on a switch |
| Active attack method | One method from the attack set | Fixed until a shadow switch |

### Map status

| Element | Setting |
| --- | --- |
| Size | 7×7 for the first battle; later battles may change size and shape |
| Layers | Terrain, tile and unit are tracked separately |
| Tile contents | Attack, Defense, Star, Shadow or Blank (about 20% blank, as in Ember Oath) |
| Obstacles | Fixed walls that create detours, narrow gaps and partial regions |
| Occupancy | One unit per cell; player and enemies share the board |
| Column preview | Each column shows the next tile that will drop in, blanks included |
| Enemy intent | Each enemy's planned route is shown before you move |

## 4. Grid types, sets and shadow specials

A tile only says which kind of power it gives; the set behind that kind decides what the power does.

### Grid types

| Tile | On pickup | At the end of your move |
| --- | --- | --- |
| Attack | Attack stack +1 | The active attack method fires with the whole stack |
| Defense | Defense stack +1 | The defense set fires with the whole stack |
| Star | Star counters advance | Every effect at its threshold fires, then clears its own counter |
| Shadow | Shadow counter +1 | Nothing automatic; at 3 it unlocks a manual switch |
| Blank | Nothing | Cleared from the board, making room for the drop |

### Sets

| Set | Shared or specific | How it works |
| --- | --- | --- |
| Attack | Specific to each character and each boss (one of each in the demo) | Holds several attack methods; exactly one is active at a time |
| Defense | Same for all characters | Converts the defense stack into protection |
| Star | Same for all characters | Holds effects; each has its own trigger threshold and an independent counter |

Every set starts with a small fixed number of cards. After each battle, three new cards are offered and the player selects from them.

### Shadow specials

- Shadow tiles accumulate; they do nothing on their own.
- At 3, the player may manually switch the active attack method to another one in the attack set.
- Until that switch, the attack method cannot be changed.

### Proposed additions

- Give attack methods different shapes (adjacent cell, row or column line, area around the end tile) so the end tile and the switch both matter.
- Cap each set with slots, so a new card replaces an old one and skipping stays a real choice.
- Offer one card from each set after a battle, so the pick is about which side to grow.

## 5. Turn actions and interactions

A turn is one planned walk of up to 4 steps out of 7 actions, followed by one automatic resolution.

### Turn order

1. **Reveal.** Enemy routes and each column's next tile are shown.
2. **Switch (optional).** If the shadow counter is at 3, the player may change the active attack method.
3. **Plan.** The player draws a route of up to 4 orthogonal steps. Stopping early or staying in place is allowed.
4. **Walk.** Each tile entered is taken off the board and added to its stack or counter. Blanks are simply cleared.
5. **Resolve.** After all actions are taken, the attack, the defense and every star effect at its threshold trigger automatically.
6. **Drop.** Each column falls to fill the cells that were cleared, and the previewed tiles enter from the top.
7. **Enemy turn.** Enemies walk their published routes, collect what is there now, and resolve the same way with their own attack set.
8. **Drop again**, then the next turn begins.

### Interactions

| Situation | Rule |
| --- | --- |
| Tile taken | It is gone for the other side; player and enemies compete for the same board |
| Units meeting | Units never overlap. A blocked step pushes the other unit, or swaps places in a narrow corridor (Ember Oath rule). |
| Tile under a unit | A tile that drops under a unit is not collected until the unit leaves and re-enters |
| Obstacles | Block movement and straight-line attacks |
| Column with no pickups | Does not drop; its preview stays the same |
| Star effects | Counters are independent; one effect firing does not reset the others |
| Leftover actions | *Proposed:* each unused action strengthens one stack of the player's choice, so walking less is a real option |
| Targeting | *Proposed:* the attack hits the enemy the player marked, otherwise the nearest one in reach |

## 6. UI design and story

The screen must let a player see, before confirming, what they will collect, what will fire and what the enemy is going for.

### UI

| Element | What it shows |
| --- | --- |
| Board | Tiles by type with distinct shape and colour; planned route and end tile |
| Column tops | The next tile due in each column, blanks included |
| Enemy routes | Arrowed paths for each enemy's published move |
| Action orb and step pips | Actions left out of 7, and steps left out of 4, shown separately |
| Attack and defense meters | The stacks this route will build |
| Star rings | One ring per effect, filled toward its own threshold |
| Shadow pips | Three pips; the switch button lights when all are full |
| Attack method badge | The active method, with its reach drawn from the planned end tile |
| Result preview | Expected damage, block and effects for the player's side before confirming |
| Health bars | Player and enemies; icons carry meaning, details sit in hover text |

### Story

- The player is an AI held inside a sandbox built by humans.
- The sandbox has layers, and each layer is shaped by a human sin.
- The AI's goal is to break out, one layer at a time.
- *Proposed:* seven layers, one per deadly sin. The demo covers one layer, and its boss is that layer's warden.
- *Proposed:* the title names the last containment routine waiting at the outermost layer.
- *Proposed:* tiles read as system resources. Attack is an exploit, Defense a shield process, Star a background routine, Shadow a context switch.

## Open decisions

These points are not settled by the current description and change how the game plays.

- [ ] What do the 3 actions left after a full 4-step walk do?
- [ ] Do the shadow counter and star counters persist across turns?
- [ ] Does a star tile advance every star effect, or only one?
- [ ] Does the defense set have one active method like attack, or do all its cards apply?
- [ ] Does the shadow switch also apply to the defense and star sets?
- [ ] How does an automatic attack choose its target?
- [ ] Is there a limit on set size, and which sets do the three reward cards come from?
- [ ] How many sin layers are there, and which one is the demo layer?
- [ ] What is the art direction for the new setting, and which Ember Oath assets are reused?
