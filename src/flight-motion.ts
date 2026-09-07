/** Flight rules consume relative input, independent of browser cursor coordinates. */
import { MathUtils, Vector3 } from 'three';
import type { Quaternion } from 'three';
import { ARMADA_LANE_LIMIT } from './armada';
import { rotateLocally } from './input';
import type { FlightCommand } from './input';
import type { GameMode } from './modes';
import type { StageDefinition } from './encounters';

interface FlightArea { mode: GameMode; kind: StageDefinition['kind']; cleared: boolean }

/** Update the ship in place; return true when it reaches the arena boundary. */
export function moveShip(position: Vector3, orientation: Quaternion, look: FlightCommand, dt: number, area: FlightArea): boolean {
  if (area.kind === 'armada' && (!area.cleared || area.mode === 'invaders')) {
    position.x = MathUtils.clamp(position.x + look.x * 0.22 - look.roll * dt * 75, -ARMADA_LANE_LIMIT, ARMADA_LANE_LIMIT);
    position.y = 0; position.z = 0; orientation.identity();
    return false;
  }
  rotateLocally(orientation, look.x, look.y, look.roll, dt);
  position.addScaledVector(new Vector3(0, 0, -1).applyQuaternion(orientation), look.speed * dt);
  if (area.mode === 'endless' && !area.cleared && position.length() > 500) {
    position.setLength(500); return true;
  }
  return false;
}
