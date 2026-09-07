import type * as THREE from 'three';
import { disposeObject } from './models/primitives';
import { createSkiffRepairModel, SKIFF_REPAIR_COLORS } from './models/skiff-repairs';
import { repairedSkiffHealth, skiffRepairDrop } from './skiff-repairs';
import type { SkiffDropSource, SkiffRepair } from './skiff-repairs';
import { sweptHit } from './weapons';

interface RepairDrop { kind: SkiffRepair; object: THREE.Group; age: number }
export const MAX_SKIFF_REPAIR_DROPS = 16;
export class SkiffRepairDrops {
  readonly drops: RepairDrop[] = [];
  collected = 0;
  collectedThisStep: SkiffRepair[] = [];
  notice = '';
  constructor(private root: THREE.Group, private random: () => number) {}

  release(source: SkiffDropSource, position: THREE.Vector3): void {
    const kind = skiffRepairDrop(source, this.random());
    if (!kind || this.drops.length >= MAX_SKIFF_REPAIR_DROPS) return;
    const object = createSkiffRepairModel(kind); object.position.copy(position);
    this.root.add(object); this.drops.push({ kind, object, age: 0 });
  }
  step(dt: number, previous: THREE.Vector3, position: THREE.Vector3, health: number): number {
    this.notice = '';
    this.collectedThisStep = [];
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i], before = drop.object.position.clone(); drop.age += dt;
      const distance = before.distanceTo(position);
      // A small collection magnet helps scoop rewards without auto-collecting faraway drops.
      if (distance > 0 && distance < 20) drop.object.position.lerp(position, Math.min(1, dt * 10));
      drop.object.rotation.z = Math.sin(drop.age * 2) * 0.15;
      const collected = health > 0 && sweptHit(previous, position, before, drop.object.position, 10) !== null;
      if (collected) {
        health = repairedSkiffHealth(health, drop.kind); this.collected++; this.collectedThisStep.push(drop.kind);
        this.notice = drop.kind === 'shield' ? 'SHIELD PICKUP / SKIFF +1' : 'REPAIR PICKUP / SKIFF FULL';
      }
      if (collected || drop.age >= 20 || drop.object.position.z > position.z + 40) {
        this.root.remove(drop.object); disposeObject(drop.object); this.drops.splice(i, 1);
      }
    }
    return health;
  }
  get contacts() {
    return this.drops.map(drop => ({ position: drop.object.position, color: `#${SKIFF_REPAIR_COLORS[drop.kind].toString(16)}`, glyph: 'cargo' as const }));
  }
}
