import type { GameMode } from './arcade';

export const BONUS_DIFFICULTY_LEVELS = 8;
export const TARGET_HIT_POINTS = 100;
export const TARGET_SHOT_COST = 5;

export function bonusDifficulty(mode: GameMode, stage: number): number {
  return bonusProfile(1 + Math.floor((stage - 1) / (mode === 'journey' ? 12 : 15))).level;
}

export function bonusProfile(difficulty = 1) {
  const level = Number.isFinite(difficulty) ? Math.max(1, Math.min(BONUS_DIFFICULTY_LEVELS, Math.floor(difficulty))) : 1;
  const pressure = level - 1;
  return {
    level,
    flightScale: 1 + pressure * 0.07,
    asteroidRows: 55 + pressure * 5,
    canyonObstacles: 52 + pressure * 4,
    gateScale: 1 - pressure * 0.015,
    motionScale: 1 + pressure * 0.09,
    gunCooldown: 2.2 - pressure * 0.1,
    shotSpeedScale: 1 + pressure * 0.05,
    targetCount: 16 + pressure * 2,
    targetMinRadius: 9 - pressure * 0.5,
    targetJitter: pressure * 0.25
  };
}
