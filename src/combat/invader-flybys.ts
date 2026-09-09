/** Optional, seeded visitors. Their flight/attack clocks use simulation time only. */
import * as THREE from 'three';
import { Random } from '../encounters';
import { createInvaderFlybyModel, edgesFromGeometry } from '../models';
import { sweptHit } from '../weapons';
import type { EnemyFrame, EnemyServices } from './enemies';
import type { Actor } from './types';
import { flybyKind, isInvaderField } from '../invader-events';
import type { InvaderVisitorKind } from '../invader-events';
import { DEFENSIVE_MINE_ARMING_TIME, DEFENSIVE_MINE_BLAST_RADIUS, DEFENSIVE_MINE_HITS } from './defensive-position';
export { flybyKind } from '../invader-events';

export interface InvaderFlyby {
  kind: InvaderVisitorKind;
  direction: number;
  random: number;
  burst: number;
  shotDelay: number;
  siren: number;
  mineDelay: number;
}
export function isInvaderExtra(actor: Actor): boolean { return !!actor.flyby || actor.kind === 'mine' || actor.kind === 'asteroid'; }
export function flybyPosition(direction: number, age: number, wave: number): THREE.Vector3 {
  const speed = 28 + Math.min(8, Math.log2(Math.max(1, wave)));
  return new THREE.Vector3(direction * (-140 + age * speed), 0, -468 + Math.sin(age * 0.8) * 5);
}

export class InvaderFlybys {
  private arrived = false;
  constructor(private readonly services: EnemyServices) {}
  reset(): void { this.arrived = false; }
  update(dt: number, frame: EnemyFrame): void {
    if (dt <= 0 || frame.run.mode !== 'invaders' || frame.run.phase !== 'playing') return;
    const actors = () => frame.actors().filter(actor => !actor.dead);
    const kind = flybyKind(frame.run.stage);
    // At most one visit per wave. A full battlefield defers it, never exceeds the
    // hostile cap or delays completion solely to wait for an optional visitor.
    if (!this.arrived && kind && frame.run.elapsed >= 6 && (isInvaderField(frame.run.stage) || actors().some(a => a.kind === 'pirate' && !a.flyby))
      && actors().filter(a => a.kind === 'pirate' || a.kind === 'mine').length < 18) {
      this.arrived = true;
      const random = new Random(frame.run.seed ^ Math.imul(frame.run.stage, 7919));
      const direction = random.next() < 0.5 ? -1 : 1;
      const actor = this.services.addActor(kind === 'police' ? 'police' : 'pirate', createInvaderFlybyModel(kind),
        flybyPosition(direction, 0, frame.run.stage), kind === 'police' ? 16 : kind === 'courier' ? 12 : 25, kind === 'police' ? 130 : kind === 'courier' ? 48 : 220, kind === 'pirate' ? 'carrier' : 'raider');
      actor.flyby = { kind, direction, random: random.state, burst: 0, shotDelay: 0, siren: 0, mineDelay: 2 };
      actor.cooldown = 1.1;
      if (kind === 'police') {
        frame.run.pilot.wanted = { ...frame.run.pilot.wanted, active: true, reason: 'Defensive Position police pursuit' };
        actor.target = -1;
      }
      this.services.announceArrival([actor], kind === 'police' ? 'WANTED! POLICE FLYBY - HUNTING YOU' : kind === 'courier' ? 'BONUS COURIER - CATCH IT BEFORE IT ESCAPES!' : 'PIRATE CRUISER FLYBY - INCOMING BURSTS');
    }
    for (const actor of actors()) {
      if (!actor.flyby) continue;
      actor.previous.copy(actor.object.position); actor.age += dt;
      const visit = actor.flyby;
      actor.object.position.copy(flybyPosition(visit.direction, actor.age * (visit.kind === 'courier' ? 1.6 : 1), frame.run.stage));
      actor.object.rotation.set(0, -visit.direction * 0.15, Math.sin(actor.age) * 0.04);
      if (Math.abs(actor.object.position.x) > 155) { this.services.removeActor(actor); continue; }
      if (visit.kind === 'police') {
        visit.siren -= dt;
        if (visit.siren <= 0) { this.services.cue('policeArrival'); visit.siren = 2.4; }
      }
      if (visit.kind !== 'courier') this.attack(actor, dt, frame);
      actor.object.traverse(child => { if (child instanceof THREE.LineSegments) (child.material as THREE.LineBasicMaterial).opacity = actor.windup >= 0 ? 0.65 + Math.sin(actor.age * 24) * 0.3 : 0.94; });
      if (visit.kind === 'pirate' && frame.run.stage >= 9 && actor.spawned < 3) {
        visit.mineDelay -= dt;
        if (visit.mineDelay <= 0 && actors().filter(a => a.kind === 'pirate' || a.kind === 'mine').length < 18) {
          const random = new Random(visit.random);
          const mine = this.services.addActor('mine', edgesFromGeometry(new THREE.OctahedronGeometry(5), 0xff4055), actor.object.position.clone(), 6, DEFENSIVE_MINE_HITS);
          const destination = new THREE.Vector3(THREE.MathUtils.clamp(actor.object.position.x + random.range(-30, 30), -70, 70), 0, 0);
          mine.drift = destination.sub(mine.object.position).normalize().multiplyScalar(68 + Math.min(20, frame.run.stage));
          visit.random = random.state; actor.spawned++; visit.mineDelay = 2.2;
        }
      }
    }
  }
  private attack(actor: Actor, dt: number, frame: EnemyFrame): void {
    const visit = actor.flyby!;
    if (visit.kind === 'courier') return;
    actor.cooldown = Math.max(0, actor.cooldown - dt);
    if (actor.windup < 0 && actor.cooldown <= 0) {
      if (frame.actors().filter(a => !a.dead && a.windup >= 0).length >= frame.definition.attackerCap) return;
      actor.windup = 0.9;
      this.services.lockOn();
    }
    if (actor.windup < 0) return;
    // Keep windup at zero throughout a burst so the shared attacker cap includes it.
    if (!visit.burst) {
      actor.windup = Math.max(0, actor.windup - dt);
      if (actor.windup > 0) return;
      visit.burst = visit.kind === 'police' ? 3 : 4; visit.shotDelay = 0;
    }
    visit.shotDelay -= dt;
    if (visit.shotDelay > 0) return;
    const random = new Random(visit.random);
    const aim = new THREE.Vector3(visit.burst % 2 ? random.range(-76, 76) : THREE.MathUtils.clamp(frame.position.x + random.range(-12, 12), -76, 76), 0, 0);
    const direction = aim.sub(actor.object.position).normalize();
    this.services.spawnShot(actor.faction, actor.id, 0, actor.object.position.clone().addScaledVector(direction, actor.radius + 5),
      direction, Math.min(216, (visit.kind === 'police' ? 200 : 185) + frame.run.stage * 2), 10,
      visit.kind === 'police' ? 0x75caff : 0xff4055, 4.5, 20, 1);
    this.services.enemyShoot(visit.kind === 'police' ? 'police' : 'carrier', actor.object.position.distanceTo(frame.position));
    visit.random = random.state; visit.burst--; visit.shotDelay = visit.kind === 'police' ? 0.16 : 0.24;
    if (!visit.burst) { actor.windup = -1; actor.cooldown = Math.max(1.8, (visit.kind === 'police' ? 2.6 : 3.2) - Math.log2(frame.run.stage) * 0.1); }
  }
}

/** Detonate on entering the displayed blast radius, even when either craft crosses it in one tick. */
export function moveInvaderMine(actor: Actor, dt: number, frame: EnemyFrame): 'hit' | 'expired' | null {
  if (actor.drift) actor.object.position.addScaledVector(actor.drift, dt);
  if (actor.age >= DEFENSIVE_MINE_ARMING_TIME && sweptHit(actor.previous, actor.object.position, frame.previousPosition, frame.position, DEFENSIVE_MINE_BLAST_RADIUS) !== null) return 'hit';
  return actor.object.position.z > 45 || actor.age > 14 ? 'expired' : null;
}
