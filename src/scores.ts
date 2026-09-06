/** Per-mode top-ten tables. Entries track whole runs, not each save or stage clear. */
import { GAME_MODES } from './modes';
import type { GameMode } from './modes';
import type { ProfileSaveV2, RunState } from './arcade';

export interface ScoreEntry { id: string; score: number; stage: number; continued: boolean }
export type Scoreboards = Record<GameMode, ScoreEntry[]>;
export function emptyScoreboards(): Scoreboards { return { journey: [], endless: [], invaders: [], smuggler: [] }; }

export function recordScore(profile: ProfileSaveV2, run: RunState): void {
  if (run.practice || run.pilot.score <= 0) return;
  const board = profile.scoreboards[run.mode];
  const id = `${run.id}:${run.continued ? 'continued' : 'clean'}`;
  // Keep a clean score when the player continues, and update the continued entry
  // separately. Repeated autosaves must not fill the table with the same flight.
  const existing = board.find(entry => entry.id === id);
  if (existing && existing.score >= run.pilot.score) return;
  const entry = { id, score: Math.floor(run.pilot.score), stage: run.stage, continued: run.continued };
  profile.scoreboards[run.mode] = [...board.filter(item => item.id !== id), entry].sort((a, b) => b.score - a.score).slice(0, 10);
}

export function parseScoreboards(raw: unknown): Scoreboards {
  // Copy only validated fields from storage before menus turn them into HTML.
  // A broken row should not erase other valid rows or prevent a new run.
  const boards = emptyScoreboards();
  if (!raw || typeof raw !== 'object') return boards;
  for (const mode of GAME_MODES) {
    const entries: unknown = (raw as Record<string, unknown>)[mode];
    if (!Array.isArray(entries)) continue;
    const unique = new Map<string, ScoreEntry>();
    for (const value of entries as unknown[]) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as ScoreEntry;
      if (typeof entry.id !== 'string' || entry.id.length > 120 || !Number.isSafeInteger(entry.score) || entry.score <= 0 || !Number.isSafeInteger(entry.stage) || entry.stage < 1 || typeof entry.continued !== 'boolean') continue;
      if ((unique.get(entry.id)?.score ?? -1) < entry.score) unique.set(entry.id, { id: entry.id, score: entry.score, stage: entry.stage, continued: entry.continued });
    }
    boards[mode] = [...unique.values()].sort((a, b) => b.score - a.score).slice(0, 10);
  }
  return boards;
}
