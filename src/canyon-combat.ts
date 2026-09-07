import type { SkiffRepair } from './skiff-repairs';

export const CANYON_MAX_SHIELD = 100;
export const CANYON_GUN_DAMAGE = 20;
// Match the normal yellow pickup: three salvage units at 25 points each.
export const HAUL_PICKUP_POINTS = 75;
export function dropsCanyonHaul(roll: number): boolean { return roll >= 0 && roll < 1 / 5; }
export function canyonHaulPoints(haul: number): number { return haul * HAUL_PICKUP_POINTS; }
export type CanyonImpact = 'gun' | 'wall' | 'collision';
export interface CanyonVitals { health: number; shield: number }

/** The shield at the start of this impact decides whether hull is exposed. */
export function damageCanyonSkiff(vitals: CanyonVitals, source: CanyonImpact): CanyonVitals {
  if (vitals.health <= 0) return { ...vitals };
  if (vitals.shield > 0) return { health: vitals.health, shield: source === 'gun' ? Math.max(0, vitals.shield - CANYON_GUN_DAMAGE) : 0 };
  return { health: Math.max(0, vitals.health - 1), shield: 0 };
}
export function repairedCanyonShield(shield: number, kind: SkiffRepair): number {
  return kind === 'repair' ? CANYON_MAX_SHIELD : Math.min(CANYON_MAX_SHIELD, shield + CANYON_GUN_DAMAGE);
}
export function canyonTargetPoints(kind: 'obstacle' | 'turret' | 'hostileBolt'): number {
  return kind === 'turret' ? 200 : kind === 'hostileBolt' ? 10 : 0;
}

export const CANYON_COMBAT_BRIEF = 'Crates pay no points when shot: 1 in 5 releases yellow haul. Collect it and reach EXIT for 75 points each. Guns pay +200; intercepted shots +10; missed shots -50 each. Shields start at 100. Gun hits cost 20 shield; impacts empty shields. With shields already empty, a hit costs one hull point.';
export const CANYON_REPAIR_BRIEF = 'Crates have a 1 in 15 blue shield drop (+1 hull and +20 shield); guns have a 1 in 30 full repair drop. Collect the pickups to repair.';
