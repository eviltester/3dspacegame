/** Low-level vector drawing helpers shared by models, courses and visual effects. */
import * as THREE from 'three';


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

// Asteroid mineral colours avoid the yellow salvage and green exit-gate cues.
export const ASTEROID_COLORS = [0xff875f, 0x75ccff, 0xc399ff, 0xff8dce, 0x69e4f0] as const;

export function lineShape(
  vertices: Array<[number, number, number]>,
  edges: Array<[number, number]>,
  color: number,
  opacity = 0.94
): THREE.LineSegments {
  // Each edge is a pair of indices into vertices. Only these chosen edges are
  // drawn; unlike a triangulated wireframe, flat faces do not gain diagonal lines.
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
  // Ownership transfers here: the temporary solid is discarded after extracting
  // its outline. Callers must not reuse that input geometry for a separate mesh.
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

export function tunePulseMaterial(material: THREE.Material, baseOpacity: number): void {
  // Additive lines brighten overlaps without an opaque quad hiding the target.
  // Save the original opacity so animation does not compound fading each frame.
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
  // Removing an object from a scene does not free its GPU resources. Collect
  // unique resources first because several children may share the same material.
  // The caller owns this subtree; do not pass a model shared by another live scene.
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse(child => {
    if (!(child instanceof THREE.LineSegments || child instanceof THREE.Points || child instanceof THREE.Mesh || child instanceof THREE.Sprite)) return;
    if ('geometry' in child && child.geometry instanceof THREE.BufferGeometry) geometries.add(child.geometry as THREE.BufferGeometry);
    const candidate: unknown = child.material;
    const list: unknown[] = Array.isArray(candidate) ? candidate : [candidate];
    for (const material of list) {
      if (!(material instanceof THREE.Material)) continue;
      materials.add(material as THREE.Material);
      if ('map' in material && material.map instanceof THREE.Texture) textures.add(material.map as THREE.Texture);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}
