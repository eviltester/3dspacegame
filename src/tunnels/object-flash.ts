import * as THREE from 'three';
import type { TunnelEntity } from './types';

/** Pulse the actual model, preserving faction colours between warnings. */
export class TunnelObjectFlash {
  private readonly originals = new WeakMap<THREE.LineBasicMaterial, { color: THREE.Color; opacity: number }>();
  private readonly red = new THREE.Color(0xff3038);
  update(object: THREE.Object3D, entity: TunnelEntity, time: number): void {
    const mine = entity.kind === 'mine';
    const warning = entity.depth >= 0 && (entity.warning >= 0 && entity.targetId === -1
      || entity.fragmentSpeed === 3 && entity.grace > 0);
    const pulse = (1 + Math.sin(time * (mine ? 12 : 10))) / 2;
    object.traverse(child => {
      if (!(child instanceof THREE.LineSegments) || !(child.material instanceof THREE.LineBasicMaterial)) return;
      const material = child.material;
      if (!this.originals.has(material)) this.originals.set(material, { color: material.color.clone(), opacity: material.opacity });
      const original = this.originals.get(material)!;
      material.color.copy(original.color).lerp(this.red, mine ? 1 : warning ? pulse * 0.45 : 0);
      material.opacity = original.opacity * (mine ? 0.35 + pulse * 0.65 : warning ? 0.78 + pulse * 0.22 : 1);
    });
  }
}
