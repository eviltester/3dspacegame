/** Score milestones belong to the run, not to retryable stage resources. */
import type { RunState } from './arcade';
import { INVADER_EXTRA_LIFE_SCORE, SMUGGLER_EXTRA_LIFE_SCORE } from './modes';
import type { GameMode } from './modes';

export const lifeScoreInterval = (mode: GameMode): number => mode === 'invaders' ? INVADER_EXTRA_LIFE_SCORE : SMUGGLER_EXTRA_LIFE_SCORE;
export function awardScoreLives(run: RunState): number {
  if (run.mode !== 'invaders' && run.mode !== 'smuggler') return 0;
  const interval = lifeScoreInterval(run.mode);
  const awards = Math.max(0, 1 + Math.floor((run.pilot.score - run.nextLifeScore) / interval));
  const gained = Math.min(5 - run.lives, awards);
  run.lives += gained;
  // Consume thresholds at the cap too, and never rewind them after a miss penalty.
  run.nextLifeScore += awards * interval;
  return gained;
}
