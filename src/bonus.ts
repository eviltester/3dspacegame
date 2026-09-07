/**
 * Self-contained flight-course simulation used by optional sorties and Smuggler Run.
 * It owns temporary health, weapons, targets and visuals, but never spends a run
 * life or writes a save. ArcadeGame settles the result according to the active mode.
 */
import * as THREE from 'three';
import type { BonusKind, WeaponFamily } from './arcade';
import { flightControls, boostControls, pauseControls } from './input-layouts';
import type { ControlScheme } from './input-layouts';
import { bonusProfile, TARGET_HIT_POINTS, TARGET_SHOT_COST } from './bonus-difficulty';
import { CanyonCourse } from './canyon';
import type { CanyonEnd } from './canyon';
import { CANYON_GATE_BRIEF } from './canyon-gates';
import { SkiffRepairDrops } from './bonus-repairs';
import { CANYON_COMBAT_BRIEF, CANYON_MAX_SHIELD, CANYON_REPAIR_BRIEF, canyonTargetPoints, damageCanyonSkiff, repairedCanyonShield } from './canyon-combat';
import type { CanyonImpact } from './canyon-combat';
import { CanyonHaul } from './canyon-haul';
import { AsteroidTraffic } from './asteroid-traffic';
import { courseRadarContacts } from './course-radar';
import { crossedGate, Random } from './encounters';
import { ASTEROID_COLORS, createBoltModel, createCargoModel, createPulseRing, createTextSprite, disposeObject, edgesFromGeometry, lineShape } from './models';
import { sweptHit, weaponSpec } from './weapons';

export interface BonusRunState {
  kind: BonusKind;
  family: WeaponFamily;
  elapsed: number;
  duration: number;
  remaining: number;
  health: number;
  shield: number;
  haul: number;
  charge: number;
  // Canyon/target points are score units; asteroid points are salvage units.
  // Optional sorties and Smuggler flights settle this subtotal differently.
  points: number;
  difficulty: number;
  targetCount: number;
  shotsFired: number;
  nextMarker: number;
  finished: boolean;
  reason: CanyonEnd | 'crash' | 'timeout' | 'exit' | 'gateMissed' | null;
  notice: string;
  fractures: number;
  enemyShots: number;
}
interface AsteroidMotion { size: 0 | 1 | 2; color: number; velocity: THREE.Vector3; previous: THREE.Vector3; age: number; grace: number; spin: number }
interface MarkerMotion { home: THREE.Vector3; phase: number; direction: number; amplitude: THREE.Vector2 }
interface BonusObject { kind: 'rock' | 'salvage' | 'gate' | 'marker' | 'turret' | 'obstacle' | 'hostileBolt' | 'pirate' | 'police'; object: THREE.Object3D; radius: number; number: number; used: boolean; rock?: AsteroidMotion; marker?: MarkerMotion }
export const MAX_ASTEROID_FRAGMENTS = 64;
export const ASTEROID_FRAGMENT_GRACE = 0.45;
export const ASTEROID_DURATION = 60;
export const ASTEROID_LENGTH = 4800;
export const CANYON_SHOT_MISS_COST = 50;
export function asteroidFlight(elapsed: number, difficulty = 1): { progress: number; speed: number } {
  const scale = bonusProfile(difficulty).flightScale;
  const t = THREE.MathUtils.clamp(elapsed * scale / ASTEROID_DURATION, 0, 1);
  // Integrate the accelerating flight: harder runs cover the same route more quickly.
  return { progress: 0.6 * t + 0.4 * t * t, speed: (48 + 64 * t) * scale };
}
export function asteroidGap(row: number): THREE.Vector2 { return new THREE.Vector2(Math.sin(row * 0.85) * 20, Math.sin(row * 0.6) * 9); }
export const BONUS_NAMES: Record<BonusKind, string> = { asteroids: 'ASTEROID RUN', canyon: 'CANYON SORTIE', sequence: 'TARGET SEQUENCE' };
export const BONUS_BRIEFS: Record<BonusKind, string> = {
  asteroids: 'Loan skiff. Automatic speed increases throughout the belt. Follow the weaving gaps and scoop yellow salvage. Fly through the green EXIT gate at the end; missing it ends the bonus. Large rocks split into medium rocks, then small drifting fragments. Later belts include fast oncoming pirates and friendly police. Shot rocks can release blue shields (+1 skiff point, 1 in 15) or pink full repairs (1 in 30). Collect them to repair. Charged blasts vaporize nearby rocks and pirates, never police.',
  canyon: `Automatic acceleration: no throttle or brake. ${CANYON_COMBAT_BRIEF} ${CANYON_REPAIR_BRIEF} ${CANYON_GATE_BRIEF} Later canyons add fixed and retracting pillars, then half-walls. Dodge around or over them. Fly through EXIT in the final wall or crash.`,
  sequence: 'Shoot the shuffled numbers in order. The yellow marker is next. After your first hit, the remaining targets drift faster as you clear them. Correct target: +100 points. Every shot: -5 points, including misses (Spread counts as one volley). Wrong targets also cost two seconds. Only your bonus score is at risk.'
};
export function bonusBrief(kind: BonusKind, difficulty: number, scheme: ControlScheme = 'mouse'): string {
  const profile = bonusProfile(difficulty);
  const details = kind === 'sequence' ? `${profile.targetCount} targets. Shoot 1 to ${profile.targetCount}.`
    : kind === 'asteroids' ? `${profile.asteroidRows} rock formations. Speed ${Math.round(48 * profile.flightScale)} to ${Math.round(112 * profile.flightScale)}.`
      : `${profile.canyonObstacles} obstacles / ${Math.ceil(profile.canyonObstacles / 2)} guns. Speed ${Math.round(48 * profile.flightScale)} to ${Math.round(144 * profile.flightScale)}, plus boost.`;
  return `${details} ${BONUS_BRIEFS[kind]} ${kind === 'canyon' ? boostControls(scheme) + ' ' : ''}${flightControls(scheme)} ${pauseControls(scheme)} Choose Exit Bonus to leave safely.`;
}

export class BonusController {
  // Everything temporary is attached beneath root for hiding/disposal as one course.
  readonly root = new THREE.Group();
  readonly state: BonusRunState;
  readonly path: THREE.CatmullRomCurve3;
  readonly canyon?: CanyonCourse;
  readonly repairs: SkiffRepairDrops;
  readonly cargo: CanyonHaul;
  readonly traffic?: AsteroidTraffic;
  private objects: BonusObject[] = [];
  private readonly rng: Random;
  private offset = new THREE.Vector2();
  private yaw = 0;
  private pitch = 0;
  private markerClock = 0;
  private markerSpeed = 0;
  private asteroidGate: BonusObject | null = null;
  private rockColorIndex = 0;
  private exitAnnounced = false;
  private collisionDelay = 0;
  private canyonImpactDelay = 0;
  protect(seconds: number): void { this.collisionDelay = Math.max(this.collisionDelay, seconds); }
  private blastEffect: { object: THREE.LineSegments; life: number; direction: THREE.Vector3 } | null = null;
  private bolts: Array<{ object: THREE.Object3D; direction: THREE.Vector3; speed: number; life: number }> = [];
  private previous = new THREE.Vector3();
  private readonly profile;
  constructor(kind: BonusKind, seed: number, difficulty = 1) {
    const profile = this.profile = bonusProfile(difficulty);
    const duration = kind === 'asteroids' ? ASTEROID_DURATION / profile.flightScale : kind === 'canyon' ? 75 : 60;
    this.state = { kind, family: 'pulse', elapsed: 0, duration, remaining: duration, health: 3, shield: kind === 'canyon' ? CANYON_MAX_SHIELD : 0, haul: 0, charge: 100, points: 0,
      difficulty: profile.level, targetCount: profile.targetCount, shotsFired: 0, nextMarker: 1, finished: false, reason: null, notice: '', fractures: 0, enemyShots: 0 };
    const rng = this.rng = new Random(seed);
    // Keep pickup rolls separate from route/fragment randomness for reproducible layouts.
    const repairRng = new Random(seed ^ 0x51f15e);
    this.repairs = new SkiffRepairDrops(this.root, () => repairRng.next());
    const haulRng = new Random(seed ^ 0x4a117);
    this.cargo = new CanyonHaul(this.root, () => haulRng.next());
    if (kind === 'canyon') {
      // CanyonCourse handles its path, gates and gunfire; this wrapper supplies the
      // common weapon, three-hit health and completion interface used by all courses.
      this.canyon = new CanyonCourse(this.root, seed, profile.level); this.path = this.canyon.path;
      this.objects.push(...this.canyon.targets); this.state.remaining = this.canyon.remaining;
      this.state.duration = this.state.remaining; return;
    }
    const points = Array.from({ length: 17 }, (_, index) => new THREE.Vector3(0, 0, -index * ASTEROID_LENGTH / 16));
    this.path = new THREE.CatmullRomCurve3(points);
    if (kind === 'sequence') {
      const numbers = Array.from({ length: profile.targetCount }, (_, i) => i + 1);
      // Fisher-Yates shuffle: every marker number appears once, with a reproducible
      // order. Keep positions in cells so moving labels cannot collide later.
      for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
      }
      const columns = Math.ceil(Math.sqrt(profile.targetCount)), rows = Math.ceil(profile.targetCount / columns);
      for (let i = 0; i < profile.targetCount; i += 1) {
        const number = numbers[i];
        const radius = rng.range(profile.targetMinRadius, 9);
        const object = new THREE.Group();
        object.add(createPulseRing(number === 1 ? 0xffff50 : 0x39708a, radius, 0, number === 1 ? 0.95 : 0.5, 8));
        object.add(createTextSprite(String(number), '#ffffff', undefined, 42 * radius / 9, 14 * radius / 9));
        object.position.set((i % columns - (columns - 1) / 2) * 36 + rng.range(-profile.targetJitter, profile.targetJitter),
          ((rows - 1) / 2 - Math.floor(i / columns)) * 32 + rng.range(-profile.targetJitter, profile.targetJitter), -190);
        this.add('marker', object, radius + 1, number).marker = { home: object.position.clone(), phase: rng.range(0, Math.PI * 2), direction: rng.next() < 0.5 ? -1 : 1,
          amplitude: new THREE.Vector2(17 - radius - profile.targetJitter, 15 - radius - profile.targetJitter) };
      }
    } else {
      this.traffic = new AsteroidTraffic(this.root, seed, profile.level);
      for (let i = 1; i <= profile.asteroidRows; i += 1) {
        const row = i * 55 / profile.asteroidRows, t = row / 58;
        const center = this.path.getPoint(t);
        const gap = asteroidGap(row);
        const angle = rng.range(0, Math.PI * 2);
        for (let j = 0; j < 2; j += 1) {
          const radius = rng.range(10, 13);
          const z = center.z + rng.range(-14, 14);
          const route = asteroidGap(-z / ASTEROID_LENGTH * 58);
          const bearing = angle + j * Math.PI + rng.range(-0.35, 0.35);
          const distance = radius + rng.range(16, 21);
          // Scatter around the route at each rock's actual depth, keeping its opening clear.
          const position = new THREE.Vector3(route.x + Math.cos(bearing) * distance, route.y + Math.sin(bearing) * distance, z);
          if (!this.traffic.replaceRock((i - 1) * 2 + j, position)) this.addRock(position, radius, 2);
        }
        if (i % 2 === 0) {
          const salvage = createCargoModel('credits');
          salvage.position.copy(center).add(new THREE.Vector3(gap.x, gap.y, 15));
          this.add('salvage', salvage, 8);
        }
      }
      const gate = new THREE.Group(), radius = 18, gap = asteroidGap(55);
      gate.add(createPulseRing(0x48ff95, radius, 0, 1, 8), createPulseRing(0x48ff95, radius, -5, 0.6, 8));
      const label = createTextSprite('EXIT', '#ffff70', undefined, 70, 22);
      label.position.set(0, radius + 23, 4); gate.add(label);
      gate.add(lineShape([[0, radius + 14, 4], [0, radius + 2, 4], [-4, radius + 6, 4], [4, radius + 6, 4]], [[0, 1], [1, 2], [1, 3]], 0xffff70));
      gate.position.set(gap.x, gap.y, -ASTEROID_LENGTH);
      this.asteroidGate = this.add('gate', gate, radius);
    }
  }
  private add(kind: BonusObject['kind'], object: THREE.Object3D, radius: number, number = 0): BonusObject {
    this.root.add(object);
    const item = { kind, object, radius, number, used: false };
    this.objects.push(item);
    return item;
  }
  private addRock(position: THREE.Vector3, radius: number, size: 0 | 1 | 2, velocity = new THREE.Vector3(), inheritedColor?: number): void {
    // Cycle mineral colours without consuming layout randomness. Fragments inherit
    // their parent's colour, so this cosmetic change cannot alter a seeded route.
    const color = inheritedColor ?? ASTEROID_COLORS[this.rockColorIndex++ % ASTEROID_COLORS.length];
    const geometry = size === 2 ? new THREE.IcosahedronGeometry(radius, 0) : new THREE.OctahedronGeometry(radius, 0);
    const object = edgesFromGeometry(geometry, color, 0.9);
    object.position.copy(position); object.rotation.set(this.rng.range(0, 3), this.rng.range(0, 3), this.rng.range(0, 3));
    this.add('rock', object, radius).rock = { size, color, velocity, previous: position.clone(), age: 0,
      grace: size < 2 ? ASTEROID_FRAGMENT_GRACE : 0, spin: this.rng.range(-1, 1) * (size === 2 ? 0.25 : 1.4) };
  }
  private breakRock(item: BonusObject): void {
    // Large -> two medium -> two small per medium. Fresh fragments have brief
    // collision grace, and a hard cap prevents a splitting chain overwhelming WebGL.
    this.consume(item);
    const rock = item.rock;
    if (!rock || rock.size === 0) return;
    if (this.objects.filter(other => !other.used && other.rock && other.rock.size < 2).length + 2 > MAX_ASTEROID_FRAGMENTS) return;
    const size = (rock.size - 1) as 0 | 1, radius = item.radius * 0.57;
    const angle = this.rng.range(0, Math.PI * 2), spread = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const speed = (size === 1 ? 11 : 18) * this.profile.motionScale;
    for (const side of [-1, 1]) {
      const position = item.object.position.clone().addScaledVector(spread, side * radius * 1.2);
      const velocity = rock.velocity.clone().multiplyScalar(0.4).addScaledVector(spread, side * speed);
      velocity.z = this.rng.range(14, 23);
      this.addRock(position, radius, size, velocity, rock.color);
    }
    this.state.fractures++;
  }
  get rocks() {
    return this.objects.filter(item => !item.used && item.rock).map(item => ({ id: item.object.id, size: item.rock!.size,
      radius: item.radius, position: item.object.position.toArray(), velocity: item.rock!.velocity.toArray(), grace: item.rock!.grace }));
  }
  get radarContacts() {
    return courseRadarContacts({ objects: this.objects, canyon: this.canyon, repairs: this.repairs, cargo: this.cargo, traffic: this.traffic });
  }
  get targetSequence() {
    if (this.state.kind !== 'sequence') return undefined;
    return { speed: this.markerSpeed, targets: this.objects.filter(item => item.kind === 'marker').map(item => ({
      id: item.object.id, number: item.number, radius: item.radius - 1, position: item.object.position.toArray(), used: item.used,
      highlighted: !item.used && item.number === this.state.nextMarker
    })) };
  }
  get asteroidRun() {
    if (!this.asteroidGate) return undefined;
    return { ...asteroidFlight(this.state.elapsed, this.state.difficulty), gate: { position: this.asteroidGate.object.position.toArray(), radius: this.asteroidGate.radius },
      exitApproach: this.exitAnnounced, ships: this.traffic?.snapshot ?? [] };
  }
  step(dt: number, look: { x: number; y: number; boost?: boolean }, camera: THREE.PerspectiveCamera): void {
    if (this.state.finished) return;
    this.state.elapsed += dt;
    this.state.remaining = Math.max(0, this.state.remaining - dt);
    this.collisionDelay = Math.max(0, this.collisionDelay - dt);
    this.canyonImpactDelay = Math.max(0, this.canyonImpactDelay - dt);
    this.previous.copy(camera.position);
    if (this.canyon) {
      const events = this.canyon.step(dt, look, camera);
      this.state.remaining = this.canyon.remaining;
      this.state.points += events.points; this.state.enemyShots += events.shots;
      if (events.notice) this.state.notice = events.notice;
      if (events.end) this.finish(events.end);
      else for (const source of events.damage) this.damage(source);
    } else if (this.state.kind === 'sequence') {
      // Delay motion until the first correct hit so the player can recognize the
      // field, then ease toward faster movement as the sequence is completed.
      if (this.state.nextMarker > 1) {
        const speed = (0.7 + (this.state.nextMarker - 2) / (this.state.targetCount - 1) * 2.1) * this.profile.motionScale;
        this.markerSpeed = Math.min(4.5, speed, this.markerSpeed + dt * 1.5 * this.profile.motionScale);
        this.markerClock += dt * this.markerSpeed;
      }
      this.yaw = THREE.MathUtils.clamp(this.yaw - look.x * 0.0022, -0.55, 0.55);
      this.pitch = THREE.MathUtils.clamp(this.pitch - look.y * 0.0022, -0.45, 0.45);
      camera.position.set(0, 0, 0);
      camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    } else {
      this.offset.x = THREE.MathUtils.clamp(this.offset.x + look.x * 0.13, -38, 38);
      this.offset.y = THREE.MathUtils.clamp(this.offset.y - look.y * 0.13, -24, 30);
      const t = asteroidFlight(this.state.elapsed, this.state.difficulty).progress;
      const position = this.path.getPointAt(t);
      camera.position.copy(position).add(new THREE.Vector3(this.offset.x, this.offset.y, 0));
      camera.lookAt(camera.position.clone().add(new THREE.Vector3(0, 0, -1)));
      camera.rotateZ(-this.offset.x * 0.002);
      if (!this.exitAnnounced && t >= 0.75) { this.exitAnnounced = true; this.state.notice = 'EXIT GATE AHEAD / FLY THROUGH THE OPENING'; }
      const traffic = this.traffic?.step(dt, this.state.elapsed, this.previous, camera.position);
      if (traffic?.notice && !this.exitAnnounced) this.state.notice = traffic.notice;
      if (traffic) for (let i = 0; i < traffic.impacts; i++) this.damage();
    }
    for (const item of this.objects) {
      if (item.used || this.canyon || item.kind === 'gate') continue;
      if (item.rock) {
        const rock = item.rock;
        rock.previous.copy(item.object.position);
        rock.age += dt; rock.grace = Math.max(0, rock.grace - dt);
        item.object.position.addScaledVector(rock.velocity, dt); item.object.rotation.x += rock.spin * dt; item.object.rotation.y += rock.spin * dt * 0.7;
        if (rock.size < 2) {
          const material = (item.object as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>).material;
          material.color.setHex(rock.grace > 0 ? 0xfff5dd : rock.color);
          if (rock.age > 12 || item.object.position.z > camera.position.z + 40) { this.consume(item); continue; }
        }
        if (rock.grace > 0) continue;
      }
      if (item.kind === 'marker') {
        if (item.marker && this.markerClock > 0) {
          const motion = item.marker, time = this.markerClock * motion.direction, blend = Math.min(1, this.markerClock);
          // Each differently sized ring stays inside its own cell, including its seeded offset.
          item.object.position.copy(motion.home).add(new THREE.Vector3(
            Math.sin(time + motion.phase) * motion.amplitude.x * blend, Math.cos(time * 0.8 + motion.phase) * motion.amplitude.y * blend, 0));
        }
        item.object.traverse(child => {
          if (child instanceof THREE.LineSegments) {
            const material = child.material as THREE.LineBasicMaterial;
            material.color.setHex(item.number === this.state.nextMarker ? 0xffff50 : 0x39708a);
            material.opacity = item.number === this.state.nextMarker ? 0.75 + Math.sin(this.state.elapsed * 7) * 0.2 : 0.5;
          }
        });
      } else if (sweptHit(this.previous, camera.position, item.rock?.previous ?? item.object.position, item.object.position, item.radius + 2) !== null) {
        this.consume(item);
        if (item.kind === 'rock' || item.kind === 'turret') this.damage();
        else this.state.points += 3;
      }
    }
    this.objects = this.objects.filter(item => {
      if (!item.used || !item.rock || item.rock.size === 2) return true;
      this.root.remove(item.object); disposeObject(item.object); return false;
    });
    if (!this.state.finished) {
      this.state.health = this.repairs.step(dt, this.previous, camera.position, this.state.health);
      if (this.repairs.notice) this.state.notice = this.repairs.notice;
      if (this.canyon) {
        for (const kind of this.repairs.collectedThisStep) this.state.shield = repairedCanyonShield(this.state.shield, kind);
        const collected = this.cargo.step(dt, this.previous, camera.position);
        if (collected) { this.state.haul += collected; this.state.notice = `HAUL +${collected} / CARRYING ${this.state.haul}`; }
      }
    }
    for (const bolt of this.bolts) { bolt.life -= dt; bolt.object.position.addScaledVector(bolt.direction, bolt.speed * dt); }
    this.bolts = this.bolts.filter(bolt => { if (bolt.life > 0) return true; this.root.remove(bolt.object); disposeObject(bolt.object); return false; });
    if (this.blastEffect) {
      const effect = this.blastEffect;
      effect.life = Math.max(0, effect.life - dt);
      effect.object.position.addScaledVector(effect.direction, 80 * dt);
      effect.object.scale.setScalar(1 + (1 - effect.life / 0.65) * 4);
      (effect.object.material as THREE.LineBasicMaterial).opacity = effect.life / 0.65;
      if (effect.life === 0) { this.root.remove(effect.object); disposeObject(effect.object); this.blastEffect = null; }
    }
    if (this.asteroidGate && this.state.elapsed >= this.state.duration) {
      const gate = this.asteroidGate;
      this.finish(crossedGate(this.previous, camera.position, gate.object.position, gate.object.quaternion, gate.radius * Math.cos(Math.PI / 8) - 2) ? 'complete' : 'gateMissed');
    } else if (!this.canyon && this.state.kind === 'sequence' && this.state.remaining <= 0) this.finish('timeout');
  }
  shoot(camera: THREE.PerspectiveCamera): boolean {
    if (this.state.finished) return false;
    this.state.shotsFired++;
    if (this.state.kind === 'sequence') this.state.points -= TARGET_SHOT_COST;
    const spec = weaponSpec(this.state.family, 1);
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    // Course fire resolves hits immediately by ray, with traveling bolts as visuals.
    // Snapshot targets before firing so a volley cannot also hit fragments it creates.
    const candidates: BonusObject[] = [...this.objects, ...(this.canyon?.shots ?? []), ...(this.traffic?.ships ?? [])]
      .filter(item => !item.used && item.kind !== 'gate' && item.kind !== 'salvage' && item.kind !== 'police');
    let confirmed = false, wrongMarker = false, targetHit = false, misses = 0;
    for (let index = 0; index < spec.count; index++) {
      const direction = forward.clone().applyAxisAngle(up, (index - (spec.count - 1) / 2) * spec.spread);
      const ray = new THREE.Ray(camera.position, direction);
      const range = this.canyon?.barriers.shotDistance(ray, 650) ?? 650;
      const targets = candidates.filter(item => !item.used)
        .map(item => ({ item, point: ray.intersectSphere(new THREE.Sphere(item.object.position, item.radius), new THREE.Vector3()) }))
        .filter(hit => hit.point && hit.point.distanceTo(camera.position) < range)
        .sort((a, b) => a.point!.distanceToSquared(camera.position) - b.point!.distanceToSquared(camera.position));
      const bolt = createBoltModel(spec.color, spec.radius, spec.length, 'player', this.state.family);
      bolt.position.copy(camera.position).addScaledVector(direction, 10);
      bolt.lookAt(bolt.position.clone().add(direction)); this.root.add(bolt);
      this.bolts.push({ object: bolt, direction, speed: spec.speed, life: Math.min(0.7, Math.max(0, range - 10) / spec.speed) });
      let boltHit = false;
      for (const { item } of targets.slice(0, spec.pierce)) {
        if (item.kind === 'marker') {
          if (item.number !== this.state.nextMarker) { wrongMarker = true; continue; }
          this.state.nextMarker += 1;
          this.state.points += TARGET_HIT_POINTS; this.consume(item);
          if (this.state.nextMarker > this.state.targetCount) this.finish('complete');
        } else if (item.kind === 'hostileBolt') {
          this.state.points += canyonTargetPoints('hostileBolt');
          this.consume(item); this.chargeBlast(10);
        } else {
          this.state.points += this.canyon && (item.kind === 'turret' || item.kind === 'obstacle') ? canyonTargetPoints(item.kind) : 1;
          if (this.canyon && item.kind === 'obstacle') this.cargo.release(item.object.position);
          if (item.kind === 'rock' || item.kind === 'obstacle' || item.kind === 'turret') this.repairs.release(item.kind, item.object.position);
          if (item.kind === 'rock') this.breakRock(item); else this.consume(item);
        }
        boltHit = true;
        confirmed = true;
        if (item.kind !== 'hostileBolt') targetHit = true;
      }
      if (!boltHit) misses++;
    }
    if (this.canyon && misses) {
      const cost = misses * CANYON_SHOT_MISS_COST;
      this.state.points -= cost; this.state.notice = `SHOT MISSED -${cost}`;
    }
    // A spread volley can touch the same wrong marker more than once: penalize the trigger pull once.
    if (wrongMarker) { this.state.remaining = Math.max(0, this.state.remaining - 2); this.state.notice = 'WRONG MARKER: -2 SECONDS'; }
    if (targetHit) this.chargeBlast(5);
    return confirmed;
  }
  private chargeBlast(amount: number): void {
    if (!this.canyon?.penalty) this.state.charge = Math.min(100, this.state.charge + amount);
  }
  blast(camera: THREE.PerspectiveCamera): boolean {
    // Blasts consume the whole charge and vaporize hazards without splitting rocks.
    // Salvage, gates and numbered markers are deliberately outside this target list.
    if (this.state.finished || this.state.charge < 100) return false;
    this.state.charge = 0;
    for (const item of [...this.objects, ...(this.traffic?.ships ?? [])]) {
      if (item.used || (item.kind !== 'rock' && item.kind !== 'turret' && item.kind !== 'obstacle' && item.kind !== 'pirate') || item.object.position.distanceTo(camera.position) > 240) continue;
      this.consume(item);
      this.state.points += this.canyon && (item.kind === 'turret' || item.kind === 'obstacle') ? canyonTargetPoints(item.kind) : 1;
    }
    this.canyon?.clearFire(camera.position);
    if (this.blastEffect) { this.root.remove(this.blastEffect.object); disposeObject(this.blastEffect.object); }
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const object = createPulseRing(0xcaffff, 18, 0, 1, 24);
    object.position.copy(camera.position).addScaledVector(direction, 90);
    object.quaternion.copy(camera.quaternion);
    this.root.add(object);
    this.blastEffect = { object, life: 0.65, direction };
    return true;
  }
  private consume(item: BonusObject): void {
    if (item.kind === 'pirate' && this.traffic) this.traffic.destroy(item);
    else { item.used = true; item.object.visible = false; }
  }
  private damage(source?: CanyonImpact): void {
    if (this.collisionDelay > 0 || this.state.finished) return;
    if (source) {
      // Sustained wall contact has a grace interval; separate gun hits each count.
      if (source !== 'gun' && this.canyonImpactDelay > 0) return;
      Object.assign(this.state, damageCanyonSkiff(this.state, source));
      if (source !== 'gun') this.canyonImpactDelay = 1.2;
    } else { this.state.health -= 1; this.collisionDelay = 1.2; }
    if (this.state.health <= 0) this.finish('crash');
  }
  finish(reason: NonNullable<BonusRunState['reason']>): void {
    // Preserve the first outcome: a later timeout must not replace a gate success.
    if (this.state.finished) return;
    this.state.finished = true;
    this.state.reason = reason;
  }
  get ratio(): number {
    // Optional medals use partial progress. Smuggler retains flight points on
    // every outcome and uses its own additional reward for a successful exit.
    if (this.state.kind === 'sequence') return THREE.MathUtils.clamp(this.state.points / (this.state.targetCount * (TARGET_HIT_POINTS - TARGET_SHOT_COST)), 0, 1);
    if (this.canyon) return THREE.MathUtils.clamp(this.canyon.progress * 0.3 + this.canyon.passed / 18 * 0.4 + this.state.points / this.canyon.gatePointsAvailable * 0.3, 0, 1);
    return Math.min(1, (this.state.elapsed / this.state.duration) * 0.4 + this.state.points / this.profile.asteroidRows * 0.6);
  }
  dispose(): void { disposeObject(this.root); this.root.clear(); }
}
