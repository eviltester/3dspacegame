import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createBoltModel, createEnemyModel, disposeObject, setProjectilePulseOpacity } from '../models';
import { weaponSpec } from '../weapons';

it.each(['pulse', 'spread', 'lance'] as const)('%s is a sparse, transparent hollow projectile with animated opacity', family => {
  const spec = weaponSpec(family, 3), model = createBoltModel(spec.color, spec.radius, spec.length, 'player', family);
  expect(model.children).toHaveLength(1);
  const line = model.children[0] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  expect(line.material.transparent).toBe(true); expect(line.material.depthWrite).toBe(false); expect(line.material.blending).toBe(THREE.AdditiveBlending);
  const vertices = line.geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) expect(Math.hypot(vertices.getX(i), vertices.getY(i))).toBeGreaterThan(1);
  setProjectilePulseOpacity(model, 0); const dim = line.material.opacity; setProjectilePulseOpacity(model, 1);
  expect(line.material.opacity).toBeGreaterThan(dim); disposeObject(model);
});
it.each(['raider', 'flanker', 'diver', 'gunship', 'minelayer', 'carrier'] as const)('%s retains a sparse, bounded wireframe silhouette', role => {
  const ship = createEnemyModel(role); let vertices = 0;
  ship.traverse(child => {
    if (child instanceof THREE.LineSegments && child.geometry instanceof THREE.BufferGeometry) vertices += (child.geometry as THREE.BufferGeometry).getAttribute('position').count;
    expect(child).not.toBeInstanceOf(THREE.Mesh);
  });
  expect(vertices).toBeGreaterThan(0); expect(vertices).toBeLessThanOrEqual(40); disposeObject(ship);
});
it('disposes shared geometry, material arrays and textures exactly once', () => {
  const group = new THREE.Group(), geometry = new THREE.BoxGeometry(), texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  group.add(new THREE.Mesh(geometry, [material, material]), new THREE.Mesh(geometry, material));
  const disposals = [vi.spyOn(geometry, 'dispose'), vi.spyOn(material, 'dispose'), vi.spyOn(texture, 'dispose')];
  disposeObject(group); for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
});
