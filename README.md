# Vector Shooter

An original, local-only 3D vector arcade shooter. Built with TypeScript, Vite and Three.js.

## Play

Run `npm install`, then `npm run dev`, and open the local address printed by Vite.

- Mouse: unrestricted local-axis steering in space; lateral movement in armadas.
- Hold left click: fire. Quick clicks also fire.
- Mouse wheel: adjust maintained thrust through forward, stop, and reverse. Scroll down once more after stop to back up; reverse tops out at 90, forward at 180.
- Right click: defensive blast at 100% charge, including bonus sorties. To leave a bonus early, pause and choose Exit Bonus Safely.
- 1 / 2 / 3: select Pulse / Spread / Lance during flight. Tab or a short mouse-wheel click cycles in that order.
- Hold the mouse-wheel button for 0.6 seconds, or press Esc: pause and release the mouse. A long hold does not change weapons. All menus support mouse clicks.
- Optional keys: W/S throttle (hold S past stop to reverse), A/D roll, Shift boost in the selected direction, Space fire, Esc pause.

Pirate reinforcements arrive with a brief contracting warp ring, a dedicated arrival sound, and a four-second HUD alert. Carrier-deployed fighters also announce their arrival.

The 3D radar is relative to the ship's current heading and flight plane. Solid stems rise to contacts above you; dashed stems descend to contacts below. Cargo keeps its triangle symbol and Warp Gates keep their cross symbol.

Armada briefings explain the tractor-beam trap. These stages use an elevated, angled view of the player's ship and receding enemy rows. Later armadas increase from four ships per flight to fourteen, using up to three rows with all columns inside firing reach. Total hostiles still cap at eighteen and attackers at six. Mouse movement slides the ship along its defensive lane; destroying the armada releases the beam and restores cockpit flight. Dropped salvage drifts into the lane at 24 units per second, so it can be caught during combat. Protected cargo waits at the lane if missed; ordinary drops pass through, and contraband still requires direct contact.
- The object scan changes every five seconds. Its arrows, or the left/right keys, browse immediately.

## Modes

Arcade Journey has 99 stages. The original twelve-stage opening stays intact: patrol, rescue, armada, carrier; ambush, escort, diving armada, shield carrier; station defence, fleet assault, elite armada, command carrier. Stages 13-96 remix those encounter types with shifted enemy combinations, more flights and shorter arrival gaps. Stages 97-99 close with an ambush, a fleet assault and the Terminal Carrier. Ordinary fighter health stays fixed; hostiles cap at 18, attackers at six and projectile-speed growth at 35%.

Endless has compact numbered waves, formation encounters on waves 3/8/13/etc., and a carrier every fifth wave. Its own difficulty curve raises movement, firing cadence, aiming lead and reinforcement pressure after every wave, including beyond wave 1000. Reinforcement budgets grow logarithmically with the wave number; handling speeds approach playable limits instead of growing without bound. Ordinary-wave recovery decreases from eight seconds initially to about 2.75 seconds at wave 1000; a fresh click still starts the next wave early. Journey tuning is unchanged.

Later Endless carriers have finite escort flights as well as their own drone bays. Wave 10 has one escort flight; wave 100 has four; wave 1000 has seven flights of fourteen fighters, plus a carrier capable of launching seventeen more until its lower bays are destroyed. Destroying the carrier does not skip its remaining escort flights. Ordinary wave 1001 has thirteen flights; wave 10001 has eighteen. Scheduled flights arrive about every four seconds at wave 1000, with quicker replacement after a fast clear.

Enemy hull and damage stay fixed. Fighters acquire three-shot fans at wave 75, and heavy ships five-shot fans at wave 150. The 0.8-second attack warning and initial spawn grace remain intact. Eighteen hostiles, six simultaneous attackers, 240 live projectiles and 35% projectile-speed growth remain hard safety limits. Difficulty is derived from mode and wave, so retries and resumed checkpoints reconstruct the same challenge without adding save fields.

Both modes begin with three lives. Losing a ship or a required objective retries the checkpoint, restores its starting equipment and rolls back unbanked rewards. Continues refill three lives and reset the score. The ten-second game-over screen allows immediate relaunch or continue. Leaving preserves the available checkpoint.

Each main stage or wave has a two-minute bonus clock. Entering the Warp Gate pays 10 CR per whole second remaining, with the potential payout shown beside the countdown. The clock keeps running after the objective is complete: grab more cargo or leave quickly for a larger time bonus. Zero ends the bonus, not the mission. Ordinary Endless waves pay when the next wave starts, so clicking early beats waiting through recovery. Briefings, pauses, shops and optional bonus sorties do not consume main-level time. Gate awards are saved immediately and paid only once, even if reloaded during warp.

## Weapons And Rewards

Pulse is fast precision fire, Spread fires three wide bolts, and Lance pierces three targets. Each family has three tiers. Docks retain the run's purchased family tiers. The first destroyed pirate supplies a protected weapon core; later cores are progression-gated and become credits when capped.

In-flight weapon changes retain each family's purchased tier and do not reset the firing cooldown, shield, blast charge or throttle. All three families are available in flight; permanent unlocks still determine the starting-family choices for fresh runs. Bonus skiffs use independent tier-one weapons with the same selection controls, leaving your main ship's equipment untouched.

Interceptions charge the defensive blast by 10%; kills add 5%. At full charge, the blast clears nearby hostile fire and damages pirates within 240 units without hurting friendlies. Three kills within five seconds increase the score chain, capped at x5. Damage or inactivity resets it.

Legal cargo sells at stations and docks; contraband sells only at the black market. The normal collection magnet is 20 units, upgraded to 35. Contraband always requires deliberate close collection. Police collect contraband only; civilians avoid it; essential mission cargo is protected.

Dock prices: tier 2 350 CR, tier 3 800 CR, repairs 150 CR, shield capacity 300 CR, magnet 200 CR. The opening stage guarantees at least 385 CR at completion. Tier 3 opens at Journey stage 5 or Endless wave 8. Fresh runs gain no permanent starting power; unlocks only offer starting weapon choices.

## Bonus Sorties

Optional asteroid, canyon and ordered-target challenges cycle after Journey stages 3, 7, 11, 15 and every fourth stage through 95. Endless cycles through them after carriers. Each bonus has eight difficulty levels: Journey stages 3/7/11 use difficulty 1, stages 15/19/23 use difficulty 2, through stages 87/91/95 at difficulty 8. Endless raises difficulty every three bosses (fifteen waves), also capped at 8. Briefings and the HUD show the current difficulty; seeds reproduce each field.

Target Sequence lasts 60 seconds, increasing from 16 to 30 shuffled markers. Higher difficulties add seeded position variations, smaller mixed-size rings and faster movement. The next target is yellow. The field stays still until the first correct hit, then remaining markers drift in separate bounded paths and accelerate as more are cleared. Numbers move with their rings and do not overlap. Pausing freezes the motion along with the clock.

Each correct target earns 100 points. Every fired shot deducts 5, including misses and wrong-target hits; Spread counts as one volley, not three pellets. Holding fire counts each actual shot. Wrong targets also cost two seconds. The HUD shows shots fired and net bonus score, and results show hits, shots and net points. Shot costs reduce medals as well as score; a perfect run pays 1,520 points on difficulty 1 or 2,850 on difficulty 8. Negative bonus scores bank zero and never subtract from the main ship's banked score. Defensive blasts do not shoot or damage markers.

Canyon sorties accelerate automatically from 48 to 144 speed on difficulty 1, rising to about 72 to 215 on difficulty 8. W/S, arrow throttle keys and wheel-down cannot accelerate or brake; Shift or wheel-forward gives 1.5x boost. A wheel-forward pulse lasts 1.5 seconds and can be refreshed. Pausing clears boosts, and normal throttle controls return after the bonus. Follow 18 green gates that move and shrink from roughly 18 to 7 units in radius; higher difficulties make them a little smaller and quicker. One miss is allowed; passing a gate resets the miss streak, while two consecutive misses end the sortie immediately. The final wall has a labelled EXIT opening: fly through to finish or hit the wall. Completion and both failures preserve the main ship and bank partial bonus rewards once.

The canyon grows from 52 shootable amber obstacles and 26 red guns to 80 obstacles and 40 guns. Later guns recover faster and their shots accelerate by up to 35%, but the warning stays at 0.85 seconds and no more than four guns engage together. They lock an intercept before the warning, then fire toward that locked point; change course to evade or shoot back. Hostile bolts are transparent and interceptable for 10% blast charge, and blasts clear nearby gunfire. Geometry leaves a traversable moving-gate corridor. Green gates, guns and obstacles also appear in the five-second object scan.

The asteroid belt has weaving gaps. Shooting a large rock produces two medium rocks; each medium rock splits into two small fragments, which can be destroyed outright. Fragments tumble and drift across the flight path, with a brief bright collision-grace flash after breakup. A volley cannot destroy its own newly spawned fragments. Charged blasts vaporize nearby rocks without splitting them. At most 64 fragments are active, and fragments expire after passing the player or twelve seconds.

Asteroid flight accelerates automatically from 48 to 112 speed across the sixty-second first belt. By difficulty 8, the same route has 180 rocks instead of 110 and takes about 40 seconds, accelerating from about 72 to 167; fragments drift faster too. Each level preserves a traversable weaving gap. The HUD shows the current speed and announces the final approach. A hollow green gate with a yellow EXIT label and arrow sits beyond the last rocks. Fly through its opening to complete the sortie; flying past it ends the bonus as an exit miss, with partial rewards and the main ship preserved. Shots and blasts cannot destroy the gate.

Sorties use temporary craft health. Completion, failure, timeout, skipping and manual exit never cost main-ship equipment, cargo or lives. Partial performance pays salvage or bronze/silver/gold rewards once per offer; gold can add a life up to five. An interrupted saved bonus is treated as consumed, so reloading cannot duplicate payment.

Loan skiffs start with an independent, fully charged defensive blast. Right click clears rocks and hostile surface targets within 240 units, without harming salvage, gates or numbered markers. Successful shots restore 5% charge; the blast does not recharge itself. Your main ship's charge is preserved.

## Saves

Version two uses `vector-shooter-save-v2` in browser local storage, with separate checkpoints and normal/continued records for each mode. The original `vector-shooter-save-v1` is never modified. Its high score becomes a legacy record and its weapon unlocks become starting-family choices; old credits, warrants and weapon strength are not imported into new runs.

Existing completed twelve-stage Journey saves reopen at their stage-12 dock so they can continue into stage 13. Their earnings are preserved and completion rewards are not paid again. New Journey victories occur at stage 99.

## Verification

### Hidden Level Warp

On the title screen, press Up, Up, Down, Down, B, A. A short original chime and "BONUS UNLOCKED" message reveal Level Warp. The unlock survives reloads in the current tab. Its mouse-operated menu jumps to any of the 99 Journey stages, any numbered Endless wave, or directly to Asteroid Run, Canyon Sortie and Target Sequence. The bonus difficulty selector offers levels 1-8 and jumps to the corresponding Journey offer. Briefings still appear before launch. Pause a test flight and choose Choose Level to jump again.

Warp flights use a fixed seed and clean starting equipment. They are labelled TEST and never overwrite normal checkpoints, records or permanent unlocks. Progression, shops, retries and bonus exits still work inside the temporary flight.

### Checks

- `npm test`: deterministic economy, checkpoints, continues, bonus rewards, migration, faction rules, encounters, rotations, collisions and synthesized audio.
- `npm run build`: typecheck and production bundle.
- `npm run smoke`: browser scenario traversal of all Journey stages and ten Endless waves, including shops, death, continuing, pause, gates, bonus exits and responsive layouts. Encounter completion and clock acceleration use explicit test fixtures; these are structural checks, not evidence of human enjoyment.
- `node scripts/playtest.mjs`: mouse-driven combat tracking with real shots, damage and pickups.
- `node scripts/journey-playtest.mjs`: both modes traversed with mouse input and normal combat rules, accelerating only the simulation clock between inputs.
- `node scripts/arcade-check.mjs`: model catalog, projectile rendering, audio and maximum-load checks.
- `node scripts/reverse-arrivals-check.mjs`: mouse-controlled reverse, retained thrust, reinforcement audio/effects, carrier arrivals and small-screen HUD checks.
- `node scripts/radar-check.mjs`: ship-relative radar motion, visible height stems, contact symbols and desktop/mobile layout.
- `node scripts/armada-check.mjs`: tractor-beam briefing, angled formation view, lane controls, combat/interceptions, drifting pickups and free-flight restoration in both modes.
- `node scripts/bonus-blast-check.mjs`: bonus right-click blasts, audiovisual feedback, independent charge, protected targets, pause/resume and explicit safe exits.
- `node scripts/time-bonus-check.mjs`: level countdown, pause, post-objective salvage time, normal gate flight, exact once-only credit payout across reloads, expiry, Endless recovery and responsive timer layout.
- `node scripts/level-warp-check.mjs`: secret keyboard sequence, unlock audio, all stage/bonus destinations, Endless selection, safe test-flight exits, normal-save preservation and responsive menus.
- `node scripts/weapon-switch-check.mjs`: direct/cycled weapon controls, retained upgrades, firing cooldown, weapon sounds, short-click versus hold-to-pause, and bonus loadout isolation.
- `node scripts/asteroid-split-check.mjs`: mouse-shot rock breakup, fragment motion and sound, blast clearing, responsive HUD and a mouse-steered belt traversal.
- `node scripts/canyon-check.mjs`: mouse-steered combat traversal, automatic acceleration, locked throttle, wheel/Shift boost, moving gates, shootable guns, final exit/wall, consecutive misses, single payouts and responsive canyon HUD.
- `node scripts/target-sequence-check.mjs`: shuffled numbering, moving targets, increasing speed, mouse-only ordered shooting, penalties, pause/resume, safe exits and responsive layouts.
- `node scripts/bonus-difficulty-check.mjs`: maximum-difficulty mouse-driven completions of all three bonuses, exact shot costs and payouts, larger armada rendering, and responsive difficulty selection/HUD.
- `node scripts/endless-difficulty-check.mjs`: measured early/late carrier fire and reinforcements, visible animation and combat caps, wave-1000 retry/gate/shop, stronger wave 1001, shorter recovery, and responsive briefings. Stationary samples measure pressure, not human playability.

Browser checks use isolated profiles and do not alter the player's saves. Screenshots and reports go under `output/`.

## Structure And Originality

`input.ts`, `encounters.ts`, `weapons.ts`, `arcade.ts`, `bonus.ts` and `canyon.ts` separate control, encounter, weapon, run and bonus-course rules. `game.ts` shares the fixed 60 Hz simulation and rendering across modes. Swept collision contacts resolve in chronological order.

All ship outlines, formations, canyon paths, vector lettering and sound phrases are procedural original assets. No film, television or commercial game artwork, names, music or recreated levels are included. Three.js provides geometry, curves and rendering. Broad arcade mechanics are inspirations, not copied expressive assets.
