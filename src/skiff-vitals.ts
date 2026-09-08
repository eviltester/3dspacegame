/** Shared course hull/shields. Damage is progress toward losing the next hull point. */
import { repairedSkiffHealth, SKIFF_MAX_HEALTH } from './skiff-repairs';
import type { SkiffRepair } from './skiff-repairs';

export const SKIFF_MAX_SHIELD = 100;
export const SKIFF_POINT_DAMAGE = 100;
export interface SkiffVitals { health: number; shield: number; damage: number }
export const freshSkiff = (smuggler = false): SkiffVitals => ({ health: smuggler ? 1 : SKIFF_MAX_HEALTH, shield: SKIFF_MAX_SHIELD, damage: 0 });

export function parseSkiff(value: unknown, smuggler = false): SkiffVitals {
  const source = value && typeof value === 'object' ? value as Partial<SkiffVitals> : {};
  const limit = (value: unknown, max: number, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : fallback;
  const maxHealth = smuggler ? 1 : SKIFF_MAX_HEALTH;
  const health = limit(source.health, maxHealth, maxHealth);
  return { health, shield: limit(source.shield, SKIFF_MAX_SHIELD, SKIFF_MAX_SHIELD), damage: health ? limit(source.damage, 99, 0) : 0 };
}

/** A shielded impact never spills into hull on the same hit. Scrapes are gentle; direct hits are not. */
export type SkiffImpact = 'wall' | 'gun' | 'collision' | 'largeRock' | 'mediumRock' | 'smallRock' | 'ship' | 'barrier';
export const SMUGGLER_SHIELD_DAMAGE: Record<SkiffImpact, number> = {
  largeRock: 50, mediumRock: 30, smallRock: 20, ship: 40, wall: 20, gun: 20, barrier: 50, collision: 40
};
export function damageSkiff(vitals: SkiffVitals, source: SkiffImpact, smuggler = false): SkiffVitals {
  if (vitals.health <= 0) return { ...vitals };
  const shieldCost = smuggler ? SMUGGLER_SHIELD_DAMAGE[source] : source === 'wall' ? 10 : 20;
  if (vitals.shield > 0) return { ...vitals, shield: Math.max(0, vitals.shield - shieldCost) };
  const damage = vitals.damage + (smuggler ? shieldCost : source === 'wall' ? 10 : SKIFF_POINT_DAMAGE);
  const health = Math.max(0, vitals.health - Math.floor(damage / SKIFF_POINT_DAMAGE));
  return { health, shield: 0, damage: health ? damage % SKIFF_POINT_DAMAGE : 0 };
}

export function repairSkiff(vitals: SkiffVitals, kind: SkiffRepair, smuggler = false): SkiffVitals {
  if (vitals.health <= 0) return { ...vitals };
  if (kind === 'repair') return freshSkiff(smuggler);
  // In a live Smuggler run there is one craft, not three extra hull lives.
  if (smuggler) return { health: 1, damage: Math.max(0, vitals.damage - 20), shield: Math.min(SKIFF_MAX_SHIELD, vitals.shield + 20) };
  // Repair exactly one hull point's worth, including partial damage, capped at full.
  const hull = Math.min(SKIFF_MAX_HEALTH * SKIFF_POINT_DAMAGE, vitals.health * SKIFF_POINT_DAMAGE - vitals.damage + SKIFF_POINT_DAMAGE);
  const health = repairedSkiffHealth(vitals.health, kind);
  return { health, damage: health * SKIFF_POINT_DAMAGE - hull, shield: Math.min(SKIFF_MAX_SHIELD, vitals.shield + 20) };
}
