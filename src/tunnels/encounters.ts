import type { EnemyArchetype } from '../arcade';
import type { TunnelContext, TunnelEntity, TunnelKind } from './types';
import { LANES, TUNNEL_DEPTH, WARNING_SECONDS, laneDelta, LANE_SECONDS, wrapLane } from './shapes';

export interface TunnelEncounterDefinition { level: number; groups: number; count: number; roles: EnemyArchetype[]; speed: number; shotSpeed: number; boss: boolean }
export function tunnelEncounter(level: number): TunnelEncounterDefinition {
  const n = Math.max(1, Math.floor(level)), pressure = Math.log2(n);
  const roles: EnemyArchetype[] = ['raider', 'flanker', 'diver', 'gunship', 'minelayer', 'carrier'];
  return { level: n, groups: 1 + Math.floor(pressure / 2), count: Math.min(18, 10 + Math.floor(pressure) * 2),
    roles: n <= 6 ? [roles[n - 1]] : roles.slice(0, 5), speed: 1 + Math.min(1.5, 0.18 * pressure),
    shotSpeed: Math.min(1.35, 1 + (n - 1) * 0.025), boss: n % 10 === 0 };
}
/** Separate gameplay and loot streams: firing at a crate cannot change the assault. */
export function random(state: TunnelContext['state'], loot = false): number {
  const key = loot ? 'lootRandom' : 'random';
  state[key] = (Math.imul(state[key], 1664525) + 1013904223) >>> 0;
  return state[key] / 4294967296;
}
export const isPirate = (e: TunnelEntity): boolean => e.faction === 'pirate';
export const isShip = (e: TunnelEntity): boolean => ['ship', 'gun', 'core'].includes(e.kind);
export function addEntity(ctx: TunnelContext, kind: TunnelKind, lane: number, depth = TUNNEL_DEPTH, overrides: Partial<TunnelEntity> = {}): TunnelEntity {
  const e: TunnelEntity = { id: ctx.state.nextId++, kind, faction: 'neutral', role: 'raider', lane, previousLane: lane, depth, previousDepth: depth,
    hp: kind === 'asteroid' ? 32 : 48, size: 2, age: 0, grace: WARNING_SECONDS, required: false,
    cooldown: 2 + random(ctx.state) * 2, warning: -1, targetLane: lane, targetId: -1,
    changing: 0, nextLane: lane, rim: false, parent: 0, retracting: false, extension: 1, essential: false, ...overrides };
  ctx.state.entities.push(e); return e;
}
/** Check the player's reachable lanes at an obstacle's arrival, including open ends. */
export function safeObstacle(ctx: TunnelContext, lane: number, seconds: number, closed: boolean): boolean {
  // Treat every incoming barrier as occupied, even while retracted. This deliberately
  // overestimates danger so a later surge cannot close the last escape lane.
  const blocked = ctx.state.entities.filter(e => e.hp > 0 && ['pillar', 'wall'].includes(e.kind)).map(e => Math.round(e.lane));
  blocked.push(lane);
  const current = Math.round(ctx.state.lane) % LANES;
  // A distant empty lane is not an escape if a solid neighbour lies in its path.
  return [-1, 0, 1].map(offset => wrapLane(current + offset, closed)).some(i => !blocked.includes(i)
    && Math.abs(laneDelta(ctx.state.lane, i, closed)) * LANE_SECONDS + WARNING_SECONDS < seconds);
}
export function spawnAssault(ctx: TunnelContext, dt: number, closed: boolean): void {
  const s = ctx.state, definition = tunnelEncounter(s.level);
  s.spawnDelay -= dt; s.hazardDelay -= dt;
  const alive = s.entities.filter(e => e.required).length;
  // Reserve capacity for police even before a warrant turns them hostile.
  const hostiles = s.entities.filter(e => isPirate(e) || e.faction === 'police').length;
  if (s.group < definition.groups && s.spawnDelay <= 0 && hostiles < 18) {
    if (s.spawnIndex >= definition.count) {
      if (alive === 0) { s.group++; s.spawnIndex = 0; s.spawnDelay = Math.max(1, 3 - Math.log2(s.level) * 0.15); }
    } else {
      if (!s.spawnIndex) ctx.events.push({ type: 'notice', text: `ASSAULT ${s.group + 1}/${definition.groups} WARPING IN` }, { type: 'cue', cue: 'patrolApproach' });
      const boss = definition.boss && s.group === definition.groups - 1 && s.spawnIndex === 0;
      const launchCarrier = s.entities.find(e => e.hp > 0 && e.role === 'carrier' && e.faction === 'pirate');
      const lane = launchCarrier && !boss ? wrapLane(Math.round(launchCarrier.lane) + (s.spawnIndex % 2 ? -1 : 1), closed)
        : s.spawnIndex < 3 && s.group === 0 ? wrapLane(Math.round(s.lane) + [0, -1, 1][s.spawnIndex], closed) : Math.floor(random(s) * LANES);
      if (!boss || hostiles <= 15) {
        const selected = definition.roles[s.spawnIndex % definition.roles.length];
        const role = boss ? 'carrier' : selected === 'carrier' && s.spawnIndex > 0 ? 'raider' : selected;
        const depth = boss ? TUNNEL_DEPTH : launchCarrier?.depth ?? (s.elapsed < 5 ? 200 : TUNNEL_DEPTH);
        const carrier = addEntity(ctx, boss ? 'core' : s.level >= 4 && s.spawnIndex % 4 === 3 ? 'gun' : 'ship', lane, Math.max(100, depth),
          { faction: 'pirate', role, hp: role === 'carrier' ? 160 : role === 'gunship' ? 64 : 48, required: true });
        if (boss) for (const offset of [-2, 2]) addEntity(ctx, 'gun', wrapLane(lane + offset, closed), 340, { faction: 'pirate', parent: carrier.id, required: true, hp: 96 });
        // Launch the remaining finite roster alongside the carrier. Killing it cannot
        // replenish that roster, and resuming keeps the consumed spawn index.
        s.spawnIndex++; s.spawnDelay = Math.max(0.55, 1.5 - Math.log2(s.level) * 0.08);
      }
    }
  }
  if (!s.patrol && s.elapsed > 7 && s.entities.filter(e => e.hp > 0 && (isPirate(e) || e.faction === 'police')).length < 18) {
    s.patrol = true;
    const wanted = ctx.run.pilot.wanted.active;
    addEntity(ctx, 'ship', 3, wanted ? TUNNEL_DEPTH : 300, { faction: 'police',
      ...(wanted ? { policeEntry: true, age: WARNING_SECONDS, grace: 0, cooldown: 0 } : {}) });
    if (wanted) ctx.events.push({ type: 'notice', text: 'POLICE PATROL ARRIVED - YOU ARE WANTED' }, { type: 'cue', cue: 'policeArrival' });
    addEntity(ctx, 'ship', 8, 360, { faction: 'trader' });
  }
  if (s.hazardDelay <= 0 && s.group < definition.groups) {
    s.hazardDelay = Math.max(1.8, 5 - Math.log2(s.level) * 0.4);
    const lane = Math.floor(random(s) * LANES);
    const kind: TunnelKind = s.level >= 4 && random(s) < 0.4 ? (random(s) < 0.5 ? 'wall' : 'pillar') : random(s) < 0.45 ? 'crate' : 'asteroid';
    if (!['wall', 'pillar'].includes(kind) || safeObstacle(ctx, lane, 14 / definition.speed, closed)) {
      if (s.entities.filter(e => !e.required).length < 48) addEntity(ctx, kind, lane, TUNNEL_DEPTH, { retracting: kind === 'pillar' && s.level >= 5 && random(s) < 0.5 });
    }
  }
}
