/** Falling rocks use the defensive X/Z plane: mouse/keys still move left/right. */
import * as THREE from 'three';
import { Random } from '../encounters';
import { ASTEROID_COLORS, edgesFromGeometry } from '../models';
import { asteroidChild, ASTEROID_FRAGMENT_GRACE, MAX_ASTEROID_FRAGMENTS } from '../asteroid-fragments';
import { hasInvaderStorm, invaderFieldDuration, isInvaderField } from '../invader-events';
import { sweptHit } from '../weapons';
import type { Actor } from './types';
import type { EnemyFrame, EnemyServices } from './enemies';
import { DEFENSIVE_MINE_HITS } from './defensive-position';

export class InvaderHazards {
  private random = new Random(1);
  private initialized = false;
  private nextRock = 1;
  private nextMine = 5;
  private stormStarted = false;
  private stormLeft = 0;
  private index = 0;
  constructor(private readonly services: EnemyServices) {}
  reset(): void { this.initialized = false; this.nextRock = 1; this.nextMine = 5; this.stormStarted = false; this.stormLeft = 0; this.index = 0; }
  update(dt: number, frame: EnemyFrame): void {
    if (dt <= 0 || frame.run.mode !== 'invaders' || frame.run.phase !== 'playing') return;
    if (!this.initialized) { this.random = new Random(frame.run.seed ^ Math.imul(frame.run.stage, 4567)); this.initialized = true; }
    const field = isInvaderField(frame.run.stage), time = frame.run.elapsed;
    const active = () => frame.actors().filter(a => !a.dead && a.kind === 'asteroid');
    if (!field && hasInvaderStorm(frame.run.stage) && time >= 6 && !this.stormStarted) {
      this.stormStarted = true; this.stormLeft = 5; this.nextRock = time;
      this.services.announceArrival([], 'ASTEROID STORM - SHOOT OR DODGE!');
    }
    if ((field && time < invaderFieldDuration(frame.run.stage) || this.stormLeft > 0) && time >= this.nextRock && active().length < 18) {
      // Staggered, narrow rocks leave traversable space; never spawn a solid row.
      const x = [-62, 0, 62, -31, 31][this.index % 5] + this.random.range(-6, 6);
      const size = this.index % 5 === 3 ? 1 : 2;
      this.addRock(new THREE.Vector3(x, 0, -430), size === 2 ? 13 : 8, size, ASTEROID_COLORS[this.index % ASTEROID_COLORS.length],
        new THREE.Vector3(this.random.range(-3, 3), 0, 52 + Math.min(30, Math.log2(frame.run.stage) * 6)));
      this.index++; this.stormLeft = Math.max(0, this.stormLeft - 1);
      this.nextRock = time + Math.max(0.7, 1.55 - Math.log2(frame.run.stage) * 0.1);
    }
    if (field && time >= this.nextMine && time < invaderFieldDuration(frame.run.stage)
      && frame.actors().filter(a => !a.dead && a.kind === 'mine').length < 4) {
      const mine = this.services.addActor('mine', edgesFromGeometry(new THREE.OctahedronGeometry(5), 0xff4055),
        new THREE.Vector3(this.random.range(-68, 68), 0, -430), 6, DEFENSIVE_MINE_HITS);
      mine.drift = new THREE.Vector3(0, 0, 65 + Math.min(20, frame.run.stage)); this.nextMine = time + 5;
    }
    for (const actor of active()) {
      actor.previous.copy(actor.object.position); actor.age += dt;
      actor.asteroid!.grace = Math.max(0, actor.asteroid!.grace - dt);
      actor.object.position.addScaledVector(actor.drift!, dt);
      if (Math.abs(actor.object.position.x) > 76) { actor.object.position.x = THREE.MathUtils.clamp(actor.object.position.x, -76, 76); actor.drift!.x *= -1; }
      actor.object.rotation.x += dt * 0.7; actor.object.rotation.y += dt * 0.4;
      if (actor.asteroid!.grace <= 0 && sweptHit(actor.previous, actor.object.position, frame.previousPosition, frame.position, actor.radius + 3) !== null) {
        this.services.damagePlayer(actor.asteroid!.size === 2 ? 20 : 10, 'ASTEROID IMPACT'); this.services.destroy(actor, false);
        if (this.services.stopped()) return;
      } else if (actor.object.position.z > 45 || actor.age > 16) this.services.removeActor(actor);
    }
  }
  private addRock(position: THREE.Vector3, radius: number, size: 0 | 1 | 2, color: number, velocity: THREE.Vector3): Actor {
    const model = edgesFromGeometry(size === 2 ? new THREE.IcosahedronGeometry(radius, 0) : new THREE.OctahedronGeometry(radius, 0), color);
    const actor = this.services.addActor('asteroid', model, position, radius, 24);
    actor.asteroid = { size, color, grace: size < 2 ? ASTEROID_FRAGMENT_GRACE : 0.9 }; actor.drift = velocity;
    return actor;
  }
  split(actor: Actor, actors: readonly Actor[]): void {
    const rock = actor.asteroid, child = rock && asteroidChild(rock.size, actor.radius);
    if (!rock || !child || actors.filter(a => !a.dead && a.kind === 'asteroid').length + 2 > MAX_ASTEROID_FRAGMENTS) return;
    for (const side of [-1, 1]) {
      const point = actor.object.position.clone(); point.x = THREE.MathUtils.clamp(point.x + side * child.radius * 1.2, -74, 74);
      this.addRock(point, child.radius, child.size, rock.color, new THREE.Vector3(side * (child.size === 1 ? 16 : 24), 0, Math.min(110, (actor.drift?.z ?? 65) * 1.12)));
    }
    this.services.cue('fracture');
  }
}
