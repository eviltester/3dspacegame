import { expect, it } from 'vitest';
import { parseSmugglerFlight, parseSmugglerResult, smugglerAwards, smugglerResultLines, smugglerTimeLimit } from './smuggler-rewards';
import { BoostDrive } from './boost';

it.each([0, 0.5, 1, 26, 40, 60, 74])('clock for a %s second cruise includes full-boost ramp and twenty seconds', cruise => {
  const drive = new BoostDrive(0.65); let elapsed = 0, travelled = 0;
  while (travelled < cruise) { travelled += drive.step(1 / 600, 1, true) / 600; elapsed += 1 / 600; }
  const remaining = smugglerTimeLimit(cruise) - elapsed;
  expect(remaining).toBeGreaterThanOrEqual(19.99); expect(remaining).toBeLessThanOrEqual(21.01);
});
it('awards stack, require their evidence, and use whole seconds without ending a slow flight', () => {
  const flight = { ...parseSmugglerFlight(), enemies: true, gatesPassed: 18, topBoost: true };
  expect(smugglerAwards(flight, true, true, 20.9)).toEqual({ delivery: 0, time: 10000, noHit: 3000, noCrash: 4000,
    boostFinish: 5000, cleanFinish: 3000, peacemaker: 5000, superFlyer: 5000, missedGate: 0, lostCargo: 0 });
  expect(smugglerAwards({ ...flight, shots: 1, crashes: 1, bulletHits: 1, gatesMissed: 1 }, false, true, -20))
    .toEqual({ delivery: 0, time: 0, noHit: 0, noCrash: 0, boostFinish: 0, cleanFinish: 0, peacemaker: 0, superFlyer: 0, missedGate: -2000, lostCargo: -2000 });
  expect(smugglerAwards({ ...flight, blasts: 1 }, true, false, 0).peacemaker).toBe(0);
  expect(smugglerAwards({ ...flight, gatesMissed: 1 }, true, true, 0).superFlyer).toBe(0);
  expect(smugglerAwards(flight, false, true, 0).superFlyer).toBe(0);
  expect(smugglerAwards(parseSmugglerFlight(), true, true, 0)).toMatchObject({ noHit: 0, boostFinish: 0, superFlyer: 0 });
});
it('sanitizes interrupted-flight evidence without inventing bonuses or invalid clocks', () => {
  const empty = parseSmugglerFlight();
  for (const value of [null, 1, {}, { elapsed: NaN, shots: -1, blasts: Infinity, bulletHits: 'bad' }]) expect(parseSmugglerFlight(value)).toEqual(empty);
  expect(parseSmugglerFlight({ ...empty, enemies: true, topBoost: true, elapsed: 40 })).toMatchObject({ enemies: true, topBoost: true, elapsed: 40 });
});
it('validates stored summaries and formats only earned bonuses or actual penalties', () => {
  const result = { flight: 10, haul: 2, haulPoints: 0, seconds: 3, awards: smugglerAwards(parseSmugglerFlight(), false, false, 3) };
  expect(parseSmugglerResult(result)).toEqual(result);
  for (const invalid of [null, 5, {}, { ...result, awards: {} }, { ...result, seconds: Infinity }]) expect(parseSmugglerResult(invalid)).toBeNull();
  expect(smugglerResultLines(result)).toContain('TIME BONUS (3s x 500) +1500');
  expect(smugglerResultLines(result)).toContain('MISSED GATE PENALTY -2000');
  expect(smugglerResultLines(result)).not.toContain('CLEAN FINISH');
});
