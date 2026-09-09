/** Short, simulation-timed transitions. No combat, input or rewards advance here. */
export const DEFENSIVE_DEATH_SECONDS = 4;
export const DEFENSIVE_ARRIVAL_SECONDS = 1.2;
export const DEFENSIVE_DEPARTURE_SECONDS = 2.4;
export type DefensiveSequencePhase = 'idle' | 'departing' | 'arriving';

export function defensiveRespawnProgress(remaining: number): number {
  return Math.max(0, Math.min(1, 1 - remaining / DEFENSIVE_ARRIVAL_SECONDS));
}

export class DefensiveSequence {
  phase: DefensiveSequencePhase = 'idle';
  private age = 0;
  get active(): boolean { return this.phase !== 'idle'; }
  get progress(): number {
    return Math.min(1, this.age / (this.phase === 'departing' ? DEFENSIVE_DEPARTURE_SECONDS : DEFENSIVE_ARRIVAL_SECONDS));
  }
  reset(): void { this.phase = 'idle'; this.age = 0; }
  start(phase: Exclude<DefensiveSequencePhase, 'idle'>): boolean {
    if (this.active) return false;
    this.phase = phase; this.age = 0; return true;
  }
  tick(dt: number): 'advance' | 'ready' | null {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return null;
    this.age += dt;
    if (this.progress < 1 - 1e-6) return null;
    const event = this.phase === 'departing' ? 'advance' : 'ready';
    this.phase = 'idle'; return event;
  }
}
