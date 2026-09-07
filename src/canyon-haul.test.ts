import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { CanyonHaul, MAX_CANYON_HAUL_DROPS } from './canyon-haul';

it('creates the normal yellow pickup only on a successful drop roll, then collects it once by swept collision', () => {
  const root = new THREE.Group(), random = vi.fn().mockReturnValueOnce(0.2).mockReturnValue(0);
  const cargo = new CanyonHaul(root, random), position = new THREE.Vector3(0, 0, -50);
  cargo.release(position); expect(cargo.drops).toHaveLength(0);
  cargo.release(position); expect(cargo.drops).toHaveLength(1); expect(root.children[0].position).toEqual(position);
  expect(cargo.contacts[0]).toMatchObject({ color: '#ffff70', glyph: 'cargo' });
  const geometry = (root.children[0].children[0] as THREE.LineSegments).geometry, dispose = vi.spyOn(geometry, 'dispose');
  expect(cargo.step(0.1, new THREE.Vector3(), new THREE.Vector3(0, 0, -100))).toBe(1);
  expect(dispose).toHaveBeenCalledOnce(); expect(root.children).toHaveLength(0);
  expect(cargo.step(0.1, new THREE.Vector3(), new THREE.Vector3(0, 0, -100))).toBe(0);
});
it('attracts only nearby haul and removes passed, expired or surplus drops without awarding cargo', () => {
  const root = new THREE.Group(), cargo = new CanyonHaul(root, () => 0), origin = new THREE.Vector3();
  cargo.release(new THREE.Vector3(15, 0, 0)); cargo.release(new THREE.Vector3(30, 0, 0));
  expect(cargo.step(0.01, origin, origin)).toBe(0); expect(cargo.drops[0].object.position.x).toBe(13.5); expect(cargo.drops[1].object.position.x).toBe(30);
  expect(cargo.drops[0].object.rotation.z).not.toBe(0);
  cargo.drops[0].object.position.set(0, 0, 0); expect(cargo.step(0, origin, origin)).toBe(1);
  cargo.drops[0].object.position.set(30, 0, 50); expect(cargo.step(0, origin, origin)).toBe(0); expect(cargo.drops).toHaveLength(0);
  for (let i = 0; i <= MAX_CANYON_HAUL_DROPS; i++) cargo.release(new THREE.Vector3(0, 0, -50));
  expect(cargo.drops).toHaveLength(MAX_CANYON_HAUL_DROPS); expect(cargo.step(20, origin, origin)).toBe(0); expect(root.children).toHaveLength(0);
});
