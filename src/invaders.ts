/** Invaders-only roster growth and original planar formation movement. */
import * as THREE from 'three';
import type { EnemyArchetype } from './arcade';
import type { StageDefinition } from './encounters';
import { endlessDifficulty } from './endless-difficulty';

export const INVADER_PATTERNS = ['MARCH', 'SWOOP', 'PINCER', 'WEAVE'] as const;
export function invaderPattern(wave: number): typeof INVADER_PATTERNS[number] { return INVADER_PATTERNS[(wave - 1) % INVADER_PATTERNS.length]; }
export function invaderStage(wave: number): StageDefinition {
  // Increase ships per flight first, then add more flights. Each live formation
  // still obeys the common hostile/attacker caps and the shared warning duration.
  const n = Math.max(1, Math.floor(wave));
  const pressure = Math.log2(n);
  const difficulty = { ...endlessDifficulty(n * 5), movementScale: 1 + 1.7 * pressure / (pressure + 6),
    recovery: 2 + 4 / (1 + pressure * 0.35), clearInterval: 1.2, flightInterval: 7, fighterShots: n >= 12 ? 3 : 1 };
  const count = Math.min(18, 8 + (n - 1) * 2);
  const flights = 1 + Math.floor(Math.log2(1 + (n - 1) / 3));
  return { number: n, kind: 'armada', title: `INVADER WAVE ${n}`, chapter: Math.min(3, Math.ceil(n / 4)), bossParts: 0,
    objective: `${invaderPattern(n)} formation. Hold the defensive lane and destroy every alien. Intercept their fire to charge your blast.`,
    speedScale: Math.min(1.35, 1 + (n - 1) * 0.025), attackerCap: Math.min(6, 2 + Math.floor(n / 2)), difficulty,
    waves: Array.from({ length: flights }, (_, flight) => ({ at: flight * 7,
      enemies: Array.from({ length: count }, (_, slot): EnemyArchetype => n === 1 ? 'raider' : (['raider', 'diver', 'flanker'] as const)[(slot + flight) % (n === 2 ? 2 : 3)]) })) };
}

export function invaderPosition(anchor: THREE.Vector3, age: number, wave: number, speed: number): THREE.Vector3 {
  // anchor is a ship's formation slot. Age and slot offsets synchronize the fleet
  // while staggering dives; no global actor ID or wall clock changes retry patterns.
  const pattern = invaderPattern(wave);
  const clock = age * speed;
  const phase = (clock + Math.abs(anchor.x) * 0.035 + Math.abs(anchor.z) * 0.009) % 9;
  const dive = phase > 3 ? Math.sin((phase - 3) / 6 * Math.PI) : 0;
  const sway = Math.sin(clock * 0.65) * 10;
  let x = anchor.x + sway;
  let z = anchor.z + Math.min(48, clock * 2);
  if (pattern === 'MARCH') x = anchor.x + Math.round(Math.sin(clock * 0.7) * 4) * 2.5;
  if (pattern === 'SWOOP') { x += Math.sin(phase * 1.3) * dive * 24; z += dive * (-anchor.z - 82); }
  if (pattern === 'PINCER') { x = THREE.MathUtils.lerp(x, -Math.sign(anchor.x || 1) * 26, dive); z += dive * (-anchor.z - 85); }
  if (pattern === 'WEAVE') { x += Math.sin(clock * 1.4 + anchor.z) * 18; z += dive * (-anchor.z - 90); }
  // Keep every target in the player's reachable firing lane and ahead of the ship.
  return new THREE.Vector3(THREE.MathUtils.clamp(x, -72, 72), 0, Math.min(-34, z));
}
