/** Warn, lock aim, then fire. Ship movement stays with AsteroidTraffic. */
import * as THREE from 'three';
import type { BeltShip } from './asteroid-traffic';
import { createBoltModel, disposeObject } from './models';
import { sweptHit } from './weapons';
import { SoundEvents } from './audio/events';

export const BELT_FIRE_WARNING = 0.85;
export const MAX_BELT_BOLTS = 24;
interface Gun { cooldown: number; warning: number; aim: THREE.Vector3 }
interface Bolt { kind: 'hostileBolt'; object: THREE.Object3D; radius: number; number: number; used: boolean; velocity: THREE.Vector3; life: number; color: string }

export class BeltFire {
  shots: Bolt[] = [];
  private guns = new Map<number, Gun>();
  constructor(private root: THREE.Group, private difficulty: number, private sounds = new SoundEvents()) {}
  step(dt: number, time: number, ships: BeltShip[], previous: THREE.Vector3, player: THREE.Vector3, playerAlive = true) {
    let shots = 0, hits = 0, notice = '';
    const speed = 185 * Math.min(1.35, 1 + (this.difficulty - 1) * 0.05);
    for (const [index, ship] of ships.entries()) {
      const ahead = player.z - ship.object.position.z;
      // Start far enough out to retain the full warning even at maximum course boost.
      if (ship.used || !ship.active || ahead < 25 || ahead > 600) continue;
      let gun = this.guns.get(ship.object.id);
      if (!gun) { gun = { cooldown: 0.25 + index % 3 * 0.35, warning: 0, aim: new THREE.Vector3() }; this.guns.set(ship.object.id, gun); }
      const color = ship.kind === 'police' ? 0x75caff : 0xff4055;
      if (gun.warning > 0) {
        gun.warning = Math.max(0, gun.warning - dt);
        if (gun.warning === 0) {
          gun.cooldown = Math.max(0.9, 2.8 - this.difficulty * 0.22);
          if (this.shots.length < MAX_BELT_BOLTS) {
            const object = createBoltModel(color, 2.4, 14, ship.kind);
            object.position.copy(ship.object.position).add(new THREE.Vector3(0, 0, 12));
            // Aim can miss a dodging player, but a patrol never shoots back down the belt.
            const direction = gun.aim.clone().sub(object.position); direction.z = Math.max(1, direction.z);
            const velocity = direction.normalize().multiplyScalar(speed);
            object.lookAt(object.position.clone().add(velocity)); this.root.add(object);
            this.shots.push({ kind: 'hostileBolt', object, velocity, life: 4, radius: 2.4, number: 0, used: false, color: `#${color.toString(16)}` }); shots++;
            this.sounds.fire(ship.kind, object.position.distanceTo(player));
          }
        }
      } else {
        gun.cooldown -= dt;
        if (gun.cooldown <= 0) {
          gun.warning = BELT_FIRE_WARNING;
          const playerSpeed = Math.max(0, (previous.z - player.z) / Math.max(dt, 0.001));
          const lead = BELT_FIRE_WARNING + Math.max(0, ahead - playerSpeed * BELT_FIRE_WARNING) / (speed + playerSpeed);
          gun.aim.copy(player).add(player.clone().sub(previous).multiplyScalar(lead / Math.max(dt, 0.001)));
          notice = `${ship.kind === 'police' ? 'POLICE' : 'PIRATE'} LOCKING ON / EVADE`;
          this.sounds.cue('lockOn');
        }
      }
      ship.object.traverse(child => {
        if (child instanceof THREE.LineSegments) (child.material as THREE.LineBasicMaterial).color.setHex(gun.warning > 0 && Math.sin(time * 24) > 0 ? 0xffff70 : color);
      });
    }
    for (const bolt of this.shots) {
      if (bolt.used) continue;
      const start = bolt.object.position.clone();
      bolt.life -= dt; bolt.object.position.addScaledVector(bolt.velocity, dt);
      if (playerAlive && sweptHit(previous, player, start, bolt.object.position, bolt.radius + 2) !== null) { hits++; bolt.used = true; }
      if (bolt.life <= 0 || bolt.object.position.z > player.z + 70) bolt.used = true;
    }
    this.shots = this.shots.filter(bolt => {
      if (!bolt.used) return true;
      this.root.remove(bolt.object); disposeObject(bolt.object); return false;
    });
    return { shots, hits, notice };
  }
  clear(position: THREE.Vector3): void {
    for (const bolt of this.shots) if (bolt.object.position.distanceTo(position) <= 240) { bolt.used = true; bolt.object.visible = false; }
  }
}
