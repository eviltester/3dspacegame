/** Weapon balance and collision math shared by the main ship and temporary craft. */
import * as THREE from 'three';
import type { WeaponFamily } from './arcade';
import { FAMILIES } from './arcade';
import type { GameMode } from './modes';
import { INVADER_WEAPON_COOLDOWN } from './combat/invader-fire';

export type WeaponCommand = WeaponFamily | 'next';
export const WEAPON_HELP: Record<WeaponFamily, string> = {
  pulse: 'Rapid, accurate single bolts. Best for picking off one ship or intercepting incoming fire.',
  spread: 'Three bolts in a wide fan. Best against nearby groups; less damage per bolt.',
  lance: 'Slower, powerful shots that pierce up to three targets. Best against lined-up ships and heavy armour.'
};
export function selectWeapon(current: WeaponFamily, command: WeaponCommand): WeaponFamily {
  return command === 'next' ? FAMILIES[(FAMILIES.indexOf(current) + 1) % FAMILIES.length] : command;
}

export interface WeaponSpec { damage: number; cooldown: number; speed: number; spread: number; count: number; pierce: number; color: number; radius: number; length: number }
// cooldown is seconds between volleys; speed/radius/length use world units;
// spread is the angle in radians between pellets. Ammo is unlimited in every family.
const BASE: Record<WeaponFamily, WeaponSpec> = {
  pulse: { damage: 32, cooldown: 0.22, speed: 440, spread: 0, count: 1, pierce: 1, color: 0xf8ffee, radius: 3.2, length: 16 },
  spread: { damage: 18, cooldown: 0.34, speed: 380, spread: 0.078, count: 3, pierce: 1, color: 0xffbf48, radius: 3.4, length: 12 },
  lance: { damage: 85, cooldown: 0.65, speed: 650, spread: 0, count: 1, pierce: 3, color: 0x75eaff, radius: 2.7, length: 32 }
};
// Covering adjacent lanes or piercing a column needs more recovery in tunnels.
const TUNNEL_WEAPON_COOLDOWN: Record<WeaponFamily, number> = { pulse: 0.22, spread: 0.65, lance: 1 };
export function weaponSpec(family: WeaponFamily, tier: number, mode?: GameMode): WeaponSpec {
  // Copy rather than mutate BASE so upgrading one family cannot affect a later run.
  const level = Math.max(1, Math.min(3, tier));
  const spec = BASE[family];
  const cooldown = mode === 'invaders' ? INVADER_WEAPON_COOLDOWN[family]
    : mode === 'tunnels' ? TUNNEL_WEAPON_COOLDOWN[family] : spec.cooldown;
  return { ...spec, damage: spec.damage * (1 + (level - 1) * 0.25), cooldown: cooldown * (1 - (level - 1) * 0.08) };
}

// Work in relative coordinates so two fast-moving objects cannot tunnel through one another.
// Return the first contact as a fraction of this tick (0..1), or null for no hit.
// Callers combine the two collision radii before calling this helper.
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
