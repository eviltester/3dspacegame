import { describe, expect, it } from 'vitest';
import { addEntity, tunnelEncounter } from './encounters';
import { tunnelFixture, advanceTunnel } from './test-helpers';
import { moveTraffic } from './traffic';

describe('lane weapons', () => {
  it('counts three Spread pellets independently when one hits and two miss', () => {
    const { run, ctx, combat } = tunnelFixture(); run.family = 'spread';
    addEntity(ctx, 'ship', 0, 80, { faction: 'pirate', hp: 200 });
    expect(combat.fire()).toBe(true); expect(combat.fire()).toBe(false);
    for (let i = 0; i < 120; i++) combat.step(1 / 60);
    expect(run.accuracy).toEqual({ shots: 3, hits: 1, misses: 2 }); expect(run.pilot.score).toBe(0); expect(run.charge).toBe(5);
  });
  it('keeps all three pellets on the track at an open endpoint', () => {
    const { run, combat, s } = tunnelFixture(6); run.family = 'spread'; combat.fire();
    expect(s.shots.map(s => s.lane)).toEqual([0,0,1]);
  });
  it('Lance pierces three targets but contributes one accuracy hit and one charge', () => {
    const { ctx, run, combat } = tunnelFixture(); run.family = 'lance';
    for (const depth of [50,100,150,200]) addEntity(ctx, 'ship', 0, depth, { faction: 'pirate', hp: 100 });
    combat.fire(); for (let i = 0; i < 100; i++) combat.step(1 / 60);
    expect(ctx.state.entities.map(e => e.hp)).toEqual([15,15,15,100]);
    expect(run.accuracy).toEqual({ shots: 1, hits: 1, misses: 0 }); expect(run.charge).toBe(5);
  });
  it('blocks shots at walls and at a shielded carrier core', () => {
    const { ctx, combat, run } = tunnelFixture(); run.family = 'lance';
    addEntity(ctx, 'wall', 0, 50); const pirate = addEntity(ctx, 'ship', 0, 100, { faction: 'pirate' });
    combat.fire(); for (let i = 0; i < 100; i++) combat.step(1 / 60);
    expect(pirate.hp).toBe(48); expect(run.accuracy.hits).toBe(0);
    const core = addEntity(ctx, 'core', 2, 200, { faction: 'pirate', hp: 160 });
    const gun = addEntity(ctx, 'gun', 3, 180, { parent: core.id, faction: 'pirate' });
    expect(combat.damage(core, 999)).toBe(false); combat.damage(gun, 999); expect(combat.damage(core, 999)).toBe(true);
  });
  it('intercepts hostile fire for ten points/charge without intercepting police fire at pirates', () => {
    const { ctx, s, run, combat } = tunnelFixture();
    const pirate = addEntity(ctx, 'ship', 0, 100, { faction: 'pirate', hp: 200 });
    combat.hostileShot(pirate); combat.fire();
    for (let i = 0; i < 30; i++) combat.step(1 / 60);
    expect(run.pilot.score).toBe(10); expect(run.charge).toBe(10); expect(run.accuracy.hits).toBe(1);
    expect(s.shots.filter(shot => shot.faction === 'pirate')).toHaveLength(0);
  });
  it('blast protects police and traders while damaging pirates and vaporising rocks', () => {
    const { ctx, run, combat } = tunnelFixture(); run.charge = 100;
    const police = addEntity(ctx, 'ship', 0, 100, { faction: 'police' }), trader = addEntity(ctx, 'ship', 1, 100, { faction: 'trader' });
    const pirate = addEntity(ctx, 'ship', 2, 100, { faction: 'pirate' }), rock = addEntity(ctx, 'asteroid', 3, 100);
    const far = addEntity(ctx, 'ship', 4, 300, { faction: 'pirate' });
    expect(combat.blast()).toBe(true); expect(combat.blast()).toBe(false);
    expect([police.hp,trader.hp,far.hp]).toEqual([48,48,48]); expect(pirate.hp).toBeLessThanOrEqual(0); expect(rock.hp).toBe(0);
    expect(ctx.state.entities.filter(e => e.kind === 'asteroid')).toHaveLength(1); expect(run.pilot.wanted.active).toBe(false);
  });
  it('splits rocks into smaller, warned fragments respecting open endpoints', () => {
    const { ctx, combat, s } = tunnelFixture(6); const rock = addEntity(ctx, 'asteroid', 0, 70);
    combat.damage(rock, 100);
    const children = s.entities.filter(e => e.kind === 'asteroid' && e.hp > 0);
    expect(children).toHaveLength(2); expect(children.map(e => e.nextLane)).toEqual([1,2]);
    expect(children.every(e => e.size === 1 && e.grace >= 0.9)).toBe(true);
    combat.damage(children[0], 100); expect(s.entities.some(e => e.kind === 'asteroid' && e.size === 0)).toBe(true);
  });
  it('never exceeds the fragment cap', () => {
    const { ctx, combat, s } = tunnelFixture();
    for (let i = 0; i < 64; i++) addEntity(ctx, 'asteroid', i % 12);
    combat.damage(s.entities[0], 999); expect(s.entities.filter(e => e.kind === 'asteroid' && e.hp > 0)).toHaveLength(64);
  });
});
describe('enemy movement and faction safety', () => {
  it('aims at a warned player lane from another lane, then keeps that aim fixed', () => {
    const { ctx, combat, s, run } = tunnelFixture(); s.protection = 0;
    const pirate = addEntity(ctx, 'ship', 4, 200, { faction: 'pirate', cooldown: 0, grace: 0, age: 3 });
    s.attackDelay = 0; moveTraffic(ctx, 0.01, true, combat);
    expect(pirate.targetLane).toBe(0); expect(pirate.warning).toBe(0.9);
    for (let i = 0; i < 55; i++) moveTraffic(ctx, 1 / 60, true, combat);
    expect(s.shots[0].originLane).toBe(4); expect(s.shots[0].aimLane).toBe(0);
    s.lane = 2; s.previousLane = 2;
    for (let i = 0; i < 120; i++) combat.step(1 / 60);
    expect(run.skiff.shield).toBe(100);
    s.lane = 0; s.previousLane = 0; combat.hostileShot(pirate);
    for (let i = 0; i < 120; i++) combat.step(1 / 60);
    expect(run.skiff.shield).toBe(80);
  });
  it('puts a stationary, non-firing pilot under real pressure during the opening tunnel', () => {
    const { sim, run } = tunnelFixture(); advanceTunnel(sim, 10);
    expect(run.skiff.shield).toBeLessThan(100);
    advanceTunnel(sim, 20); expect(run.lives).toBeLessThan(3);
  });
  it('police help defeat required pirates without attacking an innocent player', () => {
    const { ctx, combat, s, run } = tunnelFixture();
    const pirate = addEntity(ctx, 'ship', 2, 100, { faction: 'pirate', required: true, cooldown: 100 });
    addEntity(ctx, 'ship', 2, 200, { faction: 'police', age: 5, grace: 0, cooldown: 0 }); s.attackDelay = 0;
    // A passing patrol finishes the pirate together, then leaves the edge.
    const officer = addEntity(ctx, 'ship', 2, 240, { faction: 'police', age: 5, grace: 0, cooldown: 0 });
    for (let i = 0; i < 1200; i++) { moveTraffic(ctx, 1 / 60, true, combat); combat.step(1 / 60); }
    expect(pirate.hp).toBeLessThanOrEqual(0); expect(run.skiff.shield).toBe(100);
    expect(officer.rim).toBe(false); expect(officer.hp).toBe(0);
    expect(s.shots.filter(shot => shot.faction === 'police').every(shot => shot.target !== -1)).toBe(true);
  });
  it('protected-ship hits trigger wanted status and earn no accuracy credit', () => {
    const { ctx, run, combat } = tunnelFixture(); addEntity(ctx, 'ship', 0, 80, { faction: 'police' });
    combat.fire(); for (let i = 0; i < 100; i++) combat.step(1 / 60);
    expect(run.pilot.wanted.active).toBe(true); expect(run.pilot.wanted.reason).toBe('Attack on police'); expect(run.accuracy.hits).toBe(0);
  });
  it('warns for 0.9 seconds before firing and staggers attackers', () => {
    const { ctx, s, combat } = tunnelFixture();
    for (let i = 0; i < 18; i++) addEntity(ctx, 'ship', i % 12, 300, { faction: 'pirate', cooldown: 0, grace: 0, age: 3 });
    s.attackDelay = 0; moveTraffic(ctx, 0.01, true, combat);
    expect(s.entities.filter(e => e.warning >= 0)).toHaveLength(1);
    expect(s.entities[0].warning).toBe(0.9);
    for (let i = 0; i < 53; i++) moveTraffic(ctx, 1 / 60, true, combat);
    expect(s.shots).toHaveLength(0); moveTraffic(ctx, 0.04, true, combat); expect(s.shots.length).toBeGreaterThan(0);
  });
  it('keeps escaped enemies as shootable edge pursuers', () => {
    const { ctx, s, combat } = tunnelFixture(); s.protection = 0;
    const pirate = addEntity(ctx, 'ship', 2, 19, { required: true, faction: 'pirate', cooldown: 0, grace: 0 });
    moveTraffic(ctx, 0.1, true, combat); expect(pirate.rim).toBe(true); expect(pirate.depth).toBe(18);
    for (let i = 0; i < 250; i++) moveTraffic(ctx, 1 / 60, true, combat);
    expect(pirate.lane).toBeLessThan(2); expect(pirate.required).toBe(true);
    s.lane = pirate.lane; combat.fire(); combat.step(0.1); expect(pirate.hp).toBeLessThan(48);
  });
  it('starts meaningful combat quickly and delivers its first upgrade', () => {
    const { sim, run, s } = tunnelFixture(); advanceTunnel(sim, 4, true);
    expect(run.accuracy.hits).toBeGreaterThan(0); expect(s.earlyCore).toBe(true);
    advanceTunnel(sim, 3, true); expect(run.tiers.pulse).toBe(2);
  });
  it('warns before every pillar rise and separates a collision without trapping the craft', () => {
    const { ctx, s, combat, run } = tunnelFixture(5); s.protection = 0;
    const pillar = addEntity(ctx, 'pillar', 0, 2, { retracting: true, age: 7, grace: 0 });
    moveTraffic(ctx, 0.1, true, combat);
    expect(pillar.extension).toBe(0); expect(pillar.grace).toBeCloseTo(0.8); expect(run.skiff.shield).toBe(100);
    pillar.age = 9.1; pillar.depth = 2; pillar.grace = 0;
    moveTraffic(ctx, 0.1, true, combat);
    expect(run.skiff.shield).toBe(50); expect(s.lane).toBe(1); expect(s.desiredLane).toBe(1); expect(pillar.hp).toBe(0);
  });
  it.each([1,10,11,100,1000])('maximum pressure at level %i stays within caps', level => {
    const { ctx, sim, s } = tunnelFixture(level);
    for (let i = 0; i < 1800; i++) { s.protection = 10; sim.step(1 / 60, Math.sin(i / 60) * 3, true); }
    expect(s.entities.filter(e => e.faction === 'pirate').length).toBeLessThanOrEqual(18);
    expect(s.entities.filter(e => e.warning >= 0).length).toBeLessThanOrEqual(6);
    expect(s.shots.length).toBeLessThanOrEqual(160); expect(tunnelEncounter(level).shotSpeed).toBeLessThanOrEqual(1.35);
    expect(ctx.run.pilot.score).toBeGreaterThanOrEqual(0);
  });
});
