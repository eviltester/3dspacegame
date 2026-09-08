/**
 * On-rails canyon course. Forward travel is automatic; mouse/keys move an offset
 * within the corridor, and boost changes the forward rate. step() returns events
 * rather than changing the main ship's score, lives or menus directly.
 */
import * as THREE from 'three';
import { Random } from './encounters';
import { bonusProfile } from './bonus-difficulty';
import { createBoltModel, createCanyonGate, createCanyonTurret, createTextSprite, disposeObject, edgesFromGeometry, lineShape } from './models';
import { sweptHit } from './weapons';
import { CanyonGateScore, canyonGatePoints } from './canyon-gates';
import { updateCanyonGateVisual } from './rendering/canyon-gates';
import type { CanyonImpact } from './canyon-combat';
import { CanyonBarriers } from './canyon-barriers';
import { BoostDrive } from './boost';
import { qualifiesBoostFinish } from './smuggler-rewards';
import { canyonGunMount, canyonGunMuzzle, sizeCanyonGun } from './canyon-gun-mounts';
import type { CanyonGunMount } from './canyon-gun-mounts';
import { SoundEvents } from './audio/events';

export type CanyonEnd = 'complete' | 'wall';
export interface CanyonTarget {
  kind: 'turret' | 'obstacle' | 'hostileBolt'; object: THREE.Object3D; radius: number; number: number; used: boolean;
  mount?: CanyonGunMount;
  collisionRadius?: number;
}
interface Gun extends CanyonTarget { cooldown: number; windup: number; aim: THREE.Vector3 }
interface Bolt extends CanyonTarget { velocity: THREE.Vector3; life: number }
export interface CanyonGate {
  object: THREE.Group; base: THREE.Vector3; previous: THREE.Vector3; radius: number; phase: number;
  motion: number; small: boolean; progress: number; resolved: boolean; passed: boolean; exit: boolean;
}
export const CANYON_GATES = 18;
export const CANYON_EXIT_PROGRESS = 0.985;
export const CANYON_GUN_WARNING = 0.85;
export const CANYON_MAX_BOLTS = 24;
export function canyonSpeed(progress: number, difficulty = 1): number {
  return (48 + 96 * THREE.MathUtils.clamp(progress, 0, 1)) * bonusProfile(difficulty).flightScale;
}
// Relative plane crossing catches a missed opening too, including a gate moving during this tick.
export function canyonGateCrossing(previous: THREE.Vector3, next: THREE.Vector3, gate: CanyonGate): boolean | null {
  // null = not crossed yet, false = crossed outside, true = crossed through.
  // The polygon's inner radius minus craft clearance is smaller than its corners.
  const before = previous.clone().sub(gate.previous), after = next.clone().sub(gate.object.position);
  if (before.z < 0 || after.z > 0 || before.z === after.z) return null;
  const crossing = before.lerp(after, before.z / (before.z - after.z));
  return Math.hypot(crossing.x, crossing.y) <= gate.radius * Math.cos(Math.PI / 8) - 2;
}

export class CanyonCourse {
  readonly path = new THREE.CatmullRomCurve3(Array.from({ length: 17 }, (_, i) =>
    new THREE.Vector3(Math.sin(i * 0.8) * 80, Math.sin(i * 0.45) * 12, -i * 400)));
  readonly gates: CanyonGate[] = [];
  readonly targets: CanyonTarget[] = [];
  readonly offset = new THREE.Vector2();
  readonly gateScore = new CanyonGateScore();
  readonly barriers: CanyonBarriers;
  get penalty(): number { return this.gateScore.penalty; }
  get gatePointsAvailable(): number { return this.gates.filter(gate => !gate.exit).reduce((sum, gate) => sum + canyonGatePoints(gate), 0); }
  get nextGatePoints(): number { const gate = this.gates.find(gate => !gate.resolved); return gate && !gate.exit ? canyonGatePoints(gate) : 0; }
  private guns: Gun[] = [];
  shots: Bolt[] = [];
  progress = 0;
  speed = 48;
  boosting = false;
  get topBoost(): boolean { return qualifiesBoostFinish(this.speed, canyonSpeed(CANYON_EXIT_PROGRESS, this.profile.level)); }
  private readonly boost = new BoostDrive(0.65);
  passed = 0;
  missed = 0;
  nextGate = 0;
  fired = 0;
  private elapsed = 0;
  private distance = 0;
  private length: number;
  private previous = new THREE.Vector3();
  private exitAnnounced = false;
  private readonly profile;
  constructor(private root: THREE.Group, seed: number, difficulty = 1, private readonly smuggler = false, private sounds = new SoundEvents()) {
    const profile = this.profile = bonusProfile(difficulty);
    this.speed = canyonSpeed(0, profile.level);
    this.length = this.path.getLength();
    this.barriers = new CanyonBarriers(root, this.path, seed, profile.level);
    const rng = new Random(seed);
    const mountRng = new Random(seed ^ 0x572ae);
    // Draw successive cross-sections along the same curve used for flight. Geometry,
    // gates and targets therefore agree on where the traversable corridor lies.
    for (let i = 0; i < 80; i++) {
      const c = this.path.getPointAt(i / 80), n = this.path.getPointAt((i + 1) / 80);
      this.root.add(lineShape([
        [c.x - 43, c.y - 32, c.z], [c.x - 50, c.y + 42, c.z], [c.x + 43, c.y - 32, c.z], [c.x + 50, c.y + 42, c.z],
        [n.x - 43, n.y - 32, n.z], [n.x - 50, n.y + 42, n.z], [n.x + 43, n.y - 32, n.z], [n.x + 50, n.y + 42, n.z]
      ], [[0, 1], [2, 3], [0, 2], [0, 4], [1, 5], [2, 6], [3, 7]], 0x508bc6, 0.65));
    }
    // Four half-size openings, spread across the course, with seeded positions.
    const smallSlots = new Set([3, 7, 11, 15].map(start => start + rng.pick([0, 1, 2])));
    for (let i = 0; i <= CANYON_GATES; i++) {
      const exit = i === CANYON_GATES, progress = exit ? CANYON_EXIT_PROGRESS : 0.055 + i * 0.05;
      const small = !exit && smallSlots.has(i);
      const radius = exit ? 10 : (18 - i * 0.6 + (i % 2 ? -0.6 : 0.4)) * profile.gateScale * (small ? 0.5 : 1);
      const base = this.path.getPointAt(progress).add(new THREE.Vector3(exit ? 0 : Math.sin(i * 1.35) * 16, exit ? 1 : Math.cos(i * 1.1) * 9, 0));
      const object = createCanyonGate(radius);
      object.position.copy(base); this.root.add(object);
      const label = createTextSprite(exit ? 'EXIT' : String(i + 1), exit ? '#ffff70' : '#48ff95', undefined, exit ? 70 : 32, exit ? 22 : 10);
      label.position.set(0, radius + (exit ? 23 : 7), 4); object.add(label);
      if (exit) object.add(lineShape([[0, radius + 14, 4], [0, radius + 2, 4], [-4, radius + 6, 4], [4, radius + 6, 4]], [[0, 1], [1, 2], [1, 3]], 0xffff70));
      this.gates.push({ object, base, previous: base.clone(), radius, phase: rng.range(0, Math.PI * 2),
        motion: exit || i % 3 === 0 ? 0 : 1.5 + i * 0.22, small, progress, resolved: false, passed: false, exit });
      if (exit) this.addEndWall(base, radius);
    }
    // Obstacles occupy alternating outer lanes; the central gate corridor remains traversable.
    for (let i = 0; i < profile.canyonObstacles; i++) {
      const t = 0.022 + i / (profile.canyonObstacles - 1) * 0.918, center = this.path.getPointAt(t), side = i % 2 ? 1 : -1;
      const radius = 6 + (i % 3);
      const object = edgesFromGeometry(new THREE.OctahedronGeometry(radius), 0xffbf48);
      object.position.copy(center).add(new THREE.Vector3(side * 33, i % 3 === 0 ? 23 : -17, 0));
      this.root.add(object); this.targets.push({ kind: 'obstacle', object, radius, number: 0, used: false });
      if (i % 2 === 0) {
        const object = createCanyonTurret();
        object.position.copy(center).add(new THREE.Vector3(i % 4 === 0 ? 34 : -34, -17, -25));
        const mount = smuggler ? canyonGunMount(center, i / 2, profile.level, this.barriers.items, mountRng) : undefined;
        const scale = sizeCanyonGun(object, profile.level, mount);
        this.root.add(object);
        // The forgiving shot target grows with the model, without making its whole
        // aiming margin a collision hazard for the skiff.
        const gun: Gun = { kind: 'turret', object, mount, radius: 8 * scale, collisionRadius: 8, number: 0, used: false, cooldown: 0.3 + rng.range(0, 0.5), windup: 0, aim: new THREE.Vector3() };
        this.targets.push(gun); this.guns.push(gun);
      }
    }
  }
  private addEndWall(center: THREE.Vector3, radius: number): void {
    const vertices: Array<[number, number, number]> = [], edges: Array<[number, number]> = [];
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4, x = Math.cos(angle), y = Math.sin(angle);
      vertices.push([x * radius, y * radius, 0], [x * 76, y * 64, 0]);
      edges.push([i * 2 + 1, ((i + 1) % 8) * 2 + 1], [i * 2, i * 2 + 1]);
    }
    const wall = lineShape(vertices, edges, 0xffbf48); wall.position.copy(center); this.root.add(wall);
  }
  step(dt: number, look: { x: number; y: number; boost?: boolean }, camera: THREE.PerspectiveCamera): { damage: CanyonImpact[]; points: number; notice: string; end: CanyonEnd | null; shots: number } {
    const events = { damage: [] as CanyonImpact[], points: 0, notice: '', end: null as CanyonEnd | null, shots: 0 };
    this.elapsed += dt; this.previous.copy(camera.position);
    this.boosting = look.boost === true;
    this.speed = this.boost.step(dt, canyonSpeed(this.progress, this.profile.level), this.boosting);
    this.distance += this.speed * dt; this.progress = Math.min(1, this.distance / this.length);
    if (!this.exitAnnounced && this.progress >= 0.9) { this.exitAnnounced = true; this.sounds.cue('exitGate'); }
    this.offset.x = THREE.MathUtils.clamp(this.offset.x + look.x * 0.13, -38, 38);
    this.offset.y = THREE.MathUtils.clamp(this.offset.y - look.y * 0.13, -24, 30);
    const center = this.path.getPointAt(this.progress);
    camera.position.copy(center).add(new THREE.Vector3(this.offset.x, this.offset.y, 0));
    const impacts = this.barriers.step(this.elapsed, this.previous, camera.position, center, this.offset);
    for (let i = 0; i < impacts; i++) events.damage.push('barrier');
    if (impacts) events.notice = 'OBSTACLE IMPACT / SKIFF DEFLECTED';
    camera.lookAt(this.path.getPointAt(Math.min(1, this.progress + 0.015)).add(new THREE.Vector3(this.offset.x, this.offset.y, 0)));
    camera.rotateZ(-this.offset.x * 0.002);
    if (Math.abs(this.offset.x) > 36 || this.offset.y < -22) events.damage.push('wall');
    this.moveGates();
    for (const gate of this.gates) {
      if (gate.resolved) continue;
      const pass = canyonGateCrossing(this.previous, camera.position, gate);
      if (pass === null) continue;
      gate.resolved = true; gate.passed = pass;
      // Ordinary misses cost points only. The final exit remains a wall aperture.
      if (gate.exit) { events.end = pass ? 'complete' : 'wall'; break; }
      this.nextGate++;
      const wasPenalized = this.penalty > 0;
      const points = this.gateScore.cross(pass, gate); events.points += points;
      if (pass) {
        this.passed++;
        this.sounds.cue(wasPenalized ? this.penalty ? 'penaltyReduced' : 'penaltyCleared' : 'score');
        if (wasPenalized) events.notice = this.penalty ? `GATE PASSED / PENALTY ${this.penalty}` : this.smuggler ? 'PENALTY CLEARED' : 'PENALTY CLEARED / BLAST CHARGING';
      } else { this.missed++; this.sounds.cue('gateMiss'); events.notice = `GATE MISSED ${points} / PENALTY ${this.penalty}`; }
    }
    const next = this.gates.find(gate => !gate.resolved);
    for (const gate of this.gates) updateCanyonGateVisual(gate.object, gate === next && this.penalty > 0, this.elapsed);
    if (events.end) return events;
    for (const target of this.targets) {
      if (!target.used && sweptHit(this.previous, camera.position, target.object.position, target.object.position, (target.collisionRadius ?? target.radius) + 2) !== null) {
        target.used = true; target.object.visible = false; events.damage.push('collision');
      }
    }
    let activeGuns = 0;
    for (const gun of this.guns) {
      const ahead = camera.position.z - gun.object.position.z;
      if (gun.used || ahead < 15 || ahead > 340 || ++activeGuns > 4) continue;
      const material = (gun.object as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>).material;
      if (gun.windup > 0) {
        gun.windup = Math.max(0, gun.windup - dt);
        material.color.setHex(Math.sin(this.elapsed * 24) > 0 ? 0xffff70 : 0xff4055);
        if (gun.windup === 0) {
          material.color.setHex(0xff4055); gun.cooldown = this.profile.gunCooldown;
          if (this.shots.length < CANYON_MAX_BOLTS) {
            const object = createBoltModel(0xff4055, 2.4, 14, 'pirate'); object.position.copy(gun.mount ? canyonGunMuzzle(gun.object) : gun.object.position);
            const velocity = gun.aim.clone().sub(object.position).normalize().multiplyScalar(185 * this.profile.shotSpeedScale);
            object.lookAt(object.position.clone().add(velocity)); this.root.add(object);
            this.shots.push({ kind: 'hostileBolt', object, velocity, life: 4, radius: 2.4, number: 0, used: false }); events.shots++; this.fired++;
            this.sounds.fire('canyonGun', object.position.distanceTo(camera.position));
          }
        }
      } else {
        gun.cooldown -= dt;
        if (gun.cooldown <= 0) {
          gun.windup = CANYON_GUN_WARNING;
          this.sounds.cue('lockOn');
          // Lock the predicted intercept before the warning flash, leaving time to evade.
          const lead = CANYON_GUN_WARNING + Math.max(0, ahead - this.speed * CANYON_GUN_WARNING) / (185 * this.profile.shotSpeedScale + this.speed);
          gun.aim.copy(camera.position).add(camera.position.clone().sub(this.previous).multiplyScalar(lead / Math.max(dt, 0.001)));
        }
      }
    }
    for (let i = 0, hits = this.moveShots(dt, camera); i < hits; i++) events.damage.push('gun');
    return events;
  }
  /** Keep moving geometry and already-fired bolts alive without a player target. */
  animateAfterDeath(dt: number, camera: THREE.PerspectiveCamera): void {
    this.elapsed += dt;
    this.barriers.animate(this.elapsed); this.moveGates();
    const next = this.gates.find(gate => !gate.resolved);
    for (const gate of this.gates) updateCanyonGateVisual(gate.object, gate === next && this.penalty > 0, this.elapsed);
    this.moveShots(dt, camera, false);
  }
  private moveGates(): void {
    for (const gate of this.gates) {
      gate.previous.copy(gate.object.position);
      gate.object.position.copy(gate.base).add(new THREE.Vector3(Math.sin(this.elapsed * this.profile.motionScale * 0.9 + gate.phase) * gate.motion,
        Math.sin(this.elapsed * this.profile.motionScale * 0.65 + gate.phase) * gate.motion * 0.65, 0));
    }
  }
  private moveShots(dt: number, camera: THREE.PerspectiveCamera, playerAlive = true): number {
    let hits = 0;
    for (const bolt of this.shots) {
      if (bolt.used) continue;
      const previous = bolt.object.position.clone(); bolt.life -= dt; bolt.object.position.addScaledVector(bolt.velocity, dt);
      const hit = playerAlive ? sweptHit(this.previous, camera.position, previous, bolt.object.position, bolt.radius + 2) : null;
      const blocked = this.barriers.hitTime(previous, bolt.object.position, bolt.radius);
      if (blocked !== null && (hit === null || blocked <= hit)) bolt.used = true;
      else if (hit !== null) { hits++; bolt.used = true; }
      if (bolt.life <= 0 || bolt.object.position.z > camera.position.z + 70) bolt.used = true;
    }
    this.shots = this.shots.filter(bolt => {
      if (!bolt.used) return true;
      this.root.remove(bolt.object); disposeObject(bolt.object); return false;
    });
    return hits;
  }
  clearFire(position: THREE.Vector3): void {
    for (const bolt of this.shots) if (bolt.object.position.distanceTo(position) <= 240) { bolt.used = true; bolt.object.visible = false; }
  }
  // Integrate distance / accelerating speed from here to the exit at 98.5%.
  // This estimates travel time without boost, rather than imposing a fixed timer.
  get remaining(): number { return Math.max(0, this.length / (96 * this.profile.flightScale) * Math.log((48 + 96 * CANYON_EXIT_PROGRESS) / (48 + 96 * this.progress))); }
  get snapshot() {
    return { progress: this.progress, speed: this.speed, boosting: this.boosting, offset: this.offset.toArray(), passed: this.passed,
      missed: this.missed, penalty: this.penalty, nextGate: this.nextGate, fired: this.fired,
      gates: this.gates.map(g => ({ position: g.object.position.toArray(), offset: g.object.position.clone().sub(this.path.getPointAt(g.progress)).toArray(), radius: g.radius, small: g.small, moving: g.motion > 0, points: g.exit ? 0 : canyonGatePoints(g), progress: g.progress, resolved: g.resolved, passed: g.passed, exit: g.exit })),
      barriers: this.barriers.snapshot,
      targets: this.targets.filter(t => !t.used).map(t => ({ kind: t.kind, position: t.object.position.toArray(), radius: t.radius })),
      shots: this.shots.filter(b => !b.used).map(b => ({ position: b.object.position.toArray() })) };
  }
}
