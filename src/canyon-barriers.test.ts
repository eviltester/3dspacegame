import * as THREE from 'three';
import { expect, it } from 'vitest';
import { CanyonBarriers, canyonBarrierCount, canyonBarrierKinds, pillarExtension, sweepCanyonBarrier } from './canyon-barriers';
import { disposeObject } from './models/primitives';
import { createCatalog } from './models/catalog';

const path = new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, 0, -6400));
it('all six guide models retain their dimensions when the preview applies its uniform scale', () => {
  const catalog = createCatalog().slice(-6);
  const expected = [[10, 36, 8], [10, 18, 8], [10, 36, 8], [10, 18, 8], [20, 36, 8], [36, 18, 8]];
  for (const [index, entry] of catalog.entries()) {
    const object = entry.create(); object.scale.setScalar(entry.scale);
    expect(new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).toArray()).toEqual(expected[index]);
    disposeObject(object);
  }
});
function field(level = 8, seed = 42) {
  const root = new THREE.Group(), barriers = new CanyonBarriers(root, path, seed, level);
  return { root, barriers, dispose: () => disposeObject(root) };
}
it('introduces fixed pillars, then rising pillars, then walls, with bounded density', () => {
  expect(canyonBarrierKinds(1)).toEqual([]); expect(canyonBarrierCount(1)).toBe(0);
  expect(canyonBarrierKinds(2)).toEqual(['pillar', 'halfPillar']);
  expect(canyonBarrierKinds(3)).toEqual(['pillar', 'halfPillar', 'risingPillar', 'risingHalfPillar']);
  expect(canyonBarrierKinds(4)).toContain('sideWall'); expect(canyonBarrierKinds(4)).toContain('floorWall');
  expect([1, 2, 3, 4, 5, 6, 7, 8].map(canyonBarrierCount)).toEqual([0, 4, 7, 10, 13, 16, 18, 18]);
  expect(canyonBarrierCount(1000)).toBe(18);
});
it('retracts completely with a dwell at both ends of the cycle', () => {
  expect([0, 0.1, 0.2, 0.5, 0.6, 0.7, 1].map(t => pillarExtension(t * 10, 0, 10))).toEqual([0, 0, 0, 1, 1, 1, 0]);
  expect(pillarExtension(3.5, 0, 10)).toBeCloseTo(0.5);
  expect(pillarExtension(8.5, 0, 10)).toBeCloseTo(0.5);
  expect(pillarExtension(0, 0.6, 10)).toBe(1);
});
it.each([1, 99, 0xffffffff])('is seeded, spaced between gates and leaves a traversable opening for seed %s', seed => {
  const a = field(8, seed), b = field(8, seed);
  expect(a.barriers.snapshot).toEqual(b.barriers.snapshot);
  const gates = Array.from({ length: 19 }, (_, i) => path.getPointAt(i === 18 ? 0.985 : 0.055 + i * 0.05));
  for (const item of a.barriers.items) {
    expect(gates.every(gate => Math.abs(gate.z - item.base.z) > 100)).toBe(true);
    expect(item.width < 44 || item.height === 37).toBe(true);
    expect(item.height).toBe(item.kind === 'halfPillar' || item.kind === 'risingHalfPillar' || item.kind === 'floorWall' ? 37 : 74);
  }
  a.dispose(); b.dispose();
});
it('moves only the retracting geometry and matches exposed height to collision bounds', () => {
  const { barriers, dispose } = field();
  const original = barriers.snapshot;
  for (const item of barriers.items) item.phase = 0;
  const player = new THREE.Vector3(), offset = new THREE.Vector2();
  barriers.step(0, player, player, player, offset);
  for (const [i, item] of barriers.items.entries()) {
    if (!item.kind.startsWith('rising')) { expect(barriers.snapshot[i]).toEqual(original[i]); continue; }
    expect(item.object.visible).toBe(false); expect(item.bounds.max.y).toBe(item.base.y);
    // Advance each independent cycle to the fully raised dwell.
    barriers.step(item.period * 0.6, player, player, player, offset);
    expect(item.object.visible).toBe(true); expect(item.object.scale.y).toBe(item.height);
    expect(item.bounds.max.y).toBe(item.base.y + item.height);
    barriers.step(0, player, player, player, offset);
  }
  dispose();
});
it('sweeps fast crossings, rejects near misses and detects a top rising into the craft', () => {
  const box = new THREE.Box3(new THREE.Vector3(-5, -32, -5), new THREE.Vector3(5, 42, 5));
  expect(sweepCanyonBarrier(new THREE.Vector3(0, 0, 30), new THREE.Vector3(0, 0, -30), box, box)).toBeCloseTo(23 / 60);
  expect(sweepCanyonBarrier(new THREE.Vector3(8, 0, 30), new THREE.Vector3(8, 0, -30), box, box)).toBeNull();
  expect(sweepCanyonBarrier(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), box, box)).toBe(0);
  expect(sweepCanyonBarrier(new THREE.Vector3(-20, 0, 0), new THREE.Vector3(0, 0, 20), box, box)).toBeNull();
  const lowered = box.clone(); lowered.max.y = -32;
  expect(sweepCanyonBarrier(new THREE.Vector3(), new THREE.Vector3(), lowered, box)).toBeCloseTo(30 / 74);
});
it.each(['pillar', 'halfPillar', 'risingPillar', 'risingHalfPillar', 'sideWall', 'floorWall'] as const)('%s deflects without losing forward distance, sticking or repeated damage', kind => {
  const { barriers, dispose } = field();
  const item = barriers.items.find(barrier => barrier.kind === kind)!; barriers.items.splice(0, barriers.items.length, item);
  item.phase = 0.6; item.base.z = 0;
  const center = new THREE.Vector3(), offset = new THREE.Vector2();
  const far = new THREE.Vector3(0, 0, 100);
  barriers.step(0, far, far, center, offset);
  const before = new THREE.Vector3(item.object.position.x, 0, 30), position = before.clone(); position.z = -30;
  expect(barriers.step(0, before, position, center, offset)).toBe(1);
  expect(position.z).toBe(-30); expect(Math.abs(offset.x)).toBeLessThanOrEqual(34); expect(offset.y).toBeLessThanOrEqual(28);
  expect(item.bounds.clone().expandByScalar(2).containsPoint(new THREE.Vector3(position.x, position.y, 0))).toBe(false);
  expect(item.object.visible).toBe(true);
  expect(barriers.step(0, before, position, center, offset)).toBe(0);
  expect(barriers.snapshot[0].collided).toBe(true); dispose();
});
it('a fully lowered pillar can be flown over without a phantom impact', () => {
  const { barriers, dispose } = field(), item = barriers.items.find(item => item.kind === 'risingPillar')!;
  barriers.items.splice(0, barriers.items.length, item); item.phase = 0; item.base.z = 0;
  const far = new THREE.Vector3(0, 0, 100), center = new THREE.Vector3(), offset = new THREE.Vector2();
  barriers.step(0, far, far, center, offset);
  const before = new THREE.Vector3(item.base.x, -24, 30), after = before.clone(); after.z = -30;
  expect(barriers.step(0, before, after, center, offset)).toBe(0); expect(after.x).toBe(item.base.x);
  expect(barriers.shotDistance(new THREE.Ray(before, new THREE.Vector3(0, 0, -1)), 650)).toBe(650); dispose();
});
it('walls block rays and moving bolts but their open lanes do not', () => {
  const { barriers, dispose } = field(), item = barriers.items[0]; barriers.items.splice(1); item.base.set(0, -32, -100);
  const zero = new THREE.Vector3(); barriers.step(0, zero, zero, zero, new THREE.Vector2());
  barriers.step(0, zero, zero, zero, new THREE.Vector2());
  expect(barriers.shotDistance(new THREE.Ray(zero, new THREE.Vector3(0, 0, -1)), 650)).toBe(95);
  expect(barriers.hitTime(zero, new THREE.Vector3(0, 0, -200))).toBe(95 / 200);
  expect(barriers.hitTime(new THREE.Vector3(30, 0, 0), new THREE.Vector3(30, 0, -200))).toBeNull();
  dispose();
});
