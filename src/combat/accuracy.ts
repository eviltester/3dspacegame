/** Count each fired bolt separately; a piercing bolt can earn only one accuracy hit. */
export interface WaveAccuracy { shots: number; hits: number; misses: number }
export function invaderMissCost(aliens: number): number { return aliens > 10 ? 100 : aliens > 5 ? 75 : 50; }
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
  begin(id: number, stats: WaveAccuracy, aliens: number): void {
    if (this.pending.has(id)) return;
    // Price the opportunity when fired. Kills, arrivals or wave completion cannot
    // change the penalty of a bolt already in flight.
    this.pending.set(id, { hit: false, missCost: invaderMissCost(aliens) });
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
