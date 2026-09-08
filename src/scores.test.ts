import { expect, it } from 'vitest';
import { freshProfile, newRun, parseProfile, recordRun, retry } from './arcade';
import { GAME_MODES } from './modes';
import { finishedScore, nameScore, parseScoreboards, scoreInitials } from './scores';

it.each(GAME_MODES)('%s names a top-ten finished run once, keeps it after reload and separates continued scores', mode => {
  const profile = freshProfile(), run = newRun(mode, 123);
  run.pilot.score = 5000; run.phase = 'gameover'; recordRun(profile, run);
  expect(nameScore(profile, run, 'aJz')).toBe(true);
  expect(finishedScore(profile, run)?.initials).toBe('AJZ');
  expect(nameScore(profile, run, 'XYZ')).toBe(false);
  recordRun(profile, run); run.pilot.score = 6000; recordRun(profile, run);
  expect(profile.scoreboards[mode]).toHaveLength(1);
  expect(finishedScore(parseProfile(JSON.stringify(profile), null), run)).toMatchObject({ score: 6000, initials: 'AJZ' });
  retry(run, true); run.pilot.score = 1000; run.phase = 'gameover'; recordRun(profile, run);
  expect(finishedScore(profile, run)?.initials).toBeUndefined();
  expect(nameScore(profile, run, 'NEW')).toBe(true);
  expect(profile.scoreboards[mode].map(entry => entry.initials)).toEqual(['AJZ', 'NEW']);
  for (const other of GAME_MODES.filter(other => other !== mode)) expect(profile.scoreboards[other]).toEqual([]);
});

it('does not offer initials during a run, for practice, zero scores or scores outside the top ten', () => {
  const profile = freshProfile(), run = newRun('tunnels', 20);
  run.phase = 'gameover'; recordRun(profile, run);
  expect(nameScore(profile, run, 'AAA')).toBe(false);
  run.pilot.score = 100; run.phase = 'playing'; recordRun(profile, run);
  expect(finishedScore(profile, run)).toBeUndefined();
  run.phase = 'gameover'; run.practice = true;
  expect(nameScore(profile, run, 'AAA')).toBe(false); run.practice = false;
  for (let i = 0; i < 10; i++) {
    const other = newRun('tunnels', i); other.pilot.score = 200 + i; recordRun(profile, other);
  }
  expect(finishedScore(profile, run)).toBeUndefined();
  expect(nameScore(profile, run, 'AAA')).toBe(false);
  run.pilot.score = 200; recordRun(profile, run);
  expect(finishedScore(profile, run)).toBeUndefined(); // An equal score does not displace the earlier tenth place.
  run.pilot.score = 201; recordRun(profile, run);
  expect(nameScore(profile, run, 'YES')).toBe(true);
  expect(profile.scoreboards.tunnels).toHaveLength(10);
});

it('offers initials after a Journey victory', () => {
  const profile = freshProfile(), run = newRun('journey', 1);
  run.stage = 99; run.phase = 'victory'; run.pilot.score = 90000; recordRun(profile, run);
  expect(nameScore(profile, run, 'WIN')).toBe(true);
});

it.each(['', 'A', 'AB', 'ABCD', '1AB', '<x>', 'A B', null, 123, {}])('rejects invalid initials %j', value => {
  expect(scoreInitials(value)).toBeUndefined();
});

it('retains old score rows without names and strips invalid stored initials without losing scores', () => {
  const entry = { id: 'old', score: 300, stage: 2, continued: false };
  const rows = parseScoreboards({ journey: [entry, { ...entry, id: 'valid', initials: 'abc' },
    { ...entry, id: 'unsafe', initials: '<img src=x>' }] }).journey;
  expect(rows).toEqual([entry, { ...entry, id: 'valid', initials: 'ABC' }, { ...entry, id: 'unsafe' }]);
});
