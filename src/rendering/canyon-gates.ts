import * as THREE from 'three';

/** Pulse brightness only: the visible opening and its collision radius stay fixed. */
export function updateCanyonGateVisual(gate: THREE.Group, warning: boolean, elapsed: number): void {
  const pulse = warning ? 0.6 + 0.4 * (Math.sin(elapsed * 9) + 1) / 2 : 1;
  // The first two children are the opening rings; keep labels and EXIT arrows intact.
  for (const [index, child] of gate.children.slice(0, 2).entries()) {
    if (!(child instanceof THREE.LineSegments)) continue;
    const material = child.material as THREE.LineBasicMaterial;
    material.color.setHex(warning ? 0x20ff30 : 0x48ff95);
    material.opacity = pulse * (index === 1 ? 0.55 : 1);
  }
}
