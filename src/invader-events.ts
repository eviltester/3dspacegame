/** Authored event rhythm, shared by encounter generation, simulation and the HUD. */
export type InvaderVisitorKind = 'police' | 'pirate' | 'courier';
export const isInvaderField = (wave: number): boolean => wave >= 6 && wave % 6 === 0;
export const invaderFieldDuration = (wave: number): number => 35 + Math.min(25, Math.log2(Math.max(1, wave)) * 4);
export function flybyKind(wave: number): InvaderVisitorKind | null {
  if (isInvaderField(wave)) return wave % 12 === 6 ? 'police' : 'pirate';
  return wave >= 3 && wave % 4 === 3 ? 'police' : wave >= 5 && wave % 4 === 1 ? 'pirate' : wave >= 2 && wave % 4 === 2 ? 'courier' : null;
}
export const hasInvaderStorm = (wave: number): boolean => wave >= 4 && wave % 4 === 0 && !isInvaderField(wave);
