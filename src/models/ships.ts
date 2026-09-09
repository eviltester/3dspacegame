/**
 * Original low-edge-count silhouettes, facing local -Z. Each factory returns a
 * separately owned model; AI, health and boss attachments are world/combat concerns.
 */
import * as THREE from 'three';
import type { EnemyArchetype } from '../arcade';
import { COLORS, lineShape, edgesFromGeometry } from './primitives';

export function createInvaderModel(role: EnemyArchetype): THREE.Group {
  const group = new THREE.Group();
  const wing = role === 'flanker' ? 9 : 7, crown = role === 'diver' ? 5 : 2.5;
  group.add(lineShape([[-wing, 0, 0], [-3, 0, -5], [3, 0, -5], [wing, 0, 0], [3, 0, 4], [-3, 0, 4], [0, crown, -1], [0, -2, 1]],
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 6], [3, 6], [5, 6], [0, 7], [2, 7], [4, 7]],
    role === 'diver' ? 0xffab58 : role === 'flanker' ? 0xff68b8 : 0xff505a));
  return group;
}

export function createInvaderFlybyModel(kind: 'police' | 'pirate' | 'courier'): THREE.Group {
  const ship = kind === 'police' ? createPoliceModel() : kind === 'courier' ? createTraderHaulerModel() : createEnemyModel('carrier');
  if (kind === 'police') ship.scale.setScalar(1.6);
  if (kind === 'courier') ship.traverse(child => { if (child instanceof THREE.LineSegments) (child.material as THREE.LineBasicMaterial).color.setHex(0xffdf60); });
  return ship;
}

export function createEnemyModel(role: EnemyArchetype): THREE.Group {
  if (role === 'raider') return createPirateModel();
  const group = new THREE.Group();
  const vertices: Record<Exclude<EnemyArchetype, 'raider' | 'carrier'>, Array<[number, number, number]>> = {
    flanker: [[0, 0, -7], [-7, 0, 2], [-2, 1.5, 0], [0, 0, 5], [2, 1.5, 0], [7, 0, 2]],
    diver: [[0, 0, -8], [-3, 0, 3], [0, 4, 0], [3, 0, 3], [0, -2, 3]],
    gunship: [[-5, -2, -5], [5, -2, -5], [5, 2, -5], [-5, 2, -5], [-6, -2, 5], [6, -2, 5], [6, 2, 5], [-6, 2, 5]],
    minelayer: [[0, 3, -5], [-5, 0, 0], [0, -3, -5], [5, 0, 0], [0, 2, 6], [0, -2, 6]]
  };
  if (role === 'carrier') {
    group.add(edgesFromGeometry(new THREE.BoxGeometry(42, 11, 24), 0xff4055));
    group.add(lineShape([[-30, 0, 0], [-21, 0, -12], [-21, 0, 12], [30, 0, 0], [21, 0, -12], [21, 0, 12]],
      [[0, 1], [0, 2], [3, 4], [3, 5]], 0xff4055));
    return group;
  }
  const edges: Record<keyof typeof vertices, Array<[number, number]>> = {
    flanker: [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 0], [4, 5], [5, 0], [1, 3], [5, 3]],
    diver: [[0, 1], [1, 2], [2, 0], [0, 3], [3, 2], [1, 4], [3, 4], [4, 0]],
    gunship: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]],
    minelayer: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [2, 5], [1, 4], [1, 5], [3, 4], [3, 5], [4, 5]]
  };
  group.add(lineShape(vertices[role], edges[role], 0xff4055));
  return group;
}

export function createPirateModel(): THREE.Group {
  const group = new THREE.Group();
  group.add(lineShape(
    [[0, 0, -7], [-6, -1, 4], [6, -1, 4], [0, 2.4, 2]],
    [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]],
    COLORS.pirate
  ));
  return group;
}

export function createArmadaRig(): { root: THREE.Group; craft: THREE.Group; platform: THREE.Group } {
  const root = new THREE.Group();
  const platform = new THREE.Group(); platform.name = 'defensive-platform';
  platform.add(lineShape([[-86, -5, -18], [86, -5, -18], [-86, -5, 18], [86, -5, 18],
    [-86, 12, 0], [-86, -12, 0], [86, 12, 0], [86, -12, 0]],
  [[0, 1], [2, 3], [0, 2], [1, 3], [4, 5], [6, 7]], 0x75caff, 0.6));
  const craft = new THREE.Group();
  craft.add(lineShape([[0, 0, -12], [-8, 0, 7], [-3, 0, 4], [0, 3, 2], [3, 0, 4], [8, 0, 7], [0, -2, 6]],
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3], [2, 6], [4, 6]], 0xedffff));
  root.add(platform, craft);
  return { root, craft, platform };
}

export function createTraderHaulerModel(): THREE.Group {
  const group = new THREE.Group();
  group.add(lineShape(
    [[-2, -1.5, -6], [2, -1.5, -6], [2, 1.5, -6], [-2, 1.5, -6],
      [-4.5, -2, 5], [4.5, -2, 5], [4.5, 2, 5], [-4.5, 2, 5]],
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]],
    COLORS.trader
  ));
  return group;
}

export function createTraderUfoModel(): THREE.Group {
  const group = new THREE.Group();
  group.add(lineShape(
    [[-6, 0, 0], [-3, 0, -5], [3, 0, -5], [6, 0, 0], [3, 0, 5], [-3, 0, 5],
      [0, 2.5, 0], [0, -1.6, 0]],
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
      [0, 6], [2, 6], [4, 6], [1, 7], [3, 7], [5, 7]],
    COLORS.trader
  ));
  return group;
}

export function createPoliceModel(): THREE.Group {
  const group = new THREE.Group();
  group.add(lineShape(
    [[0, 0, -7], [-4, 0, 0], [0, 0, 6], [4, 0, 0], [0, 2.8, 0], [0, -1.5, 0]],
    [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4],
      [0, 5], [1, 5], [2, 5], [3, 5]],
    COLORS.police
  ));
  group.add(lineShape([[-1.2, 2.8, 0], [1.2, 2.8, 0]], [[0, 1]], COLORS.policeAccent));
  return group;
}

export function createCanyonTurret(): THREE.LineSegments {
  return lineShape([[-6, -3, -4], [6, -3, -4], [6, -3, 4], [-6, -3, 4], [0, 3, 0], [0, 3, 10]],
    [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4], [4, 5]], 0xff4055);
}
