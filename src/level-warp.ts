import { bonusFor, JOURNEY_STAGE_COUNT, newRun } from './arcade';
import type { BonusKind, GameMode, RunState, WeaponFamily } from './arcade';

const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'KeyB', 'KeyA'];
export const LEVEL_WARP_KEY = 'vector-shooter-level-warp';
export const WARP_BONUSES: Record<BonusKind, number> = { asteroids: 3, canyon: 7, sequence: 11 };

export class LevelWarpCode {
  private keys: string[] = [];
  reset(): void { this.keys = []; }
  press(code: string, titleScreen: boolean, repeat = false): boolean {
    if (!titleScreen) { this.reset(); return false; }
    if (repeat) return false;
    this.keys.push(code);
    // Keep the longest matching prefix, including overlapping extra Up presses.
    while (this.keys.length && !this.keys.every((key, index) => key === CODE[index])) this.keys.shift();
    if (this.keys.length !== CODE.length) return false;
    this.reset();
    return true;
  }
}

export function createWarpRun(mode: GameMode, stage: number, family: WeaponFamily, bonus = false): RunState {
  if (!Number.isSafeInteger(stage) || stage < 1 || (mode === 'journey' && stage > JOURNEY_STAGE_COUNT)) throw new RangeError('Invalid warp destination');
  if (bonus && (mode !== 'journey' || !bonusFor({ mode, stage }))) throw new RangeError('Invalid bonus destination');
  const run = newRun(mode, 0x1984, family);
  run.stage = stage;
  run.practice = true;
  if (bonus) {
    run.cleared = true;
    run.phase = 'bonusOffer';
    run.timeBonus = 0;
  }
  return run;
}
