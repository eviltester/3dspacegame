import { describe, expect, it } from 'vitest';
import { advance, clone, freshProfile, newRun, parseProfile, retry, saveCheckpoint } from './arcade';
import type { BonusRunState } from './bonus';
import { settleSmugglerLeg, smugglerLeg } from './smuggler';

const course = (reason: BonusRunState['reason'] = 'complete', points = 40): BonusRunState => ({ kind: 'asteroids', family: 'pulse', elapsed: 60, duration: 60, remaining: 0,
  health: 3, charge: 100, points, difficulty: 1, targetCount: 16, shotsFired: 0, nextMarker: 1, finished: true, reason, notice: '', fractures: 0, enemyShots: 0 });

describe('Smuggler Run', () => {
  it('alternates belts and canyons and raises difficulty for every pair', () => {
    for (let leg = 1; leg <= 40; leg++) {
      expect(smugglerLeg(leg)).toEqual({ kind: leg % 2 ? 'asteroids' : 'canyon', difficulty: Math.min(8, Math.ceil(leg / 2)) });
    }
  });
  it('banks the haul and delivery once, then resumes the next leg', () => {
    const run = newRun('smuggler', 1); run.phase = 'playing';
    expect(settleSmugglerLeg(run, course())).toEqual({ score: 2300, extraLives: 0, success: true });
    expect(settleSmugglerLeg(run, course())).toBeNull();
    const profile = freshProfile(); saveCheckpoint(profile, run);
    const saved = parseProfile(JSON.stringify(profile), null).checkpoints.smuggler!;
    expect(saved.cleared).toBe(true); expect(saved.stageReward).toBe(2300); expect(settleSmugglerLeg(saved, course())).toBeNull();
    advance(saved); expect(saved.stage).toBe(2); expect(saved.checkpoint.pilot.score).toBe(2300);
  });
  it.each(['crash', 'missedGates', 'gateMissed', 'wall', 'timeout', 'exit'] as const)('%s costs one life, discards the unbanked haul, and cannot be charged twice', reason => {
    const run = newRun('smuggler', 1); run.phase = 'playing';
    const result = settleSmugglerLeg(run, course(reason, 100));
    expect(result?.success).toBe(false); expect(run.lives).toBe(2); expect(run.pilot.score).toBe(0);
    expect(run.phase).toBe('gameover'); expect(settleSmugglerLeg(run, course(reason))).toBeNull();
    retry(run); expect(run.lives).toBe(2); expect(run.stage).toBe(1);
  });
  it('awards score-earned lives once, consumes capped thresholds, and resets thresholds on continue', () => {
    const run = newRun('smuggler', 1); run.phase = 'playing'; run.lives = 2;
    const result = settleSmugglerLeg(run, course('complete', 400));
    expect(result?.extraLives).toBe(2); expect(run.lives).toBe(4); expect(run.nextLifeScore).toBe(15000);
    advance(run); run.phase = 'playing'; run.lives = 5;
    expect(settleSmugglerLeg(run, course('complete', 200))?.extraLives).toBe(0);
    expect(run.nextLifeScore).toBe(20000);
    advance(run); run.phase = 'playing'; settleSmugglerLeg(run, course('crash'));
    expect(run.nextLifeScore).toBe(20000); expect(run.lives).toBe(4);
    retry(run, true); expect(run.lives).toBe(3); expect(run.pilot.score).toBe(0); expect(run.nextLifeScore).toBe(5000);
  });
  it('saves an interrupted leg as a retry without losing a life or paying its haul', () => {
    const run = newRun('smuggler', 1); run.phase = 'playing'; run.elapsed = 12;
    const before = clone(run); const profile = freshProfile(); saveCheckpoint(profile, run);
    expect(run).toEqual(before);
    const saved = profile.checkpoints.smuggler!;
    expect(saved.phase).toBe('briefing'); expect(saved.elapsed).toBe(0); expect(saved.lives).toBe(3); expect(saved.pilot.score).toBe(0);
  });
});
