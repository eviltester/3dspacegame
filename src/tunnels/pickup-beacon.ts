import { TUNNEL_DEPTH } from './shapes';
import type { TunnelRunState } from './types';

/** One shared ping-ping-ping, then a breath, irrespective of pickup count.
 * Advance with game time, not audio timers, so pausing stops the sequence too.
 * This is transient feedback: restarting its rhythm cannot change a saved run.
 */
export class PickupBeacon {
  private remaining = 0;
  private ping = 0;
  step(dt: number, state: TunnelRunState): boolean {
    const present = state.respawn <= 0 && ['assault', 'salvage'].includes(state.phase)
      && state.entities.some(e => e.kind === 'pickup' && e.hp > 0 && e.depth >= 0 && e.depth <= TUNNEL_DEPTH);
    if (!present) { this.remaining = 0; this.ping = 0; return false; }
    this.remaining -= dt;
    if (this.remaining > 1e-6) return false;
    this.ping = (this.ping + 1) % 3;
    this.remaining += this.ping === 0 ? 1.5 : 0.22;
    return true;
  }
}
