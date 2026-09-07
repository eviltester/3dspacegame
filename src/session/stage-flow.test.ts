import { describe, expect, it } from 'vitest';
import { bonusFor, freshProfile, newRun, parseProfile, saveCheckpoint } from '../arcade';
import type { GameMode } from '../arcade';
import { ShotAccuracy } from '../combat/accuracy';
import { afterGate, completeEncounter, enterBonus, nextStage, resumeDestination, settleCourse } from './stage-flow';
import type { CourseOutcome } from './stage-flow';

function playing(mode: GameMode = 'journey', stage = 1) { const run = newRun(mode, 1); run.phase = 'playing'; run.stage = stage; return run; }
describe('completion destinations and payouts', () => {
  it.each(Array.from({ length: 99 }, (_, i) => i + 1))('Journey stage %i routes correctly without flying to it', stage => {
    const run = playing('journey', stage), tracker = new ShotAccuracy();
    expect(completeEncounter(run, tracker)!.route).toBe('gate'); const paid = structuredClone(run);
    expect(completeEncounter(run, tracker)).toBeNull(); expect(run).toEqual(paid);
    const expected = stage === 99 ? 'victory' : bonusFor(run) ? 'bonusOffer' : 'shop';
    expect(afterGate(run)).toBe(expected);
    expect(resumeDestination(run)).toBe(expected === 'victory' ? 'briefing' : expected);
    if (expected === 'shop') { expect(nextStage(run)!.route).toBe('briefing'); expect(run.stage).toBe(stage + 1); expect(nextStage(run)).toBeNull(); }
  });
  it.each([1, 3, 5, 10, 1000, 1001])('Attack Challenge wave %i selects a gate only for bosses', wave => {
    const run = playing('endless', wave), result = completeEncounter(run, new ShotAccuracy())!;
    expect(result.route).toBe(wave % 5 ? 'recovery' : 'gate');
    if (wave % 5) { expect(afterGate(run)).toBeNull(); expect(nextStage(run)!.timeBonus).toBe(1200); }
    else expect(afterGate(run)).toBe('bonusOffer');
  });
  it.each([1, 3, 5, 8, 1000])('Invaders wave %i settles pending misses before life awards and cannot dock', stage => {
    const run = playing('invaders', stage), tracker = new ShotAccuracy(); run.pilot.score = 20000 - (250 + stage * 50) + 4;
    tracker.begin(1, run.accuracy);
    expect(completeEncounter(run, tracker)).toEqual({ route: 'recovery', missCost: 5, extraLives: 0 });
    expect(run.pilot.score).toBe(19999); expect(run.lives).toBe(3); expect(afterGate(run)).toBeNull();
    expect(run.accuracy).toEqual({ shots: 1, hits: 0, misses: 1 });
    const profile = freshProfile(); saveCheckpoint(profile, run);
    const restored = parseProfile(JSON.stringify(profile), null).checkpoints.invaders!;
    expect(completeEncounter(restored, tracker)).toBeNull(); expect(restored.accuracy).toEqual(run.accuracy);
    expect(nextStage(restored)!.timeBonus).toBe(1200); expect(restored.accuracy).toEqual({ shots: 0, hits: 0, misses: 0 });
  });
  it('pays completion score lives exactly once and rejects advance while in a course', () => {
    const run = playing('invaders'); run.pilot.score = 19900;
    expect(completeEncounter(run, new ShotAccuracy())!.extraLives).toBe(1); expect(run.lives).toBe(4);
    expect(nextStage(run, true)).toBeNull(); expect(completeEncounter(run, new ShotAccuracy())).toBeNull(); expect(run.lives).toBe(4);
  });
  it('rejects premature completion/gates/advancement and keeps damaged resources at a normal dock', () => {
    const run = newRun('journey', 1);
    expect(completeEncounter(run, new ShotAccuracy())).toBeNull(); expect(afterGate(run)).toBeNull(); expect(nextStage(run)).toBeNull();
    run.phase = 'playing'; run.pilot.shield = 20; completeEncounter(run, new ShotAccuracy()); afterGate(run); expect(run.pilot.shield).toBe(20);
    run.stage = 99; expect(nextStage(run)!.route).toBe('victory'); expect(nextStage(run)).toBeNull();
  });
  it('ignores a stale playing phase after the reward was already settled', () => {
    const run = playing(); completeEncounter(run, new ShotAccuracy()); run.phase = 'playing';
    const paid = structuredClone(run); expect(completeEncounter(run, new ShotAccuracy())).toBeNull(); expect(run).toEqual(paid);
  });
});

describe('resume and course contracts', () => {
  it.each(['briefing', 'playing', 'shop', 'bonusResult', 'bonusOffer', 'gameover'] as const)('chooses a resume screen directly from %s', phase => {
    const run = playing(); run.phase = phase;
    expect(resumeDestination(run)).toBe(phase === 'shop' || phase === 'bonusResult' ? 'shop' : phase === 'bonusOffer' ? 'bonusOffer' : 'briefing');
    run.phase = 'gameover'; run.lives = 0; expect(resumeDestination(run)).toBe('gameover');
    run.mode = 'smuggler'; run.phase = 'cleared'; run.cleared = true; expect(resumeDestination(run)).toBe('smugglerResult');
  });
  it('starts an available offer once and refuses entry from the wrong phase or mode', () => {
    const run = playing('journey', 3); expect(enterBonus(run)).toBeNull();
    run.phase = 'bonusOffer'; expect(enterBonus(run)).toBe('asteroids'); expect(run.phase).toBe('bonus'); expect(enterBonus(run)).toBeNull();
    run.phase = 'bonusOffer'; run.mode = 'invaders'; expect(enterBonus(run)).toBeNull();
  });
  for (const kind of ['asteroids', 'canyon', 'sequence'] as const) for (const reason of ['complete', 'exit', 'crash', 'timeout', 'missedGates', 'gateMissed', 'wall'] as const) {
    it(`settles ${kind} ${reason} with optional-course isolation and Smuggler stakes`, () => {
      // Only the outcome data is required. No course construction or flying.
      const state: CourseOutcome = { kind, finished: true, reason, points: 200, health: 3, difficulty: 1 };
      const run = playing('journey', { asteroids: 3, canyon: 7, sequence: 11 }[kind]); run.phase = 'bonusOffer'; enterBonus(run);
      const main = structuredClone(run.pilot), lives = run.lives;
      const result = settleCourse(run, state, 0.5)!; expect(result.kind).toBe('bonus');
      expect(run.pilot.hull).toBe(main.hull); expect(run.pilot.shield).toBe(main.shield); expect(run.lives).toBe(lives);
      expect(run.tiers).toEqual({ pulse: 1, spread: 1, lance: 1 }); expect(run.pilot.inventory).toEqual(main.inventory);
      expect(run.pilot.score - main.score).toBe(kind === 'sequence' ? 200 : 750);
      expect(settleCourse(run, state, 0.5)).toBeNull();
      const smuggler = playing('smuggler');
      const outcome = settleCourse(smuggler, state, 0.5)!; expect(outcome.kind).toBe('smuggler');
      if (reason === 'complete') { expect(smuggler.phase).toBe('cleared'); expect(smuggler.pilot.score).toBe(6300); expect(smuggler.lives).toBe(4); }
      else { expect(smuggler.pilot.score).toBe(0); expect(smuggler.lives).toBe(2); }
      expect(settleCourse(smuggler, state, 0.5)).toBeNull();
    });
  }
  it('does not pay for unfinished courses or revive consumed offers', () => {
    const run = playing(), state: CourseOutcome = { kind: 'asteroids', finished: false, reason: null, points: 0, health: 3, difficulty: 1 };
    expect(settleCourse(run, state, 1)).toBeNull();
    state.finished = true; expect(settleCourse(run, state, 1)).toBeNull();
  });
});
