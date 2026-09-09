import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFENSIVE_MINE_BLAST_RADIUS } from '../combat/defensive-position';
import { disposeObject } from '../models';
import { MINE_WARNING_NAME, updateInvaderMineWarning } from './invader-mine-warning';

type Ring = THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
const objects: THREE.Object3D[] = [];
afterEach(() => { objects.splice(0).forEach(disposeObject); });
function fixture() {
  const object = new THREE.Group(); objects.push(object);
  const update = (age: number, distance: number) => {
    updateInvaderMineWarning(object, age, distance);
    const root = object.getObjectByName(MINE_WARNING_NAME)!;
    return { root, boundary: root.children[0] as Ring, pulse: root.children[1] as Ring };
  };
  return { object, update };
}

it('shows a warning only once armed and approaching, reusing its geometry every tick', () => {
  const f = fixture();
  const { root } = f.update(0.5, 40); expect(root.visible).toBe(false);
  expect(f.update(1.09, 40).root.visible).toBe(false);
  expect(f.update(1.1, 40).root.visible).toBe(true);
  expect(f.update(2, 150).root.visible).toBe(false);
  expect(f.update(2, 149).root.visible).toBe(true);
  expect(f.update(2, 500).root.visible).toBe(false);
  expect(f.update(3, 50).root).toBe(root);
  expect(f.object.children).toHaveLength(1); expect(root.children).toHaveLength(2);
});

it('grows brighter nearby and breathes within the fixed real blast boundary', () => {
  const f = fixture(), { boundary, pulse } = f.update(2, 140);
  const far = [boundary.material.opacity, pulse.material.opacity];
  f.update(2, 40);
  expect(boundary.material.opacity).toBeGreaterThan(far[0]); expect(pulse.material.opacity).toBeGreaterThan(far[1]);
  const radii = Array.from({ length: 120 }, (_, i) => f.update(2 + i / 60, 30).pulse.scale.x);
  expect(Math.min(...radii)).toBeLessThan(17); expect(Math.max(...radii)).toBeGreaterThan(25.9);
  expect(radii.every(radius => radius >= DEFENSIVE_MINE_BLAST_RADIUS * 0.65 && radius <= DEFENSIVE_MINE_BLAST_RADIUS)).toBe(true);
  expect(boundary.scale.x).toBe(DEFENSIVE_MINE_BLAST_RADIUS);
  f.update(5, 0); expect(boundary.material.opacity).toBeCloseTo(0.5); expect(pulse.material.opacity).toBeCloseTo(0.8);
});

it('keeps the radius in the flight plane despite the mine spinning and pulsing in size', () => {
  const f = fixture(); f.object.position.set(14, 0, -80);
  f.object.rotation.set(0.3, 1.2, -0.5); f.object.scale.set(1.3, 0.7, 2);
  const { boundary } = f.update(2, 80); f.object.updateMatrixWorld(true);
  const points = boundary.geometry.getAttribute('position');
  for (let i = 0; i < points.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(points, i).applyMatrix4(boundary.matrixWorld);
    expect(point.y).toBeCloseTo(0, 5);
    expect(point.distanceTo(f.object.position)).toBeCloseTo(DEFENSIVE_MINE_BLAST_RADIUS, 5);
  }
});

it('uses only hollow red line segments, never an opaque disc or collision mesh', () => {
  const f = fixture(), { root, boundary, pulse } = f.update(2, 60);
  expect(root.children.every(child => child instanceof THREE.LineSegments)).toBe(true);
  for (const ring of [boundary, pulse]) {
    expect(ring.material.transparent).toBe(true); expect(ring.material.depthWrite).toBe(false);
    expect(ring.material.color.getHex()).toBe(0xff263a);
    const points = ring.geometry.getAttribute('position');
    for (let i = 0; i < points.count; i++) expect(new THREE.Vector3().fromBufferAttribute(points, i).length()).toBeCloseTo(1);
  }
});

it('releases its shared geometry and both materials with the mine', () => {
  const f = fixture(), { boundary, pulse } = f.update(2, 60);
  const geometry = vi.spyOn(boundary.geometry, 'dispose');
  const materials = [boundary, pulse].map(ring => vi.spyOn(ring.material, 'dispose'));
  disposeObject(f.object);
  expect(geometry).toHaveBeenCalledOnce(); materials.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
  f.object.clear();
});
