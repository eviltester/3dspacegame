import { expect, it } from 'vitest';
import { addEntity } from './encounters';
import { parseTunnel } from './persistence';
import { tunnelFixture } from './test-helpers';
import { moveTraffic } from './traffic';
import { laneDelta } from './shapes';

it.each([
  [1, 0, [11, 1]], [6, 0, [1, 2]], [6, 11, [10, 9]], [6, 5, [4, 6]]
] as const)('scatters fragments immediately from lane %i at level %i', (level, lane, destinations) => {
  const { ctx, s, combat } = tunnelFixture(level);
  const closed = level === 1;
  combat.damage(addEntity(ctx, 'asteroid', lane, 100), 999);
  const pieces = s.entities.filter(e => e.kind === 'asteroid' && e.hp > 0);
  expect(pieces.map(e => e.nextLane)).toEqual(destinations);
  moveTraffic(ctx, 0.1, closed, combat);
  for (const piece of pieces) {
    expect(Math.abs(laneDelta(lane, piece.lane, closed))).toBeGreaterThan(0);
    expect(piece.depth).toBe(100); expect(piece.grace).toBeCloseTo(0.8);
  }
  for (let i = 0; i < 9; i++) moveTraffic(ctx, 0.1, closed, combat);
  expect(pieces.map(e => Math.round(e.lane))).toEqual(destinations);
  expect(pieces.every(e => e.depth < 100)).toBe(true);
});

it('occasionally launches fast fragments, reproducibly, and retains their speed when saved', () => {
  const scatter = () => {
    const f = tunnelFixture(100);
    for (let i = 0; i < 20; i++) f.combat.damage(addEntity(f.ctx, 'asteroid', i % 12, 150), 999);
    return f;
  };
  const a = scatter(), b = scatter(); expect(a.s).toEqual(b.s);
  const pieces = a.s.entities.filter(e => e.fragmentSpeed !== undefined);
  expect(pieces.some(e => e.fragmentSpeed === 3)).toBe(true);
  expect(pieces.some(e => e.fragmentSpeed === 1)).toBe(true);
  expect(parseTunnel(a.s, 100)).toEqual(a.s);
  const normal = pieces.find(e => e.fragmentSpeed === 1)!, fast = pieces.find(e => e.fragmentSpeed === 3)!;
  for (const e of pieces) e.grace = 0;
  moveTraffic(a.ctx, 0.1, true, a.combat);
  expect(150 - fast.depth).toBeCloseTo((150 - normal.depth) * 3);
  const invalid = structuredClone(a.s); Object.assign(invalid.entities[1], { fragmentSpeed: 99 });
  expect(parseTunnel(invalid, 100)).toBeUndefined();
});

it('gives even point-blank fragments a full warning before they can hit', () => {
  const { ctx, s, run, combat } = tunnelFixture(1000); s.protection = 0;
  combat.damage(addEntity(ctx, 'asteroid', 0, 1), 999);
  const pieces = s.entities.filter(e => e.fragmentSpeed !== undefined);
  s.previousLane = s.lane = 1;
  for (let i = 0; i < 8; i++) moveTraffic(ctx, 0.1, true, combat);
  expect(run.skiff.shield).toBe(100); expect(pieces.every(e => e.depth === 28)).toBe(true);
  for (let i = 0; i < 5; i++) moveTraffic(ctx, 0.1, true, combat);
  expect(run.skiff.shield).toBe(70);
});
