import { expect, it } from 'vitest';
import { BoostDrive } from './boost';

it('course boost reaches its cap in under a second without an instant jump', () => {
  const drive = new BoostDrive(0.65);
  expect(drive.step(0, 100, true)).toBe(100);
  expect(drive.step(1 / 60, 100, true)).toBeCloseTo(101.0833, 3);
  for (let i = 0; i < 47; i++) drive.step(1 / 60, 100, true);
  expect(drive.step(1, 100, true)).toBe(150);
});
it('decelerates on release, forgets boost after coasting, and follows changing automatic pace', () => {
  const drive = new BoostDrive(0.65);
  drive.step(1, 100, true);
  expect(drive.step(0.5, 100, false)).toBeCloseTo(132.5);
  expect(drive.step(0, 200, false)).toBeCloseTo(265);
  drive.step(2, 200, false); expect(drive.amount).toBe(0);
  expect(drive.step(0.1, 200, true)).toBeCloseTo(213);
  drive.reset(); expect(drive.step(0, 200, true)).toBe(200);
});
it('uses a gradual default drive and ignores invalid time without corrupting speed', () => {
  const drive = new BoostDrive();
  expect(drive.step(1, -100, true)).toBe(-125);
  for (const dt of [NaN, Infinity, -1]) expect(drive.step(dt, 100, true)).toBe(125);
});
