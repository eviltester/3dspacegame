import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { assistedAim } from './aim';
import { actorFixture } from '../testing/actors';
import type { Actor } from './types';

const origin = new Vector3(10, 20, 30), forward = new Vector3(0, 0, -1);
function target(angle: number, distance = 100, overrides: Partial<Actor> = {}) {
  const actor = actorFixture(overrides);
  actor.object.position.copy(origin).add(new Vector3(Math.sin(angle), 0, -Math.cos(angle)).multiplyScalar(distance));
  return actor;
}

it('partially corrects toward the closest hostile to the crosshair, not the closest ship', () => {
  const near = target(-0.03, 20), central = target(0.01, 400);
  const direction = assistedAim(origin, forward, [near, central], true);
  expect(direction.x).toBeGreaterThan(0);
  expect(direction.angleTo(forward)).toBeGreaterThan(0);
  expect(direction.angleTo(forward)).toBeLessThan(0.01);
  expect(direction.length()).toBeCloseTo(1);
  expect(assistedAim(origin, forward, [central, near], true)).toEqual(direction);
});

it.each([
  { faction: 'trader', kind: 'trader' }, { faction: 'police', kind: 'police' },
  { faction: 'neutral', kind: 'cargo' }, { faction: 'pirate', kind: 'cargo' }, { dead: true }
] satisfies Partial<Actor>[])('ignores protected or ineligible contacts %j', overrides => {
  expect(assistedAim(origin, forward, [target(0.01, 100, overrides)], true)).toEqual(forward);
});

it.each([[0.04, 100], [Math.PI, 100], [0.01, 600]])('rejects angle %s and distance %s outside the assist envelope', (angle, distance) => {
  expect(assistedAim(origin, forward, [target(angle, distance)], true)).toEqual(forward);
});

it('excludes the exact 500-unit boundary', () => {
  const aim = new Vector3(0.01, 0, -1).normalize();
  // An axis-aligned position has an exact distance, without trigonometric rounding.
  expect(assistedAim(origin, aim, [target(0, 500)], true)).toEqual(aim);
});

it('leaves an unassisted shot and all caller-owned vectors untouched', () => {
  const actor = target(0.02), before = actor.object.position.clone(), start = origin.clone(), aim = forward.clone();
  expect(assistedAim(origin, forward, [actor], false)).toEqual(forward);
  expect(assistedAim(origin, forward, [], true)).toEqual(forward);
  assistedAim(origin, forward, [actor], true);
  expect(actor.object.position).toEqual(before); expect(origin).toEqual(start); expect(forward).toEqual(aim);
});
