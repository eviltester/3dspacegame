export { damageSkiff as damageCanyonSkiff, SKIFF_MAX_SHIELD as CANYON_MAX_SHIELD } from './skiff-vitals';

export const CANYON_GUN_DAMAGE = 20;
// Match the normal yellow pickup: three salvage units at 25 points each.
export const HAUL_PICKUP_POINTS = 75;
export function dropsCanyonHaul(roll: number): boolean { return roll >= 0 && roll < 1 / 5; }
export function canyonHaulPoints(haul: number): number { return haul * HAUL_PICKUP_POINTS; }
export type CanyonImpact = 'gun' | 'wall' | 'collision' | 'barrier';
export function canyonTargetPoints(kind: 'obstacle' | 'turret' | 'hostileBolt'): number {
  return kind === 'turret' ? 200 : kind === 'hostileBolt' ? 10 : 0;
}

export const CANYON_COMBAT_BRIEF = 'Crates pay no points when shot: 1 in 5 releases yellow haul. Collect it and reach EXIT for 75 points each. Guns pay +200; intercepted shots +10; missed shots -50 each. Walls/floor cost 10 shield or 10 damage when unshielded. At 100 damage, lose one skiff point. Gun and solid-object hits cost 20 shield or one unshielded skiff point.';
export const CANYON_REPAIR_BRIEF = 'Crates have a 1 in 15 blue shield drop (+1 hull and +20 shield); guns have a 1 in 30 full repair drop. Collect the pickups to repair.';
