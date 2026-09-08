import { expect, it } from 'vitest';
import { TunnelKeys } from './input';
import { tunnelFixture, advanceTunnel } from './test-helpers';

it('latches a short tap, ignores OS repeats, and repeats held keys on simulation time', () => {
  const keys = new TunnelKeys(); keys.press('KeyD'); keys.release('KeyD');
  expect(keys.consume(1 / 60)).toBe(1); expect(keys.consume(1)).toBe(0);
  keys.press('ArrowLeft'); expect(keys.consume(1 / 60)).toBe(-1);
  keys.press('ArrowLeft'); expect(keys.consume(0.1)).toBe(0);
  expect(keys.consume(0.12)).toBe(-1); expect(keys.consume(0.16)).toBe(-1);
  keys.clear(); expect(keys.consume(1)).toBe(0);
});
it('ignores unrelated keys and cancels opposed directions', () => {
  const keys = new TunnelKeys(); keys.press('Space'); expect(keys.consume(0.1)).toBe(0);
  keys.press('KeyA'); keys.consume(0.01); keys.press('KeyD'); expect(keys.consume(0.5)).toBe(0);
  keys.clear(); keys.press('KeyD'); keys.press('ArrowRight'); expect(keys.consume(0.01)).toBe(1);
});
it.each([1,7])('a keyboard tap travels exactly one lane without mouse drift at tunnel %i', level => {
  const { sim, s } = tunnelFixture(level);
  sim.step(1 / 60, 0, false, 1); advanceTunnel(sim, 0.2); expect(s.lane).toBe(1);
  advanceTunnel(sim, 0.2); expect(s.lane).toBe(1);
  sim.step(1 / 60, 0, false, -2); advanceTunnel(sim, 0.4); expect(s.lane).toBe(level === 1 ? 11 : 0);
});
