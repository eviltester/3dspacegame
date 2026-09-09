import { expect, it } from 'vitest';
import { invaderFighterShots, invaderSpreadLimit, invaderStage } from './invaders';

it.each([[1, 0], [11, 0], [12, 0], [13, 1], [18, 1], [19, 2], [24, 2], [25, 3], [30, 3], [31, 4], [37, 5], [43, 6], [100, 6], [1000, 6]])(
  'wave %i permits only %i spread-firing formation slots', (wave, expected) => {
    expect(invaderSpreadLimit(wave)).toBe(expected);
    const shots = Array.from({ length: 18 }, (_, slot) => invaderFighterShots(wave, slot));
    expect(shots.filter(count => count === 3)).toHaveLength(expected);
    expect(shots.filter(count => count === 1)).toHaveLength(18 - expected);
    expect(invaderStage(wave).difficulty.fighterShots).toBe(1);
  }
);

it('normalizes wave numbers and never equips a nonexistent slot', () => {
  expect(invaderSpreadLimit(-10)).toBe(0); expect(invaderSpreadLimit(0)).toBe(0);
  expect(invaderSpreadLimit(18.9)).toBe(1); expect(invaderSpreadLimit(19.9)).toBe(2);
  expect(invaderFighterShots(1000, -1)).toBe(1); expect(invaderFighterShots(1000, 18)).toBe(1);
});
