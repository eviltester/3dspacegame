import { describe, expect, it } from 'vitest';
import { advance, dock, formatStageTime, freshProfile, loseLife, newRun, parseProfile, pickup, retry, saveCheckpoint, settleStage, settleTimeBonus, STAGE_TIME_LIMIT, tickStageTime, timeBonusSeconds } from './arcade';
import type { RunPhase } from './arcade';

describe('level bonus clock', () => {
  it('starts at two minutes and shows only whole seconds for the payout', () => {
    const run = newRun('journey', 1);
    expect(run.timeRemaining).toBe(120); expect(run.timeBonus).toBeNull();
    expect(formatStageTime(run)).toBe('2:00');
    run.timeRemaining = 67.95;
    expect(formatStageTime(run)).toBe('1:07'); expect(timeBonusSeconds(run)).toBe(67);
    run.timeRemaining = 0;
    expect(formatStageTime(run)).toBe('0:00');
  });

  it('keeps counting after completion while the player collects cargo', () => {
    const run = newRun('journey', 1); run.phase = 'playing';
    tickStageTime(run, 40); expect(run.timeRemaining).toBe(80);
    settleStage(run); pickup(run, { type: 'legalCargo', amount: 1 });
    expect(run.timeBonus).toBeNull();
    tickStageTime(run, 13); expect(run.timeRemaining).toBe(67);
    const before = run.pilot.credits;
    expect(settleTimeBonus(run)).toBe(670);
    expect(run.pilot.credits).toBe(before + 670);
  });

  it.each<RunPhase>(['briefing', 'shop', 'bonusOffer', 'bonus', 'bonusResult', 'gameover', 'victory'])('does not count during %s', phase => {
    const run = newRun('journey', 1); run.phase = phase;
    tickStageTime(run, 15); expect(run.timeRemaining).toBe(STAGE_TIME_LIMIT);
  });

  it('reaches zero without failing the level or awarding negative credits', () => {
    const run = newRun('journey', 1); run.phase = 'playing';
    tickStageTime(run, 999); expect(run.timeRemaining).toBe(0);
    expect(run.phase).toBe('playing'); expect(run.lives).toBe(3);
    settleStage(run); const before = run.pilot.credits;
    expect(settleTimeBonus(run)).toBe(0); expect(run.timeBonus).toBe(0);
    expect(settleTimeBonus(run)).toBeNull(); expect(run.pilot.credits).toBe(before);
  });

  it('never pays before completion and freezes once paid at the gate', () => {
    const run = newRun('journey', 1); run.phase = 'playing';
    tickStageTime(run, 20.25);
    expect(settleTimeBonus(run)).toBeNull(); expect(run.pilot.credits).toBe(0);
    settleStage(run); expect(settleTimeBonus(run)).toBe(990);
    const remaining = run.timeRemaining, credits = run.pilot.credits;
    tickStageTime(run, 2); expect(run.timeRemaining).toBe(remaining);
    expect(settleTimeBonus(run)).toBeNull(); expect(run.pilot.credits).toBe(credits);
  });

  it('handles fixed-step roundoff and ignores invalid elapsed increments', () => {
    const run = newRun('journey', 1); run.phase = 'playing';
    for (let i = 0; i < 60; i++) tickStageTime(run, 1 / 60);
    expect(timeBonusSeconds(run)).toBe(119);
    for (const dt of [-1, Infinity, NaN]) tickStageTime(run, dt);
    expect(timeBonusSeconds(run)).toBe(119);
  });

  it('lets Endless players bank more by starting the next wave early', () => {
    const fast = newRun('endless', 1); fast.phase = 'playing'; tickStageTime(fast, 30); settleStage(fast); fast.phase = 'recovery';
    const slow = structuredClone(fast);
    tickStageTime(slow, 8);
    expect(settleTimeBonus(fast)).toBe(900); expect(settleTimeBonus(slow)).toBe(820);
    const banked = fast.pilot.credits;
    advance(fast); expect(fast.stage).toBe(2); expect(fast.timeRemaining).toBe(120); expect(fast.timeBonus).toBeNull();
    loseLife(fast); expect(fast.pilot.credits).toBe(banked);
  });

  it('resets the attempt clock on death/continue along with reward rollback', () => {
    const run = newRun('journey', 1); run.phase = 'playing'; tickStageTime(run, 50);
    pickup(run, { type: 'credits', amount: 1 });
    loseLife(run); expect(run.timeRemaining).toBe(120); expect(run.timeBonus).toBeNull(); expect(run.pilot.credits).toBe(0);
    run.timeRemaining = 40; retry(run, true);
    expect(run.timeRemaining).toBe(120); expect(run.lives).toBe(3);
  });
});

describe('time bonus persistence', () => {
  it('preserves an unpaid cleared-stage clock across repeated resumes', () => {
    const run = newRun('journey', 1); run.phase = 'playing'; tickStageTime(run, 48.5); settleStage(run); tickStageTime(run, 10);
    let profile = freshProfile(); saveCheckpoint(profile, run);
    for (let i = 0; i < 3; i++) {
      profile = parseProfile(JSON.stringify(profile), null);
      expect(profile.checkpoints.journey!.timeRemaining).toBe(61.5);
      expect(profile.checkpoints.journey!.timeBonus).toBeNull();
    }
    expect(settleTimeBonus(profile.checkpoints.journey!)).toBe(610);
  });

  it('cannot duplicate a payment when saved during the warp animation or shop', () => {
    const run = newRun('journey', 1); run.phase = 'playing'; tickStageTime(run, 37); settleStage(run); settleTimeBonus(run);
    const profile = freshProfile(); saveCheckpoint(profile, run);
    const loaded = parseProfile(JSON.stringify(profile), null).checkpoints.journey!;
    expect(loaded.timeBonus).toBe(830);
    const credits = loaded.pilot.credits;
    expect(settleTimeBonus(loaded)).toBeNull(); expect(loaded.pilot.credits).toBe(credits);
    dock(loaded); saveCheckpoint(profile, loaded);
    const shop = parseProfile(JSON.stringify(profile), null).checkpoints.journey!;
    expect(shop.timeBonus).toBe(830); expect(settleTimeBonus(shop)).toBeNull();
  });

  it('restarts unfinished checkpoint attempts without changing the live paused clock', () => {
    const run = newRun('journey', 1); run.phase = 'playing'; tickStageTime(run, 40); run.pilot.credits = 200;
    const profile = freshProfile(); saveCheckpoint(profile, run);
    expect(run.timeRemaining).toBe(80); expect(run.pilot.credits).toBe(200);
    expect(profile.checkpoints.journey!.timeRemaining).toBe(120); expect(profile.checkpoints.journey!.pilot.credits).toBe(0);
  });

  it('migrates older v2 saves without paying bonuses for gates already passed', () => {
    const profile = freshProfile(), run = newRun('journey', 1);
    run.elapsed = 37; settleStage(run); profile.checkpoints.journey = run;
    const old = JSON.parse(JSON.stringify(profile));
    delete old.checkpoints.journey.timeRemaining; delete old.checkpoints.journey.timeBonus;
    const pending = parseProfile(JSON.stringify(old), null).checkpoints.journey!;
    expect(pending.timeRemaining).toBe(83); expect(pending.timeBonus).toBeNull();
    old.checkpoints.journey.phase = 'shop';
    const completed = parseProfile(JSON.stringify(old), null).checkpoints.journey!;
    expect(completed.timeBonus).toBe(0); expect(settleTimeBonus(completed)).toBeNull();
  });

  it.each([-1, 121, '90', null])('rejects invalid remaining time %s', timeRemaining => {
    const profile = freshProfile(); profile.checkpoints.journey = newRun('journey', 1);
    const invalid = JSON.parse(JSON.stringify(profile)); invalid.checkpoints.journey.timeRemaining = timeRemaining;
    expect(parseProfile(JSON.stringify(invalid), null).checkpoints.journey).toBeUndefined();
  });
});
