/**
 * NPC movement, faction target selection and warned attacks. The game supplies
 * this tick's world and callbacks; this controller does not award score or save.
 */
import * as THREE from 'three';
import { canNpcCollect } from '../arcade';
import type { EnemyArchetype, RunState } from '../arcade';
import type { StageDefinition } from '../encounters';
import { HULL } from '../encounters';
import { ENEMY_ATTACK_WARNING } from '../endless-difficulty';
import { stepInvaderFormation } from '../invader-formation';
import { invaderFighterShots } from '../invaders';
import type { Faction } from '../logic';
import { createEnemyModel, edgesFromGeometry } from '../models';
import type { Actor, ActorKind } from './types';
import { InvaderFireDirector, invaderCoverTarget, invaderFireTiming } from './invader-fire';
import { shipVoice } from '../audio/events';
import type { FeedbackCue, ShipVoice } from '../audio/events';
import { InvaderFlybys, moveInvaderMine } from './invader-flybys';
import { InvaderHazards } from './invader-hazards';
import { InvaderBonuses } from './invader-bonuses';
import { updateInvaderMineWarning } from '../rendering/invader-mine-warning';

export interface EnemyFrame {
  run: RunState;
  definition: StageDefinition;
  actors(): readonly Actor[];
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  orientation: THREE.Quaternion;
  objectiveShip: Actor | null;
  flightsFinished?: boolean;
}
export interface EnemyServices {
  addActor(kind: ActorKind, object: THREE.Object3D, position: THREE.Vector3, radius: number, hull: number, role?: EnemyArchetype): Actor;
  removeActor(actor: Actor): void;
  destroy(actor: Actor, byPlayer: boolean): void;
  damagePlayer(damage: number, message: string): void;
  announceArrival(actors: Actor[], message: string): void;
  spawnShot(faction: Faction, source: number, target: number, position: THREE.Vector3, direction: THREE.Vector3, speed: number, damage: number, color: number, radius: number, length: number, pierce: number): void;
  enemyShoot(voice: ShipVoice, distance: number): void;
  cue(cue: FeedbackCue): void;
  lockOn(): void;
  stopped(): boolean;
}

export class EnemySystem {
  private frame!: EnemyFrame;
  private threat: Actor | null = null;
  private readonly invaderFire = new InvaderFireDirector();
  private invaderTurn: Actor | undefined;
  private coverTurns: readonly Actor[] = [];
  private fleetSize = 18;
  private coverShot = 0;
  private readonly flybys: InvaderFlybys;
  private readonly hazards: InvaderHazards;
  private readonly bonuses: InvaderBonuses;
  constructor(private readonly services: EnemyServices) { this.flybys = new InvaderFlybys(services); this.hazards = new InvaderHazards(services); this.bonuses = new InvaderBonuses(services); }
  reset(): void { this.invaderFire.reset(); this.invaderTurn = undefined; this.coverTurns = []; this.coverShot = 0; this.flybys.reset(); this.hazards.reset(); this.bonuses.reset(); }
  splitAsteroid(actor: Actor, actors: readonly Actor[]): void { this.hazards.split(actor, actors); }
  private hostiles(): readonly Actor[] { return this.frame.actors().filter(a => !a.dead && (a.kind === 'pirate' || a.kind === 'mine')); }
  private forward(): THREE.Vector3 { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.frame.orientation); }
  update(dt: number, frame: EnemyFrame): Actor | null {
    this.frame = frame;
    this.threat = null;
    const difficulty = this.frame.definition.difficulty;
    this.flybys.update(dt, frame);
    this.hazards.update(dt, frame);
    if (this.services.stopped()) return this.threat;
    this.bonuses.update(dt, frame);
    // Take a snapshot: carriers can add fighters and mines during this iteration.
    // New arrivals start updating on the next tick instead of acting immediately.
    const actors = [...this.frame.actors()];
    this.fleetSize = actors.filter(actor => !actor.dead && actor.kind === 'pirate' && !actor.flyby).length;
    const eligible = actors.filter(actor => !actor.dead
      && actor.kind === 'pirate' && !actor.flyby && !actor.escape && actor.windup < 0 && actor.cooldown <= dt && actor.age >= 1.1
      && actor.object.position.distanceTo(frame.position) <= 390);
    this.invaderTurn = frame.run.mode === 'invaders' ? this.invaderFire.next(dt, eligible, frame.run.stage, this.fleetSize) : undefined;
    this.coverTurns = frame.run.mode === 'invaders' ? this.invaderFire.cover(dt, eligible.filter(actor => actor !== this.invaderTurn), frame.run.stage, this.fleetSize) : [];
    if (frame.run.mode === 'invaders') {
      const fleet = actors.filter(actor => actor.kind === 'pirate' && !actor.flyby && !actor.escape && !actor.dead);
      // Live spawns already own slots. Assign slots to externally arranged actors as well.
      const used = new Set(fleet.map(actor => actor.formationSlot));
      for (const actor of fleet) {
        if (actor.formationSlot === undefined) {
          let slot = 0; while (used.has(slot)) slot++;
          actor.formationSlot = slot; used.add(slot);
        }
        actor.previous.copy(actor.object.position); actor.age += dt;
      }
      stepInvaderFormation(fleet.map(actor => ({ slot: actor.formationSlot!, position: actor.object.position })), dt,
        frame.run.elapsed, frame.run.stage, difficulty.movementScale);
    }
    for (const actor of actors) {
      if (actor.dead || actor.flyby || actor.escape || ['cargo', 'gate', 'planet', 'market', 'asteroid'].includes(actor.kind)) continue;
      if (frame.run.mode !== 'invaders' || actor.kind !== 'pirate') {
        actor.previous.copy(actor.object.position);
        if (!actor.essential || this.frame.definition.kind !== 'escort') actor.age += dt;
      }
      actor.cooldown = Math.max(0, actor.cooldown - dt);
      if (frame.run.mode === 'invaders' && actor.kind === 'pirate') {
        // A casualty shortens waits already in progress, not just the next shot's cooldown.
        actor.cooldown = Math.min(actor.cooldown, invaderFireTiming(frame.run.stage, this.fleetSize).cooldown);
      }
      if (actor.kind === 'mine') {
        actor.object.rotation.y += dt;
        actor.object.scale.setScalar(1 + Math.sin(actor.age * 12) * 0.15);
        if (frame.run.mode === 'invaders') {
          actor.object.traverse(child => { if (child instanceof THREE.LineSegments) (child.material as THREE.LineBasicMaterial).opacity = 0.5 + (Math.sin(actor.age * 14) + 1) * 0.25; });
          const contact = moveInvaderMine(actor, dt, frame);
          if (contact === 'hit') { this.services.damagePlayer(10, 'DRIFTING MINE EXPLOSION'); this.services.destroy(actor, false); }
          else if (contact === 'expired') this.services.removeActor(actor);
          else updateInvaderMineWarning(actor.object, actor.age, actor.object.position.distanceTo(frame.position));
          if (this.services.stopped()) return this.threat;
          continue;
        }
        if (actor.age > 1.5 && this.frame.position.distanceTo(actor.object.position) < 12) { this.services.damagePlayer(18, 'MINE EXPLOSION'); this.services.destroy(actor, false); }
        if (actor.age > 14) this.services.destroy(actor, false);
        continue;
      }
      if (actor.kind === 'part') {
        const parent = this.frame.actors().find(item => item.id === actor.parent && !item.dead);
        if (!parent) { this.services.removeActor(actor); continue; }
        actor.object.position.copy(parent.object.position).add(actor.offset);
      }
      const target = this.combatTarget(actor);
      if (actor.kind === 'pirate') {
        if (this.frame.definition.kind === 'armada' && this.frame.run.mode !== 'invaders') {
          const phase = (this.frame.run.elapsed * difficulty.movementScale + actor.id * 0.6) % 10;
          const diving = actor.role === 'diver' && phase > 6;
          actor.object.position.set(actor.anchor.x + Math.sin(this.frame.run.elapsed * 0.6 * difficulty.movementScale) * 18,
            0,
            diving ? actor.anchor.z + Math.sin((phase - 6) / 4 * Math.PI) * Math.min(190, -actor.anchor.z - 38) : actor.anchor.z + Math.min(65, actor.age * 1.3 * difficulty.movementScale));
        } else if (this.frame.run.mode !== 'invaders') {
          const targetPoint = target?.object.position ?? this.frame.position;
          const delta = targetPoint.clone().sub(actor.object.position);
          const distance = delta.length(); const direction = delta.normalize();
          const side = new THREE.Vector3(-direction.z, 0, direction.x);
          const desired = actor.role === 'raider' && actor.age * difficulty.movementScale % 7 < 2 ? 80 : actor.role === 'carrier' || actor.role === 'gunship' ? 235 : 155;
          const velocity = direction.multiplyScalar(distance > desired ? actor.role === 'carrier' ? 35 : 72 : -24);
          velocity.addScaledVector(side, actor.role === 'flanker' ? (actor.id % 2 ? 65 : -65) : actor.role === 'carrier' ? 8 : 20);
          if (actor.role === 'diver') velocity.y += Math.sin(actor.age * 1.8 * difficulty.movementScale) * 70;
          actor.object.position.addScaledVector(velocity, dt * difficulty.movementScale);
          if (this.frame.run.mode === 'endless' && actor.object.position.length() > 440) actor.object.position.setLength(440);
        }
        actor.object.lookAt(target?.object.position ?? this.frame.position);
        actor.object.rotateY(Math.PI);
        const salvage = this.frame.actors().find(item => item.kind === 'cargo' && item.drop && canNpcCollect(actor.faction, item.drop.type, item.essential) && item.object.position.distanceTo(actor.object.position) < 35);
        if (salvage && this.frame.definition.kind !== 'armada') {
          actor.object.position.lerp(salvage.object.position, dt * 1.5);
          if (salvage.object.position.distanceTo(actor.object.position) < 15) this.services.removeActor(salvage);
        }
        if (actor.role === 'minelayer' && actor.spawned < 6 && actor.age > 3 && actor.age > actor.spawned * 5 + 3 && this.hostiles().length < 18) {
          actor.spawned += 1;
          this.services.addActor('mine', edgesFromGeometry(new THREE.OctahedronGeometry(5), 0xff4055), actor.object.position.clone(), 6, 20);
        }
        // A boss's lower functional parts are its launch bays. Destroying them
        // stops reinforcements; ordinary carriers do not have detachable parts.
        const bayOpen = !actor.essential || this.frame.actors().some(part => part.parent === actor.id && part.offset.y < 0);
        if (actor.role === 'carrier' && bayOpen && actor.age > difficulty.carrierInterval * (actor.spawned + 1) && actor.spawned < difficulty.carrierLaunches && this.hostiles().length < (this.frame.run.mode === 'endless' ? 18 : 17)) {
          actor.spawned += 1;
          const spawn = actor.object.position.clone().add(new THREE.Vector3(35, 0, 0));
          if (spawn.distanceTo(this.frame.position) < 110) spawn.copy(this.frame.position).addScaledVector(this.forward(), 150);
          const child = this.services.addActor('pirate', createEnemyModel('raider'), spawn, 8, HULL.raider);
          this.services.announceArrival([child], 'CARRIER DEPLOYED REINFORCEMENTS');
          child.cooldown = 2;
        }
      } else if (actor.kind === 'police' || actor.kind === 'trader') {
        const salvage = this.frame.actors().find(item => !item.dead && item.kind === 'cargo' && item.drop
          && canNpcCollect(actor.faction, item.drop.type, item.essential) && item.object.position.distanceTo(actor.object.position) < 100);
        if (salvage && !(actor.kind === 'police' && this.frame.run.pilot.wanted.active) && !actor.essential) {
          actor.object.position.addScaledVector(salvage.object.position.clone().sub(actor.object.position).normalize(), dt * 40);
          if (salvage.object.position.distanceTo(actor.object.position) < 15) this.services.removeActor(salvage);
        } else if (!actor.essential) {
          const huntingPlayer = (actor.kind === 'police' && this.frame.run.pilot.wanted.active) || actor.target === -1;
          const destination = huntingPlayer ? this.frame.position : target?.object.position ?? actor.anchor.clone().add(new THREE.Vector3(Math.sin(actor.age * 0.2) * 50, 0, 0));
          const direction = destination.clone().sub(actor.object.position);
          if (direction.length() > 100 || !target) actor.object.position.addScaledVector(direction.normalize(), dt * (actor.kind === 'police' ? 58 : 25));
        }
        actor.object.lookAt(target?.object.position ?? actor.anchor);
        actor.object.rotateY(Math.PI);
      }
      if (['pirate', 'police', 'trader', 'part'].includes(actor.kind)) this.attackStep(actor, target, dt);
      if (this.services.stopped()) return this.threat;
    }
    return this.threat;
  }
  private combatTarget(actor: Actor): Actor | null {
    // null means "no NPC target", not automatically "attack the player".
    // attackStep separately checks wanted/retaliation status so idle police stay safe.
    if (actor.faction === 'police' && this.frame.run.pilot.wanted.active) return null;
    if (actor.kind === 'trader' && actor.target === -1) return null;
    const candidates = this.frame.actors().filter(item => !item.dead && item !== actor && item.kind !== 'mine'
      && (actor.faction === 'pirate' ? (item.faction === 'police' || item.faction === 'trader' || item === this.frame.objectiveShip)
        : item.faction === 'pirate' && (item.kind === 'pirate' || item.kind === 'part')));
    candidates.sort((a, b) => a.object.position.distanceToSquared(actor.object.position) - b.object.position.distanceToSquared(actor.object.position));
    const target = candidates[0];
    if (!target) return null;
    if (actor.faction === 'pirate' && actor.object.position.distanceToSquared(this.frame.position) < target.object.position.distanceToSquared(actor.object.position)) return null;
    return target;
  }
  private attackStep(actor: Actor, target: Actor | null, dt: number): void {
    const difficulty = this.frame.definition.difficulty;
    const pirate = actor.faction === 'pirate';
    const aimsAtPlayer = !target && (actor.faction === 'pirate' || (actor.kind === 'police' && this.frame.run.pilot.wanted.active) || actor.target === -1);
    if (!target && !aimsAtPlayer) { actor.windup = -1; return; }
    const point = target?.object.position ?? this.frame.position;
    if (actor.object.position.distanceTo(point) > 390) { actor.windup = -1; return; }
    if (actor.windup < 0 && actor.cooldown <= 0 && actor.age >= 1.1) {
      // Share one windup budget across actors. More ships need not mean every
      // ship fires at once, and arrivals must finish their initial grace period.
      const attackers = this.frame.actors().filter(item => item.windup >= 0 && !item.dead).length;
      if (attackers >= this.frame.definition.attackerCap) return;
      if (this.frame.run.mode === 'invaders' && pirate) {
        if (actor !== this.invaderTurn && !this.coverTurns.includes(actor)) return;
        actor.coverFire = actor !== this.invaderTurn;
        if (!actor.coverFire) this.invaderFire.started(actor, this.frame.run.stage, this.fleetSize);
      }
      actor.windup = ENEMY_ATTACK_WARNING;
      if (aimsAtPlayer) this.services.lockOn();
    }
    if (actor.windup >= 0) {
      actor.windup -= dt;
      if (aimsAtPlayer) this.threat = actor;
      actor.object.traverse(child => { if (child instanceof THREE.LineSegments) (child.material as THREE.LineBasicMaterial).opacity = 0.55 + Math.sin(actor.age * 28) * 0.4; });
      if (actor.windup <= 0) {
        actor.windup = -1;
        actor.cooldown = (actor.role === 'carrier' ? 1.4 : actor.role === 'gunship' ? 2.5 : 1.7) / this.frame.definition.speedScale;
        if (pirate) actor.cooldown *= difficulty.cooldownScale;
        if (pirate && this.frame.run.mode === 'invaders') actor.cooldown = invaderFireTiming(this.frame.run.stage, this.fleetSize).cooldown;
        if (actor.essential && actor.role === 'carrier' && actor.hull < actor.maxHull * 0.5) actor.cooldown *= 0.7;
        const aimPoint = point.clone();
        const coverFire = this.frame.run.mode === 'invaders' && actor.coverFire && aimsAtPlayer;
        if (coverFire) aimPoint.x = invaderCoverTarget(this.frame.position.x, this.coverShot++);
        if (aimsAtPlayer && this.frame.definition.kind !== 'armada') {
          // Estimate player velocity from the previous fixed 1/60-second tick.
          // Lead is bounded so late waves remain dodgeable instead of perfect hits.
          const lead = actor.object.position.distanceTo(point) / (160 * this.frame.definition.speedScale) * (0.2 + this.frame.definition.chapter * 0.15 + (pirate ? difficulty.leadBonus : 0));
          aimPoint.addScaledVector(this.frame.position.clone().sub(this.frame.previousPosition).multiplyScalar(60), Math.min(1.2, lead));
        }
        const direction = aimPoint.sub(actor.object.position).normalize();
        const formationShots = this.frame.run.mode === 'invaders' && pirate && actor.formationSlot !== undefined
          ? invaderFighterShots(this.frame.run.stage, actor.formationSlot) : null;
        const count = coverFire ? 1 : formationShots ?? (actor.role === 'gunship' || actor.role === 'carrier' ? pirate ? difficulty.heavyShots : 3 : pirate ? difficulty.fighterShots : 1);
        for (let index = 0; index < count; index += 1) {
          const aim = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (index - (count - 1) / 2) * 0.09);
          this.services.spawnShot(actor.faction, actor.id, target?.id ?? 0, actor.object.position.clone().addScaledVector(aim, actor.radius + 5), aim,
            160 * this.frame.definition.speedScale, actor.kind === 'trader' ? 7 : 10, actor.faction === 'pirate' ? 0xff4055 : actor.faction === 'police' ? 0x75caff : 0x60ff85, 4.5, 20, 1);
        }
        actor.object.traverse(child => { if (child instanceof THREE.LineSegments) (child.material as THREE.LineBasicMaterial).opacity = 0.94; });
        this.services.enemyShoot(actor.firingVoice ?? shipVoice(actor.kind, actor.role), actor.object.position.distanceTo(this.frame.position));
      }
    }
  }
}
