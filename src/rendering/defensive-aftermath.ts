/** Silent game-over scenery. Copies own their GPU resources and never update live actors. */
import * as THREE from 'three';
import type { Actor } from '../combat/types';
import { invaderPosition } from '../invader-patterns';
import { disposeObject } from '../models';
import { MINE_WARNING_NAME } from './invader-mine-warning';

export class DefensiveAftermath {
  readonly root = new THREE.Group();
  private elapsed = 0;
  private readonly objects: Array<{ model: THREE.Object3D; slot: number; rock: boolean; drift: THREE.Vector3 }> = [];

  constructor(actors: readonly Actor[], private readonly wave: number, private readonly startTime: number) {
    this.root.name = 'defensive-gameover-backdrop';
    let shipSlot = 0;
    for (const actor of actors) {
      if (actor.dead || !actor.object.visible || !['pirate', 'police', 'trader', 'asteroid', 'mine'].includes(actor.kind)) continue;
      const model = actor.object.clone(true);
      model.traverse(child => {
        if (child.name === 'double-score' || child.name === MINE_WARNING_NAME) child.visible = false;
        if (child instanceof THREE.LineSegments) {
          const line = child as THREE.LineSegments<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
          line.geometry = line.geometry.clone();
          line.material = Array.isArray(line.material) ? line.material.map(material => material.clone()) : line.material.clone();
        }
      });
      const rock = actor.kind === 'asteroid' || actor.kind === 'mine';
      const slot = rock ? this.objects.length : shipSlot++;
      this.objects.push({ model, slot, rock, drift: actor.drift?.clone() ?? new THREE.Vector3(0, 0, 45) });
      this.root.add(model);
    }
  }

  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.elapsed += dt;
    for (const item of this.objects) {
      const { model, slot } = item;
      if (item.rock) {
        model.position.addScaledVector(item.drift, dt);
        model.rotation.x += dt * 0.7; model.rotation.y += dt * 0.4;
        // Recycle the same survivors, without spawning, collecting or damaging anything.
        if (model.position.z > 45) { model.position.z = -430; model.position.x = Math.sin(slot * 2.4 + this.elapsed) * 110; }
        if (Math.abs(model.position.x) > 140) { model.position.x = THREE.MathUtils.clamp(model.position.x, -140, 140); item.drift.x *= -1; }
      } else {
        // Blend between original formation patterns, independently of the run clock.
        const cycle = Math.floor(this.elapsed / 12), blend = Math.min(1, this.elapsed % 12 / 3);
        const time = this.startTime + this.elapsed;
        const target = invaderPosition(slot, time, this.wave + cycle + 1, 0.7)
          .lerp(invaderPosition(slot, time, this.wave + cycle + 2, 0.7), blend);
        target.x *= 1.8;
        model.position.lerp(target, 1 - Math.exp(-dt * 1.5));
        model.lookAt(0, 0, 0); model.rotateY(Math.PI);
      }
    }
  }

  dispose(): void {
    this.root.removeFromParent(); disposeObject(this.root); this.root.clear(); this.objects.length = 0;
  }
}
