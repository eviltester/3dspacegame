import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { actorFixture } from '../testing/actors';
import { createInvaderModel, disposeObject, edgesFromGeometry } from '../models';
import { DefensiveAftermath } from './defensive-aftermath';
import type { Actor } from '../combat/types';
import { MINE_WARNING_NAME, updateInvaderMineWarning } from './invader-mine-warning';

const cleanup: Array<() => void> = [];
afterEach(() => { for (const clear of cleanup.splice(0)) clear(); });
function backdrop(actors: Actor[], wave = 1) {
  const view = new DefensiveAftermath(actors, wave, 10);
  cleanup.push(() => { view.dispose(); actors.forEach(actor => disposeObject(actor.object)); });
  return view;
}

it('copies only surviving ships and hazards, preserving positions and faction colours', () => {
  const actors = (['pirate', 'police', 'trader', 'asteroid', 'mine', 'cargo', 'gate'] as const).map((kind, id) => {
    const actor = actorFixture({ kind, id, object: createInvaderModel('raider') });
    actor.object.position.set(id * 10, 0, -180); return actor;
  });
  actors.push(actorFixture({ dead: true }));
  const hidden = actorFixture(); hidden.object.visible = false; actors.push(hidden);
  const view = backdrop(actors);
  expect(view.root.children).toHaveLength(5);
  view.root.children.forEach((model, i) => {
    expect(model).not.toBe(actors[i].object); expect(model.position).toEqual(actors[i].object.position);
    const line = model.children[0] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    const original = actors[i].object.children[0] as typeof line;
    expect(line.geometry).not.toBe(original.geometry); expect(line.material).not.toBe(original.material);
    expect(line.material.color).toEqual(original.material.color);
  });
});

it('moves the copied fleet through changing patterns without touching actors or attack clocks', () => {
  const actors = [0, 1, 2].map(id => actorFixture({ id, age: 8, cooldown: 0.5, windup: 0.2, object: createInvaderModel('raider') }));
  const view = backdrop(actors), before = actors.map(actor => ({ ...actor, position: actor.object.position.clone(), rotation: actor.object.quaternion.clone() }));
  view.tick(0); view.tick(-1); view.tick(NaN); expect(view.root.children[0].position.length()).toBe(0);
  const positions = [];
  for (let i = 0; i < 36 * 60; i++) {
    view.tick(1 / 60);
    if (i % 720 === 719) positions.push(view.root.children.map(model => model.position.toArray()));
  }
  expect(positions[0]).not.toEqual(positions[1]); expect(positions[1]).not.toEqual(positions[2]);
  expect(new Set(view.root.children.map(model => model.position.x)).size).toBe(3);
  actors.forEach((actor, i) => {
    expect(actor.age).toBe(before[i].age); expect(actor.cooldown).toBe(before[i].cooldown); expect(actor.windup).toBe(before[i].windup);
    expect(actor.object.position).toEqual(before[i].position); expect(actor.object.quaternion.toArray()).toEqual(before[i].rotation.toArray());
  });
});

it('drifts, spins and recycles the same rocks and mines indefinitely without collisions or new actors', () => {
  const rock = actorFixture({ kind: 'asteroid', drift: new THREE.Vector3(25, 0, 65), object: edgesFromGeometry(new THREE.OctahedronGeometry(10), 0xff8dce) });
  rock.object.position.set(139, 0, 44);
  const mine = actorFixture({ kind: 'mine', drift: null }); mine.object.position.set(0, 0, -100);
  const view = backdrop([rock, mine]), ids = view.root.children.map(model => model.uuid);
  view.tick(0.5);
  expect(view.root.children[0].position.z).toBe(-430); expect(view.root.children[0].rotation.x).toBeGreaterThan(0);
  expect(view.root.children[1].position.z).toBeGreaterThan(-100);
  view.root.children[0].position.x = 150; view.tick(0.1); expect(view.root.children[0].position.x).toBe(140);
  view.tick(0.1); expect(view.root.children[0].position.x).toBeLessThan(140);
  for (let i = 0; i < 6000; i++) view.tick(1 / 60);
  expect(view.root.children.map(model => model.uuid)).toEqual(ids);
  expect(rock.object.position.toArray()).toEqual([139, 0, 44]); expect(rock.drift!.x).toBe(25);
  expect(rock.hull).toBe(40); expect(mine.dead).toBe(false);
});

it('hides stale bonus labels and disposes only the copied resources', () => {
  const line = new THREE.LineSegments(new THREE.BufferGeometry(), [new THREE.LineBasicMaterial(), new THREE.LineBasicMaterial()]);
  line.name = 'double-score';
  const actor = actorFixture(); actor.object.add(line);
  const view = backdrop([actor]), parent = new THREE.Group(); parent.add(view.root);
  const copy = view.root.children[0].children[0] as typeof line;
  const originalDisposal = vi.spyOn(line.geometry, 'dispose'), disposal = vi.spyOn(copy.geometry, 'dispose');
  const materialDisposals = copy.material.map(material => vi.spyOn(material, 'dispose'));
  expect(copy.visible).toBe(false); expect(line.visible).toBe(true);
  view.dispose(); expect(parent.children).toHaveLength(0); expect(view.root.children).toHaveLength(0);
  expect(disposal).toHaveBeenCalledOnce(); expect(materialDisposals.every(spy => spy.mock.calls.length === 1)).toBe(true);
  expect(originalDisposal).not.toHaveBeenCalled();
});

it('accepts an empty survivor list', () => {
  const view = backdrop([]); view.tick(100); expect(view.root.children).toHaveLength(0);
});

it('hides mine danger rings in the harmless game-over background', () => {
  const mine = actorFixture({ kind: 'mine' }); updateInvaderMineWarning(mine.object, 2, 60);
  const view = backdrop([mine]); view.tick(1);
  expect(view.root.getObjectByName(MINE_WARNING_NAME)?.visible).toBe(false);
  expect(mine.object.getObjectByName(MINE_WARNING_NAME)?.visible).toBe(true);
});
