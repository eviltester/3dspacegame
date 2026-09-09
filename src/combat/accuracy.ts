/** Count each fired bolt separately; a piercing bolt can earn only one accuracy hit. */
import type { WeaponFamily } from '../arcade';
import { DEFENSIVE_MISS_PENALTIES } from './defensive-position';
export interface WaveAccuracy { shots: number; hits: number; misses: number }
export const emptyAccuracy = (): WaveAccuracy => ({ shots: 0, hits: 0, misses: 0 });
export function accuracyPercent(stats: WaveAccuracy): number {
  return stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0;
}
export function parseAccuracy(value: unknown): WaveAccuracy {
  if (!value || typeof value !== 'object') return emptyAccuracy();
  const stats = value as Partial<WaveAccuracy>;
  const valid = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (!valid(stats.shots) || !valid(stats.hits) || !valid(stats.misses) || stats.hits + stats.misses > stats.shots) return emptyAccuracy();
  return { shots: stats.shots, hits: stats.hits, misses: stats.misses };
}

export class ShotAccuracy {
  private pending = new Map<number, { hit: boolean; missCost: number }>();
  begin(id: number, stats: WaveAccuracy, family: WeaponFamily): void {
    if (this.pending.has(id)) return;
    // Capture the firing weapon's penalty. Switching while a bolt is in flight
    // must not change its cost, including at wave-clear settlement.
    this.pending.set(id, { hit: false, missCost: DEFENSIVE_MISS_PENALTIES[family] });
    stats.shots++;
  }
  hit(id: number, stats: WaveAccuracy): void {
    const shot = this.pending.get(id);
    if (!shot || shot.hit) return;
    shot.hit = true;
    stats.hits++;
  }
  end(id: number, stats: WaveAccuracy): number {
    const shot = this.pending.get(id);
    if (!shot) return 0;
    this.pending.delete(id);
    if (shot.hit) return 0;
    stats.misses++;
    return shot.missCost;
  }
  finish(stats: WaveAccuracy): number {
    // At wave clear there are no targets left. Settle airborne misses before
    // banking the result; a reload or repeated completion must not charge twice.
    let cost = 0;
    for (const shot of this.pending.values()) if (!shot.hit) { stats.misses++; cost += shot.missCost; }
    this.clear();
    return cost;
  }
  clear(): void { this.pending.clear(); }
}
