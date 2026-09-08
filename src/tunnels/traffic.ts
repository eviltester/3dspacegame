/** Enemy decisions are expressed in lanes; the view only draws their warnings. */
import { invaderFireTiming } from '../combat/invader-fire';
import { laneSweep } from './collision';
import { addEntity, isPirate, isShip, random, tunnelEncounter } from './encounters';
import { collectTunnelPickup, tunnelDamage } from './rules';
import { laneDelta, wrapLane, WARNING_SECONDS, LANE_SECONDS } from './shapes';
import type { TunnelContext } from './types';
import type { TunnelCombat } from './combat';
import { canPursueAtEdge, edgeFireCooldown, EDGE_EXIT_DEPTH } from './edge';
import { detonateMine } from './mines';

export function moveTraffic(ctx: TunnelContext, dt: number, closed: boolean, combat: TunnelCombat): void {
  const { state: s, run } = ctx, speed = 30 * tunnelEncounter(s.level).speed;
  for (const e of [...s.entities]) {
    if (e.hp <= 0) continue;
    e.previousLane = e.lane; e.previousDepth = e.depth; e.age += dt;
    const pursuer = canPursueAtEdge(e, run.pilot.wanted.active);
    if (!pursuer) e.rim = false;
    if (e.depth < 0) {
      e.rim = false; e.warning = -1; e.changing = 0;
      e.depth -= dt * 160;
      if (e.depth < EDGE_EXIT_DEPTH) e.hp = 0;
      continue;
    }
    const approachTime = e.fragmentSpeed === undefined && e.kind !== 'mine' ? dt : Math.max(0, dt - e.grace);
    e.grace = Math.max(0, e.grace - dt); e.cooldown -= dt;
    if (e.changing > 0) e.changing = Math.max(0, e.changing - dt);
    else if (Math.abs(laneDelta(e.lane, e.nextLane, closed)) > 0.01) e.lane = wrapLane(e.lane + Math.sign(laneDelta(e.lane, e.nextLane, closed)) * Math.min(dt / 0.3, Math.abs(laneDelta(e.lane, e.nextLane, closed))), closed);
    if (e.retracting) {
      // Every rise, not just the first spawn, has a full warning before it is solid.
      const phase = e.age % 7;
      e.extension = phase < WARNING_SECONDS ? 0 : phase < 2 ? (phase - WARNING_SECONDS) / (2 - WARNING_SECONDS)
        : phase < 3.5 ? 1 : Math.max(0, 4.5 - phase);
      if (phase < WARNING_SECONDS) e.grace = Math.max(e.grace, WARNING_SECONDS - phase);
    }
    const alive = s.phase === 'assault';
    if (e.kind === 'pickup') {
      e.depth -= dt * (s.phase === 'salvage' ? Math.max(150, e.depth / Math.max(0.1, s.remaining)) : 100);
      const hit = laneSweep(s.previousLane, s.lane, 0, 0, e.previousLane, e.lane, e.previousDepth, e.depth, closed, 0.45, 12);
      if (hit !== null) collectTunnelPickup(ctx, e);
      if (alive) for (const npc of s.entities) if (isShip(npc) && npc.hp > 0 && laneSweep(npc.previousLane, npc.lane, npc.previousDepth, npc.depth, e.previousLane, e.lane, e.previousDepth, e.depth, closed) !== null) collectTunnelPickup(ctx, e, npc);
    } else if (alive) {
      if (isShip(e)) {
        if (e.policeEntry && !run.pilot.wanted.active) {
          e.policeEntry = false; e.warning = -1; e.targetId = 0;
        }
        if (e.policeEntry) e.depth = e.previousDepth;
        else if (e.kind === 'core' || e.parent) e.depth = Math.max(e.parent ? 200 : 240, e.depth - speed * dt * 0.5);
        else if (!e.rim) {
          const multiplier = e.role === 'diver' && e.age > WARNING_SECONDS ? 1.45 : e.role === 'carrier' ? 0.65 : 1;
          e.depth -= dt * speed * multiplier;
          if (e.depth <= 18 && pursuer) { e.rim = true; e.depth = 18; e.cooldown = WARNING_SECONDS; ctx.events.push({ type: 'notice', text: 'ENEMY ON THE EDGE - KEEP MOVING' }); }
        }
        if (e.rim && e.warning < 0 && e.changing === 0 && Math.abs(laneDelta(e.lane, e.nextLane, closed)) < 0.01 && e.cooldown <= 0) {
          const distance = laneDelta(e.lane, Math.round(s.lane), closed);
          // Pursuit and firing share the warning period, not a cooldown reset.
          // Otherwise chasing a player in another lane permanently postpones fire.
          if (Math.abs(distance) >= 0.5) { e.nextLane = wrapLane(Math.round(e.lane) + Math.sign(distance), closed); e.changing = WARNING_SECONDS; }
        }
        if (!e.rim && e.role === 'flanker' && Math.floor(e.age / 5) !== Math.floor((e.age - dt) / 5) && e.changing === 0 && Math.abs(laneDelta(e.lane, e.nextLane, closed)) < 0.01) {
          e.nextLane = wrapLane(Math.round(e.lane) + (e.id % 2 ? -1 : 1), closed); e.changing = WARNING_SECONDS; e.cooldown = 3;
        }
      } else {
        // Fragments move sideways immediately, but cannot rush the player until
        // their visible grace period has elapsed, even when split near the edge.
        e.depth -= approachTime * speed * (e.kind === 'asteroid' ? (1 + (2 - e.size) * 0.18) * (e.fragmentSpeed ?? 1) : 0.85);
        if (e.kind === 'mine') detonateMine(ctx, e, closed, combat);
        else if (e.grace <= 0 && e.extension > 0.35 && laneSweep(s.previousLane, s.lane, 0, 0, e.previousLane, e.lane, e.previousDepth, e.depth, closed) !== null) {
          const source = e.kind === 'asteroid' ? (['smallRock','mediumRock','largeRock'] as const)[e.size] : ['wall','pillar'].includes(e.kind) ? 'barrier' : 'collision';
          tunnelDamage(ctx, source); e.hp = 0;
          if (source === 'barrier') { const next = wrapLane(Math.round(s.lane) + (s.lane < 6 ? 1 : -1), closed); s.lane = next; s.desiredLane = next; }
        }
      }
      // Passing friendly traffic can collide, but never becomes a required pursuer.
      if (isShip(e) && !e.rim && e.grace <= 0 && laneSweep(s.previousLane, s.lane, 0, 0, e.previousLane, e.lane, e.previousDepth, e.depth, closed) !== null) tunnelDamage(ctx, 'ship');
    }
    if (e.depth < EDGE_EXIT_DEPTH) e.hp = 0;
    if (s.respawn > 0 || s.phase === 'over') return;
  }
  if (s.phase !== 'assault') return;
  // Finish already telegraphed attacks before granting the next firing turn.
  for (const e of s.entities.filter(e => isShip(e) && e.hp > 0 && e.depth >= 0 && e.warning >= 0)) {
    e.warning -= dt;
    if (e.warning <= 0) {
      e.warning = -1;
      combat.hostileShot(e);
      if (e.role === 'minelayer' && s.entities.filter(e => isPirate(e) || e.faction === 'police').length < 18) addEntity(ctx, 'mine', wrapLane(Math.round(e.lane) + 1, closed), e.depth, { faction: 'pirate', hp: 20, size: 0 });
      if (s.respawn > 0 || ctx.run.lives === 0) return;
    }
  }
  s.attackDelay = Math.max(0, s.attackDelay - dt);
  if (s.attackDelay > 0 || s.entities.filter(e => e.warning >= 0).length >= 6) return;
  const hostiles = s.entities.filter(e => e.hp > 0 && e.depth >= 0 && canPursueAtEdge(e, run.pilot.wanted.active)).length;
  const eligible = s.entities.filter(e => isShip(e) && e.hp > 0 && e.depth >= 0 && e.grace <= 0 && e.age > WARNING_SECONDS && e.cooldown <= 0 && e.warning < 0 && (e.changing === 0 || e.rim));
  const rotation = eligible.filter(e => e.id > s.lastAttacker).concat(eligible.filter(e => e.id <= s.lastAttacker));
  // First shots announce arrivals at the bottom, without bypassing attack spacing.
  const order = rotation.filter(e => e.policeEntry).concat(rotation.filter(e => !e.policeEntry));
  for (const e of order) {
    const rival = s.entities.find(other => other.hp > 0 && other.depth >= 0 && isShip(other) && (isPirate(e) ? ['police','trader'].includes(other.faction) : isPirate(other)) && Math.abs(laneDelta(e.lane, other.lane, closed)) < 0.45);
    const attacksPlayer = isPirate(e) || e.faction === 'police' && run.pilot.wanted.active || e.faction === 'trader' && run.pilot.wanted.active && e.targetId === -1;
    if (!attacksPlayer && !rival) {
      const pirate = s.entities.find(other => isPirate(other) && other.hp > 0);
      if (pirate && !e.rim) { e.nextLane = wrapLane(Math.round(e.lane) + Math.sign(laneDelta(e.lane, pirate.lane, closed)), closed); e.changing = WARNING_SECONDS; }
      continue;
    }
    const target = e.faction === 'police' && run.pilot.wanted.active ? undefined : rival;
    e.targetId = target?.id ?? -1; e.targetLane = target ? Math.round(e.lane) : Math.round(s.lane);
    e.warning = WARNING_SECONDS;
    const timing = invaderFireTiming(s.level);
    e.cooldown = e.rim ? edgeFireCooldown(hostiles) + random(s) * 0.15 : timing.cooldown * 0.65 + random(s) * 0.35;
    s.attackDelay = timing.gap * 0.8; s.lastAttacker = e.id;
    if (e.targetId === -1) ctx.events.push({ type: 'cue', cue: 'lockOn' });
    break;
  }
}

export function movePlayer(ctx: TunnelContext, horizontal: number, dt: number, closed: boolean, laneStep = 0): void {
  const s = ctx.state;
  // Input accumulates in lane units; the travel cap makes warning/escape tests meaningful.
  s.previousLane = s.lane;
  if (laneStep) s.desiredLane = wrapLane(Math.round(s.desiredLane) + laneStep, closed);
  s.desiredLane = wrapLane(s.desiredLane + horizontal / 45, closed);
  const target = wrapLane(Math.round(s.desiredLane), closed), delta = laneDelta(s.lane, target, closed);
  s.lane = wrapLane(s.lane + Math.sign(delta) * Math.min(Math.abs(delta), dt / LANE_SECONDS), closed);
}
