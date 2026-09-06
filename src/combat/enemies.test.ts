import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { newRun } from '../arcade';
import { stageDefinition } from '../encounters';
import { ENEMY_ATTACK_WARNING } from '../endless-difficulty';
import { actorFixture } from '../testing/actors';
import { EnemySystem } from './enemies';
import type { EnemyFrame, EnemyServices } from './enemies';
import type { Actor } from './types';

function fixture(wave = 1) {
  const actors: Actor[] = [];
  const frame: EnemyFrame = { run: newRun('endless', 1), definition: stageDefinition('endless', wave), actors: () => actors,
    position: new THREE.Vector3(), previousPosition: new THREE.Vector3(), orientation: new THREE.Quaternion(), objectiveShip: null };
  const add = (overrides: Partial<Actor> = {}, x = 0, z = -180) => {
    const actor = actorFixture({ id: actors.length + 10, ...overrides });
    actor.object.position.set(x, 0, z); actor.previous.copy(actor.object.position); actor.anchor.copy(actor.object.position);
    actors.push(actor); return actor;
  };
  const services = {
    addActor: vi.fn<EnemyServices['addActor']>((kind, object, position, radius, hull, role) => {
      const actor = add({ kind, object, radius, hull, role: role ?? 'raider' }, position.x, position.z); return actor;
    }), removeActor: vi.fn<EnemyServices['removeActor']>(actor => { actor.dead = true; }), destroy: vi.fn<EnemyServices['destroy']>(actor => { actor.dead = true; }),
    damagePlayer: vi.fn<EnemyServices['damagePlayer']>(), announceArrival: vi.fn<EnemyServices['announceArrival']>(),
    spawnShot: vi.fn<EnemyServices['spawnShot']>(), enemyShoot: vi.fn<EnemyServices['enemyShoot']>(), stopped: () => false
  } satisfies EnemyServices;
  const system = new EnemySystem(services);
  const tick = (seconds = 1 / 60) => { for (let t = 0; t < seconds; t += 1 / 60) { frame.run.elapsed += 1 / 60; system.update(1 / 60, frame); } };
  return { actors, frame, add, services, system, tick };
}

describe('enemy targeting and arrival safety', () => {
  it('police never target an innocent player, but switch to them when wanted', () => {
    const { frame, add, services, tick } = fixture();
    add({ kind: 'police', faction: 'police' }); tick(3);
    expect(services.spawnShot).not.toHaveBeenCalled();
    frame.run.pilot.wanted.active = true; tick(1);
    expect(services.spawnShot).toHaveBeenCalledWith('police', 10, 0, expect.anything(), expect.anything(), expect.any(Number), 10, expect.any(Number), 4.5, 20, 1);
  });
  it.each(['police', 'trader'] as const)('%s fires at pirates while the player is clean', kind => {
    const { add, services, tick } = fixture();
    const ally = add({ kind, faction: kind }, 50), pirate = add({}, 0);
    tick(2.2);
    expect(vi.mocked(services.spawnShot).mock.calls.some(([f, source, target]) => f === kind && source === ally.id && target === pirate.id)).toBe(true);
  });
  it.each(['police', 'trader'] as const)('pirates engage nearby %s before a distant player', kind => {
    const { frame, add, services, tick } = fixture();
    frame.position.set(1000, 0, 1000); frame.previousPosition.copy(frame.position);
    const pirate = add({}, 0), ally = add({ kind, faction: kind }, 30);
    tick(2.2);
    expect(vi.mocked(services.spawnShot).mock.calls.some(([f, source, target]) => f === 'pirate' && source === pirate.id && target === ally.id)).toBe(true);
  });
  it('gives new ships arrival protection followed by a visible attack warning', () => {
    const { add, services, tick, system, frame } = fixture(); const pirate = add();
    tick(1); expect(pirate.windup).toBe(-1); expect(services.spawnShot).not.toHaveBeenCalled();
    tick(0.12); expect(pirate.windup).toBeCloseTo(ENEMY_ATTACK_WARNING - 0.05);
    expect(system.update(1 / 60, frame)).toBe(pirate);
    tick(0.6); expect(services.spawnShot).not.toHaveBeenCalled(); tick(0.2); expect(services.spawnShot).toHaveBeenCalled();
  });
  it('caps simultaneous attackers even at wave 1000', () => {
    const { add, actors, tick } = fixture(1000);
    for (let i = 0; i < 18; i++) add({ age: 2 }, i * 3);
    tick(); expect(actors.filter(a => a.windup >= 0)).toHaveLength(6);
  });
  it('announces carrier reinforcements away from the player with firing delay', () => {
    const { add, tick, services, frame } = fixture(1000);
    add({ role: 'carrier', age: 100 }, 0, -20); tick();
    expect(services.announceArrival).toHaveBeenCalledOnce();
    const child = vi.mocked(services.announceArrival).mock.calls[0][0][0];
    expect(child.object.position.distanceTo(frame.position)).toBeGreaterThanOrEqual(110);
    expect(child.cooldown).toBe(2); expect(child.age).toBe(0);
  });
  it('does not launch carriers or mines past the hostile cap', () => {
    const { add, tick, services } = fixture(1000);
    add({ role: 'carrier', age: 100 }); add({ role: 'minelayer', age: 20 });
    for (let i = 0; i < 16; i++) add(); tick();
    expect(services.addActor).not.toHaveBeenCalled();
  });
  it('keeps fixed fighter health and bounded shot speed while increasing late-wave fire', () => {
    const early = fixture(10), late = fixture(1000);
    for (const f of [early, late]) { f.add({ role: 'gunship' }); f.tick(8); }
    expect(vi.mocked(late.services.spawnShot).mock.calls.length).toBeGreaterThan(vi.mocked(early.services.spawnShot).mock.calls.length);
    expect(late.actors[0].maxHull).toBe(early.actors[0].maxHull);
    expect(vi.mocked(late.services.spawnShot).mock.calls.every(call => call[5] <= 160 * 1.35)).toBe(true);
  });
});

describe('NPC salvage', () => {
  it.each([
    ['police', 'contraband', true], ['police', 'legalCargo', false], ['police', 'weaponCore', false],
    ['trader', 'legalCargo', true], ['trader', 'contraband', false], ['pirate', 'contraband', true]
  ] as const)('%s collection of %s is %s', (kind, cargo, allowed) => {
    const { add, tick, services } = fixture();
    add({ kind, faction: kind });
    const salvage = add({ kind: 'cargo', faction: 'neutral', drop: { type: cargo, amount: 1 } }); tick();
    expect(vi.mocked(services.removeActor).mock.calls.some(([a]) => a === salvage)).toBe(allowed);
  });
  it.each(['pirate', 'trader', 'police'] as const)('%s cannot steal essential cargo', kind => {
    const { add, tick, services } = fixture();
    add({ kind, faction: kind }); add({ kind: 'cargo', faction: 'neutral', essential: true, drop: { type: 'rescuePod', amount: 1 } }); tick();
    expect(services.removeActor).not.toHaveBeenCalled();
  });
});
