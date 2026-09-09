/** Hit-count balance for Defensive Position; other modes retain damage-based armour. */
import type { WeaponFamily } from '../arcade';
import type { GameMode } from '../modes';
import type { ActorKind } from './types';

export const DEFENSIVE_MISS_PENALTIES: Record<WeaponFamily, number> = { pulse: 100, spread: 100, lance: 400 };
export const DEFENSIVE_SHIELD_HITS = 3;
export const DEFENSIVE_MINE_HITS = 4;
export const DEFENSIVE_MINE_ARMING_TIME = 1.1;
export const DEFENSIVE_MINE_BLAST_RADIUS = 26;
export const DEFENSIVE_MINE_WARNING_DISTANCE = 150;

export function actorProjectileDamage(mode: GameMode, kind: ActorKind, family: WeaponFamily, damage: number): number {
  // Mine hull counts contacts, not weapon damage. Upgraded pellets still count
  // individually; a Lance detonates a mine with its first piercing contact.
  return mode === 'invaders' && kind === 'mine' ? family === 'lance' ? DEFENSIVE_MINE_HITS : 1 : damage;
}
