/** Invaders has deliberate player fire and one staggered alien attack stream. */
import type { WeaponFamily } from '../arcade';
import type { Actor } from './types';

export const INVADER_WEAPON_COOLDOWN: Record<WeaponFamily, number> = { pulse: 0.6, spread: 1, lance: 1.4 };
export function invaderFireTiming(wave: number) {
  const pressure = Math.log2(Math.max(1, wave));
  return { cooldown: 1.7 + 3.9 / (1 + pressure * 0.3), gap: 0.3 + 0.75 / (1 + pressure * 0.35) };
}

export class InvaderFireDirector {
  private delay = 0;
  private lastId = -1;
  reset(): void { this.delay = 0; this.lastId = -1; }
  next(dt: number, eligible: readonly Actor[]): Actor | undefined {
    this.delay = Math.max(0, this.delay - dt);
    if (this.delay > 0) return undefined;
    const ordered = [...eligible].sort((a, b) => a.id - b.id);
    // Rotate turns so the first few array entries cannot monopolize the fleet.
    return ordered.find(actor => actor.id > this.lastId) ?? ordered[0];
  }
  started(actor: Actor, wave: number): void {
    this.lastId = actor.id;
    this.delay = invaderFireTiming(wave).gap;
  }
}
