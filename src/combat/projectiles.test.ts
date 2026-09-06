import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { actorFixture } from '../testing/actors';
import type { Actor, Shot } from './types';
import { canProjectileHit, MAX_PROJECTILES, ProjectileSystem } from './projectiles';
import type { ProjectileCallbacks } from './projectiles';

function fixture() {
  const world = new THREE.Group(), system = new ProjectileSystem(world);
  const callbacks = { damageActor: vi.fn<ProjectileCallbacks['damageActor']>(), damagePlayer: vi.fn<ProjectileCallbacks['damagePlayer']>(), intercepted: vi.fn(), npcHit: vi.fn(), stopped: () => false };
  const player = new THREE.Vector3(0, 0, 20);
  const spawn = (faction: Shot['faction'] = 'player', z = 0, direction = 1, pierce = 1, target = 0) => {
    system.spawn(faction, -1, target, new THREE.Vector3(0, 0, z), new THREE.Vector3(0, 0, direction), 100, 12, 0xffffff, 1, 10, pierce, 'pulse');
    return system.shots.at(-1)!;
  };
  const tick = (dt = 0.1, actors: Actor[] = []) => system.update(dt, actors, player, player, callbacks);
  const target = (id: number, z: number) => { const actor = actorFixture({ id }); actor.object.position.z = z; actor.previous.copy(actor.object.position); return actor; };
  return { world, system, callbacks, spawn, tick, target, player };
}

describe('projectile simulation', () => {
  it('intercepts crossing shots before incoming fire reaches the player', () => {
    const { spawn, tick, callbacks, system } = fixture();
    spawn('player', 20, -1); spawn('pirate', 0, 1);
    tick(0.25);
    expect(callbacks.intercepted).toHaveBeenCalledOnce(); expect(callbacks.damagePlayer).not.toHaveBeenCalled();
    expect(system.shots).toHaveLength(0);
  });
  it('resolves nearest contacts first, even with reversed actor storage order', () => {
    const { spawn, tick, callbacks, target } = fixture();
    const near = target(10, 4), far = target(11, 8);
    spawn(); tick(0.1, [far, near]);
    expect(callbacks.damageActor).toHaveBeenCalledExactlyOnceWith(near, 12, true);
  });
  it('allows piercing but never damages the same actor twice', () => {
    const { spawn, tick, callbacks, target, system } = fixture();
    const actors = [target(10, 4), target(11, 7), target(12, 10)];
    spawn('player', 0, 1, 3); tick(0.08, actors); tick(0.04, actors);
    expect(callbacks.damageActor.mock.calls.map(([a]) => a.id)).toEqual([10, 11, 12]);
    expect(system.shots).toHaveLength(0);
  });
  it('detects moving targets crossing a fast shot between frames', () => {
    const { spawn, tick, callbacks, target } = fixture();
    const moving = target(10, 5); moving.previous.x = -10; moving.object.position.x = 10;
    spawn(); tick(0.1, [moving]); expect(callbacks.damageActor).toHaveBeenCalledOnce();
  });
  it('does not hit with expired or blast-cleared projectiles', () => {
    const { spawn, tick, callbacks, system, player } = fixture();
    spawn('pirate', 10).ttl = 0; tick();
    spawn('pirate', 10); system.clearHostileFire(player); tick();
    expect(callbacks.damagePlayer).not.toHaveBeenCalled(); expect(system.shots).toHaveLength(0);
  });
  it('leaves friendly anti-pirate fire and distant fire intact during a blast', () => {
    const { spawn, system, player } = fixture();
    const friendly = spawn('police', 10, 1, 1, 7), wanted = spawn('police', 10), distant = spawn('pirate', 500);
    system.clearHostileFire(player);
    expect(friendly.ttl).toBeGreaterThan(0); expect(wanted.ttl).toBe(0); expect(distant.ttl).toBeGreaterThan(0);
  });
  it('awards one interception when multiple player shots cross one enemy shot', () => {
    const { spawn, tick, callbacks } = fixture();
    spawn('player', 20, -1); spawn('player', 20, -1); spawn('pirate'); tick(0.15);
    expect(callbacks.intercepted).toHaveBeenCalledOnce();
  });
  it('stops resolving additional hits when a callback ends gameplay', () => {
    const { spawn, system, callbacks, target, player } = fixture();
    spawn('player', 0, 1, 3);
    system.update(0.1, [target(10, 3), target(11, 6)], player, player, { ...callbacks, stopped: () => true });
    expect(callbacks.damageActor).toHaveBeenCalledOnce();
  });
  it('caps load, frees GPU resources, and accepts new fire after clearing', () => {
    const { spawn, system, world } = fixture();
    for (let i = 0; i < MAX_PROJECTILES + 5; i++) spawn();
    expect(system.shots).toHaveLength(MAX_PROJECTILES);
    const line = world.children[0].children[0] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    const geometry = vi.spyOn(line.geometry, 'dispose'), material = vi.spyOn(line.material, 'dispose');
    system.clear(); system.clear();
    expect(geometry).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce(); expect(world.children).toHaveLength(0);
    spawn(); expect(system.shots).toHaveLength(1);
  });
  it('notifies damage feedback for pirate fire and NPC hits', () => {
    const { spawn, tick, callbacks, target } = fixture();
    spawn('pirate', 10); tick();
    expect(callbacks.damagePlayer).toHaveBeenCalledExactlyOnceWith(12, expect.stringContaining('RED PIRATE'));
    spawn('police', 0, 1, 1, 10); tick(0.1, [target(10, 5)]);
    expect(callbacks.npcHit).toHaveBeenCalledOnce();
  });
});

describe('projectile faction rules', () => {
  it.each([
    ['police', 'trader', false], ['police', 'pirate', true], ['trader', 'police', false],
    ['trader', 'pirate', true], ['pirate', 'police', true], ['pirate', 'trader', true],
    ['pirate', 'pirate', false], ['player', 'trader', true], ['player', 'police', true], ['player', 'cargo', false]
  ] as const)('%s fire versus %s is %s', (faction, kind, expected) => {
    const { spawn } = fixture();
    const actor = actorFixture({ kind, faction: kind === 'cargo' ? 'neutral' : kind });
    expect(canProjectileHit(spawn(faction), actor)).toBe(expected);
  });
  it('protects ordinary stations and rejects dead/source/already-hit targets', () => {
    const { spawn } = fixture(); const shot = spawn('pirate');
    const base = actorFixture({ kind: 'base', faction: 'neutral' });
    expect(canProjectileHit(shot, base)).toBe(false); base.essential = true; expect(canProjectileHit(shot, base)).toBe(true);
    base.dead = true; expect(canProjectileHit(shot, base)).toBe(false); base.dead = false;
    shot.hit.add(base.id); expect(canProjectileHit(shot, base)).toBe(false); shot.hit.clear();
    base.id = shot.source; expect(canProjectileHit(shot, base)).toBe(false);
  });
});
