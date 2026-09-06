/** Shared defensive-lane geometry for Journey armadas and the Invaders mode. */
import * as THREE from 'three';

export const ARMADA_LANE_LIMIT = 76;
export const ARMADA_SALVAGE_SPEED = 24;

export function configureArmadaCamera(camera: THREE.PerspectiveCamera): void {
  // Look down the X/Z battle plane from above and behind the player. Pull back
  // on narrow screens so the entire left/right lane remains in view.
  const focus = new THREE.Vector3(0, 0, -120);
  const fit = Math.max(1, 0.85 / camera.aspect);
  camera.position.set(0, 150, 95).sub(focus).multiplyScalar(fit).add(focus);
  camera.up.set(0, 1, 0);
  camera.lookAt(focus);
  camera.updateMatrixWorld();
}

export function armadaFormationPosition(index: number, count: number): THREE.Vector3 {
  // Centre each row separately, including an incomplete last row. Limit width
  // so adding more enemies creates depth rather than unreachable outer columns.
  const columns = Math.min(6, Math.ceil(count / 2));
  const row = Math.floor(index / columns);
  const rowCount = Math.min(columns, count - row * columns);
  const spacing = Math.min(42, 126 / Math.max(1, columns - 1));
  return new THREE.Vector3((index % columns - (rowCount - 1) / 2) * spacing, 0, -165 - row * 78);
}

export function armadaSalvageVelocity(position: THREE.Vector3): THREE.Vector3 {
  const lane = new THREE.Vector3(THREE.MathUtils.clamp(position.x, -70, 70), 0, 0);
  return lane.sub(position).normalize().multiplyScalar(ARMADA_SALVAGE_SPEED);
}

export function driftArmadaSalvage(position: THREE.Vector3, velocity: THREE.Vector3, dt: number, essential: boolean): boolean {
  const oldZ = position.z;
  position.addScaledVector(velocity, dt);
  // Protected cargo waits in the reachable lane if it is not caught on arrival.
  if (essential && oldZ <= 0 && position.z >= 0) {
    position.z = 0;
    position.y = 0;
    velocity.set(0, 0, 0);
  }
  return !essential && position.z > 70;
}
