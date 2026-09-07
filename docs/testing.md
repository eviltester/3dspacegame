# Testing

`npm test` runs three separate layers: unit tests, four adapter-wiring checks, and Chromium. `npm run check` runs lint, strict types, unit coverage, adapter checks and Chromium, once each. Playwright builds the production artifact before starting its isolated server on port 5180. The Pages test serves that artifact on port 5181; CI deploys it unchanged. The player's server and saves on port 5173 are never used.

Install the test browser once with `npx playwright install chromium`. Headless CI uses `npx playwright install --with-deps --only-shell chromium`.

## Unit Tests

`npm run test:unit` includes only `src/**/*.test.ts`. Tests arrange explicit state and call production functions or individual controllers. They never instantiate `ArcadeGame`, run an application harness, or navigate a campaign to reach a condition. Input-adapter tests use a DOM emulator to check event translation; simulation decisions need no DOM.

| Contract | Direct test boundary |
| --- | --- |
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

## Adapter Checks

`npm run test:integration` uses `vitest.integration.config.ts`, independently of the unit configuration. Its four short tests verify that application menu actions call the lifecycle controller, fatal hits consume the queued respawn, pickup values reach the DOM, and wave completion uses the correct destination.

The Happy DOM fixture stubs WebGL drawing, canvas rasterization, audio startup and pointer-lock acquisition. It advances at most a few simulation ticks per case. It does not contribute to unit-test coverage.

## Coverage

`npm run test:coverage` runs **unit tests only**. The report includes all executable application source except the entry point, declarations and test fixtures. In particular, browser coordination remains visible as uncovered rather than being excluded to inflate the percentage.

The current whole-source unit coverage is about 65% of lines. The session controllers have **100% line, branch and function coverage**, enforced independently. HUD projection has **100% line/function coverage** and a 90% branch floor; catalog timing has 100% across all three. Combat, world, progression and bonus controllers have their own higher thresholds in `vitest.config.ts`.

The whole-source floors (65% lines, 64% branches, 60% statements/functions) measure unit tests, not combined application/browser coverage. They guard that separate baseline. Read the per-file report when adding rules; do not put decisions back in the coordinator or lower a module threshold to accommodate untested logic. These figures are not evidence of correct pixels, native pointer lock or audio-device output.

## Browser Checks

Playwright is reserved for browser/device contracts and short input/rendering flows. All browser tests run on every CI build. Serial execution prevents pointer-lock focus and WebGL measurements competing for the same machine.

| Browser suite | Responsibility |
| --- | --- |
| `controls.spec.ts` | Native steering/fire/reverse, weapons, audio playback, pause/focus/pointer lock |
| `keyboard.spec.ts` | Both layouts, native focus, flight/fire/blast/pause/continue and course inputs |
| `deployment.spec.ts` | Production assets at the Pages path and absence of development debug controls |
| `menus.spec.ts` | Catalog models rendered, mouse/keyboard navigation and five responsive widths |
| `modes.spec.ts` | Animated previews, weapon help and per-mode score screens on desktop/mobile |
| `combat.spec.ts` | Destruction/arrival audio, faction feedback, moving armada view and lane release |
| `invaders-combat.spec.ts` | Native weapon input and readable accuracy/cooldown HUD |
| `progression.spec.ts` | Mouse shop/purchase/reload wiring, in-flight lives and zero-life continue |
| `respawn.spec.ts` | Flashing blue craft pixels, responsive HUD and held fire/pointer-lock retention |
| `bonuses.spec.ts` | Coloured moving asteroids, mouse dodging/boost/blast, aimed target and exit UI |
| `rendering.spec.ts` | Hollow projectiles, explosions, radar motion and maximum-load performance |

Browser console errors fail tests. Screenshots/traces are in `test-results/`, the HTML report is in `playwright-report/`, and timings are in `test-results/browser-results.json`. Pixel checks verify nonblank motion and relevant colours/transparency rather than fragile exact-image baselines. The load check requires median frame time below 50 ms with 18 hostiles, six attackers and 240 shots; it is a regression check on the test host, not a guarantee for every GPU.

## Adding A Regression

1. Arrange the exact state in a source-adjacent unit test. Call the responsible production function/controller and assert its result and side effects.
2. When a decision lives inside `ArcadeGame`, extract that decision into a component with explicit inputs. Test that component; do not automate a flight to reach it.
3. Use an adapter check only to verify wiring that a unit cannot observe. Keep setup short and do not duplicate state-rule matrices there.
4. Use Playwright only for native input, focus, CSS, audio scheduling or actual WebGL pixels. Extend a relevant short flow.
5. Run the focused test, then `npm run check`. Passing automation does not establish human enjoyment or speaker output.

## CI

GitHub Actions runs the same `npm run check` command after dependency installation. Unit coverage is collected once. The production build is created once and tested before upload. Reports and coverage artifacts are retained for seven days, including on failures. Only successful default-branch runs can deploy the tested artifact.
