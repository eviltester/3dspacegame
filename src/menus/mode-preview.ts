/**
 * Isolated title-screen animation. Formation previews reuse movement helpers and
 * Smuggler reuses the real course controller, but neither has access to a RunState
 * or persistence, so preview collisions and course changes cannot affect progress.
 */
import * as THREE from 'three';
import type { GameMode } from '../modes';
import { newRun } from '../arcade';
import { TunnelSimulation } from '../tunnels/simulation';
import { TunnelView } from '../tunnels/view';
import { laneDelta } from '../tunnels/shapes';
import { BonusController, asteroidFlight, asteroidGap } from '../bonus';
import { configureArmadaCamera } from '../armada';
import { invaderStage } from '../invaders';
import { INVADER_PATTERNS, invaderHome } from '../invader-patterns';
import { stepInvaderFormation } from '../invader-formation';
import { createArmadaRig, createBaseModel, createBoltModel, createEnemyModel, createInvaderModel, createPlanetModel, disposeObject } from '../models';

// Thumbnail framing only. Leave the first-person courses at their normal field
// of view; the fleet and tunnel displays need a closer view in the same space.
const PREVIEW_ZOOM: Record<GameMode, number> = { journey: 1.8, endless: 1.7, invaders: 1.3, smuggler: 1, tunnels: 1.5 };

export class ModePreview {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 1, 0.1, 5200);
  private readonly fleet: THREE.Object3D[] = [];
  private readonly shots: THREE.Object3D[] = [];
  private craft: THREE.Object3D | null = null;
  private course: BonusController | null = null;
  private offset = new THREE.Vector2();
  private elapsed = 0;
  private courseTime = 0;
  private canyon = false;
  private tunnel: TunnelView | null = null;
  constructor(readonly mode: GameMode) {
    if (mode === 'tunnels') { this.startTunnel(1); return; }
    if (mode === 'smuggler') { this.startCourse(); return; }
    const count = mode === 'invaders' ? 14 : mode === 'endless' ? 8 : 4;
    for (let i = 0; i < count; i++) {
      const role = (['raider', 'diver', 'flanker'] as const)[i % 3];
      const ship = mode === 'invaders' ? createInvaderModel(role) : createEnemyModel(role);
      if (mode === 'invaders') ship.position.copy(invaderHome(i));
      if (mode !== 'invaders') ship.scale.setScalar(1.35);
      this.fleet.push(ship); this.scene.add(ship);
    }
    if (mode === 'invaders') { const rig = createArmadaRig(); this.craft = rig.craft; this.scene.add(rig.root); }
    if (mode === 'journey') {
      const base = createBaseModel(); base.position.set(-90, -25, -210); this.scene.add(base);
      const planet = createPlanetModel(0x63cfa2); planet.scale.setScalar(0.6); planet.position.set(115, -25, -320); this.scene.add(planet);
    }
    for (let i = 0; i < 10; i++) {
      const shot = createBoltModel(i % 2 ? 0xff505a : 0xffffcb, 2, 15, i % 2 ? 'pirate' : 'player');
      this.shots.push(shot); this.scene.add(shot);
    }
  }
  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.zoom = PREVIEW_ZOOM[this.mode];
    this.camera.updateProjectionMatrix();
    this.tunnel?.configureCamera(this.camera);
    if (this.mode === 'invaders') configureArmadaCamera(this.camera);
  }
  private startTunnel(level: number): void {
    if (this.tunnel) { this.scene.remove(this.tunnel.root); this.tunnel.dispose(); }
    const run = newRun('tunnels', 0x1984); run.stage = level; run.phase = 'playing';
    this.tunnel = new TunnelView(new TunnelSimulation(run)); this.scene.add(this.tunnel.root); this.tunnel.configureCamera(this.camera);
  }
  private startCourse(): void {
    if (this.course) { this.scene.remove(this.course.root); this.course.dispose(); }
    this.course = new BonusController(this.canyon ? 'canyon' : 'asteroids', 0x1984, 2);
    this.scene.add(this.course.root); this.offset.set(0, 0); this.courseTime = 0;
    this.camera.position.set(0, 0, 0); this.camera.quaternion.identity();
  }
  tick(dt: number): void {
    this.elapsed += dt;
    if (this.tunnel) {
      const simulation = this.tunnel.simulation, s = simulation.state;
      if (s.elapsed > 12 || s.phase !== 'assault') { this.startTunnel(s.level === 1 ? 7 : 1); return; }
      const enemy = s.entities.filter(e => e.required).sort((a, b) => a.depth - b.depth)[0];
      s.protection = 5;
      const movement = enemy ? laneDelta(s.desiredLane, enemy.lane, simulation.shape.closed) * 45 * Math.min(1, dt * 5) : dt * 25;
      simulation.step(Math.min(0.1, dt), movement, true); this.tunnel.update(dt, simulation.drain()); return;
    }
    if (this.course) {
      this.courseTime += dt;
      if (this.courseTime > 9 || this.course.state.finished) { this.canyon = !this.canyon; this.startCourse(); }
      const course = this.course;
      let target = asteroidGap(Math.min(55, asteroidFlight(course.state.elapsed + dt, 2).progress * 58));
      const gate = course.canyon?.gates.find(item => !item.resolved);
      if (course.canyon && gate) {
        const delta = gate.object.position.clone().sub(course.path.getPointAt(gate.progress)); target = new THREE.Vector2(delta.x, delta.y);
      }
      course.step(dt, { x: (target.x - this.offset.x) / 0.13, y: -(target.y - this.offset.y) / 0.13 }, this.camera);
      this.offset.copy(target); return;
    }
    const t = this.elapsed;
    if (this.mode === 'invaders') {
      const wave = 1 + Math.floor(t / 7) % INVADER_PATTERNS.length;
      const speed = invaderStage(wave).difficulty.movementScale;
      stepInvaderFormation(this.fleet.map((ship, slot) => ({ slot, position: ship.position })), dt, t, wave, speed);
      this.fleet.forEach(ship => { ship.rotation.y = Math.PI; });
      if (this.craft) this.craft.position.x = Math.sin(t) * 55;
    } else {
      this.fleet.forEach((ship, i) => {
        ship.position.set(Math.sin(t * 0.55 + i * 2.2) * (this.mode === 'endless' ? 85 : 48), Math.sin(t * 0.7 + i) * 25, -130 - i * 22 + Math.cos(t + i) * 18);
        ship.lookAt(0, 0, 0); ship.rotateY(Math.PI);
      });
      this.camera.rotation.set(Math.sin(t * 0.2) * 0.035, Math.sin(t * 0.3) * 0.08, 0);
    }
    this.shots.forEach((shot, i) => {
      const progress = (t * 0.8 + i / this.shots.length) % 1;
      const target = this.fleet[i % this.fleet.length].position;
      // Keep demo fire away from the cockpit camera so it cannot obscure the fleet.
      const travel = this.craft ? progress : 0.12 + progress * 0.76;
      shot.position.lerpVectors(this.craft?.position ?? new THREE.Vector3(0, -4, -42), target, i % 2 ? 1 - travel : travel);
      shot.lookAt(target); shot.scale.setScalar((this.craft ? 1 : 0.7) * (1 + Math.sin(t * 20 + i) * 0.15));
    });
  }
  dispose(): void {
    if (this.tunnel) { this.scene.remove(this.tunnel.root); this.tunnel.dispose(); }
    if (this.course) { this.scene.remove(this.course.root); this.course.dispose(); }
    disposeObject(this.scene); this.scene.clear();
  }
}
