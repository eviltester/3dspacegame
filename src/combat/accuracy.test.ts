import { describe, expect, it } from 'vitest';
import { advance, freshProfile, loseLife, newRun, parseProfile, retry, saveCheckpoint, settleStage } from '../arcade';
import { ShotAccuracy, accuracyPercent, emptyAccuracy, invaderMissCost, parseAccuracy } from './accuracy';

describe('individual projectile accuracy', () => {
  it.each([[5, 100], [6, 150], [11, 200]])('Spread against %i aliens counts one hit, two misses and a %i-point cost', (aliens, penalty) => {
    const tracker = new ShotAccuracy(), stats = emptyAccuracy();
    for (let id = 1; id <= 3; id++) tracker.begin(id, stats, aliens);
    tracker.hit(2, stats);
    expect([1, 2, 3].reduce((cost, id) => cost + tracker.end(id, stats), 0)).toBe(penalty);
    expect(stats).toEqual({ shots: 3, hits: 1, misses: 2 });
    expect(accuracyPercent(stats)).toBe(33);
  });
  it('counts each piercing bolt once despite several contacts or repeated callbacks', () => {
    const tracker = new ShotAccuracy(), stats = emptyAccuracy();
    tracker.begin(1, stats, 11); tracker.begin(1, stats, 5);
    for (let hit = 0; hit < 3; hit++) tracker.hit(1, stats);
    expect(tracker.end(1, stats)).toBe(0); expect(tracker.end(1, stats)).toBe(0);
    tracker.hit(1, stats);
    expect(stats).toEqual({ shots: 1, hits: 1, misses: 0 });
    expect(accuracyPercent(stats)).toBe(100);
  });
  it('settles in-flight misses once at wave clear, without charging successful bolts', () => {
    const tracker = new ShotAccuracy(), stats = emptyAccuracy();
    [1, 2, 3].forEach(id => tracker.begin(id, stats, 5)); tracker.hit(1, stats);
    expect(tracker.finish(stats)).toBe(100); expect(tracker.finish(stats)).toBe(0);
    expect(tracker.end(2, stats)).toBe(0);
    expect(stats).toEqual({ shots: 3, hits: 1, misses: 2 });
  });
  it('ignores untracked fire and cancels pending work without charging on reset', () => {
    const tracker = new ShotAccuracy(), stats = emptyAccuracy();
    tracker.hit(9, stats); expect(tracker.end(9, stats)).toBe(0);
    expect(accuracyPercent(stats)).toBe(0);
    tracker.begin(1, stats, 18); tracker.clear(); expect(tracker.finish(stats)).toBe(0);
    expect(stats.misses).toBe(0);
  });
  it.each([[0, 50], [1, 50], [5, 50], [6, 75], [10, 75], [11, 100], [18, 100]])('a miss with %i aliens at firing costs %i points', (aliens, cost) => {
    const tracker = new ShotAccuracy(), stats = emptyAccuracy();
    expect(invaderMissCost(aliens)).toBe(cost);
    tracker.begin(1, stats, aliens);
    expect(tracker.end(1, stats)).toBe(cost); expect(tracker.end(1, stats)).toBe(0);
    expect(stats).toEqual({ shots: 1, hits: 0, misses: 1 });
  });
  it('keeps each launch-time price across changing alien counts and settles remaining bolts once', () => {
    const tracker = new ShotAccuracy(), stats = emptyAccuracy();
    tracker.begin(1, stats, 18); tracker.begin(1, stats, 1);
    tracker.begin(2, stats, 10); tracker.begin(3, stats, 5); tracker.begin(4, stats, 11);
    tracker.hit(4, stats);
    expect(tracker.end(1, stats)).toBe(100);
    expect(tracker.finish(stats)).toBe(125); expect(tracker.finish(stats)).toBe(0);
    expect(stats).toEqual({ shots: 4, hits: 1, misses: 3 });
  });
  it.each([undefined, null, {}, { shots: -1 }, { shots: 2, hits: 3, misses: 0 }, { shots: 2, hits: 1, misses: 2 }, { shots: 2.5, hits: 1, misses: 1 }, { shots: Infinity, hits: 1, misses: 1 }])('defaults invalid stored statistics: %j', value => {
    expect(parseAccuracy(value)).toEqual(emptyAccuracy());
  });
});

describe('wave accuracy checkpoints', () => {
  it('preserves a cleared result through repeated saves and resets it only on advance', () => {
    const run = newRun('invaders', 7), profile = freshProfile();
    run.phase = 'playing'; run.accuracy = { shots: 3, hits: 1, misses: 2 }; run.pilot.score = 90;
    settleStage(run); run.phase = 'recovery';
    saveCheckpoint(profile, run); saveCheckpoint(profile, run);
    const loaded = parseProfile(JSON.stringify(profile), null).checkpoints.invaders!;
    expect(loaded.accuracy).toEqual(run.accuracy); expect(loaded.pilot.score).toBe(run.pilot.score);
    advance(loaded); expect(loaded.accuracy).toEqual(emptyAccuracy());
    expect(loaded.pilot.score).toBe(run.pilot.score);
  });
  it('resets wave accuracy on retry but preserves score, including miss deductions, until Continue', () => {
    const run = newRun('invaders', 8), profile = freshProfile();
    run.checkpoint.pilot.score = 300; run.pilot.score = 290; run.accuracy = { shots: 3, hits: 1, misses: 2 }; run.phase = 'playing';
    saveCheckpoint(profile, run);
    expect(profile.checkpoints.invaders!.accuracy).toEqual(emptyAccuracy());
    expect(profile.checkpoints.invaders!.pilot.score).toBe(290);
    expect(run.accuracy.shots).toBe(3);
    loseLife(run); expect(run.pilot.score).toBe(290); expect(run.accuracy).toEqual(emptyAccuracy());
    retry(run, true); expect(run.pilot.score).toBe(0); expect(run.accuracy).toEqual(emptyAccuracy());
  });
  it('accepts a saved checkpoint without accuracy and does not invent a reward', () => {
    const profile = freshProfile(), run = newRun('invaders', 1); run.phase = 'playing'; settleStage(run);
    profile.checkpoints.invaders = run;
    const raw = JSON.stringify(profile, (key, value: unknown) => key === 'accuracy' ? undefined : value);
    const restored = parseProfile(raw, null).checkpoints.invaders!;
    expect(restored.accuracy).toEqual(emptyAccuracy()); expect(restored.pilot.score).toBe(run.pilot.score);
  });
});
