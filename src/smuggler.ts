/**
 * Stakes and rewards for Smuggler Run. Course simulation belongs to BonusController;
 * this module decides what finishing that course means for the player's real run.
 */
import { clone, loseLife } from './arcade';
import type { RunState } from './arcade';
import type { BonusRunState } from './bonus';
import { awardScoreLives } from './life-rewards';
import { canyonHaulPoints } from './canyon-combat';
import { parseSkiff } from './skiff-vitals';
import type { SkiffVitals } from './skiff-vitals';
import { smugglerAwards } from './smuggler-rewards';
import type { SmugglerResult } from './smuggler-rewards';

export function smugglerLeg(stage: number) {
  // Each belt/canyon pair shares a difficulty. After level eight, new seeds vary
  // the courses while their speed and density stay at the tested maximum.
  const leg = Math.max(1, Math.floor(stage));
  return { kind: leg % 2 ? 'asteroids' as const : 'canyon' as const, difficulty: Math.min(8, 1 + Math.floor((leg - 1) / 2)) };
}

type FlightPoints = Pick<BonusRunState, 'kind' | 'points'>;
export function smugglerFlightPoints(state: FlightPoints): number {
  // Canyon rewards/penalties are already score points, not salvage units.
  return Math.round(state.points * (state.kind === 'canyon' ? 1 : 25));
}
export function smugglerFlightScore(score: number, state: FlightPoints): number { return Math.max(0, score + smugglerFlightPoints(state)); }
export function smugglerCheckpoint(run: RunState, state?: FlightPoints & SkiffVitals & Pick<BonusRunState, 'flight'>): RunState {
  if (run.mode !== 'smuggler' || run.phase !== 'playing' || !state) return run;
  const saved = clone(run);
  saved.pilot.score = smugglerFlightScore(run.pilot.score, state);
  saved.skiff = parseSkiff(state, true);
  saved.smugglerFlight = clone(state.flight);
  return saved;
}
type SmugglerOutcome = Pick<BonusRunState, 'kind' | 'finished' | 'reason' | 'points' | 'health' | 'shield' | 'damage' | 'difficulty' | 'haul' | 'remaining' | 'flight'>;
export function smugglerReward(state: SmugglerOutcome): SmugglerResult {
  const clean = state.reason === 'complete';
  const awards = smugglerAwards(state.flight, clean, state.kind === 'canyon', state.remaining);
  if (clean) awards.delivery = 1000 + Math.max(0, state.health) * 100 + (state.difficulty - 1) * 150;
  return { flight: smugglerFlightPoints(state), haul: state.haul, haulPoints: clean ? canyonHaulPoints(state.haul) : 0,
    seconds: Math.max(0, Math.floor(state.remaining + 1e-6)), awards };
}

export function settleSmugglerLeg(run: RunState, state: SmugglerOutcome): { score: number; extraLives: number; success: boolean } | null {
  // Only a finished, unbanked leg can settle. The result screen may be loaded again
  // from a save, but cleared/phase prevent it granting points or lives again.
  if (run.mode !== 'smuggler' || run.phase !== 'playing' || run.cleared || !state.finished) return null;
  const success = state.reason === 'complete' || state.reason === 'gateMissed', before = run.pilot.score;
  const result = success ? smugglerReward(state) : null;
  // Flight points survive a lost life. Only reaching EXIT earns a delivery bonus.
  run.pilot.score = Math.max(0, before + (result ? result.flight + result.haulPoints + Object.values(result.awards).reduce((sum, points) => sum + points, 0) : smugglerFlightPoints(state)));
  const score = run.pilot.score - before, extraLives = awardScoreLives(run);
  if (!success) {
    loseLife(run);
    return { score, extraLives, success };
  }
  run.stageReward = score;
  run.smugglerResult = result;
  run.skiff = parseSkiff(state, true);
  run.stageHaul = state.reason === 'complete' ? state.haul : 0;
  run.cleared = true; run.phase = 'cleared';
  return { score, extraLives, success: true };
}
