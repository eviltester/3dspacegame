import { expect, it } from 'vitest';
import { freshProfile, parseProfile, saveCheckpoint } from '../arcade';
import { addEntity, spawnAssault } from './encounters';
import { parseTunnel } from './persistence';
import { provoke, tunnelLaw } from './police';
import { nextTunnel, settleTunnel, tunnelDamage } from './rules';
import { TUNNEL_DEPTH } from './shapes';
import { TunnelSimulation } from './simulation';
import { advanceTunnel, tunnelFixture } from './test-helpers';
import { moveTraffic } from './traffic';

function policeIncident() {
  const f = tunnelFixture();
  const officer = addEntity(f.ctx, 'ship', 4, 200, { faction: 'police', hp: 1000 });
  f.combat.damage(officer, 1);
  return { ...f, officer };
}

it('dispatches from the tunnel bottom after eight seconds, despite repeated police hits', () => {
  const { ctx, combat, s, run, officer } = policeIncident();
  expect(s.policeResponse).toEqual({ limit: 10, spawned: 0, delay: 0 });
  tunnelLaw(ctx, 4); combat.damage(officer, 1);
  expect(run.pilot.wanted.policeTimer).toBe(4);
  tunnelLaw(ctx, 3.9); expect(s.policeResponse?.spawned).toBe(0);
  expect(ctx.events.filter(e => e.type === 'cue' && e.cue === 'policeArrival')).toHaveLength(0);
  tunnelLaw(ctx, 0.1);
  const arrivals = s.entities.filter(e => e.id !== officer.id);
  expect(arrivals).toHaveLength(2);
  expect(arrivals.every(e => e.depth === TUNNEL_DEPTH && e.policeEntry && !e.required)).toBe(true);
  expect(ctx.events.filter(e => e.type === 'cue' && e.cue === 'policeArrival')).toHaveLength(1);
});

it('caps the entire response at ten, even when officers are destroyed or repeatedly attacked', () => {
  const { ctx, s, combat, officer, run } = policeIncident();
  tunnelLaw(ctx, 8);
  for (let i = 0; i < 20; i++) {
    combat.damage(officer, 1);
    for (const e of s.entities) if (e.policeEntry) e.hp = 0;
    tunnelLaw(ctx, 2);
  }
  expect(s.policeResponse?.spawned).toBe(10);
  expect(s.entities.filter(e => e.id !== officer.id)).toHaveLength(10);
  expect(ctx.events.filter(e => e.type === 'cue' && e.cue === 'policeArrival')).toHaveLength(5);
  expect(run.pilot.wanted.active).toBe(true);
  // Ordinary pirate scheduling resumes once the finite response is spent.
  s.spawnDelay = 0; spawnAssault(ctx, 0.01, true);
  expect(s.entities.some(e => e.required && e.faction === 'pirate')).toBe(true);
});

it('expands an existing two-officer response to ten without paying for a new batch of ten', () => {
  const { ctx, s } = tunnelFixture(); provoke(ctx, addEntity(ctx, 'ship', 4, 300, { faction: 'trader' }));
  tunnelLaw(ctx, 8); expect(s.policeResponse?.spawned).toBe(2);
  provoke(ctx, s.entities.find(e => e.faction === 'police')!);
  for (let i = 0; i < 8; i++) tunnelLaw(ctx, 2);
  expect(s.entities.filter(e => e.faction === 'police')).toHaveLength(10);
  expect(s.policeResponse).toEqual({ limit: 10, spawned: 10, delay: 0 });
});

it('waits for capacity and fills a freed slot before the pirate roster can take it', () => {
  const { ctx, sim, s, run } = policeIncident();
  for (let i = 0; i < 17; i++) addEntity(ctx, 'ship', i % 12, 300, { faction: 'pirate', required: true });
  tunnelLaw(ctx, 8); expect(s.policeResponse?.spawned).toBe(0);
  expect(ctx.events.some(e => e.type === 'cue' && e.cue === 'policeArrival')).toBe(false);
  s.entities[1].hp = 0; s.spawnDelay = 0; s.patrol = true; sim.step(1 / 60);
  expect(s.policeResponse?.spawned).toBe(1); expect(s.spawnIndex).toBe(0);
  expect(s.entities.filter(e => e.faction === 'pirate' || e.faction === 'police')).toHaveLength(18);
  expect(run.pilot.wanted.policeArrived).toBe(true);
});

it('fires the first shots at full depth, with staggered 0.9-second warnings before advancing', () => {
  const { ctx, combat, s, officer } = policeIncident(); officer.hp = 0;
  tunnelLaw(ctx, 8); s.attackDelay = 0;
  const arrivals = s.entities.filter(e => e.policeEntry);
  for (let i = 0; i < 49; i++) moveTraffic(ctx, 1 / 60, true, combat);
  expect(s.shots).toHaveLength(0);
  expect(arrivals.every(e => e.depth === TUNNEL_DEPTH)).toBe(true);
  expect(arrivals.filter(e => e.warning >= 0)).toHaveLength(1);
  for (let i = 0; i < 10; i++) moveTraffic(ctx, 1 / 60, true, combat);
  expect(s.shots).toHaveLength(1); expect(s.shots[0].originDepth).toBe(TUNNEL_DEPTH);
  expect(s.shots[0].target).toBe(-1); expect(arrivals[0].depth).toBeLessThan(TUNNEL_DEPTH);
  expect(arrivals[1].depth).toBe(TUNNEL_DEPTH);
  for (let i = 0; i < 50; i++) moveTraffic(ctx, 1 / 60, true, combat);
  expect(s.shots).toHaveLength(2); expect(s.shots.every(e => e.originDepth === TUNNEL_DEPTH)).toBe(true);
});

it.each([false, true])('normal patrol arrival sounds a siren only when wanted=%s', wanted => {
  const { ctx, s, run } = tunnelFixture();
  run.pilot.wanted.active = wanted; s.elapsed = 7.1; s.spawnDelay = 999;
  spawnAssault(ctx, 0.01, true);
  const officer = s.entities.find(e => e.faction === 'police')!;
  expect(officer.depth).toBe(wanted ? TUNNEL_DEPTH : 300);
  expect(ctx.events.some(e => e.type === 'cue' && e.cue === 'policeArrival')).toBe(wanted);
});

it('cancels an arriving officer\'s warned attack if wanted status clears before it fires', () => {
  const { ctx, combat, s, run } = policeIncident(); tunnelLaw(ctx, 8); s.attackDelay = 0;
  moveTraffic(ctx, 0.01, true, combat);
  expect(s.entities.some(e => e.policeEntry && e.warning > 0)).toBe(true);
  run.pilot.wanted.active = false;
  for (let i = 0; i < 60; i++) moveTraffic(ctx, 1 / 60, true, combat);
  expect(s.shots).toHaveLength(0); expect(s.entities.some(e => e.policeEntry)).toBe(false);
});

it('keeps a coinciding pirate and ordinary patrol arrival within the hostile cap', () => {
  const { ctx, s } = tunnelFixture(); s.elapsed = 7.1; s.spawnDelay = 0;
  for (let i = 0; i < 17; i++) addEntity(ctx, 'ship', i % 12, 300, { faction: 'pirate' });
  spawnAssault(ctx, 0.01, true);
  expect(s.entities.filter(e => e.faction === 'pirate' || e.faction === 'police')).toHaveLength(18);
  expect(s.patrol).toBe(false);
});

it('preserves the spent budget and pending arrival through a death and save/resume', () => {
  const { ctx, s, run, sim } = policeIncident(); tunnelLaw(ctx, 8); tunnelLaw(ctx, 2.5);
  expect(s.policeResponse?.spawned).toBe(4);
  run.skiff = { health: 1, shield: 0, damage: 99 }; s.protection = 0; tunnelDamage(ctx, 'gun');
  const pending = structuredClone(s.policeResponse); tunnelLaw(ctx, 20); expect(s.policeResponse).toEqual(pending);
  advanceTunnel(sim, 4); expect(s.policeResponse).toEqual(pending);
  const profile = freshProfile(); saveCheckpoint(profile, run);
  const restoredRun = parseProfile(JSON.stringify(profile), null).checkpoints.tunnels!;
  const restored = new TunnelSimulation(restoredRun);
  expect(restored.state).toEqual(s);
  for (let i = 0; i < 10; i++) {
    tunnelLaw(ctx, 2); tunnelLaw(restored.ctx, 2);
  }
  expect(restored.state).toEqual(s); expect(s.policeResponse?.spawned).toBe(10);
  const total = s.entities.length; tunnelLaw(restored.ctx, 100); expect(restored.state.entities).toHaveLength(total);
});

it('withdraws a pending response when cleared and resets law for the next tunnel', () => {
  const { ctx, run, s } = policeIncident(); tunnelLaw(ctx, 8);
  s.phase = 'salvage'; const total = s.entities.length; tunnelLaw(ctx, 100); expect(s.entities).toHaveLength(total);
  settleTunnel(ctx); s.remaining = 0; expect(nextTunnel(run)).toBe(true);
  expect(run.pilot.wanted.active).toBe(false); expect(run.tunnel?.policeResponse).toBeUndefined();
});

it('does not dispatch or sound the siren for innocent players or pirate kills', () => {
  const { ctx, s, combat } = tunnelFixture();
  combat.damage(addEntity(ctx, 'ship', 3, 100, { faction: 'pirate' }), 100);
  tunnelLaw(ctx, 100);
  expect(s.policeResponse).toBeUndefined(); expect(s.entities.some(e => e.faction === 'police')).toBe(false);
  expect(ctx.events.some(e => e.type === 'cue' && e.cue === 'policeArrival')).toBe(false);
});

it('accepts existing snapshots, counts previously dispatched officers and rejects corrupt budgets', () => {
  const { ctx, run, s } = tunnelFixture();
  expect(parseTunnel(s, 1)).toEqual(s);
  run.pilot.wanted.active = true; run.pilot.wanted.policeArrived = true;
  tunnelLaw(ctx, 10); expect(s.policeResponse?.spawned).toBe(2); expect(s.entities).toHaveLength(0);
  for (const invalid of [null, { limit: 20, spawned: 2, delay: 0 }, { limit: 10, spawned: 11, delay: 0 },
    { limit: 10, spawned: -1, delay: 0 }, { limit: 10, spawned: 1.5, delay: 0 }, { limit: 10, spawned: 2, delay: Infinity }]) {
    expect(parseTunnel({ ...s, policeResponse: invalid }, 1)).toBeUndefined();
  }
  const officer = addEntity(ctx, 'ship', 3, 420, { faction: 'police', policeEntry: true });
  expect(parseTunnel(s, 1)).toEqual(s);
  officer.faction = 'pirate'; expect(parseTunnel(s, 1)).toBeUndefined();
});
