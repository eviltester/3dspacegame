/** Bounded police response: normal warrants call a pair; shooting police calls ten. */
import { attackFaction, tickWanted, policeDispatchDue, markPoliceArrived, resolveContrabandScan } from '../logic';
import { addEntity } from './encounters';
import { TUNNEL_DEPTH, WARNING_SECONDS } from './shapes';
import type { TunnelContext, TunnelEntity, TunnelPoliceResponse } from './types';

export const POLICE_REINFORCEMENT_LIMIT = 10;
const ARRIVAL_LANES = [2, 9, 4, 7, 0, 11, 5, 8, 1, 10];

function response(ctx: TunnelContext): TunnelPoliceResponse {
  // Saves without a response ledger may already have received their original pair.
  return ctx.state.policeResponse ??= { limit: 2, spawned: ctx.run.pilot.wanted.policeArrived ? 2 : 0, delay: 0 };
}

export function provoke(ctx: TunnelContext, target: TunnelEntity): void {
  if (!['trader', 'police'].includes(target.faction)) return;
  if (target.faction === 'police') response(ctx).limit = POLICE_REINFORCEMENT_LIMIT;
  target.targetId = -1;
  // Further hits can escalate the response, but cannot postpone dispatch or refill it.
  if (ctx.run.pilot.wanted.active) {
    if (target.faction === 'police') ctx.run.pilot.wanted.reason = 'Attack on police';
    return;
  }
  ctx.run.pilot = attackFaction(ctx.run.pilot, `tunnel-${ctx.run.stage}`, 'trader', false);
  if (target.faction === 'police') ctx.run.pilot.wanted.reason = 'Attack on police';
  ctx.events.push({ type: 'notice', text: `WANTED: ${ctx.run.pilot.wanted.reason}` }, { type: 'cue', cue: 'policeDispatch' });
}

function reinforce(ctx: TunnelContext, dt: number): void {
  const { run, state: s } = ctx;
  if (!run.pilot.wanted.active) return;
  const pending = response(ctx);
  pending.delay = Math.max(0, pending.delay - dt);
  if (pending.spawned >= pending.limit || pending.delay > 0
    || !run.pilot.wanted.policeArrived && !policeDispatchDue(run.pilot.wanted, run.pilot.wanted.policeTimer)) return;
  const occupied = s.entities.filter(e => e.hp > 0 && (e.faction === 'pirate' || e.faction === 'police')).length;
  const count = Math.min(2, pending.limit - pending.spawned, 18 - occupied);
  if (count <= 0) return;
  for (let i = 0; i < count; i++) {
    addEntity(ctx, 'ship', ARRIVAL_LANES[pending.spawned++], TUNNEL_DEPTH,
      { faction: 'police', targetId: -1, policeEntry: true, age: WARNING_SECONDS, grace: 0, cooldown: 0 });
  }
  pending.delay = 2;
  run.pilot = markPoliceArrived(run.pilot);
  ctx.events.push({ type: 'notice', text: `POLICE REINFORCEMENTS ARRIVED ${pending.spawned}/${pending.limit}` },
    { type: 'cue', cue: 'policeArrival' });
}

export function tunnelLaw(ctx: TunnelContext, dt: number): void {
  const { run, state: s } = ctx;
  if (s.phase !== 'assault' || s.respawn > 0) return;
  run.pilot = tickWanted(run.pilot, dt);
  reinforce(ctx, dt);
  if (!s.scanned && s.elapsed > 15 && s.entities.some(e => e.hp > 0 && e.depth >= 0 && e.faction === 'police')) {
    if (s.scan < 0) { s.scan = 3; ctx.events.push({ type: 'notice', text: 'POLICE CARGO SCAN IN 3 SECONDS' }, { type: 'cue', cue: 'policeScan' }); }
    s.scan -= dt;
    if (s.scan <= 0) {
      s.scanned = true;
      const result = resolveContrabandScan({ ...run.pilot, credits: run.pilot.score }, `tunnel-${run.stage}`);
      const credits = run.pilot.credits;
      run.pilot = { ...result.progress, score: result.progress.credits, credits };
      ctx.events.push({ type: 'notice', text: result.message.toUpperCase() });
    }
  }
}
