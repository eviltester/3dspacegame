/** Touch events are adapted once here; menus keep their normal native click/scroll behaviour. */
import { MobileGestures } from './gestures';
import { MotionInput } from './motion';
import { tiltSensitivity } from '../input-layouts';

export class MobileInput {
  readonly gestures = new MobileGestures();
  readonly motion: MotionInput;
  sensitivity = 1;
  private captured = new Set<number>();
  constructor(private canvas: HTMLCanvasElement, private active: () => boolean, changed: () => void) {
    this.motion = new MotionInput(changed);
    canvas.addEventListener('pointerdown', event => {
      if (!this.active() || event.pointerType !== 'touch') return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.gestures.down(event.pointerId, event.clientX < rect.left + rect.width / 2 ? 'left' : 'right', event.clientX, event.clientY, performance.now());
      this.captured.add(event.pointerId); canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (!this.active() || event.pointerType !== 'touch') return;
      event.preventDefault(); this.gestures.move(event.pointerId, event.clientX, event.clientY, !this.motion.available);
    });
    canvas.addEventListener('pointerup', event => {
      if (!this.active() || event.pointerType !== 'touch') return;
      event.preventDefault(); this.gestures.up(event.pointerId, performance.now()); this.captured.delete(event.pointerId);
    });
    for (const name of ['pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(name, event => {
      if (this.captured.delete(event.pointerId)) this.gestures.cancel(event.pointerId);
    });
  }
  read(dt: number) {
    const touch = this.gestures.read(performance.now()), tilt = this.motion.read(dt, tiltSensitivity(this.sensitivity));
    return { ...touch, x: touch.x + tilt.x, y: touch.y + tilt.y };
  }
  clear(): void {
    this.gestures.clear();
    for (const id of this.captured) if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    this.captured.clear(); this.motion.calibrate();
  }
}
