import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createEnemyModel, createInvaderModel, createPoliceModel, createTraderHaulerModel, createTraderUfoModel } from '../models/ships';
import { disposeObject, edgesFromGeometry, lineShape } from '../models/primitives';
import { createHullPanels } from './ship-panels';

it('turns a box into six open four-sided panels without changing or sharing the source', () => {
  const source = edgesFromGeometry(new THREE.BoxGeometry(10, 6, 8), 0x72c8ff);
  const original = Array.from(source.geometry.getAttribute('position').array);
  const geometryDisposed = vi.spyOn(source.geometry, 'dispose');
  const panels = createHullPanels(source, new THREE.Group());
  expect(panels).toHaveLength(6);
  for (const panel of panels) {
    expect(panel.geometry.getAttribute('position').count).toBe(8);
    expect(panel.material.color.getHex()).toBe(0x72c8ff);
    expect(panel.material.transparent).toBe(true); expect(panel.material.depthWrite).toBe(false);
    expect(panel.geometry).not.toBe(source.geometry); expect(panel.material).not.toBe(source.material);
    disposeObject(panel);
  }
  expect(geometryDisposed).not.toHaveBeenCalled();
  expect(Array.from(source.geometry.getAttribute('position').array)).toEqual(original);
  disposeObject(source);
});

it.each(['raider', 'flanker', 'diver', 'gunship', 'minelayer', 'carrier'] as const)('extracts readable hull sections from the %s model', role => {
  const source = createEnemyModel(role), panels = createHullPanels(source, new THREE.Group());
  expect(panels.length).toBeGreaterThanOrEqual(4); expect(panels.length).toBeLessThanOrEqual(12);
  for (const panel of panels) {
    expect(Array.from(panel.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    expect(panel.geometry.getAttribute('position').count).toBeGreaterThanOrEqual(4);
    disposeObject(panel);
  }
  disposeObject(source);
});

it('supports police, traders and original Invader silhouettes', () => {
  const sources = [createPoliceModel(), createTraderHaulerModel(), createTraderUfoModel(), createInvaderModel('diver')];
  for (const source of sources) {
    const panels = createHullPanels(source, new THREE.Group());
    expect(panels.length).toBeGreaterThanOrEqual(4);
    panels.forEach(disposeObject); disposeObject(source);
  }
});

it('preserves translated, rotated and scaled hull positions in the effect parent space', () => {
  const scene = new THREE.Scene(), parent = new THREE.Group(), source = new THREE.Group();
  scene.add(parent, source); parent.position.set(30, -10, 8); parent.rotation.z = 0.4;
  source.position.set(-20, 30, -150); source.rotation.set(0.3, 1.1, 0.4); source.scale.set(1.5, 0.7, 2);
  const hull = edgesFromGeometry(new THREE.BoxGeometry(10, 6, 8), 0xff4055); hull.position.x = 4; source.add(hull);
  source.updateWorldMatrix(true, true); parent.updateWorldMatrix(true, false);
  const expected = new THREE.Box3().setFromBufferAttribute(hull.geometry.getAttribute('position') as THREE.BufferAttribute);
  const transform = parent.matrixWorld.clone().invert().multiply(hull.matrixWorld);
  expected.applyMatrix4(transform);
  const panels = createHullPanels(source, parent), actual = new THREE.Box3();
  for (const panel of panels) { panel.updateMatrix(); actual.union(new THREE.Box3().setFromObject(panel)); }
  expect(actual.min.distanceTo(expected.min)).toBeLessThan(1e-4);
  expect(actual.max.distanceTo(expected.max)).toBeLessThan(1e-4);
  panels.forEach(disposeObject); disposeObject(source);
});

it('handles flat wings, simple antennae, hidden children and exhausted capacity', () => {
  const source = new THREE.Group();
  const wing = lineShape([[-5, 0, 0], [0, 0, -8], [5, 0, 0]], [[0, 1], [1, 2], [2, 0]], 0xff4055);
  const antenna = lineShape([[0, 0, 0], [0, 4, 0]], [[0, 1]], 0xffffff);
  const hidden = createPoliceModel(); hidden.visible = false; source.add(wing, antenna, hidden);
  const panels = createHullPanels(source, new THREE.Group());
  expect(panels.map(p => p.geometry.getAttribute('position').count)).toEqual([6, 2]);
  expect(createHullPanels(source, new THREE.Group(), 0)).toEqual([]);
  const limited = createHullPanels(source, new THREE.Group(), 1); expect(limited).toHaveLength(1);
  [...panels, ...limited].forEach(disposeObject); disposeObject(source);
});
