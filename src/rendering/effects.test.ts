import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { Random } from '../encounters';
import { actorFixture } from '../testing/actors';
import { EffectsSystem } from './effects';
import { createTextSprite } from '../models';

// Canvas lettering is checked by the renderer test; these checks own positioning,
// lifetime and GPU cleanup without needing a browser or a drawing context.
vi.mock('../models', async original => ({ ...await original<typeof import('../models')>(),
  createTextSprite: vi.fn(() => new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.Texture() })))
}));

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

it('places the actual reward below the destruction point and fades it independently of the craft', () => {
  const world = new THREE.Group(), effects = new EffectsSystem(world, () => new Random(1));
  const point = new THREE.Vector3(30, 0, -468); effects.flybyScore(point, 6000);
  expect(createTextSprite).toHaveBeenLastCalledWith('+6000', '#ffff70', undefined, 0.16, 0.05);
  const label = world.getObjectByName('flyby-score') as THREE.Sprite;
  expect(label.position).toEqual(point); expect(label.position).not.toBe(point);
  expect(label.userData.score).toBe(6000); expect(label.center.x).toBe(0.5); expect(label.center.y).toBeGreaterThan(1);
  expect(label.material.sizeAttenuation).toBe(false); expect(label.material.depthTest).toBe(false);
  point.x = 500; effects.update(0.7); expect(label.position.x).toBe(30);
  expect(label.material.opacity).toBeGreaterThan(0); expect(label.material.opacity).toBeLessThan(1);
  const texture = vi.spyOn(label.material.map!, 'dispose'), material = vi.spyOn(label.material, 'dispose');
  effects.update(1.6); expect(world.children).toHaveLength(0); expect(effects.count).toBe(0);
  expect(texture).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce();
});

it('clears reward labels and their textures between stages', () => {
  const world = new THREE.Group(), effects = new EffectsSystem(world, () => new Random(1));
  effects.flybyScore(new THREE.Vector3(), 1000); effects.flybyScore(new THREE.Vector3(10, 0, 0), 2000);
  const textures = world.children.map(child => vi.spyOn((child as THREE.Sprite).material.map!, 'dispose'));
  effects.clear(); effects.clear();
  expect(world.children).toHaveLength(0); expect(effects.count).toBe(0);
  textures.forEach(texture => expect(texture).toHaveBeenCalledOnce());
});
