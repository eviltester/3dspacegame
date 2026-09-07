/** Gesture decisions use a supplied clock, so pause/cancellation and double taps need no timers. */
export const DOUBLE_TAP_MS = 260;
const DRAG_DISTANCE = 12;
type Side = 'left' | 'right';
interface Press { side: Side; x: number; y: number; startX: number; startY: number; at: number; moved: boolean; second: boolean; held: boolean }
interface Tap { x: number; y: number; at: number }
export class MobileGestures {
  private presses = new Map<number, Press>();
  private pending: Partial<Record<Side, Tap>> = {};
  private dx = 0;
  private dy = 0;
  private fire = false;
  private blast = false;
  private cycle = false;
  down(id: number, side: Side, x: number, y: number, now: number): void {
    const tap = this.pending[side];
    const second = !!tap && now - tap.at <= DOUBLE_TAP_MS && Math.hypot(x - tap.x, y - tap.y) < 40;
    this.presses.set(id, { side, x, y, startX: x, startY: y, at: now, moved: false, second, held: false });
  }
  move(id: number, x: number, y: number, drag: boolean): void {
    const press = this.presses.get(id); if (!press) return;
    if (drag) { this.dx += (x - press.x) * 2; this.dy += (y - press.y) * 2; }
    press.x = x; press.y = y;
    if (Math.hypot(x - press.startX, y - press.startY) > DRAG_DISTANCE) press.moved = true;
  }
  up(id: number, now: number): void {
    const press = this.presses.get(id); if (!press) return;
    this.presses.delete(id);
    if (press.moved || press.held || now - press.at > DOUBLE_TAP_MS) { if (press.second) delete this.pending[press.side]; return; }
    if (press.second && this.pending[press.side]) { delete this.pending[press.side]; this.cycle = true; }
    else this.pending[press.side] = { x: press.x, y: press.y, at: now };
  }
  cancel(id: number): void {
    const press = this.presses.get(id);
    if (press) delete this.pending[press.side];
    this.presses.delete(id);
  }
  read(now: number) {
    let held = false;
    for (const press of this.presses.values()) {
      if (now - press.at >= DOUBLE_TAP_MS) {
        press.held = true;
        if (press.second) delete this.pending[press.side];
        if (press.side === 'left') held = true;
      }
    }
    for (const side of ['left', 'right'] as const) {
      const tap = this.pending[side];
      if (tap && now - tap.at >= DOUBLE_TAP_MS && ![...this.presses.values()].some(press => press.side === side && press.second)) {
        if (side === 'left') this.fire = true; else this.blast = true;
        delete this.pending[side];
      }
    }
    const result = { x: this.dx, y: this.dy, fire: this.fire, held, blast: this.blast, cycle: this.cycle };
    this.dx = 0; this.dy = 0; this.fire = false; this.blast = false; this.cycle = false;
    return result;
  }
  clear(): void { this.presses.clear(); this.pending = {}; this.dx = 0; this.dy = 0; this.fire = false; this.blast = false; this.cycle = false; }
}
