import { expect, it } from 'vitest';
import { addEntity, tunnelEncounter } from './encounters';
import { advanceTunnel, tunnelFixture } from './test-helpers';
import { TunnelSimulation } from './simulation';
import { parseTunnel } from './persistence';
import { laneDelta } from './shapes';

function finalEnemies(level = 1, count = 1) {
  const f = tunnelFixture(level), definition = tunnelEncounter(level);
  Object.assign(f.s, { group: definition.groups - 1, spawnIndex: definition.count, spawnDelay: 999,
    hazardDelay: 999, patrol: true, attackDelay: 0, protection: 999 });
  const enemies = Array.from({ length: count }, (_, i) => addEntity(f.ctx, 'ship', (6 + i) % 12, 18,
    { faction: 'pirate', required: true, rim: true, age: 5, grace: 0, cooldown: 0 }));
  return { ...f, enemies };
}

it.each([1, 7, 1000])('the last enemy in tunnel %i fires across lanes while pursuing the player', level => {
  const { sim, s, enemies: [enemy] } = finalEnemies(level);
  expect(sim.remainingEnemies).toBe(1);
  advanceTunnel(sim, 0.8); expect(s.shots).toHaveLength(0);
  expect(enemy.warning).toBeGreaterThan(0); expect(enemy.changing).toBeGreaterThan(0);
  advanceTunnel(sim, 0.15);
  expect(s.shots.some(shot => shot.target === -1 && shot.faction === 'pirate')).toBe(true);
  expect(Math.abs(laneDelta(enemy.lane, s.lane, sim.shape.closed))).toBeGreaterThan(1);
  advanceTunnel(sim, 5);
  expect(sim.drain().filter(event => event.type === 'fire').length).toBeGreaterThanOrEqual(4);
  expect(enemy.lane).not.toBe(6); expect(enemy.required).toBe(true);
});

it('increases each survivor\'s firing rate when only a few enemies remain', () => {
  const cooldowns = [1, 3, 8].map(count => {
    const { sim, enemies } = finalEnemies(1, count);
    sim.step(1 / 60);
    return enemies[0].cooldown;
  });
  expect(cooldowns[0]).toBeLessThan(cooldowns[1]); expect(cooldowns[1]).toBeLessThan(cooldowns[2]);
  expect(cooldowns[0]).toBeGreaterThan(0.9);
});

it('edge attacks create dodgeable bolts rather than invisible same-lane damage', () => {
  const { sim, s, run, enemies: [enemy] } = finalEnemies();
  enemy.lane = enemy.previousLane = enemy.nextLane = 0; s.protection = 0;
  advanceTunnel(sim, 0.95); expect(s.shots).toHaveLength(1); expect(run.skiff.shield).toBe(100);
  const bolt = s.shots[0]; expect(bolt.aimLane).toBe(0);
  sim.step(1 / 60, 0, false, 1); advanceTunnel(sim, 0.5);
  expect(run.skiff.shield).toBe(100); expect(bolt.aimLane).toBe(0);
});

it('edge bolts still damage a stationary player and can be intercepted', () => {
  const hit = finalEnemies(); hit.s.protection = 0;
  const enemy = hit.enemies[0]; enemy.lane = enemy.previousLane = enemy.nextLane = 0;
  advanceTunnel(hit.sim, 1.4); expect(hit.run.skiff.shield).toBe(80);
  const block = finalEnemies(); block.s.protection = 0;
  block.enemies[0].lane = block.enemies[0].previousLane = block.enemies[0].nextLane = 0;
  // Let the bolt clear the ship's collision radius before intercepting it.
  advanceTunnel(block.sim, 1.03); block.combat.fire(); advanceTunnel(block.sim, 0.05);
  expect(block.run.skiff.shield).toBe(100); expect(block.run.charge).toBe(10);
  expect(block.run.accuracy.hits).toBe(1); expect(block.run.pilot.score).toBe(10);
});

it('does not let innocent police join edge attacks', () => {
  const { sim, ctx, s, run } = finalEnemies();
  const officer = addEntity(ctx, 'ship', 3, 18, { faction: 'police', rim: true, age: 5, grace: 0, cooldown: 0 });
  advanceTunnel(sim, 0.95);
  expect(officer.rim).toBe(false);
  expect(s.shots.filter(shot => shot.faction === 'police').every(shot => shot.target !== -1)).toBe(true);
  expect(run.pilot.wanted.active).toBe(false);
});

it.each(['raider', 'flanker', 'diver', 'gunship', 'minelayer', 'carrier'] as const)('keeps %s weapons working at the edge', role => {
  const { sim, s, enemies: [enemy] } = finalEnemies(); enemy.role = role;
  advanceTunnel(sim, 0.95);
  expect(s.shots).toHaveLength(role === 'gunship' ? 3 : 1);
  expect(s.shots.every(shot => shot.target === -1 && shot.speed < 0)).toBe(true);
  expect(sim.drain().some(event => event.type === 'fire')).toBe(true);
});

it('lets wanted police shoot across lanes, but not once the warrant is cleared', () => {
  const { sim, run, s, enemies: [officer] } = finalEnemies();
  officer.faction = 'police'; run.pilot.wanted.active = true;
  advanceTunnel(sim, 0.95);
  expect(s.shots.some(shot => shot.faction === 'police' && shot.target === -1)).toBe(true);
  run.pilot.wanted.active = false; advanceTunnel(sim, 1.5);
  expect(officer.rim).toBe(false); expect(officer.depth).toBeLessThan(0);
});

it.each([1, 1000])('stays staggered and capped with eighteen edge attackers at level %i', level => {
  const { sim, s } = finalEnemies(level, 18);
  const starts: number[] = [];
  for (let i = 0; i < 600; i++) {
    sim.step(1 / 60);
    const attacks = sim.drain().filter(event => event.type === 'cue' && event.cue === 'lockOn');
    expect(attacks.length).toBeLessThanOrEqual(1);
    if (attacks.length) starts.push(i / 60);
    expect(s.entities.filter(e => e.warning >= 0).length).toBeLessThanOrEqual(6);
    expect(s.shots.length).toBeLessThanOrEqual(160);
  }
  expect(starts.length).toBeGreaterThan(8);
  expect(starts.slice(1).every((t, i) => t - starts[i] >= 0.23)).toBe(true);
});

it('resumes a warned edge attack with the same shot and cooldown', () => {
  const { sim, run, s } = finalEnemies(); advanceTunnel(sim, 0.5);
  const restoredRun = structuredClone(run); restoredRun.tunnel = parseTunnel(s, 1);
  const restored = new TunnelSimulation(restoredRun);
  advanceTunnel(sim, 0.5); advanceTunnel(restored, 0.5);
  expect(restored.state).toEqual(s); expect(s.shots).toHaveLength(1);
});
