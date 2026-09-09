/** Transient flight state. No DOM, renderer, audio, input device or global clock. */
import { clone, loseCombatLife, loseLife, resetChain } from '../arcade';
import type { RunState } from '../arcade';
import { DEFENSIVE_SHIELD_HITS } from '../combat/defensive-position';
import { DEFENSIVE_DEATH_SECONDS } from './defensive-sequence';

export const RESPAWN_PROTECTION_SECONDS = 3;
export const SMUGGLER_LIFE_LOST_SECONDS = 4;
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
  respawnDelay = 0;

  canStep(run: RunState | null): boolean {
    return !!run && !this.menu && !this.paused && (ACTIVE.includes(run.phase) || this.pendingRespawn !== null);
  }
  launch(run: RunState): void {
    this.paused = false; this.menu = '';
    if (run.phase === 'briefing') run.phase = 'playing';
  }
  pause(run: RunState | null): boolean {
    if (!run || (!ACTIVE.includes(run.phase) && !this.pendingRespawn) || this.paused) return false;
    this.paused = true; this.menu = 'pause'; return true;
  }
  resetStage(protection = 0): void {
    this.pendingRespawn = null; this.respawnDelay = 0; this.paused = false;
    this.protection = Math.max(0, Math.min(RESPAWN_PROTECTION_SECONDS, protection));
    this.grace = this.protection > 0 ? 0 : 3;
  }
  tick(run: RunState, dt: number): void {
    if (!this.canStep(run) || !Number.isFinite(dt) || dt <= 0) return;
    this.respawnDelay = Math.max(0, this.respawnDelay - dt);
    if (this.respawnDelay < 1e-6) this.respawnDelay = 0;
    if (this.pendingRespawn) return;
    this.grace = Math.max(0, this.grace - dt);
    this.protection = Math.max(0, this.protection - dt);
    if (this.protection < 1e-6) this.protection = 0;
  }
  showGameOver(): void { this.menu = 'gameover'; this.respawnDelay = 0; }
  damage(run: RunState, amount: number): DamageDecision {
    if (this.menu || this.paused || this.grace > 0 || this.protection > 0 || this.pendingRespawn || run.phase !== 'playing' || !Number.isFinite(amount) || amount <= 0) return { type: 'ignored' };
    const unshielded = run.pilot.shield <= 0;
    // Round upward so a full shield is exhausted on the third contact, without
    // a fractional sliver granting an extra hit. Repair pickups still add points.
    const shieldDamage = run.mode === 'invaders' ? Math.ceil(run.pilot.maxShield / DEFENSIVE_SHIELD_HITS) : amount;
    const shield = Math.min(run.pilot.shield, shieldDamage);
    run.pilot.shield -= shield;
    this.grace = 0.28; resetChain(run);
    // Defensive Position has no hull buffer. Even a partial shield absorbs this hit;
    // only a subsequent hit against an already empty shield spends a life.
    if (run.mode === 'invaders') {
      if (!unshielded) return { type: 'hit' };
      run.pilot.hull = 0;
      return this.fail(run, 'combat');
    }
    run.pilot.hull = Math.max(0, run.pilot.hull - (amount - shield));
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
    this.respawnDelay = run.mode === 'smuggler' ? SMUGGLER_LIFE_LOST_SECONDS : run.mode === 'invaders' ? DEFENSIVE_DEATH_SECONDS : 0;
    return { type: 'respawn', record: null };
  }
  consumeRespawn(run: RunState): RespawnKind | null {
    const kind = this.pendingRespawn;
    if (!kind || this.respawnDelay > 0) return null;
    this.pendingRespawn = null;
    run.phase = 'playing'; this.menu = ''; this.paused = false;
    this.grace = 0; this.protection = RESPAWN_PROTECTION_SECONDS;
    return kind;
  }
}
