import * as THREE from 'three';
import type { Actor } from '../combat/types';

export function actorFixture(overrides: Partial<Actor> = {}): Actor {
  const object = new THREE.Group();
  return { id: 10, kind: 'pirate', faction: 'pirate', object, previous: object.position.clone(), radius: 2,
    hull: 40, maxHull: 40, role: 'raider', age: 0, cooldown: 0, windup: -1, target: 0,
    anchor: new THREE.Vector3(), offset: new THREE.Vector3(), parent: null, drop: null, essential: false, dead: false,
    spawned: 0, drift: new THREE.Vector3(), ...overrides };
}
