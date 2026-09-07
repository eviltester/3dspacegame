/** Permission and sensor lifecycle only. No gameplay runs while a permission prompt is open. */
import { TiltSteering, TILT_STALE_MS } from './tilt';

export type MotionStatus = 'off' | 'requesting' | 'waiting' | 'ready' | 'denied' | 'unavailable' | 'insecure';
export const MOTION_MESSAGES: Record<MotionStatus, string> = {
  off: 'Drag to steer, or enable tilt controls.', requesting: 'Waiting for motion permission...',
  waiting: 'Hold your phone comfortably. Waiting for motion data...', ready: 'Tilt controls ready. Centre again whenever you change grip.',
  denied: 'Motion permission denied. Drag to steer, or allow motion access in your browser settings.',
  unavailable: 'No motion data available. Drag to steer.', insecure: 'Tilt requires HTTPS. Drag to steer on this connection.'
};
export class MotionInput {
  readonly tilt = new TiltSteering();
  status: MotionStatus = 'off';
  private generation = 0;
  private listening = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private changed: () => void = () => {}) {}
  private setStatus(status: MotionStatus): void { if (status !== this.status) { this.status = status; this.changed(); } }
  private event = (event: DeviceOrientationEvent): void => {
    const angle = window.screen?.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0;
    if (!this.tilt.sample(event.alpha, event.beta, event.gamma, angle, performance.now())) return;
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.setStatus('ready');
  };
  async enable(): Promise<void> {
    this.stop(); const generation = this.generation;
    if (!window.isSecureContext) { this.setStatus('insecure'); return; }
    if (typeof DeviceOrientationEvent === 'undefined') { this.setStatus('unavailable'); return; }
    this.setStatus('requesting');
    try {
      const api = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
      // Call before the first await: iOS requires the original button's user activation.
      const permission = await (api.requestPermission ? api.requestPermission() : Promise.resolve('granted'));
      if (generation !== this.generation) return;
      if (permission !== 'granted') { this.setStatus('denied'); return; }
      this.listening = true; window.addEventListener('deviceorientation', this.event);
      this.calibrate();
    } catch { if (generation === this.generation) this.setStatus('denied'); }
  }
  get available(): boolean { return this.status === 'ready' && performance.now() - this.tilt.lastSample <= TILT_STALE_MS; }
  read(dt: number, sensitivity: number) {
    if (this.status === 'ready' && !this.available) this.setStatus('unavailable');
    return this.available ? this.tilt.read(dt, performance.now(), sensitivity) : { x: 0, y: 0 };
  }
  calibrate(): void {
    this.tilt.calibrate();
    if (this.listening) {
      this.setStatus('waiting');
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.timer = null; this.setStatus('unavailable'); }, 1800);
    }
  }
  stop(): void {
    this.generation++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.listening) window.removeEventListener('deviceorientation', this.event);
    this.listening = false; this.tilt.calibrate(); this.setStatus('off');
  }
}

export function touchCapable(): boolean {
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 || window.matchMedia?.('(any-pointer: coarse)').matches === true;
}
