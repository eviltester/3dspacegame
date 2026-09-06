/** Shared live-world contracts; these contain Three.js objects and are never saved. */
import type * as THREE from 'three';
import type { EnemyArchetype } from '../arcade';
import type { CargoDrop, Faction } from '../logic';

export type ActorKind = 'pirate' | 'trader' | 'police' | 'part' | 'base' | 'planet' | 'market' | 'gate' | 'cargo' | 'mine';
export interface Actor {
  // previous is last tick's position for swept collision; anchor is the spawn or
  // formation home. A carrier part follows parent + offset instead of flying alone.
  id: number; kind: ActorKind; faction: Faction; object: THREE.Object3D; previous: THREE.Vector3;
  radius: number; hull: number; maxHull: number; role: EnemyArchetype; age: number;
  // Timers are seconds. Negative windup means idle; target -1 marks retaliation
  // against the player (positive IDs identify other live actors).
  cooldown: number; windup: number; target: number; anchor: THREE.Vector3; offset: THREE.Vector3;
  // essential protects mission pickups and identifies objective ships/bosses.
  parent: number | null; essential: boolean; drop: CargoDrop | null; dead: boolean; spawned: number;
  drift: THREE.Vector3 | null;
}
export interface Shot {
  // source excludes the firing actor; hit remembers contacts for piercing shots.
  // ttl bounds lifetime even when a shot never intersects anything.
  id: number; source: number; faction: Faction; target: number; object: THREE.Object3D;
  previous: THREE.Vector3; velocity: THREE.Vector3; damage: number; radius: number; ttl: number; pierce: number; hit: Set<number>;
}
