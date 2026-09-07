import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { Random } from '../encounters';
import { createPirateModel, createTraderHaulerModel } from '../models/ships';
import { disposeObject } from '../models/primitives';
import { actorFixture } from '../testing/actors';
import { EffectsSystem } from './effects';
import { ShipExplosions, MAX_HULL_FRAGMENTS, MAX_FRAGMENT_BURSTS } from './ship-explosions';
import type { HullPanel } from './ship-panels';

it('spins and scatters panels before staggered secondary bursts at their displaced positions', () => {
  const world = new THREE.Group(), onBurst = vi.fn(), effects = new ShipExplosions(world, onBurst);
  const ship = createPirateModel(); ship.position.set(0, 0, -200);
  effects.explode(ship); expect(effects.snapshot).toEqual({ panels: 4, bursts: 0 });
  const panel = world.children[0] as HullPanel, start = panel.position.clone();
  const dispose = vi.spyOn(panel.geometry, 'dispose'), disposeMaterial = vi.spyOn(panel.material, 'dispose');
  effects.update(0.3);
  expect(panel.position.distanceTo(start)).toBeGreaterThan(5);
  expect(panel.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.5);
  expect(onBurst).not.toHaveBeenCalled();
  effects.update(0.5);
  expect(effects.snapshot.panels).toBeGreaterThan(0); expect(effects.snapshot.panels).toBeLessThan(4);
  expect(effects.snapshot.bursts).toBeGreaterThan(0);
  const burst = world.children.find(child => child.name === 'fragment-burst') as HullPanel;
  expect(burst.geometry.getAttribute('position').count).toBe(48);
  expect(burst.material.vertexColors).toBe(true);
  expect(dispose).toHaveBeenCalledOnce(); expect(disposeMaterial).toHaveBeenCalledOnce();
  const scale = burst.scale.x; effects.update(0.1);
  expect(burst.scale.x).toBeGreaterThan(scale); expect(burst.material.opacity).toBe(1);
  effects.update(0.35); expect(burst.material.opacity).toBeLessThan(1);
  for (let i = 0; i < 90; i++) effects.update(1 / 60);
  expect(onBurst).toHaveBeenCalledTimes(4);
  expect(effects.count).toBe(0); expect(world.children).toHaveLength(0);
  expect(dispose).toHaveBeenCalledOnce(); disposeObject(ship);
});

it('caps simultaneous panels and one-draw-call showers during mass kills', () => {
  const world = new THREE.Group(), effects = new ShipExplosions(world), ship = createTraderHaulerModel();
  for (let i = 0; i < 18; i++) effects.explode(ship);
  expect(effects.snapshot.panels).toBe(MAX_HULL_FRAGMENTS);
  const initial = world.children.length; effects.explode(ship); expect(world.children).toHaveLength(initial);
  effects.update(1.3); expect(effects.snapshot).toEqual({ panels: 0, bursts: MAX_FRAGMENT_BURSTS });
  for (let i = 0; i < 18; i++) effects.explode(ship);
  effects.update(0.1);
  expect(effects.count).toBeLessThanOrEqual(MAX_HULL_FRAGMENTS + MAX_FRAGMENT_BURSTS);
  effects.clear(); expect(world.children).toHaveLength(0); disposeObject(ship);
});

it('clears all resources and pending sounds when leaving a stage', () => {
  const world = new THREE.Group(), onBurst = vi.fn(), effects = new ShipExplosions(world, onBurst), ship = createPirateModel();
  effects.explode(ship); effects.update(0.8);
  const resources = (world.children as HullPanel[]).flatMap(object => [vi.spyOn(object.geometry, 'dispose'), vi.spyOn(object.material, 'dispose')]);
  const sounds = onBurst.mock.calls.length;
  effects.clear(); effects.clear(); effects.update(5);
  expect(effects.snapshot).toEqual({ panels: 0, bursts: 0 }); expect(world.children).toHaveLength(0);
  expect(onBurst).toHaveBeenCalledTimes(sounds);
  resources.forEach(dispose => expect(dispose).toHaveBeenCalledOnce()); disposeObject(ship);
});

it('does not advance fuse timers or secondary sound callbacks while simulation is paused', () => {
  vi.useFakeTimers();
  try {
    const world = new THREE.Group(), onBurst = vi.fn(), effects = new ShipExplosions(world, onBurst), ship = createPirateModel();
    effects.explode(ship); effects.update(0.3);
    const snapshot = effects.snapshot, positions = world.children.map(object => object.position.toArray());
    vi.advanceTimersByTime(30000);
    expect(effects.snapshot).toEqual(snapshot); expect(world.children.map(object => object.position.toArray())).toEqual(positions);
    expect(onBurst).not.toHaveBeenCalled();
    effects.update(0.5); expect(onBurst).toHaveBeenCalled();
    expect(effects.snapshot.bursts).toBeGreaterThan(0); effects.clear(); disposeObject(ship);
  } finally { vi.useRealTimers(); }
});

it('is independent of gameplay randomness, IDs and source-model disposal', () => {
  const rng = new Random(123), world = new THREE.Group(), world2 = new THREE.Group();
  const first = new EffectsSystem(world, () => rng), second = new EffectsSystem(world2, () => rng);
  const ship = createPirateModel(), originalState = rng.state;
  first.explodeShip(actorFixture({ object: ship })); second.explodeShip(actorFixture({ object: ship, id: 999 }));
  disposeObject(ship);
  first.update(0.3); second.update(0.3);
  const states = (group: THREE.Group) => group.children.map(object => ({ p: object.position.toArray(), q: object.quaternion.toArray() }));
  expect(states(world)).toEqual(states(world2)); expect(rng.state).toBe(originalState);
  first.clear(); second.clear(); expect(world.children).toHaveLength(0);
});
