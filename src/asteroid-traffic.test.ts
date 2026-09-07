import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { AsteroidTraffic, asteroidTrafficCount, MAX_BELT_TRAFFIC } from './asteroid-traffic';
import { BonusController } from './bonus';
import { bonusProfile } from './bonus-difficulty';
import { disposeObject } from './models/primitives';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));

function traffic(level = 8) {
  const root = new THREE.Group(), traffic = new AsteroidTraffic(root, 42, level);
  for (let slot = 0; slot < bonusProfile(level).asteroidRows * 2; slot++) traffic.replaceRock(slot, new THREE.Vector3(25, 0, -200 - slot * 20));
  return { root, traffic, dispose: () => disposeObject(root) };
}
it('replaces an increasing minority of later rocks with equal numbers of pirates and police', () => {
  expect([1, 2, 3, 4, 5, 6, 7, 8].map(asteroidTrafficCount)).toEqual([0, 0, 4, 6, 8, 10, 12, 14]);
  for (const level of [1, 3, 8]) {
    const a = traffic(level), b = traffic(level);
    expect(a.traffic.ships).toHaveLength(asteroidTrafficCount(level));
    expect(a.traffic.snapshot).toEqual(b.traffic.snapshot);
    expect(a.traffic.ships.filter(ship => ship.kind === 'police')).toHaveLength(asteroidTrafficCount(level) / 2);
    a.dispose(); b.dispose();
  }
});
it('waits at range, announces arrivals, limits active traffic and only flies nose-first toward the player', () => {
  const { traffic: belt, dispose } = traffic(); const player = new THREE.Vector3();
  for (const ship of belt.ships) ship.object.position.z -= 1000;
  belt.step(0, 0, player, player); expect(belt.ships.every(ship => !ship.active)).toBe(true);
  for (const [i, ship] of belt.ships.entries()) { ship.object.position.set(25, i % 2 ? 20 : -20, -500); ship.previous.copy(ship.object.position); }
  expect(belt.step(0, 0, player, player).notice).toContain('APPROACHING');
  expect(belt.ships.filter(ship => ship.active)).toHaveLength(MAX_BELT_TRAFFIC);
  const ship = belt.ships[0], start = ship.object.position.z;
  belt.step(1, 1, player, player);
  expect(ship.object.position.z - start).toBe(ship.velocity.z); expect(ship.velocity.z).toBeGreaterThan(23);
  const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.object.quaternion);
  expect(nose.dot(ship.velocity.clone().normalize())).toBeCloseTo(1); expect(nose.z).toBeGreaterThan(0);
  ship.object.position.z = 50;
  belt.step(0.1, 1.1, player, player); expect(ship.used).toBe(true); expect(ship.object.visible).toBe(false);
  const passed = ship.object.position.clone(); belt.step(1, 2.1, player, player); expect(ship.object.position.equals(passed)).toBe(true);
  expect(belt.contacts).toHaveLength(belt.ships.length - 1); expect(belt.contacts.some(contact => contact.color === '#75caff')).toBe(true);
  dispose();
});
it.each(['pirate', 'police'] as const)('%s collisions are swept, count once and do not turn back after passing', kind => {
  const { traffic: belt, dispose } = traffic(), ship = belt.ships.find(ship => ship.kind === kind)!;
  belt.ships.splice(0, belt.ships.length, ship); ship.object.position.set(0, 0, -20); ship.homeX = 0;
  const before = new THREE.Vector3(), after = new THREE.Vector3(0, 0, -40);
  expect(belt.step(0.5, 0.5, before, after).impacts).toBe(1);
  expect(ship.used).toBe(true); expect(belt.step(1, 1.5, after, after).impacts).toBe(0); dispose();
});
it('higher difficulty increases approach speed, with stable repeatable steering', () => {
  const slow = traffic(3), fast = traffic(8), repeat = traffic(8), player = new THREE.Vector3();
  for (const field of [slow, fast, repeat]) {
    field.traffic.ships[0].object.position.set(25, 0, -300);
    for (let i = 0; i < 60; i++) field.traffic.step(1 / 60, i / 60, player, player);
  }
  expect(fast.traffic.ships[0].velocity.z).toBeGreaterThan(slow.traffic.ships[0].velocity.z);
  expect(fast.traffic.snapshot).toEqual(repeat.traffic.snapshot); slow.dispose(); fast.dispose(); repeat.dispose();
});
it('destroyed ships shed hull panels once, then particles, without leaving collision bodies', () => {
  const { traffic: belt, root, dispose } = traffic(), ship = belt.ships[0];
  const count = root.children.length;
  belt.destroy(ship); const explodedCount = root.children.length;
  expect(explodedCount).toBeGreaterThan(count); expect(ship.used).toBe(true);
  belt.destroy(ship); expect(root.children.length).toBe(explodedCount);
  const player = new THREE.Vector3(0, 0, 1000);
  belt.step(2, 2, player, player); expect(root.children.some(child => child.name === 'fragment-burst')).toBe(true);
  belt.step(1, 3, player, player); expect(root.children.length).toBe(count); dispose();
});
it.each(['pulse', 'spread', 'lance', 'blast'] as const)('%s destroys pirates once, does not split ships, and protects police', weapon => {
  const course = new BonusController('asteroids', 42, 8), camera = new THREE.PerspectiveCamera();
  for (const child of course.root.children) child.position.set(1000, 1000, -1000);
  const police = course.traffic!.ships.find(ship => ship.kind === 'police')!, pirate = course.traffic!.ships[0];
  police.object.position.set(0, 0, -50); pirate.object.position.set(0, 0, -120);
  const action = () => weapon === 'blast' ? course.blast(camera) : course.shoot(camera);
  if (weapon !== 'blast') course.state.family = weapon;
  expect(action()).toBe(true); expect(pirate.used).toBe(true); expect(police.used).toBe(false); expect(police.object.visible).toBe(true);
  expect(course.state.fractures).toBe(0); expect(course.state.points).toBe(1); expect(course.repairs.drops).toHaveLength(0);
  action(); expect(course.state.points).toBe(1); course.dispose();
});
it('traffic participates in actual course damage and pauses with the finished course', () => {
  const course = new BonusController('asteroids', 42, 8), camera = new THREE.PerspectiveCamera();
  for (const child of course.root.children) child.position.set(1000, 1000, -1000);
  const ship = course.traffic!.ships[0]; ship.object.position.set(0, 0, -5); ship.homeX = 0;
  course.step(1 / 60, { x: 0, y: 0 }, camera); expect(course.state.health).toBe(2); expect(ship.used).toBe(true);
  const snapshot = course.asteroidRun!.ships; course.finish('exit'); course.step(1, { x: 0, y: 0 }, camera);
  expect(course.asteroidRun!.ships).toEqual(snapshot); course.dispose();
});
