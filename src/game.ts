/**
 * Application coordinator: joins input, pure run rules, world systems and menus.
 * Start reading at the constructor, then frame(), step() and completeStage().
 * Session controllers own life, objective and transition decisions. This class
 * connects their outcomes to world objects, input, sound and browser presentation.
 */
import * as THREE from 'three';
import { FlightLifecycle } from './session/flight-lifecycle';
import { encounterComplete, pirateSalvage } from './session/encounter-outcome';
import type { LifeDecision } from './session/flight-lifecycle';
import { afterGate, completeEncounter, enterBonus, nextStage as advanceStage, resumeDestination, settleCourse } from './session/stage-flow';
import { awardScoreLives } from './life-rewards';
import { PlayerProtection } from './rendering/player-protection';
import { bonusFor, clone, dock, newRun, parseProfile, pickup, purchase, recordRun, retry, rewardInterception, rewardKill, SAVE_V2, saveCheckpoint, tickChain } from './arcade';
import { settleTimeBonus, STAGE_TIME_LIMIT, tickStageTime, timeBonusSeconds, TIME_BONUS_RATE } from './arcade';
import type { BonusKind, EnemyArchetype, GameMode, ProfileSaveV2, Purchase, RunState, WeaponFamily } from './arcade';
import { configureArmadaCamera } from './armada';
import { BONUS_NAMES, BonusController } from './bonus';
import { bonusDifficulty } from './bonus-difficulty';
import type { BonusRunState } from './bonus';
import { crossedGate, EncounterDirector, Random, stageDefinition } from './encounters';
import type { StageDefinition } from './encounters';
import { ProjectileSystem } from './combat/projectiles';
import { ShotAccuracy, accuracyPercent } from './combat/accuracy';
import { EnemySystem } from './combat/enemies';
import { EffectsSystem, createStarfield } from './rendering/effects';
import { HudController } from './rendering/hud';
import { MenuViews } from './menus/views';
import { FrontMenus } from './menus/front';
import { SmugglerMenus } from './menus/smuggler';
import { MODE_INFO, isGameMode } from './modes';
import { smugglerLeg } from './smuggler';
import { ActorWorld } from './world/actors';
import { WorldInteractions } from './world/interactions';
import type { Actor } from './combat/types';
import { FlightInput } from './input';
import { moveShip } from './flight-motion';
import { assistedAim } from './combat/aim';
import { isControlScheme } from './input-layouts';
import { createWarpRun, LEVEL_WARP_KEY, LevelWarpCode, WARP_BONUSES } from './level-warp';
import { attackFaction, SAVE_KEY } from './logic';
import type { CargoDrop, CargoType, Faction } from './logic';
import { updateWarpCueVisuals } from './models';
import type { createArmadaRig } from './models';
import { SoundBank } from './sound';
import { GameUI } from './ui';
import { button } from './menus/menu-shell';
import { selectWeapon, weaponSpec } from './weapons';
import type { WeaponCommand } from './weapons';

// Simulation time is measured in seconds. Rendering can run at any display rate;
// gameplay always advances in these fixed increments.
const STEP = 1 / 60;

export class ArcadeGame {
  readonly ui: GameUI;
  private readonly hudController: HudController;
  readonly scene = new THREE.Scene();
  readonly world = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 6000);
  readonly renderer: THREE.WebGLRenderer;
  readonly sound = new SoundBank();
  readonly input: FlightInput;
  private profile: ProfileSaveV2;
  // A title screen can exist without a run. profile holds long-lived progress;
  // runState is the one active flight, whose stage resources can be rolled back.
  private runState: RunState | null = null;
  private selectedMode: GameMode = 'journey';
  private selectedFamily: WeaponFamily = 'pulse';
  private controlsReturn = 'title';
  private readonly levelWarpCode = new LevelWarpCode();
  private levelWarpUnlocked = false;
  private definition: StageDefinition = stageDefinition('journey', 1);
  private director = new EncounterDirector(this.definition);
  private rng = new Random(1);
  private readonly actorWorld = new ActorWorld(this.world, () => this.nextId++);
  // Controllers report events through callbacks instead of importing this class.
  // That keeps their rules testable without a DOM, audio device or WebGL renderer.
  private readonly worldInteractions = new WorldInteractions(this.actorWorld, {
    collected: (drop, upgraded) => {
      this.stats.pickups += 1;
      if (upgraded) {
        if (this.stats.firstUpgrade < 0) this.stats.firstUpgrade = this.run.elapsed;
        this.log(`${this.run.family.toUpperCase()} UPGRADED TO TIER ${this.run.tiers[this.run.family]}`);
      } else this.log(drop.type === 'shieldCell' ? 'REPAIR CELL: +30 HULL / +30 SHIELD' : drop.type === 'weaponCore' ? this.run.mode === 'invaders' ? 'WEAPON CORE: +200 POINTS' : 'WEAPON CORE: +200 UPGRADE CREDITS' : `${drop.type.replace(/([A-Z])/g, ' $1').toUpperCase()} COLLECTED`);
      this.checkScoreLives();
      this.sound.pickup();
    },
    traded: message => { this.log(message); this.sound.pickup(); },
    warning: message => { this.log(message); this.sound.warning(); }
  });
  private get actors(): readonly Actor[] { return this.actorWorld.actors; }
  private readonly projectiles = new ProjectileSystem(this.world, () => this.nextId++);
  private readonly accuracy = new ShotAccuracy();
  private readonly enemies = new EnemySystem({
    addActor: (...args) => this.addActor(...args),
    removeActor: actor => this.removeActor(actor),
    destroy: (actor, byPlayer) => this.destroy(actor, byPlayer),
    damagePlayer: (damage, message) => this.damagePlayer(damage, message),
    announceArrival: (actors, message) => this.announceArrival(actors, message),
    spawnShot: (...args) => this.spawnShot(...args),
    enemyShoot: (faction, distance) => this.sound.enemyShoot(faction, distance),
    stopped: () => !!this.flight.menu || this.flight.pendingRespawn !== null
  });
  private get shots() { return this.projectiles.shots; }
  private readonly effects = new EffectsSystem(this.world, () => this.rng, position => this.sound.shatter(position.distanceTo(this.position)));
  private readonly position = new THREE.Vector3();
  // Keep both positions for swept collisions: a fast move must not skip a gate or shot.
  private readonly previousPosition = new THREE.Vector3();
  private readonly orientation = new THREE.Quaternion();
  private readonly stars: THREE.Points;
  private bonus: BonusController | null = null;
  // menu is a screen name; run.phase is gameplay progress. They are intentionally
  // separate: opening Controls must not discard a paused course or recovery interval.
  private readonly flight = new FlightLifecycle();
  private nextId = 1;
  private shotDelay = 0;
  private readonly protection = new PlayerProtection();
  private recovery = 8;
  private warp = 0;
  private rescued = false;
  private objectiveShip: Actor | null = null;
  private objectivePod: Actor | null = null;
  private base: Actor | null = null;
  private gate: Actor | null = null;
  private armadaRig: ReturnType<typeof createArmadaRig> | null = null;
  private elapsedFrame = performance.now();
  private accumulator = 0;
  private hudTime = 0;
  private messages: Array<{ text: string; ttl: number }> = [];
  private feedbackTime = 0;
  private arrivalTime = 0;
  private arrivalMessage = '';
  private popupTime = 0;
  private hitTime = 0;
  private threat: Actor | null = null;
  private stats = { shots: 0, enemyShots: 0, kills: 0, interceptions: 0, npcHits: 0, pickups: 0, firstCombat: -1, firstUpgrade: -1, frames: 0, frameMs: 0 };

  constructor() {
    let raw: string | null = null;
    let legacy: string | null = null;
    try { raw = localStorage.getItem(SAVE_V2); legacy = localStorage.getItem(SAVE_KEY); } catch { /* Play without persistence when browser storage is unavailable. */ }
    this.profile = parseProfile(raw, legacy);
    try { this.levelWarpUnlocked = sessionStorage.getItem(LEVEL_WARP_KEY) === 'unlocked'; } catch { /* Unlock still works without storage. */ }
    this.ui = new GameUI(action => this.action(action));
    this.hudController = new HudController(this.ui);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0);
    this.ui.viewport.append(this.renderer.domElement);
    this.scene.add(this.world);
    this.scene.fog = new THREE.FogExp2(0, 0.00035);
    this.stars = createStarfield();
    this.scene.add(this.stars);
    this.input = new FlightInput(this.renderer.domElement, () => this.pause(), () => this.special(), command => this.switchWeapon(command));
    this.input.setScheme(this.profile.settings.controlScheme);
    this.renderer.domElement.tabIndex = -1;
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', event => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) { this.levelWarpCode.reset(); return; }
      if (this.flight.menu === 'title' && ['ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
      if (this.levelWarpCode.press(event.code, this.flight.menu === 'title', event.repeat) && !this.levelWarpUnlocked) this.unlockLevelWarp();
    });
    window.addEventListener('blur', () => this.levelWarpCode.reset());
    this.resize();
    this.showTitle();
    if (import.meta.env.DEV) window.vectorShooterDebug = this.createDebugApi();
    requestAnimationFrame(this.frame);
  }
  private get run(): RunState { return this.runState!; }
  private log(text: string): void { this.messages.unshift({ text, ttl: 4 }); this.messages = this.messages.slice(0, 3); }
  private persist(): void {
    if (this.runState) saveCheckpoint(this.profile, this.run);
    try { localStorage.setItem(SAVE_V2, JSON.stringify(this.profile)); } catch { /* Saving is optional for local play. */ }
  }
  private record(run = this.run): void { if (run) recordRun(this.profile, run); this.persist(); }
  private show(screen: string, title: string, status: string, content: string): void {
    // Opening any menu releases pointer lock and held inputs before making buttons live.
    this.flight.menu = screen;
    this.levelWarpCode.reset();
    this.input.release();
    this.ui.show(screen, title, status, content);
  }
  private showTitle(): void {
    this.flight.paused = false;
    this.ui.selectMode(this.selectedMode);
    this.show(...MenuViews.title(this.profile, this.selectedMode, this.selectedFamily, this.levelWarpUnlocked));
    this.ui.text('arcadeBest', this.profile.records[this.selectedMode].toString().padStart(6, '0'));
  }
  private unlockLevelWarp(): void {
    this.levelWarpUnlocked = true;
    try { sessionStorage.setItem(LEVEL_WARP_KEY, 'unlocked'); } catch { /* Keep the unlock in memory. */ }
    this.showTitle();
    this.ui.text('briefingStatus', 'BONUS UNLOCKED - LEVEL WARP');
    document.querySelector<HTMLButtonElement>('#levelWarpButton')!.focus({ preventScroll: true });
    this.sound.setMuted(this.profile.settings.muted);
    void this.sound.start().then(() => this.sound.unlock()).catch(() => { /* The visual unlock remains available without audio. */ });
  }
  private showLevelWarp(): void {
    if (!this.levelWarpUnlocked || !this.flight.menu || (this.flight.menu !== 'title' && !this.runState?.practice)) return;
    if (this.bonus) { if (this.run.mode === 'smuggler') this.disposeCourse(); else this.finishBonus('exit'); }
    this.show(...MenuViews.levelWarp(this.runState));
  }
  private warpTo(mode: GameMode, stage: number, bonus = false): void {
    if (!this.levelWarpUnlocked || this.flight.menu !== 'levelWarp') return;
    this.runState = createWarpRun(mode, stage, this.selectedFamily, bonus);
    this.loadStage();
    if (bonus) this.showBonusOffer(); else this.briefing();
  }
  private warpBackButton(): string { return this.runState?.practice ? button('levelWarp', 'CHOOSE LEVEL') : ''; }
  private briefing(): void {
    this.show(...MenuViews.briefing(this.run, this.definition, this.profile.settings.controlScheme));
  }
  private async play(): Promise<void> {
    // Clear the menu/start-wave click before audio startup yields to another frame.
    this.input.clear();
    // Smuggler uses the same course renderer as bonus sorties, but keeps normal
    // run phases and life-loss rules. Optional sorties use phase="bonus" instead.
    if (this.run.mode === 'smuggler' && !this.bonus && !this.run.cleared) {
      const leg = smugglerLeg(this.run.stage); this.startCourse(leg.kind, leg.difficulty);
    }
    this.flight.launch(this.run);
    this.ui.hide();
    this.renderer.domElement.focus({ preventScroll: true });
    this.sound.setMuted(this.profile.settings.muted);
    try { await this.sound.start(); } catch { this.log('AUDIO UNAVAILABLE'); }
    await this.input.engage();
  }
  private pause(): void {
    if (!this.flight.pause(this.runState)) return;
    this.persist();
    this.show('pause', 'PAUSED', `${MODE_INFO[this.run.mode].name} / ${this.bonus ? BONUS_NAMES[this.bonus.state.kind] : this.definition.title}`, `
      <div class="menu-actions">${button('unpause', 'RESUME', 'id="launchButton"')}${this.bonus && this.run.mode !== 'smuggler' ? button('exitBonus', 'EXIT BONUS SAFELY') : ''}${button('controls', 'CONTROLS')}${this.run.phase === 'recovery' ? button('nextWave', 'NEXT WAVE') : ''}${this.warpBackButton()}${button('title', this.run.practice ? 'TITLE SCREEN' : 'SAVE AND TITLE')}</div>
      <p class="menu-description">${this.run.practice ? 'TEST FLIGHT / SAVED PROGRESS SAFE' : this.run.mode === 'smuggler' ? 'Leaving restarts this leg. Unbanked points are discarded; lives are preserved.' : this.bonus ? 'Your main ship and lives are safe.' : 'Leaving saves the current stage checkpoint.'}</p>`);
  }
  private action(action: string): void {
    // Menu markup supplies data-action strings. Route commands here; menu builders
    // only describe what to display and do not mutate gameplay themselves.
    if (action === 'controls') { this.controlsReturn = this.flight.menu === 'pause' ? 'backToPause' : 'title'; this.show(...FrontMenus.controls(this.profile, this.controlsReturn)); return; }
    if (action === 'backToPause') { this.flight.paused = false; this.pause(); return; }
    if (action === 'weapons') { this.show(...FrontMenus.weapons(this.profile, this.selectedFamily)); return; }
    if (action === 'objects') { this.show(...FrontMenus.objects()); return; }
    if (action === 'scores' || action.startsWith('scores:')) {
      const mode = action.slice(7); if (isGameMode(mode)) this.selectedMode = mode;
      this.show(...FrontMenus.scores(this.profile, this.selectedMode)); return;
    }
    if (action.startsWith('controls:') && this.flight.menu === 'controls') {
      const scheme = action.slice(9);
      if (isControlScheme(scheme)) {
        this.profile.settings.controlScheme = scheme; this.input.setScheme(scheme); this.persist(); this.show(...FrontMenus.controls(this.profile, this.controlsReturn));
      }
      return;
    }
    if (action === 'levelWarp') { this.showLevelWarp(); return; }
    if (this.levelWarpUnlocked && this.flight.menu === 'levelWarp') {
      if (action === 'warpInvaders' || action === 'warpSmuggler') {
        const field = document.querySelector<HTMLInputElement>(`#${action}`)!;
        if (field.reportValidity()) this.warpTo(action === 'warpInvaders' ? 'invaders' : 'smuggler', field.valueAsNumber);
        return;
      }
      if (action === 'warpJourney') { this.warpTo('journey', Number(document.querySelector<HTMLSelectElement>('#warpStage')!.value)); return; }
      if (action === 'warpEndless') {
        const wave = document.querySelector<HTMLInputElement>('#warpWave')!;
        if (wave.reportValidity()) this.warpTo('endless', wave.valueAsNumber);
        return;
      }
      if (action.startsWith('warpBonus:')) {
        const kind = action.slice(10) as BonusKind;
        const difficulty = Number(document.querySelector<HTMLSelectElement>('#warpDifficulty')!.value);
        if (Object.hasOwn(WARP_BONUSES, kind)) this.warpTo('journey', WARP_BONUSES[kind] + 12 * (difficulty - 1), true);
        return;
      }
    }
    if (action.startsWith('mode:')) { const mode = action.slice(5); if (isGameMode(mode)) this.selectedMode = mode; this.showTitle(); return; }
    if (action.startsWith('startFamily:')) { const f = action.slice(12) as WeaponFamily; if (this.profile.unlocked.includes(f)) this.selectedFamily = f; if (this.flight.menu === 'weapons') this.show(...FrontMenus.weapons(this.profile, this.selectedFamily)); else this.showTitle(); return; }
    if (action === 'newRun') {
      this.runState = newRun(this.selectedMode, Date.now(), this.selectedFamily);
      this.loadStage(); this.persist(); this.briefing(); return;
    }
    if (action === 'resumeRun') {
      const saved = this.profile.checkpoints[this.selectedMode];
      if (!saved) return;
      this.runState = clone(saved);
      this.loadStage();
      const destination = resumeDestination(this.run);
      if (destination === 'gameover') this.showGameOver();
      else if (destination === 'smugglerResult') this.show(...SmugglerMenus.result(this.run));
      else if (destination === 'shop') this.showShop();
      else if (destination === 'bonusOffer') this.showBonusOffer();
      else this.briefing();
      return;
    }
    if (action === 'launch' || action === 'unpause') { void this.play(); return; }
    if (action === 'pause') { this.pause(); return; }
    if (action === 'title') {
      if (this.bonus) { if (this.run.mode === 'smuggler') this.disposeCourse(); else this.finishBonus('exit'); }
      this.persist(); this.showTitle(); return;
    }
    if (action === 'assist') { this.profile.settings.aimAssist = !this.profile.settings.aimAssist; this.persist(); this.show(...FrontMenus.controls(this.profile, this.controlsReturn)); return; }
    if (action === 'mute') { this.profile.settings.muted = !this.profile.settings.muted; this.sound.setMuted(this.profile.settings.muted); this.persist(); this.show(...FrontMenus.controls(this.profile, this.controlsReturn)); return; }
    if (action === 'relaunch') {
      retry(this.run, this.run.lives === 0);
      this.loadStage(); this.persist(); void this.play(); return;
    }
    if (action.startsWith('equip:') && this.run.phase === 'shop') {
      this.run.family = action.slice(6) as WeaponFamily;
      this.run.pilot.weaponLevel = this.run.tiers[this.run.family]; this.persist(); this.showShop(); return;
    }
    if (action.startsWith('buy:')) {
      if (purchase(this.run, action.slice(4) as Purchase)) this.sound.pickup();
      this.persist(); this.showShop(); return;
    }
    if (action === 'depart' || action === 'nextWave') { this.nextStage(action === 'nextWave'); return; }
    if (action === 'bonusPlay') { this.enterBonus(); return; }
    if (action === 'bonusSkip') { if (this.run.bonusStatus !== 'available') return; this.run.bonusStatus = 'skipped'; this.showShop(); return; }
    if (action === 'bonusDock') { this.showShop(); return; }
    if (action === 'exitBonus' && this.run.mode !== 'smuggler') this.finishBonus('exit');
  }
  private showShop(): void {
    dock(this.run); this.persist();
    this.show(...MenuViews.shop(this.run));
  }
  private showBonusOffer(): void {
    const kind = bonusFor(this.run);
    if (!kind || this.run.bonusStatus !== 'available') { this.showShop(); return; }
    this.run.phase = 'bonusOffer'; this.persist();
    this.show(...MenuViews.bonusOffer(this.run, kind, this.profile.settings.controlScheme));
  }
  private enterBonus(): void {
    const kind = enterBonus(this.run);
    if (!kind) return;
    this.persist();
    this.startCourse(kind, bonusDifficulty(this.run.mode, this.run.stage));
    void this.play();
  }
  private startCourse(kind: BonusKind, difficulty: number): void {
    // Keep the main world allocated but hidden while a temporary course owns the
    // camera. Normal bonus equipment remains separate from the parked main ship.
    this.bonus = new BonusController(kind, this.run.seed + this.run.stage, difficulty);
    this.bonus.state.family = this.run.family;
    this.input.autoFlight = kind === 'canyon';
    this.messages = []; this.feedbackTime = 0; this.popupTime = 0; this.hitTime = 0; this.arrivalTime = 0;
    this.world.visible = false; this.scene.add(this.bonus.root);
    this.camera.position.set(0, 0, 0); this.camera.quaternion.identity();
    this.shotDelay = 0;
  }
  private disposeCourse(): void {
    if (this.bonus) { this.scene.remove(this.bonus.root); this.bonus.dispose(); this.bonus = null; }
    this.input.autoFlight = false; this.world.visible = true;
  }
  private finishSmuggler(reason: NonNullable<BonusRunState['reason']>): void {
    // Identical course outcomes have different stakes in Smuggler: delivery banks
    // the haul, while route failure spends a real run life and restores its checkpoint.
    if (!this.bonus) return;
    this.bonus.finish(reason);
    const result = settleCourse(this.run, this.bonus.state, this.bonus.ratio);
    this.disposeCourse(); this.flight.paused = false; this.record();
    if (!result || result.kind !== 'smuggler') return;
    if (!result.success) this.handleLifeDecision(this.flight.afterLifeSpent(this.run, 'checkpoint'));
    else { if (result.extraLives) this.sound.pickup(); else this.sound.complete(); this.show(...SmugglerMenus.result(this.run, result.extraLives)); }
  }
  private finishBonus(reason: NonNullable<BonusRunState['reason']>): void {
    if (this.run.mode === 'smuggler') { this.finishSmuggler(reason); return; }
    if (!this.bonus) return;
    this.bonus.finish(reason);
    const outcome = this.bonus.state.reason;
    const state = this.bonus.state;
    const scoreSummary = state.kind === 'sequence' ? `<p id="targetResults">TARGETS ${state.nextMarker - 1}/${state.targetCount} / SHOTS ${state.shotsFired} / NET ${state.points}</p>` : '';
    const result = settleCourse(this.run, state, this.bonus.ratio);
    this.scene.remove(this.bonus.root); this.bonus.dispose(); this.bonus = null;
    this.input.autoFlight = false;
    this.world.visible = true; this.updateCamera(); this.flight.paused = false;
    this.record();
    if (!result || result.kind !== 'bonus') { this.showShop(); return; }
    if (outcome === 'wall' || outcome === 'crash') this.sound.damage(); else this.sound.complete();
    const reasonText = outcome === 'missedGates' ? 'TWO CONSECUTIVE GATES MISSED' : outcome === 'gateMissed' ? 'EXIT GATE MISSED' : outcome === 'wall' ? 'EXIT MISSED / WALL IMPACT'
      : outcome === 'crash' ? 'LOAN SKIFF DESTROYED' : outcome === 'timeout' ? 'TIME UP' : outcome === 'exit' ? 'BONUS EXITED' : 'BONUS COMPLETE';
    this.show('bonusResult', result.medal, `${reasonText} / MAIN SHIP SAFE`, `<p class="result-score">+${result.score} POINTS</p>${scoreSummary}<p>+${result.credits} CREDITS${result.extraLife ? ' / EXTRA LIFE' : ''}</p><div class="menu-actions">${button('bonusDock', 'CONTINUE TO DOCK', 'id="launchButton"')}${this.warpBackButton()}</div>`);
  }
  private showGameOver(): void {
    this.flight.showGameOver();
    this.show(...MenuViews.gameOver(this.run));
  }
  private fail(message: string, restart = false): void {
    const decision = this.flight.fail(this.run, restart ? 'checkpoint' : 'combat');
    if (decision.type === 'ignored') return;
    this.log(message); this.handleLifeDecision(decision);
  }
  private handleLifeDecision(decision: LifeDecision): void {
    if (decision.type === 'ignored') return;
    if (decision.record) this.record(decision.record); else this.persist();
    if (decision.type === 'gameover') { this.protection.clear(); this.sound.gameOver(); this.showGameOver(); }
    else this.sound.explosion(0);
  }
  private respawn(): void {
    const kind = this.flight.consumeRespawn(this.run);
    if (!kind) return;
    if (kind === 'checkpoint') {
      this.loadStage(this.flight.protection);
      if (this.run.mode === 'smuggler') { const leg = smugglerLeg(this.run.stage); this.startCourse(leg.kind, leg.difficulty); }
    }
    this.position.set(0, 0, 0); this.previousPosition.copy(this.position); this.orientation.identity();
    this.projectiles.clearHostileFire(this.position);
    this.protection.start(this.armadaRig?.craft, this.flight.protection);
    this.bonus?.protect(this.flight.protection);
    this.feedbackTime = 0;
    this.log(`${this.run.lives} LIVES LEFT / RESPAWN SHIELD`);
    this.updateCamera();
  }
  private checkScoreLives(): void {
    if (this.run.mode !== 'invaders') return;
    const gained = awardScoreLives(this.run);
    if (gained) { this.log(`EXTRA LIFE +${gained}! / ${this.run.lives} LIVES`); this.sound.pickup(); }
  }
  private nextStage(autoPlay = false): void {
    const result = advanceStage(this.run, !!this.bonus);
    if (!result) return;
    this.record();
    if (result.route === 'victory') { this.victory(); return; }
    this.loadStage(this.flight.protection);
    if (this.flight.protection > 0) this.protection.start(this.armadaRig?.craft, this.flight.protection);
    if (result.timeBonus !== null) {
      this.log(`TIME BONUS BANKED +CR ${result.timeBonus}`);
      if (result.timeBonus > 0) this.sound.pickup();
    }
    if (autoPlay) void this.play(); else this.briefing();
  }
  private victory(): void {
    this.show(...MenuViews.victory(this.run));
  }
  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const real = Math.min((now - this.elapsedFrame) / 1000, 0.1); this.elapsedFrame = now;
    // UI animation/countdowns use elapsed display time, including while gameplay
    // is paused. Clamp long gaps so returning to the browser cannot fast-forward a run.
    this.stats.frames += 1; this.stats.frameMs += real * 1000;
    this.ui.tick(real);
    if (this.flight.tickDisplay(real, document.hidden)) this.showTitle();
    else if (this.flight.menu === 'gameover') this.ui.text('deathTimer', String(Math.ceil(this.flight.deathCountdown)));
    if (this.flight.canStep(this.runState)) {
      this.accumulator += real;
      // A slow display frame may need multiple simulation ticks; a fast one may
      // need none. A menu opened by a fatal hit stops the remaining ticks immediately.
      while (this.accumulator >= STEP) { this.accumulator -= STEP; this.step(STEP); if (this.flight.menu) { this.accumulator = 0; break; } }
    } else this.accumulator = 0;
    this.hudTime += real;
    if (this.hudTime >= 0.05) { this.hudTime = 0; this.hud(); }
    this.renderer.render(this.scene, this.camera);
  };
  private resize(): void {
    this.renderer.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.ui.resize();
    if (this.runState && !this.bonus) this.updateCamera();
  }
  private updateCamera(): void {
    const locked = this.definition.kind === 'armada' && (!this.run.cleared || this.run.mode === 'invaders');
    if (this.armadaRig) {
      this.armadaRig.root.visible = locked;
      this.armadaRig.craft.position.copy(this.position);
    }
    if (locked) configureArmadaCamera(this.camera);
    else { this.camera.position.copy(this.position); this.camera.quaternion.copy(this.orientation); }
  }

  private loadStage(protectedTime = 0): void {
    // Rebuild only transient world state from the run's seed/stage. Resource rollback
    // belongs to retry(), so loading a paid shop cannot erase its purchases.
    this.protection.clear(); this.flight.resetStage(protectedTime);
    this.disposeCourse();
    this.input.autoFlight = false;
    this.projectiles.clear();
    this.accuracy.clear();
    this.enemies.reset();
    this.effects.clear();
    this.actorWorld.clear();
    this.world.visible = true;
    this.armadaRig = null;
    this.messages = [];
    this.feedbackTime = 0; this.popupTime = 0; this.hitTime = 0; this.threat = null; this.arrivalTime = 0;
    this.definition = stageDefinition(this.run.mode, this.run.stage);
    this.director = new EncounterDirector(this.definition);
    this.rng = new Random((this.run.seed + this.run.stage * 7919) >>> 0);
    this.position.set(0, 0, 0); this.previousPosition.copy(this.position); this.orientation.identity();
    this.input.throttle = this.definition.kind === 'armada' ? 0 : 65;
    this.warp = 0; this.worldInteractions.reset();
    this.shotDelay = 0; this.rescued = false; this.objectiveShip = null; this.objectivePod = null;
    this.flight.paused = false; this.recovery = this.definition.difficulty.recovery; this.run.elapsed = 0;
    this.stats = { shots: 0, enemyShots: 0, kills: 0, interceptions: 0, npcHits: 0, pickups: 0, firstCombat: -1, firstUpgrade: -1, frames: 0, frameMs: 0 };
    if (this.run.mode === 'smuggler') { this.base = null; this.gate = null; this.updateCamera(); return; }
    const level = this.actorWorld.createLevel(this.run, this.definition);
    this.base = level.base; this.gate = level.gate; this.objectiveShip = level.objectiveShip;
    this.objectivePod = level.objectivePod; this.armadaRig = level.armadaRig;
    if (this.run.cleared) { this.director.drain(); if (this.run.phase !== 'recovery') this.activateGate(); }
    this.updateCamera();
    this.log(this.run.mode === 'invaders' ? 'HOLD THE DEFENSIVE LANE - BREAK THE ALIEN FORMATION' : this.definition.kind === 'armada' ? this.run.cleared ? 'TRACTOR BEAM RELEASED' : 'TRACTOR BEAM LOCKED - DESTROY THE ARMADA TO ESCAPE' : this.definition.title);
  }
  private addActor(...args: Parameters<ActorWorld['add']>): Actor { return this.actorWorld.add(...args); }
  private spawnCargo(drop: CargoDrop, position: THREE.Vector3, essential = false): Actor {
    return this.actorWorld.cargo(drop, position, essential, this.definition.kind === 'armada');
  }
  private hostiles(): Actor[] { return this.actors.filter(actor => !actor.dead && (actor.kind === 'pirate' || actor.kind === 'mine')); }
  private forward(): THREE.Vector3 { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.orientation); }
  private spawnPack(roles: EnemyArchetype[]): void {
    const arrivals = this.actorWorld.spawnPack(roles, { run: this.run, definition: this.definition, position: this.position, orientation: this.orientation, rng: this.rng });
    if (arrivals.length) this.announceArrival(arrivals, roles.includes('carrier') ? 'CARRIER WARPED IN' : `${roles.length} ${this.run.mode === 'invaders' ? 'ALIEN' : 'PIRATE'} REINFORCEMENTS WARPED IN`);
  }
  private announceArrival(actors: Actor[], message: string): void {
    this.arrivalTime = 4; this.arrivalMessage = message; this.log(message); this.sound.reinforcements();
    this.effects.warpIn(actors, this.orientation);
  }
  private step(dt: number): void {
    // Consume input once per tick, then hand it to exactly one movement system:
    // a course controller, the armada lane, or unrestricted local-axis flight.
    if (this.flight.pendingRespawn) this.respawn();
    this.flight.tick(this.run, dt);
    this.protection.display(this.flight.protection);
    const run = this.run;
    const look = this.input.consume(dt);
    this.shotDelay = Math.max(0, this.shotDelay - dt);
    this.feedbackTime = Math.max(0, this.feedbackTime - dt); this.hitTime = Math.max(0, this.hitTime - dt);
    this.popupTime = Math.max(0, this.popupTime - dt);
    this.arrivalTime = Math.max(0, this.arrivalTime - dt);
    for (const message of this.messages) message.ttl -= dt;
    this.messages = this.messages.filter(message => message.ttl > 0);
    if (this.bonus) {
      const health = this.bonus.state.health, points = this.bonus.state.points, fractures = this.bonus.state.fractures, enemyShots = this.bonus.state.enemyShots;
      this.bonus.step(dt, look, this.camera);
      if (run.mode === 'smuggler') run.elapsed = this.bonus.state.elapsed;
      if (this.bonus.state.enemyShots > enemyShots) this.sound.enemyShoot('pirate', 100);
      if (this.input.consumeFire() && this.shotDelay <= 0) {
        this.shotDelay = weaponSpec(this.bonus.state.family, 1).cooldown; this.sound.shoot(this.bonus.state.family);
        if (this.bonus.shoot(this.camera)) this.hitTime = 0.12;
      }
      if (this.bonus.state.points !== points) {
        const delta = this.bonus.state.points - points;
        if (this.bonus.state.fractures > fractures) this.sound.fracture(); else if (delta > 0) this.sound.pickup();
        this.popupTime = 0.7; this.ui.text('scorePopup', `${delta > 0 ? '+' : ''}${delta}`);
      }
      if (this.bonus.state.notice) { this.log(this.bonus.state.notice); this.bonus.state.notice = ''; this.sound.warning(); }
      if (this.bonus.state.health < health) {
        this.sound.damage(); this.feedbackTime = 1.2; this.ui.text('hitCallout', this.run.mode === 'smuggler' ? 'RUNNER HIT' : 'LOAN SKIFF HIT');
        const layer = document.querySelector<HTMLElement>('#damageLayer')!;
        layer.classList.remove('active'); void layer.offsetWidth; layer.classList.add('active');
      }
      if (this.bonus.state.finished) this.finishBonus(this.bonus.state.reason!);
      return;
    }
    tickStageTime(run, dt);
    this.previousPosition.copy(this.position);
    if (moveShip(this.position, this.orientation, look, dt, { mode: run.mode, kind: this.definition.kind, cleared: run.cleared })) {
      this.log('ARENA EDGE: TURN BACK TOWARD THE FIGHT');
    }
    this.updateCamera();
    if (this.warp > 0) {
      this.warp -= dt;
      if (this.warp <= 0) { document.querySelector('#warpLayer')!.classList.remove('active'); this.afterStage(); }
      return;
    }
    if (run.phase === 'playing') {
      // Order matters: move actors before sweeping shots, collect rewards before
      // checking objectives, and stop if damage has opened the game-over screen.
      run.elapsed += dt; tickChain(run, dt);
      this.spawnPack(this.director.next(run.elapsed, this.hostiles().length));
      this.updateActors(dt);
      if (this.flight.menu || this.flight.pendingRespawn) return;
      if (this.input.consumeFire()) this.shoot();
      this.updateShots(dt);
      if (this.flight.menu || this.flight.pendingRespawn) return;
      this.updateCargo(dt);
      this.updateLaw(dt);
      this.updateObjective(dt);
      if (this.flight.menu || this.flight.pendingRespawn) return;
      if (encounterComplete({ kind: this.definition.kind, flightsFinished: this.director.finished,
        hostiles: this.hostiles().length, rescued: this.rescued, protectedShip: this.objectiveShip })) this.completeStage();
    } else if (run.phase === 'cleared') {
      this.updateCargo(dt);
      if (this.gate && crossedGate(this.previousPosition, this.position, this.gate.object.position, this.gate.object.quaternion)) this.startWarp();
    } else if (run.phase === 'recovery') {
      this.updateCargo(dt); this.recovery -= dt;
      if (this.recovery <= 0 || this.input.consumeFire()) this.nextStage(true);
    }
    this.updateEffects(dt);
    this.collideWorld();
    if (this.gate?.object.visible) updateWarpCueVisuals(this.gate.object, run.cleared, performance.now() / 1000);
    this.stars.position.lerp(this.position, dt * 0.04);
  }
  private updateObjective(dt: number): void {
    if (!this.objectiveShip || this.objectiveShip.dead) return;
    if (this.definition.kind === 'escort') {
      this.objectiveShip.age += dt;
      this.objectiveShip.object.position.lerpVectors(this.objectiveShip.anchor, this.base!.object.position.clone().add(new THREE.Vector3(0, 10, 35)), Math.min(1, this.objectiveShip.age / 75));
    }
  }
  private completeStage(): void {
    // settleStage is the once-only reward guard. Late callbacks cannot pay a second
    // time or restart the recovery timer after an objective has already completed.
    const result = completeEncounter(this.run, this.accuracy);
    if (!result) return;
    if (result.missCost) { this.ui.text('scorePopup', `MISS -${result.missCost}`); this.popupTime = 0.7; }
    if (this.run.mode === 'invaders') this.log(`WAVE ${this.run.stage} ACCURACY ${accuracyPercent(this.run.accuracy)}%: ${this.run.accuracy.hits} HITS / ${this.run.accuracy.misses} MISSES`);
    if (result.extraLives) { this.log(`EXTRA LIFE +${result.extraLives}! / ${this.run.lives} LIVES`); this.sound.pickup(); }
    this.arrivalTime = 0;
    this.input.clear();
    this.sound.complete(); this.log('MISSION COMPLETE!');
    this.projectiles.clear();
    if (result.route === 'recovery') { this.recovery = this.definition.difficulty.recovery; this.log('WAVE CLEAR: CLICK TO START THE NEXT WAVE');
    } else { this.activateGate(); this.log('Head to the Warp Gate!'); }
    if (this.definition.kind === 'armada' && this.run.mode !== 'invaders') {
      this.log('TRACTOR BEAM RELEASED - FREE FLIGHT RESTORED');
      this.updateCamera();
    }
    this.record();
  }
  private activateGate(): void {
    if (!this.gate) return;
    if (this.definition.kind === 'armada') this.input.throttle = 65;
    this.gate.object.position.copy(this.position).addScaledVector(this.forward(), 180);
    this.gate.object.quaternion.copy(this.orientation);
    this.gate.object.visible = true;
    updateWarpCueVisuals(this.gate.object, true, 0);
  }
  private startWarp(): void {
    if (!this.run.cleared || this.warp > 0) return;
    this.bankTimeBonus();
    this.warp = 1.75;
    document.querySelector('#warpLayer')!.classList.add('active');
    this.sound.warp();
  }
  private bankTimeBonus(): number | null {
    const credits = settleTimeBonus(this.run);
    if (credits === null) return null;
    this.log(`TIME BONUS: ${timeBonusSeconds(this.run)} SEC x ${TIME_BONUS_RATE} = +CR ${credits}`);
    this.ui.text('scorePopup', `+CR ${credits}`); this.popupTime = 1.6;
    if (credits > 0) this.sound.pickup();
    // Save at entry to the warp, not after the animation, to prevent a reload payout.
    this.persist();
    return credits;
  }
  private afterStage(): void {
    const destination = afterGate(this.run);
    if (destination === 'victory') { this.record(); this.victory(); }
    else if (destination === 'bonusOffer') this.showBonusOffer();
    else if (destination === 'shop') this.showShop();
  }
  private updateActors(dt: number): void {
    this.threat = this.enemies.update(dt, {
      run: this.run, definition: this.definition, actors: () => this.actors, position: this.position,
      previousPosition: this.previousPosition, orientation: this.orientation, objectiveShip: this.objectiveShip
    });
  }
  private switchWeapon(command: WeaponCommand): void {
    // Do not reset shotDelay here: switching families must not bypass fire-rate limits.
    if (!this.runState || !this.input.active || this.flight.paused || this.flight.menu || this.warp > 0) return;
    const current = this.bonus?.state.family ?? this.run.family;
    const family = selectWeapon(current, command);
    if (family === current) return;
    if (this.bonus) { this.bonus.state.family = family; if (this.run.mode === 'smuggler') this.run.family = family; }
    else { this.run.family = family; this.run.pilot.weaponLevel = this.run.tiers[family]; }
    this.log(`${family.toUpperCase()} ${this.bonus ? 1 : this.run.tiers[family]} SELECTED`);
    this.sound.pickup();
    this.hud();
  }
  private shoot(): void {
    if (this.shotDelay > 0 || this.run.phase !== 'playing') return;
    const spec = weaponSpec(this.run.family, this.run.tiers[this.run.family], this.run.mode);
    const direction = assistedAim(this.position, this.forward(), this.actors,
      this.profile.settings.aimAssist && this.definition.kind !== 'armada');
    let fired = 0;
    for (let index = 0; index < spec.count; index += 1) {
      const aim = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0).applyQuaternion(this.orientation), (index - (spec.count - 1) / 2) * spec.spread);
      if (this.spawnShot('player', -1, 0, this.position.clone().addScaledVector(aim, 9), aim, spec.speed, spec.damage, spec.color, spec.radius, spec.length, spec.pierce)) {
        fired++;
        if (this.run.mode === 'invaders') this.accuracy.begin(this.shots.at(-1)!.id, this.run.accuracy);
      }
    }
    if (!fired) return;
    this.shotDelay = spec.cooldown;
    this.stats.shots += 1;
    this.sound.shoot(this.run.family);
  }
  private spawnShot(faction: Faction, source: number, target: number, position: THREE.Vector3, direction: THREE.Vector3, speed: number, damage: number, color: number, radius: number, length: number, pierce: number): boolean {
    const fired = this.projectiles.spawn(faction, source, target, position, direction, speed, damage, color, radius, length, pierce, faction === 'player' ? this.run.family : 'pulse');
    if (fired && faction === 'pirate') this.stats.enemyShots++;
    return fired;
  }
  private applyMissPenalty(cost: number): void {
    if (!cost) return;
    this.run.pilot.score = Math.max(0, this.run.pilot.score - cost);
    this.ui.text('scorePopup', `MISS -${cost}`); this.popupTime = 0.7;
  }
  private updateShots(dt: number): void {
    this.projectiles.update(dt, this.actors, this.previousPosition, this.position, {
      damageActor: (actor, damage, byPlayer) => this.damageActor(actor, damage, byPlayer),
      damagePlayer: (damage, message) => this.damagePlayer(damage, this.run.mode === 'invaders' ? 'ALIEN FIRE - RETURN FIRE!' : message),
      intercepted: position => {
        rewardInterception(this.run); this.stats.interceptions++;
        this.checkScoreLives();
        this.spark(position, 0xffff90, 5); this.hitTime = 0.16; this.sound.intercept();
      },
      npcHit: () => { this.stats.npcHits++; },
      playerContact: shot => {
        if (this.run.mode === 'invaders') this.accuracy.hit(shot.id, this.run.accuracy);
      },
      playerExpired: shot => {
        // Settle misses in the ongoing fight, including in-place respawns.
        // Checkpoint restarts have already replaced the lost attempt's resources.
        if (this.run.mode === 'invaders' && this.run.phase === 'playing') this.applyMissPenalty(this.accuracy.end(shot.id, this.run.accuracy));
      },
      stopped: () => !!this.flight.menu || this.flight.pendingRespawn !== null
    });
  }
  private damageActor(actor: Actor, damage: number, byPlayer: boolean): void {
    if (actor.dead) return;
    if (actor.kind === 'pirate' && actor.essential && actor.role === 'carrier' && this.actors.some(item => !item.dead && item.parent === actor.id)) {
      if (byPlayer) this.log('CORE SHIELDED: DESTROY THE OUTER SYSTEMS');
      this.spark(actor.object.position, 0x8adfff, 3); return;
    }
    if (byPlayer && (actor.kind === 'police' || actor.kind === 'trader')) {
      const wasProvoked = actor.target === -1;
      if (!wasProvoked) {
        this.run.pilot = attackFaction(this.run.pilot, `stage-${this.run.stage}`, 'trader', false);
        if (actor.kind === 'police') this.run.pilot.wanted.reason = 'Attack on police';
        this.log(`WANTED: ${this.run.pilot.wanted.reason}`);
      }
      actor.target = -1;
    }
    actor.hull -= damage;
    this.spark(actor.object.position, actor.faction === 'pirate' ? 0xff9c60 : 0x8edbff, 3);
    if (byPlayer) {
      this.hitTime = 0.12;
      if (this.stats.firstCombat < 0) this.stats.firstCombat = this.run.elapsed;
    }
    if (actor.hull <= 0) this.destroy(actor, byPlayer);
  }
  private destroy(actor: Actor, byPlayer: boolean): void {
    // Enemy removal advances the objective regardless of who killed it. Only the
    // player's kills earn chain points; allied police can still help clear a stage.
    if (actor.dead) return;
    // Detach cosmetic hull panels before ActorWorld disposes the ship. Rewards,
    // cargo and objective removal still happen now, not when debris finishes.
    if (['pirate', 'police', 'trader', 'part'].includes(actor.kind)) this.effects.explodeShip(actor);
    this.spark(actor.object.position, actor.faction === 'pirate' ? 0xff5863 : 0x8affb0, 14);
    this.sound.explosion(actor.object.position.distanceTo(this.position));
    if (actor.kind === 'part') this.log('OUTER SYSTEM DESTROYED');
    if (actor.faction === 'pirate') {
      if (byPlayer) {
        const score = rewardKill(this.run, actor.kind === 'part' ? 150 : actor.kind === 'mine' ? 25 : actor.role === 'carrier' ? 500 : 100);
        this.checkScoreLives();
        this.ui.text('scorePopup', `+${score}`); this.popupTime = 0.7; this.stats.kills += 1;
      }
      if (actor.kind === 'pirate') {
        const salvage = pirateSalvage(this.run, types => this.rng.pick(types));
        const location = salvage.essential && this.definition.kind !== 'armada' ? this.position.clone().addScaledVector(this.forward(), 15) : actor.object.position.clone();
        this.spawnCargo(salvage.drop, location, salvage.essential);
        if (actor.role === 'carrier') for (const part of this.actors.filter(item => item.parent === actor.id && !item.dead)) this.removeActor(part);
      }
    } else if (byPlayer) this.run.pilot.score = Math.max(0, this.run.pilot.score - 150);
    this.removeActor(actor);
    if (actor === this.objectiveShip) this.fail(this.definition.kind === 'escort' ? 'CONVOY LOST' : 'STATION LOST', true);
  }
  private damagePlayer(damage: number, message: string): void {
    const decision = this.flight.damage(this.run, damage);
    if (decision.type === 'ignored') return;
    this.log(message); this.sound.damage(); this.feedbackTime = 1.6;
    this.ui.text('hitCallout', message);
    const layer = document.querySelector('#damageLayer')!;
    layer.classList.remove('active'); void (layer as HTMLElement).offsetWidth; layer.classList.add('active');
    if (decision.type !== 'hit') { this.log('SHIP LOST'); this.handleLifeDecision(decision); }
  }
  private special(): void {
    if (!this.runState || this.flight.paused || this.flight.menu) return;
    if (this.bonus) {
      const points = this.bonus.state.points;
      if (!this.bonus.blast(this.camera)) { this.log(`BLAST CHARGING ${this.bonus.state.charge}%`); return; }
      this.sound.blast(); this.log('DEFENSIVE BLAST');
      if (this.bonus.state.points > points) {
        this.hitTime = 0.12; this.popupTime = 0.7; this.ui.text('scorePopup', `+${this.bonus.state.points - points}`);
      }
      return;
    }
    if (this.run.phase !== 'playing') return;
    if (this.run.charge < 100) { this.log(`BLAST CHARGING ${this.run.charge}%`); return; }
    this.run.charge = 0;
    // Clear dangerous fire and damage pirates only. The blast cannot hit an ally
    // and create a warrant, even when police and traders are inside its radius.
    this.projectiles.clearHostileFire(this.position);
    for (const actor of [...this.actors]) {
      if (!actor.dead && actor.faction === 'pirate' && actor.object.position.distanceTo(this.position) <= 240) this.damageActor(actor, 85, true);
    }
    this.effects.blast(this.position, this.orientation);
    this.sound.blast(); this.log('DEFENSIVE BLAST');
  }
  private worldFrame() {
    return { run: this.run, position: this.position, orientation: this.orientation, base: this.base, definition: this.definition };
  }
  private updateCargo(dt: number): void {
    if (this.worldInteractions.collect(dt, this.worldFrame())) this.rescued = true;
  }
  private updateLaw(dt: number): void { this.worldInteractions.enforce(dt, this.worldFrame()); }
  private collideWorld(): void {
    this.input.throttle = this.worldInteractions.collide(this.worldFrame(), this.input.throttle);
    this.updateCamera();
  }
  private removeActor(actor: Actor): void { this.actorWorld.remove(actor); }
  private spark(position: THREE.Vector3, color: number, count: number): void { this.effects.spark(position, color, count); }
  private updateEffects(dt: number): void { this.effects.update(dt); }
  private hud(): void {
    this.hudController.update({
      menu: this.flight.menu, profile: this.profile, selectedMode: this.selectedMode, run: this.runState,
      bonus: this.bonus, definition: this.definition, actors: this.actors, throttle: this.input.throttle,
      recovery: this.recovery, arrivalTime: this.arrivalTime, rescued: this.rescued,
      objectiveShip: this.objectiveShip, director: this.director, position: this.position,
      orientation: this.orientation, messages: this.messages, feedbackTime: this.feedbackTime,
      hitTime: this.hitTime, popupTime: this.popupTime, gate: this.gate, base: this.base,
      objectivePod: this.objectivePod, threat: this.threat, shotDelay: this.shotDelay, protection: this.flight.protection
    });
  }
  /**
   * Development-only test/inspection hooks, attached to window only in DEV builds.
   * Fixture methods deliberately bypass player skill; mouse-pilot tests instead
   * use real input and call step() only to advance the fixed simulation faster.
   */
  createDebugApi() {
    return {
      getState: () => ({ mode: this.runState?.mode, stage: this.runState?.stage, phase: this.runState?.phase, menu: this.flight.menu, paused: this.flight.paused,
        lives: this.runState?.lives, continued: this.runState?.continued, credits: this.runState?.pilot.credits, score: this.runState?.pilot.score,
        nextLifeScore: this.runState?.nextLifeScore, stageReward: this.runState?.stageReward,
        accuracy: this.runState ? { ...this.runState.accuracy } : undefined,
        respawn: { pending: this.flight.pendingRespawn, protection: this.flight.protection },
        shield: this.runState?.pilot.shield, hull: this.runState?.pilot.hull, weapon: this.runState?.family, tiers: this.runState?.tiers,
        charge: this.runState?.charge, wanted: this.runState?.pilot.wanted.active, hostileCount: this.hostiles().length,
        attackerCount: this.actors.filter(actor => actor.windup >= 0).length, speedScale: this.definition.speedScale,
        difficulty: this.definition.difficulty, recovery: this.recovery,
        flights: { arrived: this.director.flight, total: this.director.totalFlights, roster: this.definition.waves.reduce((sum, flight) => sum + flight.enemies.length, 0) },
        bonus: this.bonus?.state, bonusStatus: this.runState?.bonusStatus, stageKind: this.definition.kind,
        bonusRocks: this.bonus?.rocks ?? [],
        bonusCourse: this.bonus?.canyon?.snapshot,
        bonusSequence: this.bonus?.targetSequence,
        bonusAsteroids: this.bonus?.asteroidRun,
        position: this.position.toArray(), orientation: this.orientation.toArray(), throttle: this.input.throttle, elapsed: this.runState?.elapsed, stats: { ...this.stats },
        timeRemaining: this.runState?.timeRemaining, timeBonus: this.runState?.timeBonus,
        practice: this.runState?.practice ?? false, levelWarpUnlocked: this.levelWarpUnlocked,
        weaponLevel: this.runState?.pilot.weaponLevel, weaponCooldown: this.shotDelay,
        arrival: { remaining: this.arrivalTime, message: this.arrivalMessage, effects: this.effects.warpCount },
        destruction: this.effects.destruction,
        view: { position: this.camera.position.toArray(), orientation: this.camera.quaternion.toArray(), armadaCraftVisible: this.armadaRig?.root.visible ?? false },
        actors: this.actors.map(a => ({ id: a.id, kind: a.kind, role: a.role, hull: a.hull, position: a.object.position.toArray(), velocity: a.object.position.clone().sub(a.previous).multiplyScalar(60).toArray(), radius: a.radius, windup: a.windup, essential: a.essential, drop: a.drop?.type, visible: a.object.visible })),
        shots: this.shots.map(s => ({ faction: s.faction, target: s.target, position: s.object.position.toArray() })),
        deathTimer: Math.ceil(this.flight.deathCountdown), messageLog: this.messages.map(message => message.text).join('\n'),
        briefingCount: document.querySelector('#modelCount')!.textContent, briefingTitle: document.querySelector('#modelTitle')!.textContent }),
      finishEncounter: () => {
        this.director.drain(); this.rescued = true;
        if (this.objectiveShip) this.objectiveShip.age = 80;
        for (const actor of [...this.actors].filter(a => a.faction === 'pirate' && a.kind === 'part')) this.destroy(actor, true);
        for (const actor of [...this.actors].filter(a => a.faction === 'pirate')) this.destroy(actor, true);
        this.completeStage();
      },
      reachGate: () => { if (this.gate && this.run.cleared) this.position.copy(this.gate.object.position); },
      forcePlayerDeath: () => { if (this.flight.pendingRespawn) this.respawn(); this.protection.clear(); this.flight.protection = 0; if (this.runState?.mode === 'smuggler' && this.bonus) this.finishSmuggler('crash'); else { this.flight.grace = 0; this.damagePlayer(1000, 'SHIP LOST'); } },
      damagePlayer: (amount: number) => this.damagePlayer(amount, 'INCOMING FIRE'),
      grantCargo: (type: CargoType, amount = 1) => { pickup(this.run, { type, amount }); this.checkScoreLives(); },
      giveCredits: (amount: number) => { this.run.pilot.credits += amount; },
      giveScore: (amount: number) => { this.run.pilot.score += amount; this.checkScoreLives(); },
      lookByMouse: (x: number, y: number) => this.input.injectLook(x, y),
      setStage: (number: number) => { this.run.stage = number; this.run.cleared = false; this.run.phase = 'briefing'; this.run.timeRemaining = STAGE_TIME_LIMIT; this.run.timeBonus = null; this.loadStage(); this.briefing(); },
      finishBonus: (reason: 'complete' | 'crash' | 'timeout' | 'exit') => this.finishBonus(reason),
      setBonusPoints: (points: number) => { if (this.bonus) this.bonus.state.points = points; },
      primeBlast: () => { this.run.charge = 100; },
      blast: () => this.special(),
      hitActor: (id: number, damage: number, byPlayer = true) => { const actor = this.actors.find(a => a.id === id); if (actor) this.damageActor(actor, damage, byPlayer); },
      maximumLoad: () => {
        this.director.drain();
        for (const actor of [...this.actors].filter(a => a.faction === 'pirate')) this.removeActor(actor);
        this.definition = stageDefinition('endless', 999);
        this.spawnPack(Array.from({ length: 18 }, (_, i) => i % 2 ? 'gunship' : 'flanker'));
        this.flight.grace = 30;
        for (let i = 0; i < 220; i++) this.spawnShot('pirate', 0, 0, this.position.clone().add(new THREE.Vector3((i % 20 - 10) * 12, (Math.floor(i / 20) - 5) * 10, -250)), this.forward().negate(), 30, 1, 0xff4055, 4, 20, 1);
      },
      step: (seconds: number) => { for (let t = 0; t < seconds && !this.flight.menu && !this.flight.paused; t += STEP) this.step(STEP); this.hud(); },
      spawnIncomingBolt: () => { const direction = this.forward(); this.spawnShot('pirate', 0, 0, this.position.clone().addScaledVector(direction, 100), direction.negate(), 160, 10, 0xff4055, 5, 20, 1); },
      persist: () => this.persist(),
      getProfile: () => clone(this.profile)
    };
  }
}
