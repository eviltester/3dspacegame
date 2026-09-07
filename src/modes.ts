// Stable mode IDs for saves; display names live in MODE_INFO.
export const GAME_MODES = ['journey', 'endless', 'invaders', 'smuggler'] as const;
export type GameMode = typeof GAME_MODES[number];
export const MODE_INFO: Record<GameMode, { name: string; summary: string; detail: string; unit: string }> = {
  journey: { name: 'ARCADE JOURNEY', summary: 'Explore. Fight. Trade.', detail: '99 missions across pirate fleets, rescues, carriers and optional bonus sorties.', unit: 'STAGE' },
  endless: { name: 'ATTACK CHALLENGE', summary: 'Survive the next wave.', detail: 'Free-flight combat with rising pressure, armadas and a carrier every fifth wave.', unit: 'WAVE' },
  invaders: { name: 'INVADERS', summary: 'Hold the line.', detail: 'Unbroken alien waves. Collect repairs and weapon cores. Extra life every 20,000 points.', unit: 'WAVE' },
  smuggler: { name: 'SMUGGLER RUN', summary: 'Find a way through.', detail: 'Alternate asteroid belts and canyon runs. Three lives. Bank 5,000 points for an extra life.', unit: 'LEG' }
};
export function isGameMode(value: unknown): value is GameMode { return GAME_MODES.some(mode => mode === value); }
export const SMUGGLER_EXTRA_LIFE_SCORE = 5000;
export const INVADER_EXTRA_LIFE_SCORE = 20000;
