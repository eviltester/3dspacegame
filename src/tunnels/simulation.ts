/** The complete tunnel clock. No canvas, DOM, audio device or localStorage access. */
import { tickChain } from '../arcade';
import type { RunState } from '../arcade';
import { freshSkiff } from '../skiff-vitals';
import { TunnelCombat } from './combat';
import { spawnAssault, tunnelEncounter } from './encounters';
import { createTunnelState, settleTunnel, tunnelLaw } from './rules';
import { tunnelShape } from './shapes';
import { movePlayer, moveTraffic } from './traffic';
import type { TunnelContext, TunnelEvent } from './types';
import { TUNNEL_COLLAPSE_SECONDS, TUNNEL_DETONATE_AT } from './ending-timing';
import { PickupBeacon } from './pickup-beacon';

export class TunnelSimulation {
  private readonly pickupBeacon = new PickupBeacon();
  readonly ctx: TunnelContext;
  readonly combat: TunnelCombat;
  readonly shape;
  constructor(run: RunState) {
    // Existing checkpoints retain shields and lives, but no accumulated damage.
    run.skiff.damage = 0;
    run.tunnel ??= createTunnelState(run);
    run.tunnel.startVitals.damage = 0;
    this.ctx = { run, state: run.tunnel, events: [] };
    this.shape = tunnelShape(run.stage); this.combat = new TunnelCombat(this.ctx, this.shape.closed);
  }
  get state() { return this.ctx.state; }
  get remainingEnemies(): number {
    const d = tunnelEncounter(this.state.level), s = this.state;
    return s.entities.filter(e => e.required && e.hp > 0).length + Math.max(0, (d.groups - s.group) * d.count - s.spawnIndex);
  }
  drain(): TunnelEvent[] { return this.ctx.events.splice(0); }
  step(dt: number, horizontal = 0, firing = false, laneStep = 0): void {
    const { state: s, run } = this.ctx;
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1 || !['playing','cleared'].includes(run.phase) || s.phase === 'over') return;
    if (s.respawn > 0) {
      s.respawn = Math.max(0, s.respawn - dt);
      if (s.respawn < 1e-6) { s.respawn = 0; s.protection = 3; run.skiff = freshSkiff(true); }
      return;
    }
    s.elapsed += dt; run.elapsed = s.elapsed;
    s.protection = Math.max(0, s.protection - dt); s.hitGrace = Math.max(0, s.hitGrace - dt); s.fireDelay = Math.max(0, s.fireDelay - dt);
    if (s.phase === 'collapse') {
      const previous = s.remaining; s.remaining = Math.max(0, s.remaining - dt);
      const detonation = TUNNEL_COLLAPSE_SECONDS - TUNNEL_DETONATE_AT;
      if (previous > detonation && s.remaining <= detonation + 1e-6) { s.remaining = Math.min(s.remaining, detonation); this.ctx.events.push({ type: 'detonate' }); }
      if (s.remaining < 1e-6) settleTunnel(this.ctx);
      return;
    }
    if (s.phase === 'result') {
      s.remaining = Math.max(0, s.remaining - dt);
      if (s.remaining < 1e-6) { s.remaining = 0; this.ctx.events.push({ type: 'next' }); }
      return;
    }
    movePlayer(this.ctx, horizontal, dt, this.shape.closed, laneStep);
    const charge = run.charge;
    if (s.phase === 'assault') {
      // A due response gets free slots before new pirates can fill the same slots.
      tunnelLaw(this.ctx, dt); spawnAssault(this.ctx, dt, this.shape.closed); tickChain(run, dt);
    }
    moveTraffic(this.ctx, dt, this.shape.closed, this.combat);
    if (s.respawn > 0 || this.state.phase === 'over') return;
    if (s.phase === 'assault') {
      if (firing) this.combat.fire();
      this.combat.step(dt);
      if (charge < 100 && run.charge >= 100) this.ctx.events.push({ type: 'ready' });
      if (s.group >= tunnelEncounter(s.level).groups && !s.entities.some(e => e.required && e.hp > 0) && !s.respawn && run.lives > 0) {
        s.phase = 'salvage'; s.remaining = 3;
        for (const shot of s.shots) if (shot.faction === 'player' && !shot.hit) run.accuracy.misses++;
        s.shots = []; s.entities = s.entities.filter(e => e.kind === 'pickup' && e.hp > 0);
        this.ctx.events.push({ type: 'clear' });
      }
    } else {
      s.remaining = Math.max(0, s.remaining - dt);
      if (s.remaining < 1e-6) {
        s.phase = 'collapse'; s.remaining = TUNNEL_COLLAPSE_SECONDS; s.entities = [];
        this.ctx.events.push({ type: 'collapse' });
      }
    }
    s.entities = s.entities.filter(e => e.hp > 0);
    if (this.pickupBeacon.step(dt, s)) this.ctx.events.push({ type: 'cue', cue: 'pickupNearby' });
  }
}
