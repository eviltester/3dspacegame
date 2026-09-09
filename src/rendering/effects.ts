/** Short-lived visual effects only; sparks and warp rings are not collision actors. */
import * as THREE from 'three';
import { Random } from '../encounters';
import type { Actor } from '../combat/types';
import { createPulseRing, createStarTexture, createTextSprite, disposeObject, lineShape } from '../models';
import { ShipExplosions } from './ship-explosions';

interface Particle { object: THREE.Object3D; velocity: THREE.Vector3; life: number; duration: number; warpIn?: boolean }
export class EffectsSystem {
  private particles: Particle[] = [];
  private readonly explosions: ShipExplosions;
  constructor(private readonly world: THREE.Group, private readonly random: () => Random, onBurst?: (position: THREE.Vector3) => void) {
    this.explosions = new ShipExplosions(world, onBurst);
  }
  private get rng(): Random { return this.random(); }
  get warpCount(): number { return this.particles.filter(p => p.warpIn).length; }
  get count(): number { return this.particles.length + this.explosions.count; }
  get destruction() { return this.explosions.snapshot; }
  explodeShip(actor: Actor): void {
    this.explosions.explode(actor.object, actor.object.position.clone().sub(actor.previous).multiplyScalar(60));
  }
  flybyScore(position: THREE.Vector3, score: number): void {
    const label = createTextSprite(`+${score}`, '#ffff70', undefined, 0.16, 0.05);
    label.name = 'flyby-score'; label.userData.score = score;
    label.position.copy(position);
    // Billboard below the destruction point; distant flybys must not have tiny
    // rewards. The sprite's anchor moves only its drawing, never the actor.
    label.center.set(0.5, 1.6); label.material.sizeAttenuation = false;
    label.material.depthTest = false; label.renderOrder = 10;
    this.world.add(label);
    this.particles.push({ object: label, velocity: new THREE.Vector3(), life: 2.2, duration: 2.2 });
  }
  clear(): void {
    this.explosions.clear();
    for (const particle of this.particles) { this.world.remove(particle.object); disposeObject(particle.object); }
    this.particles = [];
  }
  blast(position: THREE.Vector3, orientation: THREE.Quaternion): void {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(orientation);
    const ring = createPulseRing(0xcaffff, 18, 0, 1, 24);
    ring.position.copy(position).addScaledVector(forward, 28); ring.quaternion.copy(orientation);
    this.world.add(ring); this.particles.push({ object: ring, velocity: forward.multiplyScalar(50), life: 0.65, duration: 0.65 });
  }
  warpIn(actors: readonly Actor[], orientation: THREE.Quaternion): void {
    for (const actor of actors) {
      const radius = actor.radius * 1.8;
      const points: number[] = [];
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        const next = (i + 1) * Math.PI / 6;
        points.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0,
          Math.cos(next) * radius, Math.sin(next) * radius, 0);
        if (i % 2 === 0) points.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0,
          Math.cos(angle) * radius * 1.4, Math.sin(angle) * radius * 1.4, -radius * 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const object = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xffb060, transparent: true, depthWrite: false }));
      object.position.copy(actor.object.position);
      object.quaternion.copy(orientation);
      object.scale.setScalar(1.6);
      this.world.add(object);
      this.particles.push({ object, velocity: new THREE.Vector3(), life: 0.85, duration: 0.85, warpIn: true });
    }
  }
  spark(position: THREE.Vector3, color: number, count: number): void {
    // Drop excess cosmetic sparks during busy fights instead of expanding the
    // particle workload without bound. Damage and rewards have already happened.
    for (let i = 0; i < count && this.particles.length < 160; i += 1) {
      const direction = new THREE.Vector3(this.rng.range(-1, 1), this.rng.range(-1, 1), this.rng.range(-1, 1)).normalize();
      const part = lineShape([[0, 0, 0], [direction.x * 5, direction.y * 5, direction.z * 5]], [[0, 1]], color);
      part.position.copy(position); this.world.add(part);
      this.particles.push({ object: part, velocity: direction.multiplyScalar(this.rng.range(15, 70)), life: 0.5, duration: 0.5 });
    }
  }
  update(dt: number): void {
    this.explosions.update(dt);
    for (const part of this.particles) {
      part.life -= dt; part.object.position.addScaledVector(part.velocity, dt);
      if (part.warpIn) part.object.scale.setScalar(0.2 + Math.max(0, part.life / part.duration) * 1.4);
      if (part.object instanceof THREE.LineSegments) (part.object.material as THREE.LineBasicMaterial).opacity = Math.max(0, part.life / part.duration);
      if (part.object instanceof THREE.Sprite) part.object.material.opacity = Math.max(0, part.life / part.duration);
    }
    this.particles = this.particles.filter(part => { if (part.life > 0) return true; this.world.remove(part.object); disposeObject(part.object); return false; });
  }
}
export function createStarfield(): THREE.Points {
    // Separate fixed seed: rebuilding the background must not consume the
    // encounter's random sequence or change which ships/cargo arrive next.
    const rng = new Random(83811); const positions = new Float32Array(480 * 3);
    for (let i = 0; i < positions.length; i += 3) {
      const point = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize().multiplyScalar(rng.range(450, 2000));
      positions.set(point.toArray(), i);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({ size: 5, color: 0xb1b6b9, map: createStarTexture(), alphaTest: 0.05, transparent: true, depthWrite: false }));
  }
