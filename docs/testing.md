# Testing

`npm test` runs three separate layers: unit tests with coverage thresholds, adapter-wiring checks, and Chromium. `npm run check` runs lint, strict types, unit coverage, adapter checks and Chromium, once each. Playwright builds the production artifact before starting its isolated server on port 5180. The Pages test serves that artifact on port 5181; CI deploys it unchanged. The player's server and saves on port 5173 are never used.

Install the test browser once with `npx playwright install chromium`. Headless CI uses `npx playwright install --with-deps --only-shell chromium`.

## Unit Tests

`npm run test:unit` includes only `src/**/*.test.ts`. Tests arrange explicit state and call production functions or individual controllers. They never instantiate `ArcadeGame`, run an application harness, or navigate a campaign to reach a condition. Input-adapter tests dispatch explicit relative deltas to event targets; simulation decisions need no DOM. Menu component tests use Testing Library and Happy DOM.

| Contract | Direct test boundary |
| --- | --- |
| Relative mouse accumulation, active/locked/fallback gating, keyboard layouts and clearing on pause | `FlightInput` with explicit event properties |
| Free-flight local rotation, reverse, armada lane bounds/release and arena limits | `moveShip` with vectors, orientation and a flight command |
| Aim cone/range, target priority and exclusion of police, traders, cargo and dead ships | `assistedAim` with actor fixtures |
| Asteroid/canyon dodging, target-camera aiming and movement after exit | `BonusController` with relative input and a real Three.js camera, no renderer |
| Menu clicks, keyboard activation, focus wrapping/restoration, disabled choices and labelled fields | `MenuShell` plus production menu views, Testing Library and user-event |
| Fatal damage, remaining lives, checkpoint rollback, queued respawn, pause/protection, game-over countdown | `FlightLifecycle`, with explicit run state and elapsed time |
| Every Journey destination, high-wave recovery/boss routing, Defensive Position without docks | `completeEncounter`, `afterGate`, `nextStage` |
| Rescue delivery, surviving escorts, all flights/hostiles cleared | `encounterComplete`, with a minimal objective snapshot |
| Guaranteed opening upgrade and reproducible salvage | `pirateSalvage` |
| Pickup/repair/weapon state immediately reflected on HUD | `pickup` / `purchase` followed by pure `buildHud` |
| Duplicate stage payments, resumed results, every bonus exit reason | `settleCourse`, save parsing and run settlement functions |
| Weapon-family cooldowns, switching during cooldown, bolt counts and rejected spawns | `WeaponFire`, driven only by explicit simulation ticks |
| Charged-blast spending and protected factions/range | `defensiveBlast` with actors and callback spies |
| Secondary explosion fuses, burst callbacks and paused time | `ShipExplosions` with explicit update intervals |
| Five-second catalog cadence, manual navigation and wrapping | `ObjectScan` |
| Swept shots, piercing, interceptions and separate Spread hits/misses | `ProjectileSystem` and `ShotAccuracy` with vectors and callbacks |
| Formation/AI pressure, attack limits, faction safety, salvage magnets and law | Individual enemy, encounter and world controllers |
| Difficulty-scaled route clearance, moving gates, targets, turrets and exits | Individual course controllers with seeded geometry |
| Purchases, repairs, life milestones, continues, scoreboard isolation and save validation | Resource and persistence functions |

Course geometry tests may advance their own controller clock to check a route. They do not instantiate the application, drive menus, earn access to a level or wait for real-time play.

ESLint prevents unit tests importing the application coordinator, integration harness or Playwright. New gameplay conditions should be exposed through the responsible controller, not through a whole-game test shortcut.

### DOM Interactions

`src/menus/menu-shell.test.ts` uses [DOM Testing Library](https://testing-library.com/docs/dom-testing-library/intro/) and [user-event](https://testing-library.com/docs/user-event/intro/). Queries use roles, accessible names and labels. Clicks, typing, selecting, Tab, Enter and Space go through the real DOM-only shell and production menu HTML. The shell emits actions to a spy; tests do not boot a game, mock a GPU or reproduce menu event handlers.

Keep interaction sequences in these component tests. Happy DOM cannot establish pixel layout, CSS-generated accessible names, native pointer lock or actual audio playback; those remain browser responsibilities. Low-level `movementX`/`movementY` tests explicitly supply event deltas and do not claim to emulate a physical mouse.

## Adapter Checks

`npm run test:integration` uses `vitest.integration.config.ts`, independently of the unit configuration. Its short tests verify that menu actions call their controllers, pickups and selections reach the HUD, held fire survives respawn, kills pay before animation, practice saves remain isolated, and wave completion uses the correct destination.

The Happy DOM fixture stubs WebGL drawing, canvas rasterization, audio startup and pointer-lock acquisition. It advances short, explicit simulation intervals without a running animation loop. It does not contribute to unit-test coverage.

## Coverage

`npm run test:coverage` runs **unit tests only**. The report includes all executable application source except the entry point, declarations and test fixtures. In particular, browser coordination remains visible as uncovered rather than being excluded to inflate the percentage.

The session controllers, flight movement and aim assistance have **100% line, branch and function coverage**, enforced independently. The DOM menu shell has a 100% line/function gate and 95% branch floor. HUD projection has **100% line/function coverage** and a 90% branch floor; catalog timing has 100% across all three. Combat, world, progression and bonus controllers have their own higher thresholds in `vitest.config.ts`.

The whole-source floors (65% lines, 64% branches, 60% statements/functions) measure unit tests, not combined application/browser coverage. They guard that separate baseline. Read the per-file report when adding rules; do not put decisions back in the coordinator or lower a module threshold to accommodate untested logic. These figures are not evidence of correct pixels, native pointer lock or audio-device output.

### Commit Coverage Gate

Dependency installation runs `prepare`, which installs `.githooks/pre-commit`. Run `npm run prepare` once in an existing checkout. The hook invokes `npm run check:commit`, exporting the Git index to a temporary directory and running the staged `test:coverage` command without changing thresholds. Unstaged edits and untracked tests are not included; the real index and working tree are untouched. Installed dependencies are reused only when staged and working lockfiles match. Failed tests, insufficient coverage, missing dependencies and interrupted checks block the commit.

The hook helpers have direct tests in `tools/git-hooks.test.ts`, with 100% line/function and 90% branch thresholds. Temporary Git repositories verify partial staging, alternate indexes, dependency errors, safe cleanup and real hook rejection/acceptance. They do not run the game or browser suite recursively. CI enforces coverage independently of local hooks.

## Browser Checks

Playwright is reserved for browser/device contracts and short input/rendering flows. All browser tests run on every CI build. Serial execution prevents pointer-lock focus and WebGL measurements competing for the same machine.

| Browser suite | Responsibility |
| --- | --- |
| `controls.spec.ts` | One native mouse fire/wheel/pause and pointer-lock acquisition/release smoke |
| `audio.spec.ts` | A genuine user gesture resumes Web Audio and schedules sounds, without playing a game |
| `keyboard.spec.ts` | One native keyboard launch/flight/fire/pause check, including focus on Resume |
| `deployment.spec.ts` | Production assets at the Pages path and absence of development debug controls |
| `menus.spec.ts` | Catalog models rendered, mouse/keyboard navigation and five responsive widths |
| `modes.spec.ts` | Animated previews, weapon help and per-mode score screens on desktop/mobile |
| `combat.spec.ts` | Moving armada perspective and Warp indicator |
| `invaders-combat.spec.ts` | Actual CSS layout of the accuracy/cooldown HUD |
| `respawn.spec.ts` | Blue protected-craft pixels, restoration of normal colours and responsive HUD |
| `bonuses.spec.ts` | Isolated WebGL course geometry at explicit times: asteroid colours/motion, canyon and numbered markers |
| `rendering.spec.ts` | Hollow projectiles, explosion pixels, radar motion and a maximum-load canvas; frame times are diagnostic |

Browser console errors fail tests. Screenshots/traces are in `test-results/`, the HTML report is in `playwright-report/`, and timings are in `test-results/browser-results.json`. Pixel checks verify nonblank motion and relevant colours/transparency rather than fragile exact-image baselines. The load check records median/p95 frame times but does not pass or fail based on runner speed. Use its attachments to investigate performance on comparable hardware. Actor, attacker, projectile and debris caps remain hard assertions in direct controller tests.

Rendering-only tests open a minimal HTML fixture and instantiate real models/controllers without the game loop, menus, pointer lock or saves. For application visuals, the fixture freezes the browser clock before loading the app. `step()` advances simulation explicitly and then requests one display frame; it is for arranging visuals, not measuring exact cooldowns. Native pause holds advance their timer explicitly. Only the production smoke and diagnostic frame-time sample run on wall-clock time.

Browser fixtures use native clicks, wheel events and keys. They do not maintain a virtual cursor, calculate firing angles or infer relative pointer-lock movement from absolute viewport coordinates. Relative input translation, aiming and movement correctness are checked at their direct unit boundaries. The browser smoke proves lock acquisition/release and button/key delivery, not OS-specific physical mouse behaviour.

## Adding A Regression

1. Arrange the exact state in a source-adjacent unit test. Call the responsible production function/controller and assert its result and side effects.
2. When a decision lives inside `ArcadeGame`, extract that decision into a component with explicit inputs. Test that component; do not automate a flight to reach it.
3. Use an adapter check only to verify wiring that a unit cannot observe. Keep setup short and do not duplicate state-rule matrices there.
4. Use Playwright only for native input, focus, CSS, audio scheduling or actual WebGL pixels. Extend a relevant short flow.
5. Run the focused test, then `npm run check`. Passing automation does not establish human enjoyment or speaker output.

## CI

GitHub Actions runs the same `npm run check` command after dependency installation. Unit coverage is collected once. The production build is created once and tested before upload. Reports and coverage artifacts are retained for seven days, including on failures. Only successful default-branch runs can deploy the tested artifact.
