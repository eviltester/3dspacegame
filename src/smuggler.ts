/**
 * Stakes and rewards for Smuggler Run. Course simulation belongs to BonusController;
 * this module decides what finishing that course means for the player's real run.
 */
import { loseLife } from './arcade';
import type { RunState } from './arcade';
import type { BonusRunState } from './bonus';
import { awardScoreLives } from './life-rewards';

export function smugglerLeg(stage: number) {
  // Each belt/canyon pair shares a difficulty. After level eight, new seeds vary
  // the courses while their speed and density stay at the tested maximum.
  const leg = Math.max(1, Math.floor(stage));
  return { kind: leg % 2 ? 'asteroids' as const : 'canyon' as const, difficulty: Math.min(8, 1 + Math.floor((leg - 1) / 2)) };
}

export function smugglerReward(state: Pick<BonusRunState, 'points' | 'health' | 'difficulty'>): number {
  return Math.max(0, Math.floor(state.points)) * 25 + 1000 + Math.max(0, state.health) * 100 + (state.difficulty - 1) * 150;
}

export function settleSmugglerLeg(run: RunState, state: Pick<BonusRunState, 'finished' | 'reason' | 'points' | 'health' | 'difficulty'>): { score: number; extraLives: number; success: boolean } | null {
  // Only a finished, unbanked leg can settle. The result screen may be loaded again
  // from a save, but cleared/phase prevent it granting points or lives again.
  if (run.mode !== 'smuggler' || run.phase !== 'playing' || run.cleared || !state.finished) return null;
  if (state.reason !== 'complete') {
    loseLife(run);
    return { score: 0, extraLives: 0, success: false };
  }
  const score = smugglerReward(state);
  run.pilot.score += score;
  run.stageReward = score;
  run.cleared = true; run.phase = 'cleared';
  const extraLives = awardScoreLives(run);
  return { score, extraLives, success: true };
}
