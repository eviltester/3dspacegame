import { describe, expect, it } from 'vitest';
import { clone, freshProfile, newRun, parseProfile, recordRun, retry, saveCheckpoint } from '../arcade';
import { addEntity } from './encounters';
import { accuracyAward, collectTunnelPickup, nextTunnel, provoke, scoreLives, settleTunnel, tunnelDamage, tunnelLaw } from './rules';
import type { TunnelPickup } from './types';
import { tunnelFixture, advanceTunnel } from './test-helpers';
import { TunnelSimulation } from './simulation';
import { parseTunnel } from './persistence';

describe('damage, lives and rewards', () => {
  it.each([['largeRock',50],['mediumRock',30],['smallRock',20],['ship',40],['wall',20],['gun',20],['barrier',50],['collision',40]] as const)('%s reduces shields by %i, then destroys an unshielded life in one hit', (source, cost) => {
    const { ctx, s, run } = tunnelFixture(); s.protection = 0;
    expect(tunnelDamage(ctx, source)).toBe(true); expect(run.skiff.shield).toBe(100 - cost);
    expect(tunnelDamage(ctx, source)).toBe(false); s.hitGrace = 0; run.skiff.shield = 1;
    tunnelDamage(ctx, source);
    expect(run.skiff).toEqual({ health: 1, shield: 0, damage: 0 }); expect(run.lives).toBe(3);
    expect(tunnelDamage(ctx, source)).toBe(false); s.hitGrace = 0;
    tunnelDamage(ctx, source); expect(run.skiff).toEqual({ health: 0, shield: 0, damage: 0 });
    expect(run.lives).toBe(2); expect(s.respawn).toBe(4);
    expect(tunnelDamage(ctx, source)).toBe(false); expect(run.lives).toBe(2);
  });
  it('preserves score, equipment, law and defeated enemies through the four-second respawn', () => {
    const { ctx, s, sim, run } = tunnelFixture(); run.pilot.score = 1234; run.tiers.lance = 3;
    run.pilot.wanted.active = true; run.skiff = { health: 1, shield: 0, damage: 0 }; s.protection = 0;
    const enemy = addEntity(ctx, 'ship', 3, 200, { faction: 'pirate', required: true });
    tunnelDamage(ctx, 'gun'); expect(run.lives).toBe(2); expect(s.respawn).toBe(4);
    advanceTunnel(sim, 3); expect(enemy.depth).toBe(200); expect(run.skiff.health).toBe(0);
    advanceTunnel(sim, 1); expect(s.respawn).toBe(0); expect(s.protection).toBe(3); expect(run.skiff).toEqual({ health: 1, shield: 100, damage: 0 });
    expect(run.pilot.score).toBe(1234); expect(run.tiers.lance).toBe(3); expect(run.pilot.wanted.active).toBe(true);
    expect(tunnelDamage(ctx, 'gun')).toBe(false);
  });
  it('game over waits; continue restores three lives, resets score and retries the checkpoint', () => {
    const { ctx, sim, s, run } = tunnelFixture(); run.lives = 1; run.pilot.score = 9000; run.skiff = { health: 1, shield: 0, damage: 0 }; s.protection = 0;
    tunnelDamage(ctx, 'gun'); expect(run.phase).toBe('gameover'); advanceTunnel(sim, 20); expect(s.phase).toBe('over');
    retry(run, true); expect(run.lives).toBe(3); expect(run.pilot.score).toBe(0); expect(run.continued).toBe(true); expect(run.tunnel).toBeUndefined();
    expect(new TunnelSimulation(run).state.elapsed).toBe(0);
  });
  it('awards each 35,000-point life threshold once, including at the five-life cap', () => {
    const { ctx, run } = tunnelFixture(); run.pilot.score = 35000; scoreLives(ctx); expect(run.lives).toBe(4);
    scoreLives(ctx); expect(run.lives).toBe(4); run.pilot.score = 105000; scoreLives(ctx); expect(run.lives).toBe(5);
    run.lives--; scoreLives(ctx); expect(run.lives).toBe(4); expect(run.nextLifeScore).toBe(140000);
  });
  it.each([['shieldCell', 20], ['fullRepair', 100]] as const)('%s restores %i shield without adding a life', (drop, shield) => {
    const { ctx, run, s } = tunnelFixture(); run.skiff.shield = 0; s.protection = 0;
    collectTunnelPickup(ctx, addEntity(ctx, 'pickup', 0, 0, { drop }));
    expect(run.skiff).toEqual({ health: 1, shield, damage: 0 }); expect(run.lives).toBe(3);
    tunnelDamage(ctx, 'largeRock'); expect(run.skiff.health).toBe(1); expect(run.lives).toBe(3);
  });
  it.each([[0,0,0],[79,100,0],[80,100,500],[89,100,500],[90,100,1000],[99,100,1000],[199,200,1000],[100,100,2000]])('accuracy %i/%i pays %i', (hits,shots,points) => {
    expect(accuracyAward(hits,shots)).toBe(points);
  });
  it('collects actual drops, upgrades within the tier gate, and converts capped cores to points', () => {
    const { ctx, run } = tunnelFixture();
    const collect = (drop: TunnelPickup) => { const item = addEntity(ctx, 'pickup', 0, 0, { drop }); expect(collectTunnelPickup(ctx, item)).toBe(true); expect(collectTunnelPickup(ctx, item)).toBe(false); };
    collect('weaponCore'); expect(run.tiers.pulse).toBe(2); collect('weaponCore'); expect(run.pilot.score).toBe(200);
    run.stage = 8; collect('weaponCore'); expect(run.tiers.pulse).toBe(3);
    run.skiff = { health: 1, shield: 5, damage: 0 }; collect('shieldCell'); expect(run.skiff).toEqual({ health: 1, shield: 25, damage: 0 });
    collect('fullRepair'); expect(run.skiff).toEqual({ health: 1, shield: 100, damage: 0 });
    for (const cargo of ['credits','rescuePod','contraband','legalCargo','rareMineral'] as const) collect(cargo);
    expect(run.pilot.inventory).toEqual({ legalCargo: 1, rareMineral: 1, contraband: 1, rescuePods: 1 }); expect(run.pilot.credits).toBe(35);
  });
  it('police collect contraband only and essential pickups cannot be stolen', () => {
    const { ctx } = tunnelFixture(); const police = addEntity(ctx, 'ship', 0, 0, { faction: 'police' });
    for (const drop of ['shieldCell','fullRepair','weaponCore','legalCargo'] as const) expect(collectTunnelPickup(ctx, addEntity(ctx,'pickup',0,0,{drop}), police)).toBe(false);
    expect(collectTunnelPickup(ctx, addEntity(ctx,'pickup',0,0,{drop:'contraband'}), police)).toBe(true);
    const pirate = addEntity(ctx,'ship',0,0,{faction:'pirate'});
    expect(collectTunnelPickup(ctx, addEntity(ctx,'pickup',0,0,{drop:'weaponCore',essential:true}), pirate)).toBe(false);
    expect(collectTunnelPickup(ctx, addEntity(ctx,'pickup',0,0,{drop:'shieldCell'}), pirate)).toBe(true);
    const trader = addEntity(ctx,'ship',0,0,{faction:'trader'});
    expect(collectTunnelPickup(ctx, addEntity(ctx,'pickup',0,0,{drop:'contraband'}), trader)).toBe(false);
  });
  it('settles legal cargo and accuracy once, retains contraband until the fifth tunnel', () => {
    const { ctx, s, run } = tunnelFixture(); s.phase = 'salvage'; run.accuracy = { shots: 5, hits: 5, misses: 0 };
    run.pilot.inventory = { legalCargo: 1, rareMineral: 1, rescuePods: 1, contraband: 2 }; run.pilot.credits = 35;
    expect(settleTunnel(ctx)).toBe(true); expect(s.result).toEqual({ cargo: 595, accuracy: 2000, clear: 300, percent: 100 });
    expect(run.pilot.inventory.contraband).toBe(2); expect(settleTunnel(ctx)).toBe(false);
    expect(nextTunnel(run)).toBe(false); s.remaining = 0; expect(nextTunnel(run)).toBe(true);
    expect(run.stage).toBe(2); expect(run.pilot.score).toBe(2895); expect(run.pilot.wanted.active).toBe(false);
    const fifth = tunnelFixture(5); fifth.s.phase = 'salvage'; fifth.run.pilot.inventory.contraband = 2; settleTunnel(fifth.ctx);
    expect(fifth.s.result?.cargo).toBe(520); expect(fifth.run.pilot.inventory.contraband).toBe(0);
  });
});
describe('sector law', () => {
  it('dispatches only after eight seconds and retains clean pilots', () => {
    const { ctx, s, run } = tunnelFixture(); tunnelLaw(ctx, 100); expect(run.pilot.wanted.active).toBe(false);
    const trader = addEntity(ctx,'ship',4,300,{faction:'trader'}); provoke(ctx,trader);
    tunnelLaw(ctx, 7.9); expect(s.entities.filter(e => e.faction === 'police')).toHaveLength(0);
    tunnelLaw(ctx, 0.11); expect(s.entities.filter(e => e.faction === 'police')).toHaveLength(2);
    tunnelLaw(ctx, 10); expect(s.entities.filter(e => e.faction === 'police')).toHaveLength(2);
  });
  it.each([0,200])('warns before a contraband scan and resolves a %i-point balance', score => {
    const { ctx, run, s } = tunnelFixture(); run.pilot.score = score; run.pilot.inventory.contraband = 1; s.elapsed = 16;
    addEntity(ctx, 'ship', 2, 100, { faction: 'police' }); tunnelLaw(ctx, 0.1);
    expect(s.scan).toBeCloseTo(2.9); expect(run.pilot.inventory.contraband).toBe(1);
    tunnelLaw(ctx, 3); expect(s.scanned).toBe(true);
    expect(run.pilot.score).toBe(score ? 60 : 0); expect(run.pilot.wanted.active).toBe(!score);
    expect(run.pilot.inventory.contraband).toBe(score ? 0 : 1);
  });
});
describe('exact snapshots', () => {
  it('resumes a shieldless checkpoint without damage or an extra hidden hit buffer', () => {
    const { run, s } = tunnelFixture(); run.skiff.shield = 0; run.skiff.damage = 70;
    s.startVitals.damage = 30; s.protection = 0;
    const profile = freshProfile(); saveCheckpoint(profile, run);
    const resumed = parseProfile(JSON.stringify(profile), null).checkpoints.tunnels!;
    const other = new TunnelSimulation(resumed);
    expect(resumed.skiff).toEqual({ health: 1, shield: 0, damage: 0 }); expect(other.state.startVitals.damage).toBe(0);
    tunnelDamage(other.ctx, 'gun'); expect(resumed.lives).toBe(2); expect(other.state.respawn).toBe(4);
  });
  it('resumes the same moving entities and outstanding accuracy without duplicate rewards', () => {
    const { run, sim } = tunnelFixture(); advanceTunnel(sim, 3, true);
    const profile = freshProfile(); saveCheckpoint(profile, run);
    const resumed = parseProfile(JSON.stringify(profile), null).checkpoints.tunnels!;
    expect(resumed.tunnel).toEqual(run.tunnel); expect(resumed.pilot.score).toBe(run.pilot.score);
    const other = new TunnelSimulation(resumed); advanceTunnel(sim, 2, true); advanceTunnel(other, 2, true);
    expect(resumed).toEqual(run);
  });
  it('a paid result survives repeated reloads without paying again', () => {
    const { ctx, run, s } = tunnelFixture(); s.phase = 'salvage'; settleTunnel(ctx);
    const profile = freshProfile(); saveCheckpoint(profile, run);
    const resumed = parseProfile(JSON.stringify(profile), null).checkpoints.tunnels!;
    const simulation = new TunnelSimulation(resumed); expect(settleTunnel(simulation.ctx)).toBe(false); expect(resumed.pilot.score).toBe(run.pilot.score);
  });
  it('adds tunnel defaults to existing profiles and keeps practice scores isolated', () => {
    const old = freshProfile(); const parsed = parseProfile(JSON.stringify(old), null);
    expect(parsed.scoreboards.tunnels).toEqual([]); expect(parsed.records.tunnels).toBe(0);
    const run = newRun('tunnels',1); run.pilot.score = 123; run.practice = true; recordRun(parsed,run); saveCheckpoint(parsed,run);
    expect(parsed.scoreboards.tunnels).toEqual([]); expect(parsed.checkpoints.tunnels).toBeUndefined();
  });
  it('rejects malformed snapshot data and repairs the checkpoint', () => {
    const { run, s, ctx } = tunnelFixture();
    expect(parseTunnel(null,1)).toBeUndefined(); expect(parseTunnel({},1)).toBeUndefined(); expect(parseTunnel(s,2)).toBeUndefined();
    const invalid = clone(s); invalid.lane = NaN; expect(parseTunnel(invalid,1)).toBeUndefined();
    addEntity(ctx,'ship',0,200); s.entities[0].depth = Infinity; expect(parseTunnel(s,1)).toBeUndefined();
    const profile = freshProfile(); saveCheckpoint(profile,run); const parsed = parseProfile(JSON.stringify(profile),null);
    expect(parsed.checkpoints.tunnels?.tunnel).toBeUndefined(); expect(parsed.checkpoints.tunnels?.phase).toBe('briefing');
  });
  it('pauses simulation time and does not pay or move on invalid steps', () => {
    const { sim, run } = tunnelFixture(); const initial = clone(run);
    for (const dt of [0,-1,NaN,1]) sim.step(dt,500,true); expect(run).toEqual(initial);
    run.phase = 'briefing'; const paused = clone(run); sim.step(1 / 60,500,true); expect(run).toEqual(paused);
  });
});
