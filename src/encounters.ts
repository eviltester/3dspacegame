import type { EnemyArchetype, GameMode } from './arcade';
import * as THREE from 'three';

export function crossedGate(previous: THREE.Vector3, next: THREE.Vector3, position: THREE.Vector3, rotation: THREE.Quaternion, radius = 28): boolean {
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1).applyQuaternion(rotation), position);
  const crossing = plane.intersectLine(new THREE.Line3(previous, next), new THREE.Vector3());
  return crossing !== null && crossing.distanceToSquared(position) < radius * radius;
}

export type StageKind = 'patrol' | 'rescue' | 'armada' | 'boss' | 'ambush' | 'escort' | 'defend' | 'assault';
export interface WaveDefinition { at: number; enemies: EnemyArchetype[] }
export interface StageDefinition { number: number; title: string; kind: StageKind; objective: string; waves: WaveDefinition[]; chapter: number; bossParts: number; speedScale: number; attackerCap: number }
export class Random {
  constructor(public state: number) { this.state >>>= 0; }
  next(): number { this.state = (1664525 * this.state + 1013904223) >>> 0; return this.state / 0x100000000; }
  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  pick<T>(values: readonly T[]): T { return values[Math.floor(this.next() * values.length)]; }
}
const JOURNEY: Array<[StageKind, string, string]> = [
  ['patrol', 'PIRATE PATROL', 'Clear the pirate flights. Shoot incoming fire to charge your defensive blast.'],
  ['rescue', 'RESCUE OPERATION', 'Collect the white rescue pod, deliver it to the station, and clear the attackers.'],
  ['armada', 'FIRST ARMADA', 'Move left and right along the defensive lane. Destroy the approaching formation.'],
  ['boss', 'BREACH CARRIER', 'Break the two drone bays, then destroy the exposed carrier core.'],
  ['ambush', 'BROKEN SIGNAL', 'Survive the trap. Flankers and sweeping gunships will arrive in separate flights.'],
  ['escort', 'CONVOY ESCORT', 'Keep the green convoy alive until it reaches the station. Clear its pursuers.'],
  ['armada', 'DIVING ARMADA', 'Hold the defensive lane. Watch for fighters peeling away into diving attacks.'],
  ['boss', 'SHIELD CARRIER', 'Break the shield generators and gun pods before attacking the central core.'],
  ['defend', 'STATION DEFENCE', 'Protect the station. Destroy minelayers before their minefields grow.'],
  ['assault', 'FLEET ASSAULT', 'Clear the combined pirate fleet. A support carrier will launch reinforcements.'],
  ['armada', 'ELITE ARMADA', 'Break the final formation. Columns alternate dives with sweeping gunfire.'],
  ['boss', 'COMMAND CARRIER', 'Destroy its six outer systems. The core accelerates its attacks as its hull breaks.']
];
export const HULL: Record<EnemyArchetype, number> = { raider: 48, flanker: 52, diver: 44, gunship: 115, minelayer: 72, carrier: 220 };

export function stageDefinition(mode: GameMode, number: number): StageDefinition {
  const n = Math.max(1, Math.floor(number));
  const chapter = mode === 'journey' ? Math.ceil(n / 4) : Math.min(3, 1 + Math.floor(n / 5));
  const entry = mode === 'journey' ? JOURNEY[Math.min(11, n - 1)]
    : n % 5 === 0 ? ['boss', `CARRIER WAVE ${n}`, 'Destroy the outer systems, then break the exposed core.'] as const
      : n % 5 === 3 ? ['armada', `ARMADA WAVE ${n}`, 'Move left and right. Destroy the entire formation.'] as const
        : ['patrol', `WAVE ${n}`, 'Clear the incoming flights. Intercept enemy fire and collect supplies.'] as const;
  const [kind, title, objective] = entry;
  const roles: EnemyArchetype[] = chapter === 1 ? ['raider', 'flanker', 'diver']
    : chapter === 2 ? ['raider', 'flanker', 'diver', 'gunship'] : ['raider', 'flanker', 'diver', 'gunship', 'minelayer'];
  const packCount = kind === 'boss' ? 1 : mode === 'journey' ? 5 : Math.min(5, 2 + Math.floor(n / 5));
  const waves: WaveDefinition[] = [];
  for (let pack = 0; pack < packCount; pack += 1) {
    const count = kind === 'boss' ? 1 : Math.min(8, (mode === 'journey' ? 3 + chapter : 2 + Math.floor(n / 3)) + (pack % 2));
    const enemies: EnemyArchetype[] = [];
    for (let i = 0; i < count; i += 1) {
      const role = mode === 'endless' && n === 2 ? (pack === 0 ? 'flanker' : 'diver')
        : mode === 'endless' && n === 4 && pack === 0 ? 'gunship'
          : mode === 'endless' && n === 6 && pack === 0 ? 'minelayer'
        : n === 1 ? (pack < 2 ? 'raider' : pack === 2 ? 'flanker' : 'diver')
        : mode === 'journey' && pack === 0 && n === 5 ? 'gunship'
          : mode === 'journey' && pack === 0 && n === 9 ? 'minelayer' : roles[(pack + i + n) % roles.length];
      enemies.push(kind === 'boss' ? 'carrier' : role);
    }
    if (mode === 'journey' && n === 10 && pack === 3) enemies[0] = 'carrier';
    waves.push({ at: pack * (mode === 'journey' ? 20 : 12), enemies });
  }
  return { number: n, title, kind, objective, waves, chapter, bossParts: chapter * 2, speedScale: Math.min(1.35, 1 + (n - 1) * 0.025), attackerCap: Math.min(6, 2 + Math.floor(n / 3)) };
}
export class EncounterDirector {
  private pack = 0;
  private pending: EnemyArchetype[] = [];
  private lastPack = -10;
  constructor(public definition: StageDefinition) {}
  get flight(): number { return this.pack; }
  get totalFlights(): number { return this.definition.waves.length; }
  get finished(): boolean { return this.pack >= this.definition.waves.length && this.pending.length === 0; }
  next(time: number, active: number): EnemyArchetype[] {
    const wave = this.definition.waves[this.pack];
    if (!this.pending.length && wave && (time >= wave.at || (active === 0 && time - this.lastPack >= 5))) {
      this.pending = [...wave.enemies];
      this.pack += 1;
      this.lastPack = time;
    }
    return this.pending.splice(0, Math.max(0, 18 - active));
  }
  drain(): void { this.pack = this.definition.waves.length; this.pending = []; }
}
