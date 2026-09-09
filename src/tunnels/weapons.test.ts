import { describe, expect, it } from 'vitest';
import { FAMILIES } from '../arcade';
import { weaponSpec } from '../weapons';
import { TunnelSimulation } from './simulation';
import { advanceTunnel, tunnelFixture } from './test-helpers';

describe('tunnel weapon pacing', () => {
  for (const tier of [1, 2, 3]) {
    it.each([['pulse', 0.22], ['spread', 0.65], ['lance', 1]] as const)(
      `%s tier ${tier} uses its tunnel cooldown without changing its bolts`, (family, delay) => {
        const spec = weaponSpec(family, tier, 'tunnels');
        const normal = weaponSpec(family, tier);
        expect(spec).toEqual({ ...normal, cooldown: delay * (1 - (tier - 1) * 0.08) });
        if (family === 'spread') expect(spec.cooldown).toBe(weaponSpec('lance', tier).cooldown);
        if (family === 'lance') expect(spec.cooldown).toBeGreaterThan(normal.cooldown);
        for (const mode of ['journey', 'endless', 'smuggler'] as const) {
          expect(weaponSpec(family, tier, mode)).toEqual(normal);
        }
        const invaderDelay = { pulse: 0.6, spread: 1.4, lance: 1.4 }[family];
        expect(weaponSpec(family, tier, 'invaders').cooldown).toBeCloseTo(invaderDelay * (1 - (tier - 1) * 0.08));
      }
    );

    it.each(FAMILIES)(`%s tier ${tier} waits between held-fire volleys in the fixed simulation`, family => {
      const { sim, run, s } = tunnelFixture(); run.family = family; run.tiers[family] = tier;
      // Keep this timing test independent of generated traffic and pickup upgrades.
      s.spawnDelay = 100;
      const cooldown = weaponSpec(family, tier, 'tunnels').cooldown;
      const volleys: number[] = [];
      for (let tick = 0; tick < 180; tick++) {
        sim.step(1 / 60, 0, true);
        if (sim.drain().some(event => event.type === 'shoot')) volleys.push(tick / 60);
      }
      expect(volleys.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < volleys.length; i++) {
        expect(volleys[i] - volleys[i - 1]).toBeGreaterThanOrEqual(cooldown - 1e-6);
        expect(volleys[i] - volleys[i - 1]).toBeLessThanOrEqual(cooldown + 1 / 60 + 1e-6);
      }
      expect(run.accuracy.shots).toBe(volleys.length * weaponSpec(family, tier, 'tunnels').count);
    });
  }

  it.each(FAMILIES)('keeps the remaining %s cooldown through weapon switching and resume', family => {
    const { run, s, combat, sim } = tunnelFixture(); run.family = family; s.spawnDelay = 100;
    expect(combat.fire()).toBe(true); advanceTunnel(sim, 0.1);
    const remaining = s.fireDelay;
    for (const next of FAMILIES) { run.family = next; expect(combat.fire()).toBe(false); }
    const resumed = new TunnelSimulation(structuredClone(run));
    expect(resumed.state.fireDelay).toBe(remaining);
    expect(resumed.combat.fire()).toBe(false);
    advanceTunnel(resumed, remaining + 1 / 60);
    expect(resumed.combat.fire()).toBe(true);
    expect(resumed.state.fireDelay).toBe(weaponSpec('lance', 1, 'tunnels').cooldown);
  });
});
