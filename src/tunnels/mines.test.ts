import { expect, it } from 'vitest';
import { addEntity } from './encounters';
import { detonateMine } from './mines';
import { tunnelFixture } from './test-helpers';
import { moveTraffic } from './traffic';

it('detonates once in damage range, with an explosion and no reward for hitting it', () => {
  const { ctx, s, run, combat } = tunnelFixture(); s.protection = 0;
  const mine = addEntity(ctx, 'mine', 0, 31, { grace: 0, faction: 'pirate' });
  expect(detonateMine(ctx, mine, true, combat)).toBe(true);
  expect(run.skiff.shield).toBe(60); expect(run.pilot.score).toBe(0);
  expect(ctx.events).toContainEqual({ type: 'explosion', entity: { ...mine } });
  expect(detonateMine(ctx, mine, true, combat)).toBe(false); expect(run.skiff.shield).toBe(60);
});

it('holds newly laid mines through their arming warning and only then detonates', () => {
  const { ctx, s, run, combat } = tunnelFixture(); s.protection = 0;
  const mine = addEntity(ctx, 'mine', 0, 18, { faction: 'pirate' });
  for (let i = 0; i < 8; i++) moveTraffic(ctx, 0.1, true, combat);
  expect(mine.depth).toBe(18); expect(mine.hp).toBeGreaterThan(0); expect(run.skiff.shield).toBe(100);
  moveTraffic(ctx, 0.1, true, combat); moveTraffic(ctx, 0.01, true, combat);
  expect(mine.hp).toBe(0); expect(run.skiff.shield).toBe(60);
});

it('leaves distant lanes safe and sweeps crossings, respecting open endpoints', () => {
  const { ctx, s, combat } = tunnelFixture();
  const mine = addEntity(ctx, 'mine', 4, 31, { grace: 0 });
  expect(detonateMine(ctx, mine, true, combat)).toBe(false);
  s.previousLane = 3; s.lane = 5; expect(detonateMine(ctx, mine, true, combat)).toBe(true);
  const end = addEntity(ctx, 'mine', 11.7, 20, { grace: 0 }); s.previousLane = s.lane = 0;
  expect(detonateMine(ctx, end, false, combat)).toBe(false);
  expect(detonateMine(ctx, end, true, combat)).toBe(true);
});

it('can be shot safely from a distance, while respawn shields prevent proximity damage', () => {
  const { ctx, s, run, combat } = tunnelFixture(); s.protection = 0;
  const mine = addEntity(ctx, 'mine', 0, 100, { grace: 0, hp: 20, faction: 'pirate' });
  combat.fire(); for (let i = 0; i < 3; i++) combat.step(0.1);
  expect(mine.hp).toBeLessThanOrEqual(0); expect(run.skiff.shield).toBe(100); expect(run.accuracy.hits).toBe(1);
  s.protection = 3;
  detonateMine(ctx, addEntity(ctx, 'mine', 0, 20, { grace: 0 }), true, combat);
  expect(run.skiff.shield).toBe(100);
});
