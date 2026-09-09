/** Translate browser events into one common flight command for every control layout. */
import * as THREE from 'three';
import type { WeaponCommand } from './weapons';
import { CONTROL_LAYOUTS, KEYBOARD_LOOK_RATE } from './input-layouts';
import type { ControlScheme } from './input-layouts';
import { MobileInput } from './mobile/input';
import { BoostDrive } from './boost';
import { TunnelKeys, TUNNEL_KEYS } from './tunnels/input';

export const MIN_THROTTLE = -90;
export const MAX_THROTTLE = 180;
export const MOUSE_PAUSE_HOLD_MS = 600;

export interface FlightCommand { x: number; y: number; roll: number; speed: number; boost: boolean }

export function weaponKey(code: string): WeaponCommand | null {
  if (code === 'Digit1' || code === 'Numpad1') return 'pulse';
  if (code === 'Digit2' || code === 'Numpad2') return 'spread';
  if (code === 'Digit3' || code === 'Numpad3') return 'lance';
  return code === 'Tab' ? 'next' : null;
}

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
  readonly mobile: MobileInput;
  active = false;
  firing = false;
  private touchFiring = false;
  // Remember a quick tap even if mouseup happens before the next simulation tick.
  private firePressed = false;
  throttle = 65;
  mouseSensitivity = 1;
  autoFlight = false;
  tunnelControls = false;
  private readonly tunnelKeys = new TunnelKeys();
  private wheelBoost = 0;
  private boostHeld = false;
  private readonly boostDrive = new BoostDrive();
  private dx = 0;
  private dy = 0;
  private fallback = false;
  private scheme: ControlScheme = 'mouse';
  private keys = new Set<string>();
  private middlePressed = false;
  private middleHold: ReturnType<typeof setTimeout> | null = null;
  constructor(private canvas: HTMLCanvasElement, private pause: () => void, private special: () => void, private weapon: (command: WeaponCommand) => void = () => {}, motionChanged: () => void = () => {}) {
    this.mobile = new MobileInput(canvas, () => this.active && this.scheme === 'touch', motionChanged);
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('mousedown', event => {
      if (!this.active || this.scheme === 'touch') return;
      event.preventDefault();
      if (event.button === 0) { this.firing = true; this.firePressed = true; }
      if (event.button === 1 && !this.middlePressed) {
        // A short middle click cycles weapons; a long hold pauses. Clear the press
        // when the hold fires so releasing the button cannot perform both actions.
        this.middlePressed = true;
        this.middleHold = setTimeout(() => {
          this.middleHold = null;
          if (this.active && this.middlePressed) { this.middlePressed = false; this.pause(); }
        }, MOUSE_PAUSE_HOLD_MS);
      }
      if (event.button === 2) this.special();
    });
    canvas.addEventListener('auxclick', event => { if (this.active && event.button === 1) event.preventDefault(); });
    window.addEventListener('mouseup', event => {
      if (this.scheme === 'touch') return;
      if (event.button === 0) this.firing = false;
      if (event.button === 1) {
        const cycle = this.middlePressed && this.active;
        this.clearMiddle();
        if (cycle) this.weapon('next');
      }
    });
    window.addEventListener('mousemove', event => {
      if (this.active && this.scheme === 'mouse' && (document.pointerLockElement === canvas || this.fallback)) {
        this.dx += event.movementX * this.mouseSensitivity;
        this.dy += event.movementY * this.mouseSensitivity;
      }
    });
    canvas.addEventListener('wheel', event => {
      if (!this.active || this.scheme === 'touch') return;
      event.preventDefault();
      if (this.autoFlight) { if (event.deltaY < 0) this.wheelBoost = 1.5; }
      else this.throttle = wheelThrottle(this.throttle, event.deltaY);
    }, { passive: false });
    window.addEventListener('keydown', event => {
      if (!this.active || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      const weapon = weaponKey(event.code);
      if (weapon) {
        event.preventDefault();
        if (!event.repeat) this.weapon(weapon);
        return;
      }
      const layout = CONTROL_LAYOUTS[this.scheme];
      const bindings = [layout.up, layout.down, layout.left, layout.right, layout.primary, layout.special, layout.accelerate, layout.brake, layout.rollLeft, layout.rollRight];
      if (!bindings.some(codes => codes.includes(event.code)) && !['Escape', 'ShiftLeft', 'ShiftRight'].includes(event.code) && !(this.tunnelControls && TUNNEL_KEYS.includes(event.code))) return;
      event.preventDefault();
      this.keys.add(event.code);
      if (this.tunnelControls) this.tunnelKeys.press(event.code);
      if (layout.primary.includes(event.code) && !event.repeat) this.firePressed = true;
      if (layout.special.includes(event.code) && !event.repeat) this.special();
      if (event.code === 'Escape' && !event.repeat) this.pause();
    });
    window.addEventListener('keyup', event => { this.keys.delete(event.code); this.tunnelKeys.release(event.code); });
    window.addEventListener('blur', () => { if (this.active) this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.active) this.pause(); });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.active && this.scheme === 'mouse' && !this.fallback) this.pause();
    });
  }
  setScheme(scheme: ControlScheme): void {
    this.clear(); this.scheme = scheme === 'touch' ? 'touch' : 'mouse';
    this.canvas.classList?.toggle('touch-flight', scheme === 'touch');
    if (scheme !== 'touch') this.mobile.motion.stop();
  }
  boost(): void { if (this.active) this.wheelBoost = 1.5; }
  setBoostHeld(held: boolean): void { this.boostHeld = this.active && held; }
  adjustThrottle(direction: number): void { if (this.active && !this.autoFlight) this.throttle = wheelThrottle(this.throttle, -direction); }
  async engage(): Promise<void> {
    this.clear();
    this.active = true;
    this.fallback = false;
    if (this.scheme !== 'mouse') return;
    // Capture mouse motion for combined desktop input. Keyboard controls also
    // work when an embedded browser refuses capture and we use the fallback.
    try { if (document.pointerLockElement !== this.canvas) await this.canvas.requestPointerLock(); }
    catch { this.fallback = true; }
  }
  release(): void {
    // Mark inactive before exiting lock so pointerlockchange cannot pause recursively.
    this.active = false;
    this.clear();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  private clearMiddle(): void {
    if (this.middleHold !== null) clearTimeout(this.middleHold);
    this.middleHold = null; this.middlePressed = false;
  }
  // Cinematics suppress flight commands but leave the hold-to-pause gesture live.
  clearFlight(): void { this.firing = false; this.touchFiring = false; this.firePressed = false; this.dx = 0; this.dy = 0; this.wheelBoost = 0; this.boostHeld = false; this.boostDrive.reset(); this.keys.clear(); this.tunnelKeys.clear(); this.mobile.clear(); }
  clear(): void { this.clearFlight(); this.clearMiddle(); }
  consumeLaneStep(dt: number): number { return this.active && this.tunnelControls ? this.tunnelKeys.consume(dt) : 0; }
  consumeFire(): boolean {
    const requested = this.active && (this.firing || this.touchFiring || this.firePressed || this.held(CONTROL_LAYOUTS[this.scheme].primary));
    this.firePressed = false;
    return requested;
  }
  private held(codes: readonly string[]): boolean { return codes.some(code => this.keys.has(code)); }
  consume(dt: number): FlightCommand {
    if (this.active && this.scheme === 'touch') {
      const touch = this.mobile.read(dt);
      this.dx += touch.x; this.dy += touch.y;
      this.firePressed ||= touch.fire; this.touchFiring = touch.held;
      if (touch.blast) this.special();
      if (touch.cycle) this.weapon('next');
    }
    // Mouse input is already a displacement; held keys are rates multiplied by dt.
    // Only transient deltas are consumed. The selected throttle is deliberately kept.
    const layout = CONTROL_LAYOUTS[this.scheme];
    if (!this.autoFlight && this.held(layout.accelerate)) this.throttle = Math.min(MAX_THROTTLE, this.throttle + dt * 80);
    if (!this.autoFlight && this.held(layout.brake)) this.throttle = Math.max(MIN_THROTTLE, this.throttle - dt * 100);
    const boost = this.boostHeld || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.wheelBoost > 0;
    this.wheelBoost = Math.max(0, this.wheelBoost - dt);
    const value = { x: this.dx + (this.tunnelControls ? 0 : (Number(this.held(layout.right)) - Number(this.held(layout.left))) * KEYBOARD_LOOK_RATE * dt),
      y: this.dy + (Number(this.held(layout.down)) - Number(this.held(layout.up))) * KEYBOARD_LOOK_RATE * dt,
      roll: Number(this.held(layout.rollLeft)) - Number(this.held(layout.rollRight)),
      speed: this.autoFlight ? this.throttle : this.boostDrive.step(dt, this.throttle, boost), boost };
    this.dx = 0;
    this.dy = 0;
    return value;
  }
  injectLook(x: number, y: number): void { this.dx += x; this.dy += y; }
}

export function rotateLocally(rotation: THREE.Quaternion, x: number, y: number, roll: number, dt: number): void {
  // Post-multiply by a local rotation instead of clamping global pitch/yaw angles.
  // Up/down can continue through a full loop, even after the player has rolled.
  rotation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-y * 0.0022, -x * 0.0022, roll * dt * 1.4, 'YXZ'))).normalize();
}
