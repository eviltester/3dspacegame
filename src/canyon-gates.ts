/** Gate rewards and recoverable penalties, independent of course geometry. */
export interface CanyonGateKind { small: boolean; motion: number }
export const CANYON_GATE_PENALTY_STEP = 200;
export function canyonGatePoints(gate: CanyonGateKind): number {
  return 50 * (gate.small ? 2 : 1) * (gate.motion > 0 ? 2 : 1);
}

export class CanyonGateScore {
  penalty = 0;
  cross(passed: boolean, gate: CanyonGateKind): number {
    if (passed) {
      // Passing lowers the next penalty; it does not refund earlier deductions.
      this.penalty = Math.max(0, this.penalty - CANYON_GATE_PENALTY_STEP);
      return canyonGatePoints(gate);
    }
    this.penalty += CANYON_GATE_PENALTY_STEP;
    return -this.penalty;
  }
}

export const CANYON_GATE_BRIEF = 'Gates: large +50, small +100; moving gates pay double. Misses cost 200 points, increasing by 200 each time. Each pass reduces the penalty by 200. While penalized, the next gate pulses bright green and blast charging pauses.';
