import * as THREE from 'three';
import { configureArmadaCamera } from '../../../src/armada';
import { invaderHome, invaderPattern, INVADER_PATTERNS, INVADER_SLOTS } from '../../../src/invader-patterns';
import { stepInvaderFormation } from '../../../src/invader-formation';
import { createInvaderModel, createInvaderFlybyModel } from '../../../src/models/ships';
import { disposeObject, edgesFromGeometry } from '../../../src/models';
import { flybyPosition } from '../../../src/combat/invader-flybys';
import { updateInvaderMineWarning } from '../../../src/rendering/invader-mine-warning';
import { EffectsSystem } from '../../../src/rendering/effects';
import { Random } from '../../../src/encounters';

/** Real camera and alien models, sampled without menus, game rules or wall-clock waits. */
export function formationPreviews(width: number, height: number) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(width, height);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(68, width / height, 0.1, 6000);
  configureArmadaCamera(camera);
  const origin = new THREE.Vector3();
  const ships = Array.from({ length: INVADER_SLOTS }, (_, slot) => {
    const model = createInvaderModel((['raider', 'flanker', 'diver'] as const)[slot % 3]); scene.add(model);
    return { slot, model, position: model.position };
  });
  const frames: { pattern: string; images: string[]; minimumPixels: number }[] = [];
  for (let wave = 1; wave <= INVADER_PATTERNS.length; wave++) {
    ships.forEach(ship => ship.position.copy(invaderHome(ship.slot)));
    const images: string[] = [];
    for (let tick = 1; tick <= 495; tick++) {
      stepInvaderFormation(ships, 1 / 60, tick / 60, wave, 1.5);
      if (tick !== 480 && tick !== 495) continue;
      ships.forEach(ship => { ship.model.lookAt(origin); ship.model.rotateY(Math.PI); });
      renderer.render(scene, camera); images.push(renderer.domElement.toDataURL());
    }
    frames.push({ pattern: invaderPattern(wave), images, minimumPixels: 300 });
  }
  ships.forEach(ship => scene.remove(ship.model));
  // Isolate each visitor/hazard so background pixels cannot hide a missing model.
  for (const kind of ['police', 'pirate', 'courier', 'mine'] as const) {
    const model = kind === 'mine' ? edgesFromGeometry(new THREE.OctahedronGeometry(5), 0xff4055) : createInvaderFlybyModel(kind);
    scene.add(model); const images: string[] = [];
    for (const age of [4, 4.3]) {
      model.position.copy(kind === 'mine' ? new THREE.Vector3(-30, 0, -60 + (age - 4) * 80) : flybyPosition(1, age, 9));
      if (kind === 'mine') updateInvaderMineWarning(model, age, model.position.length());
      renderer.render(scene, camera); images.push(renderer.domElement.toDataURL());
    }
    frames.push({ pattern: `${kind.toUpperCase()} ${kind === 'mine' ? 'DRIFT' : 'FLYBY'}`, images, minimumPixels: 20 });
    scene.remove(model); disposeObject(model);
  }
  // A stationary mine with its body omitted isolates the breathing radius:
  // changing pixels must come from the warning, not movement or background models.
  const warning = new THREE.Group(), images: string[] = []; warning.position.set(20, 0, -60); scene.add(warning);
  for (const age of [3, 3.16]) {
    updateInvaderMineWarning(warning, age, warning.position.length());
    renderer.render(scene, camera); images.push(renderer.domElement.toDataURL());
  }
  frames.push({ pattern: 'MINE BLAST RADIUS', images, minimumPixels: 80 });
  scene.remove(warning); disposeObject(warning);
  const rewards = new THREE.Group(); scene.add(rewards);
  const effects = new EffectsSystem(rewards, () => new Random(1));
  for (const score of [1000, 2000, 3000, 15000]) {
    // Isolate lettering from the explosion so a blank text texture cannot pass.
    effects.flybyScore(new THREE.Vector3(0, 0, -468), score);
    const images: string[] = [];
    for (const dt of [0, 0.5]) {
      effects.update(dt); renderer.render(scene, camera); images.push(renderer.domElement.toDataURL());
    }
    frames.push({ pattern: `FLYBY REWARD ${score}`, images, minimumPixels: 80 });
    effects.clear();
  }
  scene.remove(rewards);
  ships.forEach(ship => disposeObject(ship.model)); renderer.dispose(); renderer.forceContextLoss();
  return frames;
}
