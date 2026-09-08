/** Builds and owns world actors; combat and mission settlement live elsewhere. */
import * as THREE from 'three';
import type { EnemyArchetype, RunState } from '../arcade';
import type { CargoDrop } from '../logic';
import { armadaFormationPosition, armadaSalvageVelocity } from '../armada';
import { HULL } from '../encounters';
import type { StageDefinition, Random } from '../encounters';
import { createArmadaRig, createBaseModel, createPlanetModel, createBlackMarketModel, createGateModel, createPoliceModel,
  createTraderUfoModel, createTraderHaulerModel, createCargoModel, createEnemyModel, disposeObject, edgesFromGeometry, lineShape } from '../models';
import type { Actor, ActorKind } from '../combat/types';
import { createInvaderModel } from '../models/ships';
import { shipVoice, invaderVoice } from '../audio/events';

interface SpawnFrame { run: RunState; definition: StageDefinition; position: THREE.Vector3; orientation: THREE.Quaternion; rng: Random }

export class ActorWorld {
  private active: Actor[] = [];
  private rig: ReturnType<typeof createArmadaRig> | null = null;
  constructor(private readonly world: THREE.Group, private readonly allocateId: () => number) {}
  get actors(): readonly Actor[] { return this.active; }
  clear(): void {
    for (const actor of [...this.active]) this.remove(actor);
    if (this.rig) { this.world.remove(this.rig.root); disposeObject(this.rig.root); this.rig = null; }
  }
  remove(actor: Actor): void {
    // Mark dead before unlinking. Other controllers may still hold this tick's
    // snapshot, so repeated removal must be harmless and must not dispose twice.
    if (actor.dead) return;
    actor.dead = true; this.world.remove(actor.object); disposeObject(actor.object);
    this.active = this.active.filter(item => item !== actor);
  }
  add(kind: ActorKind, object: THREE.Object3D, position: THREE.Vector3, radius: number, hull: number, role: EnemyArchetype = 'raider'): Actor {
    object.position.copy(position); this.world.add(object);
    const actor: Actor = { id: this.allocateId(), kind, faction: kind === 'pirate' || kind === 'part' || kind === 'mine' ? 'pirate' : kind === 'police' ? 'police' : kind === 'trader' ? 'trader' : 'neutral',
      object, previous: position.clone(), radius, hull, maxHull: hull, role, firingVoice: shipVoice(kind, role), age: 0, cooldown: kind === 'pirate' ? 1.1 : 2, windup: -1, target: 0,
      anchor: position.clone(), offset: new THREE.Vector3(), parent: null, essential: false, drop: null, dead: false, spawned: 0, drift: null };
    this.active.push(actor); return actor;
  }
  cargo(drop: CargoDrop, position: THREE.Vector3, essential = false, armada = false): Actor {
    // Armada loot drifts down the defensive lane; normal salvage stays in space
    // until approached. Neither path makes essential cargo available to NPCs.
    const actor = this.add('cargo', createCargoModel(drop.type), position, 4, Infinity);
    actor.drop = drop; actor.essential = essential;
    if (armada) actor.drift = armadaSalvageVelocity(position);
    return actor;
  }
  createLevel(run: RunState, definition: StageDefinition) {
    let objectiveShip: Actor | null = null, objectivePod: Actor | null = null;
    const base = this.add('base', createBaseModel(), new THREE.Vector3(-135, -30, -225), 31, 500);
    const planet = this.add('planet', createPlanetModel([0x70ffc0, 0xffdb74, 0x81bdff][definition.chapter - 1]), new THREE.Vector3(320, -140, -500), 58, Infinity);
    planet.object.rotation.x = 0.4;
    this.add('market', createBlackMarketModel(), new THREE.Vector3(175, 30, -280), 18, Infinity);
    const gate = this.add('gate', createGateModel(), new THREE.Vector3(0, 0, -340), 28, Infinity);
    gate.object.visible = false;
    if (definition.kind === 'armada') {
      base.object.visible = false;
      planet.object.visible = false;
      for (const actor of this.actors) if (actor.kind === 'market') actor.object.visible = false;
      this.rig = createArmadaRig();
      this.world.add(this.rig.root);
    } else if (run.mode === 'journey') {
      this.add('police', createPoliceModel(), new THREE.Vector3(-150, 45, -190), 9, 130);
      this.add('trader', createTraderUfoModel(), new THREE.Vector3(150, 30, -245), 10, 140).firingVoice = 'saucer';
    }
    if (!run.cleared && definition.kind === 'rescue') {
      objectivePod = this.cargo({ type: 'rescuePod', amount: 1 }, new THREE.Vector3(0, 0, -90), true);
    }
    if (definition.kind === 'escort') objectiveShip = this.add('trader', createTraderHaulerModel(), new THREE.Vector3(-40, 0, -100), 11, 340);
    if (definition.kind === 'defend') objectiveShip = base;
    if (objectiveShip) objectiveShip.essential = true;

    return { base, gate, objectiveShip, objectivePod, armadaRig: this.rig };
  }
  spawnPack(roles: EnemyArchetype[], frame: SpawnFrame): Actor[] {
    // Free-flight arrivals are placed ahead of the current ship orientation, not
    // ahead of world north. Formation encounters use their fixed defensive plane.
    if (!roles.length) return [];
    const arrivals: Actor[] = [];
    const { run, definition, position: origin, orientation, rng } = frame;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(orientation);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(orientation);
    roles.forEach((role, index) => {
      const armada = definition.kind === 'armada';
      const position = armada ? armadaFormationPosition(index, roles.length)
        : origin.clone().addScaledVector(forward, role === 'carrier' ? 260 : 185 + rng.range(0, 60))
          .addScaledVector(right, (index - (roles.length - 1) / 2) * 27);
      if (!armada) position.y += rng.range(-16, 20);
      if (run.mode === 'endless' && !armada && position.length() > 440) {
        // Fit the compact arena without clamping a new enemy onto the player.
        position.setLength(440);
        if (position.distanceTo(origin) < 140) position.copy(origin).addScaledVector(origin.clone().negate().normalize(), 190);
      }
      if (definition.kind === 'ambush' && run.elapsed > 5) position.sub(origin).applyAxisAngle(new THREE.Vector3(0, 1, 0), index % 2 ? 0.75 : -0.75).add(origin);
      const actor = this.add('pirate', run.mode === 'invaders' ? createInvaderModel(role) : createEnemyModel(role), position, role === 'carrier' ? 23 : role === 'gunship' ? 10 : 8, HULL[role], role);
      if (run.mode === 'invaders') actor.firingVoice = invaderVoice(role);
      arrivals.push(actor);
      actor.cooldown += index * 0.25;
      if (role === 'carrier' && definition.kind === 'boss') {
        // Boss parts are separate damageable actors. Their parent ID lets combat
        // remove them with the carrier and lets AI check whether launch bays remain.
        actor.hull = actor.maxHull = 300 + definition.chapter * 130;
        actor.essential = true;
        for (let partIndex = 0; partIndex < definition.bossParts; partIndex += 1) {
          const offset = new THREE.Vector3((partIndex % 2 ? 1 : -1) * (27 + Math.floor(partIndex / 2) * 7), Math.floor(partIndex / 2) * 11 - 4, -2);
          const model = new THREE.Group();
          model.add(edgesFromGeometry(new THREE.BoxGeometry(11, 9, 13), partIndex < 2 && definition.chapter > 1 ? 0xff69a8 : 0xffa950));
          model.add(lineShape([[0, 0, 0], [-offset.x * 0.75, -offset.y * 0.75, 0]], [[0, 1]], 0xff4055));
          const part = this.add('part', model, position.clone().add(offset), 8, 100 + definition.chapter * 18, 'gunship');
          part.parent = actor.id; part.offset.copy(offset);
          part.cooldown = 3 + partIndex;
        }
      }
    });
    return arrivals;
  }
}
