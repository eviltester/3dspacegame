import * as THREE from 'three';
import { createBoltModel, setProjectilePulseOpacity, disposeObject } from '../../../src/models';
import { weaponSpec } from '../../../src/weapons';
import { createEnemyModel } from '../../../src/models/ships';
import { ShipExplosions } from '../../../src/rendering/ship-explosions';

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
  renderer.dispose(); return results;
}

export function explosionPreview(width: number, height: number) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(width, height);
  const scene = new THREE.Scene(), world = new THREE.Group(), camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 500);
  scene.add(world); const ship = createEnemyModel('gunship'); ship.position.z = -115; ship.rotation.set(0.35, -0.4, 0.2); world.add(ship);
  const effects = new ShipExplosions(world);
  const capture = () => { renderer.render(scene, camera); return renderer.domElement.toDataURL(); };
  const intact = capture(); effects.explode(ship); world.remove(ship); disposeObject(ship);
  const frames = [{ name: 'intact', image: intact, ...effects.snapshot }];
  for (const [name, steps] of [['separating', 18], ['detonating', 34], ['showers', 23], ['finished', 40]] as const) {
    for (let i = 0; i < steps; i++) effects.update(1 / 60);
    frames.push({ name, image: capture(), ...effects.snapshot });
  }
  effects.clear(); renderer.dispose(); renderer.forceContextLoss(); return frames;
}
