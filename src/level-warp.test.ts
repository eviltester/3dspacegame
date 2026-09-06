import { describe, expect, it } from 'vitest';
import { advance, bonusFor, clone, dock, freshProfile, loseLife, newRun, parseProfile, recordRun, retry, saveCheckpoint, settleBonus, settleStage, settleTimeBonus } from './arcade';
import { createWarpRun, LevelWarpCode, WARP_BONUSES } from './level-warp';

const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'KeyB', 'KeyA'];

describe('title-screen warp code', () => {
  it('unlocks only after the exact complete sequence', () => {
    const input = new LevelWarpCode();
    for (const key of code.slice(0, -1)) expect(input.press(key, true)).toBe(false);
    expect(input.press('KeyA', true)).toBe(true);
    expect(input.press('KeyA', true)).toBe(false);
  });
  it('recovers from incorrect input and overlapping Up presses', () => {
    const input = new LevelWarpCode();
    for (const key of [...code.slice(0, 4), 'KeyA', 'KeyB']) expect(input.press(key, true)).toBe(false);
    input.press('ArrowUp', true);
    expect(code.map(key => input.press(key, true))).toEqual([false, false, false, false, false, true]);
  });
  it('does not treat a held key as two separate presses', () => {
    const input = new LevelWarpCode();
    input.press('ArrowUp', true);
    expect(input.press('ArrowUp', true, true)).toBe(false);
    for (const key of code.slice(2)) expect(input.press(key, true)).toBe(false);
    expect(code.map(key => input.press(key, true)).at(-1)).toBe(true);
  });
  it('cannot unlock outside the title or bridge different screens', () => {
    const input = new LevelWarpCode();
    for (const key of code) expect(input.press(key, false)).toBe(false);
    for (const key of code.slice(0, 4)) input.press(key, true);
    input.reset();
    for (const key of code.slice(4)) expect(input.press(key, true)).toBe(false);
    input.press('ArrowUp', true); input.press('ArrowUp', false);
    for (const key of code.slice(2)) expect(input.press(key, true)).toBe(false);
  });
});

describe('level-warp destinations', () => {
  it.each(Array.from({ length: 99 }, (_, index) => index + 1))('starts Journey stage %s as a clean test flight', stage => {
    const run = createWarpRun('journey', stage, 'spread');
    expect(run.stage).toBe(stage); expect(run.mode).toBe('journey'); expect(run.practice).toBe(true);
    expect(run.phase).toBe('briefing'); expect(run.cleared).toBe(false);
    expect(run.family).toBe('spread'); expect(run.tiers.spread).toBe(1);
    expect(run.lives).toBe(3); expect(run.timeRemaining).toBe(120); expect(run.timeBonus).toBeNull();
    expect(run.pilot.wanted.active).toBe(false);
    expect(run).toEqual(createWarpRun('journey', stage, 'spread'));
  });
  it.each([1, 3, 5, 17, 100])('supports Endless wave %s', wave => {
    const run = createWarpRun('endless', wave, 'pulse');
    expect(run.stage).toBe(wave); expect(run.mode).toBe('endless'); expect(run.practice).toBe(true);
  });
  it.each(Object.entries(WARP_BONUSES))('offers %s directly without completing stage %s', (kind, stage) => {
    const run = createWarpRun('journey', stage, 'pulse', true);
    expect(bonusFor(run)).toBe(kind); expect(run.phase).toBe('bonusOffer');
    expect(run.cleared).toBe(true); expect(run.bonusStatus).toBe('available');
    expect(run.pilot.credits).toBe(0); expect(run.pilot.score).toBe(0);
    expect(run.timeBonus).toBe(0); expect(settleTimeBonus(run)).toBeNull();
  });
  it.each([0, -1, 100, 1.5, NaN, Infinity])('rejects invalid Journey stage %s', stage => {
    expect(() => createWarpRun('journey', stage, 'pulse')).toThrow(RangeError);
  });
  it('rejects invalid bonus destinations', () => {
    expect(() => createWarpRun('journey', 4, 'pulse', true)).toThrow(RangeError);
    expect(() => createWarpRun('endless', 5, 'pulse', true)).toThrow(RangeError);
  });
});

describe('test-flight save isolation', () => {
  it('preserves both checkpoints, records and unlocks across every practice lifecycle', () => {
    const profile = freshProfile();
    for (const mode of ['journey', 'endless'] as const) {
      const normal = newRun(mode, 55); normal.pilot.score = 120;
      saveCheckpoint(profile, normal); recordRun(profile, normal);
    }
    const before = clone(profile), run = createWarpRun('journey', 11, 'lance');
    const checkSave = () => { saveCheckpoint(profile, run); recordRun(profile, run); expect(profile).toEqual(before); };
    run.pilot.score = 90000; checkSave();
    settleStage(run); settleTimeBonus(run); checkSave();
    run.bonusStatus = 'entered'; settleBonus(run, 1); dock(run); checkSave();
    advance(run); checkSave(); expect(run.practice).toBe(true);
    loseLife(run); retry(run, true); checkSave(); expect(run.practice).toBe(true);
  });
  it('normal play still saves after a test flight', () => {
    const profile = freshProfile();
    saveCheckpoint(profile, createWarpRun('journey', 12, 'pulse'));
    expect(profile.checkpoints).toEqual({});
    const run = newRun('journey', 12); run.pilot.score = 250;
    saveCheckpoint(profile, run); recordRun(profile, run);
    expect(profile.checkpoints.journey?.stage).toBe(1); expect(profile.records.journey).toBe(250);
  });
  it('does not import a test flight as a resumable normal checkpoint', () => {
    const profile = freshProfile(); profile.checkpoints.journey = createWarpRun('journey', 12, 'pulse');
    expect(parseProfile(JSON.stringify(profile), null).checkpoints).toEqual({});
  });
});
