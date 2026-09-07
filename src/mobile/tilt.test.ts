import { expect, it } from 'vitest';
import { TiltSteering } from './tilt';
import { tiltSensitivity } from '../input-layouts';

it('centres on the first valid sample and ignores small tremors', () => {
  const tilt = new TiltSteering(); tilt.sample(120, 40, -10, 0, 0);
  expect(tilt.read(1, 0, 1)).toEqual({ x: 0, y: 0 });
  tilt.sample(120, 41, -9, 0, 1); expect(tilt.read(1, 1, 1)).toEqual({ x: 0, y: 0 });
});
it.each([NaN, Infinity, null])('rejects invalid pitch %s without replacing a valid sample', value => {
  const tilt = new TiltSteering(); tilt.sample(null, 0, 0, 0, 10);
  expect(tilt.sample(0, value, 0, 0, 20)).toBe(false); expect(tilt.lastSample).toBe(10);
});
it('rejects corrupt heading, roll and screen angle', () => {
  const tilt = new TiltSteering();
  expect(tilt.sample(NaN, 0, 0, 0, 0)).toBe(false);
  expect(tilt.sample(0, 0, null, 0, 0)).toBe(false);
  expect(tilt.sample(0, 0, Infinity, 0, 0)).toBe(false);
  expect(tilt.sample(0, 0, 0, NaN, 0)).toBe(false);
});
it('maps pitch and roll to both steering axes with bounded, smoothed output', () => {
  const tilt = new TiltSteering(); tilt.sample(0, 0, 0, 0, 0); tilt.sample(0, 20, 20, 0, 1);
  const first = tilt.read(1 / 60, 1, 1);
  expect(first.x).toBeGreaterThan(0); expect(first.y).toBeGreaterThan(0); expect(first.x).toBeLessThan(2);
  for (let i = 0; i < 60; i++) tilt.read(1 / 60, 2, 1);
  const settled = tilt.read(1 / 60, 2, 1); expect(settled.x).toBeGreaterThan(first.x); expect(settled.x).toBeLessThanOrEqual(520 / 60);
});
it.each([90, -90, 180])('calibrates screen orientation %s and rotates axes into that screen', angle => {
  const tilt = new TiltSteering(); tilt.sample(0, 0, 0, 0, 0); tilt.sample(0, 30, 20, 0, 1);
  tilt.read(1, 1, 1); tilt.sample(0, 0, 0, angle, 2);
  expect(tilt.read(1, 2, 1)).toEqual({ x: 0, y: 0 });
  tilt.sample(0, 15, 0, angle, 3); const result = tilt.read(1, 3, 1);
  if (angle === 180) { expect(result.x).toBeCloseTo(0); expect(result.y).toBeLessThan(0); }
  else { expect(Math.sign(result.x)).toBe(Math.sign(angle)); expect(result.y).toBeCloseTo(0); }
});
it('handles wrapped angles and stale sensors without an abrupt turn', () => {
  const tilt = new TiltSteering(); tilt.sample(359, 0, 0, 0, 0); tilt.sample(1, 0, 0, 0, 10);
  expect(tilt.read(1, 10, 1)).toEqual({ x: 0, y: 0 });
  tilt.sample(1, 20, 20, 0, 20); tilt.read(1, 20, 1);
  expect(tilt.read(1, 1021, 1)).toEqual({ x: 0, y: 0 });
  tilt.calibrate(); tilt.sample(200, -20, 15, 0, 1030);
  expect(tilt.read(1, 1030, 1)).toEqual({ x: 0, y: 0 });
});
it('uses timestep-based smoothing and sensitivity instead of sensor frequency', () => {
  function simulate(dt: number, sensitivity: number) {
    const tilt = new TiltSteering(); tilt.sample(0, 0, 0, 0, 0); tilt.sample(0, 0, 20, 0, 0);
    for (let t = 0; t < 1 - dt / 2; t += dt) tilt.read(dt, 0, sensitivity);
    return tilt.read(0.01, 0, sensitivity).x;
  }
  expect(simulate(1 / 30, 1)).toBeCloseTo(simulate(1 / 120, 1), 6);
  expect(simulate(1 / 60, 2)).toBeCloseTo(simulate(1 / 60, 1) * 2, 6);
});
it.each([[undefined, 1], ['1.5', 1], [NaN, 1], [0, 0.5], [9, 2], [1.4, 1.4]])('validates sensitivity %s', (value, result) => {
  expect(tiltSensitivity(value)).toBe(result);
});
