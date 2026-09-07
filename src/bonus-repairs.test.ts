import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { MAX_SKIFF_REPAIR_DROPS, SkiffRepairDrops } from './bonus-repairs';

it('releases distinct collectible models at the destruction position, with triangle radar contacts', () => {
  const root = new THREE.Group(), random = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(2.5 / 30).mockReturnValue(0.5);
  const drops = new SkiffRepairDrops(root, random), position = new THREE.Vector3(5, 3, -50);
  drops.release('rock', position); drops.release('rock', position); drops.release('rock', position);
  expect(random).toHaveBeenCalledTimes(3); expect(drops.drops.map(drop => drop.kind)).toEqual(['shield', 'repair']);
  expect(root.children).toHaveLength(2); expect(root.children[0].position).toEqual(position);
  expect(root.children[0].children.length).not.toBe(root.children[1].children.length);
  expect(drops.contacts.map(contact => [contact.color, contact.glyph])).toEqual([['#70cfff', 'cargo'], ['#ff80ee', 'cargo']]);
  position.set(0, 0, 0); expect(root.children[0].position.z).toBe(-50);
});
it.each([['rock', 'shield', 2], ['turret', 'repair', 3]] as const)('collecting %s drop repairs once, even across a fast swept crossing', (source, kind, expected) => {
  const root = new THREE.Group(), drops = new SkiffRepairDrops(root, () => 0);
  drops.release(source, new THREE.Vector3(0, 0, -50));
  expect(drops.step(0.1, new THREE.Vector3(), new THREE.Vector3(0, 0, -100), 1)).toBe(expected);
  expect(drops.collected).toBe(1); expect(drops.notice).toContain(kind.toUpperCase()); expect(root.children).toHaveLength(0);
  expect(drops.step(0.1, new THREE.Vector3(), new THREE.Vector3(0, 0, -100), expected)).toBe(expected);
  expect(drops.collected).toBe(1); expect(drops.notice).toBe('');
});
it('only attracts near pickups, animates them, and never resurrects a destroyed skiff', () => {
  const drops = new SkiffRepairDrops(new THREE.Group(), () => 0), origin = new THREE.Vector3();
  drops.release('rock', new THREE.Vector3(15, 0, 0)); drops.release('rock', new THREE.Vector3(30, 0, 0));
  expect(drops.step(0.01, origin, origin, 1)).toBe(1);
  expect(drops.drops[0].object.position.x).toBe(13.5); expect(drops.drops[1].object.position.x).toBe(30);
  expect(drops.drops[0].object.rotation.z).not.toBe(0);
  expect(drops.step(0.1, origin, origin, 0)).toBe(0); expect(drops.collected).toBe(0);
  drops.release('rock', origin); expect(drops.step(0, origin, origin, 3)).toBe(3); expect(drops.collected).toBeGreaterThan(0);
});
it('bounds active drops and disposes missed or expired models', () => {
  const root = new THREE.Group(), drops = new SkiffRepairDrops(root, () => 0), origin = new THREE.Vector3();
  for (let i = 0; i < MAX_SKIFF_REPAIR_DROPS + 5; i++) drops.release('rock', new THREE.Vector3(0, 0, -60));
  expect(drops.drops).toHaveLength(MAX_SKIFF_REPAIR_DROPS);
  const geometry = (root.children[0].children[0] as THREE.LineSegments).geometry, dispose = vi.spyOn(geometry, 'dispose');
  drops.step(20, origin, origin, 3); expect(root.children).toHaveLength(0); expect(dispose).toHaveBeenCalledOnce();
  drops.release('rock', new THREE.Vector3(50, 0, 45)); drops.step(0, origin, origin, 3);
  expect(drops.drops).toHaveLength(0); expect(drops.collected).toBe(0);
});
