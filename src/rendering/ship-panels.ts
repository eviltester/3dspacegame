/** Reconstruct sparse hull faces from a ship's line geometry for cosmetic breakup. */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

export type HullPanel = THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;

function faceOutlines(geometry: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const attribute = geometry.getAttribute('position');
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < attribute.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(attribute, i);
    if (!points.some(other => other.distanceToSquared(point) < 1e-8)) points.push(point);
  }
  if (points.length < 3) return [geometry.clone()];

  // Flat wings and antennae have no volume. Preserve their existing outlines
  // instead of feeding a degenerate point cloud into the convex-hull algorithm.
  const plane = new THREE.Plane();
  for (let i = 2; i < points.length; i++) {
    plane.setFromCoplanarPoints(points[0], points[1], points[i]);
    if (plane.normal.lengthSq() > 0.5) break;
  }
  if (!points.some(point => Math.abs(plane.distanceToPoint(point)) > 1e-4)) return [geometry.clone()];

  const hull = new ConvexGeometry(points), positions = hull.getAttribute('position'), normals = hull.getAttribute('normal');
  const faces: Array<{ normal: THREE.Vector3; distance: number; vertices: number[] }> = [];
  for (let i = 0; i < positions.count; i += 3) {
    const normal = new THREE.Vector3().fromBufferAttribute(normals, i);
    const distance = normal.dot(new THREE.Vector3().fromBufferAttribute(positions, i));
    let face = faces.find(item => item.normal.dot(normal) > 0.99999 && Math.abs(item.distance - distance) < 1e-4);
    if (!face) { face = { normal, distance, vertices: [] }; faces.push(face); }
    for (let j = 0; j < 3; j++) face.vertices.push(positions.getX(i + j), positions.getY(i + j), positions.getZ(i + j));
  }
  hull.dispose();
  // Coplanar triangles form one panel. EdgesGeometry removes their internal
  // diagonals so a box breaks into six readable sides, not twelve triangles.
  return faces.map(face => {
    const surface = new THREE.BufferGeometry();
    surface.setAttribute('position', new THREE.Float32BufferAttribute(face.vertices, 3));
    const outline = new THREE.EdgesGeometry(surface); surface.dispose(); return outline;
  });
}

export function createHullPanels(source: THREE.Object3D, parent: THREE.Object3D, limit = 12): HullPanel[] {
  const panels: HullPanel[] = [];
  source.updateWorldMatrix(true, true); parent.updateWorldMatrix(true, false);
  const inverse = parent.matrixWorld.clone().invert();
  source.traverseVisible(child => {
    if (!(child instanceof THREE.LineSegments) || !(child.geometry instanceof THREE.BufferGeometry) || !(child.material instanceof THREE.LineBasicMaterial) || panels.length >= limit) return;
    const transform = inverse.clone().multiply(child.matrixWorld);
    for (const geometry of faceOutlines(child.geometry as THREE.BufferGeometry)) {
      if (panels.length >= limit) { geometry.dispose(); continue; }
      geometry.applyMatrix4(transform); geometry.computeBoundingBox();
      const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
      geometry.translate(-center.x, -center.y, -center.z);
      const material = new THREE.LineBasicMaterial({ color: child.material.color, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
      const panel = new THREE.LineSegments(geometry, material);
      // Give each panel its own pivot and resources. The original ship can now be
      // removed/disposed immediately without erasing the breakup animation.
      panel.name = 'hull-fragment'; panel.position.copy(center); panels.push(panel);
    }
  });
  return panels;
}
