/** Calibrated, screen-relative tilt becomes the same displacement consumed by mouse flight. */
import * as THREE from 'three';

const MAX_ANGLE = 24;
const DEAD_ZONE = 2;
export const TILT_STALE_MS = 1000;
export class TiltSteering {
  private centre: THREE.Quaternion | null = null;
  private target = new THREE.Vector2();
  private filtered = new THREE.Vector2();
  private angle: number | null = null;
  lastSample = -Infinity;
  sample(alpha: number | null, beta: number | null, gamma: number | null, screenAngle: number, now: number): boolean {
    if (beta === null || gamma === null || ![alpha ?? 0, beta, gamma, screenAngle].every(Number.isFinite)) return false;
    const radians = THREE.MathUtils.degToRad;
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(radians(beta), radians(gamma), radians(alpha ?? 0), 'ZXY'))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -radians(screenAngle)));
    // Re-centre after portrait/landscape changes, rather than rotating an existing steering command.
    if (this.angle !== screenAngle) this.calibrate();
    this.angle = screenAngle;
    if (!this.centre) this.centre = rotation.clone();
    const relative = new THREE.Euler().setFromQuaternion(this.centre.clone().invert().multiply(rotation), 'YXZ');
    const axis = (value: number) => Math.sign(value) * THREE.MathUtils.clamp((Math.abs(THREE.MathUtils.radToDeg(value)) - DEAD_ZONE) / (MAX_ANGLE - DEAD_ZONE), 0, 1);
    this.target.set(axis(relative.y), axis(relative.x)); this.lastSample = now;
    return true;
  }
  read(dt: number, now: number, sensitivity: number): { x: number; y: number } {
    if (now - this.lastSample > TILT_STALE_MS) { this.filtered.set(0, 0); return { x: 0, y: 0 }; }
    this.filtered.lerp(this.target, 1 - Math.exp(-Math.max(0, dt) / 0.12));
    return { x: this.filtered.x * 520 * sensitivity * dt, y: this.filtered.y * 520 * sensitivity * dt };
  }
  calibrate(): void { this.centre = null; this.target.set(0, 0); this.filtered.set(0, 0); this.lastSample = -Infinity; }
}
