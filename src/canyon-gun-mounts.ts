/** Surface mounts keep turrets attached to scenery and their muzzles clear of it. */
import * as THREE from 'three';
import type { CanyonBarrier } from './canyon-barriers';
import type { Random } from './encounters';
import { bonusProfile } from './bonus-difficulty';

export interface CanyonGunMount { kind: 'floor' | 'leftWall' | 'rightWall' | 'pillar' | 'sideWall' | 'floorWall'; position: THREE.Vector3; rotation: number; pillarId?: number }
export function canyonGunScale(difficulty: number, surface: CanyonGunMount['kind'] = 'floor'): number {
  // leftWall/rightWall are the canyon sides; sideWall/floorWall are solid blockers.
  if (surface === 'pillar' || surface === 'sideWall' || surface === 'floorWall') return 1;
  return 2 - THREE.MathUtils.clamp((bonusProfile(difficulty).level - 2) / 4, 0, 1);
}

export function sizeCanyonGun(object: THREE.Object3D, difficulty: number, mount?: CanyonGunMount): number {
  const scale = canyonGunScale(difficulty, mount?.kind);
  object.scale.setScalar(scale);
  if (mount) {
    object.rotation.z = mount.rotation;
    // Scale around the mounting surface, not the centre: the base remains flush
    // while the larger body extends into the corridor instead of into the scenery.
    object.position.copy(mount.position).add(new THREE.Vector3(0, 3 * (scale - 1), 0).applyQuaternion(object.quaternion));
  }
  return scale;
}
export function canyonGunMount(center: THREE.Vector3, index: number, difficulty: number, barriers: CanyonBarrier[], rng: Random): CanyonGunMount {
  // Full-height tops sit above the skiff's steering ceiling. Use reachable fixed
  // half-pillars so the player can return fire without shooting through scenery.
  const fixed = barriers.filter(item => item.kind === 'halfPillar');
  const pillar = difficulty >= 4 && index % 7 === 6 ? fixed[Math.floor(index / 7)] : undefined;
  if (pillar) return { kind: 'pillar', position: pillar.base.clone().add(new THREE.Vector3(0, pillar.height + 3, 0)), rotation: 0, pillarId: pillar.object.id };
  const slot = index % 5;
  if (slot === 1 || slot === 3) {
    const side = slot === 1 ? -1 : 1, y = rng.range(-19, 31);
    const normal = new THREE.Vector3(-side, -7 / 74, 0).normalize();
    const position = center.clone().add(new THREE.Vector3(side * (43 + (y + 32) * 7 / 74), y, 0)).addScaledVector(normal, 3);
    return { kind: side < 0 ? 'leftWall' : 'rightWall', position, rotation: side * (Math.PI / 2 + Math.atan(7 / 74)) };
  }
  return { kind: 'floor', position: center.clone().add(new THREE.Vector3(slot === 0 ? 0 : rng.range(-32, 32), -29, 0)), rotation: 0 };
}

export function canyonGunMuzzle(object: THREE.Object3D): THREE.Vector3 {
  // The barrel extends past the supporting pillar's forward edge, preventing self-occlusion.
  return new THREE.Vector3(0, 3, 11).multiply(object.scale).applyQuaternion(object.quaternion).add(object.position);
}
