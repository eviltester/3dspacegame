import { expect, it } from 'vitest';
import { ENEMY_ATTACK_WARNING, endlessDifficulty } from './endless-difficulty';
import { EncounterDirector, HULL, stageDefinition } from './encounters';
import { freshProfile, newRun, parseProfile, retry, saveCheckpoint } from './arcade';

it('raises combat pressure after every Endless wave, including beyond wave 1000', () => {
  for (let wave = 1; wave <= 10001; wave++) {
    const current = endlessDifficulty(wave), next = endlessDifficulty(wave + 1);
    for (const key of ['pressure', 'movementScale', 'leadBonus'] as const) expect(next[key]).toBeGreaterThan(current[key]);
    for (const key of ['cooldownScale', 'flightInterval', 'clearInterval', 'carrierInterval', 'recovery'] as const) expect(next[key]).toBeLessThan(current[key]);
    for (const key of ['flights', 'fighters', 'escortFlights', 'carrierLaunches'] as const) expect(next[key]).toBeGreaterThanOrEqual(current[key]);
  }
});

it('makes wave 1000 a substantially different carrier fight from waves 10 and 100', () => {
  const early = stageDefinition('endless', 10), mid = stageDefinition('endless', 100), late = stageDefinition('endless', 1000);
  expect(early.waves).toHaveLength(2); expect(mid.waves).toHaveLength(5); expect(late.waves).toHaveLength(8);
  expect(late.waves[0].enemies).toEqual(['carrier']);
  expect(late.waves.slice(1).every(w => w.enemies.length === 14 && !w.enemies.includes('carrier'))).toBe(true);
  expect(late.waves.reduce((n, w) => n + w.enemies.length, 0)).toBe(99);
  expect(late.objective).toContain('7 escort flights');
  expect(late.difficulty.cooldownScale).toBeLessThan(early.difficulty.cooldownScale * 0.6);
  expect(late.difficulty.movementScale).toBeGreaterThan(early.difficulty.movementScale * 1.3);
  expect(late.difficulty.flightInterval).toBeLessThan(early.difficulty.flightInterval * 0.6);
  expect(late.difficulty.carrierLaunches).toBeGreaterThan(mid.difficulty.carrierLaunches);
  expect(late.difficulty.heavyShots).toBe(5); expect(late.difficulty.fighterShots).toBe(3);
  expect(late.bossParts).toBe(early.bossParts); expect(HULL.raider).toBe(48);
});

it('also grows ordinary and armada rosters, rather than only changing boss waves', () => {
  for (const [early, mid, late, later] of [[11, 101, 1001, 10001], [13, 103, 1003, 10003]]) {
    const definitions = [early, mid, late, later].map(wave => stageDefinition('endless', wave));
    const rosters = definitions.map(d => d.waves.reduce((n, flight) => n + flight.enemies.length, 0));
    expect(rosters.every((n, i) => i === 0 || n > rosters[i - 1])).toBe(true);
    expect(definitions[2].waves.length).toBeGreaterThan(5);
  }
});

it.each([1, 5, 20, 75, 150, 1000, 10000, Number.MAX_SAFE_INTEGER - 1])('keeps wave %s finite, readable, and within combat caps', wave => {
  const definition = stageDefinition('endless', wave), d = definition.difficulty;
  for (const value of Object.values(d)) expect(Number.isFinite(value)).toBe(true);
  expect(d.recovery).toBeGreaterThan(1.5); expect(d.clearInterval).toBeGreaterThan(0.6);
  expect(d.movementScale).toBeLessThan(2.1); expect(d.cooldownScale).toBeGreaterThan(0.2);
  expect(d.heavyShots).toBeLessThanOrEqual(5); expect(d.fighterShots).toBeLessThanOrEqual(3);
  expect(definition.speedScale).toBeLessThanOrEqual(1.35); expect(definition.attackerCap).toBeLessThanOrEqual(6);
  expect(definition.bossParts).toBeLessThanOrEqual(6); expect(definition.waves.length).toBeLessThan(100);
  expect(definition.waves.every(w => w.enemies.length <= 14)).toBe(true);
  const director = new EncounterDirector(definition);
  expect(director.next(0, 18)).toHaveLength(0);
  let dispatched = director.next(0, 17).length;
  expect(dispatched).toBe(1);
  for (let time = 1; time < 1000 && !director.finished; time++) {
    const arrivals = director.next(time, 16); expect(arrivals.length).toBeLessThanOrEqual(2); dispatched += arrivals.length;
  }
  expect(director.finished).toBe(true);
  expect(dispatched).toBe(definition.waves.reduce((n, w) => n + w.enemies.length, 0));
  expect(ENEMY_ATTACK_WARNING).toBeGreaterThanOrEqual(0.7);
});

it('brings the next flight sooner after a fast clear, without skipping finite rosters', () => {
  const definition = stageDefinition('endless', 1001), director = new EncounterDirector(definition);
  const first = director.next(0, 0); expect(first).toHaveLength(14);
  const delay = definition.difficulty.clearInterval;
  expect(director.next(delay - 0.01, 0)).toHaveLength(0);
  expect(director.next(delay + 0.01, 0)).toHaveLength(14);
  expect(director.flight).toBe(2);
});

it('preserves Journey combat tuning and the first Endless introductions', () => {
  const baseline = endlessDifficulty(1);
  expect(baseline).toMatchObject({ movementScale: 1, cooldownScale: 1, recovery: 8, clearInterval: 5, carrierInterval: 9, carrierLaunches: 6 });
  for (let n = 1; n <= 99; n++) expect(stageDefinition('journey', n).difficulty).toEqual(baseline);
  expect(stageDefinition('endless', 1).waves[0].enemies).toEqual(['raider', 'raider']);
  expect(stageDefinition('endless', 5).waves).toHaveLength(1);
  expect(new Set(stageDefinition('endless', 2).waves[0].enemies)).toEqual(new Set(['flanker']));
  expect(new Set(stageDefinition('endless', 4).waves[0].enemies)).toEqual(new Set(['gunship']));
});

it('reconstructs the same difficulty after checkpoint resume and retry without persisting redundant tuning', () => {
  const run = newRun('endless', 0x1984); run.stage = 1000; run.phase = 'playing';
  const definition = stageDefinition(run.mode, run.stage), profile = freshProfile();
  saveCheckpoint(profile, run);
  const resumed = parseProfile(JSON.stringify(profile), null).checkpoints.endless!;
  expect(stageDefinition(resumed.mode, resumed.stage)).toEqual(definition);
  resumed.lives = 0; retry(resumed, true);
  expect(stageDefinition(resumed.mode, resumed.stage)).toEqual(definition);
  expect(resumed.lives).toBe(3);
});
