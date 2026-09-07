import { expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { moveShip } from './flight-motion';
import { ARMADA_LANE_LIMIT } from './armada';
import type { FlightCommand } from './input';

const idle: FlightCommand = { x: 0, y: 0, roll: 0, speed: 0, boost: false };
const free = { mode: 'journey', kind: 'patrol', cleared: false } as const;

it.each([65, 0, -15, -130, 230])('moves at selected speed %s along the local forward axis', speed => {
  const position = new Vector3(7, 8, 9), orientation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  expect(moveShip(position, orientation, { ...idle, speed }, 0.5, free)).toBe(false);
  expect(position.x).toBeCloseTo(7 - speed / 2);
  expect(position.y).toBe(8); expect(position.z).toBeCloseTo(9);
});

it.each([-1, 1])('continues pitching through multiple loops in direction %s after a roll', sign => {
  const position = new Vector3(), orientation = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
  const start = orientation.clone();
  for (let tick = 0; tick < 720; tick++) {
    moveShip(position, orientation, { ...idle, y: sign * Math.PI / 180 / 0.0022 }, 1 / 60, free);
    expect(orientation.length()).toBeCloseTo(1);
    if (tick === 89) {
      // Rolled local pitch turns toward world X, not world Y.
      const forward = new Vector3(0, 0, -1).applyQuaternion(orientation);
      expect(forward.x).toBeCloseTo(sign); expect(forward.y).toBeCloseTo(0);
    }
  }
  expect(Math.abs(orientation.dot(start))).toBeCloseTo(1);
  expect(position.length()).toBe(0);
});

it('consumes mouse displacement once, independently of frame duration', () => {
  const a = new Quaternion(), b = new Quaternion();
  moveShip(new Vector3(), a, { ...idle, x: 70, y: -25 }, 1 / 30, free);
  moveShip(new Vector3(), b, { ...idle, x: 70, y: -25 }, 1 / 120, free);
  expect(a.equals(b)).toBe(true); expect(a.equals(new Quaternion())).toBe(false);
});

it('roll and travel rates are independent of the simulation step size', () => {
  const a = new Vector3(), b = new Vector3(), qa = new Quaternion(), qb = new Quaternion();
  const command = { ...idle, speed: 65, roll: 1 };
  moveShip(a, qa, command, 1, free);
  for (let i = 0; i < 60; i++) moveShip(b, qb, command, 1 / 60, free);
  expect(a.distanceTo(b)).toBeLessThan(1e-10); expect(qa.angleTo(qb)).toBeLessThan(1e-7);
});

it.each([-10000, 10000])('clamps armada movement %s to the defensive lane', x => {
  const position = new Vector3(0, 10, -50), orientation = new Quaternion(1, 0, 0, 0);
  moveShip(position, orientation, { ...idle, x, y: 100, speed: 230, boost: true }, 1, { ...free, kind: 'armada' });
  expect(position.toArray()).toEqual([Math.sign(x) * ARMADA_LANE_LIMIT, 0, 0]);
  expect(orientation.equals(new Quaternion())).toBe(true);
});

it('combines lateral input and keyboard roll but ignores vertical input in the lane', () => {
  const position = new Vector3(), orientation = new Quaternion();
  moveShip(position, orientation, { ...idle, x: 100, y: 300, roll: 1 }, 0.2, { ...free, kind: 'armada' });
  expect(position.toArray()).toEqual([7, 0, 0]);
});

it.each(['journey', 'endless', 'invaders'] as const)('%s applies the correct movement after clearing an armada', mode => {
  const position = new Vector3(), orientation = new Quaternion();
  moveShip(position, orientation, { ...idle, x: 50, y: 30, speed: 65 }, 0.1, { mode, kind: 'armada', cleared: true });
  expect(orientation.equals(new Quaternion())).toBe(mode === 'invaders');
  if (mode === 'invaders') expect(position.toArray()).toEqual([11, 0, 0]);
  else expect(position.z).toBeLessThan(0);
});

it.each([
  ['endless', false, true], ['endless', true, false], ['journey', false, false], ['invaders', false, false]
] as const)('%s cleared=%s only restricts travel while its arena is active', (mode, cleared, bounded) => {
  const position = new Vector3(0, 0, -500);
  expect(moveShip(position, new Quaternion(), { ...idle, speed: 65 }, 1, { ...free, mode, cleared })).toBe(bounded);
  expect(position.length()).toBe(bounded ? 500 : 565);
});

it('does not warn at the exact arena boundary or while moving back inside', () => {
  const position = new Vector3(0, 0, -500), orientation = new Quaternion(), area = { ...free, mode: 'endless' } as const;
  expect(moveShip(position, orientation, idle, 1, area)).toBe(false);
  expect(moveShip(position, orientation, { ...idle, speed: -15 }, 1, area)).toBe(false);
  expect(position.z).toBe(-485);
});
