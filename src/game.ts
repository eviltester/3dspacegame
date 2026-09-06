import * as THREE from 'three';
import { canNpcCollect } from './arcade';
import { advance, bonusFor, clone, dock, FAMILIES, loseLife, newRun, parseProfile, pickup, purchase, purchaseBlocked, purchasePrice, recordRun, resetChain, retry, rewardInterception, rewardKill, SAVE_V2, saveCheckpoint, settleBonus, settleStage, tickChain } from './arcade';
import type { EnemyArchetype, GameMode, ProfileSaveV2, Purchase, RunState, WeaponFamily } from './arcade';
import { BONUS_BRIEFS, BONUS_NAMES, BonusController } from './bonus';
import { crossedGate, EncounterDirector, HULL, Random, stageDefinition } from './encounters';
import type { StageDefinition } from './encounters';
import { FlightInput, rotateLocally, throttleReadout } from './input';
import { attackFaction, instantTrade, resolveContrabandScan, SAVE_KEY } from './logic';
import type { CargoDrop, CargoType, Faction } from './logic';
import { createBaseModel, createBlackMarketModel, createBoltModel, createCargoModel, createEnemyModel, createGateModel, createPlanetModel, createPoliceModel, createPulseRing, createStarTexture, createTraderHaulerModel, createTraderUfoModel, disposeObject, edgesFromGeometry, lineShape, setProjectilePulseOpacity, updateWarpCueVisuals } from './models';
import { SoundBank } from './sound';
import { button, CONTROLS, GameUI } from './ui';
import { sweptHit, weaponSpec } from './weapons';

type Kind = 'pirate' | 'trader' | 'police' | 'part' | 'base' | 'planet' | 'market' | 'gate' | 'cargo' | 'mine';
interface Actor {
  id: number; kind: Kind; faction: Faction; object: THREE.Object3D; previous: THREE.Vector3;
  radius: number; hull: number; maxHull: number; role: EnemyArchetype; age: number;
  cooldown: number; windup: number; target: number; anchor: THREE.Vector3; offset: THREE.Vector3;
  parent: number | null; essential: boolean; drop: CargoDrop | null; dead: boolean; spawned: number;
}
interface Shot {
  id: number; source: number; faction: Faction; target: number; object: THREE.Object3D;
  previous: THREE.Vector3; velocity: THREE.Vector3; damage: number; radius: number; ttl: number; pierce: number; hit: Set<number>;
}
interface Particle { object: THREE.Object3D; velocity: THREE.Vector3; life: number; duration: number; warpIn?: boolean }
const STEP = 1 / 60;
const ACTIVE_PHASES = ['playing', 'cleared', 'recovery', 'bonus'];

export class ArcadeGame {
  readonly ui: GameUI;
  readonly scene = new THREE.Scene();
  readonly world = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 6000);
  readonly renderer: THREE.WebGLRenderer;
  readonly sound = new SoundBank();
  readonly input: FlightInput;
  private profile: ProfileSaveV2;
  private runState: RunState | null = null;
  private selectedMode: GameMode = 'journey';
  private selectedFamily: WeaponFamily = 'pulse';
  private definition: StageDefinition = stageDefinition('journey', 1);
  private director = new EncounterDirector(this.definition);
  private rng = new Random(1);
  private actors: Actor[] = [];
  private shots: Shot[] = [];
  private particles: Particle[] = [];
  private readonly position = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly orientation = new THREE.Quaternion();
  private readonly stars: THREE.Points;
  private bonus: BonusController | null = null;
  private paused = false;
  private menu = 'title';
  private nextId = 1;
  private shotDelay = 0;
  private invulnerable = 3;
  private deathCountdown = 10;
  private recovery = 8;
  private warp = 0;
  private scanCooldown = 5;
  private warrantTime = 0;
  private policeDispatched = false;
  private rescued = false;
  private objectiveShip: Actor | null = null;
  private objectivePod: Actor | null = null;
  private base: Actor | null = null;
  private gate: Actor | null = null;
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
  private stats = { shots: 0, kills: 0, interceptions: 0, npcHits: 0, pickups: 0, firstCombat: -1, firstUpgrade: -1, frames: 0, frameMs: 0 };

  constructor() {
    let raw: string | null = null;
    let legacy: string | null = null;
    try { raw = localStorage.getItem(SAVE_V2); legacy = localStorage.getItem(SAVE_KEY); } catch { /* Play without persistence when browser storage is unavailable. */ }
    this.profile = parseProfile(raw, legacy);
    this.ui = new GameUI(action => this.action(action));
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0);
    this.ui.viewport.append(this.renderer.domElement);
    this.scene.add(this.world);
    this.scene.fog = new THREE.FogExp2(0, 0.00035);
    this.stars = this.makeStars();
    this.scene.add(this.stars);
    this.input = new FlightInput(this.renderer.domElement, () => this.pause(), () => this.special());
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.showTitle();
    this.exposeDebug();
    requestAnimationFrame(this.frame);
  }
  private get run(): RunState { return this.runState!; }
  private log(text: string): void { this.messages.unshift({ text, ttl: 4 }); this.messages = this.messages.slice(0, 3); }
  private persist(): void {
    if (this.runState) saveCheckpoint(this.profile, this.run);
    try { localStorage.setItem(SAVE_V2, JSON.stringify(this.profile)); } catch { /* Saving is optional for local play. */ }
  }
  private record(): void { if (this.runState) recordRun(this.profile, this.run); this.persist(); }
  private show(screen: string, title: string, status: string, content: string): void {
    this.menu = screen;
    this.input.release();
    this.ui.show(screen, title, status, content);
  }
  private showTitle(): void {
    this.paused = false;
    const saved = this.profile.checkpoints[this.selectedMode];
    const mode = this.selectedMode === 'journey' ? 'ARCADE JOURNEY' : 'ENDLESS';
    const families = FAMILIES.map(family => button(`startFamily:${family}`, family.toUpperCase(), `aria-pressed="${this.selectedFamily === family}" ${this.profile.unlocked.includes(family) ? '' : 'disabled'} title="${this.profile.unlocked.includes(family) ? 'Starting weapon' : family === 'spread' ? 'Clear stage or wave 4 to unlock' : 'Clear stage or wave 8 to unlock'}"`)).join('');
    this.show('title', 'VECTOR SHOOTER', 'SELECT YOUR FLIGHT', `
      <div class="mode-select" role="group" aria-label="Game mode">${button('mode:journey', 'ARCADE JOURNEY', `aria-pressed="${this.selectedMode === 'journey'}"`)}${button('mode:endless', 'ENDLESS', `aria-pressed="${this.selectedMode === 'endless'}"`)}</div>
      <p class="menu-description">${this.selectedMode === 'journey' ? 'Twelve stages. Three carrier bosses. Optional bonus sorties.' : 'An endless wave arena. Formations, carriers, and rising pressure.'}</p>
      <p class="briefing-status">STARTING WEAPON</p><div class="family-select">${families}</div>
      ${CONTROLS}
      <div class="menu-actions">${saved && saved.phase !== 'victory' ? button('resumeRun', `RESUME ${saved.mode === 'journey' ? 'STAGE' : 'WAVE'} ${saved.stage}`, 'id="resumeButton"') : ''}${button('newRun', saved ? 'NEW RUN' : 'PLAY GAME', 'id="launchButton"')}</div>
      <div class="settings-row">${button('assist', `AIM ASSIST: ${this.profile.settings.aimAssist ? 'ON' : 'OFF'}`)}${button('mute', `SOUND: ${this.profile.settings.muted ? 'OFF' : 'ON'}`)}</div>
      <p class="record-line">${mode} BEST ${this.profile.records[this.selectedMode]} / CONTINUED ${this.profile.records[`${this.selectedMode}Continued`]}${this.profile.legacyScore ? ` / LEGACY ${this.profile.legacyScore}` : ''}</p>`);
    this.ui.text('arcadeBest', this.profile.records[this.selectedMode].toString().padStart(6, '0'));
  }
  private briefing(): void {
    const armada = this.definition.kind === 'armada';
    this.show('briefing', this.definition.title.replace(/\d+/g, '').trim(), `${this.run.mode === 'journey' ? 'JOURNEY STAGE' : 'ENDLESS WAVE'} ${this.run.stage}${this.run.mode === 'journey' ? ' / 12' : ''}`, `
      <section class="mission-briefing"><p class="briefing-status">MISSION BRIEFING</p><h2 id="missionBriefTitle">${this.definition.title}</h2><p id="missionBriefObjective">${this.definition.objective}</p><p id="missionBriefCaution">${armada ? 'Mouse moves LEFT / RIGHT. Fire straight ahead. Right click uses your charged blast.' : 'Police and green traders are allies. Pirates are red. Right click uses your charged blast.'}</p><p id="missionBriefReward">REWARD CR ${200 + Math.min(20, this.run.stage) * 35 + (this.run.stage === 1 ? 150 : 0)}</p></section>
      <p class="run-loadout">${this.run.lives} LIVES / ${this.run.family.toUpperCase()} ${this.run.tiers[this.run.family]} / ${this.definition.waves.length} PIRATE FLIGHTS</p>
      <div class="menu-actions">${button('launch', 'START MISSION', 'id="launchButton"')}${button('title', 'TITLE SCREEN')}</div>`);
  }
  private async play(): Promise<void> {
    this.paused = false;
    this.menu = '';
    if (this.run.phase === 'briefing') this.run.phase = 'playing';
    this.ui.hide();
    this.sound.setMuted(this.profile.settings.muted);
    try { await this.sound.start(); } catch { this.log('AUDIO UNAVAILABLE'); }
    await this.input.engage();
  }
  private pause(): void {
    if (!this.runState || !ACTIVE_PHASES.includes(this.run.phase) || this.paused) return;
    this.paused = true;
    this.persist();
    this.show('pause', 'PAUSED', `${this.run.mode.toUpperCase()} / ${this.bonus ? BONUS_NAMES[this.bonus.state.kind] : this.definition.title}`, `
      <div class="menu-actions">${button('unpause', 'RESUME', 'id="launchButton"')}${this.bonus ? button('exitBonus', 'EXIT BONUS SAFELY') : ''}${this.run.phase === 'recovery' ? button('nextWave', 'NEXT WAVE') : ''}${button('title', 'SAVE AND TITLE')}</div>
      <p class="menu-description">${this.bonus ? 'Your main ship and lives are safe.' : 'Leaving saves the current stage checkpoint.'}</p>`);
  }
  private action(action: string): void {
    if (action.startsWith('mode:')) { this.selectedMode = action.slice(5) as GameMode; this.showTitle(); return; }
    if (action.startsWith('startFamily:')) { const f = action.slice(12) as WeaponFamily; if (this.profile.unlocked.includes(f)) this.selectedFamily = f; this.showTitle(); return; }
    if (action === 'newRun') {
      this.runState = newRun(this.selectedMode, Date.now(), this.selectedFamily);
      this.loadStage(); this.persist(); this.briefing(); return;
    }
    if (action === 'resumeRun') {
      const saved = this.profile.checkpoints[this.selectedMode];
      if (!saved) return;
      this.runState = clone(saved);
      this.loadStage();
      if (this.run.phase === 'gameover') this.showGameOver();
      else if (this.run.phase === 'shop' || this.run.phase === 'bonusResult') this.showShop();
      else if (this.run.phase === 'bonusOffer') this.showBonusOffer();
      else this.briefing();
      return;
    }
    if (action === 'launch' || action === 'unpause') { void this.play(); return; }
    if (action === 'pause') { this.pause(); return; }
    if (action === 'title') {
      if (this.bonus) this.finishBonus('exit');
      this.persist(); this.showTitle(); return;
    }
    if (action === 'assist') { this.profile.settings.aimAssist = !this.profile.settings.aimAssist; this.persist(); this.showTitle(); return; }
    if (action === 'mute') { this.profile.settings.muted = !this.profile.settings.muted; this.sound.setMuted(this.profile.settings.muted); this.persist(); this.showTitle(); return; }
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
    if (action === 'exitBonus') this.finishBonus('exit');
  }
  private showShop(): void {
    dock(this.run); this.persist();
    const choices: Array<[Purchase, string]> = [['tier', `${this.run.family.toUpperCase()} TIER ${Math.min(3, this.run.tiers[this.run.family] + 1)}`], ['repair', 'REPAIR +50 HULL / +60 SHIELD'], ['shield', 'SHIELD CAPACITY +25'], ['magnet', 'CARGO MAGNET 35']];
    const rows = choices.map(([kind, label]) => {
      const blocked = purchaseBlocked(this.run, kind);
      return `<div class="shop-row"><div><strong>${label}</strong><span>${blocked ?? `CR ${purchasePrice(this.run, kind)}`}</span></div>${button(`buy:${kind}`, 'BUY', `${blocked ? 'disabled' : ''} aria-label="Buy ${kind}"`)}</div>`;
    }).join('');
    this.show('shop', 'SUPPLY DOCK', `CR ${this.run.pilot.credits} / HULL ${Math.ceil(this.run.pilot.hull)} / SHIELD ${Math.ceil(this.run.pilot.shield)}`, `
      <p class="briefing-status">EQUIP WEAPON</p><div class="family-select">${FAMILIES.map(f => button(`equip:${f}`, `${f.toUpperCase()} ${this.run.tiers[f]}`, `aria-pressed="${this.run.family === f}"`)).join('')}</div>
      <p class="weapon-purpose">${this.run.family === 'pulse' ? 'Rapid precision fire.' : this.run.family === 'spread' ? 'Three wide shots for nearby groups.' : 'Slow, powerful bolts pierce three targets.'}</p>
      <div class="shop-list">${rows}</div><div class="menu-actions">${button('depart', 'NEXT STAGE', 'id="launchButton"')}${button('title', 'SAVE AND TITLE')}</div>`);
  }
  private showBonusOffer(): void {
    const kind = bonusFor(this.run);
    if (!kind || this.run.bonusStatus !== 'available') { this.showShop(); return; }
    this.run.phase = 'bonusOffer'; this.persist();
    this.show('bonusOffer', BONUS_NAMES[kind], 'OPTIONAL BONUS SORTIE', `<p class="mission-copy">${BONUS_BRIEFS[kind]}</p><p class="safe-bonus">Your main ship, cargo, equipment and lives stay safe. Finish, fail or skip: the journey continues.</p><div class="menu-actions">${button('bonusPlay', 'PLAY BONUS', 'id="launchButton"')}${button('bonusSkip', 'SKIP TO DOCK')}</div>`);
  }
  private enterBonus(): void {
    const kind = bonusFor(this.run);
    if (!kind || this.run.bonusStatus !== 'available') return;
    this.run.bonusStatus = 'entered'; this.run.phase = 'bonus'; this.persist();
    this.bonus = new BonusController(kind, this.run.seed + this.run.stage);
    this.messages = []; this.feedbackTime = 0; this.popupTime = 0; this.hitTime = 0; this.arrivalTime = 0;
    this.world.visible = false; this.scene.add(this.bonus.root);
    this.camera.position.set(0, 0, 0); this.camera.quaternion.identity();
    this.shotDelay = 0; void this.play();
  }
  private finishBonus(reason: 'complete' | 'crash' | 'timeout' | 'exit'): void {
    if (!this.bonus) return;
    this.bonus.finish(reason);
    const result = settleBonus(this.run, this.bonus.ratio);
    this.scene.remove(this.bonus.root); this.bonus.dispose(); this.bonus = null;
    this.world.visible = true; this.updateCamera(); this.paused = false;
    this.record();
    if (!result) { this.showShop(); return; }
    this.sound.complete();
    this.show('bonusResult', result.medal, 'BONUS COMPLETE / MAIN SHIP SAFE', `<p class="result-score">+${result.score} POINTS</p><p>+${result.credits} CREDITS${result.extraLife ? ' / EXTRA LIFE' : ''}</p><div class="menu-actions">${button('bonusDock', 'CONTINUE TO DOCK', 'id="launchButton"')}</div>`);
  }
  private showGameOver(): void {
    this.deathCountdown = 10;
    this.show('gameover', 'GAME OVER', this.run.lives ? `${this.run.lives} LIVES REMAINING` : 'CONTINUE FROM CHECKPOINT / SCORE RESETS', `
      <div id="deathCountdown" class="death-countdown"><span>RETURN TO TITLE IN</span><strong id="deathTimer">10</strong></div>
      <div class="menu-actions">${button('relaunch', this.run.lives ? 'RELAUNCH NOW' : 'CONTINUE', 'id="launchButton"')}${button('title', 'TITLE SCREEN')}</div>`);
  }
  private fail(message: string): void {
    if (this.run.phase !== 'playing') return;
    this.log(message); this.record(); loseLife(this.run); this.persist(); this.sound.gameOver(); this.showGameOver();
  }
  private nextStage(autoPlay = false): void {
    if (!this.run.cleared || this.bonus) return;
    advance(this.run); this.record();
    if (this.run.phase === 'victory') { this.victory(); return; }
    this.loadStage();
    if (autoPlay) void this.play(); else this.briefing();
  }
  private victory(): void {
    this.show('victory', 'JOURNEY COMPLETE', this.run.continued ? 'CONTINUED FLIGHT' : 'ARCADE JOURNEY', `<p class="result-score">${this.run.pilot.score} POINTS</p><p>All twelve stages cleared.</p><div class="menu-actions">${button('title', 'TITLE SCREEN', 'id="launchButton"')}</div>`);
  }
  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const real = Math.min((now - this.elapsedFrame) / 1000, 0.1); this.elapsedFrame = now;
    this.stats.frames += 1; this.stats.frameMs += real * 1000;
    this.ui.tick(real);
    if (this.menu === 'gameover' && !document.hidden) {
      this.deathCountdown -= real; this.ui.text('deathTimer', String(Math.max(0, Math.ceil(this.deathCountdown))));
      if (this.deathCountdown <= 0) this.showTitle();
    }
    if (this.runState && !this.paused && !this.menu && ACTIVE_PHASES.includes(this.run.phase)) {
      this.accumulator += real;
      while (this.accumulator >= STEP) { this.accumulator -= STEP; this.step(STEP); if (this.menu) { this.accumulator = 0; break; } }
    } else this.accumulator = 0;
    this.hudTime += real;
    if (this.hudTime >= 0.05) { this.hudTime = 0; this.hud(); }
    this.renderer.render(this.scene, this.camera);
  };
  private resize(): void { this.renderer.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.ui.resize(); }
  private updateCamera(): void { this.camera.position.copy(this.position); this.camera.quaternion.copy(this.orientation); }

  private loadStage(): void {
    for (const child of [...this.world.children]) { disposeObject(child); this.world.remove(child); }
    this.world.visible = true;
    this.actors = []; this.shots = []; this.particles = []; this.messages = [];
    this.feedbackTime = 0; this.popupTime = 0; this.hitTime = 0; this.threat = null; this.arrivalTime = 0;
    this.definition = stageDefinition(this.run.mode, this.run.stage);
    this.director = new EncounterDirector(this.definition);
    this.rng = new Random((this.run.seed + this.run.stage * 7919) >>> 0);
    this.position.set(0, 0, 0); this.previousPosition.copy(this.position); this.orientation.identity();
    this.input.throttle = this.definition.kind === 'armada' ? 0 : 65;
    this.invulnerable = 3; this.warp = 0; this.scanCooldown = 5; this.warrantTime = 0; this.policeDispatched = false;
    this.shotDelay = 0; this.rescued = false; this.objectiveShip = null; this.objectivePod = null;
    this.paused = false; this.recovery = 8; this.run.elapsed = 0;
    this.stats = { shots: 0, kills: 0, interceptions: 0, npcHits: 0, pickups: 0, firstCombat: -1, firstUpgrade: -1, frames: 0, frameMs: 0 };
    this.base = this.addActor('base', createBaseModel(), new THREE.Vector3(-135, -30, -225), 31, 500);
    const planet = this.addActor('planet', createPlanetModel([0x70ffc0, 0xffdb74, 0x81bdff][this.definition.chapter - 1]), new THREE.Vector3(320, -140, -500), 58, Infinity);
    planet.object.rotation.x = 0.4;
    this.addActor('market', createBlackMarketModel(), new THREE.Vector3(175, 30, -280), 18, Infinity);
    this.gate = this.addActor('gate', createGateModel(), new THREE.Vector3(0, 0, -340), 28, Infinity);
    this.gate.object.visible = false;
    if (this.definition.kind === 'armada') {
      this.base.object.visible = false;
      const lane = lineShape([[-80, -12, -55], [80, -12, -55], [-80, 12, -55], [80, 12, -55], [-80, -12, 10], [80, -12, 10]],
        [[0, 1], [0, 2], [1, 3], [0, 4], [1, 5]], 0x397d91, 0.6);
      this.world.add(lane);
    } else if (this.run.mode === 'journey') {
      this.addActor('police', createPoliceModel(), new THREE.Vector3(-150, 45, -190), 9, 130);
      this.addActor('trader', createTraderUfoModel(), new THREE.Vector3(150, 30, -245), 10, 140);
    }
    if (!this.run.cleared && this.definition.kind === 'rescue') {
      this.objectivePod = this.spawnCargo({ type: 'rescuePod', amount: 1 }, new THREE.Vector3(0, 0, -90), true);
    }
    if (this.definition.kind === 'escort') this.objectiveShip = this.addActor('trader', createTraderHaulerModel(), new THREE.Vector3(-40, 0, -100), 11, 340);
    if (this.definition.kind === 'defend') this.objectiveShip = this.base;
    if (this.objectiveShip) this.objectiveShip.essential = true;
    if (this.run.cleared) { this.director.drain(); if (this.run.phase !== 'recovery') this.activateGate(); }
    this.updateCamera();
    this.log(this.definition.kind === 'armada' ? 'DEFENSIVE LANE: MOUSE LEFT / RIGHT' : this.definition.title);
  }
  private addActor(kind: Kind, object: THREE.Object3D, position: THREE.Vector3, radius: number, hull: number, role: EnemyArchetype = 'raider'): Actor {
    object.position.copy(position); this.world.add(object);
    const actor: Actor = { id: this.nextId++, kind, faction: kind === 'pirate' || kind === 'part' || kind === 'mine' ? 'pirate' : kind === 'police' ? 'police' : kind === 'trader' ? 'trader' : 'neutral',
      object, previous: position.clone(), radius, hull, maxHull: hull, role, age: 0, cooldown: kind === 'pirate' ? 1.1 : 2, windup: -1, target: 0,
      anchor: position.clone(), offset: new THREE.Vector3(), parent: null, essential: false, drop: null, dead: false, spawned: 0 };
    this.actors.push(actor); return actor;
  }
  private spawnCargo(drop: CargoDrop, position: THREE.Vector3, essential = false): Actor {
    const actor = this.addActor('cargo', createCargoModel(drop.type), position, 4, Infinity);
    actor.drop = drop; actor.essential = essential; return actor;
  }
  private hostiles(): Actor[] { return this.actors.filter(actor => !actor.dead && (actor.kind === 'pirate' || actor.kind === 'mine')); }
  private forward(): THREE.Vector3 { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.orientation); }
  private spawnPack(roles: EnemyArchetype[]): void {
    if (!roles.length) return;
    const arrivals: Actor[] = [];
    const forward = this.forward();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.orientation);
    roles.forEach((role, index) => {
      const armada = this.definition.kind === 'armada';
      const position = armada ? new THREE.Vector3((index - (roles.length - 1) / 2) * 22, 0, -185 - (index % 2) * 36)
        : this.position.clone().addScaledVector(forward, role === 'carrier' ? 260 : 185 + this.rng.range(0, 60))
          .addScaledVector(right, (index - (roles.length - 1) / 2) * 27);
      if (!armada) position.y += this.rng.range(-16, 20);
      if (this.run.mode === 'endless' && !armada && position.length() > 440) {
        position.setLength(440);
        if (position.distanceTo(this.position) < 140) position.copy(this.position).addScaledVector(this.position.clone().negate().normalize(), 190);
      }
      if (this.definition.kind === 'ambush' && this.run.elapsed > 5) position.sub(this.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), index % 2 ? 0.75 : -0.75).add(this.position);
      const actor = this.addActor('pirate', createEnemyModel(role), position, role === 'carrier' ? 23 : role === 'gunship' ? 10 : 8, HULL[role], role);
      arrivals.push(actor);
      actor.cooldown += index * 0.25;
      if (role === 'carrier' && this.definition.kind === 'boss') {
        actor.hull = actor.maxHull = 300 + this.definition.chapter * 130;
        actor.essential = true;
        for (let partIndex = 0; partIndex < this.definition.bossParts; partIndex += 1) {
          const offset = new THREE.Vector3((partIndex % 2 ? 1 : -1) * (27 + Math.floor(partIndex / 2) * 7), Math.floor(partIndex / 2) * 11 - 4, -2);
          const model = new THREE.Group();
          model.add(edgesFromGeometry(new THREE.BoxGeometry(11, 9, 13), partIndex < 2 && this.definition.chapter > 1 ? 0xff69a8 : 0xffa950));
          model.add(lineShape([[0, 0, 0], [-offset.x * 0.75, -offset.y * 0.75, 0]], [[0, 1]], 0xff4055));
          const part = this.addActor('part', model, position.clone().add(offset), 8, 100 + this.definition.chapter * 18, 'gunship');
          part.parent = actor.id; part.offset.copy(offset);
          part.cooldown = 3 + partIndex;
        }
      }
    });
    this.announceArrival(arrivals, roles.includes('carrier') ? 'CARRIER WARPED IN' : `${roles.length} PIRATE REINFORCEMENTS WARPED IN`);
  }
  private announceArrival(actors: Actor[], message: string): void {
    this.arrivalTime = 4;
    this.arrivalMessage = message;
    this.log(message);
    this.sound.reinforcements();
    for (const actor of actors) {
      const radius = actor.radius * 1.8;
      const points: number[] = [];
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        const next = (i + 1) * Math.PI / 6;
        points.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0,
          Math.cos(next) * radius, Math.sin(next) * radius, 0);
        if (i % 2 === 0) points.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0,
          Math.cos(angle) * radius * 1.4, Math.sin(angle) * radius * 1.4, -radius * 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const object = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xffb060, transparent: true, depthWrite: false }));
      object.position.copy(actor.object.position);
      object.quaternion.copy(this.orientation);
      object.scale.setScalar(1.6);
      this.world.add(object);
      this.particles.push({ object, velocity: new THREE.Vector3(), life: 0.85, duration: 0.85, warpIn: true });
    }
  }
  private step(dt: number): void {
    const run = this.run;
    const look = this.input.consume(dt);
    this.shotDelay = Math.max(0, this.shotDelay - dt);
    this.feedbackTime = Math.max(0, this.feedbackTime - dt); this.hitTime = Math.max(0, this.hitTime - dt);
    this.popupTime = Math.max(0, this.popupTime - dt);
    this.arrivalTime = Math.max(0, this.arrivalTime - dt);
    for (const message of this.messages) message.ttl -= dt;
    this.messages = this.messages.filter(message => message.ttl > 0);
    if (this.bonus) {
      const health = this.bonus.state.health, points = this.bonus.state.points;
      this.bonus.step(dt, look, this.camera);
      if (this.input.consumeFire() && this.shotDelay <= 0) {
        this.shotDelay = 0.2; this.sound.shoot();
        if (this.bonus.shoot(this.camera)) { this.sound.pickup(); this.hitTime = 0.12; }
      }
      if (this.bonus.state.points > points) {
        this.sound.pickup(); this.popupTime = 0.7; this.ui.text('scorePopup', `+${this.bonus.state.points - points}`);
      }
      if (this.bonus.state.notice) { this.log(this.bonus.state.notice); this.bonus.state.notice = ''; this.sound.warning(); }
      if (this.bonus.state.health < health) {
        this.sound.damage(); this.feedbackTime = 1.2; this.ui.text('hitCallout', 'LOAN SKIFF HIT');
        const layer = document.querySelector<HTMLElement>('#damageLayer')!;
        layer.classList.remove('active'); void layer.offsetWidth; layer.classList.add('active');
      }
      if (this.bonus.state.finished) this.finishBonus(this.bonus.state.reason!);
      return;
    }
    this.previousPosition.copy(this.position);
    if (this.definition.kind === 'armada' && !run.cleared) {
      this.position.x = THREE.MathUtils.clamp(this.position.x + look.x * 0.22 - look.roll * dt * 75, -76, 76);
      this.position.y = 0; this.position.z = 0; this.orientation.identity();
    } else {
      rotateLocally(this.orientation, look.x, look.y, look.roll, dt);
      this.position.addScaledVector(this.forward(), look.speed * dt);
      if (this.run.mode === 'endless' && !run.cleared && this.position.length() > 500) {
        this.position.setLength(500); this.log('ARENA EDGE: TURN BACK TOWARD THE FIGHT');
      }
    }
    this.updateCamera();
    if (this.warp > 0) {
      this.warp -= dt;
      if (this.warp <= 0) { document.querySelector('#warpLayer')!.classList.remove('active'); this.afterStage(); }
      return;
    }
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (run.phase === 'playing') {
      run.elapsed += dt; tickChain(run, dt);
      this.spawnPack(this.director.next(run.elapsed, this.hostiles().length));
      this.updateActors(dt);
      if (this.menu) return;
      if (this.input.consumeFire()) this.shoot();
      this.updateShots(dt);
      if (this.menu) return;
      this.updateCargo(dt);
      this.updateLaw(dt);
      this.updateObjective(dt);
      if (this.menu) return;
      if (this.director.finished && !this.hostiles().length && this.objectiveComplete()) this.completeStage();
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
  private objectiveComplete(): boolean {
    if (this.definition.kind === 'rescue') return this.rescued;
    if (this.definition.kind === 'escort') return !!this.objectiveShip && this.objectiveShip.age >= 75 && !this.objectiveShip.dead;
    return !this.objectiveShip?.dead;
  }
  private updateObjective(dt: number): void {
    if (!this.objectiveShip || this.objectiveShip.dead) return;
    if (this.definition.kind === 'escort') {
      this.objectiveShip.age += dt;
      this.objectiveShip.object.position.lerpVectors(this.objectiveShip.anchor, this.base!.object.position.clone().add(new THREE.Vector3(0, 10, 35)), Math.min(1, this.objectiveShip.age / 75));
    }
  }
  private completeStage(): void {
    if (!settleStage(this.run)) return;
    this.arrivalTime = 0;
    this.input.clear();
    this.sound.complete(); this.log('MISSION COMPLETE!');
    for (const shot of this.shots) { this.world.remove(shot.object); disposeObject(shot.object); }
    this.shots = [];
    if (this.run.mode === 'endless' && this.run.stage % 5 !== 0) {
      this.run.phase = 'recovery'; this.recovery = 8; this.log('WAVE CLEAR: CLICK TO START THE NEXT WAVE');
    } else { this.activateGate(); this.log('Head to the Warp Gate!'); }
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
    this.warp = 1.75;
    document.querySelector('#warpLayer')!.classList.add('active');
    this.sound.warp();
  }
  private afterStage(): void {
    if (this.run.mode === 'journey' && this.run.stage === 12) { advance(this.run); this.record(); this.victory(); }
    else if (bonusFor(this.run) && this.run.bonusStatus === 'available') this.showBonusOffer();
    else this.showShop();
  }
  private updateActors(dt: number): void {
    this.threat = null;
    const actors = [...this.actors];
    for (const actor of actors) {
      if (actor.dead || ['cargo', 'gate', 'planet', 'market'].includes(actor.kind)) continue;
      actor.previous.copy(actor.object.position);
      if (!actor.essential || this.definition.kind !== 'escort') actor.age += dt;
      actor.cooldown = Math.max(0, actor.cooldown - dt);
      if (actor.kind === 'mine') {
        actor.object.rotation.y += dt;
        actor.object.scale.setScalar(1 + Math.sin(actor.age * 12) * 0.15);
        if (actor.age > 1.5 && this.position.distanceTo(actor.object.position) < 12) { this.damagePlayer(18, 'MINE EXPLOSION'); this.destroy(actor, false); }
        if (actor.age > 14) this.destroy(actor, false);
        continue;
      }
      if (actor.kind === 'part') {
        const parent = this.actors.find(item => item.id === actor.parent && !item.dead);
        if (!parent) { this.removeActor(actor); continue; }
        actor.object.position.copy(parent.object.position).add(actor.offset);
      }
      const target = this.combatTarget(actor);
      if (actor.kind === 'pirate') {
        if (this.definition.kind === 'armada') {
          const phase = (this.run.elapsed + actor.id * 0.6) % 10;
          const diving = actor.role === 'diver' && phase > 6;
          actor.object.position.set(actor.anchor.x + Math.sin(this.run.elapsed * 0.6) * 18,
            0,
            diving ? actor.anchor.z + Math.sin((phase - 6) / 4 * Math.PI) * 190 : actor.anchor.z + Math.min(65, actor.age * 1.3));
        } else {
          const targetPoint = target?.object.position ?? this.position;
          const delta = targetPoint.clone().sub(actor.object.position);
          const distance = delta.length(); const direction = delta.normalize();
          const side = new THREE.Vector3(-direction.z, 0, direction.x);
          const desired = actor.role === 'raider' && actor.age % 7 < 2 ? 80 : actor.role === 'carrier' || actor.role === 'gunship' ? 235 : 155;
          const velocity = direction.multiplyScalar(distance > desired ? actor.role === 'carrier' ? 35 : 72 : -24);
          velocity.addScaledVector(side, actor.role === 'flanker' ? (actor.id % 2 ? 65 : -65) : actor.role === 'carrier' ? 8 : 20);
          if (actor.role === 'diver') velocity.y += Math.sin(actor.age * 1.8) * 70;
          actor.object.position.addScaledVector(velocity, dt);
          if (this.run.mode === 'endless' && actor.object.position.length() > 440) actor.object.position.setLength(440);
        }
        actor.object.lookAt(target?.object.position ?? this.position);
        actor.object.rotateY(Math.PI);
        const salvage = this.actors.find(item => item.kind === 'cargo' && item.drop && canNpcCollect(actor.faction, item.drop.type, item.essential) && item.object.position.distanceTo(actor.object.position) < 35);
        if (salvage && this.definition.kind !== 'armada') {
          actor.object.position.lerp(salvage.object.position, dt * 1.5);
          if (salvage.object.position.distanceTo(actor.object.position) < 15) this.removeActor(salvage);
        }
        if (actor.role === 'minelayer' && actor.spawned < 6 && actor.age > 3 && actor.age > actor.spawned * 5 + 3 && this.hostiles().length < 18) {
          actor.spawned += 1;
          this.addActor('mine', edgesFromGeometry(new THREE.OctahedronGeometry(5), 0xff4055), actor.object.position.clone(), 6, 20);
        }
        const bayOpen = !actor.essential || this.actors.some(part => part.parent === actor.id && part.offset.y < 0);
        if (actor.role === 'carrier' && bayOpen && actor.age > 9 + actor.spawned * 9 && actor.spawned < 6 && this.hostiles().length < 17) {
          actor.spawned += 1;
          const spawn = actor.object.position.clone().add(new THREE.Vector3(35, 0, 0));
          if (spawn.distanceTo(this.position) < 110) spawn.copy(this.position).addScaledVector(this.forward(), 150);
          const child = this.addActor('pirate', createEnemyModel('raider'), spawn, 8, HULL.raider);
          this.announceArrival([child], 'CARRIER DEPLOYED REINFORCEMENTS');
          child.cooldown = 2;
        }
      } else if (actor.kind === 'police' || actor.kind === 'trader') {
        const salvage = this.actors.find(item => !item.dead && item.kind === 'cargo' && item.drop
          && canNpcCollect(actor.faction, item.drop.type, item.essential) && item.object.position.distanceTo(actor.object.position) < 100);
        if (salvage && !(actor.kind === 'police' && this.run.pilot.wanted.active) && !actor.essential) {
          actor.object.position.addScaledVector(salvage.object.position.clone().sub(actor.object.position).normalize(), dt * 40);
          if (salvage.object.position.distanceTo(actor.object.position) < 15) this.removeActor(salvage);
        } else if (!actor.essential) {
          const huntingPlayer = (actor.kind === 'police' && this.run.pilot.wanted.active) || actor.target === -1;
          const destination = huntingPlayer ? this.position : target?.object.position ?? actor.anchor.clone().add(new THREE.Vector3(Math.sin(actor.age * 0.2) * 50, 0, 0));
          const direction = destination.clone().sub(actor.object.position);
          if (direction.length() > 100 || !target) actor.object.position.addScaledVector(direction.normalize(), dt * (actor.kind === 'police' ? 58 : 25));
        }
        actor.object.lookAt(target?.object.position ?? actor.anchor);
        actor.object.rotateY(Math.PI);
      }
      if (['pirate', 'police', 'trader', 'part'].includes(actor.kind)) this.attackStep(actor, target, dt);
      if (this.menu) return;
    }
  }
  private combatTarget(actor: Actor): Actor | null {
    if (actor.faction === 'police' && this.run.pilot.wanted.active) return null;
    if (actor.kind === 'trader' && actor.target === -1) return null;
    const candidates = this.actors.filter(item => !item.dead && item !== actor && item.kind !== 'mine'
      && (actor.faction === 'pirate' ? (item.faction === 'police' || item.faction === 'trader' || item === this.objectiveShip)
        : item.faction === 'pirate' && (item.kind === 'pirate' || item.kind === 'part')));
    candidates.sort((a, b) => a.object.position.distanceToSquared(actor.object.position) - b.object.position.distanceToSquared(actor.object.position));
    const target = candidates[0];
    if (!target) return null;
    if (actor.faction === 'pirate' && actor.object.position.distanceToSquared(this.position) < target.object.position.distanceToSquared(actor.object.position)) return null;
    return target;
  }
  private attackStep(actor: Actor, target: Actor | null, dt: number): void {
    const aimsAtPlayer = !target && (actor.faction === 'pirate' || (actor.kind === 'police' && this.run.pilot.wanted.active) || actor.target === -1);
    if (!target && !aimsAtPlayer) { actor.windup = -1; return; }
    const point = target?.object.position ?? this.position;
    if (actor.object.position.distanceTo(point) > 390) { actor.windup = -1; return; }
    if (actor.windup < 0 && actor.cooldown <= 0 && actor.age >= 1.1) {
      const attackers = this.actors.filter(item => item.windup >= 0 && !item.dead).length;
      if (attackers >= this.definition.attackerCap) return;
      actor.windup = 0.8;
    }
    if (actor.windup >= 0) {
      actor.windup -= dt;
      if (aimsAtPlayer) this.threat = actor;
      actor.object.traverse(child => { if (child instanceof THREE.LineSegments) (child.material as THREE.LineBasicMaterial).opacity = 0.55 + Math.sin(actor.age * 28) * 0.4; });
      if (actor.windup <= 0) {
        actor.windup = -1;
        actor.cooldown = (actor.role === 'carrier' ? 1.4 : actor.role === 'gunship' ? 2.5 : 1.7) / this.definition.speedScale;
        if (actor.essential && actor.role === 'carrier' && actor.hull < actor.maxHull * 0.5) actor.cooldown *= 0.7;
        const aimPoint = point.clone();
        if (aimsAtPlayer && this.definition.kind !== 'armada') {
          const lead = actor.object.position.distanceTo(point) / (160 * this.definition.speedScale) * (0.2 + this.definition.chapter * 0.15);
          aimPoint.addScaledVector(this.position.clone().sub(this.previousPosition).multiplyScalar(60), Math.min(1.2, lead));
        }
        const direction = aimPoint.sub(actor.object.position).normalize();
        const count = actor.role === 'gunship' || actor.role === 'carrier' ? 3 : 1;
        for (let index = 0; index < count; index += 1) {
          const aim = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (index - (count - 1) / 2) * 0.09);
          this.spawnShot(actor.faction, actor.id, target?.id ?? 0, actor.object.position.clone().addScaledVector(aim, actor.radius + 5), aim,
            160 * this.definition.speedScale, actor.kind === 'trader' ? 7 : 10, actor.faction === 'pirate' ? 0xff4055 : actor.faction === 'police' ? 0x75caff : 0x60ff85, 4.5, 20, 1);
        }
        actor.object.traverse(child => { if (child instanceof THREE.LineSegments) (child.material as THREE.LineBasicMaterial).opacity = 0.94; });
        this.sound.enemyShoot(actor.faction, actor.object.position.distanceTo(this.position));
      }
    }
  }
  private shoot(): void {
    if (this.shotDelay > 0 || this.run.phase !== 'playing') return;
    const spec = weaponSpec(this.run.family, this.run.tiers[this.run.family]);
    this.shotDelay = spec.cooldown;
    const direction = this.forward();
    if (this.profile.settings.aimAssist && this.definition.kind !== 'armada') {
      const targets = this.actors.filter(actor => !actor.dead && actor.faction === 'pirate' && actor.kind !== 'cargo')
        .map(actor => ({ actor, delta: actor.object.position.clone().sub(this.position) }))
        .filter(target => target.delta.length() < 500 && target.delta.angleTo(direction) < 0.035)
        .sort((a, b) => a.delta.angleTo(direction) - b.delta.angleTo(direction));
      if (targets[0]) direction.lerp(targets[0].delta.normalize(), 0.75).normalize();
    }
    for (let index = 0; index < spec.count; index += 1) {
      const aim = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0).applyQuaternion(this.orientation), (index - (spec.count - 1) / 2) * spec.spread);
      this.spawnShot('player', -1, 0, this.position.clone().addScaledVector(aim, 9), aim, spec.speed, spec.damage, spec.color, spec.radius, spec.length, spec.pierce);
    }
    this.stats.shots += 1;
    this.sound.shoot(this.run.family);
  }
  private spawnShot(faction: Faction, source: number, target: number, position: THREE.Vector3, direction: THREE.Vector3, speed: number, damage: number, color: number, radius: number, length: number, pierce: number): void {
    if (this.shots.length >= 240) return;
    const object = createBoltModel(color, radius, length, faction, faction === 'player' ? this.run.family : 'pulse');
    object.position.copy(position); object.lookAt(position.clone().add(direction));
    this.world.add(object);
    this.shots.push({ id: this.nextId++, source, faction, target, object, previous: position.clone(), velocity: direction.clone().multiplyScalar(speed), damage, radius, ttl: faction === 'player' ? 1.35 : 3.2, pierce, hit: new Set() });
  }
  private updateShots(dt: number): void {
    const expired = new Set<Shot>();
    const events: Array<{ time: number; shot: Shot; actor?: Actor; intercepted?: Shot }> = [];
    for (const shot of this.shots) {
      shot.previous.copy(shot.object.position);
      shot.object.position.addScaledVector(shot.velocity, dt); shot.ttl -= dt;
      const pulse = (Math.sin(shot.ttl * 24) + 1) / 2;
      shot.object.scale.setScalar(0.85 + pulse * 0.22); setProjectilePulseOpacity(shot.object, pulse);
      if (shot.ttl <= 0) expired.add(shot);
    }
    // Resolve all swept contacts in time order, so an intercepted bolt cannot hit afterward.
    for (const shot of this.shots) {
      if (expired.has(shot)) continue;
      if (shot.faction === 'player') {
        for (const other of this.shots) {
          if (expired.has(other) || other.faction === 'player' || !(other.faction === 'pirate' || other.target === 0)) continue;
          const time = sweptHit(shot.previous, shot.object.position, other.previous, other.object.position, shot.radius + other.radius);
          if (time !== null) events.push({ time, shot, intercepted: other });
        }
      }
      for (const actor of this.actors) {
        if (!this.canHit(shot, actor)) continue;
        const time = sweptHit(shot.previous, shot.object.position, actor.previous, actor.object.position, actor.radius + shot.radius * 0.5);
        if (time !== null) events.push({ time, shot, actor });
      }
      if (shot.faction !== 'player' && (shot.faction === 'pirate' || shot.target === 0)) {
        const time = sweptHit(shot.previous, shot.object.position, this.previousPosition, this.position, 3 + shot.radius * 0.5);
        if (time !== null) events.push({ time, shot });
      }
    }
    events.sort((a, b) => a.time - b.time);
    for (const { shot, actor, intercepted } of events) {
      if (expired.has(shot)) continue;
      if (intercepted) {
        if (expired.has(intercepted)) continue;
        expired.add(intercepted); expired.add(shot);
        rewardInterception(this.run); this.stats.interceptions += 1;
        this.spark(intercepted.object.position, 0xffff90, 5); this.hitTime = 0.16; this.sound.intercept();
      } else if (actor) {
        if (actor.dead || shot.hit.has(actor.id)) continue;
        shot.hit.add(actor.id); shot.pierce -= 1;
        this.damageActor(actor, shot.damage, shot.faction === 'player');
        if (shot.faction !== 'player') this.stats.npcHits += 1;
        if (shot.pierce <= 0) expired.add(shot);
      } else {
        expired.add(shot);
        this.damagePlayer(shot.damage, shot.faction === 'pirate' ? 'RED PIRATE SHOT YOU. SHOOT THEM BACK!' : 'INCOMING FIRE');
      }
      if (this.menu) break;
    }
    this.shots = this.shots.filter(shot => {
      if (!expired.has(shot)) return true;
      this.world.remove(shot.object); disposeObject(shot.object); return false;
    });
  }
  private canHit(shot: Shot, actor: Actor): boolean {
    if (actor.dead || actor.id === shot.source || shot.hit.has(actor.id) || actor.faction === shot.faction || !Number.isFinite(actor.hull)) return false;
    if (actor.kind === 'base' && !actor.essential) return false;
    if (shot.faction === 'player') return ['pirate', 'police', 'trader', 'part', 'mine'].includes(actor.kind);
    if (shot.faction === 'pirate') return actor.kind === 'police' || actor.kind === 'trader' || (actor.kind === 'base' && actor.essential);
    return actor.kind === 'pirate' || actor.kind === 'part' || actor.kind === 'mine';
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
    if (actor.dead) return;
    this.spark(actor.object.position, actor.faction === 'pirate' ? 0xff5863 : 0x8affb0, 14);
    this.sound.explosion(actor.object.position.distanceTo(this.position));
    if (actor.kind === 'part') this.log('OUTER SYSTEM DESTROYED');
    if (actor.faction === 'pirate') {
      if (byPlayer) {
        const score = rewardKill(this.run, actor.kind === 'part' ? 150 : actor.kind === 'mine' ? 25 : actor.role === 'carrier' ? 500 : 100);
        this.ui.text('scorePopup', `+${score}`); this.popupTime = 0.7; this.stats.kills += 1;
      }
      if (actor.kind === 'pirate') {
        if (!this.run.earlyCore) {
          this.run.earlyCore = true;
          this.spawnCargo({ type: 'weaponCore', amount: 1 }, this.position.clone().addScaledVector(this.forward(), 15), true);
        } else {
          const type = this.rng.pick<CargoType>(['credits', 'credits', 'legalCargo', 'rareMineral', 'shieldCell', 'contraband', 'weaponCore']);
          this.spawnCargo({ type, amount: 1 }, actor.object.position.clone());
        }
        if (actor.role === 'carrier') for (const part of this.actors.filter(item => item.parent === actor.id && !item.dead)) this.removeActor(part);
      }
    } else if (byPlayer) this.run.pilot.score = Math.max(0, this.run.pilot.score - 150);
    this.removeActor(actor);
    if (actor === this.objectiveShip) this.fail(this.definition.kind === 'escort' ? 'CONVOY LOST' : 'STATION LOST');
  }
  private damagePlayer(damage: number, message: string): void {
    if (this.invulnerable > 0 || this.run.phase !== 'playing') return;
    const shield = Math.min(this.run.pilot.shield, damage);
    this.run.pilot.shield -= shield; this.run.pilot.hull = Math.max(0, this.run.pilot.hull - (damage - shield));
    this.invulnerable = 0.28; resetChain(this.run);
    this.log(message); this.sound.damage(); this.feedbackTime = 1.6;
    this.ui.text('hitCallout', message);
    const layer = document.querySelector('#damageLayer')!;
    layer.classList.remove('active'); void (layer as HTMLElement).offsetWidth; layer.classList.add('active');
    if (this.run.pilot.hull <= 0) this.fail('SHIP LOST');
  }
  private special(): void {
    if (this.bonus) { this.finishBonus('exit'); return; }
    if (!this.runState || this.run.phase !== 'playing') return;
    if (this.run.charge < 100) { this.log(`BLAST CHARGING ${this.run.charge}%`); return; }
    this.run.charge = 0;
    for (const shot of this.shots) {
      if (shot.faction !== 'player' && (shot.faction === 'pirate' || shot.target === 0) && shot.object.position.distanceTo(this.position) <= 240) shot.ttl = 0;
    }
    for (const actor of [...this.actors]) {
      if (!actor.dead && actor.faction === 'pirate' && actor.object.position.distanceTo(this.position) <= 240) this.damageActor(actor, 85, true);
    }
    const ring = createPulseRing(0xcaffff, 18, 0, 1, 24);
    ring.position.copy(this.position).addScaledVector(this.forward(), 28); ring.quaternion.copy(this.orientation);
    this.world.add(ring); this.particles.push({ object: ring, velocity: this.forward().multiplyScalar(50), life: 0.65, duration: 0.65 });
    this.sound.blast(); this.log('DEFENSIVE BLAST');
  }
  private updateCargo(dt: number): void {
    for (const actor of [...this.actors]) {
      if (actor.dead || actor.kind !== 'cargo' || !actor.drop) continue;
      actor.object.rotation.y += dt * 0.9;
      let distance = actor.object.position.distanceTo(this.position);
      if (actor.drop.type !== 'contraband' && distance < this.run.magnet) {
        actor.object.position.lerp(this.position, Math.min(1, dt * 6));
        distance = actor.object.position.distanceTo(this.position);
      }
      if (distance < (actor.drop.type === 'contraband' ? 7 : 9)) {
        const oldTier = this.run.tiers[this.run.family];
        pickup(this.run, actor.drop); this.stats.pickups += 1;
        if (this.run.tiers[this.run.family] > oldTier) {
          if (this.stats.firstUpgrade < 0) this.stats.firstUpgrade = this.run.elapsed;
          this.log(`${this.run.family.toUpperCase()} UPGRADED TO TIER ${this.run.tiers[this.run.family]}`);
        } else this.log(actor.drop.type === 'weaponCore' ? 'WEAPON CORE: +200 UPGRADE CREDITS' : `${actor.drop.type.replace(/([A-Z])/g, ' $1').toUpperCase()} COLLECTED`);
        this.sound.pickup(); this.removeActor(actor);
      }
    }
    const nearBase = !!this.base && this.position.distanceTo(this.base.object.position) < 95;
    if (nearBase) {
      const rescued = this.run.pilot.inventory.rescuePods > 0;
      const trade = instantTrade(this.run.pilot, 'lawful');
      if (trade.creditsEarned > 0) { this.run.pilot = trade.progress; this.log(`CARGO SOLD +${trade.creditsEarned} CR`); this.sound.pickup(); }
      if (rescued) this.rescued = true;
    }
    const nearMarket = this.actors.some(actor => actor.kind === 'market' && actor.object.position.distanceTo(this.position) < 70);
    if (nearMarket && this.run.pilot.inventory.contraband > 0) {
      const trade = instantTrade(this.run.pilot, 'blackMarket'); this.run.pilot = trade.progress;
      this.log(`BLACK MARKET +${trade.creditsEarned} CR`); this.sound.pickup();
    }
  }
  private updateLaw(dt: number): void {
    this.scanCooldown -= dt;
    if (this.base && this.position.distanceTo(this.base.object.position) < 110 && this.scanCooldown <= 0 && this.run.pilot.inventory.contraband > 0) {
      const result = resolveContrabandScan(this.run.pilot, `stage-${this.run.stage}`);
      this.run.pilot = result.progress; this.scanCooldown = 8; this.log(result.message.toUpperCase()); this.sound.warning();
    }
    if (this.run.pilot.wanted.active && !this.policeDispatched) {
      this.warrantTime += dt;
      if (this.warrantTime >= 8) {
        this.policeDispatched = true;
        const origin = this.base?.object.position ?? this.position.clone().add(new THREE.Vector3(180, 0, 0));
        for (let i = 0; i < 3; i += 1) this.addActor('police', createPoliceModel(), origin.clone().add(new THREE.Vector3(i * 20, 35, 0)), 9, 100);
        this.log('POLICE DISPATCHED FROM NEAREST STATION'); this.sound.warning();
      }
    }
  }
  private collideWorld(): void {
    if (this.definition.kind === 'armada') return;
    for (const actor of this.actors) {
      if (!['base', 'planet', 'market'].includes(actor.kind)) continue;
      const radius = actor.radius + 4;
      const offset = this.position.clone().sub(actor.object.position);
      if (offset.length() < radius) {
        if (offset.lengthSq() < 0.01) offset.copy(this.forward()).negate();
        this.position.copy(actor.object.position).addScaledVector(offset.normalize(), radius);
        this.input.throttle = THREE.MathUtils.clamp(this.input.throttle, -20, 20); this.updateCamera();
      }
    }
  }
  private removeActor(actor: Actor): void { if (actor.dead) return; actor.dead = true; this.world.remove(actor.object); disposeObject(actor.object); this.actors = this.actors.filter(item => item !== actor); }
  private spark(position: THREE.Vector3, color: number, count: number): void {
    for (let i = 0; i < count && this.particles.length < 160; i += 1) {
      const direction = new THREE.Vector3(this.rng.range(-1, 1), this.rng.range(-1, 1), this.rng.range(-1, 1)).normalize();
      const part = lineShape([[0, 0, 0], [direction.x * 5, direction.y * 5, direction.z * 5]], [[0, 1]], color);
      part.position.copy(position); this.world.add(part);
      this.particles.push({ object: part, velocity: direction.multiplyScalar(this.rng.range(15, 70)), life: 0.5, duration: 0.5 });
    }
  }
  private updateEffects(dt: number): void {
    for (const part of this.particles) {
      part.life -= dt; part.object.position.addScaledVector(part.velocity, dt);
      if (part.warpIn) part.object.scale.setScalar(0.2 + Math.max(0, part.life / part.duration) * 1.4);
      if (part.object instanceof THREE.LineSegments) (part.object.material as THREE.LineBasicMaterial).opacity = Math.max(0, part.life / part.duration);
    }
    this.particles = this.particles.filter(part => { if (part.life > 0) return true; this.world.remove(part.object); disposeObject(part.object); return false; });
  }
  private makeStars(): THREE.Points {
    const rng = new Random(83811); const positions = new Float32Array(480 * 3);
    for (let i = 0; i < positions.length; i += 3) {
      const point = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize().multiplyScalar(rng.range(450, 2000));
      positions.set(point.toArray(), i);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({ size: 5, color: 0xb1b6b9, map: createStarTexture(), alphaTest: 0.05, transparent: true, depthWrite: false }));
  }
  private hud(): void {
    if (this.menu === 'title') {
      this.ui.text('arcadeScore', '000000');
      this.ui.text('arcadeBest', String(this.profile.records[this.selectedMode]).padStart(6, '0'));
      return;
    }
    if (!this.runState) return;
    const run = this.run; const pilot = run.pilot;
    const bonus = this.bonus?.state;
    this.ui.text('stageLabel', bonus ? 'BONUS SORTIE' : `${run.mode === 'journey' ? 'JOURNEY STAGE' : 'ENDLESS WAVE'} ${run.stage}`);
    this.ui.text('sectorName', bonus ? BONUS_NAMES[bonus.kind] : this.definition.title);
    this.ui.text('reputation', bonus ? 'MAIN SHIP SAFE' : pilot.wanted.active ? `WANTED / HEAT ${pilot.wanted.heat}` : 'SECTOR CLEARANCE: CLEAN');
    this.ui.text('scoreReadout', String(Math.floor(pilot.score)).padStart(6, '0'));
    this.ui.text('arcadeScore', String(Math.floor(pilot.score)).padStart(6, '0'));
    this.ui.text('arcadeBest', String(Math.max(pilot.score, this.profile.records[`${run.mode}${run.continued ? 'Continued' : ''}`])).padStart(6, '0'));
    this.ui.text('creditReadout', `CR ${pilot.credits}`);
    this.ui.text('cargoReadout', `CARGO ${pilot.inventory.legalCargo + pilot.inventory.rareMineral} / X ${pilot.inventory.contraband}`);
    this.ui.text('hullReadout', bonus ? `${bonus.health} / 3` : String(Math.ceil(pilot.hull)));
    this.ui.text('shieldReadout', bonus ? 'LOAN SKIFF' : `${Math.ceil(pilot.shield)} / ${pilot.maxShield}`);
    this.ui.text('weaponReadout', bonus ? 'SKIFF PULSE' : `${run.family.toUpperCase()} ${run.tiers[run.family]}`);
    this.ui.text('speedReadout', bonus ? 'AUTO' : this.definition.kind === 'armada' && !run.cleared ? 'L / R' : throttleReadout(this.input.throttle));
    this.ui.text('livesReadout', `LIVES ${run.lives}`);
    this.ui.text('chainReadout', `CHAIN x${run.chain.multiplier}`);
    this.ui.text('chargeReadout', bonus ? 'RIGHT CLICK: EXIT BONUS' : run.charge >= 100 ? 'BLAST READY / RIGHT CLICK' : `BLAST ${run.charge}%`);
    this.ui.text('missionTitle', bonus ? `${Math.ceil(bonus.remaining)} SECONDS` : run.phase === 'recovery' ? `NEXT WAVE IN ${Math.ceil(this.recovery)}` : run.cleared ? 'MISSION COMPLETE' : this.definition.kind === 'armada' ? 'MOVE LEFT / RIGHT' : this.definition.kind === 'boss' ? 'BREAK THE OUTER SYSTEMS' : 'CLEAR THE PIRATE FLIGHTS');
    const arrival = this.arrivalTime > 0 && run.phase === 'playing' && !bonus;
    if (arrival) this.ui.text('missionTitle', 'REINFORCEMENTS ARRIVED');
    document.querySelector('#missionTitle')!.classList.toggle('arrival-alert', arrival);
    const boss = this.actors.find(actor => actor.kind === 'pirate' && actor.essential && actor.role === 'carrier');
    const objective = boss ? `${this.actors.filter(actor => actor.parent === boss.id).length} OUTER SYSTEMS / CORE ${Math.ceil(boss.hull / boss.maxHull * 100)}%`
      : this.definition.kind === 'rescue' && !this.rescued ? (pilot.inventory.rescuePods ? 'DELIVER POD TO STATION' : 'COLLECT THE WHITE POD')
      : this.objectiveShip ? `PROTECT ${this.definition.kind === 'escort' ? 'CONVOY' : 'STATION'}: ${Math.ceil(Math.max(0, this.objectiveShip.hull))}` : `FLIGHT ${this.director.flight}/${this.director.totalFlights} / ${this.hostiles().length} HOSTILES`;
    this.ui.text('missionProgress', bonus ? bonus.kind === 'sequence' ? `NEXT MARKER ${Math.min(16, bonus.nextMarker)} / 16` : `SALVAGE ${bonus.points} / SKIFF ${bonus.health}` : run.cleared ? run.phase === 'recovery' ? 'CLICK TO START NOW' : 'HEAD TO THE WARP GATE!' : objective);
    this.ui.text('messageLog', this.messages.map(message => message.text).join('\n'));
    document.querySelector('#wantedBanner')!.classList.toggle('active', pilot.wanted.active && !bonus);
    document.querySelector('#hitCallout')!.classList.toggle('active', this.feedbackTime > 0);
    (document.querySelector('#hitConfirm') as HTMLElement).style.opacity = this.hitTime > 0 ? '1' : '0';
    (document.querySelector('#scorePopup') as HTMLElement).style.opacity = this.popupTime > 0 ? '1' : '0';
    (document.querySelector('#bonusExitButton') as HTMLElement).hidden = !bonus;
    (document.querySelector('#nextWaveButton') as HTMLElement).hidden = run.phase !== 'recovery';
    let destination: Actor | null = run.cleared ? run.phase === 'recovery' ? null : this.gate : this.definition.kind === 'rescue' && !this.rescued ? (pilot.inventory.rescuePods ? this.base : this.objectivePod) : this.objectiveShip;
    if (!destination && this.hostiles().length) destination = this.hostiles().sort((a, b) => a.object.position.distanceToSquared(this.position) - b.object.position.distanceToSquared(this.position))[0];
    this.indicator('objectiveArrow', bonus ? null : destination, run.cleared ? 'WARP' : destination?.faction === 'pirate' ? 'PIRATE' : 'OBJECTIVE');
    this.indicator('threatArrow', bonus ? null : this.threat, 'INCOMING');
    this.drawRadar();
  }
  private indicator(id: string, actor: Actor | null, label: string): void {
    const element = document.getElementById(id)!;
    if (!actor || actor.dead || !actor.object.visible) { element.hidden = true; return; }
    const relative = actor.object.position.clone().sub(this.camera.position).applyQuaternion(this.camera.quaternion.clone().invert());
    const angle = Math.atan2(relative.x, -relative.z);
    const vertical = relative.y > 30 ? 'UP' : relative.y < -30 ? 'DOWN' : '';
    const arrow = Math.abs(angle) > 2.4 ? 'TURN BACK' : angle > 0.25 ? '>' : angle < -0.25 ? '<' : '^';
    element.hidden = false; element.textContent = `${arrow} ${label} ${vertical} ${Math.round(relative.length())}`;
    element.style.color = label === 'WARP' ? `hsl(${performance.now() * 0.12 % 360} 100% 72%)` : label === 'INCOMING' ? '#ff6868' : '#ffff70';
  }
  private drawRadar(): void {
    const context = this.ui.radar.getContext('2d')!;
    context.clearRect(0, 0, 180, 180); context.strokeStyle = '#397a53'; context.lineWidth = 1;
    context.beginPath(); context.arc(90, 90, 82, 0, Math.PI * 2); context.moveTo(90, 8); context.lineTo(90, 172); context.moveTo(8, 90); context.lineTo(172, 90); context.stroke();
    if (this.bonus) return;
    for (const actor of this.actors) {
      if (actor.dead || !actor.object.visible || actor.kind === 'part') continue;
      const relative = actor.object.position.clone().sub(this.position).applyQuaternion(this.orientation.clone().invert());
      const distance = relative.length();
      if (distance > 650 && actor.kind !== 'gate') continue;
      const divisor = Math.max(650, distance); const x = 90 + relative.x / divisor * 76; const y = 90 + relative.z / divisor * 76;
      context.fillStyle = context.strokeStyle = actor.faction === 'pirate' ? '#ff4055' : actor.faction === 'police' ? '#75caff' : actor.faction === 'trader' ? '#60ff85' : actor.kind === 'market' || actor.drop?.type === 'contraband' ? '#ff55ef' : '#ffff70';
      if (actor.kind === 'cargo') { context.beginPath(); context.moveTo(x, y - 4); context.lineTo(x - 3.5, y + 3); context.lineTo(x + 3.5, y + 3); context.closePath(); context.stroke(); }
      else if (actor.kind === 'gate') { context.beginPath(); context.moveTo(x - 4, y); context.lineTo(x + 4, y); context.moveTo(x, y - 4); context.lineTo(x, y + 4); context.stroke(); }
      else if (actor.kind === 'mine') { context.beginPath(); context.moveTo(x - 3, y - 3); context.lineTo(x + 3, y + 3); context.moveTo(x + 3, y - 3); context.lineTo(x - 3, y + 3); context.stroke(); }
      else context.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    context.fillStyle = '#fff'; context.fillRect(88, 88, 4, 4);
  }
  private exposeDebug(): void {
    const debug = {
      getState: () => ({ mode: this.runState?.mode, stage: this.runState?.stage, phase: this.runState?.phase, menu: this.menu, paused: this.paused,
        lives: this.runState?.lives, continued: this.runState?.continued, credits: this.runState?.pilot.credits, score: this.runState?.pilot.score,
        shield: this.runState?.pilot.shield, hull: this.runState?.pilot.hull, weapon: this.runState?.family, tiers: this.runState?.tiers,
        charge: this.runState?.charge, wanted: this.runState?.pilot.wanted.active, hostileCount: this.hostiles().length,
        attackerCount: this.actors.filter(actor => actor.windup >= 0).length, speedScale: this.definition.speedScale,
        bonus: this.bonus?.state, bonusStatus: this.runState?.bonusStatus, stageKind: this.definition.kind,
        position: this.position.toArray(), orientation: this.orientation.toArray(), throttle: this.input.throttle, elapsed: this.runState?.elapsed, stats: { ...this.stats },
        arrival: { remaining: this.arrivalTime, message: this.arrivalMessage, effects: this.particles.filter(part => part.warpIn).length },
        actors: this.actors.map(a => ({ id: a.id, kind: a.kind, role: a.role, hull: a.hull, position: a.object.position.toArray(), velocity: a.object.position.clone().sub(a.previous).multiplyScalar(60).toArray(), radius: a.radius, windup: a.windup, essential: a.essential, drop: a.drop?.type, visible: a.object.visible })),
        shots: this.shots.map(s => ({ faction: s.faction, target: s.target, position: s.object.position.toArray() })),
        deathTimer: Math.ceil(this.deathCountdown), messageLog: this.messages.map(message => message.text).join('\n'),
        briefingCount: document.querySelector('#modelCount')!.textContent, briefingTitle: document.querySelector('#modelTitle')!.textContent }),
      finishEncounter: () => {
        this.director.drain(); this.rescued = true;
        if (this.objectiveShip) this.objectiveShip.age = 80;
        for (const actor of [...this.actors].filter(a => a.faction === 'pirate' && a.kind === 'part')) this.destroy(actor, true);
        for (const actor of [...this.actors].filter(a => a.faction === 'pirate')) this.destroy(actor, true);
        this.completeStage();
      },
      reachGate: () => { if (this.gate && this.run.cleared) this.position.copy(this.gate.object.position); },
      forcePlayerDeath: () => { this.invulnerable = 0; this.damagePlayer(1000, 'SHIP LOST'); },
      grantCargo: (type: CargoType, amount = 1) => pickup(this.run, { type, amount }),
      giveCredits: (amount: number) => { this.run.pilot.credits += amount; },
      lookByMouse: (x: number, y: number) => this.input.injectLook(x, y),
      setStage: (number: number) => { this.run.stage = number; this.run.cleared = false; this.run.phase = 'briefing'; this.loadStage(); this.briefing(); },
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
        this.invulnerable = 30;
        for (let i = 0; i < 220; i++) this.spawnShot('pirate', 0, 0, this.position.clone().add(new THREE.Vector3((i % 20 - 10) * 12, (Math.floor(i / 20) - 5) * 10, -250)), this.forward().negate(), 30, 1, 0xff4055, 4, 20, 1);
      },
      step: (seconds: number) => { for (let t = 0; t < seconds && !this.menu && !this.paused; t += STEP) this.step(STEP); this.hud(); },
      spawnIncomingBolt: () => { const direction = this.forward(); this.spawnShot('pirate', 0, 0, this.position.clone().addScaledVector(direction, 100), direction.negate(), 160, 10, 0xff4055, 5, 20, 1); },
      persist: () => this.persist(),
      getProfile: () => clone(this.profile)
    };
    (window as unknown as { vectorShooterDebug: typeof debug }).vectorShooterDebug = debug;
  }
}
