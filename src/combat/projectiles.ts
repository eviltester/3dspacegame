/** Own live bolts and resolve contacts; callbacks leave scoring, law and menus to the game. */
import type * as THREE from 'three';
import type { WeaponFamily } from '../arcade';
import type { Faction } from '../logic';
import { createBoltModel, disposeObject, setProjectilePulseOpacity } from '../models';
import { sweptHit } from '../weapons';
import type { Actor, Shot } from './types';

export const MAX_PROJECTILES = 240;
export interface ProjectileCallbacks {
  damageActor(actor: Actor, damage: number, byPlayer: boolean): void;
  damagePlayer(damage: number, message: string): void;
  intercepted(position: THREE.Vector3): void;
  npcHit(): void;
  stopped(): boolean;
  playerContact?(shot: Shot): void;
  playerExpired?(shot: Shot): void;
}
export function canProjectileHit(shot: Shot, actor: Actor): boolean {
  // Deliberate player fire can hit peaceful ships; the game applies the legal
  // consequences. NPC fire is faction-filtered. Cargo/landmarks are excluded except
  // for an essential station, which pirates can attack during a defence mission.
  if (actor.dead || actor.id === shot.source || shot.hit.has(actor.id) || actor.faction === shot.faction || !Number.isFinite(actor.hull)) return false;
  if (actor.kind === 'base' && !actor.essential) return false;
  if (shot.faction === 'player') return ['pirate', 'police', 'trader', 'part', 'mine'].includes(actor.kind);
  if (shot.faction === 'pirate') return actor.kind === 'police' || actor.kind === 'trader' || (actor.kind === 'base' && actor.essential);
  return actor.kind === 'pirate' || actor.kind === 'part' || actor.kind === 'mine';
}

export class ProjectileSystem {
  private active: Shot[] = [];
  private nextId = 1;
  constructor(private readonly world: THREE.Group, private readonly allocateId = () => this.nextId++) {}
  get shots(): readonly Shot[] { return this.active; }
  spawn(faction: Faction, source: number, target: number, position: THREE.Vector3, direction: THREE.Vector3,
    speed: number, damage: number, color: number, radius: number, length: number, pierce: number, family: WeaponFamily): boolean {
    if (this.active.length >= MAX_PROJECTILES) return false;
    const object = createBoltModel(color, radius, length, faction, family);
    object.position.copy(position); object.lookAt(position.clone().add(direction)); this.world.add(object);
    this.active.push({ id: this.allocateId(), source, faction, target, object, previous: position.clone(), velocity: direction.clone().multiplyScalar(speed),
      damage, radius, ttl: faction === 'player' ? 1.35 : 3.2, pierce, hit: new Set() });
    return true;
  }
  clear(): void {
    for (const shot of this.active) { this.world.remove(shot.object); disposeObject(shot.object); }
    this.active = [];
  }
  clearHostileFire(position: THREE.Vector3, radius = 240): void {
    for (const shot of this.active) if (shot.faction !== 'player' && (shot.faction === 'pirate' || shot.target === 0)
      && shot.object.position.distanceTo(position) <= radius) shot.ttl = 0;
  }
  update(dt: number, actors: readonly Actor[], previousPlayer: THREE.Vector3, player: THREE.Vector3, callbacks: ProjectileCallbacks): void {
    // Gather contacts after every bolt moves. Resolve them in time order later,
    // rather than letting array order decide whether an interception beats a hit.
    const expired = new Set<Shot>();
    const events: Array<{ time: number; shot: Shot; actor?: Actor; intercepted?: Shot }> = [];
    for (const shot of this.active) {
      shot.previous.copy(shot.object.position); shot.object.position.addScaledVector(shot.velocity, dt); shot.ttl -= dt;
      const pulse = (Math.sin(shot.ttl * 24) + 1) / 2;
      shot.object.scale.setScalar(0.85 + pulse * 0.22); setProjectilePulseOpacity(shot.object, pulse);
      if (shot.ttl <= 0) expired.add(shot);
    }
    for (const shot of this.active) {
      if (expired.has(shot)) continue;
      if (shot.faction === 'player') for (const other of this.active) {
        if (expired.has(other) || other.faction === 'player' || !(other.faction === 'pirate' || other.target === 0)) continue;
        const time = sweptHit(shot.previous, shot.object.position, other.previous, other.object.position, shot.radius + other.radius);
        if (time !== null) events.push({ time, shot, intercepted: other });
      }
      for (const actor of actors) {
        if (!canProjectileHit(shot, actor)) continue;
        const time = sweptHit(shot.previous, shot.object.position, actor.previous, actor.object.position, actor.radius + shot.radius * 0.5);
        if (time !== null) events.push({ time, shot, actor });
      }
      if (shot.faction !== 'player' && (shot.faction === 'pirate' || shot.target === 0)) {
        const time = sweptHit(shot.previous, shot.object.position, previousPlayer, player, 3 + shot.radius * 0.5);
        if (time !== null) events.push({ time, shot });
      }
    }
    // Resolve swept contacts chronologically so intercepted shots cannot also damage the ship.
    events.sort((a, b) => a.time - b.time);
    for (const { shot, actor, intercepted } of events) {
      if (expired.has(shot)) continue;
      if (intercepted) {
        if (expired.has(intercepted)) continue;
        callbacks.playerContact?.(shot);
        expired.add(intercepted); expired.add(shot); callbacks.intercepted(intercepted.object.position);
      } else if (actor) {
        if (actor.dead || shot.hit.has(actor.id)) continue;
        // A piercing bolt may overlap a ship for several ticks but can damage it once.
        shot.hit.add(actor.id); shot.pierce--;
        if (shot.faction === 'player') callbacks.playerContact?.(shot);
        callbacks.damageActor(actor, shot.damage, shot.faction === 'player');
        if (shot.faction !== 'player') callbacks.npcHit();
        if (shot.pierce <= 0) expired.add(shot);
      } else {
        expired.add(shot); callbacks.damagePlayer(shot.damage, shot.faction === 'pirate' ? 'RED PIRATE SHOT YOU. SHOOT THEM BACK!' : 'INCOMING FIRE');
      }
      if (callbacks.stopped()) break;
    }
    this.active = this.active.filter(shot => {
      // Removing a Three.js object does not release its GPU allocations; dispose too.
      if (!expired.has(shot)) return true;
      if (shot.faction === 'player') callbacks.playerExpired?.(shot);
      this.world.remove(shot.object); disposeObject(shot.object); return false;
    });
  }
}
