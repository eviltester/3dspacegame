import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { BonusController } from './bonus';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));

it.each(['asteroids', 'canyon'] as const)('%s keeps scenery moving after death without advancing flight or accepting input', kind => {
  const course = new BonusController(kind, 42, 8, true), camera = new THREE.PerspectiveCamera();
  try {
    course.step(1 / 60, { x: 0, y: 0 }, camera);
    course.shoot(camera); course.blast(camera);
    course.finish('crash');
    const state = structuredClone(course.state), position = camera.position.clone();
    const transforms = () => {
      course.root.updateMatrixWorld(true);
      return course.root.children.map(object => object.matrixWorld.toArray());
    };
    const before = transforms(), gates = course.canyon?.gates.map(gate => gate.resolved);
    const progress = course.canyon?.progress;
    for (let i = 0; i < 60; i++) course.animateAfterDeath(1 / 60, camera);
    expect(transforms()).not.toEqual(before);
    expect(camera.position.distanceTo(position)).toBeGreaterThan(1);
    expect(course.state).toEqual(state);
    expect(course.canyon?.gates.map(gate => gate.resolved)).toEqual(gates);
    expect(course.canyon?.progress).toBe(progress);
    expect(course.shoot(camera)).toBe(false); expect(course.blast(camera)).toBe(false);
    course.step(10, { x: 999, y: 999, boost: true }, camera);
    expect(course.state).toEqual(state);
    const coast = camera.position.clone();
    course.animateAfterDeath(1, camera);
    expect(camera.position.distanceTo(coast)).toBeLessThan(coast.distanceTo(position));
  } finally { course.dispose(); }
});

it('does not animate an active course or accept invalid animation steps', () => {
  const course = new BonusController('asteroids', 42, 1, true), camera = new THREE.PerspectiveCamera();
  try {
    course.step(1 / 60, { x: 0, y: 0 }, camera);
    const position = camera.position.clone();
    course.animateAfterDeath(1, camera); expect(camera.position).toEqual(position);
    course.finish('crash');
    for (const dt of [0, -1, NaN, Infinity]) course.animateAfterDeath(dt, camera);
    expect(camera.position).toEqual(position);
  } finally { course.dispose(); }
});

it('passing patrols and their existing shots no longer collide with the destroyed skiff', () => {
  const course = new BonusController('asteroids', 42, 8, true), camera = new THREE.PerspectiveCamera();
  try {
    const traffic = course.traffic!, ship = traffic.ships[0];
    ship.active = true; ship.object.position.copy(camera.position);
    const bolt = new THREE.Group(); course.root.add(bolt);
    traffic.fire.shots.push({ kind: 'hostileBolt', object: bolt, velocity: new THREE.Vector3(0, 0, 40),
      radius: 2.4, number: 0, used: false, life: 4, color: '#ff4055' });
    course.finish('crash'); course.animateAfterDeath(1 / 60, camera);
    expect(ship.used).toBe(false); expect(ship.object.position.z).toBeGreaterThan(0);
    expect(traffic.fire.shots).toHaveLength(1); expect(bolt.position.z).toBeGreaterThan(0);
    expect(course.state.enemyShots).toBe(0); expect(course.state.flight.bulletHits).toBe(0);
  } finally { course.dispose(); }
});
