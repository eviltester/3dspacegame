import { describe, expect, it } from 'vitest';
import {
  CONTRABAND_FINE,
  POLICE_DISPATCH_DELAY,
  applyCargoPickup,
  attackFaction,
  coolWantedAfterWarp,
  createInitialProgress,
  discoverSector,
  instantTrade,
  nextSectorId,
  policeDispatchDue,
  progressToSave,
  resolveContrabandScan,
  wantedAppliesInSector
} from './logic';

describe('cargo and trade rules', () => {
  it('collects cargo, credits, shields, and weapon cores', () => {
    let progress = createInitialProgress();
    progress = applyCargoPickup(progress, { type: 'legalCargo', amount: 2 });
    progress = applyCargoPickup(progress, { type: 'rareMineral', amount: 1 });
    progress = applyCargoPickup(progress, { type: 'credits', amount: 3 });
    progress = applyCargoPickup({ ...progress, shield: 50 }, { type: 'shieldCell', amount: 1 });
    progress = applyCargoPickup(progress, { type: 'weaponCore', amount: 2 });

    expect(progress.inventory.legalCargo).toBe(2);
    expect(progress.inventory.rareMineral).toBe(1);
    expect(progress.credits).toBe(105);
    expect(progress.shield).toBe(80);
    expect(progress.weaponLevel).toBe(3);
  });

  it('auto-sells lawful goods only in lawful zones', () => {
    let progress = createInitialProgress();
    progress = applyCargoPickup(progress, { type: 'legalCargo', amount: 2 });
    progress = applyCargoPickup(progress, { type: 'rareMineral', amount: 1 });
    progress = applyCargoPickup(progress, { type: 'contraband', amount: 1 });

    const result = instantTrade(progress, 'lawful');

    expect(result.creditsEarned).toBe(320);
    expect(result.progress.inventory.legalCargo).toBe(0);
    expect(result.progress.inventory.rareMineral).toBe(0);
    expect(result.progress.inventory.contraband).toBe(1);
  });

  it('sells contraband only at black-market beacons', () => {
    const progress = applyCargoPickup(createInitialProgress(), { type: 'contraband', amount: 2 });
    const result = instantTrade(progress, 'blackMarket');

    expect(result.creditsEarned).toBe(520);
    expect(result.progress.inventory.contraband).toBe(0);
  });
});

describe('law and sector rules', () => {
  it('marks the player as wanted for unprovoked trader attacks', () => {
    const progress = attackFaction(createInitialProgress(), 'lyra-drift', 'trader', false);

    expect(progress.wanted.active).toBe(true);
    expect(progress.wanted.sectorId).toBe('lyra-drift');
    expect(progress.sectorReputation['lyra-drift']).toBe('pirate');
  });

  it('does not mark the player wanted when pirates are attacked', () => {
    const progress = attackFaction(createInitialProgress(), 'lyra-drift', 'pirate', false);

    expect(progress.wanted.active).toBe(false);
  });

  it('dispatches police after the configured delay', () => {
    const wanted = attackFaction(createInitialProgress(), 'lyra-drift', 'trader', false).wanted;

    expect(policeDispatchDue(wanted, POLICE_DISPATCH_DELAY - 0.1)).toBe(false);
    expect(policeDispatchDue(wanted, POLICE_DISPATCH_DELAY)).toBe(true);
  });

  it('applies warrants only in the matching sector', () => {
    const wanted = attackFaction(createInitialProgress(), 'lyra-drift', 'trader', false).wanted;

    expect(wantedAppliesInSector(wanted, 'lyra-drift')).toBe(true);
    expect(wantedAppliesInSector(wanted, 'corundum-veil')).toBe(false);
  });

  it('confiscates contraband and charges a fine when the player can pay', () => {
    const carrying = applyCargoPickup({ ...createInitialProgress(), credits: CONTRABAND_FINE }, { type: 'contraband', amount: 1 });
    const result = resolveContrabandScan(carrying, 'lyra-drift');

    expect(result.outcome).toBe('fine-paid');
    expect(result.progress.credits).toBe(0);
    expect(result.progress.inventory.contraband).toBe(0);
    expect(result.progress.wanted.active).toBe(false);
  });

  it('calls a hostile response when contraband cannot be paid off', () => {
    const carrying = applyCargoPickup(createInitialProgress(), { type: 'contraband', amount: 1 });
    const result = resolveContrabandScan(carrying, 'lyra-drift');

    expect(result.outcome).toBe('hostile-response');
    expect(result.progress.wanted.active).toBe(true);
    expect(result.progress.sectorReputation['lyra-drift']).toBe('pirate');
  });

  it('discovers the next sector and cools heat after a warp', () => {
    const wanted = attackFaction(createInitialProgress(), 'lyra-drift', 'trader', false);
    const cooled = coolWantedAfterWarp(wanted, 'lyra-drift');
    const discovered = discoverSector(cooled, nextSectorId('lyra-drift'));

    expect(cooled.wanted.heat).toBe(1);
    expect(discovered.discoveredSectors).toContain('corundum-veil');
  });

  it('clears saved warrants when wanted heat reaches zero', () => {
    const previous = {
      credits: 0,
      bestScore: 0,
      discoveredSectors: ['lyra-drift'],
      sectorReputation: {},
      wantedBySector: { 'lyra-drift': 1 },
      unlockedWeaponLevel: 1
    };
    const cooled = coolWantedAfterWarp(createInitialProgress(previous), 'lyra-drift');
    const save = progressToSave(cooled, previous);

    expect(save.wantedBySector).toEqual({});
  });
});
