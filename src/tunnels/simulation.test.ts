import { expect, it } from 'vitest';
import { clone } from '../arcade';
import { addEntity, spawnAssault, tunnelEncounter } from './encounters';
import { laneDelta } from './shapes';
import { nextTunnel } from './rules';
import { parseTunnel } from './persistence';
import { advanceTunnel, tunnelFixture } from './test-helpers';

it('collects cargo, zooms and detonates once, then pays and advances after the results', () => {
  const { sim, s, ctx, run } = tunnelFixture(); s.group = tunnelEncounter(1).groups;
  addEntity(ctx, 'pickup', 0, 280, { drop: 'legalCargo' });
  sim.step(1 / 60); expect(s.phase).toBe('salvage'); expect(sim.remainingEnemies).toBe(0);
  advanceTunnel(sim, 2.9); expect(s.paid).toBe(false); expect(run.pilot.inventory.legalCargo).toBe(1);
  advanceTunnel(sim, 0.1); expect(s.phase).toBe('collapse'); expect(s.paid).toBe(false);
  advanceTunnel(sim, 1); expect(sim.drain().filter(e => e.type === 'detonate')).toHaveLength(1);
  advanceTunnel(sim, 2); expect(s.phase).toBe('result'); expect(s.result?.cargo).toBe(80);
  expect(sim.drain().filter(e => e.type === 'detonate')).toHaveLength(0);
  const score = run.pilot.score; advanceTunnel(sim, 2.9); expect(nextTunnel(run)).toBe(false);
  advanceTunnel(sim, 0.1); expect(sim.drain().some(e => e.type === 'next')).toBe(true);
  expect(nextTunnel(run)).toBe(true); expect(nextTunnel(run)).toBe(false); expect(run.pilot.score).toBe(score);
});

it('emits one ready sound when a damaging volley finishes charging the blast', () => {
  const { sim, s, ctx, run } = tunnelFixture(); run.charge = 95; s.spawnDelay = 100;
  addEntity(ctx, 'ship', 0, 20, { faction: 'pirate', hp: 200, required: true });
  advanceTunnel(sim, 0.1, true); expect(run.charge).toBe(100);
  expect(sim.drain().filter(e => e.type === 'ready')).toHaveLength(1);
  advanceTunnel(sim, 0.1, true); expect(sim.drain().filter(e => e.type === 'ready')).toHaveLength(0);
});

it('launches a finite carrier escort roster from the carrier rather than adding endless reinforcements', () => {
  const { ctx, s } = tunnelFixture(10), definition = tunnelEncounter(10);
  s.group = definition.groups - 1; s.spawnDelay = 0;
  spawnAssault(ctx, 0.1, false);
  const core = s.entities.find(e => e.kind === 'core')!;
  expect(core).toBeDefined(); expect(s.entities.filter(e => e.parent === core.id)).toHaveLength(2);
  core.depth = 240; s.spawnDelay = 0; spawnAssault(ctx, 0.1, false);
  const escort = s.entities.find(e => e.kind === 'ship')!;
  expect(escort.depth).toBe(240); expect(escort.grace).toBe(0.9); expect(s.spawnIndex).toBe(2);
});

it('rejects corrupt enums, duplicate IDs, invalid vitals and inconsistent paid states', () => {
  const { ctx, s } = tunnelFixture(); addEntity(ctx, 'ship', 0, 200);
  for (const change of [
    (copy: typeof s) => { copy.entities[0].role = 'invalid' as typeof copy.entities[0]['role']; },
    (copy: typeof s) => { copy.entities.push({ ...copy.entities[0] }); },
    (copy: typeof s) => { copy.startVitals.shield = NaN; },
    (copy: typeof s) => { copy.phase = 'result'; },
    (copy: typeof s) => { copy.chargedVolleys = [NaN]; }
  ]) { const copy = clone(s); change(copy); expect(parseTunnel(copy, 1)).toBeUndefined(); }
});

// A deterministic aiming pilot exercises complete encounters without browser time,
// instant kills or invulnerability. It still has to travel, fire and collect rewards.
it.each([1,11,1000])('can clear tunnel %i with normal weapons and lives', level => {
  const { sim, run, s } = tunnelFixture(level);
  for (let tick = 0; tick < 60 * 360 && s.phase === 'assault' && run.lives > 0; tick++) {
    const targets = s.entities.filter(e => e.hp > 0 && e.faction === 'pirate'
      && !(e.kind === 'core' && s.entities.some(gun => gun.hp > 0 && gun.parent === e.id)));
    targets.sort((a, b) => a.depth - b.depth);
    const target = targets[0];
    const lane = target ? Math.round(target.lane) : Math.round(s.lane);
    const move = laneDelta(s.desiredLane, lane, sim.shape.closed) * 45;
    const blocked = s.entities.some(e => e.hp > 0 && ['police','trader'].includes(e.faction)
      && (Math.abs(laneDelta(s.lane, e.lane, sim.shape.closed)) < 0.5 || Math.abs(laneDelta(s.lane, e.nextLane, sim.shape.closed)) < 0.5)
      && e.depth < (target?.depth ?? 0) + 50);
    const shoot = !!target && !blocked && Math.abs(laneDelta(s.lane, lane, sim.shape.closed)) < 0.35;
    if (run.charge >= 100) sim.combat.blast();
    sim.step(1 / 60, move, shoot); sim.drain();
  }
  expect(s.phase).toBe('salvage'); expect(run.lives).toBeGreaterThan(0);
  expect(run.accuracy.hits).toBeGreaterThan(0); expect(run.accuracy.hits).toBeLessThanOrEqual(run.accuracy.shots);
  expect(run.pilot.wanted.active, run.pilot.wanted.reason ?? 'clean pilot').toBe(false);
});
