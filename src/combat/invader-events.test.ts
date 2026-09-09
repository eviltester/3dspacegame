import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { newRun, rewardKill } from '../arcade';
import { stageDefinition } from '../encounters';
import { ActorWorld } from '../world/actors';
import { EnemySystem } from './enemies';
import type { EnemyFrame, EnemyServices } from './enemies';
import type { Actor } from './types';
import { invaderEscapeBonus, invaderKillValue } from './invader-bonuses';
import { hasInvaderStorm, invaderFieldDuration, isInvaderField } from '../invader-events';
import { asteroidChild } from '../asteroid-fragments';

const clean: Array<() => void> = [];
afterEach(() => { for (const clear of clean.splice(0)) clear(); });
function fixture(wave: number, seed = 123) {
  let id = 0;
  const world = new ActorWorld(new THREE.Group(), () => ++id), created: Actor[] = [], messages: string[] = [];
  const hits: number[] = [], shots: number[] = [];
  const escapeShots: Array<{ age: number; position: THREE.Vector3; direction: THREE.Vector3; speed: number }> = [];
  clean.push(() => world.clear());
  const run = newRun('invaders', seed); run.stage = wave; run.phase = 'playing';
  const frame: EnemyFrame = { run, definition: stageDefinition('invaders', wave), actors: () => world.actors,
    position: new THREE.Vector3(), previousPosition: new THREE.Vector3(), orientation: new THREE.Quaternion(), objectiveShip: null };
  const services: EnemyServices = {
    addActor: (...args) => { const actor = world.add(...args); created.push(actor); return actor; }, removeActor: actor => world.remove(actor), destroy: actor => world.remove(actor),
    damagePlayer: damage => { hits.push(damage); }, announceArrival: (_, message) => { messages.push(message); },
    spawnShot: (_, source, _target, position, direction, speed) => {
      shots.push(source);
      const escape = world.actors.find(actor => actor.id === source)?.escape;
      if (escape) escapeShots.push({ age: escape.age, position: position.clone(), direction: direction.clone(), speed });
    }, enemyShoot: () => {}, cue: () => {}, lockOn: () => {}, stopped: () => false
  };
  const controller = new EnemySystem(services);
  const add = () => world.add('pirate', new THREE.Group(), new THREE.Vector3(0, 0, -180), 8, 40);
  const tick = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) { run.elapsed += 1 / 60; controller.update(1 / 60, frame); } };
  return { world, run, frame, created, controller, tick, add, messages, hits, shots, escapeShots, services };
}

it('schedules timed fields every sixth wave and occasional separate storms', () => {
  for (let wave = 1; wave < 100; wave++) {
    expect(isInvaderField(wave)).toBe(wave % 6 === 0);
    if (isInvaderField(wave)) { expect(stageDefinition('invaders', wave).waves).toEqual([]); expect(hasInvaderStorm(wave)).toBe(false); }
  }
  expect(invaderFieldDuration(6000)).toBeGreaterThan(invaderFieldDuration(6)); expect(invaderFieldDuration(6000)).toBeLessThanOrEqual(60);
});
it('a storm releases only five spaced rocks without changing the formation roster', () => {
  const f = fixture(4); f.add(); f.tick(20);
  expect(f.created.filter(a => a.kind === 'asteroid')).toHaveLength(5);
  expect(f.messages.filter(text => text.includes('ASTEROID STORM'))).toHaveLength(1);
  const arrivals = f.created.filter(a => a.kind === 'asteroid').map(a => a.anchor.x);
  expect(new Set(arrivals.map(x => Math.round(x / 31))).size).toBe(5);
  expect(f.world.actors.filter(a => a.kind === 'pirate')).toHaveLength(1);
});
it.each([6, 12, 600, 6000])('field %i stays finite, bounded and includes moving mines and an occasional hostile visitor', wave => {
  const f = fixture(wave); let maxRocks = 0;
  for (let second = 0; second < 80; second++) { f.tick(1); maxRocks = Math.max(maxRocks, f.world.actors.filter(a => a.kind === 'asteroid').length); }
  expect(maxRocks).toBeGreaterThan(2); expect(maxRocks).toBeLessThanOrEqual(18);
  expect(f.created.some(a => a.kind === 'mine' && a.drift!.z > 0)).toBe(true);
  expect(f.created.filter(a => a.kind === 'mine').every(a => a.maxHull === 4)).toBe(true);
  expect(f.created.filter(a => a.flyby)).toHaveLength(1);
  expect(f.world.actors.filter(a => a.kind === 'asteroid' || a.kind === 'mine')).toHaveLength(0);
});
it('field layouts and movement reproduce from their seed', () => {
  const a = fixture(6), b = fixture(6), c = fixture(6, 456);
  for (const f of [a, b, c]) f.tick(4);
  const layout = (f: ReturnType<typeof fixture>) => f.created.map(a => a.object.position.toArray());
  expect(layout(a)).toEqual(layout(b)); expect(layout(a)).not.toEqual(layout(c));
});
it('large rocks split twice, inherit colour, fan sideways and grant collision grace', () => {
  const f = fixture(6); f.tick(1.1);
  const rock = f.world.actors.find(a => a.kind === 'asteroid')!;
  f.controller.splitAsteroid(rock, f.world.actors); f.world.remove(rock);
  const medium = f.world.actors.filter(a => a.kind === 'asteroid'); expect(medium).toHaveLength(2);
  for (const child of medium) { expect(child.asteroid).toMatchObject({ size: 1, color: rock.asteroid!.color, grace: 0.45 }); expect(child.radius).toBeCloseTo(rock.radius * 0.57); }
  expect(medium[0].drift!.x).toBeLessThan(0); expect(medium[1].drift!.x).toBeGreaterThan(0);
  for (const child of medium) { f.controller.splitAsteroid(child, f.world.actors); f.world.remove(child); }
  const small = f.world.actors.filter(a => a.kind === 'asteroid'); expect(small).toHaveLength(4);
  const before = f.created.length;
  for (const child of small) f.controller.splitAsteroid(child, f.world.actors);
  expect(f.created).toHaveLength(before); expect(asteroidChild(0, 4)).toBeNull();
});
it('fragment creation obeys its hard cap and fragment grace prevents immediate collision damage', () => {
  const f = fixture(6); f.tick(1.1); const rock = f.world.actors.find(a => a.kind === 'asteroid')!;
  rock.object.position.set(0, 0, 0); f.controller.splitAsteroid(rock, f.world.actors); f.world.remove(rock);
  f.tick(0.1); expect(f.hits).toEqual([]);
  const child = f.world.actors.find(a => a.kind === 'asteroid')!;
  for (let i = f.world.actors.filter(a => a.kind === 'asteroid').length; i < 63; i++) f.world.add('asteroid', new THREE.Group(), new THREE.Vector3(0, 0, -200), 4, 24);
  f.controller.splitAsteroid(child, f.world.actors);
  expect(f.world.actors.filter(a => a.kind === 'asteroid')).toHaveLength(63);
});
it('the six-second gold target doubles only its own kill score then restores normal rewards', () => {
  const f = fixture(2), aliens = [f.add(), f.add(), f.add()]; f.tick(4.1);
  const target = aliens.find(a => a.doubleUntil)!;
  expect(invaderKillValue(target, f.run.elapsed)).toBe(200);
  expect(invaderKillValue(aliens.find(a => a !== target)!, f.run.elapsed)).toBe(100);
  expect(target.object.getObjectByName('double-score')?.visible).toBe(true);
  f.tick(6.1); expect(invaderKillValue(target, f.run.elapsed)).toBe(100);
  expect(target.object.getObjectByName('double-score')?.visible).toBe(false);
  expect(f.messages.filter(text => text.includes('2X TARGET'))).toHaveLength(1);
});
it('the bonus courier is fast, unarmed, worth a bonus and never part of the required formation', () => {
  const f = fixture(2); f.add(); f.tick(6.1);
  const courier = f.created.find(a => a.flyby?.kind === 'courier')!; expect(courier).toBeDefined();
  expect(invaderKillValue(courier, f.run.elapsed)).toBe(3000); expect(courier.formationSlot).toBeUndefined();
  f.tick(7); expect(courier.dead).toBe(true); expect(f.shots).not.toContain(courier.id);
});

it.each([[2, 'courier', 3000], [3, 'police', 1000], [5, 'pirate', 2000]] as const)('wave %i %s flyby pays %i before the kill-chain multiplier', (wave, kind, base) => {
  const f = fixture(wave); f.add(); f.tick(6.1);
  const visitor = f.created.find(actor => actor.flyby?.kind === kind)!;
  expect(invaderKillValue(visitor, f.run.elapsed)).toBe(base);
  f.run.chain.multiplier = 5;
  expect(rewardKill(f.run, invaderKillValue(visitor, f.run.elapsed))).toBe(base * 5);
  expect(f.run.pilot.score).toBe(base * 5);
  const ordinary = f.add(); ordinary.role = 'carrier';
  expect(invaderKillValue(ordinary, f.run.elapsed)).toBe(500);
});
it('the last alien waits for the full roster, warns, dashes and leaves without being killed', () => {
  const f = fixture(1), alien = f.add(); f.tick(4); expect(alien.escape).toBeUndefined();
  f.frame.flightsFinished = true; f.tick(3.1); expect(alien.escape).toBeDefined();
  const warnedPosition = alien.object.position.clone(); f.tick(0.6); expect(alien.object.position).toEqual(warnedPosition);
  expect(invaderEscapeBonus(alien)).toBe(0);
  f.tick(1); expect(alien.object.position).not.toEqual(warnedPosition);
  expect(invaderEscapeBonus(alien)).toBe(500);
  f.tick(3); expect(alien.dead).toBe(true); expect(f.messages).toContain('LAST ALIEN ESCAPING - LAST CHANCE!');
  expect(invaderEscapeBonus(alien)).toBe(0);
});

function shotDestination(shot: { position: THREE.Vector3; direction: THREE.Vector3 }): number {
  return shot.position.x - shot.direction.x * shot.position.z / shot.direction.z;
}

it('warns, tracks the player with three rapid shots, then scatters continuously until departure', () => {
  const f = fixture(1), alien = f.add(); f.frame.flightsFinished = true;
  const sound = vi.spyOn(f.services, 'enemyShoot'); alien.cooldown = 60; alien.firingVoice = 'invaderDiver';
  f.tick(3.1); expect(alien.escape).toBeDefined();
  expect(alien.windup).toBeGreaterThan(0); f.tick(0.7); expect(f.escapeShots).toHaveLength(0);
  sound.mockClear();
  for (const x of [-60, 20, 60]) {
    f.frame.position.x = x;
    const before = f.escapeShots.length;
    for (let tick = 0; tick < 20 && f.escapeShots.length === before; tick++) f.tick(1 / 60);
    expect(f.escapeShots).toHaveLength(before + 1);
    expect(shotDestination(f.escapeShots.at(-1)!)).toBeCloseTo(x);
  }
  f.tick(4);
  expect(alien.dead).toBe(true); expect(f.escapeShots.length).toBeGreaterThanOrEqual(15);
  expect(f.escapeShots[0].age).toBeGreaterThanOrEqual(0.9);
  expect(f.escapeShots.at(-1)!.age).toBeGreaterThan(4.15);
  expect(f.escapeShots.at(-1)!.age).toBeLessThan(4.4);
  for (let i = 1; i < f.escapeShots.length; i++) expect(f.escapeShots[i].age - f.escapeShots[i - 1].age).toBeLessThanOrEqual(0.24);
  const scatter = f.escapeShots.slice(3).map(shotDestination);
  expect(scatter.every(x => Math.abs(x) <= 76)).toBe(true);
  expect(new Set(scatter.map(x => Math.round(x / 10))).size).toBeGreaterThan(5);
  expect(sound).toHaveBeenCalledTimes(f.escapeShots.length);
  expect(sound).toHaveBeenLastCalledWith('invaderDiver', expect.any(Number));
  const count = f.escapeShots.length; f.tick(5); expect(f.escapeShots).toHaveLength(count);
});

it.each([1, 10, 1000])('escape fire at wave %i remains rapid, bounded and reproducible', wave => {
  const a = fixture(wave), b = fixture(wave), c = fixture(wave, 456);
  for (const f of [a, b, c]) { f.add().cooldown = 60; f.frame.flightsFinished = true; f.tick(7.5); }
  expect(a.escapeShots).toEqual(b.escapeShots); expect(a.escapeShots).not.toEqual(c.escapeShots);
  expect(a.escapeShots.length).toBeGreaterThanOrEqual(15);
  for (let i = 1; i < a.escapeShots.length; i++) {
    const gap = a.escapeShots[i].age - a.escapeShots[i - 1].age;
    expect(gap).toBeGreaterThanOrEqual(0.14 - 1e-6); expect(gap).toBeLessThanOrEqual(0.24);
  }
  expect(a.escapeShots.every(shot => shot.speed <= 216)).toBe(true);
});

it('escape fire freezes outside active play and stops immediately if the alien is killed', () => {
  const f = fixture(1), alien = f.add(); f.frame.flightsFinished = true; f.tick(4.3);
  const age = alien.escape!.age, count = f.escapeShots.length; expect(count).toBeGreaterThan(0);
  f.controller.update(0, f.frame); expect(f.escapeShots).toHaveLength(count);
  f.run.phase = 'recovery'; f.tick(5);
  expect(alien.escape!.age).toBe(age); expect(f.escapeShots).toHaveLength(count);
  f.run.phase = 'playing'; f.tick(0.3); expect(f.escapeShots.length).toBeGreaterThan(count);
  const final = f.escapeShots.length; f.world.remove(alien); f.tick(5); expect(f.escapeShots).toHaveLength(final);
});

it('waits for an attacker slot before starting the escape barrage', () => {
  const f = fixture(1), alien = f.add(); alien.cooldown = 60; f.frame.flightsFinished = true;
  f.frame.definition.attackerCap = 0; f.tick(3.1);
  expect(alien.escape).toBeUndefined(); expect(f.escapeShots).toHaveLength(0);
  f.frame.definition.attackerCap = 1; f.tick(0.1);
  expect(alien.escape).toBeDefined(); expect(alien.windup).toBeGreaterThan(0);
});
