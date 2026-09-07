import { describe, expect, it } from 'vitest';
import { weaponSpec } from '../weapons';
import { actorFixture } from '../testing/actors';
import { InvaderFireDirector, invaderFireTiming } from './invader-fire';

describe('Invaders firing cadence', () => {
  it.each([['pulse', 0.6], ['spread', 1], ['lance', 1.4]] as const)('%s has its own deliberate cooldown', (family, cooldown) => {
    expect(weaponSpec(family, 1, 'invaders').cooldown).toBe(cooldown);
    expect(weaponSpec(family, 3, 'invaders').cooldown).toBeCloseTo(cooldown * 0.84);
    for (const mode of ['journey', 'endless', 'smuggler'] as const) expect(weaponSpec(family, 1, mode)).toEqual(weaponSpec(family, 1));
  });
  it('reduces alien cooldown and fleet spacing each wave, with bounded late-wave fire', () => {
    expect(invaderFireTiming(1).cooldown).toBeCloseTo(5.6);
    for (const wave of [2, 3, 10, 100, 1000, 1000000]) {
      const current = invaderFireTiming(wave), previous = invaderFireTiming(wave - 1);
      expect(current.cooldown).toBeLessThan(previous.cooldown); expect(current.gap).toBeLessThan(previous.gap);
      expect(current.cooldown).toBeGreaterThan(1.7); expect(current.gap).toBeGreaterThan(0.3);
      expect(current.cooldown).toBeGreaterThan(weaponSpec('lance', 1, 'invaders').cooldown);
    }
  });
  it('rotates eligible shooters, skips absent ships, and restores the same order on reset', () => {
    const director = new InvaderFireDirector(), actors = [1, 2, 3].map(id => actorFixture({ id }));
    expect(director.next(0, [])).toBeUndefined();
    expect(director.next(0, actors)).toBe(actors[0]); director.started(actors[0], 1);
    expect(director.next(0.5, actors)).toBeUndefined();
    expect(director.next(0.6, actors)).toBe(actors[1]); director.started(actors[1], 1);
    expect(director.next(2, [actors[0], actors[2]])).toBe(actors[2]); director.started(actors[2], 1);
    expect(director.next(2, actors)).toBe(actors[0]);
    director.reset(); expect(director.next(0, actors)).toBe(actors[0]);
  });
});
