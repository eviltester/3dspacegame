import type { ArcadeGame } from '../game';

export type GameDebugApi = ReturnType<ArcadeGame['createDebugApi']>;
export type GameSnapshot = ReturnType<GameDebugApi['getState']>;

declare global {
  interface Window {
    vectorShooterDebug: GameDebugApi;
  }
}
