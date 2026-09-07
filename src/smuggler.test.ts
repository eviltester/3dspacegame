import { describe, expect, it } from 'vitest';
import { advance, clone, freshProfile, newRun, parseProfile, retry, saveCheckpoint } from './arcade';
import type { BonusRunState } from './bonus';
import { settleSmugglerLeg, smugglerCheckpoint, smugglerFlightPoints, smugglerFlightScore, smugglerLeg } from './smuggler';

const course = (reason: BonusRunState['reason'] = 'complete', points = 40): BonusRunState => ({ kind: 'asteroids', family: 'pulse', elapsed: 60, duration: 60, remaining: 0,
  health: 3, shield: 0, haul: 0, charge: 100, points, difficulty: 1, targetCount: 16, shotsFired: 0, nextMarker: 1, finished: true, reason, notice: '', fractures: 0, enemyShots: 0 });

describe('Smuggler Run', () => {
  it.each(['crash', 'wall', 'timeout', 'exit'] as const)('undelivered haul does not become score after %s', reason => {
    const run = newRun('smuggler', 1); run.phase = 'playing';
    const state = { ...course(reason, 200), kind: 'canyon' as const, haul: 5 };
    expect(smugglerFlightScore(run.pilot.score, state)).toBe(200);
    expect(settleSmugglerLeg(run, state)?.score).toBe(200); expect(run.stageHaul).toBeNull();
  });
  it('paid haul survives resume; advancing clears its summary and older saves default to no breakdown', () => {
    const run = newRun('smuggler', 1); run.phase = 'playing';
    settleSmugglerLeg(run, { ...course('complete', -2000), kind: 'canyon', haul: 3 });
    expect(run.stageReward).toBe(0); expect(run.stageHaul).toBe(3);
    const profile = freshProfile(); saveCheckpoint(profile, run);
    const saved = parseProfile(JSON.stringify(profile), null).checkpoints.smuggler!;
    expect(saved.stageHaul).toBe(3); advance(saved); expect(saved.stageHaul).toBeNull();
    const old = JSON.parse(JSON.stringify(profile)) as { checkpoints: { smuggler: { stageHaul?: unknown } } }; delete old.checkpoints.smuggler.stageHaul;
    expect(parseProfile(JSON.stringify(old), null).checkpoints.smuggler!.stageHaul).toBeNull();
    for (const invalid of [-1, 1.5, '3']) {
      old.checkpoints.smuggler.stageHaul = invalid;
      expect(parseProfile(JSON.stringify(old), null).checkpoints.smuggler).toBeUndefined();
    }
  });
  it('a negative net leg score remains a valid resumable paid result', () => {
    const run = newRun('smuggler', 1); run.phase = 'playing'; run.pilot.score = 5000;
    settleSmugglerLeg(run, { ...course('complete', -2000), kind: 'canyon', haul: 1 });
    expect(run.stageReward).toBe(-625); const profile = freshProfile(); saveCheckpoint(profile, run);
    expect(parseProfile(JSON.stringify(profile), null).checkpoints.smuggler!.pilot.score).toBe(4375);
  });
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
  it.each(['crash', 'gateMissed', 'wall', 'timeout', 'exit'] as const)('%s costs one life, keeps flight points, and cannot settle twice', reason => {
    const run = newRun('smuggler', 1); run.phase = 'playing';
    const result = settleSmugglerLeg(run, course(reason, 100));
    expect(result?.success).toBe(false); expect(run.lives).toBe(2); expect(run.pilot.score).toBe(2500);
    expect(run.phase).toBe('gameover'); expect(settleSmugglerLeg(run, course(reason))).toBeNull();
    retry(run); expect(run.lives).toBe(2); expect(run.stage).toBe(1);
    expect(run.pilot.score).toBe(2500);
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
  it('saves an interrupted leg as a retry without losing a life', () => {
    const run = newRun('smuggler', 1); run.phase = 'playing'; run.elapsed = 12;
    const before = clone(run); const profile = freshProfile(); saveCheckpoint(profile, run);
    expect(run).toEqual(before);
    const saved = profile.checkpoints.smuggler!;
    expect(saved.phase).toBe('briefing'); expect(saved.elapsed).toBe(0); expect(saved.lives).toBe(3); expect(saved.pilot.score).toBe(0);
  });
  it.each([50, 100, 200, -200, -600])('canyon %i points are displayed, saved and retained on death at face value', points => {
    const run = newRun('smuggler', 1); run.phase = 'playing'; run.pilot.score = 1000;
    const state = { ...course('crash', points), kind: 'canyon' as const };
    expect(smugglerFlightPoints(state)).toBe(points); expect(smugglerFlightScore(run.pilot.score, state)).toBe(1000 + points);
    const before = clone(run), profile = freshProfile();
    for (let i = 0; i < 2; i++) saveCheckpoint(profile, smugglerCheckpoint(run, state));
    expect(run).toEqual(before);
    const saved = parseProfile(JSON.stringify(profile), null).checkpoints.smuggler!;
    expect(saved.pilot.score).toBe(1000 + points); expect(saved.lives).toBe(3);
    expect(settleSmugglerLeg(run, state)).toEqual({ score: points, success: false, extraLives: 0 });
    expect(run.pilot.score).toBe(1000 + points); expect(run.lives).toBe(2);
    retry(run); expect(run.pilot.score).toBe(1000 + points);
  });
  it('deducts canyon penalties once, clamps the score at zero and never awards a delivery for a crash', () => {
    const run = newRun('smuggler', 1); run.phase = 'playing'; run.pilot.score = 100;
    const state = { ...course('crash', -400), kind: 'canyon' as const };
    expect(smugglerFlightScore(100, state)).toBe(0);
    expect(settleSmugglerLeg(run, state)).toEqual({ score: -100, extraLives: 0, success: false });
    expect(run.pilot.score).toBe(0); expect(settleSmugglerLeg(run, state)).toBeNull();
  });
  it('pays a canyon flight and delivery exactly once, including after a saved result', () => {
    const run = newRun('smuggler', 1); run.phase = 'playing';
    const state = { ...course('complete', 200), kind: 'canyon' as const };
    expect(settleSmugglerLeg(run, state)?.score).toBe(1500);
    expect(smugglerCheckpoint(run, state)).toBe(run);
    const profile = freshProfile(); saveCheckpoint(profile, run);
    const saved = parseProfile(JSON.stringify(profile), null).checkpoints.smuggler!;
    expect(settleSmugglerLeg(saved, state)).toBeNull(); expect(saved.pilot.score).toBe(1500);
  });
  it('retained flight points can earn one life even when the craft crashes', () => {
    const run = newRun('smuggler', 1); run.phase = 'playing'; run.pilot.score = 4900; run.lives = 1;
    const state = { ...course('crash', 200), kind: 'canyon' as const };
    expect(settleSmugglerLeg(run, state)).toEqual({ score: 200, extraLives: 1, success: false });
    expect(run.lives).toBe(1); expect(run.nextLifeScore).toBe(10000);
    retry(run); run.phase = 'playing'; settleSmugglerLeg(run, state);
    expect(run.lives).toBe(0); expect(run.pilot.score).toBe(5300); expect(run.nextLifeScore).toBe(10000);
  });
  it('does not invent course points without an active Smuggler flight', () => {
    const run = newRun('journey', 1); expect(smugglerCheckpoint(run, course())).toBe(run);
    run.mode = 'smuggler'; expect(smugglerCheckpoint(run, course())).toBe(run);
    run.phase = 'playing'; expect(smugglerCheckpoint(run)).toBe(run);
  });
});
