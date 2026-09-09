import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { newRun } from '../arcade';
import { Random, stageDefinition } from '../encounters';
import { ActorWorld } from './actors';
import { WorldInteractions } from './interactions';
import { invaderDistance, INVADER_CLEARANCE } from '../invader-formation';
import { invaderFighterShots, invaderSpreadLimit } from '../invaders';

vi.mock('../models', async original => ({ ...await original<typeof import('../models')>(), createGateModel: () => new THREE.Group() }));

function fixture(stage = 1) {
  const world = new THREE.Group(); let id = 1;
  const actors = new ActorWorld(world, () => id++), run = newRun('journey', 12);
  run.stage = stage; const definition = stageDefinition(run.mode, stage);
  const level = actors.createLevel(run, definition);
  const frame = { run, definition, position: new THREE.Vector3(), orientation: new THREE.Quaternion(), base: level.base };
  const events = { collected: vi.fn(), traded: vi.fn(), warning: vi.fn() };
  const interactions = new WorldInteractions(actors, events);
  return { actors, world, run, definition, level, frame, events, interactions };
}

it.each([1, 2, 3, 6, 9, 99])('builds and clears stage %s without retaining actors or GPU objects', stage => {
  const { actors, world, level } = fixture(stage);
  expect(level.gate.object.visible).toBe(false);
  if (stage === 2) expect(level.objectivePod?.essential).toBe(true);
  if (stage === 3) expect(level.armadaRig?.root.parent).toBe(world);
  if (stage === 6 || stage === 9) expect(level.objectiveShip?.essential).toBe(true);
  actors.clear(); actors.clear(); expect(actors.actors).toHaveLength(0); expect(world.children).toHaveLength(0);
});
it('reproduces enemy positions and attaches separately breakable carrier systems', () => {
  const a = fixture(4), b = fixture(4);
  for (const f of [a, b]) f.actors.spawnPack(['carrier', 'flanker'], { ...f.frame, rng: new Random(7) });
  expect(a.actors.actors.map(x => x.object.position.toArray())).toEqual(b.actors.actors.map(x => x.object.position.toArray()));
  const carrier = a.actors.actors.find(x => x.role === 'carrier')!;
  expect(carrier.essential).toBe(true); expect(a.actors.actors.filter(x => x.parent === carrier.id)).toHaveLength(a.definition.bossParts);
  a.actors.clear(); b.actors.clear();
});
it('assigns distinct voices to haulers, saucers, police, boss guns and alien models at creation', () => {
  const f = fixture(6);
  expect(f.level.objectiveShip?.firingVoice).toBe('trader');
  expect(f.actors.actors.find(actor => actor.kind === 'trader' && !actor.essential)?.firingVoice).toBe('saucer');
  expect(f.actors.actors.find(actor => actor.kind === 'police')?.firingVoice).toBe('police');
  f.run.mode = 'invaders';
  const aliens = f.actors.spawnPack(['raider', 'flanker', 'diver'], { ...f.frame, rng: new Random(1) });
  expect(aliens.map(actor => actor.firingVoice)).toEqual(['invaderRaider', 'invaderFlanker', 'invaderDiver']);
  f.actors.clear();
  const boss = fixture(4);
  boss.actors.spawnPack(['carrier'], { ...boss.frame, rng: new Random(1) });
  expect(boss.actors.actors.filter(actor => actor.kind === 'part').every(actor => actor.firingVoice === 'carrierTurret')).toBe(true);
  boss.actors.clear();
});
it('collects magnet salvage once, including an actual weapon improvement', () => {
  const { actors, interactions, frame, run, events } = fixture();
  const core = actors.cargo({ type: 'weaponCore', amount: 1 }, new THREE.Vector3(15, 0, 0), true);
  interactions.collect(0.1, frame); interactions.collect(0.1, frame);
  expect(core.dead).toBe(true); expect(run.tiers.pulse).toBe(2); expect(events.collected).toHaveBeenCalledExactlyOnceWith(core.drop, true);
});

it('assigns unique invader slots across partial reinforcement packs and reuses only vacated slots', () => {
  const world = new THREE.Group(); let id = 1;
  const actors = new ActorWorld(world, () => id++), run = newRun('invaders', 12);
  const frame = { run, definition: stageDefinition('invaders', 12), position: new THREE.Vector3(), orientation: new THREE.Quaternion(), rng: new Random(7) };
  for (let group = 0; group < 6; group++) actors.spawnPack(['raider', 'flanker', 'diver'], frame);
  expect(actors.actors).toHaveLength(18);
  expect(new Set(actors.actors.map(actor => actor.formationSlot)).size).toBe(18);
  const survivors = actors.actors.filter(actor => actor.formationSlot! % 3 !== 0);
  for (const actor of [...actors.actors]) if (!survivors.includes(actor)) actors.remove(actor);
  const before = survivors.map(actor => ({ slot: actor.formationSlot, position: actor.object.position.clone() }));
  for (let group = 0; group < 2; group++) actors.spawnPack(['diver', 'raider', 'flanker'], frame);
  expect(actors.actors).toHaveLength(18);
  expect(new Set(actors.actors.map(actor => actor.formationSlot)).size).toBe(18);
  expect(survivors.map(actor => ({ slot: actor.formationSlot, position: actor.object.position }))).toEqual(before);
  for (let i = 0; i < 18; i++) for (let j = i + 1; j < 18; j++) {
    expect(invaderDistance(actors.actors[i].object.position, actors.actors[j].object.position)).toBeGreaterThanOrEqual(INVADER_CLEARANCE);
  }
  expect(actors.spawnPack(['raider'], frame)).toHaveLength(0);
  expect(actors.actors).toHaveLength(18);
  actors.clear();
});
it('requires deliberate contraband contact, while armada salvage moves toward the lane', () => {
  const { actors, interactions, frame } = fixture(3);
  const illegal = actors.cargo({ type: 'contraband', amount: 1 }, new THREE.Vector3(15, 0, 0));
  const drifting = actors.cargo({ type: 'credits', amount: 10 }, new THREE.Vector3(20, 0, -80), false, true);
  interactions.collect(0.1, frame); expect(illegal.object.position.x).toBe(15); expect(illegal.dead).toBe(false);
  expect(drifting.object.position.z).toBeGreaterThan(-80);
  frame.position.x = 15; interactions.collect(0.1, frame); expect(illegal.dead).toBe(true);
});

it.each([13, 19, 25, 43, 1000])('wave %i reinforcement packs share one spread budget across the live formation', wave => {
  let id = 0;
  const actors = new ActorWorld(new THREE.Group(), () => ++id), run = newRun('invaders', 12); run.stage = wave;
  const definition = stageDefinition('invaders', wave);
  const frame = { run, definition, position: new THREE.Vector3(), orientation: new THREE.Quaternion(), rng: new Random(7) };
  const spreaders = () => actors.actors.filter(actor => invaderFighterShots(wave, actor.formationSlot!) === 3);
  for (const pack of definition.waves) {
    actors.spawnPack(pack.enemies, frame);
    expect(spreaders().length).toBeLessThanOrEqual(invaderSpreadLimit(wave));
  }
  expect(actors.actors).toHaveLength(18); expect(spreaders()).toHaveLength(invaderSpreadLimit(wave));
  const removed = spreaders()[0]; actors.remove(removed);
  expect(spreaders()).toHaveLength(invaderSpreadLimit(wave) - 1);
  const [replacement] = actors.spawnPack(['diver', 'raider', 'flanker'], frame);
  expect(replacement.formationSlot).toBe(removed.formationSlot);
  expect(spreaders()).toHaveLength(invaderSpreadLimit(wave)); expect(actors.actors).toHaveLength(18);
  actors.clear();
});
it('trades and delivers rescue cargo once at the station', () => {
  const { interactions, frame, run, events } = fixture(2);
  run.pilot.inventory.legalCargo = 2; run.pilot.inventory.rescuePods = 1; frame.position.copy(frame.base.object.position);
  expect(interactions.collect(0.1, frame)).toBe(true); const credits = run.pilot.credits;
  expect(credits).toBeGreaterThan(0); expect(interactions.collect(0.1, frame)).toBe(false);
  expect(run.pilot.credits).toBe(credits); expect(events.traded).toHaveBeenCalledOnce();
});
it('dispatches one reinforcement group for a warrant, then resets for the next stage', () => {
  const { interactions, frame, actors, events } = fixture(); frame.run.pilot.wanted.active = true;
  const police = () => actors.actors.filter(a => a.kind === 'police').length;
  interactions.enforce(7, frame); expect(police()).toBe(1);
  interactions.enforce(1, frame); expect(police()).toBe(4); interactions.enforce(20, frame); expect(police()).toBe(4);
  expect(events.warning).toHaveBeenCalledExactlyOnceWith('POLICE DISPATCHED FROM NEAREST STATION', 'policeDispatch');
  interactions.reset(); interactions.enforce(8, frame); expect(police()).toBe(7);
});
it('confiscates contraband only after a lawful scan delay', () => {
  const { interactions, frame, events } = fixture(); frame.position.copy(frame.base.object.position);
  frame.run.pilot.inventory.contraband = 1; frame.run.pilot.credits = 500;
  interactions.enforce(4, frame); expect(frame.run.pilot.inventory.contraband).toBe(1);
  interactions.enforce(1, frame); expect(frame.run.pilot.inventory.contraband).toBe(0); expect(frame.run.pilot.wanted.active).toBe(false);
  expect(events.warning).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'policeScan');
});
it('pushes the player outside solid landmarks and limits collision speed, but never blocks armada lanes', () => {
  const { interactions, frame } = fixture(); frame.position.copy(frame.base.object.position);
  expect(interactions.collide(frame, -90)).toBe(-20);
  expect(frame.position.distanceTo(frame.base.object.position)).toBeCloseTo(frame.base.radius + 4);
  frame.definition = stageDefinition('journey', 3); frame.position.copy(frame.base.object.position);
  expect(interactions.collide(frame, 100)).toBe(100); expect(frame.position.equals(frame.base.object.position)).toBe(true);
});
