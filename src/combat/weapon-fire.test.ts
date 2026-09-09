import { afterEach, expect, it, vi } from 'vitest';
import { WeaponFire } from './weapon-fire';
import { weaponSpec } from '../weapons';
import { emptyAccuracy, ShotAccuracy } from './accuracy';
import { FAMILIES } from '../arcade';
import { GAME_MODES } from '../modes';

afterEach(() => vi.useRealTimers());

for (const mode of GAME_MODES) for (const family of FAMILIES) {
  it.each([1, 2, 3])(`${mode} ${family} tier %s uses its own cooldown and bolt count`, tier => {
    const fire = new WeaponFire(), emit = vi.fn(() => true), spec = weaponSpec(family, tier, mode);
    expect(fire.fire(spec, emit)).toBe(spec.count);
    expect(emit.mock.calls).toHaveLength(spec.count);
    expect(fire.remaining).toBe(spec.cooldown);
    fire.tick(spec.cooldown - 0.001);
    expect(fire.fire(spec, emit)).toBe(0);
    fire.tick(0.002);
    expect(fire.remaining).toBe(0); expect(fire.fire(spec, emit)).toBe(spec.count);
  });
}

it.each(FAMILIES)('switching from %s cannot bypass its outstanding cooldown', family => {
  const fire = new WeaponFire(), original = weaponSpec(family, 1, 'invaders'), emit = vi.fn(() => true);
  fire.fire(original, emit); fire.tick(0.1); emit.mockClear();
  for (const next of FAMILIES) expect(fire.fire(weaponSpec(next, 3, 'invaders'), emit)).toBe(0);
  expect(emit).not.toHaveBeenCalled(); expect(fire.remaining).toBeCloseTo(original.cooldown - 0.1);
});

it('advances on simulation ticks only, including when a menu pauses simulation', () => {
  vi.useFakeTimers();
  const fire = new WeaponFire(), spec = weaponSpec('lance', 1, 'invaders');
  fire.fire(spec, () => true); fire.tick(0.1);
  const remaining = fire.remaining;
  vi.advanceTimersByTime(30000); expect(fire.remaining).toBe(remaining);
  fire.tick(remaining); expect(fire.remaining).toBe(0);
});

it('leaves cooldown ready when the pool rejects all bolts and counts a partial volley', () => {
  const fire = new WeaponFire(), spec = weaponSpec('spread', 1, 'invaders');
  expect(fire.fire(spec, () => false)).toBe(0); expect(fire.remaining).toBe(0);
  expect(fire.fire(spec, index => index !== 1)).toBe(2); expect(fire.remaining).toBe(1.4);
  fire.reset(); expect(fire.remaining).toBe(0);
});

it('gives Spread three separately tracked shots: one hit and two misses', () => {
  const fire = new WeaponFire(), tracker = new ShotAccuracy(), stats = emptyAccuracy();
  fire.fire(weaponSpec('spread', 1, 'invaders'), index => { tracker.begin(index, stats, 'spread'); return true; });
  tracker.hit(1, stats); expect(tracker.finish(stats)).toBe(200);
  expect(stats).toEqual({ shots: 3, hits: 1, misses: 2 });
});
