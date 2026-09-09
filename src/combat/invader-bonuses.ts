/** Brief opportunities, not additional required enemies or persistent upgrades. */
import * as THREE from 'three';
import { lineShape } from '../models';
import { Random } from '../encounters';
import { ARMADA_LANE_LIMIT } from '../armada';
import { shipVoice } from '../audio/events';
import type { Actor } from './types';
import type { EnemyFrame, EnemyServices } from './enemies';

const ESCAPE_WARNING = 0.9;
const ESCAPE_DURATION = 3.5;

/** A flat bonus for catching the final alien during its actual escape dash. */
export function invaderEscapeBonus(actor: Actor): number {
  return actor.kind === 'pirate' && !actor.flyby && actor.escape && actor.escape.age >= ESCAPE_WARNING && actor.escape.age < ESCAPE_WARNING + ESCAPE_DURATION ? 500 : 0;
}

export function invaderKillValue(actor: Actor, elapsed: number): number {
  const base = actor.flyby?.kind === 'courier' ? 3000 : actor.flyby?.kind === 'police' ? 1000 : actor.flyby?.kind === 'pirate' ? 2000 : actor.kind === 'asteroid' ? (actor.asteroid?.size ?? 0) * 25 + 25
    : actor.kind === 'mine' ? 25 : actor.role === 'carrier' ? 500 : 100;
  return base * ((actor.doubleUntil ?? 0) > elapsed ? 2 : 1);
}
export class InvaderBonuses {
  private offered = false;
  private alone = 0;
  private colors = new Map<THREE.LineBasicMaterial, THREE.Color>();
  constructor(private readonly services: EnemyServices) {}
  reset(): void { this.offered = false; this.alone = 0; this.colors.clear(); }
  update(dt: number, frame: EnemyFrame): void {
    if (dt <= 0 || frame.run.mode !== 'invaders' || frame.run.phase !== 'playing') return;
    const formation = frame.actors().filter(a => !a.dead && a.kind === 'pirate' && !a.flyby);
    if (!this.offered && frame.run.stage >= 2 && frame.run.elapsed >= 4 && formation.length) {
      this.offered = true; const actor = formation[(frame.run.seed + frame.run.stage) % formation.length];
      actor.doubleUntil = frame.run.elapsed + 6;
      const label = lineShape([[-7, 4, 0], [-1, 4, 0], [-1, 1, 0], [-7, -2, 0], [-7, -4, 0], [-1, -4, 0], [2, 4, 0], [8, -4, 0], [8, 4, 0], [2, -4, 0]],
        [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [6, 7], [8, 9]], 0xffff70);
      label.position.y = 13; label.rotation.y = Math.PI; label.name = 'double-score'; actor.object.add(label);
      this.services.announceArrival([], 'GOLD 2X TARGET - DOUBLE POINTS FOR A SHORT TIME!');
    }
    for (const actor of formation) if (actor.doubleUntil) {
      const active = actor.doubleUntil > frame.run.elapsed;
      actor.object.traverse(child => {
        if (child.name === 'double-score') child.visible = active;
        if (!(child instanceof THREE.LineSegments)) return;
        const material = child.material as THREE.LineBasicMaterial;
        if (!this.colors.has(material)) this.colors.set(material, material.color.clone());
        material.color.copy(active ? new THREE.Color(0xffff70) : this.colors.get(material)!);
      });
    }
    this.alone = frame.flightsFinished && formation.length === 1 ? this.alone + dt : 0;
    const last = formation[0];
    if (this.alone >= 3 && last && !last.escape
      && frame.actors().filter(actor => !actor.dead && actor !== last && actor.windup >= 0).length < frame.definition.attackerCap) {
      const side = last.object.position.x >= 0 ? 1 : -1;
      last.escape = { age: 0, shots: 0, random: (frame.run.seed ^ Math.imul(frame.run.stage, 7919) ^ last.id) >>> 0,
        path: new THREE.CatmullRomCurve3([last.object.position.clone(), new THREE.Vector3(-side * 35, 0, -130), new THREE.Vector3(side * 165, 0, -85)]) };
      last.windup = ESCAPE_WARNING; last.cooldown = 0;
      this.services.announceArrival([], 'LAST ALIEN ESCAPING - LAST CHANCE!'); this.services.cue('patrolApproach');
    }
    for (const actor of formation) if (actor.escape) {
      actor.previous.copy(actor.object.position); actor.escape.age += dt; actor.age += dt;
      // Reserve an attacker slot for the entire escape, including the warning.
      actor.windup = Math.max(0, ESCAPE_WARNING - actor.escape.age);
      actor.object.traverse(child => {
        if (child instanceof THREE.LineSegments) (child.material as THREE.LineBasicMaterial).opacity = 0.65 + Math.sin(actor.age * 24) * 0.3;
      });
      if (actor.escape.age < ESCAPE_WARNING) continue;
      actor.object.position.copy(actor.escape.path.getPointAt(Math.min(1, (actor.escape.age - ESCAPE_WARNING) / ESCAPE_DURATION)));
      if (actor.escape.age >= ESCAPE_WARNING + ESCAPE_DURATION) { this.services.removeActor(actor); continue; }
      this.fireEscape(actor, dt, frame);
    }
  }
  private fireEscape(actor: Actor, dt: number, frame: EnemyFrame): void {
    actor.cooldown = Math.max(0, actor.cooldown - dt);
    if (actor.cooldown > 0) return;
    const escape = actor.escape!, random = new Random(escape.random);
    // Opening shots track the player. Scatter then continues without a burst limit
    // or formation-range cutoff, right through the final moments of departure.
    const target = frame.position.clone();
    if (escape.shots >= 3) target.x = random.range(-ARMADA_LANE_LIMIT, ARMADA_LANE_LIMIT);
    const direction = target.sub(actor.object.position).normalize();
    this.services.spawnShot(actor.faction, actor.id, 0, actor.object.position.clone().addScaledVector(direction, actor.radius + 5),
      direction, Math.min(216, 160 * frame.definition.speedScale), 10, 0xff4055, 4.5, 20, 1);
    this.services.enemyShoot(actor.firingVoice ?? shipVoice(actor.kind, actor.role), actor.object.position.distanceTo(frame.position));
    escape.shots++; escape.random = random.state;
    actor.cooldown = Math.max(0.14, 0.22 - Math.log2(Math.max(1, frame.run.stage)) * 0.012);
  }
}
