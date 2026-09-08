/** Rewards and law operate on run data; rendering never decides what gets paid. */
import { canNpcCollect, resetChain, resources } from '../arcade';
import type { RunState } from '../arcade';
import { awardScoreLives } from '../life-rewards';
import { createInitialProgress, instantTrade, CARGO_VALUES } from '../logic';
import { freshSkiff, SMUGGLER_SHIELD_DAMAGE } from '../skiff-vitals';
import type { SkiffImpact } from '../skiff-vitals';
import type { TunnelContext, TunnelEntity, TunnelPickup, TunnelRunState } from './types';
import { addEntity } from './encounters';
export { provoke, tunnelLaw } from './police';

export function createTunnelState(run: RunState): TunnelRunState {
  run.skiff.damage = 0;
  return { version: 1, level: run.stage, random: (run.seed + run.stage * 7919) >>> 0, lootRandom: (run.seed ^ run.stage ^ 0x451a) >>> 0,
    nextId: 1, lane: 0, previousLane: 0, desiredLane: 0, elapsed: 0, group: 0, spawnIndex: 0, spawnDelay: 0.5, hazardDelay: 4,
    entities: [], shots: [], chargedVolleys: [], fireDelay: 0, attackDelay: 1, lastAttacker: 0, protection: 3, respawn: 0,
    hitGrace: 0, phase: 'assault', remaining: 0, paid: false, result: null, scan: -1, scanned: false, patrol: false,
    kills: 0, earlyCore: false, startVitals: { ...run.skiff } };
}
export const tunnelAccuracy = (run: RunState): number => run.accuracy.shots ? Math.floor(run.accuracy.hits / run.accuracy.shots * 100) : 0;
export function accuracyAward(hits: number, shots: number): number {
  // Compare exact ratios: rounding 99.5% on the HUD must not award perfect aim.
  return !shots ? 0 : hits === shots ? 2000 : hits / shots >= 0.9 ? 1000 : hits / shots >= 0.8 ? 500 : 0;
}
export function scoreLives(ctx: TunnelContext): void {
  if (awardScoreLives(ctx.run)) ctx.events.push({ type: 'cue', cue: 'extraLife' });
}
export function collectTunnelPickup(ctx: TunnelContext, item: TunnelEntity, collector?: TunnelEntity): boolean {
  if (item.hp <= 0 || !item.drop) return false;
  const type = item.drop;
  if (collector) {
    if (type === 'fullRepair' ? collector.faction === 'police' || item.essential : !canNpcCollect(collector.faction, type, item.essential)) return false;
    item.hp = 0; collector.hp = Math.min(96, collector.hp + 20); return true;
  }
  const { run } = ctx;
  if (type === 'shieldCell') { run.skiff.shield = Math.min(100, run.skiff.shield + 20); run.skiff.damage = 0; }
  else if (type === 'fullRepair') run.skiff = freshSkiff(true);
  else if (type === 'weaponCore') {
    const max = run.stage >= 8 ? 3 : 2;
    if (run.tiers[run.family] < max) run.tiers[run.family]++;
    else run.pilot.score += 200;
    run.pilot.weaponLevel = run.tiers[run.family];
  } else if (type === 'credits') run.pilot.credits += CARGO_VALUES.credits;
  else if (type === 'rescuePod') run.pilot.inventory.rescuePods++;
  else run.pilot.inventory[type]++;
  item.hp = 0;
  ctx.events.push({ type: 'cue', cue: 'pickup' }, { type: 'notice', text: `${type.replace(/([A-Z])/g, ' $1').toUpperCase()} COLLECTED` });
  scoreLives(ctx); return true;
}
export function tunnelDamage(ctx: TunnelContext, source: SkiffImpact): boolean {
  const { state: s, run } = ctx;
  if (s.phase !== 'assault' || s.respawn > 0 || s.protection > 0 || s.hitGrace > 0 || run.skiff.health <= 0) return false;
  // Shield absorbs the whole impact, including the hit that empties it. The
  // next unshielded impact destroys this life; damage stays zero in shared saves.
  const shielded = run.skiff.shield > 0;
  run.skiff = { health: shielded ? 1 : 0, shield: Math.max(0, run.skiff.shield - SMUGGLER_SHIELD_DAMAGE[source]), damage: 0 };
  s.hitGrace = 0.3; resetChain(run);
  ctx.events.push({ type: 'damage' });
  if (!run.skiff.health) {
    run.lives = Math.max(0, run.lives - 1);
    s.shots = s.shots.filter(shot => shot.faction === 'player');
    if (run.lives) { s.respawn = 4; ctx.events.push({ type: 'life' }); }
    else { s.phase = 'over'; run.phase = 'gameover'; ctx.events.push({ type: 'gameover' }); }
  }
  return true;
}
export function settleTunnel(ctx: TunnelContext): boolean {
  const { state: s, run } = ctx;
  if (s.paid || !['salvage','collapse'].includes(s.phase)) return false;
  const legal = instantTrade(run.pilot, 'lawful');
  const market = s.level % 5 === 0 ? instantTrade(legal.progress, 'blackMarket') : null;
  const cargo = run.pilot.credits + legal.creditsEarned + (market?.creditsEarned ?? 0);
  run.pilot.inventory = (market ?? legal).progress.inventory; run.pilot.credits = 0;
  const accuracy = accuracyAward(run.accuracy.hits, run.accuracy.shots), clear = 250 + 50 * Math.min(s.level, 20);
  s.result = { cargo, accuracy, clear, percent: tunnelAccuracy(run) };
  run.pilot.score += cargo + accuracy + clear;
  run.stageReward = cargo + accuracy + clear;
  s.paid = true; s.phase = 'result'; s.remaining = 3; run.cleared = true; run.phase = 'cleared';
  scoreLives(ctx); ctx.events.push({ type: 'cue', cue: 'bonusPayment' }); return true;
}
export function nextTunnel(run: RunState): boolean {
  if (run.tunnel?.phase !== 'result' || !run.tunnel.paid || run.tunnel.remaining > 0) return false;
  run.stage++; run.phase = 'playing'; run.cleared = false; run.elapsed = 0; run.kills = 0;
  run.accuracy = { shots: 0, hits: 0, misses: 0 }; resetChain(run);
  run.pilot.wanted = createInitialProgress().wanted; run.stageReward = 0;
  run.checkpoint = resources(run); run.tunnel = createTunnelState(run); return true;
}
export function dropPickup(ctx: TunnelContext, source: TunnelEntity, type: TunnelPickup, essential = false): void {
  // Reserve room for required rewards without allowing uncollected debris to grow forever.
  const pickups = ctx.state.entities.filter(e => e.kind === 'pickup' && e.hp > 0);
  if (pickups.length >= 40) {
    if (!essential) return;
    const replace = pickups.find(e => !e.essential);
    if (replace) replace.hp = 0; else return;
  }
  addEntity(ctx, 'pickup', source.lane, Math.max(26, source.depth), { drop: type, size: 0, hp: 1, essential });
}
