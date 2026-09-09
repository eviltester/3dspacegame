/** Defensive Position-only roster growth and original planar formation movement. */
import type { EnemyArchetype } from './arcade';
import type { StageDefinition } from './encounters';
import { endlessDifficulty } from './endless-difficulty';
import { invaderPattern } from './invader-patterns';
import { isInvaderField } from './invader-events';
import { DEFENSIVE_ATTACKER_CAP } from './combat/invader-fire';
export { invaderPattern, invaderPosition, INVADER_PATTERNS } from './invader-patterns';

/** Introduce spread weapons gradually, instead of upgrading the whole fleet at once. */
export function invaderSpreadLimit(wave: number): number {
  const n = Math.max(1, Math.floor(wave));
  return n < 13 ? 0 : Math.min(6, 1 + Math.floor((n - 13) / 6));
}

export function invaderFighterShots(wave: number, slot: number): number {
  // Slots survive casualties and life loss. Ordinary survivors never acquire a
  // spread weapon just because another alien died; reinforcements reuse free slots.
  return slot >= 0 && slot < invaderSpreadLimit(wave) ? 3 : 1;
}

export function invaderStage(wave: number): StageDefinition {
  // Increase ships per flight first, then add more flights. Each live formation
  // still obeys the common hostile/attacker caps and the shared warning duration.
  const n = Math.max(1, Math.floor(wave));
  const pressure = Math.log2(n);
  const difficulty = { ...endlessDifficulty(n * 5), movementScale: 1 + 1.7 * pressure / (pressure + 6),
    recovery: 2 + 4 / (1 + pressure * 0.35), clearInterval: 1.2, flightInterval: 7, fighterShots: 1 };
  const count = Math.min(18, 8 + (n - 1) * 2);
  const flights = 1 + Math.floor(Math.log2(1 + (n - 1) / 3));
  if (isInvaderField(n)) return { number: n, kind: 'armada', title: `ASTEROID FIELD ${n}`, chapter: 3, bossParts: 0,
    objective: 'Survive the asteroid field. Shoot splitting rocks, dodge drifting mines and watch for flybys.',
    speedScale: 1.35, attackerCap: 3, difficulty, waves: [] };
  return { number: n, kind: 'armada', title: `DEFENSIVE POSITION WAVE ${n}`, chapter: Math.min(3, Math.ceil(n / 4)), bossParts: 0,
    objective: `${invaderPattern(n)} formation. Hold the defensive lane and destroy every alien. Intercept their fire to charge your blast.`,
    speedScale: Math.min(1.35, 1 + (n - 1) * 0.025), attackerCap: DEFENSIVE_ATTACKER_CAP, difficulty,
    waves: Array.from({ length: flights }, (_, flight) => Array.from({ length: Math.ceil(count / 3) }, (_, group) => ({
      at: flight * 7 + group * 0.75,
      enemies: Array.from({ length: Math.min(3, count - group * 3) }, (_, member): EnemyArchetype => n === 1 ? 'raider'
        : (['raider', 'diver', 'flanker'] as const)[(group * 3 + member + flight) % (n === 2 ? 2 : 3)])
    }))).flat() };
}
