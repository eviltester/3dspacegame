import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { BonusController } from './bonus';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));
const field = (bonus: BonusController) => bonus.targetSequence!.targets;
function hit(bonus: BonusController, number: number, camera = new THREE.PerspectiveCamera()) {
  camera.lookAt(new THREE.Vector3(...field(bonus).find(t => t.number === number)!.position));
  return bonus.shoot(camera);
}

it('shuffles all sixteen numbers, varies by seed, and reproduces the same seeded field', () => {
  const a = new BonusController('sequence', 1), b = new BonusController('sequence', 1), c = new BonusController('sequence', 42);
  const numbers = (bonus: BonusController) => field(bonus).map(t => t.number);
  const ordered = Array.from({ length: 16 }, (_, i) => i + 1);
  expect([...numbers(a)].sort((x, y) => x - y)).toEqual(ordered);
  expect(numbers(a)).not.toEqual(ordered); expect(numbers(a)).toEqual(numbers(b)); expect(numbers(a)).not.toEqual(numbers(c));
  expect(field(a).filter(t => t.highlighted).map(t => t.number)).toEqual([1]);
  for (const bonus of [a, b, c]) bonus.dispose();
});

it('waits for a correct hit before moving, then smoothly accelerates as targets are cleared', () => {
  const bonus = new BonusController('sequence', 5), camera = new THREE.PerspectiveCamera();
  const before = field(bonus).map(t => t.position);
  bonus.step(2, { x: 0, y: 0 }, camera); expect(hit(bonus, 2)).toBe(false); bonus.blast(camera);
  bonus.step(2, { x: 0, y: 0 }, camera);
  expect(field(bonus).map(t => t.position)).toEqual(before); expect(bonus.targetSequence!.speed).toBe(0);
  expect(hit(bonus, 1)).toBe(true);
  expect(field(bonus).map(t => t.position)).toEqual(before);
  for (let i = 0; i < 60; i++) bonus.step(1 / 60, { x: 0, y: 0 }, camera);
  expect(bonus.targetSequence!.speed).toBeCloseTo(0.7);
  expect(field(bonus).every((t, i) => t.used || !new THREE.Vector3(...t.position).equals(new THREE.Vector3(...before[i])))).toBe(true);
  // Clearing more targets raises the motion rate without teleporting the survivors.
  for (let n = 2; n <= 10; n++) expect(hit(bonus, n)).toBe(true);
  const survivor = field(bonus).find(t => t.number === 16)!.position;
  bonus.step(1 / 60, { x: 0, y: 0 }, camera);
  expect(new THREE.Vector3(...survivor).distanceTo(new THREE.Vector3(...field(bonus).find(t => t.number === 16)!.position))).toBeLessThan(1);
  for (let i = 0; i < 120; i++) bonus.step(1 / 60, { x: 0, y: 0 }, camera);
  expect(bonus.targetSequence!.speed).toBeCloseTo(1.96); expect(field(bonus).filter(t => t.highlighted).map(t => t.number)).toEqual([11]);
  bonus.dispose();
});

it.each([1, 41, 90210])('keeps moving rings separate, readable and within the aiming range for seed %s', seed => {
  const bonus = new BonusController('sequence', seed), camera = new THREE.PerspectiveCamera();
  for (let n = 1; n <= 4; n++) hit(bonus, n);
  for (let tick = 0; tick < 1200; tick++) {
    bonus.step(1 / 30, { x: 0, y: 0 }, camera);
    const targets = field(bonus).filter(t => !t.used);
    for (let i = 0; i < targets.length; i++) {
      const p = new THREE.Vector3(...targets[i].position);
      expect(Math.abs(Math.atan2(p.x, -p.z))).toBeLessThan(0.55);
      expect(Math.abs(Math.atan2(p.y, Math.hypot(p.x, p.z)))).toBeLessThan(0.45);
      for (let j = i + 1; j < targets.length; j++) expect(p.distanceTo(new THREE.Vector3(...targets[j].position))).toBeGreaterThanOrEqual(20);
    }
  }
  bonus.dispose();
});

it('hits the current moving positions, keeps wrong-hit penalties, and completes all sixteen once', () => {
  const bonus = new BonusController('sequence', 41), camera = new THREE.PerspectiveCamera();
  for (let n = 1; n <= 16; n++) {
    bonus.step(0.25, { x: 0, y: 0 }, camera);
    if (n === 8) {
      const remaining = bonus.state.remaining;
      expect(hit(bonus, 12)).toBe(false); expect(bonus.state.remaining).toBe(remaining - 2);
      expect(bonus.state.nextMarker).toBe(8); expect(bonus.state.points).toBe(7 * 95 - 5);
    }
    expect(hit(bonus, n)).toBe(true); expect(bonus.state.nextMarker).toBe(n + 1); expect(bonus.state.points).toBe(n * 95 - (n >= 8 ? 5 : 0));
  }
  expect(bonus.state.reason).toBe('complete'); expect(field(bonus).every(t => t.used)).toBe(true);
  const frozen = JSON.stringify(bonus.targetSequence); bonus.step(10, { x: 0, y: 0 }, camera);
  expect(JSON.stringify(bonus.targetSequence)).toBe(frozen); expect(hit(bonus, 16)).toBe(false); expect(bonus.state.points).toBe(16 * 95 - 5);
  expect(bonus.state.shotsFired).toBe(17);
  bonus.dispose();
});

it('stops motion on a safe exit and on timeout', () => {
  for (const reason of ['exit', 'timeout'] as const) {
    const bonus = new BonusController('sequence', 9), camera = new THREE.PerspectiveCamera();
    hit(bonus, 1); bonus.step(0.5, { x: 0, y: 0 }, camera);
    if (reason === 'timeout') { bonus.state.remaining = 0.1; bonus.step(0.1, { x: 0, y: 0 }, camera); }
    else bonus.finish(reason);
    const frozen = JSON.stringify(bonus.targetSequence); bonus.step(2, { x: 50, y: 40 }, camera);
    expect(bonus.state.reason).toBe(reason); expect(JSON.stringify(bonus.targetSequence)).toBe(frozen);
    bonus.dispose();
  }
});
