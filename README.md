# 3D Vector Space Shooter

An original, local-only 3D vector arcade shooter. Built with TypeScript, Vite and Three.js.

## Play

Run `npm install`, then `npm run dev`, and open the local address printed by Vite.

- Mouse: unrestricted local-axis steering in space; lateral movement in armadas.
- Hold left click: fire. Quick clicks also fire.
- Mouse wheel: adjust maintained thrust through forward, stop, and reverse. Scroll down once more after stop to back up; reverse tops out at 90, forward at 180.
- Right click: defensive blast at 100% charge, including bonus sorties. To leave a bonus early, pause and choose Exit Bonus Safely.
- 1 / 2 / 3: select Pulse / Spread / Lance during flight. Tab or a short mouse-wheel click cycles in that order.
- Hold the mouse-wheel button for 0.6 seconds, or press Esc: pause and release the mouse. A long hold does not change weapons. All menus support mouse clicks and Tab/Shift+Tab followed by Enter or Space.
- With the default Mouse layout, optional keys remain W/S throttle (hold S past stop to reverse), A/D roll, Shift boost, Space fire and Esc pause.

Open **Controls** from the title or pause menu to choose and save a control layout:

| Action | WASD layout | Arrows + Z/X (left-handed) |
| --- | --- | --- |
| Pitch up / down | W / S | Up / Down |
| Turn left / right | A / D | Left / Right |
| Hold to fire | J (or Space) | Z (or Space) |
| Charged blast | K | X |
| Increase / decrease throttle, through stop into reverse | R / F | R / F |
| Roll left / right | Q / E | Q / E |
| Boost | Shift | Shift |
| Select Pulse / Spread / Lance | 1 / 2 / 3 | 1 / 2 / 3 |
| Cycle weapon | Tab | Tab |
| Pause | Esc | Esc |

Keyboard layouts work without pointer lock. In armadas the steering keys slide left/right and vertical movement is locked; in bonus skiffs they move or aim the craft. Canyon throttle remains automatic, but Shift still boosts. Focus loss and hidden tabs pause every layout and clear held inputs. Briefings and the blast-ready prompt show the selected controls. Tab navigates menus when paused, and cycles weapons only during play.

Pirate reinforcements arrive with a brief contracting warp ring, a dedicated arrival sound, and a four-second HUD alert. Carrier-deployed fighters also announce their arrival.

The 3D radar is relative to the ship's current heading and flight plane. Solid stems rise to contacts above you; dashed stems descend to contacts below. Cargo keeps its triangle symbol and Warp Gates keep their cross symbol.

Armada briefings explain the tractor-beam trap. These stages use an elevated, angled view of the player's ship and receding enemy rows. Later armadas increase from four ships per flight to fourteen, using up to three rows with all columns inside firing reach. Total hostiles still cap at eighteen and attackers at six. Mouse movement slides the ship along its defensive lane; destroying the armada releases the beam and restores cockpit flight. Dropped salvage drifts into the lane at 24 units per second, so it can be caught during combat. Protected cargo waits at the lane if missed; ordinary drops pass through, and contraband still requires direct contact.
- Ships & Objects changes the displayed model every five seconds. Its arrows, or the left/right keys, browse immediately.

## Modes

Arcade Journey has 99 stages. The first twelve stages introduce patrol, rescue, armada, carrier; ambush, escort, diving armada, shield carrier; station defence, fleet assault, elite armada, command carrier. Stages 13-96 remix those encounter types with shifted enemy combinations, more flights and shorter arrival gaps. Stages 97-99 close with an ambush, a fleet assault and the Terminal Carrier. Ordinary fighter health stays fixed; hostiles cap at 18, attackers at six and projectile-speed growth at 35%.

Attack Challenge has compact numbered waves, formation encounters on waves 3/8/13/etc., and a carrier every fifth wave. Its own difficulty curve raises movement, firing cadence, aiming lead and reinforcement pressure after every wave, including beyond wave 1000. Reinforcement budgets grow logarithmically with the wave number; handling speeds approach playable limits instead of growing without bound. Ordinary-wave recovery decreases from eight seconds initially to about 2.75 seconds at wave 1000; a fresh click starts the next wave early.

Later Attack Challenge carriers have finite escort flights as well as their own drone bays. Wave 10 has one escort flight; wave 100 has four; wave 1000 has seven flights of fourteen fighters, plus a carrier capable of launching seventeen more until its lower bays are destroyed. Destroying the carrier does not skip its remaining escort flights. Ordinary wave 1001 has thirteen flights; wave 10001 has eighteen. Scheduled flights arrive about every four seconds at wave 1000, with quicker replacement after a fast clear.

Enemy hull and damage stay fixed. Fighters acquire three-shot fans at wave 75, and heavy ships five-shot fans at wave 150. The 0.8-second attack warning and initial spawn grace remain intact. Eighteen hostiles, six simultaneous attackers, 240 live projectiles and 35% projectile-speed growth remain hard safety limits. Difficulty is derived from mode and wave, so retries and resumed checkpoints reconstruct the same challenge without adding save fields.

Invaders is an uninterrupted formation campaign. The defensive lane stays locked between waves. Original alien saucers march, swoop, converge from both flanks and weave; the pattern changes each wave. Flights grow from eight to eighteen aliens, then additional flights keep increasing the total roster. Movement and firing pressure rise every wave within readable limits. Clear a wave to begin the next immediately, or use the short recovery interval. Collect weapon cores and repair cells during combat. Every 20,000 points awards an extra life, capped at five, with the next milestone visible on the HUD. Crossed milestones are consumed even at the cap.

Invaders rewards deliberate aim. Tier-one cooldowns are 0.60 seconds for Pulse, 1.00 for Spread and 1.40 for Lance; each upgrade shortens these by 8% of the base time. Switching weapons does not bypass cooldown. Aliens take staggered firing turns, with individual cooldowns starting at 5.6 seconds and gradually shortening as waves advance. Each attack keeps its visible warning. The HUD shows weapon readiness and the current wave's accuracy, hits, shots and misses; accuracy remains visible during recovery.

Every missed Invaders bolt costs 5 points, with score floored at zero. Spread counts as three shots: one hit and two misses means 33% accuracy and a 10-point penalty. Hitting an alien or intercepting hostile fire counts as a hit; Lance can hit several targets but earns one accuracy hit per bolt. Airborne misses settle when the wave clears. Each new wave starts fresh accuracy counters; respawning preserves the current wave's score and accuracy.

Smuggler Run alternates asteroid belts and canyon runs. Legs 1/2 use difficulty 1, legs 3/4 use difficulty 2, through difficulty 8 at legs 15/16; later legs generate new seeded courses at that maximum difficulty. Each leg uses a fresh three-hit runner with all three tier-one weapons and a defensive blast. Deliver through the EXIT gate to bank 25 points per salvage/target point, plus 1,000 delivery points, 100 per remaining hull point and 150 per difficulty above 1. Crashes, route failure, missed exits and timeouts cost a life and discard that leg's unbanked haul. Every 5,000 banked points awards an extra life, capped at five; thresholds are consumed even at the cap. There is no safe bonus-exit button in this mode. Saving and leaving restarts the same leg without charging a life or banking its unfinished haul.

All four modes begin with three lives. While lives remain, a destroyed combat ship automatically respawns with full hull and shields, keeping the current fight, equipment, cargo, score and wave accuracy. Three seconds of protection flash the visible ship blue; cockpit flight shows a blue shield outline and a lives-remaining message. Protection freezes during pause and restores normal colours when it expires. Failed main objectives and Smuggler courses restart automatically from their checkpoint, rolling back unbanked rewards. Only zero lives opens the ten-second game-over screen; Continue immediately refills three lives and resets the score. Leaving preserves the available checkpoint. Each mode owns its checkpoint, best/continued records and a separate top-ten high-score screen; an ongoing run updates its entry instead of adding duplicate rows.

The title has four mode choices with live, original vector previews. Smuggler's preview alternates the actual asteroid and canyon courses. Previews do not affect saves or scores. Controls, weapon descriptions, high scores and Ships & Objects each have their own menu.

Each combat stage or wave has a two-minute bonus clock. Entering the Warp Gate pays 10 CR per whole second remaining, with the potential payout shown beside the countdown. The clock keeps running after the objective is complete: grab more cargo or leave quickly for a larger time bonus. Zero ends the bonus, not the mission. Ordinary Attack Challenge waves and all Invaders waves pay when the next wave starts, so clicking early beats waiting through recovery. Briefings, pauses, shops and optional bonus sorties do not consume main-level time. Gate awards are saved immediately and paid only once, even if reloaded during warp. Smuggler Run uses course timers and delivery points instead of trading credits.

## Weapons And Rewards

Pulse is fast precision fire, Spread fires a close-range fan, and Lance fires slower bolts that pierce three targets. Each family has three tiers. Help is visible beneath the title's starting-weapon selector and at the dock; the Weapons menu explains all three, including locked starting choices. The HUD weapon readout also has a description on hover. Docks retain the run's purchased family tiers. The first destroyed hostile supplies a protected weapon core; later cores are progression-gated and become credits when capped.

In-flight weapon changes retain each family's purchased tier and do not reset the firing cooldown, shield, blast charge or throttle. All three families are available in flight; permanent unlocks still determine the starting-family choices for fresh runs. Bonus skiffs use independent tier-one weapons with the same selection controls, leaving your main ship's equipment untouched.

Interceptions charge the defensive blast by 10%; kills add 5%. At full charge, the blast clears nearby hostile fire and damages pirates within 240 units without hurting friendlies. Three kills within five seconds increase the score chain, capped at x5. Damage or inactivity resets it.

Destroyed ships shed spinning wireframe hull panels in their faction colours. After a short staggered delay, each panel bursts into a coloured spark shower with a secondary crackle. These are cosmetic effects: kills and cargo pay immediately, debris cannot hit the player or be collected, and pausing freezes the animation. Panel and shower counts are capped during mass kills.

Legal cargo sells at stations and docks; contraband sells only at the black market. The normal collection magnet is 20 units, upgraded to 35. Contraband always requires deliberate close collection. Police collect contraband only; civilians avoid it; essential mission cargo is protected.

Repair cells restore 30 hull and 30 shield, capped at the ship's capacities. Invaders drops repairs, weapon cores and score-bearing cash salvage; capped weapon cores award 200 extra points. Hull and shield recovery in Invaders comes from these pickups or a respawn, with damage carried between waves.

Dock prices: tier 2 350 CR, tier 3 800 CR, repairs 150 CR, shield capacity 300 CR, magnet 200 CR. The opening stage guarantees at least 385 CR at completion. Tier 3 opens at Journey stage 5 or Attack Challenge/Invaders wave 8. Fresh runs gain no permanent starting power; unlocks only offer starting weapon choices.

## Bonus Sorties

Optional asteroid, canyon and ordered-target challenges cycle after Journey stages 3, 7, 11, 15 and every fourth stage through 95. Attack Challenge cycles through them after carriers. Each bonus has eight difficulty levels: Journey stages 3/7/11 use difficulty 1, stages 15/19/23 use difficulty 2, through stages 87/91/95 at difficulty 8. Attack Challenge raises difficulty every three bosses (fifteen waves), also capped at 8. Briefings and the HUD show the current difficulty; seeds reproduce each field. The safe-exit and main-ship preservation rules below apply to optional sorties, not Smuggler Run's life-based deliveries.

Target Sequence lasts 60 seconds, increasing from 16 to 30 shuffled markers. Higher difficulties add seeded position variations, smaller mixed-size rings and faster movement. The next target is yellow. The field stays still until the first correct hit, then remaining markers drift in separate bounded paths and accelerate as more are cleared. Numbers move with their rings and do not overlap. Pausing freezes the motion along with the clock.

Each correct target earns 100 points. Every fired shot deducts 5, including misses and wrong-target hits; Spread counts as one volley, not three pellets. Holding fire counts each actual shot. Wrong targets also cost two seconds. The HUD shows shots fired and net bonus score, and results show hits, shots and net points. Shot costs reduce medals as well as score; a perfect run pays 1,520 points on difficulty 1 or 2,850 on difficulty 8. Negative bonus scores bank zero and never subtract from the main ship's banked score. Defensive blasts do not shoot or damage markers.

Canyon sorties accelerate automatically from 48 to 144 speed on difficulty 1, rising to about 72 to 215 on difficulty 8. W/S, arrow throttle keys and wheel-down cannot accelerate or brake; Shift or wheel-forward gives 1.5x boost. A wheel-forward pulse lasts 1.5 seconds and can be refreshed. Pausing clears boosts, and normal throttle controls return after the bonus. Follow 18 green gates that move and shrink from roughly 18 to 7 units in radius; higher difficulties make them a little smaller and quicker. One miss is allowed; passing a gate resets the miss streak, while two consecutive misses end the sortie immediately. The final wall has a labelled EXIT opening: fly through to finish or hit the wall. Completion and both failures preserve the main ship and bank partial bonus rewards once.

The canyon grows from 52 shootable amber obstacles and 26 red guns to 80 obstacles and 40 guns. Later guns recover faster and their shots accelerate by up to 35%, but the warning stays at 0.85 seconds and no more than four guns engage together. They lock an intercept before the warning, then fire toward that locked point; change course to evade or shoot back. Hostile bolts are transparent and interceptable for 10% blast charge, and blasts clear nearby gunfire. Geometry leaves a traversable moving-gate corridor. Green gates, guns and obstacles also appear in Ships & Objects.

The asteroid belt has weaving gaps. Shooting a large rock produces two medium rocks; each medium rock splits into two small fragments, which can be destroyed outright. Fragments tumble and drift across the flight path, with a brief bright collision-grace flash after breakup. A volley cannot destroy its own newly spawned fragments. Charged blasts vaporize nearby rocks without splitting them. At most 64 fragments are active, and fragments expire after passing the player or twelve seconds.

Asteroid flight accelerates automatically from 48 to 112 speed across the sixty-second first belt. By difficulty 8, the same route has 180 rocks instead of 110 and takes about 40 seconds, accelerating from about 72 to 167; fragments drift faster too. Each level preserves a traversable weaving gap. The HUD shows the current speed and announces the final approach. A hollow green gate with a yellow EXIT label and arrow sits beyond the last rocks. Fly through its opening to complete the sortie; flying past it ends the bonus as an exit miss, with partial rewards and the main ship preserved. Shots and blasts cannot destroy the gate.

Sorties use temporary craft health. Completion, failure, timeout, skipping and manual exit never cost main-ship equipment, cargo or lives. Partial performance pays salvage or bronze/silver/gold rewards once per offer; gold can add a life up to five. An interrupted saved bonus is treated as consumed, so reloading cannot duplicate payment.

Loan skiffs start with an independent, fully charged defensive blast. Right click clears rocks and hostile surface targets within 240 units, without harming salvage, gates or numbered markers. Successful shots restore 5% charge; the blast does not recharge itself. Your main ship's charge is preserved.

## Saves

Progress uses `vector-shooter-save-v2` in browser local storage, with separate checkpoints, top-ten scores and normal/continued records for each mode. Settings and unlocked starting-weapon choices are saved alongside progress. Fresh runs start with mode-specific equipment and no carried-over money or upgrades.

Top-ten entries identify a run across retries and resumes, with a separate entry for a continued score. Resuming restores the available checkpoint without duplicating rewards.

## Verification

### Hidden Level Warp

On the title screen, press Up, Up, Down, Down, B, A. A short original chime and "BONUS UNLOCKED" message reveal Level Warp. The unlock survives reloads in the current tab. Its mouse-operated menu jumps to any of the 99 Journey stages, any Attack Challenge or Invaders wave, any Smuggler leg, or directly to Asteroid Run, Canyon Sortie and Target Sequence. The bonus difficulty selector offers levels 1-8 and jumps to the corresponding Journey offer. Briefings still appear before launch. Pause a test flight and choose Choose Level to jump again.

Warp flights use a fixed seed and clean starting equipment. They are labelled TEST and never overwrite normal checkpoints, records or permanent unlocks. Progression, shops, retries and bonus exits still work inside the temporary flight.

### Checks

Use Node.js 22.13 or newer (or a current supported LTS release). On a fresh checkout:

```sh
npm ci
npx playwright install chromium
npm test
```

- `npm test`: runs Vitest unit/integration tests, then the focused Playwright suite. No manually started server is needed.
- `npm run test:unit`: source-adjacent unit tests of rules, controllers and view models; no application instance or Chromium.
- `npm run test:integration`: four short checks that menu actions, lifecycle events and HUD updates are wired into the application.
- `npm run test:e2e`: native controls, short play flows, responsive menus, audio and WebGL rendering.
- `npm run test:e2e -- tests/e2e/controls.spec.ts`: run one browser suite.
- `npm run test:e2e:ui`: interactive Playwright test explorer.
- `npm run test:report`: open the last browser HTML report, including attached screenshots and failure traces.
- `npm run test:coverage`: unit-only coverage in `coverage/index.html`, with strict module thresholds for session decisions, HUD projection and gameplay rules.
- `npm run lint`: type-aware ESLint, including unsafe values, unhandled promises and unused code.
- `npm run typecheck`: strict TypeScript checks for application, tests and configuration.
- `npm run build`: typecheck and production bundle.
- `npm run check`: lint, static types, fast tests with coverage, and the browser suite with a production build. Each suite runs once.

Playwright manages a separate server at `127.0.0.1:5180`; it will not reuse an existing process there. It leaves the player's development server on port 5173 and browser saves alone. Each test gets a fresh browser context. Browser tests run serially to avoid WebGL and pointer-lock contention. Stage destinations, respawns, rewards and course outcomes are tested directly from state; course geometry is tested with its own controller.

Failure screenshots, traces and machine-readable test timings are in `test-results/`, with the HTML report in `playwright-report/`. These generated directories are ignored by Git. CI installs headless Chromium and runs the same checks on each push and pull request.

Suite responsibilities and coverage boundaries are documented in [Testing](docs/testing.md). Browser checks cannot prove human enjoyment, audio-device output, or playability on every GPU.

## Structure And Originality

Start with the [Code Guide](docs/code-guide.md) for a human-readable tour, the game-loop flow, save/reward rules, and a map of where to make changes. Comments in the source explain the less obvious decisions and ownership boundaries.

- `game.ts`: fixed 60 Hz orchestration connecting controllers to input, world objects, audio and browser presentation.
- `session/flight-lifecycle.ts`: damage, queued respawn, pause, protection and game-over timing.
- `session/stage-flow.ts`, `session/encounter-outcome.ts`: objective requirements, opening salvage, once-only settlements and transition destinations.
- `modes.ts`, `invaders.ts`, `smuggler.ts`, `scores.ts`: mode definitions, alien formations, delivery/life rules and per-mode score tables.
- `combat/projectiles.ts`: projectile ownership, swept contacts, interceptions and faction collision rules.
- `combat/enemies.ts`: enemy movement, targeting, warnings and attack cadence.
- `world/actors.ts`: actor lifecycle, original encounter formations and level population.
- `world/interactions.ts`: salvage magnets, trade, police dispatch/scans and solid-world collision.
- `rendering/hud-model.ts`: pure state-to-HUD projection; `rendering/hud.ts` applies it to the DOM. `rendering/effects.ts` owns visual effects.
- `menus/views.ts`, `menus/front.ts`, `menus/smuggler.ts`: menu content built from explicit run/profile inputs; `menus/mode-preview.ts` owns title simulations.
- `input-layouts.ts` and `menus/controls.ts`: shared, saved control bindings and their title/briefing labels.
- `models/`: separate wireframe primitives, ship silhouettes, landmarks, projectiles and object catalog. `models.ts` exports the shared model API.
- `input.ts`, `encounters.ts`, `weapons.ts`, `arcade.ts`, `bonus.ts` and `canyon.ts`: control, encounter, weapon, progression and bonus-course rules.
- `tests/e2e/fixtures/`: browser driver and pixel fixtures. Debug controls are exposed only in development builds.
- `tests/integration/`: four adapter-wiring checks with a DOM/device harness, run separately from unit tests and their coverage.

All ship outlines, formations, canyon paths, vector lettering and sound phrases are procedural original assets. No film, television or commercial game artwork, names, music or recreated levels are included. Three.js provides geometry, curves and rendering. Broad arcade mechanics are inspirations, not copied expressive assets.

## GitHub Pages

[Checks and Pages](.github/workflows/check.yml) installs dependencies and Chromium, runs lint, strict TypeScript checks, every unit and Playwright test, coverage thresholds and a production build. Reports are retained for seven days, including on failures. Only successful default-branch pushes or manual default-branch runs deploy `dist/`; pull requests and other branches never deploy. The deployment uses the same tested artifact and a protected `github-pages` environment, with write permissions limited to the deployment job.

In the repository's **Settings > Pages > Build and deployment**, select **GitHub Actions** as the source. Then push these changes to `main`, or run **Checks and Pages** from the Actions tab once the workflow is on `main`. The expected project URL is `https://eviltester.github.io/3dspacegame/`; the deployment job reports the actual URL. Pages has not been enabled or published by the local setup. Private repositories need a GitHub plan that supports Pages; enabling the website does not require making the source repository public.

Vite uses relative asset URLs so the bundle works under the repository path as well as at `/`. A Playwright production smoke test builds the actual app and serves it at `/3dspacegame/`, checking startup, flight, pause, assets and absence of development debug controls. It temporarily uses port 5181, separate from the development tests on 5180.

References: [GitHub Pages workflow setup](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite relative base paths](https://vite.dev/guide/build#relative-base).

## License

Project code and original assets are distributed under the [MIT License](LICENSE). Third-party dependencies retain their own licenses.
