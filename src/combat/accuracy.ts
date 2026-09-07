/** Count each fired bolt separately; a piercing bolt can earn only one accuracy hit. */
export interface WaveAccuracy { shots: number; hits: number; misses: number }
export const INVADER_MISS_COST = 5;
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
  private pending = new Map<number, boolean>();
  begin(id: number, stats: WaveAccuracy): void {
    if (this.pending.has(id)) return;
    this.pending.set(id, false);
    stats.shots++;
  }
  hit(id: number, stats: WaveAccuracy): void {
    if (this.pending.get(id) !== false) return;
    this.pending.set(id, true);
    stats.hits++;
  }
  end(id: number, stats: WaveAccuracy): number {
    const hit = this.pending.get(id);
    if (hit === undefined) return 0;
    this.pending.delete(id);
    if (hit) return 0;
    stats.misses++;
    return INVADER_MISS_COST;
  }
  finish(stats: WaveAccuracy): number {
    // At wave clear there are no targets left. Settle airborne misses before
    // banking the result; a reload or repeated completion must not charge twice.
    let cost = 0;
    for (const hit of this.pending.values()) if (!hit) { stats.misses++; cost += INVADER_MISS_COST; }
    this.clear();
    return cost;
  }
  clear(): void { this.pending.clear(); }
}
