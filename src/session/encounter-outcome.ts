/** Encounter decisions use plain state, not a running world or a rendered ship. */
import type { RunState } from '../arcade';
import type { StageKind } from '../encounters';
import type { CargoDrop, CargoType } from '../logic';

export interface ObjectiveState {
  kind: StageKind;
  flightsFinished: boolean;
  hostiles: number;
  rescued: boolean;
  protectedShip: { age: number; dead: boolean } | null;
}
export function encounterComplete(state: ObjectiveState): boolean {
  if (!state.flightsFinished || state.hostiles > 0) return false;
  if (state.kind === 'rescue') return state.rescued;
  if (state.kind === 'escort') return !!state.protectedShip && state.protectedShip.age >= 75 && !state.protectedShip.dead;
  return !state.protectedShip?.dead;
}

export function pirateSalvage(run: RunState, pick: (types: readonly CargoType[]) => CargoType): { drop: CargoDrop; essential: boolean } {
  // The opening core is guaranteed even when an allied ship earns the kill.
  // Its essential flag prevents NPCs stealing the first upgrade opportunity.
  if (!run.earlyCore) {
    run.earlyCore = true;
    return { drop: { type: 'weaponCore', amount: 1 }, essential: true };
  }
  const type = run.mode === 'invaders' ? run.kills % 4 === 0 ? 'shieldCell' : pick(['credits', 'shieldCell', 'weaponCore'])
    : pick(['credits', 'credits', 'legalCargo', 'rareMineral', 'shieldCell', 'contraband', 'weaponCore']);
  return { drop: { type, amount: 1 }, essential: false };
}
