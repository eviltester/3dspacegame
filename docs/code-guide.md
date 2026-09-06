# Code Guide

This guide explains how the game fits together before you dive into individual functions. Paths below are relative to the repository root. Most gameplay modules also begin with a short description of what they own.

## Start Here

1. Read `src/main.ts`: the browser entry point creates `ArcadeGame`.
2. Read the types at the top of `src/arcade.ts`: these describe a run, its equipment, its retry checkpoint and the persistent profile.
3. Read `src/game.ts` in this order: constructor, `frame`, `step`, `completeStage`, `nextStage`. It connects the smaller systems and controls transitions between them.
4. Pick one system from the map below. Read its nearby `.test.ts` files for concrete examples, including failure cases.

`game.ts` is the coordinator, not the place to add every rule. For example, weapon specifications belong in `weapons.ts`, collision resolution in `combat/projectiles.ts`, and purchases in `arcade.ts`.

## Three Different Kinds Of State

| Term | Meaning | Examples |
| --- | --- | --- |
| Mode | Which overall game you selected | Journey, Attack Challenge, Invaders, Smuggler |
| Run phase | Where the current run is in its progression | briefing, playing, cleared, recovery, shop, gameover |
| Menu | Which overlay is currently on screen | title, pause, controls, weapons, scores |

A pause menu can sit over a `playing` run without changing its mission. Returning from Controls should therefore resume that run, not start a new stage. Input and simulation stop while a menu is open; menu previews have their own animation time.

`GAME_MODES` defines stable mode identifiers; `MODE_INFO` supplies display names and descriptions.

## One Frame Of Play

The browser calls `ArcadeGame.frame` through `requestAnimationFrame`. That callback renders the scene and accumulates elapsed time. Gameplay advances in fixed steps of 1/60 second, independent of display refresh rate. Long browser stalls are clamped rather than replayed as seconds of unexpected combat.

For each simulation step:

1. `FlightInput` provides accumulated mouse movement, held keys and one-shot actions. It clears consumed events so a click is not repeated accidentally.
2. Exactly one movement system takes control: free flight, the armada lane, or a flight course. The bonus/course branch returns early, leaving the normal combat world inactive.
3. In normal combat, the encounter director releases scheduled fighters when there is space. Enemy AI moves actors, chooses faction-appropriate targets and advances attack warnings.
4. Player fire and the projectile controller resolve combat. World interactions collect cargo, trade, scan for contraband and keep the player outside solid landmarks.
5. Objective checks decide whether the stage is complete. Completion pays once, then starts recovery or activates the Warp Gate.

The HUD reads the result, normally at 20 updates per second. It does not decide whether a reward has been earned. Visual sparks and sounds respond to gameplay events; they are not damageable world actors.

## Coordinates And Collisions

The game uses Three.js vectors: +X is right, +Y is up, and the ship faces local -Z. Distances and velocities use world units; simulation durations are seconds. A quaternion stores orientation without a fixed pitch limit. Local-axis rotation lets the ship loop continuously without hitting an artificial up/down stop.

Free flight puts the camera in the cockpit. Armada encounters instead constrain the ship to an X/Z battle plane and use an elevated perspective camera. Radar always projects relative to the ship's position and orientation, not that external camera.

Fast projectiles use **swept collision**: test the whole movement segment from the previous position to the new one, not just the endpoint. Contacts are resolved in travel order; piercing shots remember which actors they already hit. Shooting down enemy fire uses relative movement so two fast projectiles can meet between ticks.

Warp Gates are openings, not solid balls. Gate checks find where a movement segment crosses the gate's local plane and whether that crossing is inside its aperture. Canyon gates use a similar crossing check that also accounts for their motion and the craft's clearance.

Course weapons currently use an immediate ray test with separate visual bolts. They share weapon specifications and effects, but do not run through the main world's travelling-projectile controller. Keep this distinction in mind when changing weapon behaviour.

## Checkpoints And Rewards

`RunState` holds current equipment and a separate deep copy of the resources available at the start of the stage. A retry restores that copy. Lives and continued status are outside it so restoring equipment cannot undo a death.

`loseLife` spends a life and restores resources. `retry` alone does not spend one. Continuing at zero lives grants three lives and clears both the current and checkpoint score; otherwise the next retry could restore pre-continue points.

Completing a stage marks `cleared` before further completion calls can award anything again. Time bonuses distinguish `null` (not paid) from `0` (paid with no time remaining). Bonus offers likewise track available, entered, settled and skipped states. These markers prevent repeated callbacks or resumed screens from paying twice.

Advancing banks the completed stage and dock purchases into the next stage's retry baseline. Saving during a fight stores a restartable checkpoint, not positions of every ship and shot. `saveCheckpoint` works on a clone so saving does not reset the live game. Reloading an interrupted optional bonus cannot replay its payout; interrupted Smuggler legs restart without banking unfinished cargo.

Persistence is local-only. `ArcadeGame.persist` writes `vector-shooter-save-v2`; `parseProfile` validates stored profiles and supplies defaults for missing fields. Level Warp runs are marked `practice` and must not update real checkpoints, records or permanent unlocks.

## Bonus Or Main Mission?

`BonusController` owns a temporary craft, health, charge, course objects and an end reason. It never spends a main-run life or writes a save itself. `CanyonCourse` handles the more detailed canyon route, gates, obstacles and guns beneath that controller.

In Journey and Attack Challenge these are optional sorties. Completion, failure or early exit settles partial rewards once and leaves the main ship and lives intact.

In Smuggler Run the same courses are the main missions. Only reaching the exit banks the haul; failure costs a life and rolls back the leg. Score thresholds award lives from banked points, including consuming thresholds while already at the five-life cap. Sharing the course controller does not mean sharing the reward or failure rules.

## Where To Make Changes

| Change | Start with |
| --- | --- |
| Modes, displayed names and summaries | `src/modes.ts` |
| Stage rosters, arrival schedules, bosses | `src/encounters.ts` and `src/world/actors.ts` |
| High-wave combat pressure | `src/endless-difficulty.ts` |
| Invader formations and attack paths | `src/invaders.ts` and `src/armada.ts` |
| Smuggler delivery/life rules | `src/smuggler.ts` |
| Course difficulty, target counts and shot penalties | `src/bonus-difficulty.ts` |
| Asteroids, splitting and ordered targets | `src/bonus.ts` |
| Canyon path, moving gates, gunfire and exit wall | `src/canyon.ts` |
| Mouse behaviour and pause safety | `src/input.ts` |
| Keyboard bindings and control labels | `src/input-layouts.ts` |
| Weapon speed, spread, cooldown, tiers and help | `src/weapons.ts` |
| Projectile collisions and interceptions | `src/combat/projectiles.ts` |
| Enemy movement, warnings and faction targets | `src/combat/enemies.ts` |
| Cargo prices and faction-law rules | `src/logic.ts` |
| Pickups, upgrades, lives, payouts and saves | `src/arcade.ts` |
| Magnet movement, proximity trade and scans | `src/world/interactions.ts` |
| High-score tables and deduplication | `src/scores.ts` |
| Menus, preview behaviour and focus | `src/menus/` and `src/ui.ts` |
| HUD, hit effects and radar | `src/rendering/` and `src/radar.ts` |
| Spinning hull breakup and secondary particle showers | `src/rendering/ship-panels.ts` and `src/rendering/ship-explosions.ts` |
| Original ship/pickup outlines and guide entries | `src/models/` |
| Single-stroke title lettering | `src/vector-title.ts` |
| Sound phrases and playback | `src/sound.ts` |
| Layout and colours of browser overlays | `src/style.css` |

Shared cargo and faction-law rules live in `logic.ts`. Run progression, weapon-family tiers and stage sequencing belong in `arcade.ts` and `encounters.ts`.

## Ownership And Safety

- `ActorWorld` creates/removes live actors. Enemy and projectile controllers report events through callbacks so they do not need to own menus, scores or persistence.
- `Actor.essential` protects mission cargo from NPC collection and identifies objective ships/bosses. Police normally fight pirates, collect contraband only, and hunt the player when wanted.
- Aim assistance and defensive blasts must not select innocent ships. Deliberately hitting protected ships remains a separate law-system decision.
- Ships and course objects own GPU resources. Removing a Three.js object from a scene is not enough: `disposeObject` frees geometries, materials and textures. Model factories return fresh instances so previews cannot dispose a live game's model.
- Seeded randomness makes encounters and courses reproducible. Avoid introducing unseeded randomness into gameplay rules; fixed backgrounds use a separate seed.
- Preserve limits on active hostiles, warned attackers, projectiles and fragments when increasing difficulty. More pressure need not mean unbounded simultaneous work or unavoidable fire.

## Tests As Examples

Source-adjacent `*.test.ts` files test rules and real controllers with explicit state, time and vectors. Playwright's `tests/e2e/*.spec.ts` files test the browser integration: inputs, screens, audio scheduling, rendered pixels and progression.

The shared `GameDriver` provides both ordinary UI actions and clearly named shortcuts for arranging an edge case. `MousePilot` reads state to aim but uses actual input and combat, with the clock accelerated. A 99-checkpoint fixture traversal is useful coverage, but is not a claim that a human has fought all 99 stages.

Run `npm run test:unit` for quick feedback, `npm test` for unit and browser tests, or `npm run check` for lint, types, both suites and a production build. See [Testing](testing.md) for suite responsibilities and coverage limits.

Keep comments focused on intent, units, ownership, ordering and surprising rules. When behaviour changes, update the explanation and its regression test together. Comments should help a reader reason about the code, not merely repeat each statement in English.
