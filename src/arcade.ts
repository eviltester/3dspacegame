import { applyCargoPickup, createInitialProgress, instantTrade } from './logic';
import type { CargoDrop, CargoType, Faction, PlayerProgress } from './logic';

export type GameMode = 'journey' | 'endless';
export type WeaponFamily = 'pulse' | 'spread' | 'lance';
export type EnemyArchetype = 'raider' | 'flanker' | 'diver' | 'gunship' | 'minelayer' | 'carrier';
export type BonusKind = 'asteroids' | 'canyon' | 'sequence';
export type RunPhase = 'briefing' | 'playing' | 'cleared' | 'recovery' | 'bonusOffer' | 'bonus' | 'bonusResult' | 'shop' | 'gameover' | 'victory';
export interface RunResources {
  pilot: PlayerProgress;
  family: WeaponFamily;
  tiers: Record<WeaponFamily, number>;
  magnet: number;
  charge: number;
}
export interface RunState extends RunResources {
  practice?: boolean;
  mode: GameMode;
  seed: number;
  stage: number;
  lives: number;
  continued: boolean;
  phase: RunPhase;
  checkpoint: RunResources;
  cleared: boolean;
  bonusStatus: 'available' | 'entered' | 'settled' | 'skipped';
  chain: { kills: number; multiplier: number; remaining: number; recent: number[] };
  elapsed: number;
  timeRemaining: number;
  timeBonus: number | null;
  kills: number;
  earlyCore: boolean;
}
export interface ProfileSaveV2 {
  version: 2;
  settings: { aimAssist: boolean; muted: boolean };
  unlocked: WeaponFamily[];
  records: Record<'journey' | 'endless' | 'journeyContinued' | 'endlessContinued', number>;
  legacyScore: number;
  checkpoints: Partial<Record<GameMode, RunState>>;
}
export const SAVE_V2 = 'vector-shooter-save-v2';
export const JOURNEY_STAGE_COUNT = 99;
export const STAGE_TIME_LIMIT = 120;
export const TIME_BONUS_RATE = 10;
export const FAMILIES: WeaponFamily[] = ['pulse', 'spread', 'lance'];
export function canNpcCollect(faction: Faction, type: CargoType, essential = false): boolean {
  if (essential || type === 'rescuePod') return false;
  return faction === 'police' ? type === 'contraband' : faction === 'pirate' || (faction === 'trader' && type !== 'contraband');
}
export const clone = <T>(value: T): T => structuredClone(value);
export const resources = (run: RunResources): RunResources => clone({ pilot: run.pilot, family: run.family, tiers: run.tiers, magnet: run.magnet, charge: run.charge });

export function newRun(mode: GameMode, seed: number, family: WeaponFamily = 'pulse'): RunState {
  const base: RunResources = { pilot: createInitialProgress(), family, tiers: { pulse: 1, spread: 1, lance: 1 }, magnet: 20, charge: 0 };
  return { ...base, mode, seed: seed >>> 0, stage: 1, lives: 3, continued: false, phase: 'briefing', checkpoint: resources(base),
    cleared: false, bonusStatus: 'available', chain: { kills: 0, multiplier: 1, remaining: 0, recent: [] }, elapsed: 0,
    timeRemaining: STAGE_TIME_LIMIT, timeBonus: null, kills: 0, earlyCore: false };
}

export function timeBonusSeconds(run: Pick<RunState, 'timeRemaining'>): number {
  return Math.max(0, Math.floor(run.timeRemaining + 1e-6));
}
export function formatStageTime(run: Pick<RunState, 'timeRemaining'>): string {
  const seconds = timeBonusSeconds(run);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function tickStageTime(run: RunState, dt: number): void {
  if (run.timeBonus !== null || !['playing', 'cleared', 'recovery'].includes(run.phase) || !Number.isFinite(dt) || dt <= 0) return;
  run.timeRemaining = Math.max(0, run.timeRemaining - dt);
}
export function settleTimeBonus(run: RunState): number | null {
  if (!run.cleared || !['cleared', 'recovery'].includes(run.phase) || run.timeBonus !== null) return null;
  const credits = timeBonusSeconds(run) * TIME_BONUS_RATE;
  run.pilot.credits += credits;
  run.timeBonus = credits;
  return credits;
}

export function resetChain(run: RunState): void { run.chain = { kills: 0, multiplier: 1, remaining: 0, recent: [] }; }
export function tickChain(run: RunState, dt: number): void {
  if (run.phase !== 'playing') return;
  run.chain.remaining = Math.max(0, run.chain.remaining - dt);
  run.chain.recent = run.chain.recent.map(age => age + dt).filter(age => age <= 5);
  if (!run.chain.remaining) resetChain(run);
}
export function rewardKill(run: RunState, base = 100): number {
  run.kills += 1;
  run.chain.kills += 1;
  run.chain.recent.push(0);
  if (run.chain.recent.length >= 3) {
    run.chain.multiplier = Math.min(5, run.chain.multiplier + 1);
    run.chain.recent.splice(0, 3);
  }
  run.chain.remaining = 5;
  run.charge = Math.min(100, run.charge + 5);
  const score = base * run.chain.multiplier;
  run.pilot.score += score;
  return score;
}
export function rewardInterception(run: RunState): void {
  run.charge = Math.min(100, run.charge + 10);
  run.pilot.score += 8 * run.chain.multiplier;
}
export function pickup(run: RunState, drop: CargoDrop): void {
  if (drop.type === 'weaponCore') {
    const max = run.stage >= (run.mode === 'journey' ? 5 : 8) ? 3 : 2;
    if (run.tiers[run.family] < max) run.tiers[run.family] += 1;
    else run.pilot.credits += 200;
    run.pilot.score += 40;
    run.pilot.weaponLevel = run.tiers[run.family];
  } else run.pilot = applyCargoPickup(run.pilot, drop);
}
export function settleStage(run: RunState): boolean {
  if (run.cleared) return false;
  run.cleared = true;
  run.phase = 'cleared';
  run.pilot.credits += 200 + Math.min(run.stage, 20) * 35 + (run.stage === 1 ? 150 : 0);
  run.pilot.score += (250 + run.stage * 50) * run.chain.multiplier;
  return true;
}
export function bonusFor(run: Pick<RunState, 'mode' | 'stage'>): BonusKind | null {
  if (run.mode === 'journey') return run.stage < JOURNEY_STAGE_COUNT && run.stage % 4 === 3
    ? (['asteroids', 'canyon', 'sequence'] as const)[Math.floor(run.stage / 4) % 3] : null;
  return run.stage % 5 === 0 ? (['asteroids', 'canyon', 'sequence'] as const)[(run.stage / 5 - 1) % 3] : null;
}
export function settleBonus(run: RunState, ratio: number, targetScore?: number): { medal: string; credits: number; score: number; extraLife: boolean } | null {
  if (run.bonusStatus !== 'entered') return null;
  const value = Math.max(0, Math.min(1, ratio));
  const medal = value >= 0.9 ? 'GOLD' : value >= 0.65 ? 'SILVER' : value >= 0.35 ? 'BRONZE' : 'SALVAGE';
  const credits = value >= 0.9 ? 350 : value >= 0.65 ? 200 : value >= 0.35 ? 100 : Math.floor(value * 200);
  const score = targetScore === undefined ? Math.floor(1500 * value) : Math.max(0, Math.floor(Number.isFinite(targetScore) ? targetScore : 0));
  const extraLife = medal === 'GOLD' && run.lives < 5;
  run.pilot.credits += credits;
  run.pilot.score += score;
  if (extraLife) run.lives += 1;
  run.bonusStatus = 'settled';
  run.phase = 'bonusResult';
  return { medal, credits, score, extraLife };
}
export function dock(run: RunState): void {
  run.pilot = instantTrade(run.pilot, 'lawful').progress;
  run.phase = 'shop';
}
export type Purchase = 'tier' | 'repair' | 'shield' | 'magnet';
export function purchasePrice(run: RunState, kind: Purchase): number {
  return kind === 'tier' ? (run.tiers[run.family] === 1 ? 350 : 800) : kind === 'repair' ? 150 : kind === 'shield' ? 300 : 200;
}
export function purchaseBlocked(run: RunState, kind: Purchase): string | null {
  if (run.phase !== 'shop') return 'Dock first';
  if (kind === 'tier' && run.tiers[run.family] >= 3) return 'Maximum tier';
  if (kind === 'tier' && run.tiers[run.family] === 2 && run.stage < (run.mode === 'journey' ? 5 : 8)) return `Tier 3 opens after ${run.mode === 'journey' ? 'stage 5' : 'wave 8'}`;
  if (kind === 'repair' && run.pilot.hull >= 100 && run.pilot.shield >= run.pilot.maxShield) return 'Fully repaired';
  if (kind === 'shield' && run.pilot.maxShield >= 150) return 'Maximum shield';
  if (kind === 'magnet' && run.magnet >= 35) return 'Maximum magnet';
  return run.pilot.credits < purchasePrice(run, kind) ? 'Insufficient credits' : null;
}
export function purchase(run: RunState, kind: Purchase): boolean {
  if (purchaseBlocked(run, kind)) return false;
  run.pilot.credits -= purchasePrice(run, kind);
  if (kind === 'tier') { run.tiers[run.family] += 1; run.pilot.weaponLevel = run.tiers[run.family]; }
  if (kind === 'repair') { run.pilot.hull = Math.min(100, run.pilot.hull + 50); run.pilot.shield = Math.min(run.pilot.maxShield, run.pilot.shield + 60); }
  if (kind === 'shield') { run.pilot.maxShield += 25; run.pilot.shield = Math.min(run.pilot.maxShield, run.pilot.shield + 25); }
  if (kind === 'magnet') run.magnet = 35;
  return true;
}
export function retry(run: RunState, useContinue = false): void {
  Object.assign(run, resources(run.checkpoint));
  if (useContinue) {
    run.lives = 3;
    run.continued = true;
    run.pilot.score = 0;
    run.checkpoint.pilot.score = 0;
  }
  run.cleared = false;
  run.elapsed = 0;
  run.timeRemaining = STAGE_TIME_LIMIT;
  run.timeBonus = null;
  run.kills = 0;
  run.earlyCore = false;
  run.bonusStatus = 'available';
  run.phase = 'briefing';
  resetChain(run);
}
export function loseLife(run: RunState): void {
  run.lives = Math.max(0, run.lives - 1);
  retry(run);
  run.phase = 'gameover';
}
export function advance(run: RunState): void {
  if (!run.cleared) return;
  if (run.mode === 'journey' && run.stage >= JOURNEY_STAGE_COUNT) { run.phase = 'victory'; return; }
  run.stage += 1;
  run.phase = 'briefing';
  run.cleared = false;
  run.elapsed = 0;
  run.timeRemaining = STAGE_TIME_LIMIT;
  run.timeBonus = null;
  run.kills = 0;
  run.earlyCore = false;
  run.bonusStatus = 'available';
  run.pilot.wanted = createInitialProgress().wanted;
  run.pilot.shield = Math.min(run.pilot.maxShield, run.pilot.shield + 25);
  run.checkpoint = resources(run);
}
export function recordRun(profile: ProfileSaveV2, run: RunState): void {
  if (run.practice) return;
  const key = `${run.mode}${run.continued ? 'Continued' : ''}` as keyof ProfileSaveV2['records'];
  profile.records[key] = Math.max(profile.records[key], run.pilot.score);
  if (run.stage >= 4 && run.cleared && !profile.unlocked.includes('spread')) profile.unlocked.push('spread');
  if (run.stage >= 8 && run.cleared && !profile.unlocked.includes('lance')) profile.unlocked.push('lance');
}

export function freshProfile(legacy: unknown = null): ProfileSaveV2 {
  const old = legacy && typeof legacy === 'object' ? legacy as Record<string, unknown> : {};
  const unlocked: WeaponFamily[] = ['pulse'];
  if (Number(old.unlockedWeaponLevel) >= 2) unlocked.push('spread');
  if (Number(old.unlockedWeaponLevel) >= 3) unlocked.push('lance');
  return { version: 2, settings: { aimAssist: true, muted: false }, unlocked, legacyScore: Math.max(0, Number(old.bestScore) || 0),
    records: { journey: 0, endless: 0, journeyContinued: 0, endlessContinued: 0 }, checkpoints: {} };
}
export function saveCheckpoint(profile: ProfileSaveV2, run: RunState): void {
  if (run.practice) return;
  const saved = clone(run);
  if (!saved.cleared && (saved.phase === 'playing' || saved.phase === 'briefing')) retry(saved);
  if (saved.phase === 'bonus') { saved.phase = 'shop'; saved.bonusStatus = 'settled'; }
  if (saved.phase === 'bonusResult') saved.phase = 'shop';
  profile.checkpoints[run.mode] = saved;
}
export function parseProfile(raw: string | null, legacy: string | null): ProfileSaveV2 {
  let old: unknown = null;
  try { old = legacy ? JSON.parse(legacy) : null; } catch { /* Invalid legacy data must not prevent a new game. */ }
  const fallback = freshProfile(old);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as ProfileSaveV2;
    if (parsed.version !== 2) return fallback;
    const profile = freshProfile(old);
    profile.unlocked = FAMILIES.filter(family => family === 'pulse' || parsed.unlocked?.includes(family));
    profile.settings.aimAssist = parsed.settings?.aimAssist !== false;
    profile.settings.muted = parsed.settings?.muted === true;
    profile.legacyScore = Math.max(fallback.legacyScore, Number(parsed.legacyScore) || 0);
    for (const key of Object.keys(profile.records) as Array<keyof typeof profile.records>) profile.records[key] = Math.max(0, Number(parsed.records?.[key]) || 0);
    for (const mode of ['journey', 'endless'] as const) {
      const run = parsed.checkpoints?.[mode];
      if (validCheckpoint(run, mode)) {
        // Older v2 saves have no bonus clock. Completed gate travel is not paid retroactively.
        if (run.timeRemaining === undefined) run.timeRemaining = Math.max(0, STAGE_TIME_LIMIT - (Number.isFinite(run.elapsed) ? Math.max(0, run.elapsed) : 0));
        if (run.timeBonus === undefined) run.timeBonus = run.cleared && !['cleared', 'recovery'].includes(run.phase) ? 0 : null;
        // A completed twelve-stage Journey can depart its old final dock into the expanded campaign.
        if (mode === 'journey' && run.phase === 'victory' && run.stage < JOURNEY_STAGE_COUNT && run.cleared) run.phase = 'shop';
        run.chain.recent = Array.isArray(run.chain.recent) ? run.chain.recent.filter(age => Number.isFinite(age) && age >= 0 && age <= 5) : [];
        saveCheckpoint(profile, run);
      }
    }
    return profile;
  } catch { return fallback; }
}
function validCheckpoint(run: RunState | undefined, mode: GameMode): run is RunState {
  if (!run || run.mode !== mode || !Number.isInteger(run.stage) || run.stage < 1 || (mode === 'journey' && run.stage > JOURNEY_STAGE_COUNT)) return false;
  if (run.practice !== undefined && run.practice !== false) return false;
  if (!['briefing', 'playing', 'cleared', 'recovery', 'bonusOffer', 'bonus', 'bonusResult', 'shop', 'gameover', 'victory'].includes(run.phase)) return false;
  if (!['available', 'entered', 'settled', 'skipped'].includes(run.bonusStatus) || typeof run.cleared !== 'boolean' || typeof run.continued !== 'boolean') return false;
  if (run.timeRemaining !== undefined && (!Number.isFinite(run.timeRemaining) || run.timeRemaining < 0 || run.timeRemaining > STAGE_TIME_LIMIT)) return false;
  if (run.timeBonus !== undefined && run.timeBonus !== null && (!Number.isInteger(run.timeBonus) || run.timeBonus < 0 || run.timeBonus > STAGE_TIME_LIMIT * TIME_BONUS_RATE || run.timeBonus % TIME_BONUS_RATE !== 0)) return false;
  const valid = (r: RunResources) => r && FAMILIES.includes(r.family) && FAMILIES.every(f => Number.isInteger(r.tiers?.[f]) && r.tiers[f] >= 1 && r.tiers[f] <= 3)
    && r.pilot && [r.pilot.score, r.pilot.credits, r.pilot.hull, r.pilot.shield, r.pilot.maxShield, r.magnet, r.charge].every(Number.isFinite)
    && r.pilot.credits >= 0 && r.pilot.hull >= 0 && r.pilot.hull <= 100 && r.pilot.shield >= 0 && r.pilot.maxShield >= 100 && r.pilot.maxShield <= 150
    && [20, 35].includes(r.magnet) && r.charge >= 0 && r.charge <= 100
    && r.pilot.inventory && [r.pilot.inventory.legalCargo, r.pilot.inventory.rareMineral, r.pilot.inventory.contraband, r.pilot.inventory.rescuePods].every(n => Number.isInteger(n) && n >= 0)
    && r.pilot.wanted && r.pilot.sectorReputation && Array.isArray(r.pilot.discoveredSectors);
  return !!(valid(run) && valid(run.checkpoint) && run.chain && Number.isInteger(run.lives) && run.lives >= 0 && run.lives <= 5 && Number.isFinite(run.seed));
}
