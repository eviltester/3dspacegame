import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { newRun, settleBonus, settleStage } from './arcade';
import { BonusController } from './bonus';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));

for (const [kind, stage] of [['asteroids', 3], ['canyon', 7], ['sequence', 11]] as const) {
  it.each(['complete', 'crash', 'timeout', 'exit'] as const)(`${kind}: %s closes once and leaves the main ship intact`, reason => {
    const run = newRun('journey', 41); run.stage = stage; settleStage(run); run.bonusStatus = 'entered';
    const equipment = structuredClone({ hull: run.pilot.hull, shield: run.pilot.shield, tiers: run.tiers, inventory: run.pilot.inventory });
    const bonus = new BonusController(kind, 41); bonus.state.points = 10;
    bonus.finish(reason); const ratio = bonus.ratio; expect(bonus.state.finished).toBe(true); expect(bonus.state.reason).toBe(reason);
    bonus.finish('exit'); expect(bonus.ratio).toBe(ratio); expect(bonus.state.reason).toBe(reason);
    settleBonus(run, ratio, kind === 'sequence' ? bonus.state.points : undefined); const paid = structuredClone(run);
    expect(settleBonus(run, ratio)).toBeNull(); expect(run).toEqual(paid);
    expect({ hull: run.pilot.hull, shield: run.pilot.shield, tiers: run.tiers, inventory: run.pilot.inventory }).toEqual(equipment);
    bonus.dispose();
  });
}
