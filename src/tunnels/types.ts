import type { EnemyArchetype, RunState, WeaponFamily } from '../arcade';
import type { CargoType, Faction } from '../logic';
import type { SkiffVitals } from '../skiff-vitals';
import type { FeedbackCue, ShipVoice } from '../audio/events';

export type TunnelKind = 'ship' | 'gun' | 'core' | 'asteroid' | 'crate' | 'pickup' | 'pillar' | 'wall' | 'mine';
export type TunnelPickup = CargoType | 'fullRepair';
export interface TunnelEntity {
  id: number; kind: TunnelKind; faction: Faction; role: EnemyArchetype;
  lane: number; previousLane: number; depth: number; previousDepth: number;
  hp: number; size: number; age: number; grace: number; required: boolean;
  cooldown: number; warning: number; targetLane: number; targetId: number;
  changing: number; nextLane: number; rim: boolean; parent: number;
  retracting: boolean; extension: number; drop?: TunnelPickup; essential: boolean;
  /** Split fragments scatter during grace, then travel at this saved multiplier. */
  fragmentSpeed?: 1 | 3;
  /** An arriving wanted officer holds at the tunnel bottom until its first shot. */
  policeEntry?: boolean;
}
export interface TunnelShot {
  id: number; volley: number; lane: number; depth: number; previousDepth: number;
  /** Hostile fire commits to a warned lane; it cannot track the player after launch. */
  previousLane?: number; originLane?: number; aimLane?: number; originDepth?: number;
  faction: Faction; target: number; damage: number; speed: number; pierce: number;
  family: WeaponFamily; hit: boolean; contacts: number[];
}
export interface TunnelResult { cargo: number; accuracy: number; clear: number; percent: number }
export interface TunnelPoliceResponse { limit: 2 | 10; spawned: number; delay: number }
/** Plain data only: a pause/save resumes the exact assault, including pending shots. */
export interface TunnelRunState {
  version: 1; level: number; random: number; lootRandom: number; nextId: number;
  lane: number; previousLane: number; desiredLane: number; elapsed: number;
  group: number; spawnIndex: number; spawnDelay: number; hazardDelay: number;
  entities: TunnelEntity[]; shots: TunnelShot[]; chargedVolleys: number[];
  fireDelay: number; attackDelay: number; lastAttacker: number; protection: number;
  respawn: number; hitGrace: number; phase: 'assault' | 'salvage' | 'collapse' | 'result' | 'over';
  remaining: number; paid: boolean; result: TunnelResult | null;
  scan: number; scanned: boolean; patrol: boolean; kills: number; earlyCore: boolean;
  startVitals: SkiffVitals;
  /** Lifetime dispatch budget for this tunnel, not a count of surviving officers. */
  policeResponse?: TunnelPoliceResponse;
}
export type TunnelEvent = { type: 'notice'; text: string } | { type: 'cue'; cue: FeedbackCue }
  | { type: 'fire'; voice: ShipVoice } | { type: 'shoot'; family: WeaponFamily }
  | { type: 'explosion'; entity: TunnelEntity } | { type: 'hit' | 'damage' | 'blast' | 'ready' | 'life' | 'gameover' | 'clear' | 'collapse' | 'detonate' | 'next' };
export interface TunnelContext { run: RunState; state: TunnelRunState; events: TunnelEvent[] }
