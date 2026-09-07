import type { RunState } from '../arcade';

export const COURSE_INTERMISSION_SECONDS = 3;
/** A simulation-time pause between paid Smuggler legs; no clock or input ownership. */
export class CourseIntermission {
  remaining = 0;
  get active(): boolean { return this.remaining > 0; }
  start(run: RunState): boolean {
    if (this.active || run.mode !== 'smuggler' || !run.cleared || run.phase !== 'cleared') return false;
    this.remaining = COURSE_INTERMISSION_SECONDS; return true;
  }
  reset(): void { this.remaining = 0; }
  tick(dt: number): boolean {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return false;
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining > 1e-6) return false;
    this.remaining = 0; return true;
  }
}
