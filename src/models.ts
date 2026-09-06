import * as THREE from 'three';
import type { CargoType, Faction } from './logic';
import type { EnemyArchetype } from './arcade';

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

export interface CatalogItem { title: string; description: string; create: () => THREE.Object3D; scale: number; cameraZ: number }
export function createCanyonTurret(): THREE.LineSegments {
  return lineShape([[-6, -3, -4], [6, -3, -4], [6, -3, 4], [-6, -3, 4], [0, 3, 0], [0, 3, 10]],
    [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4], [4, 5]], 0xff4055);
}
export function createCanyonGate(radius = 12): THREE.Group {
  const gate = new THREE.Group();
  gate.add(createPulseRing(0x48ff95, radius, 0, 1, 8));
  gate.add(createPulseRing(0x48ff95, radius, -3, 0.55, 8));
  return gate;
}
export function createCatalog(): CatalogItem[] {
  const roles: Array<[EnemyArchetype, string]> = [
    ['raider', 'Charges head-on. Shoot the red ships and their incoming fire.'],
    ['flanker', 'Attacks in pairs from opposite sides. Turn toward one flight at a time.'],
    ['diver', 'Breaks formation and dives through your firing line.'],
    ['gunship', 'Flashes before firing a wide sweep. Move out of its line of fire.'],
    ['minelayer', 'Drops red wireframe mines. Shoot them before they arm.'],
    ['carrier', 'Launches reinforcements. Boss carriers have breakable outer systems.']
  ];
  const items: CatalogItem[] = roles.map(([role, description]) => ({ title: `RED ${role.toUpperCase()}`, description, create: () => createEnemyModel(role), scale: role === 'carrier' ? 0.55 : 2.2, cameraZ: 62 }));
  items.push(
    { title: 'POLICE', description: 'Blue interceptors fight pirates. Do not attack them. They collect contraband only.', create: createPoliceModel, scale: 2.2, cameraZ: 62 },
    { title: 'GREEN TRADER', description: 'Civilian hauler. Protect it from pirates; unprovoked attacks make you wanted.', create: createTraderHaulerModel, scale: 2, cameraZ: 62 },
    { title: 'GREEN SAUCER', description: 'Peaceful trader. Collects legal salvage and returns fire at pirates.', create: createTraderUfoModel, scale: 2, cameraZ: 62 }
  );
  const cargo: Array<[CargoType, string]> = [
    ['credits', 'Cash salvage. Spent at supply stops during this run.'], ['legalCargo', 'Sell automatically at a lawful station.'],
    ['rareMineral', 'Valuable salvage. Lawful stations buy it.'], ['contraband', 'Deliberate pickup only. Sell at the magenta black market; lawful scans can seize it.'],
    ['weaponCore', 'Improves the equipped weapon; capped cores convert to credits.'], ['shieldCell', 'Restores 30 shield points.'], ['rescuePod', 'Protected mission cargo. Deliver to the station.']
  ];
  for (const [kind, description] of cargo) items.push({ title: kind.replace(/([A-Z])/g, ' $1').toUpperCase(), description, create: () => createCargoModel(kind), scale: 3.4, cameraZ: 62 });
  items.push(
    { title: 'SUPPLY STATION', description: 'Sell legal cargo here. Mission completion opens the upgrade dock.', create: createBaseModel, scale: 0.45, cameraZ: 86 },
    { title: 'OUTPOST PLANET', description: 'Solid landmark. Canyon bonus sorties use a loan skiff near the surface.', create: () => createPlanetModel(0x6fffbc), scale: 0.44, cameraZ: 96 },
    { title: 'BLACK MARKET', description: 'The magenta exchange buys contraband. Its outer ring is not cargo.', create: createBlackMarketModel, scale: 0.65, cameraZ: 92 },
    { title: 'WARP GATE', description: 'When the mission is complete, follow the flashing arrow and fly through the opening.', create: createGateModel, scale: 0.62, cameraZ: 104 },
    { title: 'MINE', description: 'A red wireframe star. It flashes before arming. Destroy it from a distance.', create: () => edgesFromGeometry(new THREE.OctahedronGeometry(4), 0xff4055), scale: 3, cameraZ: 62 },
    { title: 'ASTEROID', description: 'Large rocks split into medium rocks, then drifting fragments. The belt accelerates: follow the gaps and fly through EXIT. Blasts vaporize rocks.', create: () => edgesFromGeometry(new THREE.IcosahedronGeometry(6), 0xada596), scale: 2, cameraZ: 62 },
    { title: 'BONUS MARKER', description: 'Find the shuffled numbers and shoot in order. Yellow is next. Remaining markers move faster after successful hits.', create: () => createPulseRing(0xffff60, 7, 0, 1, 8), scale: 2, cameraZ: 62 },
    { title: 'CANYON GATE', description: 'Fly through the green opening. Gates shrink and move. Two consecutive misses end the bonus.', create: createCanyonGate, scale: 1.5, cameraZ: 62 },
    { title: 'CANYON GUN', description: 'Flashes yellow before firing red bolts. Shoot the gun or intercept its fire.', create: createCanyonTurret, scale: 2, cameraZ: 62 },
    { title: 'CANYON OBSTACLE', description: 'Amber rock spires obstruct the route. Dodge or shoot them. Find the exit opening in the final wall.', create: () => edgesFromGeometry(new THREE.OctahedronGeometry(8), 0xffbf48), scale: 2, cameraZ: 62 }
  );
  return items;
}
export const COLORS = {
  pirate: 0xff3048,
  trader: 0x24ff7a,
  police: 0x72c8ff,
  policeAccent: 0xe8fbff,
  cargo: 0xffd766,
  mineral: 0xfff0a0,
  contraband: 0xff3df2,
  gate: 0x8dd9ff,
  base: 0x34f5c5,
  planet: 0x87ffb8,
  hud: '#46ffbd',
  warning: '#ff4d61',
  amber: '#ffd15c'
};


const SAFE_TRADE_RADIUS = 95;
const BLACK_MARKET_RADIUS = 70;
const WARP_CUE_COLOR = 0xffd15c;
export function lineShape(
  vertices: Array<[number, number, number]>,
  edges: Array<[number, number]>,
  color: number,
  opacity = 0.94
): THREE.LineSegments {
  const positions: number[] = [];
  for (const [start, end] of edges) {
    positions.push(...vertices[start], ...vertices[end]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity
    })
  );
}

export function edgesFromGeometry(geometry: THREE.BufferGeometry, color: number, opacity = 0.9): THREE.LineSegments {
  const edgeGeometry = new THREE.EdgesGeometry(geometry, 16);
  geometry.dispose();
  return new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity
    })
  );
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

export function createArmadaRig(): { root: THREE.Group; craft: THREE.Group } {
  const root = new THREE.Group();
  root.add(lineShape([[-86, -5, -18], [86, -5, -18], [-86, -5, 18], [86, -5, 18],
    [-86, 12, 0], [-86, -12, 0], [86, 12, 0], [86, -12, 0]],
  [[0, 1], [2, 3], [0, 2], [1, 3], [4, 5], [6, 7]], 0x75caff, 0.6));
  const craft = new THREE.Group();
  craft.add(lineShape([[0, 0, -12], [-8, 0, 7], [-3, 0, 4], [0, 3, 2], [3, 0, 4], [8, 0, 7], [0, -2, 6]],
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3], [2, 6], [4, 6]], 0xedffff));
  root.add(craft);
  return { root, craft };
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

export function createTextSprite(
  text: string,
  color: string,
  background = 'rgba(0, 0, 0, 0.0)',
  width = 58,
  height = 18
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas text context unavailable');
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = '900 86px Consolas, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = color;
  context.shadowBlur = 0;
  context.fillStyle = color;
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, height, 1);
  return sprite;
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
  const arrow = gate.userData.warpArrow;
  const text = gate.userData.warpText;
  const pulse = active ? (Math.sin(elapsed * 9.2) + 1) / 2 : 0;
  const color = active ? new THREE.Color().setHSL((elapsed * 0.42) % 1, 1, 0.62) : new THREE.Color(WARP_CUE_COLOR);
  const opacity = active ? 0.58 + pulse * 0.42 : 1;
  const scale = active ? 1 + pulse * 0.12 : 1;

  if (arrow instanceof THREE.Object3D) {
    arrow.scale.setScalar(scale);
    arrow.traverse((child) => {
      if (child instanceof THREE.LineSegments && child.material instanceof THREE.Material) {
        setCueMaterial(child.material, color, opacity);
      }
    });
  }

  if (text instanceof THREE.Sprite) {
    const baseScale = text.userData.baseScale;
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

export function createProjectileModel(color: number): THREE.LineSegments {
  const line = lineShape(
    [
      [0, 0, -2.6],
      [0, 0, 2.6]
    ],
    [[0, 1]],
    color,
    0.96
  );
  const material = materialFromLine(line);
  if (material) {
    tunePulseMaterial(material, 0.96);
  }
  return line;
}

export function tunePulseMaterial(material: THREE.Material, baseOpacity: number): void {
  material.transparent = true;
  material.opacity = baseOpacity;
  material.blending = THREE.AdditiveBlending;
  material.depthWrite = false;
  material.userData.baseOpacity = baseOpacity;
}

export function createGlowLine(
  vertices: Array<[number, number, number]>,
  edges: Array<[number, number]>,
  color: number,
  opacity: number
): THREE.LineSegments {
  const line = lineShape(vertices, edges, color, opacity);
  const material = materialFromLine(line);
  if (material) {
    tunePulseMaterial(material, opacity);
  }
  return line;
}

export function createPulseRing(color: number, radius: number, z: number, opacity: number, segments = 28): THREE.LineSegments {
  const positions: number[] = [];
  for (let index = 0; index < segments; index += 1) {
    const start = (index / segments) * Math.PI * 2;
    const end = ((index + 1) / segments) * Math.PI * 2;
    positions.push(
      Math.cos(start) * radius,
      Math.sin(start) * radius,
      z,
      Math.cos(end) * radius,
      Math.sin(end) * radius,
      z
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  material.userData.baseOpacity = opacity;
  return new THREE.LineSegments(geometry, material);
}

export function setProjectilePulseOpacity(object: THREE.Object3D, pulse: number): void {
  object.traverse((child) => {
    if (
      (child instanceof THREE.LineSegments || child instanceof THREE.Points) &&
      child.material instanceof THREE.Material
    ) {
      const baseOpacity = Number(child.material.userData.baseOpacity ?? child.material.opacity);
      child.material.opacity = baseOpacity * (0.68 + pulse * 0.32);
    }
  });
}

export function createStarTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas star context unavailable');
  }

  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(16, 16, 5, 0, Math.PI * 2);
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createBoltModel(color: number, radius: number, length: number, faction: Faction, family: 'pulse' | 'spread' | 'lance' = 'pulse'): THREE.Group {
  const group = new THREE.Group();
  const ringRadius = family === 'lance' ? 2.5 : Math.max(4.2, radius);
  const vertices: Array<[number, number, number]> = [];
  const edges: Array<[number, number]> = [];
  const segment = (a: [number, number, number], b: [number, number, number]) => {
    edges.push([vertices.length, vertices.length + 1]); vertices.push(a, b);
  };
  for (const [size, z] of [[ringRadius, 0], [ringRadius * 0.65, length * (family === 'lance' ? 0.8 : 0.22)]]) {
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, b = (i + 1) * Math.PI / 8;
      segment([Math.cos(a) * size, Math.sin(a) * size, z], [Math.cos(b) * size, Math.sin(b) * size, z]);
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, x = Math.cos(a), y = Math.sin(a);
    if (family === 'lance') segment([x * ringRadius, y * ringRadius, 0], [x * ringRadius * 0.65, y * ringRadius * 0.65, length * 0.8]);
    else segment([x * ringRadius * 1.18, y * ringRadius * 1.18, 0], [x * ringRadius * 1.5, y * ringRadius * 1.5, 0]);
  }
  // One draw call per transparent bolt keeps dense incoming fire inexpensive.
  group.add(createGlowLine(vertices, edges, color, faction === 'player' ? 0.85 : 0.9));
  return group;
}

export function vectorFromSpherical(radius: number, yaw: number, pitch: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch) * radius,
    Math.sin(pitch) * radius,
    Math.cos(yaw) * Math.cos(pitch) * radius
  );
}

export function wrapAngle(angle: number): number {
  return THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
}

export function materialFromLine(line: THREE.Object3D): THREE.LineBasicMaterial | null {
  if (line instanceof THREE.LineSegments && line.material instanceof THREE.LineBasicMaterial) {
    return line.material;
  }
  return null;
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      if (child.material instanceof THREE.Material) {
        child.material.dispose();
      }
    }
    if (child instanceof THREE.Points) {
      child.geometry.dispose();
      if (child.material instanceof THREE.Material) {
        child.material.dispose();
      }
    }
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        for (const material of child.material) {
          material.dispose();
        }
      } else {
        child.material.dispose();
      }
    }
    if (child instanceof THREE.Sprite) {
      const material = child.material;
      material.map?.dispose();
      material.dispose();
    }
  });
}
