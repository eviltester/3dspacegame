import { expect, it } from 'vitest';
import { newRun, parseProfile, freshProfile, saveCheckpoint } from '../arcade';
import { CourseIntermission } from './course-intermission';
import { nextStage, resumeDestination } from './stage-flow';

it('advances one paid leg after exactly three seconds without changing score or lives', () => {
  const run = newRun('smuggler', 1); run.phase = 'cleared'; run.cleared = true; run.pilot.score = 1250;
  const timer = new CourseIntermission(); expect(timer.start(run)).toBe(true);
  expect(timer.tick(2)).toBe(false); expect(timer.remaining).toBe(1); expect(timer.start(run)).toBe(false);
  for (let i = 0; i < 59; i++) expect(timer.tick(1 / 60)).toBe(false);
  expect(timer.tick(1 / 60)).toBe(true); expect(timer.active).toBe(false);
  expect(nextStage(run)).not.toBeNull(); expect(run.stage).toBe(2); expect(run.pilot.score).toBe(1250); expect(run.lives).toBe(3);
  expect(timer.tick(100)).toBe(false); expect(nextStage(run)).toBeNull();
});
it('only starts for a completed Smuggler leg and resets cleanly', () => {
  const timer = new CourseIntermission(), run = newRun('journey', 1);
  expect(timer.start(run)).toBe(false); run.mode = 'smuggler'; expect(timer.start(run)).toBe(false);
  run.cleared = true; expect(timer.start(run)).toBe(false); run.phase = 'cleared'; expect(timer.start(run)).toBe(true);
  for (const dt of [NaN, Infinity, -1, 0]) expect(timer.tick(dt)).toBe(false);
  expect(timer.remaining).toBe(3); timer.reset(); expect(timer.active).toBe(false);
});
it('resumes an already paid checkpoint through the summary without duplicating the payout', () => {
  const run = newRun('smuggler', 1); run.cleared = true; run.phase = 'cleared'; run.pilot.score = 2345;
  const profile = freshProfile(); saveCheckpoint(profile, run);
  const saved = parseProfile(JSON.stringify(profile), null).checkpoints.smuggler!;
  expect(resumeDestination(saved)).toBe('intermission');
  const timer = new CourseIntermission(); timer.start(saved); expect(timer.tick(3)).toBe(true);
  nextStage(saved); expect(saved.pilot.score).toBe(2345); expect(saved.stage).toBe(2);
});
