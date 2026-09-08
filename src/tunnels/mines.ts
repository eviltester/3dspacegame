import { laneSweep } from './collision';
import { tunnelDamage } from './rules';
import type { TunnelCombat } from './combat';
import type { TunnelContext, TunnelEntity } from './types';

/** The proximity fuse and damage share one range: no harmless premature bursts.
 * Sweep lane changes too, so a fast sidestep cannot tunnel through an armed mine.
 */
export function detonateMine(ctx: TunnelContext, mine: TunnelEntity, closed: boolean, combat: TunnelCombat): boolean {
  if (mine.hp <= 0 || mine.grace > 0) return false;
  const s = ctx.state;
  if (laneSweep(s.previousLane, s.lane, 0, 0, mine.previousLane, mine.lane,
    mine.previousDepth, mine.depth, closed, 0.8, 32) === null) return false;
  combat.destroy(mine, false);
  tunnelDamage(ctx, 'collision');
  return true;
}
