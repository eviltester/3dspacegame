/**
 * Run rules and persistence data, independent of the browser and Three.js.
 * Most helpers deliberately mutate the supplied run; this makes the result of
 * a purchase, death or reward easy to inspect in a unit test. No helper here
 * writes localStorage: ArcadeGame decides when a state change must be saved.
 */
import { applyCargoPickup, createInitialProgress, instantTrade } from './logic';
import type { CargoDrop, CargoType, Faction, PlayerProgress } from './logic';
import { isControlScheme, tiltSensitivity, mouseSensitivity } from './input-layouts';
import type { ControlScheme } from './input-layouts';
import { GAME_MODES } from './modes';
import type { GameMode } from './modes';
import { emptyScoreboards, parseScoreboards, recordScore } from './scores';
import type { Scoreboards } from './scores';
import { emptyAccuracy, parseAccuracy } from './combat/accuracy';
import type { WaveAccuracy } from './combat/accuracy';
import { lifeScoreInterval } from './life-rewards';
import { freshSkiff, parseSkiff } from './skiff-vitals';
import type { SkiffVitals } from './skiff-vitals';
import { parseSmugglerFlight, parseSmugglerResult } from './smuggler-rewards';
import type { SmugglerFlight, SmugglerResult } from './smuggler-rewards';
import type { TunnelRunState } from './tunnels/types';
import { parseTunnel } from './tunnels/persistence';

export type { GameMode } from './modes';
export type WeaponFamily = 'pulse' | 'spread' | 'lance';
export type EnemyArchetype = 'raider' | 'flanker' | 'diver' | 'gunship' | 'minelayer' | 'carrier';
export type BonusKind = 'asteroids' | 'canyon' | 'sequence';
export type RunPhase = 'briefing' | 'playing' | 'cleared' | 'recovery' | 'bonusOffer' | 'bonus' | 'bonusResult' | 'shop' | 'gameover' | 'victory';
// Equipment and spendable resources roll back on a retry; the run's score is
// restored separately so losing a life never removes points already earned.
export interface RunResources {
  pilot: PlayerProgress;
  family: WeaponFamily;
  tiers: Record<WeaponFamily, number>;
  magnet: number;
  charge: number;
}
export interface RunState extends RunResources {
  /** An exact lane-encounter snapshot, including outstanding projectile results. */
  tunnel?: TunnelRunState;
  /** Smuggler craft condition persists across courses and resumed checkpoints. */
  skiff: SkiffVitals;
  /** Evidence survives interrupted flights; paid summaries cannot pay twice. */
  smugglerFlight: SmugglerFlight | null;
  smugglerResult: SmugglerResult | null;
  /** Identifies the whole run across retries/resumes, not one particular stage. */
  id: string;
  /** Next score milestone; kept outside retryable resources to prevent repeat awards. */
  nextLifeScore: number;
  /** Last delivered haul, retained so a resumed result screen can show it again. */
  stageReward: number;
  /** Delivered course pickups, for the paid three-second summary. */
  stageHaul: number | null;
  /** Per-wave projectile results, retained on cleared checkpoints. */
  accuracy: WaveAccuracy;
  /** Invaders wave allowance; separate from charge and retryable equipment. */
  blastUsed: boolean;
  practice?: boolean;
  mode: GameMode;
  seed: number;
  stage: number;
  lives: number;
  continued: boolean;
  phase: RunPhase;
  /** Starting resources for this stage, replaced only when advancing. */
  checkpoint: RunResources;
  cleared: boolean;
  bonusStatus: 'available' | 'entered' | 'settled' | 'skipped';
  chain: { kills: number; multiplier: number; remaining: number; recent: number[] };
  elapsed: number;
  timeRemaining: number;
  /** null means unpaid; zero means settled with no time left. Do not conflate them. */
  timeBonus: number | null;
  kills: number;
  earlyCore: boolean;
}
// A profile outlives a run. It holds settings and separate progress for each mode;
// starting-weapon unlocks are choices, never permanent damage or money bonuses.
export interface ProfileSaveV2 {
  version: 2;
  settings: { aimAssist: boolean; muted: boolean; controlScheme: ControlScheme; tiltSensitivity: number; mouseSensitivity: number };
  unlocked: WeaponFamily[];
  records: Record<GameMode | `${GameMode}Continued`, number>;
  scoreboards: Scoreboards;
  legacyScore: number;
  checkpoints: Partial<Record<GameMode, RunState>>;
}
export const SAVE_V2 = 'vector-shooter-save-v2';
export const JOURNEY_STAGE_COUNT = 99;
export const STAGE_TIME_LIMIT = 120;
export const TIME_BONUS_RATE = 10;
export const FAMILIES: WeaponFamily[] = ['pulse', 'spread', 'lance'];
/** Mission-critical items are player-only; police confiscate contraband only. */
export function canNpcCollect(faction: Faction, type: CargoType, essential = false): boolean {
  if (essential || type === 'rescuePod') return false;
  return faction === 'police' ? type === 'contraband' : faction === 'pirate' || (faction === 'trader' && type !== 'contraband');
}
export const clone = <T>(value: T): T => structuredClone(value);
// Deep cloning prevents later inventory changes from silently changing the checkpoint.
export const resources = (run: RunResources): RunResources => clone({ pilot: run.pilot, family: run.family, tiers: run.tiers, magnet: run.magnet, charge: run.charge });

export function newRun(mode: GameMode, seed: number, family: WeaponFamily = 'pulse'): RunState {
  const base: RunResources = { pilot: createInitialProgress(), family, tiers: { pulse: 1, spread: 1, lance: 1 }, magnet: 20, charge: 0 };
  return { ...base, mode, skiff: freshSkiff(mode === 'smuggler' || mode === 'tunnels'), id: `${mode}-${seed}`, nextLifeScore: lifeScoreInterval(mode), stageReward: 0, seed: seed >>> 0, stage: 1, lives: 3, continued: false, phase: 'briefing', checkpoint: resources(base),
    cleared: false, stageHaul: null, smugglerFlight: null, smugglerResult: null, bonusStatus: 'available', chain: { kills: 0, multiplier: 1, remaining: 0, recent: [] }, elapsed: 0,
    timeRemaining: STAGE_TIME_LIMIT, timeBonus: null, kills: 0, earlyCore: false, accuracy: emptyAccuracy(), blastUsed: false };
}

export function timeBonusSeconds(run: Pick<RunState, 'timeRemaining'>): number {
  // Absorb floating-point noise from repeated 1/60-second ticks before rounding down.
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
  // The paid marker is checked before adding credits, making repeated gate events harmless.
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
  // recent stores kill ages in simulation seconds. Spend groups of three so a
  // fourth kill does not immediately grant another multiplier increase.
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
  // Weapon cores obey the arcade tier gate. Other pickups reuse the shared economy.
  if (drop.type === 'weaponCore') {
    const max = run.stage >= (run.mode === 'journey' ? 5 : 8) ? 3 : 2;
    if (run.tiers[run.family] < max) run.tiers[run.family] += 1;
    else if (run.mode === 'invaders') run.pilot.score += 200;
    else run.pilot.credits += 200;
    run.pilot.score += 40;
    run.pilot.weaponLevel = run.tiers[run.family];
  } else {
    const hull = run.pilot.hull;
    run.pilot = applyCargoPickup(run.pilot, drop);
    // Keep the shared pickup values without granting Invaders a hull reserve.
    if (run.mode === 'invaders') run.pilot.hull = hull;
  }
}
/** Returns false when already paid; callers must then skip the celebration too. */
export function settleStage(run: RunState): boolean {
  if (run.cleared) return false;
  run.cleared = true;
  run.phase = 'cleared';
  run.pilot.credits += 200 + Math.min(run.stage, 20) * 35 + (run.stage === 1 ? 150 : 0);
  run.pilot.score += (250 + run.stage * 50) * run.chain.multiplier;
  return true;
}
export function bonusFor(run: Pick<RunState, 'mode' | 'stage'>): BonusKind | null {
  if (run.mode === 'invaders' || run.mode === 'smuggler' || run.mode === 'tunnels') return null;
  if (run.mode === 'journey') return run.stage < JOURNEY_STAGE_COUNT && run.stage % 4 === 3
    ? (['asteroids', 'canyon', 'sequence'] as const)[Math.floor(run.stage / 4) % 3] : null;
  return run.stage % 5 === 0 ? (['asteroids', 'canyon', 'sequence'] as const)[(run.stage / 5 - 1) % 3] : null;
}
export function settleBonus(run: RunState, ratio: number, courseScore?: number): { medal: string; credits: number; score: number; extraLife: boolean } | null {
  // Only an entered, unpaid offer can settle. Canyon and target challenges supply
  // their net points; asteroid bonuses use their completion ratio.
  if (run.bonusStatus !== 'entered') return null;
  const value = Math.max(0, Math.min(1, ratio));
  const medal = value >= 0.9 ? 'GOLD' : value >= 0.65 ? 'SILVER' : value >= 0.35 ? 'BRONZE' : 'SALVAGE';
  const credits = value >= 0.9 ? 350 : value >= 0.65 ? 200 : value >= 0.35 ? 100 : Math.floor(value * 200);
  const score = courseScore === undefined ? Math.floor(1500 * value) : Math.max(0, Math.floor(Number.isFinite(courseScore) ? courseScore : 0));
  const extraLife = medal === 'GOLD' && run.lives < 5;
  run.pilot.credits += credits;
  run.pilot.score += score;
  if (extraLife) run.lives += 1;
  run.bonusStatus = 'settled';
  run.phase = 'bonusResult';
  return { medal, credits, score, extraLife };
}
export function dock(run: RunState): void {
  if (run.mode === 'invaders' || run.mode === 'tunnels') return;
  run.pilot = instantTrade(run.pilot, 'lawful').progress;
  run.phase = 'shop';
}
export type Purchase = 'tier' | 'repair' | 'shield' | 'magnet';
export function purchasePrice(run: RunState, kind: Purchase): number {
  return kind === 'tier' ? (run.tiers[run.family] === 1 ? 350 : 800) : kind === 'repair' ? 150 : kind === 'shield' ? 300 : 200;
}
/** The shop and purchase operation share this check so displayed eligibility is real. */
export function purchaseBlocked(run: RunState, kind: Purchase): string | null {
  if (run.mode === 'invaders' || run.mode === 'tunnels') return 'Upgrades are collected in flight';
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
/** Restore the checkpoint without charging a life; loseLife handles that separately. */
export function retry(run: RunState, useContinue = false): void {
  if (run.mode === 'tunnels') { run.skiff = { ...(run.tunnel?.startVitals ?? freshSkiff(true)) }; delete run.tunnel; }
  const score = run.pilot.score;
  Object.assign(run, resources(run.checkpoint));
  run.pilot.score = score;
  if (useContinue) {
    // Reset both copies of the score, otherwise another death could resurrect
    // pre-continue points from the checkpoint.
    run.lives = 3;
    run.continued = true;
    run.pilot.score = 0;
    run.checkpoint.pilot.score = 0;
    run.nextLifeScore = lifeScoreInterval(run.mode);
    run.skiff = freshSkiff(run.mode === 'smuggler' || run.mode === 'tunnels');
    run.smugglerFlight = null;
    run.blastUsed = false;
  }
  run.cleared = false;
  run.elapsed = 0;
  run.timeRemaining = STAGE_TIME_LIMIT;
  run.timeBonus = null;
  run.kills = 0;
  run.accuracy = emptyAccuracy();
  run.earlyCore = false;
  run.stageReward = 0;
  run.smugglerResult = null;
  run.stageHaul = null;
  run.bonusStatus = 'available';
  run.phase = 'briefing';
  resetChain(run);
}
export function loseLife(run: RunState): void {
  run.lives = Math.max(0, run.lives - 1);
  run.skiff = freshSkiff(run.mode === 'smuggler');
  run.smugglerFlight = null;
  retry(run);
  run.phase = 'gameover';
}
/** A destroyed combat ship respawns into its current fight while lives remain. */
export function loseCombatLife(run: RunState): void {
  if (run.lives <= 1) { loseLife(run); return; }
  run.lives--;
  run.pilot.hull = 100;
  run.pilot.shield = run.pilot.maxShield;
  resetChain(run);
}
export function advance(run: RunState): void {
  if (!run.cleared) return;
  if (run.mode === 'journey' && run.stage >= JOURNEY_STAGE_COUNT) { run.phase = 'victory'; return; }
  run.stage += 1;
  run.blastUsed = false;
  run.smugglerFlight = null;
  run.smugglerResult = null;
  run.phase = 'briefing';
  run.cleared = false;
  run.elapsed = 0;
  run.timeRemaining = STAGE_TIME_LIMIT;
  run.timeBonus = null;
  run.kills = 0;
  run.accuracy = emptyAccuracy();
  run.earlyCore = false;
  run.stageReward = 0;
  run.stageHaul = null;
  run.bonusStatus = 'available';
  run.pilot.wanted = createInitialProgress().wanted;
  if (run.mode !== 'invaders') run.pilot.shield = Math.min(run.pilot.maxShield, run.pilot.shield + 25);
  // Bank the finished stage, purchases and optional rewards as the next retry baseline.
  run.checkpoint = resources(run);
}
export function recordRun(profile: ProfileSaveV2, run: RunState): void {
  if (run.practice) return;
  const key: keyof ProfileSaveV2['records'] = `${run.mode}${run.continued ? 'Continued' : ''}`;
  profile.records[key] = Math.max(profile.records[key], run.pilot.score);
  recordScore(profile, run);
  if (run.stage >= 4 && run.cleared && !profile.unlocked.includes('spread')) profile.unlocked.push('spread');
  if (run.stage >= 8 && run.cleared && !profile.unlocked.includes('lance')) profile.unlocked.push('lance');
}

export function freshProfile(legacy: unknown = null): ProfileSaveV2 {
  const old = legacy && typeof legacy === 'object' ? legacy as Record<string, unknown> : {};
  const unlocked: WeaponFamily[] = ['pulse'];
  if (Number(old.unlockedWeaponLevel) >= 2) unlocked.push('spread');
  if (Number(old.unlockedWeaponLevel) >= 3) unlocked.push('lance');
  return { version: 2, settings: { aimAssist: true, muted: false, controlScheme: 'mouse', tiltSensitivity: 1, mouseSensitivity: 1 }, unlocked, legacyScore: Math.max(0, Number(old.bestScore) || 0),
    records: { journey: 0, endless: 0, invaders: 0, smuggler: 0, tunnels: 0, journeyContinued: 0, endlessContinued: 0, invadersContinued: 0, smugglerContinued: 0, tunnelsContinued: 0 }, scoreboards: emptyScoreboards(), checkpoints: {} };
}
/**
 * Free-flight modes store checkpoint resources; tunnels retain the exact encounter
 * including moving ships and pending projectile outcomes.
 * An interrupted fight restarts; a paid shop/result stays paid. Clone first so
 * pausing and saving cannot reset the live game the player is about to resume.
 */
export function saveCheckpoint(profile: ProfileSaveV2, run: RunState): void {
  if (run.practice) return;
  const saved = clone(run);
  if (run.mode === 'tunnels') { profile.checkpoints.tunnels = saved; return; }
  if (!saved.cleared && (saved.phase === 'playing' || saved.phase === 'briefing')) retry(saved);
  if (saved.mode === 'smuggler' && (saved.phase === 'bonus' || saved.phase === 'bonusResult')) retry(saved);
  else {
    if (saved.phase === 'bonus') { saved.phase = 'shop'; saved.bonusStatus = 'settled'; }
    if (saved.phase === 'bonusResult') saved.phase = 'shop';
  }
  profile.checkpoints[run.mode] = saved;
}
/** Validate stored profiles and supply defaults for missing fields. */
export function parseProfile(raw: string | null, legacy: string | null, defaultScheme: ControlScheme = 'mouse'): ProfileSaveV2 {
  let old: unknown = null;
  try { old = legacy ? JSON.parse(legacy) : null; } catch { /* Invalid imported data must not prevent a new game. */ }
  const fallback = freshProfile(old);
  fallback.settings.controlScheme = defaultScheme;
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as ProfileSaveV2;
    if (parsed.version !== 2) return fallback;
    const profile = freshProfile(old);
    profile.settings.controlScheme = defaultScheme;
    profile.unlocked = FAMILIES.filter(family => family === 'pulse' || parsed.unlocked?.includes(family));
    profile.settings.aimAssist = parsed.settings?.aimAssist !== false;
    profile.settings.muted = parsed.settings?.muted === true;
    if (isControlScheme(parsed.settings?.controlScheme)) profile.settings.controlScheme = parsed.settings.controlScheme;
    profile.settings.tiltSensitivity = tiltSensitivity(parsed.settings?.tiltSensitivity);
    profile.settings.mouseSensitivity = mouseSensitivity(parsed.settings?.mouseSensitivity);
    profile.legacyScore = Math.max(fallback.legacyScore, Number(parsed.legacyScore) || 0);
    profile.scoreboards = parseScoreboards(parsed.scoreboards);
    for (const key of Object.keys(profile.records) as Array<keyof typeof profile.records>) profile.records[key] = Math.max(0, Number(parsed.records?.[key]) || 0);
    for (const mode of GAME_MODES) {
      const run = parsed.checkpoints?.[mode];
      if (validCheckpoint(run, mode)) {
        run.skiff = parseSkiff(run.skiff, mode === 'smuggler' || mode === 'tunnels');
        if (mode === 'tunnels') {
          const tunnel = parseTunnel(run.tunnel, run.stage);
          if (run.tunnel && !tunnel) { retry(run); run.skiff = freshSkiff(true); }
          run.tunnel = tunnel;
        }
        run.smugglerFlight = run.smugglerFlight ? parseSmugglerFlight(run.smugglerFlight) : null;
        run.smugglerResult = parseSmugglerResult(run.smugglerResult);
        run.accuracy = parseAccuracy(run.accuracy);
        run.blastUsed ??= false;
        if (typeof run.id !== 'string') run.id = `${mode}-legacy-${run.seed}`;
        const lifeInterval = lifeScoreInterval(mode);
        if (run.nextLifeScore === undefined) run.nextLifeScore = (Math.floor(run.pilot.score / lifeInterval) + 1) * lifeInterval;
        // Align stored milestones to the mode's interval without repeating an award.
        if (run.nextLifeScore % lifeInterval !== 0) run.nextLifeScore = Math.max(Math.ceil(run.nextLifeScore / lifeInterval), Math.floor(run.pilot.score / lifeInterval) + 1) * lifeInterval;
        if (mode === 'invaders' && run.cleared && run.phase === 'shop') run.phase = 'recovery';
        if (run.stageReward === undefined) run.stageReward = 0;
        if (run.stageHaul === undefined) run.stageHaul = null;
        // Default missing clocks without paying for already-completed gate travel.
        if (run.timeRemaining === undefined) run.timeRemaining = Math.max(0, STAGE_TIME_LIMIT - (Number.isFinite(run.elapsed) ? Math.max(0, run.elapsed) : 0));
        if (run.timeBonus === undefined) run.timeBonus = run.cleared && !['cleared', 'recovery'].includes(run.phase) ? 0 : null;
        // A saved victory below the final stage resumes at its dock.
        if (mode === 'journey' && run.phase === 'victory' && run.stage < JOURNEY_STAGE_COUNT && run.cleared) run.phase = 'shop';
        run.chain.recent = Array.isArray(run.chain.recent) ? run.chain.recent.filter(age => Number.isFinite(age) && age >= 0 && age <= 5) : [];
        saveCheckpoint(profile, run);
      }
    }
    return profile;
  } catch { return fallback; }
}
// Browser storage can be edited or incomplete. Validate nested
// resources before runtime code assumes that inventory, tiers and lives exist.
function validCheckpoint(run: RunState | undefined, mode: GameMode): run is RunState {
  if (!run || run.mode !== mode || !Number.isInteger(run.stage) || run.stage < 1 || (mode === 'journey' && run.stage > JOURNEY_STAGE_COUNT)) return false;
  if (run.practice !== undefined && run.practice !== false) return false;
  if (run.blastUsed !== undefined && typeof run.blastUsed !== 'boolean') return false;
  // Accept positive stored milestones before aligning them to the current rules.
  if (run.nextLifeScore !== undefined && (!Number.isSafeInteger(run.nextLifeScore) || run.nextLifeScore <= 0)) return false;
  if (run.stageReward !== undefined && !Number.isSafeInteger(run.stageReward)) return false;
  if (run.stageHaul !== undefined && run.stageHaul !== null && (!Number.isSafeInteger(run.stageHaul) || run.stageHaul < 0)) return false;
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
