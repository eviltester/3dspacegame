import type { Vector3 } from 'three';
import type { Actor } from './types';

/** Bend toward the closest hostile to the crosshair, never toward an innocent. */
export function assistedAim(origin: Vector3, forward: Vector3, actors: readonly Actor[], enabled: boolean): Vector3 {
  const direction = forward.clone();
  if (!enabled) return direction;
  let bestAngle = 0.035;
  let target: Vector3 | undefined;
  for (const actor of actors) {
    if (actor.dead || actor.faction !== 'pirate' || actor.kind === 'cargo') continue;
    const delta = actor.object.position.clone().sub(origin);
    const angle = delta.angleTo(direction);
    if (delta.length() < 500 && angle < bestAngle) { bestAngle = angle; target = delta; }
  }
  // A partial correction rewards accurate aiming without locking onto a target.
  if (target) direction.lerp(target.normalize(), 0.75).normalize();
  return direction;
}
