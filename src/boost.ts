/** Boost adds thrust over the current cruise pace, never a stored absolute speed. */
export class BoostDrive {
  amount = 0;
  constructor(private readonly acceleration = 0.25) {}
  step(dt: number, cruise: number, held: boolean): number {
    if (Number.isFinite(dt) && dt > 0) {
      // Course drives reach +50% in 0.77 seconds. Release always sheds speed gradually.
      this.amount = Math.max(0, Math.min(0.5, this.amount + dt * (held ? this.acceleration : -0.35)));
    }
    return cruise * (1 + this.amount);
  }
  reset(): void { this.amount = 0; }
}
