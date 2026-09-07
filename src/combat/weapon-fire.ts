import type { WeaponSpec } from '../weapons';

/** One cooldown belongs to the ship, not to the currently selected weapon. */
export class WeaponFire {
  private cooldown = 0;
  get remaining(): number { return this.cooldown; }
  tick(dt: number): void { this.cooldown = Math.max(0, this.cooldown - dt); }
  reset(): void { this.cooldown = 0; }

  /** Emit each bolt once; a full projectile pool must not consume a cooldown. */
  fire(spec: Pick<WeaponSpec, 'count' | 'cooldown'>, emit: (index: number) => boolean): number {
    if (this.cooldown > 0) return 0;
    let fired = 0;
    for (let index = 0; index < spec.count; index++) if (emit(index)) fired++;
    if (fired) this.cooldown = spec.cooldown;
    return fired;
  }
}
