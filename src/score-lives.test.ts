import { expect, it } from 'vitest';
import { freshProfile, loseCombatLife, loseLife, newRun, parseProfile, recordRun, retry, saveCheckpoint } from './arcade';
import { GAME_MODES } from './modes';

for (const mode of GAME_MODES) {
  it.each([loseLife, loseCombatLife])(`${mode} %s accumulates score across all lives, game over and reload until Continue`, lose => {
    const run = newRun(mode, 31), profile = freshProfile();
    expect(run.pilot.score).toBe(0);
    for (let life = 1; life <= 3; life++) {
      run.phase = 'playing'; run.pilot.score += 100;
      lose(run); expect(run.pilot.score).toBe(life * 100); expect(run.lives).toBe(3 - life);
    }
    recordRun(profile, run); saveCheckpoint(profile, run);
    const saved = parseProfile(JSON.stringify(profile), null).checkpoints[mode]!;
    expect(saved.pilot.score).toBe(300); expect(saved.lives).toBe(0); expect(profile.records[mode]).toBe(300);
    retry(saved, true); expect(saved.pilot.score).toBe(0); expect(saved.checkpoint.pilot.score).toBe(0);
    saved.pilot.score = 50; lose(saved); expect(saved.pilot.score).toBe(50);
    expect(newRun(mode, 32).pilot.score).toBe(0);
  });
  it(`${mode} retry preserves score deductions instead of restoring a higher checkpoint score`, () => {
    const run = newRun(mode, 1); run.checkpoint.pilot.score = 1000; run.pilot.score = 250; run.phase = 'playing';
    const profile = freshProfile(); saveCheckpoint(profile, run);
    expect(profile.checkpoints[mode]!.pilot.score).toBe(250);
    retry(run); expect(run.pilot.score).toBe(250);
  });
}
