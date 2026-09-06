import * as THREE from 'three';

export const MIN_THROTTLE = -90;
export const MAX_THROTTLE = 180;

export function wheelThrottle(throttle: number, delta: number): number {
  const next = THREE.MathUtils.clamp(throttle - Math.sign(delta) * 15, MIN_THROTTLE, MAX_THROTTLE);
  // Land on stop before a subsequent wheel step engages the opposite direction.
  return throttle * next < 0 ? 0 : next;
}

export function throttleReadout(throttle: number): string {
  const speed = Math.round(Math.abs(throttle));
  return speed === 0 ? 'STOP' : `${throttle < 0 ? 'REV' : 'FWD'} ${speed}`;
}

export class FlightInput {
  active = false;
  firing = false;
  private firePressed = false;
  throttle = 65;
  private dx = 0;
  private dy = 0;
  private fallback = false;
  private keys = new Set<string>();
  constructor(private canvas: HTMLCanvasElement, private pause: () => void, private special: () => void) {
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('mousedown', event => {
      if (!this.active) return;
      event.preventDefault();
      if (event.button === 0) { this.firing = true; this.firePressed = true; }
      if (event.button === 1) this.pause();
      if (event.button === 2) this.special();
    });
    window.addEventListener('mouseup', event => { if (event.button === 0) this.firing = false; });
    window.addEventListener('mousemove', event => {
      if (this.active && (document.pointerLockElement === canvas || this.fallback)) {
        this.dx += event.movementX;
        this.dy += event.movementY;
      }
    });
    canvas.addEventListener('wheel', event => {
      if (!this.active) return;
      event.preventDefault();
      this.throttle = wheelThrottle(this.throttle, event.deltaY);
    }, { passive: false });
    window.addEventListener('keydown', event => {
      if (!this.active) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (event.code === 'Escape') this.pause();
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => { if (this.active) this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.active) this.pause(); });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.active && !this.fallback) this.pause();
    });
  }
  async engage(): Promise<void> {
    this.clear();
    this.active = true;
    this.fallback = false;
    try { if (document.pointerLockElement !== this.canvas) await this.canvas.requestPointerLock(); }
    catch { this.fallback = true; }
  }
  release(): void {
    this.active = false;
    this.clear();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  clear(): void { this.firing = false; this.firePressed = false; this.dx = 0; this.dy = 0; this.keys.clear(); }
  consumeFire(): boolean {
    const requested = this.active && (this.firing || this.firePressed || this.keys.has('Space'));
    this.firePressed = false;
    return requested;
  }
  consume(dt: number): { x: number; y: number; roll: number; speed: number } {
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.throttle = Math.min(MAX_THROTTLE, this.throttle + dt * 80);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.throttle = Math.max(MIN_THROTTLE, this.throttle - dt * 100);
    const value = { x: this.dx, y: this.dy, roll: (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0),
      speed: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? (this.throttle < 0 ? -130 : 230) : this.throttle };
    this.dx = 0;
    this.dy = 0;
    return value;
  }
  injectLook(x: number, y: number): void { this.dx += x; this.dy += y; }
}

export function rotateLocally(rotation: THREE.Quaternion, x: number, y: number, roll: number, dt: number): void {
  rotation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-y * 0.0022, -x * 0.0022, roll * dt * 1.4, 'YXZ'))).normalize();
}
