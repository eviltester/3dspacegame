/** Saved simulation time drives the cinematic, so pause/resume cannot repay it. */
export const TUNNEL_COLLAPSE_SECONDS = 3;
export const TUNNEL_DETONATE_AT = 1;
export function tunnelZoom(remaining: number): number {
  const progress = Math.max(0, Math.min(1, (TUNNEL_COLLAPSE_SECONDS - remaining) / TUNNEL_DETONATE_AT));
  return progress * progress * (3 - 2 * progress);
}
