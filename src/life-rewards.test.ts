import { describe, expect, it } from 'vitest';
import { advance, dock, freshProfile, loseCombatLife, newRun, parseProfile, pickup, purchase, retry, saveCheckpoint } from './arcade';
import { awardScoreLives } from './life-rewards';

describe('score-based lives', () => {
  it.each(['invaders', 'smuggler'] as const)('awards a %s life at each 35,000 points, once, including multiple crossings', mode => {
    const run = newRun(mode, 1);
    expect(run.nextLifeScore).toBe(35000);
    run.pilot.score = 34999; expect(awardScoreLives(run)).toBe(0);
    run.pilot.score++; expect(awardScoreLives(run)).toBe(1); expect(run.lives).toBe(4);
    expect(awardScoreLives(run)).toBe(0); run.pilot.score = 34995; expect(awardScoreLives(run)).toBe(0);
    run.pilot.score = 105000; expect(awardScoreLives(run)).toBe(1); expect(run.nextLifeScore).toBe(140000);
    loseCombatLife(run); expect(awardScoreLives(run)).toBe(0); expect(run.lives).toBe(4);
  });
  it('preserves consumed milestones through retries and save/resume, resetting on continue', () => {
    const profile = freshProfile(), run = newRun('invaders', 2);
    run.pilot.score = 70000; awardScoreLives(run); run.phase = 'playing';
    saveCheckpoint(profile, run);
    const restored = parseProfile(JSON.stringify(profile), null).checkpoints.invaders!;
    expect(restored.nextLifeScore).toBe(105000); expect(restored.lives).toBe(5);
    retry(restored); restored.pilot.score = 70000; expect(awardScoreLives(restored)).toBe(0);
    retry(restored, true); expect(restored.nextLifeScore).toBe(35000); expect(restored.pilot.score).toBe(0);
  });
  it('does not give combat score lives in Journey or Attack Challenge', () => {
    for (const mode of ['journey', 'endless'] as const) {
      const run = newRun(mode, 1); run.pilot.score = 60000;
      expect(awardScoreLives(run)).toBe(0); expect(run.lives).toBe(3);
    }
    const smuggler = newRun('smuggler', 1); smuggler.pilot.score = 35000;
    expect(awardScoreLives(smuggler)).toBe(1); expect(smuggler.nextLifeScore).toBe(70000);
  });
  it('normalizes a saved Invaders checkpoint into its continuous recovery flow', () => {
    const profile = freshProfile(), run = newRun('invaders', 1);
    run.cleared = true; run.phase = 'shop'; run.nextLifeScore = 5000; run.pilot.score = 21000;
    profile.checkpoints.invaders = run;
    const restored = parseProfile(JSON.stringify(profile), null).checkpoints.invaders!;
    expect(restored.phase).toBe('recovery'); expect(restored.nextLifeScore).toBe(35000);
    expect(awardScoreLives(restored)).toBe(0);
  });
});

it.each(['smuggler', 'invaders'] as const)('retains %s checkpoints with smaller stored milestones without awarding on load', mode => {
  for (const [score, milestone, expected] of [[0, 5000, 35000], [9000, 10000, 35000], [36000, 40000, 70000], [34000, 75000, 105000]]) {
    const profile = freshProfile(), run = newRun(mode, 4);
    run.pilot.score = score; run.nextLifeScore = milestone; run.lives = 2; run.stage = 7;
    profile.checkpoints[mode] = run;
    const restored = parseProfile(JSON.stringify(profile), null).checkpoints[mode]!;
    expect(restored).toMatchObject({ lives: 2, stage: 7, nextLifeScore: expected, pilot: { score } });
    expect(awardScoreLives(restored)).toBe(0);
    expect(parseProfile(JSON.stringify({ ...profile, checkpoints: { [mode]: restored } }), null).checkpoints[mode]!.nextLifeScore).toBe(expected);
  }
});

describe('continuous combat lives and repairs', () => {
  it.each(['journey', 'endless', 'invaders'] as const)('%s respawn preserves the fight and equipment', mode => {
    const run = newRun(mode, 4); run.phase = 'playing';
    run.family = 'lance'; run.tiers.lance = 3; run.pilot.score = 730; run.pilot.credits = 900;
    run.pilot.hull = 0; run.pilot.shield = 0; run.pilot.maxShield = 125;
    run.accuracy = { shots: 7, hits: 5, misses: 2 }; run.kills = 5; run.elapsed = 22; run.timeRemaining = 98;
    loseCombatLife(run);
    expect(run.lives).toBe(2); expect(run.phase).toBe('playing');
    expect(run.pilot).toMatchObject({ score: 730, credits: 900, hull: 100, shield: 125 });
    expect(run.family).toBe('lance'); expect(run.tiers.lance).toBe(3);
    expect(run.accuracy).toEqual({ shots: 7, hits: 5, misses: 2 }); expect(run.elapsed).toBe(22); expect(run.kills).toBe(5); expect(run.timeRemaining).toBe(98);
    loseCombatLife(run); expect(run.lives).toBe(1);
    loseCombatLife(run); expect(run.lives).toBe(0); expect(run.phase).toBe('gameover');
  });
  it.each(['journey', 'endless', 'invaders'] as const)('%s repair cells respect mode-specific condition and capacity', mode => {
    const run = newRun(mode, 1); run.pilot.hull = 40; run.pilot.shield = 20;
    pickup(run, { type: 'shieldCell', amount: 1 });
    expect(run.pilot.hull).toBe(mode === 'invaders' ? 40 : 70); expect(run.pilot.shield).toBe(50);
    expect(run.pilot.score).toBe(15);
    pickup(run, { type: 'shieldCell', amount: 9 });
    expect(run.pilot.hull).toBe(mode === 'invaders' ? 40 : 100); expect(run.pilot.shield).toBe(100);
  });
  it('Invaders cannot dock or buy, and waves do not auto-repair the shield', () => {
    const run = newRun('invaders', 1); run.phase = 'recovery'; run.cleared = true;
    run.pilot.shield = 20; run.pilot.credits = 10000;
    dock(run); expect(run.phase).toBe('recovery');
    run.phase = 'shop'; expect(purchase(run, 'repair')).toBe(false);
    advance(run); expect(run.stage).toBe(2); expect(run.pilot.shield).toBe(20);
  });
  it('capped Invaders weapon cores award points instead of money', () => {
    const run = newRun('invaders', 1); run.tiers.pulse = 2;
    pickup(run, { type: 'weaponCore', amount: 1 });
    expect(run.pilot.score).toBe(240); expect(run.pilot.credits).toBe(0);
  });
});
