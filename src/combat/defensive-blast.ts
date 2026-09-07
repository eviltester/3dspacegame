import type { Vector3 } from 'three';
import type { RunState } from '../arcade';
import type { Actor } from './types';

/** Spend one full charge and resolve damage before cosmetic effects are started. */
export function defensiveBlast(run: Pick<RunState, 'phase' | 'charge'>, actors: readonly Actor[], position: Vector3,
  clearFire: () => void, damage: (actor: Actor, amount: number) => void): boolean {
  if (run.phase !== 'playing' || run.charge < 100) return false;
  run.charge = 0;
  clearFire();
  // Work on a snapshot because damage may remove actors from the live world.
  for (const actor of [...actors]) {
    if (!actor.dead && actor.faction === 'pirate' && actor.object.position.distanceTo(position) <= 240) damage(actor, 85);
  }
  return true;
}
