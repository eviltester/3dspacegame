import { expect, it } from 'vitest';
import { PickupBeacon } from './pickup-beacon';
import { addEntity } from './encounters';
import { tunnelFixture } from './test-helpers';

it('plays a repeating triplet, not an overlapping alarm for every pickup', () => {
  const { ctx, s } = tunnelFixture(), beacon = new PickupBeacon();
  for (let i = 0; i < 10; i++) addEntity(ctx, 'pickup', i, 100, { drop: 'legalCargo' });
  const times: number[] = [];
  for (let i = 0; i < 241; i++) if (beacon.step(0.01, s)) times.push(i / 100);
  expect(times).toEqual([0, 0.21, 0.43, 1.93, 2.15, 2.37]);
});

it('goes quiet immediately when items are collected or leave the edge, then restarts for new cargo', () => {
  const { ctx, s } = tunnelFixture(), beacon = new PickupBeacon();
  const item = addEntity(ctx, 'pickup', 3, 100);
  expect(beacon.step(0.01, s)).toBe(true);
  item.hp = 0; expect(beacon.step(0.3, s)).toBe(false);
  item.hp = 1; expect(beacon.step(0.01, s)).toBe(true);
  item.depth = -1; expect(beacon.step(0.3, s)).toBe(false);
  item.depth = 100; expect(beacon.step(0.01, s)).toBe(true);
});

it('ignores crates, offscreen items, death and result screens', () => {
  const { ctx, s } = tunnelFixture(), beacon = new PickupBeacon();
  addEntity(ctx, 'crate', 0, 100); const item = addEntity(ctx, 'pickup', 0, 500);
  expect(beacon.step(0.1, s)).toBe(false); item.depth = 100;
  s.respawn = 4; expect(beacon.step(0.1, s)).toBe(false); s.respawn = 0;
  s.phase = 'salvage'; expect(beacon.step(0.1, s)).toBe(true);
  s.phase = 'collapse'; expect(beacon.step(0.1, s)).toBe(false);
  s.phase = 'result'; expect(beacon.step(0.1, s)).toBe(false);
});

it('emits the sound from simulation and does not advance its rhythm outside play', () => {
  const { ctx, sim, run } = tunnelFixture();
  addEntity(ctx, 'pickup', 3, 300); sim.step(0.01);
  expect(sim.drain()).toContainEqual({ type: 'cue', cue: 'pickupNearby' });
  run.phase = 'briefing'; for (let i = 0; i < 50; i++) sim.step(0.1);
  expect(sim.drain()).toEqual([]);
  run.phase = 'playing'; sim.step(0.1); expect(sim.drain()).toEqual([]);
  sim.step(0.1); sim.step(0.02); expect(sim.drain()).toContainEqual({ type: 'cue', cue: 'pickupNearby' });
});
