import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { newRun } from '../arcade';
import type { GameMode } from '../arcade';
import { invaderFireTiming } from './invader-fire';
import { stageDefinition } from '../encounters';
import { ENEMY_ATTACK_WARNING } from '../endless-difficulty';
import { actorFixture } from '../testing/actors';
import { EnemySystem } from './enemies';
import type { EnemyFrame, EnemyServices } from './enemies';
import type { Actor } from './types';
import { invaderDistance, INVADER_CLEARANCE } from '../invader-formation';
import { invaderHome } from '../invader-patterns';
import { invaderSpreadLimit } from '../invaders';

function fixture(wave = 1, mode: GameMode = 'endless') {
  const actors: Actor[] = [];
  const frame: EnemyFrame = { run: newRun(mode, 1), definition: stageDefinition(mode, wave), actors: () => actors,
    position: new THREE.Vector3(), previousPosition: new THREE.Vector3(), orientation: new THREE.Quaternion(), objectiveShip: null };
  frame.run.stage = wave;
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
    spawnShot: vi.fn<EnemyServices['spawnShot']>(), enemyShoot: vi.fn<EnemyServices['enemyShoot']>(), cue: vi.fn(), lockOn: vi.fn(), stopped: () => false
  } satisfies EnemyServices;
  const system = new EnemySystem(services);
  const tick = (seconds = 1 / 60) => { for (let t = 0; t < seconds; t += 1 / 60) { frame.run.elapsed += 1 / 60; system.update(1 / 60, frame); } };
  return { actors, frame, add, services, system, tick };
}

describe('enemy targeting and arrival safety', () => {
  it.each(['raider', 'flanker', 'diver', 'gunship', 'minelayer', 'carrier'] as const)('%s sends its own firing identity after one player lock-on warning', role => {
    const { add, services, tick } = fixture();
    add({ role }); tick(2);
    expect(services.lockOn).toHaveBeenCalledOnce();
    expect(services.enemyShoot).toHaveBeenCalledWith(role === 'raider' ? 'pirate' : role, expect.any(Number));
  });
  it('does not play player lock-on warnings when ships target each other', () => {
    const { frame, add, services, tick } = fixture();
    frame.position.set(1000, 0, 1000); frame.previousPosition.copy(frame.position);
    add({}, 0); add({ kind: 'trader', faction: 'trader', firingVoice: 'saucer' }, 30); tick(2.2);
    expect(services.enemyShoot).toHaveBeenCalledWith('saucer', expect.any(Number));
    expect(services.lockOn).not.toHaveBeenCalled();
  });
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

describe('Defensive Position attack scheduling', () => {
  it.each([1, 13, 19, 25, 43, 1000])('wave %i equips only its limited spread slots, not the whole fleet', wave => {
    const f = fixture(wave, 'invaders');
    const aliens = Array.from({ length: 18 }, (_, slot) => f.add({
      formationSlot: slot, role: (['raider', 'flanker', 'diver'] as const)[slot % 3], age: 2, windup: 0.001
    }, slot * 2));
    // Complete already-warned volleys together to inspect each weapon. Separate
    // scheduler tests verify these windups are staggered during normal gameplay.
    f.tick();
    const counts = aliens.map(actor => f.services.spawnShot.mock.calls.filter(call => call[1] === actor.id).length);
    expect(counts.filter(count => count === 3)).toHaveLength(invaderSpreadLimit(wave));
    expect(counts.filter(count => count === 1)).toHaveLength(18 - invaderSpreadLimit(wave));
  });
  it('keeps a spread-equipped alien on single-shot cover fire', () => {
    const f = fixture(13, 'invaders');
    f.add({ formationSlot: 0, age: 2, windup: 0.001, coverFire: true });
    f.tick(); expect(f.services.spawnShot).toHaveBeenCalledOnce();
  });
  it('does not promote survivors after a spread alien dies; only a replacement reuses its slot', () => {
    const f = fixture(13, 'invaders');
    const spreader = f.add({ age: 2, windup: 0.001 }), survivor = f.add({ age: 2, windup: 0.001 }, 30);
    f.tick(); expect(spreader.formationSlot).toBe(0); expect(survivor.formationSlot).toBe(1);
    spreader.dead = true; survivor.windup = 0.001; f.services.spawnShot.mockClear();
    f.tick(); expect(f.services.spawnShot).toHaveBeenCalledOnce(); expect(survivor.formationSlot).toBe(1);
    const replacement = f.add({ age: 2, windup: 0.001 }); f.services.spawnShot.mockClear();
    f.tick(); expect(replacement.formationSlot).toBe(0); expect(survivor.formationSlot).toBe(1);
    expect(f.services.spawnShot.mock.calls.filter(call => call[1] === replacement.id)).toHaveLength(3);
  });
  it('moves the whole fleet before firing and preserves previous positions for swept hits', () => {
    const { add, actors, frame, system, services } = fixture(4, 'invaders');
    for (let slot = 0; slot < 18; slot++) {
      const position = invaderHome(slot);
      add({ formationSlot: slot, age: 2, windup: slot === 0 ? 0.001 : -1 }, position.x, position.z);
    }
    const before = actors.map(actor => actor.object.position.clone());
    frame.run.elapsed = 4;
    services.spawnShot.mockImplementation((_faction, source, _target, position, direction) => {
      const actor = actors.find(actor => actor.id === source)!;
      expect(position.clone().addScaledVector(direction, -actor.radius - 5)).toEqual(actor.object.position);
      expect(actors.every(actor => !actor.object.position.equals(before[actors.indexOf(actor)]))).toBe(true);
    });
    system.update(1 / 60, frame);
    expect(services.spawnShot).toHaveBeenCalled();
    expect(actors.map(actor => actor.previous)).toEqual(before);
    for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
      expect(invaderDistance(actors[i].object.position, actors[j].object.position)).toBeGreaterThanOrEqual(INVADER_CLEARANCE - 0.01);
    }
  });
  function simulate(wave: number, count: number) {
    const f = fixture(wave, 'invaders');
    const shots: Array<{ source: number; time: number; cover: boolean }> = [];
    f.services.spawnShot.mockImplementation((_faction, source) => {
      const actor = f.actors.find(item => item.id === source)!;
      if (!actor.flyby) shots.push({ source, time: f.frame.run.elapsed, cover: !!actor.coverFire });
    });
    for (let i = 0; i < count; i++) f.add({ cooldown: 1.1 + i * 0.25 }, (i % 6 - 2.5) * 22, -165 - Math.floor(i / 6) * 60);
    let warned = 0;
    for (let tick = 0; tick < 1800; tick++) {
      f.tick(); warned = Math.max(warned, f.actors.filter(a => a.windup >= 0).length);
    }
    return { ...f, shots, warned };
  }
  it.each([1, 12, 1000])('wave %i adds cover pairs while staggering aimed shots and preserving individual recovery', wave => {
    const { shots, warned, frame } = simulate(wave, 18);
    const turns = shots.filter((shot, i) => i === 0 || shot.source !== shots[i - 1].source || shot.time !== shots[i - 1].time);
    const timing = invaderFireTiming(wave);
    expect(turns.length).toBeGreaterThan(10);
    expect(turns[0].time).toBeGreaterThanOrEqual(1.1 + ENEMY_ATTACK_WARNING - 1 / 60);
    expect(warned).toBeLessThanOrEqual(frame.definition.attackerCap);
    const last = new Map<number, number>();
    for (let i = 0; i < turns.length; i++) {
      const shot = turns[i];
      if (last.has(shot.source)) expect(shot.time - last.get(shot.source)!).toBeGreaterThanOrEqual(timing.cooldown + ENEMY_ATTACK_WARNING - 1 / 60);
      last.set(shot.source, shot.time);
    }
    expect(last.size).toBeGreaterThanOrEqual(8);
    expect(turns.some(shot => shot.cover)).toBe(true);
    const aimed = turns.filter(shot => !shot.cover);
    for (let i = 1; i < aimed.length; i++) expect(aimed[i].time - aimed[i - 1].time).toBeGreaterThanOrEqual(timing.gap - 1 / 60);
  });
  it('increases actual fire with wave progression without synchronizing the formation', () => {
    expect(simulate(12, 8).shots.length).toBeGreaterThan(simulate(1, 8).shots.length);
  });
  it('increases each surviving alien firing frequency as the fleet shrinks', () => {
    const fleet = simulate(1, 18), survivors = simulate(1, 3);
    expect(survivors.shots.length / 3).toBeGreaterThan(fleet.shots.length / 18);
  });
  it.each([-76, 0, 76])('extra cover fire avoids player x=%i even if the shooter is a gunship', x => {
    const f = fixture(1, 'invaders'); f.frame.position.x = x;
    const actor = f.add({ age: 2, role: 'gunship', windup: 0.05, coverFire: true });
    f.tick(0.06);
    const shots = f.services.spawnShot.mock.calls.filter(call => call[1] === actor.id);
    expect(shots).toHaveLength(1);
    for (const [, , target, position, direction] of shots) {
      const crossingX = position.x + direction.x * (-position.z / direction.z);
      expect(Math.abs(crossingX - x)).toBeGreaterThanOrEqual(28 - 1e-6); expect(target).toBe(0);
    }
  });
  it('shortens a surviving alien cooldown already in progress after casualties', () => {
    const f = fixture(1, 'invaders'), actor = f.add({ age: 2, cooldown: 5.6 });
    f.tick(); expect(actor.cooldown).toBeCloseTo(invaderFireTiming(1, 1).cooldown);
  });
});
