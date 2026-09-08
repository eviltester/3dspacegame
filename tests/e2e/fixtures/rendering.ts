import * as THREE from 'three';
import { createBoltModel, setProjectilePulseOpacity, disposeObject } from '../../../src/models';
import { weaponSpec } from '../../../src/weapons';
import { createEnemyModel } from '../../../src/models/ships';
import { ShipExplosions } from '../../../src/rendering/ship-explosions';
import { BonusController } from '../../../src/bonus';
import type { BonusKind } from '../../../src/arcade';
import { createCanyonGate } from '../../../src/models/landmarks';
import { updateCanyonGateVisual } from '../../../src/rendering/canyon-gates';

/** Inspect the actual warning material at fixed phases, without simulating misses. */
export function canyonGatePreview(): string[] {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(360, 260);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 360 / 260, 0.1, 200);
  const gate = createCanyonGate(); gate.position.z = -45; scene.add(gate);
  const frames = ([[false, 0], [true, Math.PI / 6], [true, Math.PI / 18], [false, 0]] as const).map(([warning, time]) => {
    updateCanyonGateVisual(gate, warning, time);
    renderer.render(scene, camera); return renderer.domElement.toDataURL();
  });
  disposeObject(gate); renderer.dispose(); renderer.forceContextLoss(); return frames;
}

export function projectilePreviews(): { family: string; bright: string; dim: string }[] {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(360, 260);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 360 / 260, 0.1, 200);
  const results: { family: string; bright: string; dim: string }[] = [];
  for (const family of ['pulse', 'spread', 'lance'] as const) {
    const spec = weaponSpec(family, 3), model = createBoltModel(spec.color, spec.radius, spec.length, 'player', family);
    model.position.z = -45; scene.add(model); setProjectilePulseOpacity(model, 1); renderer.render(scene, camera);
    const bright = renderer.domElement.toDataURL(); setProjectilePulseOpacity(model, 0); renderer.render(scene, camera);
    results.push({ family, bright, dim: renderer.domElement.toDataURL() }); scene.remove(model); disposeObject(model);
  }
  renderer.dispose(); renderer.forceContextLoss(); return results;
}

/** Render the real course geometry at two explicit times, without a running game. */
export function coursePreview(kind: BonusKind, width: number, height: number, difficulty = 8, smuggler = false): string[] {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(width, height);
  const course = new BonusController(kind, 42, difficulty, smuggler), scene = new THREE.Scene(); scene.add(course.root);
  const camera = new THREE.PerspectiveCamera(72, width / height, 0.1, 4000);
  const flightCamera = camera.clone();
  const pillar = course.canyon?.barriers.items.find(item => item.kind === 'risingPillar');
  if (pillar) pillar.phase = 0.35;
  const frames: string[] = [];
  for (const dt of [0, 0.12]) {
    course.step(dt, { x: 0, y: 0 }, flightCamera); camera.copy(flightCamera);
    const gun = smuggler ? course.canyon?.targets.find(target => target.mount?.kind === 'floor') : undefined;
    if (gun?.mount) {
      // The same surface-relative viewpoint exposes size changes across difficulties.
      camera.position.copy(gun.mount.position).add(new THREE.Vector3(0, 32, 85));
      camera.lookAt(gun.mount.position);
    } else if (pillar) {
      // Inspect real scenery in its canyon, near enough to see the retracting column.
      camera.position.copy(pillar.base).add(new THREE.Vector3(-pillar.base.x * 0.1, 42, 150));
      camera.lookAt(pillar.base.clone().add(new THREE.Vector3(0, 26, -30)));
    }
    renderer.render(scene, camera); frames.push(renderer.domElement.toDataURL());
  }
  course.dispose(); renderer.dispose(); renderer.forceContextLoss(); return frames;
}

export function explosionPreview(width: number, height: number) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(width, height);
  const scene = new THREE.Scene(), world = new THREE.Group(), camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 500);
  scene.add(world); const ship = createEnemyModel('gunship'); ship.position.z = -115; ship.rotation.set(0.35, -0.4, 0.2); world.add(ship);
  const effects = new ShipExplosions(world);
  const capture = () => { renderer.render(scene, camera); return renderer.domElement.toDataURL(); };
  const intact = capture(); effects.explode(ship); world.remove(ship); disposeObject(ship);
  const frames = [{ name: 'intact', image: intact }];
  for (const [name, steps] of [['separating', 18], ['detonating', 34], ['showers', 23], ['finished', 40]] as const) {
    for (let i = 0; i < steps; i++) effects.update(1 / 60);
    frames.push({ name, image: capture() });
  }
  effects.clear(); renderer.dispose(); renderer.forceContextLoss(); return frames;
}
