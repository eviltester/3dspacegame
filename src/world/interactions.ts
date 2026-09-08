/** Proximity pickups, automatic trade, contraband scans and solid landmarks. */
import * as THREE from 'three';
import { pickup } from '../arcade';
import type { RunState } from '../arcade';
import { driftArmadaSalvage } from '../armada';
import type { Actor } from '../combat/types';
import type { StageDefinition } from '../encounters';
import { instantTrade, resolveContrabandScan } from '../logic';
import type { CargoDrop } from '../logic';
import { createPoliceModel } from '../models';
import type { ActorWorld } from './actors';

export interface WorldFrame {
  run: RunState;
  position: THREE.Vector3;
  orientation: THREE.Quaternion;
  base: Actor | null;
  definition: StageDefinition;
}
interface WorldEvents {
  collected(drop: CargoDrop, upgraded: boolean): void;
  traded(message: string): void;
  warning(message: string, cue: 'policeScan' | 'policeDispatch'): void;
}
export class WorldInteractions {
  private scanCooldown = 5;
  private warrantTime = 0;
  private policeDispatched = false;
  constructor(private readonly actors: ActorWorld, private readonly events: WorldEvents) {}
  reset(): void { this.scanCooldown = 5; this.warrantTime = 0; this.policeDispatched = false; }
  collect(dt: number, frame: WorldFrame): boolean {
    let rescued = false;
    const { run, position, base } = frame;
    for (const actor of [...this.actors.actors]) {
      if (actor.dead || actor.kind !== 'cargo' || !actor.drop) continue;
      actor.previous.copy(actor.object.position);
      if (actor.drift && driftArmadaSalvage(actor.object.position, actor.drift, dt, actor.essential)) { this.actors.remove(actor); continue; }
      actor.object.rotation.y += dt * 0.9;
      let distance = actor.object.position.distanceTo(position);
      if (actor.drop.type !== 'contraband' && distance < run.magnet) {
        // Illegal cargo deliberately bypasses the magnet: flying near salvage
        // must not quietly turn a lawful player into a smuggler.
        actor.object.position.lerp(position, Math.min(1, dt * 6));
        distance = actor.object.position.distanceTo(position);
      }
      if (distance < (actor.drop.type === 'contraband' ? 7 : 9)) {
        const oldTier = run.tiers[run.family];
        pickup(run, actor.drop);
        this.events.collected(actor.drop, run.tiers[run.family] > oldTier);
        this.actors.remove(actor);
      }
    }
    const nearBase = !!base && position.distanceTo(base.object.position) < 95;
    if (nearBase) {
      // Read the pod before trade consumes inventory so the rescue objective can
      // acknowledge delivery even though the cargo has already been sold.
      const hasPod = run.pilot.inventory.rescuePods > 0;
      const trade = instantTrade(run.pilot, 'lawful');
      if (trade.creditsEarned > 0) { run.pilot = trade.progress; this.events.traded(`CARGO SOLD +${trade.creditsEarned} CR`); }
      if (hasPod) rescued = true;
    }
    const nearMarket = this.actors.actors.some(actor => actor.kind === 'market' && actor.object.position.distanceTo(position) < 70);
    if (nearMarket && run.pilot.inventory.contraband > 0) {
      const trade = instantTrade(run.pilot, 'blackMarket'); run.pilot = trade.progress;
      this.events.traded(`BLACK MARKET +${trade.creditsEarned} CR`);
    }
    return rescued;
  }
  enforce(dt: number, frame: WorldFrame): void {
    const { run, position, base } = frame;
    this.scanCooldown -= dt;
    if (base && position.distanceTo(base.object.position) < 110 && this.scanCooldown <= 0 && run.pilot.inventory.contraband > 0) {
      const result = resolveContrabandScan(run.pilot, `stage-${run.stage}`);
      run.pilot = result.progress; this.scanCooldown = 8; this.events.warning(result.message.toUpperCase(), 'policeScan');
    }
    if (run.pilot.wanted.active && !this.policeDispatched) {
      // One delayed response per loaded stage, separate from existing patrols.
      // reset() clears these transient timers whenever the stage is rebuilt.
      this.warrantTime += dt;
      if (this.warrantTime >= 8) {
        this.policeDispatched = true;
        const origin = base?.object.position ?? position.clone().add(new THREE.Vector3(180, 0, 0));
        for (let i = 0; i < 3; i += 1) this.actors.add('police', createPoliceModel(), origin.clone().add(new THREE.Vector3(i * 20, 35, 0)), 9, 100);
        this.events.warning('POLICE DISPATCHED FROM NEAREST STATION', 'policeDispatch');
      }
    }
  }
  collide(frame: WorldFrame, throttle: number): number {
    const { definition, position, orientation } = frame;
    if (definition.kind === 'armada') return throttle;
    for (const actor of this.actors.actors) {
      if (!['base', 'planet', 'market'].includes(actor.kind)) continue;
      const radius = actor.radius + 4;
      const offset = position.clone().sub(actor.object.position);
      if (offset.length() < radius) {
        // Push the ship back to a landmark's collision surface and slow it down.
        // Warp gates are excluded: their open aperture uses plane-crossing logic.
        if (offset.lengthSq() < 0.01) offset.copy(new THREE.Vector3(0, 0, -1).applyQuaternion(orientation)).negate();
        position.copy(actor.object.position).addScaledVector(offset.normalize(), radius);
        throttle = THREE.MathUtils.clamp(throttle, -20, 20);
      }
    }
    return throttle;
  }
}
