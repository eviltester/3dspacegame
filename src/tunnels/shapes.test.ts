import { describe, expect, it } from 'vitest';
import { laneDelta, lanePoint, trackPoint, tunnelColor, tunnelShape, TUNNEL_SHAPES, wrapLane } from './shapes';
import { laneSweep } from './collision';
import { safeObstacle, addEntity, random, spawnAssault, tunnelEncounter } from './encounters';
import { tunnelFixture } from './test-helpers';
import { movePlayer } from './traffic';

describe('tunnel geometry and lane movement', () => {
  it('cycles ten distinct contours with five closed and five open shapes', () => {
    expect(TUNNEL_SHAPES).toHaveLength(10); expect(TUNNEL_SHAPES.filter(s => s.closed)).toHaveLength(5);
    for (let n = 1; n <= 10; n++) { expect(tunnelShape(n + 10)).toBe(tunnelShape(n)); expect(tunnelColor(n + 10)).not.toBe(tunnelColor(n)); }
  });
  it.each(TUNNEL_SHAPES)('$name has finite, connected, distinct lanes', shape => {
    const centers = Array.from({ length: 12 }, (_, i) => lanePoint(shape, i, 0));
    expect(new Set(centers.map(p => p.join(','))).size).toBe(12);
    for (const center of centers) expect(center.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < 12; i++) expect(lanePoint(shape, i, 420)[0]).toBeCloseTo(centers[i][0] * 0.5);
    expect(trackPoint(shape, -1)).toEqual(shape.points[0]);
    const end = shape.closed ? shape.points[0] : shape.points.at(-1)!;
    expect(trackPoint(shape, 2)[0]).toBeCloseTo(end[0]); expect(trackPoint(shape, 2)[1]).toBeCloseTo(end[1]);
  });
  it('wraps only closed tracks and interpolates continuously through their seam', () => {
    expect(wrapLane(-1, true)).toBe(11); expect(wrapLane(12, true)).toBe(0);
    expect(wrapLane(-1, false)).toBe(0); expect(wrapLane(12, false)).toBe(11);
    expect(laneDelta(11, 0, true)).toBe(1); expect(laneDelta(11, 0, false)).toBe(-11);
    const a = lanePoint(tunnelShape(1), 11.999, 0), b = lanePoint(tunnelShape(1), 0.001, 0);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1);
  });
  it('caps travel speed and ignores a nonexistent lane at an open end', () => {
    const { ctx, s } = tunnelFixture();
    movePlayer(ctx, -45, 0.07, true); expect(s.lane).toBeCloseTo(11.5);
    movePlayer(ctx, 0, 0.07, true); expect(s.lane).toBe(11);
    s.lane = 0; s.desiredLane = 0; movePlayer(ctx, -900, 0.1, false); expect(s.lane).toBe(0);
  });
  it('sweeps fast shots and lane switches, including the closed seam', () => {
    expect(laneSweep(0,0,0,100,0,0,80,20,false)).not.toBeNull();
    expect(laneSweep(11,0,0,0,0,0,0,0,true)).not.toBeNull();
    expect(laneSweep(11,11,0,100,0,0,50,50,false)).toBeNull();
    expect(laneSweep(0,0,0,0,0,0,50,50,false)).toBeNull();
    expect(laneSweep(0,0,0,10,0,0,50,60,false)).toBeNull();
  });
});
describe('seeded assault generation', () => {
  it.each([1,10,11,100,1000])('level %i stays finite and respects hostile limits', level => {
    const { ctx, s } = tunnelFixture(level), d = tunnelEncounter(level);
    let spawned = 0;
    for (let i = 0; i < 4000 && s.group < d.groups; i++) {
      spawnAssault(ctx, 0.1, tunnelShape(level).closed);
      expect(s.entities.filter(e => e.faction === 'pirate').length).toBeLessThanOrEqual(18);
      spawned += s.entities.filter(e => e.required).length;
      s.entities = [];
    }
    expect(s.group).toBe(d.groups); expect(spawned).toBe(d.groups * d.count + (d.boss ? 2 : 0));
    expect(d.shotSpeed).toBeLessThanOrEqual(1.35);
  });
  it('continues adding pressure beyond the speed cap', () => {
    expect(tunnelEncounter(1000).speed).toBe(2.5);
    expect(tunnelEncounter(10000).groups).toBeGreaterThan(tunnelEncounter(1000).groups);
  });
  it('keeps loot draws separate from encounter randomness', () => {
    const a = tunnelFixture(), b = tunnelFixture();
    for (let i = 0; i < 20; i++) random(a.s, true);
    expect(random(a.s)).toBe(random(b.s));
    spawnAssault(a.ctx, 1, true); spawnAssault(b.ctx, 1, true);
    expect(a.s.entities).toEqual(b.s.entities);
  });
  it('defers a barrier when no lane can be reached safely', () => {
    const { ctx } = tunnelFixture();
    expect(safeObstacle(ctx, 0, 0.95, false)).toBe(false);
    expect(safeObstacle(ctx, 0, 2, false)).toBe(true);
    for (let lane = 1; lane < 12; lane++) addEntity(ctx, 'wall', lane, 10);
    expect(safeObstacle(ctx, 0, 10, true)).toBe(false);
  });
  it('does not count a free lane beyond two blocking neighbours as an escape', () => {
    const { ctx } = tunnelFixture();
    addEntity(ctx, 'wall', 1, 300); addEntity(ctx, 'pillar', 11, 350);
    expect(safeObstacle(ctx, 0, 10, true)).toBe(false);
  });
});
