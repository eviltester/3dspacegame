/** One-way traffic mixed into later asteroid fields. No pursuit turns or friendly-fire targets. */
import * as THREE from 'three';
import { Random } from './encounters';
import { bonusProfile } from './bonus-difficulty';
import { createPirateModel, createPoliceModel } from './models/ships';
import type { RadarContact } from './radar';
import { sweptHit } from './weapons';
import { ShipExplosions } from './rendering/ship-explosions';

export interface BeltShip {
  kind: 'pirate' | 'police'; object: THREE.Group; radius: number; number: number; used: boolean;
  previous: THREE.Vector3; velocity: THREE.Vector3; homeX: number; phase: number; active: boolean;
}
export const MAX_BELT_TRAFFIC = 3;
export function asteroidTrafficCount(difficulty: number): number {
  const level = bonusProfile(difficulty).level;
  return level < 3 ? 0 : 4 + (level - 3) * 2;
}

export class AsteroidTraffic {
  readonly ships: BeltShip[] = [];
  private readonly slots = new Set<number>();
  private readonly random: Random;
  private readonly speed: number;
  private readonly explosions: ShipExplosions;
  constructor(private root: THREE.Group, seed: number, difficulty: number) {
    const profile = bonusProfile(difficulty), count = asteroidTrafficCount(difficulty);
    this.random = new Random(seed ^ 0x43be17); this.speed = 45 + (profile.level - 1) * 6;
    this.explosions = new ShipExplosions(root);
    // One rock in each selected row becomes a ship. Keep the opening and the other rock.
    for (let i = 0; i < count; i++) this.slots.add(Math.floor(profile.asteroidRows * (0.1 + i / count * 0.8)) * 2 + 1);
  }
  replaceRock(slot: number, position: THREE.Vector3): boolean {
    if (!this.slots.has(slot)) return false;
    const kind = this.ships.length % 2 === 0 ? 'pirate' : 'police';
    const object = kind === 'pirate' ? createPirateModel() : createPoliceModel();
    object.position.copy(position); object.scale.setScalar(1.3); object.rotation.y = Math.PI;
    this.root.add(object);
    this.ships.push({ kind, object, radius: 9, number: 0, used: false, previous: position.clone(),
      velocity: new THREE.Vector3(0, 0, this.speed), homeX: position.x, phase: this.random.range(0, Math.PI * 2), active: false });
    return true;
  }
  step(dt: number, time: number, previous: THREE.Vector3, player: THREE.Vector3): { impacts: number; notice: string } {
    this.explosions.update(dt);
    let impacts = 0, notice = '', active = this.ships.filter(ship => ship.active && !ship.used).length;
    for (const ship of this.ships) {
      if (ship.used) continue;
      const ahead = player.z - ship.object.position.z;
      if (!ship.active && ahead > 0 && ahead < 700 && active < MAX_BELT_TRAFFIC) {
        ship.active = true; active++;
        notice = ship.kind === 'pirate' ? 'PIRATE APPROACHING THROUGH THE BELT' : 'POLICE PATROL APPROACHING / KEEP CLEAR';
      }
      ship.previous.copy(ship.object.position);
      if (ship.active) {
        // Local -Z is the ship's nose. Orient it into its actual velocity, always toward +world Z.
        const x = ship.homeX + Math.sin(time * 0.8 + ship.phase) * 5;
        ship.velocity.x = THREE.MathUtils.clamp((x - ship.object.position.x) * 2, -12, 12);
        ship.object.position.addScaledVector(ship.velocity, dt);
        ship.object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), ship.velocity.clone().normalize());
      }
      if (sweptHit(previous, player, ship.previous, ship.object.position, ship.radius + 2) !== null) {
        impacts++; this.destroy(ship);
      }
      if (ship.object.position.z > player.z + 40) ship.used = true;
      if (ship.used) ship.object.visible = false;
    }
    return { impacts, notice };
  }
  destroy(ship: { used: boolean; object: THREE.Object3D }): void {
    if (ship.used) return;
    this.explosions.explode(ship.object, new THREE.Vector3(0, 0, this.speed));
    ship.used = true; ship.object.visible = false;
  }
  get contacts(): RadarContact[] {
    return this.ships.filter(ship => !ship.used).map(ship => ({ position: ship.object.position,
      color: ship.kind === 'pirate' ? '#ff4055' : '#75caff', glyph: 'ship' }));
  }
  get snapshot() {
    return this.ships.filter(ship => !ship.used).map(ship => ({ kind: ship.kind, position: ship.object.position.toArray(),
      velocity: ship.velocity.toArray(), active: ship.active }));
  }
}
