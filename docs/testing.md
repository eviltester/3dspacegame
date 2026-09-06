# Testing

`npm test` runs both suites. Playwright launches and stops its own Vite server on port 5180; never point it at a player's live profile. Install Chromium once with `npx playwright install chromium` (CI uses `--with-deps`).

## Unit Tests

Tests beside the source run in Node without a WebGL renderer. Three.js vectors and geometry are real; only browser-only text textures are replaced where a controller needs them. The same `ProjectileSystem`, `EnemySystem`, `ActorWorld` and `WorldInteractions` classes run in the application and in tests.

Coverage includes chronological swept hits and interceptions, piercing, projectile/attacker limits, spawn grace, police/trader retaliation, contraband restrictions, cargo magnet pickup, trade, scans, dispatch, collision, geometry disposal, purchases, lives, continues, rollback, separate saves, profile validation, 99-stage progression, Attack Challenge scaling and every bonus outcome.

Mode tests cover four independent checkpoints and scoreboards, score deduplication, continued records, Invaders-only formations and increasing pressure, and Smuggler's alternating difficulty, delivery rewards, failed-leg rollback and score-based life thresholds. Every Smuggler failure reason is tested independently, including repeated settlement and resumed checkpoints.

`npm run test:coverage` measures unit tests only. The browser entry point, HUD and Web Audio playback are covered principally by Playwright, so the overall unit percentage is not a measure of complete application coverage. Critical rules and combat/world modules have separate coverage minimums.

## Browser Suites

| Suite | Responsibility |
| --- | --- |
| `controls.spec.ts` | Mouse flight/fire/reverse, weapon inputs, cooldown, audible-buffer playback, pause and pointer lock |
| `keyboard.spec.ts` | Both saved keyboard layouts, keyboard-only menu navigation, flight/fire/blast, pause, continue, armadas and every bonus skiff |
| `deployment.spec.ts` | Production build at the Pages repository path, asset loading, keyboard play and pause, no development debug API |
| `menus.spec.ts` | Ships & Objects, five-second cycling, Level Warp, practice isolation, desktop/mobile layouts |
| `modes.spec.ts` | Four animated previews and score screens, weapon help, Invaders supply stops, real mouse Smuggler deliveries, retries and score-earned lives |
| `combat.spec.ts` | Arrivals, faction feedback, armada lane/view/release, wave-1000 transitions |
| `progression.spec.ts` | Save loading, countdown/relaunch/continue, reward timing, shop/resume, all 99 Journey checkpoints and ten Attack Challenge waves |
| `bonuses.spec.ts` | Real mouse completion of the hardest asteroid/canyon/target courses, right-click blast, weapon parity and safe exit |
| `rendering.spec.ts` | Actual hollow/pulsating WebGL shots, radar motion and maximum-load timing |
| `playthrough.spec.ts` | Mouse-only normal combat through Journey's first carrier, ten Attack Challenge waves and four Invaders formations |

The full 99-stage browser traversal uses explicit finish/gate fixtures to test screen and checkpoint wiring; it is not 99 stages of player-skill testing. The mouse pilots use real input, shots, damage, pickups, gates and shops, with only the fixed simulation clock accelerated between inputs. They do not grant resources, force kills or complete encounters. Bonus pilots likewise steer/shoot the actual courses.

Unit tests cover numerical cases: rock splitting and fragment grace, moving target positions/penalties, every bonus exit reason, gate aperture collision, radar height projection, detailed high-wave pressure, payout idempotence and purchase rules. Browser tests cover controls, integration and visible results.

## Adding A Regression

1. Add a source-adjacent unit test when the behaviour can be expressed with state, vectors, time or controller callbacks.
2. Add a focused Playwright test when the regression depends on pointer lock, keyboard/mouse events, DOM layout, Web Audio or WebGL. Reuse `GameDriver` and the shared fixtures.
3. Prefer web-first assertions or polling over arbitrary sleeps. Keep saves and seeds local to the test. Never weaken gameplay rules to make a mouse pilot pass.
4. Inspect failure screenshots and the trace in the HTML report. Tests collect browser errors automatically. Pixel checks verify nonblank motion, not a fragile pixel-perfect baseline.

The maximum-load assertion requires a median frame time below 50 ms while respecting 18 hostiles, six attackers and 240 shots. It is a regression check on the test host, not a performance promise for all machines.

Keyboard tests use actual key events for menu selection and gameplay. They accelerate the simulation clock, and use explicit fixtures for fatal damage, full blast charge and practice-stage selection; they are not skill-based keyboard completions of every stage. Unit tests cover frame-rate-independent steering, held/tapped fire, blast repeat suppression, reverse/boost, cleared inputs, non-conflicting bindings and saved-setting defaults. The production smoke test builds with Vite and owns a temporary preview server on port 5181; all servers are closed after the suite.

## Static Checks

`npm run lint` uses ESLint's recommended rules plus type-aware TypeScript rules, with zero warnings permitted. `npm run typecheck` enables strict types and unused-local/parameter checks for application code, unit tests, Playwright fixtures/specs and configuration. `npm run check` combines those checks, both test suites and the production build. The GitHub Actions workflow also publishes reports and coverage artifacts.
