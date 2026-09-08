/** Solid canyon scenery. Each barrier leaves an escape lane and never stops forward travel. */
import * as THREE from 'three';
import { Random } from './encounters';
import { bonusProfile } from './bonus-difficulty';
import { edgesFromGeometry } from './models/primitives';

export type CanyonBarrierKind = 'pillar' | 'halfPillar' | 'risingPillar' | 'risingHalfPillar' | 'sideWall' | 'floorWall';
export interface CanyonBarrier {
  kind: CanyonBarrierKind; object: THREE.LineSegments; base: THREE.Vector3; width: number; height: number;
  depth: number; phase: number; period: number; bounds: THREE.Box3; previous: THREE.Box3; collided: boolean;
}
const FLOOR = -32;
const HEIGHT = 74;
export function canyonBarrierKinds(difficulty: number): CanyonBarrierKind[] {
  const level = bonusProfile(difficulty).level;
  if (level < 2) return [];
  const kinds: CanyonBarrierKind[] = ['pillar', 'halfPillar'];
  if (level >= 3) kinds.push('risingPillar', 'risingHalfPillar');
  if (level >= 4) kinds.push('sideWall', 'floorWall');
  return kinds;
}
export function canyonBarrierCount(difficulty: number): number {
  const level = bonusProfile(difficulty).level;
  return level < 2 ? 0 : Math.min(18, 4 + (level - 2) * 3);
}
/** Dwell completely below the floor, ease up, dwell, then retract. */
export function pillarExtension(time: number, phase: number, period: number): number {
  const t = ((time / period + phase) % 1 + 1) % 1;
  if (t < 0.2) return 0;
  if (t < 0.5) return THREE.MathUtils.smoothstep(t, 0.2, 0.5);
  if (t < 0.7) return 1;
  return 1 - THREE.MathUtils.smoothstep(t, 0.7, 1);
}
export function createCanyonBarrierModel(kind: CanyonBarrierKind): THREE.LineSegments {
  // Twelve edges, with no diagonal decoration: these read as solid architecture, not crates.
  return edgesFromGeometry(new THREE.BoxGeometry(1, 1, 1), kind.startsWith('rising') ? 0xff68bb : 0xff9050);
}

/** Clip a moving point against six moving box planes, including a pillar's rising top. */
export function sweepCanyonBarrier(from: THREE.Vector3, to: THREE.Vector3, before: THREE.Box3, after: THREE.Box3, radius = 2): number | null {
  let enter = 0, leave = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const distances = [[from[axis] - before.min[axis] + radius, to[axis] - after.min[axis] + radius],
      [before.max[axis] + radius - from[axis], after.max[axis] + radius - to[axis]]];
    for (const [start, end] of distances) {
      if (start < 0 && end < 0) return null;
      if (start < 0) enter = Math.max(enter, start / (start - end));
      if (end < 0) leave = Math.min(leave, start / (start - end));
      if (enter > leave) return null;
    }
  }
  return enter;
}

export class CanyonBarriers {
  readonly items: CanyonBarrier[] = [];
  constructor(root: THREE.Group, path: THREE.Curve<THREE.Vector3>, seed: number, difficulty: number) {
    const random = new Random(seed ^ 0x71ba22), kinds = canyonBarrierKinds(difficulty), count = canyonBarrierCount(difficulty);
    for (let i = 0; i < count; i++) {
      const slot = Math.floor(i * 18 / count), kind = kinds[i % kinds.length];
      // Gate planes are 0.055 + n * 0.05, with EXIT at 0.985. Never put scenery in an opening.
      const progress = slot === 17 ? 0.945 : 0.08 + slot * 0.05;
      const base = path.getPointAt(progress), side = random.next() < 0.5 ? -1 : 1;
      const width = kind === 'sideWall' ? 43 : kind === 'floorWall' ? 96 : random.range(10, 14);
      const height = kind === 'halfPillar' || kind === 'risingHalfPillar' || kind === 'floorWall' ? HEIGHT / 2 : HEIGHT;
      base.x += kind === 'sideWall' ? side * 24.5 : kind === 'floorWall' ? 0 : side * random.range(10, 22);
      base.y += FLOOR;
      const object = createCanyonBarrierModel(kind); root.add(object);
      const barrier: CanyonBarrier = { kind, object, base, width, height, depth: 10, phase: random.next(), period: random.range(7, 10),
        bounds: new THREE.Box3(), previous: new THREE.Box3(), collided: false };
      this.update(barrier, 0); barrier.previous.copy(barrier.bounds); this.items.push(barrier);
    }
  }
  private update(item: CanyonBarrier, time: number): void {
    const extension = item.kind.startsWith('rising') ? pillarExtension(time, item.phase, item.period) : 1;
    // Draw only the exposed portion. At zero extension nothing is visible/collidable above ground.
    const height = item.height * extension;
    item.object.visible = height > 0;
    item.object.scale.set(item.width, height, item.depth);
    item.object.position.copy(item.base).add(new THREE.Vector3(0, height / 2, 0));
    item.bounds.setFromCenterAndSize(item.object.position, item.object.scale);
  }
  step(time: number, previous: THREE.Vector3, position: THREE.Vector3, center: THREE.Vector3, offset: THREE.Vector2): number {
    this.animate(time);
    let impacts = 0;
    for (const item of this.items) {
      if (sweepCanyonBarrier(previous, position, item.previous, item.bounds) === null) continue;
      // Resolve sideways/upwards, never backwards. Even a boosted head-on hit passes the obstacle.
      const candidates = [new THREE.Vector3(item.bounds.min.x - 3, position.y, position.z),
        new THREE.Vector3(item.bounds.max.x + 3, position.y, position.z),
        new THREE.Vector3(position.x, item.bounds.max.y + 3, position.z)]
        .filter(point => Math.abs(point.x - center.x) <= 34 && point.y - center.y <= 28 && point.y - center.y >= -20)
        .sort((a, b) => a.distanceToSquared(position) - b.distanceToSquared(position));
      const escape = candidates[0];
      if (!escape) continue; // Generators leave at least one lane; guard invalid externally supplied geometry.
      position.copy(escape); offset.set(position.x - center.x, position.y - center.y);
      if (!item.collided) { item.collided = true; impacts++; }
    }
    return impacts;
  }
  animate(time: number): void {
    for (const item of this.items) { item.previous.copy(item.bounds); this.update(item, time); }
  }
  hitTime(from: THREE.Vector3, to: THREE.Vector3, radius = 0): number | null {
    let nearest: number | null = null;
    for (const item of this.items) {
      const hit = sweepCanyonBarrier(from, to, item.previous, item.bounds, radius);
      if (hit !== null && (nearest === null || hit < nearest)) nearest = hit;
    }
    return nearest;
  }
  shotDistance(ray: THREE.Ray, range: number): number {
    let nearest = range;
    for (const item of this.items) {
      if (!item.object.visible) continue;
      const hit = ray.intersectBox(item.bounds, new THREE.Vector3());
      if (hit) nearest = Math.min(nearest, hit.distanceTo(ray.origin));
    }
    return nearest;
  }
  get snapshot() {
    return this.items.map(item => ({ kind: item.kind, position: item.object.position.toArray(), size: item.object.scale.toArray(),
      visible: item.object.visible, collided: item.collided }));
  }
}
