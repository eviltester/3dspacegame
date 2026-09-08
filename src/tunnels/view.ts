/** A projection of lane data onto sparse vector geometry; owns/disposes all models. */
import * as THREE from 'three';
import { ASTEROID_COLORS, createArmadaRig, createBoltModel, createCargoModel, createCanyonTurret, createEnemyModel, createInvaderModel,
  createPoliceModel, createPulseRing, createTraderHaulerModel, createTraderUfoModel, disposeObject, edgesFromGeometry, lineShape, setProjectilePulseOpacity } from '../models';
import { ShipExplosions } from '../rendering/ship-explosions';
import { lanePoint, LANES, trackPoint, TUNNEL_DEPTH, tunnelColor } from './shapes';
import type { TunnelSimulation } from './simulation';
import type { TunnelEntity, TunnelEvent } from './types';
import { TunnelBreakup } from './breakup';
import { TUNNEL_COLLAPSE_SECONDS, tunnelZoom } from './ending-timing';
import { tunnelEntityPoint } from './edge';
import { TunnelObjectFlash } from './object-flash';

export class TunnelView {
  readonly root = new THREE.Group();
  readonly craft = createArmadaRig().craft;
  private readonly models = new Map<number, THREE.Object3D>();
  private readonly bolts = new Map<number, THREE.Object3D>();
  private readonly flashes = new TunnelObjectFlash();
  private readonly explosions: ShipExplosions;
  private readonly shell: THREE.LineSegments;
  private readonly ending: TunnelBreakup;
  private readonly blastRing = createPulseRing(0x8affd0, 1, 0, 0.8, 24);
  private blastAge = 99;
  private clock = 0;
  constructor(readonly simulation: TunnelSimulation, onBurst: () => void = () => {}) {
    const shape = simulation.shape, color = tunnelColor(simulation.state.level);
    this.root.name = 'tempestuous-tunnel';
    const vertices: Array<[number, number, number]> = [], edges: Array<[number, number]> = [];
    // Four cross sections and thirteen rails keep the tunnel's shape readable.
    for (const depth of [0, 110, 245, TUNNEL_DEPTH]) {
      const start = vertices.length;
      for (let i = 0; i <= LANES; i++) {
        const [x, y] = trackPoint(shape, i / LANES), scale = 1 - depth / TUNNEL_DEPTH * 0.5;
        vertices.push([x * scale, y * scale, -depth]);
        if (i) edges.push([start + i - 1, start + i]);
      }
    }
    for (let layer = 0; layer < 3; layer++) for (let i = 0; i <= LANES; i++) edges.push([layer * (LANES + 1) + i, (layer + 1) * (LANES + 1) + i]);
    const tunnel = lineShape(vertices, edges, color, 0.7);
    const positions = tunnel.geometry.getAttribute('position'), colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const tint = new THREE.Color(color).multiplyScalar(0.8 + positions.getZ(i) / TUNNEL_DEPTH * 0.65);
      colors.push(tint.r, tint.g, tint.b);
    }
    tunnel.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = tunnel.material as THREE.LineBasicMaterial;
    material.color.setHex(0xffffff); material.vertexColors = true;
    this.root.add(tunnel);
    this.shell = tunnel;
    this.ending = new TunnelBreakup(this.root, shape, color, onBurst);
    this.root.add(this.craft, this.blastRing); this.blastRing.visible = false;
    this.craft.scale.setScalar(0.75); this.craft.rotation.x = -0.25;
    this.explosions = new ShipExplosions(this.root);
  }
  configureCamera(camera: THREE.PerspectiveCamera): void {
    camera.fov = 58;
    const distance = Math.max(235, 115 / (Math.tan(29 * Math.PI / 180) * camera.aspect * 0.8));
    const state = this.simulation.state;
    const zoom = state.phase === 'collapse' ? tunnelZoom(state.remaining) : state.phase === 'result' ? 1 : 0;
    camera.position.set(0, 24 * (1 - zoom), THREE.MathUtils.lerp(distance, -80, zoom));
    camera.lookAt(0, 0, THREE.MathUtils.lerp(-80, -360, zoom)); camera.updateProjectionMatrix();
  }
  private model(e: TunnelEntity): THREE.Object3D {
    let object: THREE.Object3D;
    if (e.kind === 'ship' || e.kind === 'core') object = e.faction === 'police' ? createPoliceModel() : e.faction === 'trader' ? e.id % 2 ? createTraderHaulerModel() : createTraderUfoModel()
      : e.kind !== 'core' && e.id % 2 === 0 && ['raider','diver','flanker'].includes(e.role) ? createInvaderModel(e.role) : createEnemyModel(e.role);
    else if (e.kind === 'gun') object = createCanyonTurret();
    else if (e.kind === 'pickup') object = createCargoModel(e.drop === 'fullRepair' ? 'shieldCell' : e.drop ?? 'legalCargo');
    else if (e.kind === 'crate') object = edgesFromGeometry(new THREE.BoxGeometry(9, 9, 9), 0xffd766);
    else if (e.kind === 'asteroid') object = edgesFromGeometry(new THREE.IcosahedronGeometry(4 + e.size * 3, 0), ASTEROID_COLORS[e.id % ASTEROID_COLORS.length]);
    else if (e.kind === 'mine') object = edgesFromGeometry(new THREE.OctahedronGeometry(5, 0), 0xff5577);
    else object = edgesFromGeometry(new THREE.BoxGeometry(14, e.kind === 'wall' ? 22 : 30, 8), e.retracting ? 0xff79c3 : 0xffb263);
    if (e.kind === 'core') object.scale.setScalar(0.5);
    if (e.kind === 'ship') { object.rotation.x = 0.35; object.rotation.y = Math.PI; }
    if (e.drop === 'fullRepair') object.traverse(child => { if (child instanceof THREE.LineSegments && child.material instanceof THREE.LineBasicMaterial) child.material.color.setHex(0xff82d7); });
    const wrapper = new THREE.Group(); wrapper.add(object);
    this.root.add(wrapper); return wrapper;
  }
  update(dt: number, events: readonly TunnelEvent[] = []): void {
    this.clock += dt; this.blastAge += dt;
    const s = this.simulation.state, shape = this.simulation.shape;
    if (s.phase === 'collapse' || s.phase === 'result') this.ending.update(s.phase === 'result' ? TUNNEL_COLLAPSE_SECONDS : TUNNEL_COLLAPSE_SECONDS - s.remaining);
    this.shell.visible = !this.ending.exploded;
    for (const event of events) {
      if (event.type === 'explosion') {
        const object = this.models.get(event.entity.id);
        if (object) this.explosions.explode(object);
      }
      if (event.type === 'blast') this.blastAge = 0;
    }
    this.explosions.update(dt);
    const alive = new Set(s.entities.map(e => e.id));
    for (const [id, object] of this.models) if (!alive.has(id)) { this.root.remove(object); disposeObject(object); this.models.delete(id); }
    for (const e of s.entities) {
      let object = this.models.get(e.id);
      if (!object) { object = this.model(e); this.models.set(e.id, object); }
      object.position.set(...tunnelEntityPoint(shape, e));
      if (e.kind === 'asteroid' || e.kind === 'pickup') object.children[0].rotation.set(this.clock * 0.4, this.clock * 0.7, 0);
      // Warnings belong to the approaching object, never to a lane guide.
      const warningScale = e.depth >= 0 && (e.changing > 0 || e.grace > 0 && (e.kind === 'pillar' || e.fragmentSpeed !== undefined));
      object.scale.setScalar(warningScale ? 1 + Math.abs(Math.sin(this.clock * 12)) * 0.2 : 1);
      if (e.retracting) {
        // A low outline marks an imminent rise even while the pillar is retracted.
        object.children[0].scale.y = Math.max(e.grace > 0 ? 0.05 : 0.01, e.extension);
        object.children[0].visible = e.extension > 0.01 || e.grace > 0;
      }
      this.flashes.update(object.children[0], e, this.clock);
      if (e.rim) object.children[0].rotation.z = Math.sin(this.clock * 3) * 0.18;
      // During death the scene keeps gently moving, without advancing gameplay data.
      if (s.respawn > 0) { object.position.z += Math.sin(this.clock * 2 + e.id) * 3; object.rotation.z = Math.sin(this.clock + e.id) * 0.08; }
      else object.rotation.z = 0;
    }
    const liveShots = new Set(s.shots.map(e => e.id));
    for (const [id, object] of this.bolts) if (!liveShots.has(id)) { this.root.remove(object); disposeObject(object); this.bolts.delete(id); }
    for (const shot of s.shots) {
      let object = this.bolts.get(shot.id);
      if (!object) {
        const color = shot.faction === 'player' ? shot.family === 'spread' ? 0xffc963 : shot.family === 'lance' ? 0x86f5ff : 0xfaffcf : shot.faction === 'police' ? 0x75caff : shot.faction === 'trader' ? 0x7fff9b : 0xff505b;
        object = createBoltModel(color, shot.faction === 'player' ? 3.2 : 4.8, shot.family === 'lance' ? 26 : 14, shot.faction, shot.family);
        this.bolts.set(shot.id, object); this.root.add(object);
      }
      object.position.set(...lanePoint(shape, shot.lane, shot.depth));
      setProjectilePulseOpacity(object, (Math.sin(this.clock * 20 + shot.id) + 1) / 2);
    }
    this.craft.position.set(...lanePoint(shape, s.lane, -12)); this.craft.visible = s.respawn <= 0 && ['assault','salvage'].includes(s.phase);
    this.craft.traverse(child => { if (child instanceof THREE.LineSegments && child.material instanceof THREE.LineBasicMaterial) {
      child.material.color.setHex(s.protection > 0 ? 0x70beff : 0xedffff); child.material.opacity = s.protection > 0 ? 0.4 + 0.6 * Math.abs(Math.sin(this.clock * 15)) : 1;
    } });
    this.blastRing.visible = this.blastAge < 0.65;
    this.blastRing.scale.setScalar(10 + this.blastAge * 270); this.blastRing.position.z = -this.blastAge * 300;
  }
  dispose(): void { this.explosions.clear(); this.ending.dispose(); disposeObject(this.root); this.root.clear(); this.models.clear(); this.bolts.clear(); }
}
