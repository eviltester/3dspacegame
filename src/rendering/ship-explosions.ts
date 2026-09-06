/** Two-stage cosmetic destruction: spinning hull panels, then radial spark showers. */
import * as THREE from 'three';
import { Random } from '../encounters';
import { disposeObject } from '../models/primitives';
import { createHullPanels } from './ship-panels';
import type { HullPanel } from './ship-panels';

export const MAX_HULL_FRAGMENTS = 48;
export const MAX_FRAGMENT_BURSTS = 48;
export const FRAGMENT_BURST_LIFE = 0.58;
interface Fragment { object: HullPanel; velocity: THREE.Vector3; axis: THREE.Vector3; spin: number; age: number; fuse: number }
interface Burst { object: HullPanel; velocity: THREE.Vector3; age: number; speed: number }

export class ShipExplosions {
  private fragments: Fragment[] = [];
  private bursts: Burst[] = [];
  // Cosmetic randomness is independent of encounter/loot draws: debris must not
  // change the next cargo drop, even when many ships die in the same blast.
  private readonly rng = new Random(0x5a771e);
  constructor(private readonly world: THREE.Group, private readonly onBurst: (position: THREE.Vector3) => void = () => {}) {}
  get snapshot() { return { panels: this.fragments.length, bursts: this.bursts.length }; }
  get count(): number { return this.fragments.length + this.bursts.length; }
  private direction(): THREE.Vector3 { return new THREE.Vector3(this.rng.range(-1, 1), this.rng.range(-1, 1), this.rng.range(-1, 1)).normalize(); }

  explode(source: THREE.Object3D, drift = new THREE.Vector3()): void {
    const available = MAX_HULL_FRAGMENTS - this.fragments.length;
    if (available <= 0) return;
    const panels = createHullPanels(source, this.world, Math.min(12, available));
    const origin = this.world.worldToLocal(source.getWorldPosition(new THREE.Vector3()));
    panels.forEach((object, i) => {
      const outward = object.position.clone().sub(origin);
      if (outward.lengthSq() < 0.01) outward.copy(this.direction());
      const velocity = outward.normalize().multiplyScalar(this.rng.range(20, 34)).addScaledVector(drift.clone().clampLength(0, 90), 0.25);
      this.world.add(object);
      this.fragments.push({ object, velocity, axis: this.direction(), spin: this.rng.range(3, 6), age: 0,
        fuse: 0.62 + i / Math.max(1, panels.length - 1) * 0.5 + this.rng.range(0, 0.08) });
    });
  }

  private burst(fragment: Fragment): void {
    if (this.bursts.length >= MAX_FRAGMENT_BURSTS) return;
    const positions: number[] = [], colors: number[] = [];
    const tint = fragment.object.material.color;
    for (let i = 0; i < 24; i++) {
      // Each tiny streak expands radially with the same scale animation. All
      // 24 particles share one draw call, rather than creating 24 scene objects.
      const direction = this.direction().multiplyScalar(this.rng.range(0.55, 1));
      positions.push(...direction.clone().multiplyScalar(0.7).toArray(), ...direction.toArray());
      const color = i % 3 === 0 ? new THREE.Color(0xffdf85) : tint.clone().lerp(new THREE.Color(0xffffff), i % 3 === 1 ? 0.45 : 0.1);
      colors.push(...color.toArray(), ...color.toArray());
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const object = new THREE.LineSegments(geometry, material);
    object.name = 'fragment-burst'; object.position.copy(fragment.object.position); object.scale.setScalar(0.6);
    this.world.add(object);
    this.bursts.push({ object, velocity: fragment.velocity.clone().multiplyScalar(0.2), age: 0, speed: this.rng.range(26, 38) });
    this.onBurst(this.world.localToWorld(object.position.clone()));
  }

  update(dt: number): void {
    // Update old bursts before spawning new ones. A newly detonated panel gets a
    // full visible burst lifetime, instead of disappearing during the same tick.
    this.bursts = this.bursts.filter(burst => {
      burst.age += dt;
      if (burst.age >= FRAGMENT_BURST_LIFE) { this.remove(burst.object); return false; }
      burst.object.position.addScaledVector(burst.velocity, dt);
      burst.object.scale.setScalar(0.6 + burst.age * burst.speed);
      // Hold a bright peak, then fade quickly; tiny distant streaks should remain
      // readable instead of spending most of their short lifetime almost invisible.
      burst.object.material.opacity = Math.min(1, (1 - burst.age / FRAGMENT_BURST_LIFE) * 2.5);
      return true;
    });
    this.fragments = this.fragments.filter(fragment => {
      const travel = Math.max(0, Math.min(dt, fragment.fuse - fragment.age));
      fragment.age += dt;
      fragment.object.position.addScaledVector(fragment.velocity, travel);
      fragment.object.rotateOnAxis(fragment.axis, fragment.spin * travel);
      if (fragment.age >= fragment.fuse) { this.burst(fragment); this.remove(fragment.object); return false; }
      const remaining = fragment.fuse - fragment.age;
      fragment.object.material.opacity = remaining < 0.18 ? 0.7 + Math.sin(fragment.age * 55) * 0.25 : 0.95;
      return true;
    });
  }

  private remove(object: HullPanel): void { this.world.remove(object); disposeObject(object); }
  clear(): void {
    // Stage changes cancel pending secondary bursts; no timer callbacks survive.
    for (const { object } of [...this.fragments, ...this.bursts]) this.remove(object);
    this.fragments = []; this.bursts = [];
  }
}
