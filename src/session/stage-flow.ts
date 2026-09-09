/** Run transitions return destinations; the browser adapter only displays them. */
import { advance, bonusFor, dock, JOURNEY_STAGE_COUNT, retry, settleBonus, settleStage, settleTimeBonus } from '../arcade';
import type { GameMode, RunState } from '../arcade';
import type { BonusRunState } from '../bonus';
import { awardScoreLives } from '../life-rewards';
import { settleSmugglerLeg } from '../smuggler';
import type { ShotAccuracy } from '../combat/accuracy';
import { canyonHaulPoints } from '../canyon-combat';

export function needsMissionBriefing(mode: GameMode): boolean {
  return mode === 'journey' || mode === 'endless';
}

export function completeEncounter(run: RunState, accuracy: ShotAccuracy) {
  if (run.phase !== 'playing') return null;
  if (!settleStage(run)) return null;
  const missCost = run.mode === 'invaders' ? accuracy.finish(run.accuracy) : 0;
  run.pilot.score = Math.max(0, run.pilot.score - missCost);
  const extraLives = run.mode === 'invaders' ? awardScoreLives(run) : 0;
  const route = run.mode === 'invaders' || run.mode === 'endless' && run.stage % 5 !== 0 ? 'recovery' : 'gate';
  if (route === 'recovery') run.phase = 'recovery';
  return { route, missCost, extraLives };
}
export function afterGate(run: RunState): 'victory' | 'bonusOffer' | 'shop' | null {
  if (!run.cleared || run.mode === 'invaders' || run.mode === 'smuggler' || run.phase === 'recovery') return null;
  if (run.mode === 'journey' && run.stage >= JOURNEY_STAGE_COUNT) { advance(run); return 'victory'; }
  if (bonusFor(run) && run.bonusStatus === 'available') { run.phase = 'bonusOffer'; return 'bonusOffer'; }
  dock(run); return 'shop';
}
export function nextStage(run: RunState, inCourse = false) {
  if (!run.cleared || inCourse || !['cleared', 'recovery', 'shop'].includes(run.phase)) return null;
  const timeBonus = run.phase === 'recovery' ? settleTimeBonus(run) : null;
  advance(run);
  return { route: run.phase === 'victory' ? 'victory' as const : 'briefing' as const, timeBonus };
}
export function resumeDestination(run: RunState): 'gameover' | 'briefing' | 'intermission' | 'shop' | 'bonusOffer' {
  if (run.phase === 'gameover') {
    if (!run.lives) return 'gameover';
    retry(run); return 'briefing';
  }
  if (run.mode === 'smuggler' && run.cleared) return 'intermission';
  if (run.phase === 'shop' || run.phase === 'bonusResult') return 'shop';
  return run.phase === 'bonusOffer' ? 'bonusOffer' : 'briefing';
}
export function enterBonus(run: RunState) {
  const kind = bonusFor(run);
  if (!kind || run.bonusStatus !== 'available' || run.phase !== 'bonusOffer') return null;
  run.bonusStatus = 'entered'; run.phase = 'bonus'; return kind;
}
export type CourseOutcome = Pick<BonusRunState, 'finished' | 'reason' | 'points' | 'health' | 'shield' | 'damage' | 'difficulty' | 'kind' | 'haul' | 'remaining' | 'flight'>;
export function settleCourse(run: RunState, state: CourseOutcome, ratio: number) {
  if (!state.finished) return null;
  if (run.mode === 'smuggler') {
    const result = settleSmugglerLeg(run, state);
    return result ? { kind: 'smuggler' as const, ...result } : null;
  }
  const haulPoints = state.kind === 'canyon' && state.reason === 'complete' ? canyonHaulPoints(state.haul) : 0;
  const result = settleBonus(run, ratio, state.kind === 'asteroids' ? undefined : state.points + haulPoints);
  return result ? { kind: 'bonus' as const, ...result } : null;
}
