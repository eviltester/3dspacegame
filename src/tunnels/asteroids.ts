/** Seeded debris stays in lane space, including at the ends of an open tunnel. */
import { addEntity, random } from './encounters';
import { LANES, WARNING_SECONDS, wrapLane } from './shapes';
import type { TunnelContext, TunnelEntity } from './types';

export function splitAsteroid(ctx: TunnelContext, asteroid: TunnelEntity, closed: boolean): void {
  if (asteroid.size <= 0) return;
  const lane = Math.round(asteroid.lane);
  const destinations = !closed && lane === 0 ? [1, 2]
    : !closed && lane === LANES - 1 ? [LANES - 2, LANES - 3] : [lane - 1, lane + 1];
  for (const destination of destinations) {
    if (ctx.state.entities.filter(e => e.kind === 'asteroid' && e.hp > 0).length >= 64) break;
    addEntity(ctx, 'asteroid', asteroid.lane, Math.max(28, asteroid.depth), {
      size: asteroid.size - 1, hp: 24, grace: WARNING_SECONDS,
      nextLane: wrapLane(destination, closed), changing: 0,
      fragmentSpeed: random(ctx.state) < 0.25 ? 3 : 1
    });
  }
}
