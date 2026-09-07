import * as THREE from 'three';
import { expect, it } from 'vitest';
import { createCanyonGate, disposeObject, lineShape } from '../models';
import { updateCanyonGateVisual } from './canyon-gates';

it('pulses greener without resizing the opening or tinting labels and exit arrows', () => {
  const gate = createCanyonGate(12);
  const arrow = lineShape([[0, 14, 0], [0, 25, 0]], [[0, 1]], 0xffff70); gate.add(arrow);
  const front = gate.children[0] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  const rear = gate.children[1] as typeof front;
  const positions = [...front.geometry.getAttribute('position').array];
  updateCanyonGateVisual(gate, true, 0);
  expect(front.material.color.getHex()).toBe(0x20ff30);
  const dim = front.material.opacity; updateCanyonGateVisual(gate, true, Math.PI / 18);
  expect(front.material.opacity).toBeGreaterThan(dim);
  expect(gate.scale.toArray()).toEqual([1, 1, 1]); expect([...front.geometry.getAttribute('position').array]).toEqual(positions);
  expect((arrow.material as THREE.LineBasicMaterial).color.getHex()).toBe(0xffff70);
  updateCanyonGateVisual(gate, false, 20);
  expect(front.material.color.getHex()).toBe(0x48ff95); expect(front.material.opacity).toBe(1); expect(rear.material.opacity).toBe(0.55);
  disposeObject(gate);
});

it('tolerates an empty gate or a non-line child', () => {
  const gate = new THREE.Group(); updateCanyonGateVisual(gate, false, 0);
  gate.add(new THREE.Group()); expect(() => updateCanyonGateVisual(gate, true, 1)).not.toThrow();
});
