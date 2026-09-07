/** Catalog selection/cadence, independent of rendering and keyboard events. */
export class ObjectScan {
  index = 0;
  private elapsed = 0;
  constructor(readonly count: number) {
    if (!Number.isInteger(count) || count < 1) throw new Error('An object scan needs at least one entry');
  }
  get label(): string { return `${this.index + 1}/${this.count}`; }
  move(direction: number): void {
    this.index = ((this.index + direction) % this.count + this.count) % this.count;
    this.elapsed = 0;
  }
  tick(dt: number): boolean {
    if (!Number.isFinite(dt) || dt <= 0) return false;
    this.elapsed += dt;
    if (this.elapsed < 5 - 1e-6) return false;
    this.move(1); return true;
  }
}
