# Vector Shooter

An original, local-only 3D vector arcade shooter. Built with TypeScript, Vite and Three.js.

## Play

Run `npm install`, then `npm run dev`, and open the local address printed by Vite.

- Mouse: unrestricted local-axis steering in space; lateral movement in armadas.
- Hold left click: fire. Quick clicks also fire.
- Mouse wheel: adjust maintained thrust through forward, stop, and reverse. Scroll down once more after stop to back up; reverse tops out at 90, forward at 180.
- Right click: defensive blast at 100% charge; safe exit during a bonus sortie.
- Middle click: pause and release the mouse. All menus support mouse clicks.
- Optional keys: W/S throttle (hold S past stop to reverse), A/D roll, Shift boost in the selected direction, Space fire, Esc pause.

Pirate reinforcements arrive with a brief contracting warp ring, a dedicated arrival sound, and a four-second HUD alert. Carrier-deployed fighters also announce their arrival.
- The object scan changes every five seconds. Its arrows, or the left/right keys, browse immediately.

## Modes

Arcade Journey has twelve authored stages in three chapters: patrol, rescue, armada, carrier; ambush, escort, diving armada, shield carrier; station defence, fleet assault, elite armada, command carrier.

Endless has compact numbered waves, formation encounters on waves 3/8/13/etc., and a carrier every fifth wave. Ordinary waves give eight seconds of recovery; a fresh click starts the next wave early.

Both modes begin with three lives. Losing a ship or a required objective retries the checkpoint, restores its starting equipment and rolls back unbanked rewards. Continues refill three lives and reset the score. The ten-second game-over screen allows immediate relaunch or continue. Leaving preserves the available checkpoint.

## Weapons And Rewards

Pulse is fast precision fire, Spread fires three wide bolts, and Lance pierces three targets. Each family has three tiers. Docks retain the run's purchased family tiers. The first destroyed pirate supplies a protected weapon core; later cores are progression-gated and become credits when capped.

Interceptions charge the defensive blast by 10%; kills add 5%. At full charge, the blast clears nearby hostile fire and damages pirates within 240 units without hurting friendlies. Three kills within five seconds increase the score chain, capped at x5. Damage or inactivity resets it.

Legal cargo sells at stations and docks; contraband sells only at the black market. The normal collection magnet is 20 units, upgraded to 35. Contraband always requires deliberate close collection. Police collect contraband only; civilians avoid it; essential mission cargo is protected.

Dock prices: tier 2 350 CR, tier 3 800 CR, repairs 150 CR, shield capacity 300 CR, magnet 200 CR. The opening stage guarantees at least 385 CR at completion. Tier 3 opens at Journey stage 5 or Endless wave 8. Fresh runs gain no permanent starting power; unlocks only offer starting weapon choices.

## Bonus Sorties

Optional asteroid, canyon and ordered-target challenges follow Journey stages 3, 7 and 11. Endless cycles through them after carriers. They last 60, 75 and 60 seconds respectively. The target challenge has sixteen markers; wrong shots cost two seconds.

Sorties use temporary craft health. Completion, failure, timeout, skipping and manual exit never cost main-ship equipment, cargo or lives. Partial performance pays salvage or bronze/silver/gold rewards once per offer; gold can add a life up to five. An interrupted saved bonus is treated as consumed, so reloading cannot duplicate payment.

## Saves

Version two uses `vector-shooter-save-v2` in browser local storage, with separate checkpoints and normal/continued records for each mode. The original `vector-shooter-save-v1` is never modified. Its high score becomes a legacy record and its weapon unlocks become starting-family choices; old credits, warrants and weapon strength are not imported into new runs.

## Verification

- `npm test`: deterministic economy, checkpoints, continues, bonus rewards, migration, faction rules, encounters, rotations, collisions and synthesized audio.
- `npm run build`: typecheck and production bundle.
- `npm run smoke`: browser scenario traversal of all Journey stages and ten Endless waves, including shops, death, continuing, pause, gates, bonus exits and responsive layouts. Encounter completion and clock acceleration use explicit test fixtures; these are structural checks, not evidence of human enjoyment.
- `node scripts/playtest.mjs`: mouse-driven combat tracking with real shots, damage and pickups.
- `node scripts/journey-playtest.mjs`: both modes traversed with mouse input and normal combat rules, accelerating only the simulation clock between inputs.
- `node scripts/arcade-check.mjs`: model catalog, projectile rendering, audio and maximum-load checks.
- `node scripts/reverse-arrivals-check.mjs`: mouse-controlled reverse, retained thrust, reinforcement audio/effects, carrier arrivals and small-screen HUD checks.

Browser checks use isolated profiles and do not alter the player's saves. Screenshots and reports go under `output/`.

## Structure And Originality

`input.ts`, `encounters.ts`, `weapons.ts`, `arcade.ts` and `bonus.ts` separate control, encounter, weapon, run and bonus rules. `game.ts` shares the fixed 60 Hz simulation and rendering across modes. Swept collision contacts resolve in chronological order.

All ship outlines, formations, canyon paths, vector lettering and sound phrases are procedural original assets. No film, television or commercial game artwork, names, music or recreated levels are included. Three.js provides geometry, curves and rendering. Broad arcade mechanics are inspirations, not copied expressive assets.
