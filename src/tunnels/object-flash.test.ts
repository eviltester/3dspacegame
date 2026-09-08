import * as THREE from 'three';
import { expect, it } from 'vitest';
import { TunnelObjectFlash } from './object-flash';
import { tunnelFixture } from './test-helpers';
import { addEntity } from './encounters';

it('gently flashes the model red before an attack and restores its original colour', () => {
  const { ctx } = tunnelFixture();
  const enemy = addEntity(ctx, 'ship', 0, 100, { warning: 0.9 });
  const material = new THREE.LineBasicMaterial({ color: 0x75caff, opacity: 0.8, transparent: true });
  const model = new THREE.LineSegments(new THREE.BufferGeometry(), material), flash = new TunnelObjectFlash();
  const original = material.color.clone(); flash.update(model, enemy, Math.PI / 20);
  expect(material.color.equals(original)).toBe(false); expect(material.opacity).toBeCloseTo(0.8);
  flash.update(model, enemy, 3 * Math.PI / 20); expect(material.color.equals(original)).toBe(true);
  expect(material.opacity).toBeCloseTo(0.8 * 0.78);
  enemy.warning = -1; flash.update(model, enemy, 1);
  expect(material.color.equals(original)).toBe(true); expect(material.opacity).toBe(0.8);
  material.dispose(); model.geometry.dispose();
});

it('flashes mines red throughout their approach without adding an icon or changing collision size', () => {
  const { ctx } = tunnelFixture(), mine = addEntity(ctx, 'mine', 0, 100);
  const material = new THREE.LineBasicMaterial({ color: 0xff5577 });
  const model = new THREE.LineSegments(new THREE.BufferGeometry(), material), flash = new TunnelObjectFlash();
  flash.update(model, mine, Math.PI / 24); expect(material.color.getHex()).toBe(0xff3038); expect(material.opacity).toBe(1);
  flash.update(model, mine, 3 * Math.PI / 24); expect(material.opacity).toBeCloseTo(0.35);
  expect(model.scale.toArray()).toEqual([1,1,1]); expect(model.children).toHaveLength(0);
  material.dispose(); model.geometry.dispose();
});
