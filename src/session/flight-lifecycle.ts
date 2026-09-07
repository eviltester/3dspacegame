/** Transient flight state. No DOM, renderer, audio, input device or global clock. */
import { clone, loseCombatLife, loseLife, resetChain } from '../arcade';
import type { RunState } from '../arcade';

export const RESPAWN_PROTECTION_SECONDS = 3;
export type RespawnKind = 'combat' | 'checkpoint';
export type LifeDecision = { type: 'ignored' } | { type: 'respawn' | 'gameover'; record: RunState | null };
export type DamageDecision = LifeDecision | { type: 'hit' };
const ACTIVE = ['playing', 'cleared', 'recovery', 'bonus'];

export class FlightLifecycle {
  menu = 'title';
  paused = false;
  pendingRespawn: RespawnKind | null = null;
  grace = 3;
  protection = 0;
  deathCountdown = 10;

  canStep(run: RunState | null): boolean {
    return !!run && !this.menu && !this.paused && (ACTIVE.includes(run.phase) || this.pendingRespawn !== null);
  }
  launch(run: RunState): void {
    this.paused = false; this.menu = '';
    if (run.phase === 'briefing') run.phase = 'playing';
  }
  pause(run: RunState | null): boolean {
    if (!run || !ACTIVE.includes(run.phase) || this.paused) return false;
    this.paused = true; this.menu = 'pause'; return true;
  }
  resetStage(protection = 0): void {
    this.pendingRespawn = null; this.paused = false;
    this.protection = Math.max(0, Math.min(RESPAWN_PROTECTION_SECONDS, protection));
    this.grace = this.protection > 0 ? 0 : 3;
  }
  tick(run: RunState, dt: number): void {
    if (!this.canStep(run) || !Number.isFinite(dt) || dt <= 0) return;
    this.grace = Math.max(0, this.grace - dt);
    this.protection = Math.max(0, this.protection - dt);
    if (this.protection < 1e-6) this.protection = 0;
  }
  showGameOver(): void { this.menu = 'gameover'; this.deathCountdown = 10; }
  tickDisplay(dt: number, hidden: boolean): boolean {
    if (this.menu !== 'gameover' || hidden || !Number.isFinite(dt) || dt <= 0) return false;
    this.deathCountdown = Math.max(0, this.deathCountdown - dt);
    if (this.deathCountdown > 1e-6) return false;
    this.deathCountdown = 0; this.menu = 'title'; this.paused = false; return true;
  }
  damage(run: RunState, amount: number): DamageDecision {
    if (this.menu || this.paused || this.grace > 0 || this.protection > 0 || this.pendingRespawn || run.phase !== 'playing' || !Number.isFinite(amount) || amount <= 0) return { type: 'ignored' };
    const shield = Math.min(run.pilot.shield, amount);
    // Invaders doubles only the damage that gets through: a normal bolt still
    // costs 10 shield, but costs 20 hull when completely unshielded.
    const hullDamage = (amount - shield) * (run.mode === 'invaders' ? 2 : 1);
    run.pilot.shield -= shield; run.pilot.hull = Math.max(0, run.pilot.hull - hullDamage);
    this.grace = 0.28; resetChain(run);
    return run.pilot.hull <= 0 ? this.fail(run, 'combat') : { type: 'hit' };
  }
  fail(run: RunState, kind: RespawnKind): LifeDecision {
    if (this.menu || this.paused || run.phase !== 'playing' || this.pendingRespawn) return { type: 'ignored' };
    // Record the destroyed ship before respawn restores its equipment.
    const record = clone(run);
    if (kind === 'checkpoint') loseLife(run); else loseCombatLife(run);
    return { ...this.afterLifeSpent(run, kind), record };
  }
  afterLifeSpent(run: RunState, kind: RespawnKind): Exclude<LifeDecision, { type: 'ignored' }> {
    if (!run.lives) {
      this.protection = 0; this.pendingRespawn = null; this.showGameOver();
      return { type: 'gameover', record: null };
    }
    this.pendingRespawn = kind;
    return { type: 'respawn', record: null };
  }
  consumeRespawn(run: RunState): RespawnKind | null {
    const kind = this.pendingRespawn;
    if (!kind) return null;
    this.pendingRespawn = null;
    run.phase = 'playing'; this.menu = ''; this.paused = false;
    this.grace = 0; this.protection = RESPAWN_PROTECTION_SECONDS;
    return kind;
  }
}
