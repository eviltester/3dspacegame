import * as THREE from 'three';
import { expect, it } from 'vitest';
import { configureArmadaCamera } from './armada';
import { invaderHome, INVADER_PATTERNS, INVADER_SLOTS } from './invader-patterns';
import { stepInvaderFormation } from './invader-formation';
import { invaderStage } from './invaders';
import { createInvaderModel } from './models/ships';
import { disposeObject } from './models';

// Projection is ordinary maths: check real silhouettes/camera without starting WebGL.
function screenBounds(model: THREE.Object3D, camera: THREE.Camera): THREE.Box2 {
  const bounds = new THREE.Box2();
  model.updateMatrixWorld(true);
  model.traverse(child => {
    if (!(child instanceof THREE.LineSegments)) return;
    const vertices = (child.geometry as THREE.BufferGeometry).getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(child.matrixWorld).project(camera);
      bounds.expandByPoint(new THREE.Vector2(point.x, point.y));
    }
  });
  return bounds;
}

it.each([1440 / 900, 390 / 844])('all patterns keep distinct, framed silhouettes at aspect %s', aspect => {
  const camera = new THREE.PerspectiveCamera(68, aspect, 0.1, 6000); configureArmadaCamera(camera);
  const origin = new THREE.Vector3();
  const ships = Array.from({ length: INVADER_SLOTS }, (_, slot) => {
    const model = createInvaderModel((['raider', 'flanker', 'diver'] as const)[slot % 3]);
    return { slot, model, position: model.position };
  });
  try {
    let extent = 0;
    for (let wave = 1000; wave < 1000 + INVADER_PATTERNS.length; wave++) {
      ships.forEach(ship => ship.position.copy(invaderHome(ship.slot)));
      for (let tick = 1; tick <= 1200; tick++) {
        stepInvaderFormation(ships, 1 / 60, tick / 60, wave, invaderStage(wave).difficulty.movementScale);
        if (tick % 30) continue;
        const bounds = ships.map(ship => { ship.model.lookAt(origin); ship.model.rotateY(Math.PI); return screenBounds(ship.model, camera); });
        for (let a = 0; a < bounds.length; a++) {
          extent = Math.max(extent, Math.abs(bounds[a].min.x), Math.abs(bounds[a].max.x), Math.abs(bounds[a].min.y), Math.abs(bounds[a].max.y));
          for (let b = a + 1; b < bounds.length; b++) {
            if (bounds[a].intersectsBox(bounds[b])) expect.fail(`Overlapping silhouettes: wave ${wave}, time ${tick / 60}, slots ${a}/${b}`);
          }
        }
      }
    }
    expect(extent).toBeLessThan(1);
  } finally { ships.forEach(ship => disposeObject(ship.model)); }
});
