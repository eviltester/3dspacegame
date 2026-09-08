/** One lane per tap; held movement repeats on simulation time, not OS key repeat. */
export const TUNNEL_LEFT = ['KeyA', 'ArrowLeft'];
export const TUNNEL_RIGHT = ['KeyD', 'ArrowRight'];
export const TUNNEL_KEYS = [...TUNNEL_LEFT, ...TUNNEL_RIGHT];
export class TunnelKeys {
  private held = new Set<string>();
  private pending = 0;
  private delay = 0.22;
  private get direction(): number {
    return Number(TUNNEL_RIGHT.some(key => this.held.has(key))) - Number(TUNNEL_LEFT.some(key => this.held.has(key)));
  }
  press(code: string): void {
    if (this.held.has(code)) return;
    const before = this.direction; this.held.add(code);
    if (this.direction && this.direction !== before) { this.pending += this.direction; this.delay = 0.22; }
  }
  release(code: string): void { this.held.delete(code); }
  consume(dt: number): number {
    let steps = this.pending; this.pending = 0;
    if (this.direction) {
      this.delay -= dt;
      while (this.delay <= 0) { steps += this.direction; this.delay += 0.16; }
    }
    return steps;
  }
  clear(): void { this.held.clear(); this.pending = 0; this.delay = 0.22; }
}
