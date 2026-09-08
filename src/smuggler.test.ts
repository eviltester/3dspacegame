import { describe, expect, it } from 'vitest';
import { advance, clone, freshProfile, newRun, parseProfile, retry, saveCheckpoint } from './arcade';
import type { BonusRunState } from './bonus';
import { settleSmugglerLeg, smugglerCheckpoint, smugglerFlightPoints, smugglerFlightScore, smugglerLeg } from './smuggler';
import { parseSmugglerFlight } from './smuggler-rewards';

const course = (reason: BonusRunState['reason'] = 'complete', points = 40): BonusRunState => ({ kind: 'asteroids', family: 'pulse', elapsed: 60, duration: 60, remaining: 0,
  health: 1, shield: 0, damage: 0, haul: 0, charge: 100, points, difficulty: 1, targetCount: 16, shotsFired: 1, nextMarker: 1,
  finished: true, reason, notice: '', fractures: 0, enemyShots: 0, flight: { ...parseSmugglerFlight(), shots: 1, crashes: 1 } });
const playing = () => { const run = newRun('smuggler', 1); run.phase = 'playing'; return run; };
const roundtrip = (run: ReturnType<typeof playing>) => {
  const profile = freshProfile(); saveCheckpoint(profile, run); return parseProfile(JSON.stringify(profile), null).checkpoints.smuggler!;
};

describe('Smuggler settlement and checkpoint safety', () => {
  it.each(['asteroids', 'canyon'] as const)('%s carries one craft, shields, damage and flight evidence through resume', kind => {
    const run = playing(), state = { ...course(), kind, shield: 40, damage: 60 };
    Object.assign(state.flight, { elapsed: 17.5, bulletHits: 1, shots: 5, gatesMissed: 2 });
    const saved = roundtrip(smugglerCheckpoint(run, state));
    expect(saved.skiff).toEqual({ health: 1, shield: 40, damage: 60 });
    expect(saved.smugglerFlight).toEqual(state.flight);
    expect(run.skiff).toEqual({ health: 1, shield: 100, damage: 0 }); expect(run.smugglerFlight).toBeNull();
    settleSmugglerLeg(run, state); const paid = roundtrip(run); advance(paid);
    expect(paid.skiff).toEqual(saved.skiff); expect(paid.smugglerFlight).toBeNull(); expect(paid.smugglerResult).toBeNull();
    paid.phase = 'playing'; settleSmugglerLeg(paid, { ...state, reason: 'crash' });
    expect(paid.skiff).toEqual({ health: 1, shield: 100, damage: 0 });
    paid.skiff.shield = 5; paid.smugglerFlight = state.flight; retry(paid, true);
    expect(paid.skiff.shield).toBe(100); expect(paid.smugglerFlight).toBeNull(); expect(paid.pilot.score).toBe(0);
  });
  it('normalizes three-point skiffs to one craft and accepts missing result/audit data', () => {
    const run = playing(); run.skiff.health = 3;
    const profile = freshProfile(); saveCheckpoint(profile, run);
    const data = JSON.parse(JSON.stringify(profile)) as { checkpoints: { smuggler: { skiff?: unknown; smugglerFlight?: unknown; smugglerResult?: unknown } } };
    delete data.checkpoints.smuggler.smugglerFlight; delete data.checkpoints.smuggler.smugglerResult;
    expect(parseProfile(JSON.stringify(data), null).checkpoints.smuggler).toMatchObject({ skiff: { health: 1 }, smugglerResult: null, smugglerFlight: null });
    delete data.checkpoints.smuggler.skiff;
    expect(parseProfile(JSON.stringify(data), null).checkpoints.smuggler!.skiff).toEqual({ health: 1, shield: 100, damage: 0 });
  });
  it.each(['crash', 'wall', 'timeout', 'exit'] as const)('%s spends exactly one life, retaining flight points but not undelivered haul', reason => {
    const run = playing(); const state = { ...course(reason, 200), kind: 'canyon' as const, haul: 5 };
    expect(settleSmugglerLeg(run, state)).toEqual({ success: false, score: 200, extraLives: 0 });
    expect(run).toMatchObject({ lives: 2, phase: 'gameover', stageHaul: null, smugglerResult: null, pilot: { score: 200 } });
    expect(settleSmugglerLeg(run, state)).toBeNull(); retry(run);
    expect(run).toMatchObject({ stage: 1, lives: 2, pilot: { score: 200 } });
  });
  it.each(['asteroids', 'canyon'] as const)('%s missed exit advances, loses cargo and pays both penalties exactly once', kind => {
    const run = playing(); run.pilot.score = 10000;
    const state = { ...course('gateMissed', 200), kind, haul: 5 };
    const flightPoints = kind === 'canyon' ? 200 : 5000;
    expect(settleSmugglerLeg(run, state)?.success).toBe(true);
    expect(run.lives).toBeGreaterThanOrEqual(3); expect(run.pilot.score).toBe(10000 + flightPoints - 4000);
    expect(run.smugglerResult).toMatchObject({ haul: 5, haulPoints: 0, awards: { missedGate: -2000, lostCargo: -2000, cleanFinish: 0, boostFinish: 0 } });
    const saved = roundtrip(run); expect(saved.smugglerResult).toEqual(run.smugglerResult);
    expect(settleSmugglerLeg(saved, state)).toBeNull(); advance(saved); expect(saved.stage).toBe(2);
  });
  it('banks a complete reward breakdown once and preserves it on the paid checkpoint', () => {
    const run = playing(), state = { ...course('complete', 200), kind: 'canyon' as const, haul: 3, remaining: 12.99 };
    state.flight = { ...parseSmugglerFlight(), enemies: true, gatesPassed: 18, topBoost: true };
    // Flight 200 + haul 225 + delivery 1100 + time 6000 + six skill bonuses 25000.
    expect(settleSmugglerLeg(run, state)?.score).toBe(32525);
    expect(run.lives).toBe(3); expect(run.nextLifeScore).toBe(35000);
    expect(run.stageHaul).toBe(3); const saved = roundtrip(run);
    expect(saved.smugglerResult).toEqual(run.smugglerResult); expect(saved.stageReward).toBe(32525);
    expect(settleSmugglerLeg(saved, state)).toBeNull(); advance(saved);
    expect(saved.checkpoint.pilot.score).toBe(32525); expect(saved.stageHaul).toBeNull();
  });
  it('keeps a negative paid result resumable and clamps only the total score at zero', () => {
    const run = playing(); run.pilot.score = 5000;
    settleSmugglerLeg(run, { ...course('gateMissed', -2000), kind: 'canyon' });
    expect(run.stageReward).toBe(-5000); expect(roundtrip(run).pilot.score).toBe(0);
  });
  it('does not pay an unfinished or inactive flight', () => {
    const run = playing(), state = course(); state.finished = false;
    expect(settleSmugglerLeg(run, state)).toBeNull(); state.finished = true; run.mode = 'journey';
    expect(settleSmugglerLeg(run, state)).toBeNull(); run.mode = 'smuggler'; run.phase = 'briefing';
    expect(settleSmugglerLeg(run, state)).toBeNull();
  });
  it('retains points across lives but resets score and life thresholds on continue', () => {
    const run = playing(); run.pilot.score = 34900; run.lives = 1;
    const state = { ...course('crash', 200), kind: 'canyon' as const };
    expect(settleSmugglerLeg(run, state)).toEqual({ score: 200, extraLives: 1, success: false });
    expect(run.lives).toBe(1); expect(run.nextLifeScore).toBe(70000);
    retry(run); run.phase = 'playing'; settleSmugglerLeg(run, state);
    expect(run.lives).toBe(0); expect(run.pilot.score).toBe(35300);
    retry(run, true); expect(run).toMatchObject({ lives: 3, nextLifeScore: 35000, pilot: { score: 0 } });
  });
  it.each([50, 100, 200, -200, -600])('canyon %i points have face value in live, saved and crashed scores', points => {
    const run = playing(); run.pilot.score = 1000; const state = { ...course('crash', points), kind: 'canyon' as const };
    expect(smugglerFlightPoints(state)).toBe(points); expect(smugglerFlightScore(1000, state)).toBe(1000 + points);
    expect(roundtrip(smugglerCheckpoint(run, state)).pilot.score).toBe(1000 + points);
    settleSmugglerLeg(run, state); expect(run.pilot.score).toBe(1000 + points);
  });
  it('checkpoints are clones and only bank an active Smuggler flight', () => {
    const run = playing(), before = clone(run); roundtrip(run); expect(run).toEqual(before);
    expect(smugglerCheckpoint(run)).toBe(run); run.mode = 'journey'; expect(smugglerCheckpoint(run, course())).toBe(run);
    run.mode = 'smuggler'; run.phase = 'briefing'; expect(smugglerCheckpoint(run, course())).toBe(run);
  });
  it('alternates belts and canyons and increases difficulty for every pair', () => {
    for (let leg = 1; leg <= 40; leg++) expect(smugglerLeg(leg)).toEqual({ kind: leg % 2 ? 'asteroids' : 'canyon', difficulty: Math.min(8, Math.ceil(leg / 2)) });
  });
});
