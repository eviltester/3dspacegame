import * as THREE from 'three';
import type { CargoType } from '../logic';
import { COLORS, lineShape, edgesFromGeometry, createPulseRing, createTextSprite } from './primitives';

const SAFE_TRADE_RADIUS = 95;

const BLACK_MARKET_RADIUS = 70;

const WARP_CUE_COLOR = 0xffd15c;

export function createCargoModel(type: CargoType): THREE.Group {
  const group = new THREE.Group();
  const color = type === 'contraband' ? COLORS.contraband : type === 'rareMineral' ? COLORS.mineral
    : type === 'weaponCore' ? 0xff6b25 : type === 'shieldCell' ? 0x7edcff
      : type === 'rescuePod' ? 0xffffff : COLORS.cargo;
  if (type === 'rareMineral') {
    group.add(edgesFromGeometry(new THREE.OctahedronGeometry(2.7, 0), COLORS.mineral));
  } else if (type === 'contraband' || type === 'weaponCore') {
    group.add(edgesFromGeometry(new THREE.TetrahedronGeometry(3, 0), color));
  } else if (type === 'shieldCell' || type === 'credits') {
    group.add(createPulseRing(color, 2.7, 0, 0.95, 8));
    group.add(lineShape([[-1.3, 0, 0], [1.3, 0, 0], [0, -1.3, 0], [0, 1.3, 0]],
      type === 'shieldCell' ? [[0, 1], [2, 3]] : [[2, 3]], color));
  } else {
    group.add(edgesFromGeometry(new THREE.BoxGeometry(3, type === 'rescuePod' ? 5 : 3, 3), color));
  }
  group.add(lineShape([[0, 5.5, 0], [-5, -3.8, 0], [5, -3.8, 0]], [[0, 1], [1, 2], [2, 0]], color, 0.55));
  return group;
}

export function setCueMaterial(material: THREE.Material, color: THREE.ColorRepresentation, opacity: number): void {
  if (!(material instanceof THREE.LineBasicMaterial || material instanceof THREE.SpriteMaterial)) {
    return;
  }
  material.color.set(color);
  material.opacity = opacity;
  material.transparent = true;
  material.blending = THREE.AdditiveBlending;
  material.depthWrite = false;
}

export function updateWarpCueVisuals(gate: THREE.Object3D, active: boolean, elapsed: number): void {
  const arrow: unknown = gate.userData.warpArrow;
  const text: unknown = gate.userData.warpText;
  const pulse = active ? (Math.sin(elapsed * 9.2) + 1) / 2 : 0;
  const color = active ? new THREE.Color().setHSL((elapsed * 0.42) % 1, 1, 0.62) : new THREE.Color(WARP_CUE_COLOR);
  const opacity = active ? 0.58 + pulse * 0.42 : 1;
  const scale = active ? 1 + pulse * 0.12 : 1;

  if (arrow instanceof THREE.Object3D) {
    arrow.scale.setScalar(scale);
    arrow.traverse((child) => {
      if (child instanceof THREE.LineSegments && child.material instanceof THREE.LineBasicMaterial) {
        setCueMaterial(child.material, color, opacity);
      }
    });
  }

  if (text instanceof THREE.Sprite) {
    const baseScale: unknown = text.userData.baseScale;
    if (baseScale instanceof THREE.Vector3) {
      text.scale.copy(baseScale).multiplyScalar(scale);
    }
    if (text.material instanceof THREE.Material) {
      setCueMaterial(text.material, color, opacity);
    }
  }
}

export function createGateModel(): THREE.Group {
  const group = new THREE.Group();
  const rotor = new THREE.Group();

  rotor.add(createPulseRing(COLORS.gate, 36, 0, 0.95, 8));
  rotor.add(createPulseRing(COLORS.gate, 36, -24, 0.5, 8));
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const x = Math.cos(angle) * 36;
    const y = Math.sin(angle) * 36;
    rotor.add(lineShape([[x, y, 0], [x, y, -24]], [[0, 1]], COLORS.gate, 0.6));
  }

  const arrow = lineShape(
    [
      [0, -2, 12],
      [-15, 21, 12],
      [-6, 21, 12],
      [-6, 43, 12],
      [6, 43, 12],
      [6, 21, 12],
      [15, 21, 12]
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 0]
    ],
    WARP_CUE_COLOR,
    1
  );
  group.add(rotor);
  group.add(arrow);

  const warpText = createTextSprite('WARP', '#ffffff', 'rgba(0, 0, 0, 0)', 44, 14);
  warpText.position.set(0, 54, 13);
  warpText.userData.baseScale = warpText.scale.clone();
  group.add(warpText);
  group.userData.rotor = rotor;
  group.userData.warpArrow = arrow;
  group.userData.warpText = warpText;
  updateWarpCueVisuals(group, false, 0);
  return group;
}

export function createBaseModel(): THREE.Group {
  const group = new THREE.Group();
  group.add(edgesFromGeometry(new THREE.BoxGeometry(38, 30, 38), COLORS.base));
  group.add(lineShape(
    [[-9, -10, 19], [-9, 8, 19], [9, 8, 19], [9, -10, 19],
      [0, 15, 0], [0, 36, 0], [-7, 30, 0], [7, 30, 0]],
    [[0, 1], [1, 2], [2, 3], [4, 5], [6, 7]], COLORS.base
  ));
  const safeRing = createPulseRing(0xffd15c, SAFE_TRADE_RADIUS, 0, 0.25, 24);
  safeRing.rotation.x = Math.PI / 2;
  group.add(safeRing);
  return group;
}

export function createPlanetModel(color: number): THREE.Group {
  const group = new THREE.Group();
  group.add(createPulseRing(color, 55, 0, 0.8, 32));
  const meridian = createPulseRing(color, 55, 0, 0.45, 32);
  meridian.rotation.y = Math.PI / 2;
  group.add(meridian);
  const equator = createPulseRing(color, 55, 0, 0.45, 32);
  equator.rotation.x = Math.PI / 2;
  group.add(equator);
  const band = createPulseRing(color, 78, 0, 0.75, 32);
  band.rotation.x = Math.PI / 2.8;
  group.add(band);
  return group;
}

export function createBlackMarketModel(): THREE.Group {
  const group = new THREE.Group();
  group.add(edgesFromGeometry(new THREE.OctahedronGeometry(18, 0), COLORS.contraband));
  group.add(lineShape([[0, -30, 0], [0, 30, 0], [-8, 26, 0], [8, 26, 0]],
    [[0, 1], [2, 3]], COLORS.contraband));
  const exchangeRing = createPulseRing(COLORS.contraband, BLACK_MARKET_RADIUS, 0, 0.25, 16);
  exchangeRing.rotation.x = Math.PI / 2;
  group.add(exchangeRing);
  return group;
}

export function createBeaconModel(color: number): THREE.Group {
  const group = new THREE.Group();
  const gem = edgesFromGeometry(new THREE.OctahedronGeometry(5, 0), color, 0.82);
  group.add(gem);
  const halo = createPulseRing(color, 8, 0, 0.48, 8);
  group.add(halo);
  return group;
}

export function createCanyonGate(radius = 12): THREE.Group {
  const gate = new THREE.Group();
  gate.add(createPulseRing(0x48ff95, radius, 0, 1, 8));
  gate.add(createPulseRing(0x48ff95, radius, -3, 0.55, 8));
  return gate;
}
