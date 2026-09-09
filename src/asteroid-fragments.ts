/** Shared large -> two medium -> two small breakup limits. */
export const MAX_ASTEROID_FRAGMENTS = 64;
export const ASTEROID_FRAGMENT_GRACE = 0.45;
export function asteroidChild(size: 0 | 1 | 2, radius: number): { size: 0 | 1; radius: number } | null {
  return size === 0 ? null : { size: (size - 1) as 0 | 1, radius: radius * 0.57 };
}
