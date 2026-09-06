/** Transparent bolt appearance; actual speed, damage and collision live in combat. */
import * as THREE from 'three';
import type { Faction } from '../logic';
import { lineShape, materialFromLine, tunePulseMaterial, createGlowLine } from './primitives';

export function createProjectileModel(color: number): THREE.LineSegments {
  const line = lineShape(
    [
      [0, 0, -2.6],
      [0, 0, 2.6]
    ],
    [[0, 1]],
    color,
    0.96
  );
  const material = materialFromLine(line);
  if (material) {
    tunePulseMaterial(material, 0.96);
  }
  return line;
}

export function setProjectilePulseOpacity(object: THREE.Object3D, pulse: number): void {
  object.traverse((child) => {
    if (
      (child instanceof THREE.LineSegments || child instanceof THREE.Points) &&
      child.material instanceof THREE.Material
    ) {
      const baseOpacity = Number(child.material.userData.baseOpacity ?? child.material.opacity);
      child.material.opacity = baseOpacity * (0.68 + pulse * 0.32);
    }
  });
}

export function createBoltModel(color: number, radius: number, length: number, faction: Faction, family: 'pulse' | 'spread' | 'lance' = 'pulse'): THREE.Group {
  // Two open rings give an approaching shot readable depth without a filled square.
  // Lance connects them into a long narrow outline; Pulse/Spread add short spokes.
  const group = new THREE.Group();
  const ringRadius = family === 'lance' ? 2.5 : Math.max(4.2, radius);
  const vertices: Array<[number, number, number]> = [];
  const edges: Array<[number, number]> = [];
  const segment = (a: [number, number, number], b: [number, number, number]) => {
    edges.push([vertices.length, vertices.length + 1]); vertices.push(a, b);
  };
  for (const [size, z] of [[ringRadius, 0], [ringRadius * 0.65, length * (family === 'lance' ? 0.8 : 0.22)]]) {
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, b = (i + 1) * Math.PI / 8;
      segment([Math.cos(a) * size, Math.sin(a) * size, z], [Math.cos(b) * size, Math.sin(b) * size, z]);
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, x = Math.cos(a), y = Math.sin(a);
    if (family === 'lance') segment([x * ringRadius, y * ringRadius, 0], [x * ringRadius * 0.65, y * ringRadius * 0.65, length * 0.8]);
    else segment([x * ringRadius * 1.18, y * ringRadius * 1.18, 0], [x * ringRadius * 1.5, y * ringRadius * 1.5, 0]);
  }
  // One draw call per transparent bolt keeps dense incoming fire inexpensive.
  group.add(createGlowLine(vertices, edges, color, faction === 'player' ? 0.85 : 0.9));
  return group;
}
