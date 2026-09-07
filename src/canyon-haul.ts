import type * as THREE from 'three';
import { createCargoModel } from './models/landmarks';
import { disposeObject } from './models/primitives';
import { sweptHit } from './weapons';
import { dropsCanyonHaul } from './canyon-combat';

export const MAX_CANYON_HAUL_DROPS = 32;

interface HaulDrop { object: THREE.Group; age: number }
/** Collecting adds cargo, not score. The session pays for delivered cargo at EXIT. */
export class CanyonHaul {
  readonly drops: HaulDrop[] = [];
  constructor(private root: THREE.Group, private random: () => number) {}
  release(position: THREE.Vector3): void {
    if (!dropsCanyonHaul(this.random()) || this.drops.length >= MAX_CANYON_HAUL_DROPS) return;
    const object = createCargoModel('credits'); object.position.copy(position);
    this.root.add(object); this.drops.push({ object, age: 0 });
  }
  step(dt: number, previous: THREE.Vector3, position: THREE.Vector3): number {
    let collected = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i], before = drop.object.position.clone(); drop.age += dt;
      const distance = before.distanceTo(position);
      if (distance > 0 && distance < 20) drop.object.position.lerp(position, Math.min(1, dt * 10));
      drop.object.rotation.z = Math.sin(drop.age * 2) * 0.15;
      const hit = sweptHit(previous, position, before, drop.object.position, 10) !== null;
      if (hit) collected++;
      if (hit || drop.age >= 20 || drop.object.position.z > position.z + 40) {
        this.root.remove(drop.object); disposeObject(drop.object); this.drops.splice(i, 1);
      }
    }
    return collected;
  }
  get contacts() { return this.drops.map(drop => ({ position: drop.object.position, color: '#ffff70', glyph: 'cargo' as const })); }
}
