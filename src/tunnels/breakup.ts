/** Break the actual lane panels apart, then reuse the ship fragment/spark effect. */
import type * as THREE from 'three';
import { disposeObject, lineShape } from '../models';
import { ShipExplosions } from '../rendering/ship-explosions';
import { LANES, trackPoint, TUNNEL_DEPTH } from './shapes';
import type { TunnelShapeDefinition } from './shapes';
import { TUNNEL_DETONATE_AT } from './ending-timing';

export class TunnelBreakup {
  private readonly pieces: ShipExplosions;
  private age = -1;
  constructor(private root: THREE.Group, private shape: TunnelShapeDefinition, private color: number, onBurst: () => void) {
    this.pieces = new ShipExplosions(root, onBurst);
  }
  get exploded(): boolean { return this.age >= 0; }
  get snapshot() { return this.pieces.snapshot; }
  update(elapsed: number): void {
    const age = elapsed - TUNNEL_DETONATE_AT;
    if (age < 0) return;
    if (!this.exploded) {
      const depths = [0, 110, 245, TUNNEL_DEPTH];
      for (let band = 0; band < 3; band++) for (let lane = 0; lane < LANES; lane++) {
        const points: Array<[number, number, number]> = [[lane, band], [lane + 1, band], [lane + 1, band + 1], [lane, band + 1]].map(([edge, layer]) => {
          const depth = depths[layer], scale = 1 - depth / TUNNEL_DEPTH * 0.5, [x, y] = trackPoint(this.shape, edge / LANES);
          return [x * scale, y * scale, -depth];
        });
        const panel = lineShape(points, [[0,1],[1,2],[2,3],[3,0]], this.color);
        this.root.add(panel); this.pieces.explode(panel);
        this.root.remove(panel); disposeObject(panel);
      }
      this.age = 0;
    }
    // Reconstruct the same point in the animation when loading a saved collapse.
    let step = Math.max(0, age - this.age);
    while (step > 0) { const dt = Math.min(step, 1 / 60); this.pieces.update(dt); step -= dt; }
    this.age = Math.max(this.age, age);
  }
  dispose(): void { this.pieces.clear(); }
}
