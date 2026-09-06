import * as THREE from 'three';
import type { BonusKind } from './arcade';
import { Random } from './encounters';
import { createBoltModel, createCargoModel, createPulseRing, createTextSprite, disposeObject, edgesFromGeometry, lineShape } from './models';
import { sweptHit } from './weapons';

export interface BonusRunState {
  kind: BonusKind;
  elapsed: number;
  duration: number;
  remaining: number;
  health: number;
  points: number;
  nextMarker: number;
  finished: boolean;
  reason: 'complete' | 'crash' | 'timeout' | 'exit' | null;
  notice: string;
}
interface BonusObject { kind: 'rock' | 'salvage' | 'gate' | 'marker' | 'turret'; object: THREE.Object3D; radius: number; number: number; used: boolean }
export const BONUS_NAMES: Record<BonusKind, string> = { asteroids: 'ASTEROID RUN', canyon: 'CANYON SORTIE', sequence: 'TARGET SEQUENCE' };
export const BONUS_BRIEFS: Record<BonusKind, string> = {
  asteroids: 'Loan skiff. Dodge the rocks, shoot a path, and scoop yellow salvage. Mouse steers; hold left click to fire. Right click exits safely.',
  canyon: 'Loan skiff. Follow the canyon, pass through the green gates, and shoot red surface targets. Mouse steers; hold left click to fire. Right click exits safely.',
  sequence: 'Shoot all sixteen numbered markers in order. The yellow marker is next. Wrong targets cost two seconds. Mouse aims; left click fires. Right click exits safely.'
};

export class BonusController {
  readonly root = new THREE.Group();
  readonly state: BonusRunState;
  readonly path: THREE.CatmullRomCurve3;
  private objects: BonusObject[] = [];
  private offset = new THREE.Vector2();
  private yaw = 0;
  private pitch = 0;
  private collisionDelay = 0;
  private bolts: Array<{ object: THREE.Object3D; direction: THREE.Vector3; life: number }> = [];
  private previous = new THREE.Vector3();
  constructor(kind: BonusKind, seed: number) {
    const duration = kind === 'canyon' ? 75 : 60;
    this.state = { kind, elapsed: 0, duration, remaining: duration, health: 3, points: 0, nextMarker: 1, finished: false, reason: null, notice: '' };
    const rng = new Random(seed);
    const points = Array.from({ length: 17 }, (_, index) => new THREE.Vector3(kind === 'canyon' ? Math.sin(index * 0.8) * 80 : 0,
      kind === 'canyon' ? Math.sin(index * 0.45) * 12 : 0, -index * 300));
    this.path = new THREE.CatmullRomCurve3(points);
    if (kind === 'sequence') {
      for (let i = 0; i < 16; i += 1) {
        const object = new THREE.Group();
        object.add(createPulseRing(0x77dfff, 9, 0, 0.9, 8));
        object.add(createTextSprite(String(i + 1), '#ffffff', undefined, 12, 8));
        object.position.set((i % 4 - 1.5) * 33, (1.5 - Math.floor(i / 4)) * 27, -170 - (i % 3) * 18);
        this.add('marker', object, 10, i + 1);
      }
    } else {
      for (let i = 1; i <= 55; i += 1) {
        const t = i / 58;
        const center = this.path.getPoint(t);
        if (kind === 'canyon') {
          const next = this.path.getPoint(Math.min(1, t + 1 / 58));
          const vertices: Array<[number, number, number]> = [
            [center.x - 43, -32 + center.y, center.z], [center.x - 50, 42 + center.y, center.z],
            [center.x + 43, -32 + center.y, center.z], [center.x + 50, 42 + center.y, center.z],
            [next.x - 43, -32 + next.y, next.z], [next.x - 50, 42 + next.y, next.z],
            [next.x + 43, -32 + next.y, next.z], [next.x + 50, 42 + next.y, next.z]
          ];
          this.root.add(lineShape(vertices, [[0, 1], [2, 3], [0, 2], [0, 4], [1, 5], [2, 6], [3, 7]], 0x508bc6, 0.7));
          if (i % 3 === 0) {
            const gate = createPulseRing(0x48ff95, 13, 0, 0.8, 8);
            gate.position.copy(center).add(new THREE.Vector3(Math.sin(i) * 16, Math.cos(i) * 12, 0));
            this.add('gate', gate, 15);
            const target = edgesFromGeometry(new THREE.TetrahedronGeometry(6), 0xff4055);
            target.position.copy(center).add(new THREE.Vector3(i % 2 ? 25 : -25, -17, -25));
            this.add('turret', target, 8);
          }
        } else {
          for (let j = 0; j < 2; j += 1) {
            const rock = edgesFromGeometry(new THREE.IcosahedronGeometry(rng.range(5, 11), 0), 0xb1a596, 0.85);
            // Keep the central flight corridor clear; riskier salvage lies beside the rocks.
            rock.position.copy(center).add(new THREE.Vector3((j ? 1 : -1) * rng.range(14, 55), rng.range(-24, 24), rng.range(-12, 12)));
            this.add('rock', rock, 8);
          }
          if (i % 2 === 0) {
            const salvage = createCargoModel('credits');
            salvage.position.copy(center).add(new THREE.Vector3(Math.sin(i) * 16, Math.cos(i) * 10, 15));
            this.add('salvage', salvage, 8);
          }
        }
      }
    }
  }
  private add(kind: BonusObject['kind'], object: THREE.Object3D, radius: number, number = 0): void {
    this.root.add(object);
    this.objects.push({ kind, object, radius, number, used: false });
  }
  step(dt: number, look: { x: number; y: number }, camera: THREE.PerspectiveCamera): void {
    if (this.state.finished) return;
    this.state.elapsed += dt;
    this.state.remaining = Math.max(0, this.state.remaining - dt);
    this.collisionDelay = Math.max(0, this.collisionDelay - dt);
    this.previous.copy(camera.position);
    if (this.state.kind === 'sequence') {
      this.yaw = THREE.MathUtils.clamp(this.yaw - look.x * 0.0022, -0.55, 0.55);
      this.pitch = THREE.MathUtils.clamp(this.pitch - look.y * 0.0022, -0.45, 0.45);
      camera.position.set(0, 0, 0);
      camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    } else {
      this.offset.x = THREE.MathUtils.clamp(this.offset.x + look.x * 0.13, -38, 38);
      this.offset.y = THREE.MathUtils.clamp(this.offset.y - look.y * 0.13, -24, 30);
      const t = Math.min(0.998, this.state.elapsed / this.state.duration);
      const position = this.path.getPoint(t);
      camera.position.copy(position).add(new THREE.Vector3(this.offset.x, this.offset.y, 0));
      camera.lookAt(this.path.getPoint(Math.min(1, t + 0.015)).add(new THREE.Vector3(this.offset.x, this.offset.y, 0)));
      camera.rotateZ(-this.offset.x * 0.002);
      if (this.state.kind === 'canyon' && (Math.abs(this.offset.x) > 36 || this.offset.y < -22)) this.damage();
    }
    for (const item of this.objects) {
      if (item.used) continue;
      if (item.kind === 'marker') {
        item.object.traverse(child => {
          if (child instanceof THREE.LineSegments) {
            const material = child.material as THREE.LineBasicMaterial;
            material.color.setHex(item.number === this.state.nextMarker ? 0xffff50 : 0x39708a);
            material.opacity = item.number === this.state.nextMarker ? 0.75 + Math.sin(this.state.elapsed * 7) * 0.2 : 0.5;
          }
        });
      } else if (sweptHit(this.previous, camera.position, item.object.position, item.object.position, item.radius + 2) !== null) {
        this.consume(item);
        if (item.kind === 'rock' || item.kind === 'turret') this.damage();
        else this.state.points += item.kind === 'gate' ? 5 : 3;
      }
    }
    for (const bolt of this.bolts) { bolt.life -= dt; bolt.object.position.addScaledVector(bolt.direction, 520 * dt); }
    this.bolts = this.bolts.filter(bolt => { if (bolt.life > 0) return true; this.root.remove(bolt.object); disposeObject(bolt.object); return false; });
    if (this.state.remaining <= 0) this.finish(this.state.kind === 'sequence' ? 'timeout' : 'complete');
  }
  shoot(camera: THREE.PerspectiveCamera): boolean {
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const ray = new THREE.Ray(camera.position, direction);
    const targets = this.objects.filter(item => !item.used && item.kind !== 'gate' && item.kind !== 'salvage')
      .map(item => ({ item, point: ray.intersectSphere(new THREE.Sphere(item.object.position, item.radius), new THREE.Vector3()) }))
      .filter(hit => hit.point && hit.point.distanceTo(camera.position) < 650)
      .sort((a, b) => a.point!.distanceToSquared(camera.position) - b.point!.distanceToSquared(camera.position));
    const bolt = createBoltModel(0xf8ffee, 2, 14, 'player');
    bolt.position.copy(camera.position).addScaledVector(direction, 10);
    bolt.lookAt(bolt.position.clone().add(direction));
    this.root.add(bolt);
    this.bolts.push({ object: bolt, direction, life: 0.7 });
    const item = targets[0]?.item;
    if (!item) return false;
    if (item.kind === 'marker') {
      if (item.number !== this.state.nextMarker) { this.state.remaining = Math.max(0, this.state.remaining - 2); this.state.notice = 'WRONG MARKER: -2 SECONDS'; return false; }
      this.state.nextMarker += 1;
      this.state.points += 1;
      this.consume(item);
      if (this.state.nextMarker > 16) this.finish('complete');
    } else { this.state.points += item.kind === 'turret' ? 4 : 1; this.consume(item); }
    return true;
  }
  private consume(item: BonusObject): void { item.used = true; item.object.visible = false; }
  private damage(): void {
    if (this.collisionDelay > 0) return;
    this.state.health -= 1;
    this.collisionDelay = 1.2;
    if (this.state.health <= 0) this.finish('crash');
  }
  finish(reason: NonNullable<BonusRunState['reason']>): void {
    if (this.state.finished) return;
    this.state.finished = true;
    this.state.reason = reason;
  }
  get ratio(): number {
    if (this.state.kind === 'sequence') return Math.min(1, this.state.points / 16);
    return Math.min(1, (this.state.elapsed / this.state.duration) * 0.4 + this.state.points / (this.state.kind === 'canyon' ? 75 : 55) * 0.6);
  }
  dispose(): void { disposeObject(this.root); this.root.clear(); }
}
