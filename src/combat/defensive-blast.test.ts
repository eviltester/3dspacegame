import { expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { defensiveBlast } from './defensive-blast';
import { actorFixture } from '../testing/actors';
import { newRun } from '../arcade';

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
  const run = { phase, charge }, clearFire = vi.fn(), damage = vi.fn();
  expect(defensiveBlast(run, [actorFixture()], new Vector3(), clearFire, damage)).toBe(false);
  expect(run.charge).toBe(charge); expect(damage).not.toHaveBeenCalled(); expect(clearFire).not.toHaveBeenCalled();
});

it('uses player-relative range and cannot skip an enemy when a hit removes another', () => {
  const actors = [actorFixture({ id: 1 }), actorFixture({ id: 2 })];
  for (const actor of actors) actor.object.position.set(1000, 0, -100);
  const ids: number[] = [];
  defensiveBlast({ phase: 'playing', charge: 100 }, actors, new Vector3(1000, 0, 0), () => {}, actor => {
    ids.push(actor.id); actors.splice(actors.indexOf(actor), 1);
  });
  expect(ids).toEqual([1, 2]); expect(actors).toHaveLength(0);
});
