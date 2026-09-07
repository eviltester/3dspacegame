# Testing

`npm test` runs three separate layers: unit tests, four adapter-wiring checks, and Chromium. `npm run check` runs lint, strict types, unit coverage, adapter checks and Chromium, once each. Playwright builds the production artifact before starting its isolated server on port 5180. The Pages test serves that artifact on port 5181; CI deploys it unchanged. The player's server and saves on port 5173 are never used.

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
| Every Journey destination, high-wave recovery/boss routing, Invaders without docks | `completeEncounter`, `afterGate`, `nextStage` |
| Rescue delivery, surviving escorts, all flights/hostiles cleared | `encounterComplete`, with a minimal objective snapshot |
| Guaranteed opening upgrade and reproducible salvage | `pirateSalvage` |
| Pickup/repair/weapon state immediately reflected on HUD | `pickup` / `purchase` followed by pure `buildHud` |
| Duplicate stage payments, resumed results, every bonus exit reason | `settleCourse`, save parsing and run settlement functions |
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

`npm run test:integration` uses `vitest.integration.config.ts`, independently of the unit configuration. Its four short tests verify that application menu actions call the lifecycle controller, fatal hits consume the queued respawn, pickup values reach the DOM, and wave completion uses the correct destination.

The Happy DOM fixture stubs WebGL drawing, canvas rasterization, audio startup and pointer-lock acquisition. It advances at most a few simulation ticks per case. It does not contribute to unit-test coverage.

## Coverage

`npm run test:coverage` runs **unit tests only**. The report includes all executable application source except the entry point, declarations and test fixtures. In particular, browser coordination remains visible as uncovered rather than being excluded to inflate the percentage.

The current whole-source unit coverage is about 67% of lines. The session controllers, flight movement and aim assistance have **100% line, branch and function coverage**, enforced independently. The DOM menu shell has a 100% line/function gate and 95% branch floor. HUD projection has **100% line/function coverage** and a 90% branch floor; catalog timing has 100% across all three. Combat, world, progression and bonus controllers have their own higher thresholds in `vitest.config.ts`.

The whole-source floors (65% lines, 64% branches, 60% statements/functions) measure unit tests, not combined application/browser coverage. They guard that separate baseline. Read the per-file report when adding rules; do not put decisions back in the coordinator or lower a module threshold to accommodate untested logic. These figures are not evidence of correct pixels, native pointer lock or audio-device output.

## Browser Checks

Playwright is reserved for browser/device contracts and short input/rendering flows. All browser tests run on every CI build. Serial execution prevents pointer-lock focus and WebGL measurements competing for the same machine.

| Browser suite | Responsibility |
| --- | --- |
| `controls.spec.ts` | Native mouse fire/wheel, weapons, audio scheduling, pause and pointer-lock acquisition/release |
| `keyboard.spec.ts` | One native keyboard launch/flight/fire/pause check, including focus on Resume |
| `deployment.spec.ts` | Production assets at the Pages path and absence of development debug controls |
| `menus.spec.ts` | Catalog models rendered, mouse/keyboard navigation and five responsive widths |
| `modes.spec.ts` | Animated previews, weapon help and per-mode score screens on desktop/mobile |
| `combat.spec.ts` | Destruction/arrival audio, faction feedback, moving armada perspective and Warp indicator |
| `invaders-combat.spec.ts` | Native weapon input and readable accuracy/cooldown HUD |
| `progression.spec.ts` | Mouse shop/purchase/reload wiring, in-flight lives and zero-life continue |
| `respawn.spec.ts` | Flashing blue craft pixels, responsive HUD and held fire/pointer-lock retention |
| `bonuses.spec.ts` | Coloured moving asteroids, boost/blast, numbered target rendering and exit UI |
| `rendering.spec.ts` | Hollow projectiles, explosions, radar motion and maximum-load performance |

Browser console errors fail tests. Screenshots/traces are in `test-results/`, the HTML report is in `playwright-report/`, and timings are in `test-results/browser-results.json`. Pixel checks verify nonblank motion and relevant colours/transparency rather than fragile exact-image baselines. The load check requires median frame time below 50 ms with 18 hostiles, six attackers and 240 shots; it is a regression check on the test host, not a guarantee for every GPU.

Browser fixtures use native clicks, wheel events and keys. They do not maintain a virtual cursor, calculate firing angles or infer relative pointer-lock movement from absolute viewport coordinates. Relative input translation, aiming and movement correctness are checked at their direct unit boundaries. The browser smoke proves lock acquisition/release and button/key delivery, not OS-specific physical mouse behaviour.

## Adding A Regression

1. Arrange the exact state in a source-adjacent unit test. Call the responsible production function/controller and assert its result and side effects.
2. When a decision lives inside `ArcadeGame`, extract that decision into a component with explicit inputs. Test that component; do not automate a flight to reach it.
3. Use an adapter check only to verify wiring that a unit cannot observe. Keep setup short and do not duplicate state-rule matrices there.
4. Use Playwright only for native input, focus, CSS, audio scheduling or actual WebGL pixels. Extend a relevant short flow.
5. Run the focused test, then `npm run check`. Passing automation does not establish human enjoyment or speaker output.

## CI

GitHub Actions runs the same `npm run check` command after dependency installation. Unit coverage is collected once. The production build is created once and tested before upload. Reports and coverage artifacts are retained for seven days, including on failures. Only successful default-branch runs can deploy the tested artifact.
