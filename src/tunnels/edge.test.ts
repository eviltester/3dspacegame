import { expect, it } from 'vitest';
import { canPursueAtEdge, EDGE_EXIT_DEPTH, tunnelEntityPoint } from './edge';
import { addEntity } from './encounters';
import { lanePoint } from './shapes';
import { moveTraffic } from './traffic';
import { tunnelFixture } from './test-helpers';

it.each(['crate', 'pickup', 'asteroid', 'pillar', 'wall', 'mine'] as const)('%s travels off the edge and is removed without becoming a pursuer', kind => {
  const { ctx, s, combat } = tunnelFixture();
  const item = addEntity(ctx, kind, 4, 1, { rim: true, grace: 0, faction: kind === 'mine' ? 'pirate' : 'neutral', drop: kind === 'pickup' ? 'legalCargo' : undefined });
  moveTraffic(ctx, 0.1, true, combat);
  expect(item.depth).toBeLessThan(0); expect(item.rim).toBe(false); expect(item.hp).toBeGreaterThan(0);
  for (let i = 0; i < 10; i++) moveTraffic(ctx, 0.1, true, combat);
  expect(item.depth).toBeLessThan(EDGE_EXIT_DEPTH); expect(item.hp).toBe(0);
  expect(s.entities.filter(e => e.rim)).toHaveLength(0);
});

it.each(['police', 'trader', 'neutral'] as const)('friendly %s passes the edge, even with a stale saved pursuit flag', faction => {
  const { ctx, combat } = tunnelFixture();
  const ship = addEntity(ctx, 'ship', 4, 19, { faction, rim: true });
  addEntity(ctx, 'ship', 0, 200, { faction: 'pirate', required: true });
  for (let i = 0; i < 20; i++) moveTraffic(ctx, 0.1, true, combat);
  expect(ship.rim).toBe(false); expect(ship.hp).toBe(0);
});

it('retains pirates and hostile police as armed edge pursuers, not neutral debris', () => {
  const { ctx, run, combat } = tunnelFixture(); run.pilot.wanted.active = true;
  const pirate = addEntity(ctx, 'ship', 2, 19, { faction: 'pirate', required: true });
  const police = addEntity(ctx, 'ship', 3, 19, { faction: 'police' });
  const mine = addEntity(ctx, 'mine', 5, 19, { faction: 'pirate' });
  moveTraffic(ctx, 0.1, true, combat);
  expect(pirate.rim).toBe(true); expect(police.rim).toBe(true); expect(police.required).toBe(false);
  expect(canPursueAtEdge(mine, true)).toBe(false);
});

it('collects cargo at the crossing but cannot collect it later once it has passed', () => {
  const { ctx, s, run, combat } = tunnelFixture();
  const collected = addEntity(ctx, 'pickup', 0, 1, { drop: 'legalCargo' });
  const missed = addEntity(ctx, 'pickup', 4, 1, { drop: 'legalCargo' });
  moveTraffic(ctx, 0.1, true, combat); expect(collected.hp).toBe(0); expect(run.pilot.inventory.legalCargo).toBe(1);
  s.lane = 4; s.previousLane = 4; moveTraffic(ctx, 0.1, true, combat);
  expect(missed.hp).toBeGreaterThan(0); expect(run.pilot.inventory.legalCargo).toBe(1);
});

it.each([1,7])('renders an outward exit beyond tunnel %i without moving the incoming lane', level => {
  const { ctx, sim } = tunnelFixture(level), item = addEntity(ctx, 'crate', 3, 20);
  expect(tunnelEntityPoint(sim.shape, item)).toEqual(lanePoint(sim.shape, 3, 20));
  item.depth = -50; const outgoing = tunnelEntityPoint(sim.shape, item), edge = lanePoint(sim.shape, 3, 0);
  expect(Math.hypot(outgoing[0], outgoing[1])).toBeCloseTo(Math.hypot(edge[0], edge[1]) + 80);
  expect(outgoing[2]).toBe(50);
});
