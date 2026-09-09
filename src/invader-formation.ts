/** Fleet movement and spacing, independent of meshes, audio, input and wall-clock time. */
import * as THREE from 'three';
import { invaderHome, invaderPosition } from './invader-patterns';

export const INVADER_CLEARANCE = 24;
// Depth is foreshortened by the armada camera. Extra Z clearance prevents visual stacking too.
const DEPTH_SCALE = 0.7;
const MIN_Z = -416, MAX_Z = -56, X_LIMIT = 72;
export interface InvaderMember { slot: number; position: THREE.Vector3 }

export function invaderDistance(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, (a.z - b.z) * DEPTH_SCALE);
}

export function invaderEntryPosition(slot: number, occupied: readonly THREE.Vector3[]): THREE.Vector3 {
  const home = invaderHome(slot);
  if (occupied.every(position => invaderDistance(home, position) >= INVADER_CLEARANCE)) return home;
  // Search the defensive plane before showing a warp effect, not one tick after spawning.
  const candidates: THREE.Vector3[] = [];
  for (let z = MAX_Z; z >= MIN_Z; z -= 36) for (let x = -X_LIMIT; x <= X_LIMIT; x += 24) candidates.push(new THREE.Vector3(x, 0, z));
  candidates.sort((a, b) => a.distanceToSquared(home) - b.distanceToSquared(home));
  const entry = candidates.find(point => occupied.every(other => invaderDistance(point, other) >= INVADER_CLEARANCE));
  if (!entry) throw new Error('Invader formation has no free arrival space');
  return entry;
}

function bound(position: THREE.Vector3): void {
  position.set(THREE.MathUtils.clamp(position.x, -X_LIMIT, X_LIMIT), 0, THREE.MathUtils.clamp(position.z, MIN_Z, MAX_Z));
}

export function stepInvaderFormation(members: readonly InvaderMember[], dt: number, elapsed: number, wave: number, speed: number): void {
  if (dt <= 0) return;
  const fleet = [...members].sort((a, b) => a.slot - b.slot);
  for (const member of fleet) {
    const delta = invaderPosition(member.slot, elapsed, wave, speed).sub(member.position);
    const distance = delta.length();
    if (distance > 0) member.position.addScaledVector(delta, Math.min(1 - Math.exp(-dt * 4), 100 * speed * dt / distance));
    bound(member.position);
  }
  // Resolve the entire formation before anyone fires. Small, bounded steps plus
  // separation keep crossing paths from swapping ships through one another.
  for (let pass = 0; pass < 128; pass++) {
    let overlap = false;
    for (let i = 0; i < fleet.length; i++) for (let j = i + 1; j < fleet.length; j++) {
      const a = fleet[i].position, b = fleet[j].position;
      let dx = b.x - a.x, dz = (b.z - a.z) * DEPTH_SCALE;
      let distance = Math.hypot(dx, dz);
      if (distance >= INVADER_CLEARANCE - 0.001) continue;
      overlap = true;
      if (distance < 0.00001) {
        // Stable slot-based direction also handles exact overlaps in imported/test fixtures.
        const angle = (fleet[i].slot * 7 + fleet[j].slot * 11) * 2.399963;
        dx = Math.cos(angle); dz = Math.sin(angle); distance = 1;
      }
      const push = (INVADER_CLEARANCE - invaderDistance(a, b) + 0.002) / 2;
      const x = dx / distance * push, z = dz / distance * push / DEPTH_SCALE;
      a.x -= x; a.z -= z; b.x += x; b.z += z;
      bound(a); bound(b);
    }
    if (!overlap) break;
  }
  // Recover corrupt/coincident starting layouts that cannot untangle locally at
  // a boundary. Normal flight keeps its continuous path and never needs this relocation.
  const settled: THREE.Vector3[] = [];
  for (const member of fleet) {
    if (settled.some(other => invaderDistance(member.position, other) < INVADER_CLEARANCE - 0.01)) {
      member.position.copy(invaderEntryPosition(member.slot, settled));
    }
    settled.push(member.position);
  }
}
