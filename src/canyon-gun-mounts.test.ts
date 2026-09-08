import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { canyonGunMuzzle, canyonGunScale, sizeCanyonGun } from './canyon-gun-mounts';
import type { CanyonGunMount } from './canyon-gun-mounts';
import { CanyonCourse } from './canyon';
import { BonusController } from './bonus';
import { createCanyonTurret, disposeObject } from './models';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));
const roots: THREE.Object3D[] = [];
afterEach(() => { for (const root of roots) disposeObject(root); roots.length = 0; });

it.each(['floor', 'leftWall', 'rightWall'] as const)('%s guns start double size and shrink to normal by difficulty six', surface => {
  expect(Array.from({ length: 8 }, (_, i) => canyonGunScale(i + 1, surface))).toEqual([2, 2, 1.75, 1.5, 1.25, 1, 1, 1]);
  for (const level of [NaN, Infinity, -20, 0]) expect(canyonGunScale(level, surface)).toBe(2);
  expect(canyonGunScale(3.9, surface)).toBe(1.75); expect(canyonGunScale(1000, surface)).toBe(1);
  expect(canyonGunScale(1)).toBe(2);
});
it.each(['pillar', 'sideWall', 'floorWall'] as const)('%s obstacle mounts always keep the original small size', surface => {
  for (const level of [1, 2, 3, 6, 8, 1000]) expect(canyonGunScale(level, surface)).toBe(1);
});
it.each([-1, 0, 1])('size changes stay anchored to the mount and keep the muzzle aligned at rotation %i', side => {
  const object = createCanyonTurret(); roots.push(object);
  const mount: CanyonGunMount = { kind: side < 0 ? 'leftWall' : side > 0 ? 'rightWall' : 'floor', position: new THREE.Vector3(15, -26, -100), rotation: side * (Math.PI / 2 + Math.atan(7 / 74)) };
  sizeCanyonGun(object, 8, mount);
  const base = object.localToWorld(new THREE.Vector3(0, -3, 0));
  for (const level of [1, 2, 4, 6, 8, 1]) {
    const scale = sizeCanyonGun(object, level, mount);
    expect(object.scale.toArray()).toEqual([scale, scale, scale]);
    expect(object.localToWorld(new THREE.Vector3(0, -3, 0)).distanceTo(base)).toBeLessThan(1e-8);
    expect(canyonGunMuzzle(object).distanceTo(object.localToWorld(new THREE.Vector3(0, 3, 11)))).toBeLessThan(1e-8);
  }
});
it.each([false, true])('canyon generation applies visual and shooting sizes in smuggler=%s without enlarging the collision margin', smuggler => {
  for (const level of [1, 2, 4, 6, 8]) {
    const root = new THREE.Group(); roots.push(root);
    const course = new CanyonCourse(root, 42, level, smuggler);
    for (const target of course.targets) {
      if (target.kind !== 'turret') { expect(target.object.scale.x).toBe(1); continue; }
      const scale = canyonGunScale(level, target.mount?.kind);
      expect(target.object.scale.x).toBe(scale); expect(target.radius).toBe(8 * scale);
      expect(target.collisionRadius).toBe(8);
      if (target.mount?.kind === 'pillar') expect(target.radius).toBe(8);
    }
  }
});
it.each(['floor', 'leftWall', 'rightWall'] as const)('an early %s gun can be shot from safely inside the canyon', kind => {
  const bonus = new BonusController('canyon', 42, 1, true); roots.push(bonus.root);
  for (const target of bonus.canyon!.targets) target.used = true;
  const gun = bonus.canyon!.targets.find(target => target.mount?.kind === kind)!; gun.used = false;
  const inward = new THREE.Vector3(0, 1, 0).applyQuaternion(gun.object.quaternion);
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(gun.object.position).addScaledVector(inward, 14).add(new THREE.Vector3(0, 0, 100));
  // Aim parallel to the mounting surface, fourteen units inward from the gun's
  // centre: this used to miss an eight-unit target and invite a closer scrape.
  expect(bonus.shoot(camera)).toBe(true); expect(gun.used).toBe(true);
  expect(bonus.state.points).toBe(200); expect(bonus.state.shield).toBe(100);
});
it('flying through the larger aiming margin is safe, but a direct collision still hits the gun', () => {
  const root = new THREE.Group(); roots.push(root);
  const course = new CanyonCourse(root, 42, 1, true), camera = new THREE.PerspectiveCamera();
  for (const target of course.targets) target.used = true;
  const gun = course.targets.find(target => target.kind === 'turret')!;
  gun.used = false; gun.object.position.set(0, -26, 0);
  course.offset.y = -12; camera.position.set(0, -12, 0);
  expect(course.step(0, { x: 0, y: 0 }, camera).damage).toEqual([]); expect(gun.used).toBe(false);
  course.offset.y = -21;
  expect(course.step(0, { x: 0, y: 0 }, camera).damage).toEqual(['collision']); expect(gun.used).toBe(true);
});
