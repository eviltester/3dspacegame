import { expect, it, vi } from 'vitest';
import { Euler, Group, PerspectiveCamera } from 'three';
import { BonusController } from './bonus';

// Only text rasterization needs a browser. Course geometry and camera motion do not.
vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new Group() }));

for (const kind of ['asteroids', 'canyon'] as const) {
  it.each([-1, 1])(`${kind} uses relative input to dodge horizontally and vertically (%s)`, sign => {
    const moving = new BonusController(kind, 18), straight = new BonusController(kind, 18);
    const camera = new PerspectiveCamera(), baseline = new PerspectiveCamera();
    for (let tick = 0; tick < 3; tick++) {
      moving.step(1 / 60, tick === 0 ? { x: sign * 15, y: sign * -10 } : { x: 0, y: 0 }, camera);
      straight.step(1 / 60, { x: 0, y: 0 }, baseline);
      // Zero input preserves the offset, without reapplying the previous delta.
      expect(camera.position.x - baseline.position.x).toBeCloseTo(sign * 1.95);
      expect(camera.position.y - baseline.position.y).toBeCloseTo(sign * 1.3);
      expect(camera.position.z).toBe(baseline.position.z);
    }
    moving.dispose(); straight.dispose();
  });

  it.each([-1, 1])(`${kind} bounds both dodging axes even for extreme input (%s)`, sign => {
    const moving = new BonusController(kind, 18), straight = new BonusController(kind, 18);
    const camera = new PerspectiveCamera(), baseline = new PerspectiveCamera();
    moving.step(1 / 60, { x: sign * 10000, y: sign * -10000 }, camera);
    straight.step(1 / 60, { x: 0, y: 0 }, baseline);
    expect(camera.position.x - baseline.position.x).toBeCloseTo(sign * 38);
    expect(camera.position.y - baseline.position.y).toBeCloseTo(sign > 0 ? 30 : -24);
    moving.dispose(); straight.dispose();
  });
}

it.each([-1, 1])('target aiming turns both axes while keeping the craft stationary (%s)', sign => {
  const bonus = new BonusController('sequence', 18), camera = new PerspectiveCamera();
  bonus.step(1 / 60, { x: sign * 50, y: sign * -20 }, camera);
  const angle = new Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  expect(angle.y).toBeCloseTo(-sign * 0.11); expect(angle.x).toBeCloseTo(sign * 0.044);
  expect(camera.position.length()).toBe(0);
  const orientation = camera.quaternion.clone(); bonus.step(1 / 60, { x: 0, y: 0 }, camera);
  expect(camera.quaternion.equals(orientation)).toBe(true);
  bonus.step(1 / 60, { x: sign * 10000, y: sign * -10000 }, camera);
  const limit = new Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  expect(limit.y).toBeCloseTo(-sign * 0.55); expect(limit.x).toBeCloseTo(sign * 0.45);
  bonus.dispose();
});

it.each(['asteroids', 'canyon', 'sequence'] as const)('%s ignores further movement after a completed exit', kind => {
  const bonus = new BonusController(kind, 18), camera = new PerspectiveCamera();
  bonus.step(1 / 60, { x: 5, y: -5 }, camera); bonus.finish('exit');
  const position = camera.position.clone(), rotation = camera.quaternion.clone();
  bonus.step(10, { x: 200, y: -200, boost: true }, camera);
  expect(camera.position).toEqual(position); expect(camera.quaternion.equals(rotation)).toBe(true);
  bonus.dispose();
});
