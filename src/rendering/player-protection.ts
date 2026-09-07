/** Temporary respawn protection and its cosmetic state advance only in simulation time. */
import * as THREE from 'three';
import { RESPAWN_PROTECTION_SECONDS } from '../session/flight-lifecycle';

export { RESPAWN_PROTECTION_SECONDS } from '../session/flight-lifecycle';
export const PROTECTION_COLOR = 0x429dff;
export class PlayerProtection {
  remaining = 0;
  private materials = new Map<THREE.LineBasicMaterial, { color: number; opacity: number }>();
  start(craft?: THREE.Object3D, remaining = RESPAWN_PROTECTION_SECONDS): void {
    this.clear();
    this.remaining = Math.max(0, Math.min(RESPAWN_PROTECTION_SECONDS, remaining));
    craft?.traverse(child => {
      if (!(child instanceof THREE.LineSegments || child instanceof THREE.Line)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) if (material instanceof THREE.LineBasicMaterial) {
        this.materials.set(material, { color: material.color.getHex(), opacity: material.opacity });
      }
    });
    this.update(0);
  }
  update(dt: number): void {
    this.display(Math.max(0, this.remaining - dt));
  }
  /** The flight controller supplies the authoritative remaining protection. */
  display(remaining: number): void {
    this.remaining = remaining;
    if (this.remaining <= 1e-6) { this.clear(); return; }
    for (const material of this.materials.keys()) {
      material.color.setHex(PROTECTION_COLOR);
      material.opacity = 0.25 + 0.75 * (0.5 + 0.5 * Math.cos((RESPAWN_PROTECTION_SECONDS - this.remaining) * Math.PI * 6));
    }
  }
  clear(): void {
    for (const [material, base] of this.materials) { material.color.setHex(base.color); material.opacity = base.opacity; }
    this.materials.clear(); this.remaining = 0;
  }
}
