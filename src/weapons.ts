import * as THREE from 'three';
import type { WeaponFamily } from './arcade';
import { FAMILIES } from './arcade';

export type WeaponCommand = WeaponFamily | 'next';
export function selectWeapon(current: WeaponFamily, command: WeaponCommand): WeaponFamily {
  return command === 'next' ? FAMILIES[(FAMILIES.indexOf(current) + 1) % FAMILIES.length] : command;
}

export interface WeaponSpec { damage: number; cooldown: number; speed: number; spread: number; count: number; pierce: number; color: number; radius: number; length: number }
const BASE: Record<WeaponFamily, WeaponSpec> = {
  pulse: { damage: 32, cooldown: 0.22, speed: 440, spread: 0, count: 1, pierce: 1, color: 0xf8ffee, radius: 3.2, length: 16 },
  spread: { damage: 18, cooldown: 0.34, speed: 380, spread: 0.078, count: 3, pierce: 1, color: 0xffbf48, radius: 3.4, length: 12 },
  lance: { damage: 85, cooldown: 0.65, speed: 650, spread: 0, count: 1, pierce: 3, color: 0x75eaff, radius: 2.7, length: 32 }
};
export function weaponSpec(family: WeaponFamily, tier: number): WeaponSpec {
  const level = Math.max(1, Math.min(3, tier));
  const spec = BASE[family];
  return { ...spec, damage: spec.damage * (1 + (level - 1) * 0.25), cooldown: spec.cooldown * (1 - (level - 1) * 0.08) };
}

// Work in relative coordinates so two fast-moving objects cannot tunnel through one another.
export function sweptHit(a0: THREE.Vector3, a1: THREE.Vector3, b0: THREE.Vector3, b1: THREE.Vector3, radius: number): number | null {
  const start = a0.clone().sub(b0);
  const end = a1.clone().sub(b1);
  if (start.lengthSq() <= radius * radius) return 0;
  const direction = end.sub(start);
  const length = direction.length();
  if (length < 0.00001) return null;
  const ray = new THREE.Ray(start, direction.multiplyScalar(1 / length));
  const point = ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), radius), new THREE.Vector3());
  if (!point) return null;
  const distance = point.distanceTo(start);
  return distance <= length ? distance / length : null;
}
