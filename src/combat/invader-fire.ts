/** Aimed fire plus staggered area-denial shots, with faster surviving aliens. */
import type { WeaponFamily } from '../arcade';
import type { Actor } from './types';
import { ARMADA_LANE_LIMIT } from '../armada';

export const INVADER_WEAPON_COOLDOWN: Record<WeaponFamily, number> = { pulse: 0.6, spread: 1.4, lance: 1.4 };
export const DEFENSIVE_ATTACKER_CAP = 8;
export function invaderFireTiming(wave: number, aliens = 18) {
  const pressure = Math.log2(Math.max(1, wave));
  const survivors = 0.35 + 0.65 * Math.min(1, Math.max(0, aliens - 1) / 17);
  return { cooldown: Math.max(0.7, (1.7 + 3.9 / (1 + pressure * 0.3)) * survivors),
    gap: Math.max(0.14, (0.3 + 0.75 / (1 + pressure * 0.35)) * survivors) };
}

/** Alternate among reachable spaces, never the player's current collision corridor. */
export function invaderCoverTarget(playerX: number, shotIndex: number): number {
  const lanes = [-ARMADA_LANE_LIMIT + 8, -34, 0, 34, ARMADA_LANE_LIMIT - 8].filter(x => Math.abs(x - playerX) >= 28);
  return lanes[Math.abs(shotIndex) % lanes.length];
}

export class InvaderFireDirector {
  private delay = 0;
  private lastId = -1;
  private coverDelay = 0.3;
  private lastCoverId = -1;
  reset(): void { this.delay = 0; this.lastId = -1; this.coverDelay = 0.3; this.lastCoverId = -1; }
  next(dt: number, eligible: readonly Actor[], wave = 1, aliens = 18): Actor | undefined {
    this.delay = Math.max(0, Math.min(this.delay, invaderFireTiming(wave, aliens).gap) - dt);
    if (this.delay > 0) return undefined;
    const ordered = [...eligible].sort((a, b) => a.id - b.id);
    // Rotate turns so the first few array entries cannot monopolize the fleet.
    return ordered.find(actor => actor.id > this.lastId) ?? ordered[0];
  }
  started(actor: Actor, wave: number, aliens = 18): void {
    this.lastId = actor.id;
    this.delay = invaderFireTiming(wave, aliens).gap;
  }
  cover(dt: number, eligible: readonly Actor[], wave: number, aliens: number): readonly Actor[] {
    this.coverDelay = Math.max(0, Math.min(this.coverDelay, invaderFireTiming(wave, aliens).gap * 1.2) - dt);
    if (this.coverDelay > 0 || !eligible.length) return [];
    const ordered = [...eligible].sort((a, b) => a.id - b.id);
    const after = ordered.filter(actor => actor.id > this.lastCoverId);
    const selected = [...after, ...ordered.filter(actor => actor.id <= this.lastCoverId)].slice(0, 2);
    this.lastCoverId = selected[selected.length - 1].id;
    this.coverDelay = invaderFireTiming(wave, aliens).gap * 1.2;
    return selected;
  }
}
