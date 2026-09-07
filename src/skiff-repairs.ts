/** Course pickups repair the temporary three-point skiff, never the parked ship. */
export type SkiffRepair = 'shield' | 'repair';
export type SkiffDropSource = 'rock' | 'obstacle' | 'turret';
export const SKIFF_MAX_HEALTH = 3;

export function skiffRepairDrop(source: SkiffDropSource, roll: number): SkiffRepair | null {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) return null;
  // Thirty equally likely slots: two shields and one full repair for a rock.
  // The slots are disjoint, so destroying one object releases at most one pickup.
  const slot = Math.floor(roll * 30);
  if (source === 'turret') return slot === 0 ? 'repair' : null;
  if (slot < 2) return 'shield';
  return source === 'rock' && slot === 2 ? 'repair' : null;
}

export function repairedSkiffHealth(health: number, kind: SkiffRepair): number {
  if (health <= 0) return 0;
  return kind === 'repair' ? SKIFF_MAX_HEALTH : Math.min(SKIFF_MAX_HEALTH, health + 1);
}
