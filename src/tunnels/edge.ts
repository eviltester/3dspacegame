/** Only hostile armed ships may wait at the edge; other traffic flies past it. */
import { isShip } from './encounters';
import { lanePoint } from './shapes';
import type { TunnelShapeDefinition } from './shapes';
import type { TunnelEntity } from './types';

export const EDGE_EXIT_DEPTH = -100;
export const canPursueAtEdge = (entity: TunnelEntity, wanted: boolean): boolean =>
  isShip(entity) && (entity.faction === 'pirate' || entity.faction === 'police' && wanted);

/** Measured from warning start, leaving recovery after the full 0.9-second tell. */
export const edgeFireCooldown = (hostiles: number): number => hostiles <= 1 ? 1.15 : hostiles <= 3 ? 1.35 : 1.7;

export function tunnelEntityPoint(shape: TunnelShapeDefinition, entity: TunnelEntity): [number, number, number] {
  const point = lanePoint(shape, entity.lane, entity.depth);
  if (entity.depth >= 0) return point;
  // Continue out beyond the lane instead of appearing to cling to the rim.
  // This is presentation only: passing cargo has already missed its collection window.
  const radius = Math.hypot(point[0], point[1]);
  const distance = -entity.depth * 1.6;
  point[0] += (radius ? point[0] / radius : 0) * distance;
  point[1] += (radius ? point[1] / radius : 1) * distance;
  return point;
}
