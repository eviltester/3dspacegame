import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { Random } from '../encounters';
import { actorFixture } from '../testing/actors';
import { EffectsSystem } from './effects';

it('animates arrivals, then disposes their geometry and material', () => {
  const world = new THREE.Group(), effects = new EffectsSystem(world, () => new Random(1));
  effects.warpIn([actorFixture()], new THREE.Quaternion());
  const ring = world.children[0] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  const dispose = vi.spyOn(ring.geometry, 'dispose');
  expect(effects.warpCount).toBe(1); effects.update(0.4);
  expect(ring.scale.x).toBeLessThan(1.6); expect(ring.material.opacity).toBeLessThan(1);
  effects.update(0.5); expect(effects.warpCount).toBe(0); expect(dispose).toHaveBeenCalledOnce();
  expect(world.children).toHaveLength(0);
});
it('limits destruction particles and clears them between stages', () => {
  const world = new THREE.Group(), rng = new Random(1), effects = new EffectsSystem(world, () => rng);
  effects.spark(new THREE.Vector3(), 0xff0000, 300); expect(effects.count).toBe(160);
  effects.update(0.1); expect(world.children.some(child => child.position.length() > 0)).toBe(true);
  effects.clear(); effects.clear(); expect(effects.count).toBe(0); expect(world.children).toHaveLength(0);
});
it('orients and animates the blast along the ship local forward axis', () => {
  const world = new THREE.Group(), effects = new EffectsSystem(world, () => new Random(1));
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  effects.blast(new THREE.Vector3(), rotation); expect(world.children[0].position.x).toBeCloseTo(-28);
  effects.update(0.2); expect(world.children[0].position.x).toBeCloseTo(-38);
  effects.update(0.5); expect(effects.count).toBe(0);
});
