import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { AsteroidTraffic } from './asteroid-traffic';
import { bonusProfile } from './bonus-difficulty';
import { BELT_FIRE_WARNING, MAX_BELT_BOLTS } from './belt-fire';
import { disposeObject } from './models';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));
const roots: THREE.Group[] = [];
afterEach(() => { for (const root of roots) disposeObject(root); roots.length = 0; });
function setup(hostile = true) {
  const root = new THREE.Group(); roots.push(root);
  const traffic = new AsteroidTraffic(root, 42, 8, hostile);
  for (let slot = 0; slot < bonusProfile(8).asteroidRows * 2; slot++) traffic.replaceRock(slot, new THREE.Vector3(30, 0, -300));
  return { traffic, player: new THREE.Vector3() };
}
it.each(['pirate', 'police'] as const)('%s warns for at least 0.85 seconds, shoots forward, and its interceptable bolt can hit once', kind => {
  const { traffic, player } = setup(), ship = traffic.ships.find(ship => ship.kind === kind)!;
  traffic.ships.splice(0, traffic.ships.length, ship); ship.active = true;
  const fire = traffic.fire;
  expect(fire.step(0.3, 0.3, [ship], player, player).notice).toContain('LOCKING ON');
  expect(fire.shots).toHaveLength(0);
  expect(fire.step(BELT_FIRE_WARNING - 0.01, 1, [ship], player, player).shots).toBe(0);
  expect(fire.step(0.02, 1.1, [ship], player, player).shots).toBe(1);
  const bolt = fire.shots[0]; expect(bolt.velocity.z).toBeGreaterThan(0);
  expect(bolt.velocity.length()).toBeCloseTo(185 * 1.35);
  expect(traffic.contacts).toContainEqual({ position: bolt.object.position, color: kind === 'police' ? '#75caff' : '#ff4055', glyph: 'shot' });
  let hits = 0;
  for (let i = 0; i < 80; i++) hits += fire.step(1 / 60, i / 60, [], player, player).hits;
  expect(hits).toBe(1); expect(fire.shots).toHaveLength(0);
});
it('only Smuggler patrols shoot, stagger their warnings, and stop firing after passing', () => {
  const { traffic, player } = setup();
  traffic.ships.splice(2);
  for (const ship of traffic.ships) ship.object.position.z = -390;
  let shots = 0;
  for (let i = 0; i < 100; i++) shots += traffic.step(1 / 60, i / 60, player, player).shots;
  expect(shots).toBe(2); expect(traffic.ships.every(ship => ship.velocity.z > 0)).toBe(true);
  expect(traffic.contacts.some(contact => contact.glyph === 'shot')).toBe(true);
  for (const shot of traffic.fire.shots) shot.used = true;
  expect(traffic.contacts.some(contact => contact.glyph === 'shot')).toBe(false);
  for (const ship of traffic.ships) ship.object.position.z = 100;
  expect(traffic.step(1, 3, player, player).shots).toBe(0);
  const friendly = setup(false);
  for (let i = 0; i < 180; i++) expect(friendly.traffic.step(1 / 60, i / 60, player, player).shots).toBe(0);
});
it('bounds fire, lets blast clear nearby shots, and removes expired/intercepted/distant bolts', () => {
  const { traffic, player } = setup(), ship = traffic.ships[0], fire = traffic.fire;
  ship.active = true;
  fire.step(0.3, 0, [ship], player, player); fire.step(0.9, 1, [ship], player, player);
  const template = fire.shots[0]; expect(template).toBeDefined();
  fire.shots = Array.from({ length: MAX_BELT_BOLTS }, (_, index) => {
    const object = new THREE.Group(); object.position.set(index ? 500 : 0, 0, -100);
    return { ...template, object, velocity: new THREE.Vector3(), life: 100 };
  });
  fire.step(2, 3, [ship], player, player); expect(fire.step(0.9, 4, [ship], player, player).shots).toBe(0);
  fire.clear(player); expect(fire.shots[0].used).toBe(true); expect(fire.shots[1].used).toBe(false);
  fire.shots[1].life = 0; fire.shots[2].object.position.z = 100;
  fire.step(0.1, 5, [], player, player); expect(fire.shots).toHaveLength(MAX_BELT_BOLTS - 3);
});
it('does not acquire inactive, destroyed, distant or passed ships', () => {
  const { traffic, player } = setup(), ship = traffic.ships[0];
  expect(traffic.fire.step(3, 3, [ship], player, player).shots).toBe(0);
  ship.active = true; ship.used = true;
  expect(traffic.fire.step(3, 6, [ship], player, player).notice).toBe('');
  ship.used = false; ship.object.position.z = -900;
  expect(traffic.fire.step(3, 9, [ship], player, player).notice).toBe('');
  ship.object.position.z = 10;
  expect(traffic.fire.step(3, 12, [ship], player, player).notice).toBe('');
});
it('both patrol factions can warn and fire while the player approaches at late-course boosted speed', () => {
  const { traffic, player } = setup(); traffic.ships.splice(2);
  for (const ship of traffic.ships) ship.object.position.z = -600;
  const colors = new Set<string>();
  for (let tick = 0; tick < 105; tick++) {
    const previous = player.clone(); player.z -= 250 / 60;
    traffic.step(1 / 60, tick / 60, previous, player);
    for (const shot of traffic.fire.shots) colors.add(shot.color);
  }
  expect(colors).toEqual(new Set(['#ff4055', '#75caff']));
});
