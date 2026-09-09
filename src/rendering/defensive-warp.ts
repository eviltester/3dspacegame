/** Cosmetic ship/platform breakup and travel. Actor health and positions stay untouched. */
import * as THREE from 'three';
import { configureArmadaCamera } from '../armada';
import { disposeObject, lineShape } from '../models/primitives';
import type { createArmadaRig } from '../models/ships';
import { ShipExplosions } from './ship-explosions';

const PLATFORM_COLORS = [0x75caff, 0x98ff85, 0xffce70, 0xdf91ff, 0x6af5ce, 0xff8da7];
export function defensivePlatformColor(level: number): number { return PLATFORM_COLORS[(Math.max(1, Math.floor(level)) - 1) % PLATFORM_COLORS.length]; }

export class DefensiveWarpView {
  private readonly explosions: ShipExplosions;
  private readonly trails: THREE.LineSegments;
  private readonly departureOrigin = new THREE.Vector3();
  private broken = false;
  constructor(private readonly world: THREE.Group, readonly rig: ReturnType<typeof createArmadaRig>, level: number,
    onBurst: (position: THREE.Vector3) => void) {
    this.explosions = new ShipExplosions(world, onBurst);
    rig.platform.traverse(child => {
      if (child instanceof THREE.LineSegments) (child.material as THREE.LineBasicMaterial).color.setHex(defensivePlatformColor(level));
    });
    const vertices: Array<[number, number, number]> = [], edges: Array<[number, number]> = [];
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6, radius = 18 + i % 3 * 8;
      vertices.push([Math.cos(angle) * radius, Math.sin(angle) * radius, 0], [Math.cos(angle) * radius, Math.sin(angle) * radius, 75]);
      edges.push([i * 2, i * 2 + 1]);
    }
    this.trails = lineShape(vertices, edges, 0x79cfff, 0.8);
    this.trails.name = 'defensive-warp-trails'; this.trails.visible = false; world.add(this.trails);
  }
  get destruction() { return this.explosions.snapshot; }
  destroyCraft(): void {
    this.explosions.explode(this.rig.craft);
    this.rig.craft.visible = false;
  }
  depart(): void { this.departureOrigin.copy(this.rig.craft.position); }
  update(dt: number): void { this.explosions.update(dt); }
  showDeparture(progress: number, camera: THREE.PerspectiveCamera): boolean {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    let burst = false;
    if (p >= 0.15 && !this.broken) {
      this.broken = true; this.explosions.explode(this.rig.platform); this.rig.platform.visible = false; burst = true;
    }
    this.rig.craft.position.lerpVectors(this.departureOrigin, new THREE.Vector3(0, 20, -850), p * p);
    configureArmadaCamera(camera);
    camera.position.lerp(new THREE.Vector3(0, 50, -260), p * p * 0.8);
    camera.lookAt(0, 0, -120 - p * p * 550); camera.updateMatrixWorld();
    this.showTrails(p);
    return burst;
  }
  showArrival(progress: number, camera: THREE.PerspectiveCamera): void {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    configureArmadaCamera(camera);
    this.rig.craft.visible = true;
    this.rig.craft.position.set(0, 0, -600 * (1 - p) ** 3);
    this.showTrails(1 - p);
  }
  private showTrails(intensity: number): void {
    this.trails.visible = intensity > 0 && intensity < 1;
    this.trails.position.copy(this.rig.craft.position);
    this.trails.scale.z = 0.5 + intensity * 3;
    (this.trails.material as THREE.LineBasicMaterial).opacity = Math.sin(intensity * Math.PI) * 0.9;
  }
  finish(): void { this.rig.craft.visible = true; this.trails.visible = false; }
  dispose(): void { this.explosions.clear(); this.world.remove(this.trails); disposeObject(this.trails); }
}
