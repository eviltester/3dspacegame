import { expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { defensiveBlast } from './defensive-blast';
import { actorFixture } from '../testing/actors';
import { advance, freshProfile, loseCombatLife, newRun, parseProfile, retry, rewardInterception, rewardKill, saveCheckpoint, settleStage } from '../arcade';

it('damages nearby living pirates only, even with civilians closer than the enemies', () => {
  const run = newRun('journey', 1); run.phase = 'playing'; run.charge = 100;
  const near = actorFixture({ id: 1 }), edge = actorFixture({ id: 2 }), far = actorFixture({ id: 3 });
  edge.object.position.z = -240; far.object.position.z = -240.01;
  const actors = [actorFixture({ faction: 'police', kind: 'police' }), actorFixture({ faction: 'trader', kind: 'trader' }),
    actorFixture({ faction: 'neutral', kind: 'cargo' }), actorFixture({ dead: true }), near, edge, far];
  const damage = vi.fn(), clearFire = vi.fn();
  expect(defensiveBlast(run, actors, new Vector3(), clearFire, damage)).toBe(true);
  expect(damage.mock.calls).toEqual([[near, 85], [edge, 85]]); expect(clearFire).toHaveBeenCalledOnce();
  expect(run.charge).toBe(0); expect(run.pilot.wanted.active).toBe(false);
  expect(defensiveBlast(run, actors, new Vector3(), clearFire, damage)).toBe(false);
  expect(clearFire).toHaveBeenCalledOnce();
});

it.each([['playing', 99], ['briefing', 100], ['recovery', 100], ['cleared', 100]] as const)('rejects phase %s and charge %s without side effects', (phase, charge) => {
  const run = { ...newRun('invaders', 1), phase, charge }, clearFire = vi.fn(), damage = vi.fn();
  expect(defensiveBlast(run, [actorFixture()], new Vector3(), clearFire, damage)).toBe(false);
  expect(run.charge).toBe(charge); expect(damage).not.toHaveBeenCalled(); expect(clearFire).not.toHaveBeenCalled();
  expect(run.blastUsed).toBe(false);
});

it('uses player-relative range and cannot skip an enemy when a hit removes another', () => {
  const actors = [actorFixture({ id: 1 }), actorFixture({ id: 2 })];
  for (const actor of actors) actor.object.position.set(1000, 0, -100);
  const ids: number[] = [];
  defensiveBlast({ ...newRun('journey', 1), phase: 'playing', charge: 100 }, actors, new Vector3(1000, 0, 0), () => {}, actor => {
    ids.push(actor.id); actors.splice(actors.indexOf(actor), 1);
  });
  expect(ids).toEqual([1, 2]); expect(actors).toHaveLength(0);
});

it('Defensive Position spends its wave allowance once while kills and interceptions continue recharging', () => {
  const run = newRun('invaders', 1); run.phase = 'playing'; run.charge = 100;
  const damage = vi.fn(), clear = vi.fn(), actors = [actorFixture()];
  expect(defensiveBlast(run, actors, new Vector3(), clear, damage)).toBe(true);
  expect(run.blastUsed).toBe(true); expect(run.charge).toBe(0);
  rewardKill(run); expect(run.charge).toBe(5);
  for (let i = 0; i < 10; i++) rewardInterception(run);
  expect(run.charge).toBe(100);
  for (let i = 0; i < 3; i++) expect(defensiveBlast(run, actors, new Vector3(), clear, damage)).toBe(false);
  expect(run.charge).toBe(100); expect(damage).toHaveBeenCalledOnce(); expect(clear).toHaveBeenCalledOnce();
  advance(run); expect(run.blastUsed).toBe(true); // An uncleared wave cannot reset it.
  settleStage(run); advance(run); run.phase = 'playing';
  expect(run.stage).toBe(2); expect(run.blastUsed).toBe(false); expect(run.charge).toBe(100);
  expect(defensiveBlast(run, actors, new Vector3(), clear, damage)).toBe(true);
});

it('marks Defensive Position usage before damage callbacks can recharge or attempt a second blast', () => {
  const run = newRun('invaders', 1); run.phase = 'playing'; run.charge = 100;
  const clear = vi.fn(), repeatedDamage = vi.fn();
  defensiveBlast(run, [actorFixture()], new Vector3(), clear, () => {
    for (let i = 0; i < 10; i++) rewardInterception(run);
    expect(defensiveBlast(run, [actorFixture()], new Vector3(), clear, repeatedDamage)).toBe(false);
  });
  expect(clear).toHaveBeenCalledOnce(); expect(repeatedDamage).not.toHaveBeenCalled();
});

it.each(['journey', 'endless'] as const)('%s may blast again after recharging', mode => {
  const run = newRun(mode, 1); run.phase = 'playing';
  for (let i = 0; i < 3; i++) {
    run.charge = 100;
    expect(defensiveBlast(run, [], new Vector3(), vi.fn(), vi.fn())).toBe(true);
    expect(run.blastUsed).toBe(false);
  }
});

it('life loss and ordinary retries preserve the allowance; a game-over continue starts a fresh attempt', () => {
  const run = newRun('invaders', 1); run.phase = 'playing'; run.charge = 100;
  defensiveBlast(run, [], new Vector3(), vi.fn(), vi.fn());
  loseCombatLife(run); expect(run.lives).toBe(2); expect(run.blastUsed).toBe(true);
  retry(run); expect(run.blastUsed).toBe(true);
  run.lives = 1; loseCombatLife(run); expect(run.phase).toBe('gameover'); expect(run.blastUsed).toBe(true);
  retry(run, true); expect(run.lives).toBe(3); expect(run.blastUsed).toBe(false);
});

it.each(['playing', 'briefing', 'recovery', 'gameover'] as const)('saving and resuming %s cannot restore a spent blast', phase => {
  let run = newRun('invaders', 1); run.phase = 'playing'; run.charge = 100;
  defensiveBlast(run, [], new Vector3(), vi.fn(), vi.fn());
  if (phase === 'recovery') settleStage(run);
  run.phase = phase;
  for (let i = 0; i < 3; i++) {
    const profile = freshProfile(); saveCheckpoint(profile, run);
    run = parseProfile(JSON.stringify(profile), null).checkpoints.invaders!;
    expect(run.blastUsed).toBe(true);
  }
  run.phase = 'playing'; run.charge = 100;
  expect(defensiveBlast(run, [], new Vector3(), vi.fn(), vi.fn())).toBe(false);
});

it('accepts older saves without a blast flag and rejects invalid flag values', () => {
  const profile = freshProfile(); saveCheckpoint(profile, newRun('invaders', 1));
  const old = JSON.stringify(profile, (key, value: unknown) => key === 'blastUsed' ? undefined : value);
  expect(parseProfile(old, null).checkpoints.invaders?.blastUsed).toBe(false);
  for (const invalid of [null, 0, 'false', {}]) {
    const raw = JSON.stringify(profile, (key, value: unknown) => key === 'blastUsed' ? invalid : value);
    expect(parseProfile(raw, null).checkpoints.invaders).toBeUndefined();
  }
});
