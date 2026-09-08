import { LANES, laneDelta } from './shapes';
/** Relative swept slab contact in lane/depth space, including a closed-track seam. */
export function laneSweep(a0: number, a1: number, z0: number, z1: number, b0: number, b1: number, d0: number, d1: number, closed: boolean, width = 0.42, depth = 9): number | null {
  const x = laneDelta(b0, a0, closed);
  const dx = laneDelta(a0, a1, closed) - laneDelta(b0, b1, closed);
  let best: number | null = null;
  for (const shift of closed ? [-LANES, 0, LANES] : [0]) {
    let enter = 0, exit = 1;
    for (const [start, delta, radius] of [[x + shift, dx, width], [z0 - d0, z1 - z0 - (d1 - d0), depth]]) {
      if (Math.abs(delta) < 1e-9) { if (Math.abs(start) > radius) { enter = 2; break; } }
      else { const first = (-radius - start) / delta, last = (radius - start) / delta; enter = Math.max(enter, Math.min(first, last)); exit = Math.min(exit, Math.max(first, last)); }
    }
    if (enter <= exit && (best === null || enter < best)) best = enter;
  }
  return best;
}
