import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newRun } from '../arcade';
import { stageDefinition } from '../encounters';
import { ActorWorld } from '../world/actors';
import { ProjectileSystem } from './projectiles';
import { EnemySystem } from './enemies';
import type { EnemyFrame, EnemyServices } from './enemies';
import { flybyKind, flybyPosition, InvaderFlybys, isInvaderExtra, moveInvaderMine } from './invader-flybys';
import { weaponSpec } from '../weapons';
import { actorProjectileDamage, DEFENSIVE_MINE_BLAST_RADIUS, DEFENSIVE_MINE_HITS } from './defensive-position';
import { MINE_WARNING_NAME } from '../rendering/invader-mine-warning';

const cleanup: Array<() => void> = [];
afterEach(() => { for (const clear of cleanup.splice(0)) clear(); });
function fixture(wave = 5, seed = 123) {
  let id = 0;
  const root = new THREE.Group(), world = new ActorWorld(root, () => ++id);
  cleanup.push(() => world.clear());
  const run = newRun('invaders', seed); run.stage = wave; run.phase = 'playing';
  const frame: EnemyFrame = { run, definition: stageDefinition('invaders', wave), actors: () => world.actors,
    position: new THREE.Vector3(), previousPosition: new THREE.Vector3(), orientation: new THREE.Quaternion(), objectiveShip: null };
  const services = {
    addActor: (...args) => world.add(...args), removeActor: vi.fn<EnemyServices['removeActor']>(actor => world.remove(actor)),
    destroy: vi.fn<EnemyServices['destroy']>(actor => world.remove(actor)), damagePlayer: vi.fn<EnemyServices['damagePlayer']>(), announceArrival: vi.fn<EnemyServices['announceArrival']>(),
    spawnShot: vi.fn<EnemyServices['spawnShot']>(), enemyShoot: vi.fn<EnemyServices['enemyShoot']>(), cue: vi.fn<EnemyServices['cue']>(), lockOn: vi.fn(), stopped: () => false
  } satisfies EnemyServices;
  const controller = new InvaderFlybys(services);
  const alien = () => world.add('pirate', new THREE.Group(), new THREE.Vector3(0, 0, -180), 8, 60);
  alien();
  const tick = (seconds: number, update = (dt: number) => controller.update(dt, frame)) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) { run.elapsed += 1 / 60; update(1 / 60); }
  };
  const visit = () => world.actors.find(actor => actor.flyby)!;
  return { world, frame, run, services, controller, tick, visit, alien, root };
}

describe('optional Defensive Position flybys', () => {
  it('introduces alternating visitors and crosses in both directions behind the formations', () => {
    expect(Array.from({ length: 11 }, (_, i) => flybyKind(i + 1))).toEqual([null, 'courier', 'police', null, 'pirate', 'police', 'police', null, 'pirate', 'courier', 'police']);
    for (const wave of [3, 9, 101, 1001]) for (const direction of [-1, 1]) {
      expect(flybyPosition(direction, 0, wave).x).toBe(direction * -140);
      expect(flybyPosition(direction, 12, wave).x * direction).toBeGreaterThan(155);
      expect(flybyPosition(direction, 5, wave).z).toBeLessThan(-460);
    }
  });
  it('waits for free capacity, visits once, and does not award an escape as a kill', () => {
    const f = fixture(); for (let i = 0; i < 17; i++) f.alien();
    f.tick(7); expect(f.visit()).toBeUndefined();
    f.world.remove(f.world.actors[0]); f.tick(1 / 60);
    expect(f.world.actors).toHaveLength(18); expect(f.visit().flyby?.kind).toBe('pirate');
    f.tick(30); expect(f.visit()).toBeUndefined();
    expect(f.services.announceArrival).toHaveBeenCalledOnce(); expect(f.services.destroy).not.toHaveBeenCalled();
    f.controller.reset(); f.tick(1 / 60); expect(f.visit()).toBeDefined();
  });
  it('does not introduce a visitor after the required aliens are gone or outside active play', () => {
    const f = fixture(); f.world.clear(); f.tick(7); expect(f.visit()).toBeUndefined();
    f.alien(); f.run.phase = 'recovery'; f.tick(4); expect(f.visit()).toBeUndefined();
    f.run.phase = 'playing'; f.controller.update(0, f.frame); expect(f.visit()).toBeUndefined();
    f.tick(1 / 60); expect(f.visit()).toBeDefined();
  });
  it('gives arrival grace and a flashing warning before a spaced four-shot burst', () => {
    const f = fixture(); f.tick(6.1); const actor = f.visit();
    expect(actor.age).toBeLessThan(0.2); expect(actor.windup).toBe(-1);
    f.tick(1.05); expect(actor.windup).toBeGreaterThan(0.7); expect(f.services.spawnShot).not.toHaveBeenCalled();
    f.tick(0.7); expect(f.services.spawnShot).not.toHaveBeenCalled();
    f.tick(1); expect(f.services.spawnShot).toHaveBeenCalledTimes(4);
    expect(f.services.lockOn).toHaveBeenCalledOnce(); expect(actor.cooldown).toBeGreaterThan(1.8);
    expect(actor.windup).toBe(-1); expect(f.services.enemyShoot).toHaveBeenCalledWith('carrier', expect.any(Number));
  });
  it('Defensive Position police declare the player wanted, sound a siren and fire rapid bursts at them', () => {
    const f = fixture(3);
    f.tick(8.5);
    expect(f.services.cue).toHaveBeenCalledWith('policeArrival');
    const shots = vi.mocked(f.services.spawnShot).mock.calls;
    expect(shots).toHaveLength(3); expect(shots.every(([faction, , target]) => faction === 'police' && target === 0)).toBe(true);
    expect(f.run.pilot.wanted.active).toBe(true);
    expect(f.services.announceArrival).toHaveBeenCalledWith(expect.anything(), 'WANTED! POLICE FLYBY - HUNTING YOU');
    f.tick(5);
    expect(vi.mocked(f.services.spawnShot).mock.calls.some(([faction, , target]) => faction === 'police' && target === 0)).toBe(true);
    expect(f.services.lockOn).toHaveBeenCalled();
    expect(vi.mocked(f.services.cue).mock.calls.filter(([cue]) => cue === 'policeArrival').length).toBeGreaterThanOrEqual(3);
  });
  it('uses reproducible varied aim and bounded fast projectile speeds', () => {
    const shots = (seed: number) => {
      const f = fixture(1001, seed); f.tick(8.9);
      return vi.mocked(f.services.spawnShot).mock.calls.map(([, , , origin, direction, speed]) => {
        expect(speed).toBeLessThanOrEqual(216);
        const lane = origin.x + direction.x * (-origin.z / direction.z);
        expect(lane).toBeGreaterThanOrEqual(-76); expect(lane).toBeLessThanOrEqual(76);
        return [lane, speed];
      });
    };
    const first = shots(123); expect(first.length).toBeGreaterThan(2);
    expect(new Set(first.map(([lane]) => lane)).size).toBe(first.length);
    expect(shots(123)).toEqual(first); expect(shots(456)).not.toEqual(first);
  });
  it('shares the attacker limit with formations, including throughout a burst', () => {
    const f = fixture(); f.frame.definition.attackerCap = 1;
    f.world.actors[0].windup = 0.9; f.tick(8.5); expect(f.services.spawnShot).not.toHaveBeenCalled();
    f.world.actors[0].windup = -1; f.tick(0.95);
    expect(f.visit().windup).toBe(0); expect(f.visit().flyby?.burst).toBeGreaterThan(0);
    expect(f.services.spawnShot).toHaveBeenCalledOnce();
  });
  it('does not take formation slots, launch extra fighters, or hover when the flyby ends', () => {
    const f = fixture(5), enemies = new EnemySystem(f.services);
    f.tick(8, dt => enemies.update(dt, f.frame));
    expect(f.visit().formationSlot).toBeUndefined();
    expect(f.world.actors.filter(a => a.kind === 'pirate' && !a.flyby)).toHaveLength(1);
    expect(f.visit().object.position.z).toBeLessThan(-460);
    f.tick(10, dt => enemies.update(dt, f.frame)); expect(f.visit()).toBeUndefined();
  });
  it.each(['pulse', 'spread', 'lance'] as const)('%s shots can reach and damage the rear flyby', family => {
    const f = fixture(); f.tick(10.5); const actor = f.visit();
    f.world.remove(f.world.actors.find(a => !a.flyby)!);
    const projectiles = new ProjectileSystem(f.root); cleanup.push(() => projectiles.clear());
    const spec = weaponSpec(family, 1, 'invaders'), point = actor.object.position;
    projectiles.spawn('player', 0, actor.id, new THREE.Vector3(point.x, 0, 0), new THREE.Vector3(0, 0, -1), spec.speed, spec.damage, spec.color, spec.radius, spec.length, spec.pierce, family);
    const damageActor = vi.fn(); actor.previous.copy(point);
    for (let i = 0; i < 90; i++) projectiles.update(1 / 60, [actor], f.frame.position, f.frame.position,
      { damageActor, damagePlayer: vi.fn(), intercepted: vi.fn(), npcHit: vi.fn(), stopped: () => false });
    expect(damageActor).toHaveBeenCalledOnce();
  });
});

describe('drifting Defensive Position mines', () => {
  it('later cruisers release only three mines, which drift toward the lane', () => {
    const early = fixture(5); early.tick(14); expect(early.world.actors.some(a => a.kind === 'mine')).toBe(false);
    const f = fixture(9); f.tick(14);
    const mines = f.world.actors.filter(a => a.kind === 'mine'); expect(mines).toHaveLength(3);
    for (const mine of mines) { expect(mine.drift!.z).toBeGreaterThan(60); expect(isInvaderExtra(mine)).toBe(true); expect(mine.hull).toBe(DEFENSIVE_MINE_HITS); }
    expect(f.visit().spawned).toBe(3); expect(isInvaderExtra(f.visit())).toBe(true); expect(isInvaderExtra(f.world.actors[0])).toBe(false);
  });
  it('never drops mines past eighteen hostiles', () => {
    const f = fixture(9); f.tick(6.1); for (let i = 0; i < 16; i++) f.alien();
    f.tick(4); expect(f.world.actors).toHaveLength(18); expect(f.world.actors.some(a => a.kind === 'mine')).toBe(false);
    f.world.remove(f.world.actors[0]); f.tick(1 / 60);
    expect(f.world.actors).toHaveLength(18); expect(f.world.actors.filter(a => a.kind === 'mine')).toHaveLength(1);
  });
  it('uses an arming delay and swept contact, and expires safely past the lane', () => {
    const f = fixture(), mine = f.world.add('mine', new THREE.Group(), new THREE.Vector3(0, 0, -25), 6, 20);
    mine.drift = new THREE.Vector3(0, 0, 100); mine.age = 0.5;
    expect(moveInvaderMine(mine, 0.4, f.frame)).toBeNull();
    mine.previous.set(0, 0, -25); mine.object.position.copy(mine.previous); mine.age = 2;
    expect(moveInvaderMine(mine, 0.4, f.frame)).toBe('hit');
    mine.previous.set(60, 0, 40); mine.object.position.copy(mine.previous);
    expect(moveInvaderMine(mine, 0.2, f.frame)).toBe('expired');
  });
  it('detonates before physical contact, but not outside the displayed blast radius', () => {
    const f = fixture(), mine = f.world.add('mine', new THREE.Group(), new THREE.Vector3(DEFENSIVE_MINE_BLAST_RADIUS - 0.1, 0, 0), 6, DEFENSIVE_MINE_HITS);
    mine.age = 2;
    expect(mine.object.position.distanceTo(f.frame.position)).toBeGreaterThan(mine.radius + 12);
    expect(moveInvaderMine(mine, 1 / 60, f.frame)).toBe('hit');
    mine.object.position.x = DEFENSIVE_MINE_BLAST_RADIUS + 0.1; mine.previous.copy(mine.object.position);
    expect(moveInvaderMine(mine, 1 / 60, f.frame)).toBeNull();
    mine.age = 15; expect(moveInvaderMine(mine, 1 / 60, f.frame)).toBe('expired');
  });
  it('detects a player crossing a stationary mine, and a fast mine crossing the player', () => {
    const f = fixture(), mine = f.world.add('mine', new THREE.Group(), new THREE.Vector3(), 6, DEFENSIVE_MINE_HITS);
    mine.age = 2; f.frame.previousPosition.set(-50, 0, 0); f.frame.position.set(50, 0, 0);
    expect(moveInvaderMine(mine, 1 / 60, f.frame)).toBe('hit');
    f.frame.previousPosition.set(0, 0, 0); f.frame.position.set(0, 0, 0);
    mine.previous.set(0, 0, -120); mine.object.position.copy(mine.previous); mine.drift = new THREE.Vector3(0, 0, 240);
    expect(moveInvaderMine(mine, 1, f.frame)).toBe('hit');
    mine.previous.set(27, 0, -40); mine.object.position.copy(mine.previous); mine.drift.z = 80;
    expect(moveInvaderMine(mine, 1, f.frame)).toBeNull();
  });
  it('updates a surviving mine warning during play and leaves other modes unchanged', () => {
    const f = fixture(1), enemies = new EnemySystem(f.services);
    const mine = f.world.add('mine', new THREE.Group(), new THREE.Vector3(0, 0, -90), 6, DEFENSIVE_MINE_HITS); mine.age = 2;
    f.tick(1 / 60, dt => enemies.update(dt, f.frame));
    expect(mine.object.getObjectByName(MINE_WARNING_NAME)?.visible).toBe(true);
    expect(f.services.damagePlayer).not.toHaveBeenCalled(); expect(mine.dead).toBe(false);
    f.run.mode = 'journey'; f.world.remove(mine);
    const ordinary = f.world.add('mine', new THREE.Group(), new THREE.Vector3(0, 0, -25), 6, 20); ordinary.age = 2;
    f.tick(1 / 60, dt => enemies.update(dt, f.frame));
    expect(ordinary.object.getObjectByName(MINE_WARNING_NAME)).toBeUndefined();
    expect(f.services.damagePlayer).not.toHaveBeenCalled();
  });
  it('shooting a mine prevents its contact damage; a collision damages only once', () => {
    const f = fixture(2), enemies = new EnemySystem(f.services);
    const mine = f.world.add('mine', new THREE.Group(), new THREE.Vector3(0, 0, -13), 6, 20);
    mine.age = 2; mine.drift = new THREE.Vector3(0, 0, 80);
    f.tick(1, dt => enemies.update(dt, f.frame));
    expect(f.services.damagePlayer).toHaveBeenCalledExactlyOnceWith(10, 'DRIFTING MINE EXPLOSION');
    expect(f.services.destroy).toHaveBeenCalledExactlyOnceWith(mine, false);
    const shotMine = f.world.add('mine', new THREE.Group(), new THREE.Vector3(0, 0, -13), 6, DEFENSIVE_MINE_HITS);
    shotMine.age = 2; shotMine.drift = new THREE.Vector3(0, 0, 80);
    const projectiles = new ProjectileSystem(f.root); cleanup.push(() => projectiles.clear());
    projectiles.spawn('player', 0, shotMine.id, new THREE.Vector3(), new THREE.Vector3(0, 0, -1), 650, 85, 0xffffff, 3.2, 16, 3, 'lance');
    projectiles.update(1 / 60, [shotMine], f.frame.position, f.frame.position, {
      damageActor: (actor, damage, _, family) => { actor.hull -= actorProjectileDamage('invaders', actor.kind, family, damage); if (actor.hull <= 0) f.world.remove(actor); },
      damagePlayer: vi.fn(), intercepted: vi.fn(), npcHit: vi.fn(), stopped: () => false
    });
    expect(shotMine.dead).toBe(true);
    f.tick(1, dt => enemies.update(dt, f.frame)); expect(f.services.damagePlayer).toHaveBeenCalledOnce();
  });
});
