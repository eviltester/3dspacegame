/** A fixed blast boundary and breathing inner ring. Neither is a shootable surface. */
import * as THREE from 'three';
import { DEFENSIVE_MINE_ARMING_TIME, DEFENSIVE_MINE_BLAST_RADIUS, DEFENSIVE_MINE_WARNING_DISTANCE } from '../combat/defensive-position';

export const MINE_WARNING_NAME = 'mine-blast-radius';
type Ring = THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
const warnings = new WeakMap<THREE.Object3D, { root: THREE.Group; boundary: Ring; pulse: Ring }>();

function createWarning(object: THREE.Object3D) {
  const vertices: number[] = [];
  for (let segment = 0; segment < 48; segment++) {
    for (const end of [segment, segment + 1]) {
      const angle = end / 48 * Math.PI * 2;
      vertices.push(Math.cos(angle), 0, Math.sin(angle));
    }
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const ring = (): Ring => new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: 0xff263a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  const root = new THREE.Group(), boundary = ring(), pulse = ring();
  root.name = MINE_WARNING_NAME; root.matrixAutoUpdate = false;
  boundary.scale.setScalar(DEFENSIVE_MINE_BLAST_RADIUS);
  root.add(boundary, pulse); object.add(root);
  const warning = { root, boundary, pulse }; warnings.set(object, warning);
  return warning;
}

export function updateInvaderMineWarning(object: THREE.Object3D, age: number, distance: number): void {
  const { root, boundary, pulse } = warnings.get(object) ?? createWarning(object);
  root.visible = age >= DEFENSIVE_MINE_ARMING_TIME && distance < DEFENSIVE_MINE_WARNING_DISTANCE;
  if (!root.visible) return;
  const danger = THREE.MathUtils.clamp((DEFENSIVE_MINE_WARNING_DISTANCE - distance)
    / (DEFENSIVE_MINE_WARNING_DISTANCE - DEFENSIVE_MINE_BLAST_RADIUS), 0, 1);
  const breath = (Math.sin(age * (5 + danger * 7)) + 1) / 2;
  boundary.material.opacity = 0.14 + danger * 0.36;
  pulse.material.opacity = 0.25 + danger * 0.55;
  pulse.scale.setScalar(DEFENSIVE_MINE_BLAST_RADIUS * (0.65 + breath * 0.35));
  // The mine spins and changes size, but the danger circle stays in the flight
  // plane at the real collision radius. Invert only its rotation/scale, not position.
  root.matrix.makeRotationFromQuaternion(object.quaternion).scale(object.scale).invert();
}
