import { describe, expect, it, vi } from 'vitest';
import { newRun, pickup, loseLife, retry, saveCheckpoint, parseProfile, freshProfile, settleStage } from '../arcade';
import { EncounterDirector, Random, stageDefinition } from '../encounters';
import { encounterComplete, pirateSalvage } from './encounter-outcome';
import type { ObjectiveState } from './encounter-outcome';

const cleared = (): ObjectiveState => ({ kind: 'patrol', flightsFinished: true, hostiles: 0, rescued: false, protectedShip: null });
describe('objective requirements', () => {
  it.each(['patrol', 'armada', 'boss', 'ambush', 'defend', 'assault'] as const)('%s needs every flight and every hostile cleared', kind => {
    const state = { ...cleared(), kind };
    expect(encounterComplete(state)).toBe(true);
    state.flightsFinished = false; expect(encounterComplete(state)).toBe(false);
    state.flightsFinished = true; state.hostiles = 1; expect(encounterComplete(state)).toBe(false);
    // It does not depend on player kill count: allies can clear required enemies.
    state.hostiles = 0; state.protectedShip = { age: 100, dead: true }; expect(encounterComplete(state)).toBe(false);
  });
  it('rescue requires delivery, not merely an empty arena', () => {
    const state = cleared(); state.kind = 'rescue'; expect(encounterComplete(state)).toBe(false);
    state.rescued = true; expect(encounterComplete(state)).toBe(true);
    state.hostiles = 1; expect(encounterComplete(state)).toBe(false);
  });
  it('escort requires a surviving convoy and the full travel interval', () => {
    const state = cleared(); state.kind = 'escort'; expect(encounterComplete(state)).toBe(false);
    state.protectedShip = { age: 74.99, dead: false }; expect(encounterComplete(state)).toBe(false);
    state.protectedShip.age = 75; expect(encounterComplete(state)).toBe(true);
    state.protectedShip.dead = true; expect(encounterComplete(state)).toBe(false);
  });
  for (const mode of ['journey', 'endless', 'invaders'] as const) {
    it(`${mode} opening roster is ready on the first simulation tick`, () => {
      const director = new EncounterDirector(stageDefinition(mode, 1));
      const arrivals = director.next(1 / 60, 0);
      expect(arrivals.length).toBeGreaterThan(0);
      expect(encounterComplete({ ...cleared(), flightsFinished: director.finished, hostiles: arrivals.length })).toBe(false);
    });
  }
});
describe('guaranteed and seeded salvage', () => {
  it.each(['journey', 'endless', 'invaders'] as const)('%s first destroyed fighter guarantees a protected weapon improvement', mode => {
    const run = newRun(mode, 1), random = vi.fn(() => 'credits' as const);
    const reward = pirateSalvage(run, random);
    expect(reward).toEqual({ drop: { type: 'weaponCore', amount: 1 }, essential: true });
    expect(random).not.toHaveBeenCalled(); expect(run.kills).toBe(0);
    pickup(run, reward.drop); expect(run.tiers.pulse).toBe(2);
    expect(pirateSalvage(run, random).essential).toBe(false);
  });
  it('retains banked upgrades and their guard on resume, but rolls back both for an interrupted fight', () => {
    const run = newRun('journey', 1), profile = freshProfile(); run.phase = 'playing';
    pickup(run, pirateSalvage(run, types => types[0]).drop); saveCheckpoint(profile, run);
    const restored = parseProfile(JSON.stringify(profile), null).checkpoints.journey!;
    expect(restored.tiers.pulse).toBe(1);
    expect(pirateSalvage(restored, types => types[0]).essential).toBe(true);
    settleStage(run); saveCheckpoint(profile, run);
    const banked = parseProfile(JSON.stringify(profile), null).checkpoints.journey!;
    expect(banked.tiers.pulse).toBe(2); expect(pirateSalvage(banked, types => types[0]).essential).toBe(false);
    run.cleared = false; run.phase = 'playing';
    loseLife(run); retry(run); expect(run.tiers.pulse).toBe(1);
    expect(pirateSalvage(run, types => types[0]).essential).toBe(true);
  });
  it('uses reproducible normal loot and repair-only fourth kills in Invaders', () => {
    const run = newRun('journey', 1); run.earlyCore = true;
    const a = new Random(17), b = new Random(17);
    for (let i = 0; i < 20; i++) expect(pirateSalvage(run, types => a.pick(types))).toEqual(pirateSalvage(run, types => b.pick(types)));
    run.mode = 'invaders'; run.kills = 4; const pick = vi.fn(() => 'credits' as const);
    expect(pirateSalvage(run, pick).drop.type).toBe('shieldCell'); expect(pick).not.toHaveBeenCalled();
    run.kills = 5; expect(pirateSalvage(run, pick).drop.type).toBe('credits');
    expect(pick).toHaveBeenCalledWith(['credits', 'shieldCell', 'weaponCore']);
  });
});
