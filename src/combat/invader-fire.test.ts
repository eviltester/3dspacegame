import { describe, expect, it } from 'vitest';
import { weaponSpec } from '../weapons';
import { actorFixture } from '../testing/actors';
import { InvaderFireDirector, invaderCoverTarget, invaderFireTiming } from './invader-fire';

describe('Defensive Position firing cadence', () => {
  it.each([['pulse', 0.6], ['spread', 1.4], ['lance', 1.4]] as const)('%s has its deliberate cooldown', (family, cooldown) => {
    expect(weaponSpec(family, 1, 'invaders').cooldown).toBe(cooldown);
    expect(weaponSpec(family, 3, 'invaders').cooldown).toBeCloseTo(cooldown * 0.84);
    for (const mode of ['journey', 'endless', 'smuggler'] as const) expect(weaponSpec(family, 1, mode)).toEqual(weaponSpec(family, 1));
  });
  it.each([1, 2, 3])('Spread tier %i matches Lance recovery without changing projectile speed', tier => {
    const spread = weaponSpec('spread', tier, 'invaders');
    expect(spread.cooldown).toBe(weaponSpec('lance', tier, 'invaders').cooldown);
    expect(spread.speed).toBe(380); expect(spread.count).toBe(3);
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
  it.each([1, 10, 1000])('wave %i survivors shoot faster with a bounded minimum cooldown', wave => {
    for (let aliens = 2; aliens <= 18; aliens++) {
      expect(invaderFireTiming(wave, aliens - 1).cooldown).toBeLessThan(invaderFireTiming(wave, aliens).cooldown);
      expect(invaderFireTiming(wave, aliens - 1).gap).toBeLessThan(invaderFireTiming(wave, aliens).gap);
    }
    expect(invaderFireTiming(wave, 1).cooldown).toBeGreaterThanOrEqual(0.7);
    expect(invaderFireTiming(wave, 1).gap).toBeGreaterThanOrEqual(0.14);
  });
  it('adds limited rotating cover pairs without consuming the aimed-fire turn', () => {
    const director = new InvaderFireDirector(), actors = [1, 2, 3, 4].map(id => actorFixture({ id }));
    expect(director.cover(0, actors, 1, 18)).toEqual([]);
    expect(director.cover(1, [], 1, 18)).toEqual([]);
    expect(director.cover(0, actors, 1, 18)).toEqual(actors.slice(0, 2));
    expect(director.next(0, actors)).toBe(actors[0]);
    expect(director.cover(0.1, actors, 1, 18)).toEqual([]);
    expect(director.cover(2, actors, 1, 18)).toEqual(actors.slice(2));
    expect(director.cover(2, actors, 1, 18)).toEqual(actors.slice(0, 2));
    director.reset(); expect(director.cover(1, actors, 1, 18)).toEqual(actors.slice(0, 2));
  });
  it('cuts an already scheduled fleet wait when only one alien survives', () => {
    const director = new InvaderFireDirector(), actor = actorFixture();
    director.started(actor, 1, 18);
    expect(director.next(0.4, [actor], 1, 1)).toBe(actor);
  });
  it('cover fire always picks a reachable space outside the player corridor', () => {
    for (let x = -76; x <= 76; x++) for (let index = 0; index < 15; index++) {
      const aim = invaderCoverTarget(x, index);
      expect(Math.abs(aim - x)).toBeGreaterThanOrEqual(28); expect(Math.abs(aim)).toBeLessThan(76);
    }
  });
});
