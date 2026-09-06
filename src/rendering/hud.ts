/**
 * Projects a live frame into readable HUD text, arrows and radar contacts.
 * This is a view of existing state, not the authority for rewards or objectives.
 */
import type * as THREE from 'three';
import { formatStageTime, timeBonusSeconds, TIME_BONUS_RATE } from '../arcade';
import type { GameMode, ProfileSaveV2, RunState } from '../arcade';
import { BONUS_NAMES } from '../bonus';
import type { BonusController } from '../bonus';
import type { Actor } from '../combat/types';
import type { EncounterDirector, StageDefinition } from '../encounters';
import { throttleReadout } from '../input';
import { CONTROL_LAYOUTS } from '../input-layouts';
import { renderRadar } from '../radar';
import type { RadarContact } from '../radar';
import type { GameUI } from '../ui';
import { MODE_INFO } from '../modes';
import { WEAPON_HELP } from '../weapons';

export interface HudFrame {
  menu: string;
  profile: ProfileSaveV2;
  selectedMode: GameMode;
  run: RunState | null;
  bonus: BonusController | null;
  definition: StageDefinition;
  actors: readonly Actor[];
  throttle: number;
  recovery: number;
  arrivalTime: number;
  rescued: boolean;
  objectiveShip: Actor | null;
  director: EncounterDirector;
  position: THREE.Vector3;
  orientation: THREE.Quaternion;
  messages: readonly { text: string }[];
  feedbackTime: number;
  hitTime: number;
  popupTime: number;
  gate: Actor | null;
  base: Actor | null;
  objectivePod: Actor | null;
  threat: Actor | null;
}

export class HudController {
  private frame!: HudFrame;
  constructor(private readonly ui: GameUI) {}
  private hostiles(): Actor[] { return this.frame.actors.filter(actor => !actor.dead && (actor.kind === 'pirate' || actor.kind === 'mine')); }
  update(frame: HudFrame): void {
    this.frame = frame;
    if (this.frame.menu === 'title' || this.frame.menu === 'scores') {
      this.ui.text('arcadeScore', '000000');
      this.ui.text('arcadeBest', String(this.frame.profile.records[this.frame.selectedMode]).padStart(6, '0'));
      return;
    }
    if (!this.frame.run) return;
    const run = this.frame.run; const pilot = run.pilot;
    const bonus = this.frame.bonus?.state;
    const smuggler = run.mode === 'smuggler';
    const score = pilot.score + (smuggler && bonus ? Math.max(0, bonus.points) * 25 : 0);
    // Smuggler displays the current haul immediately, but only exit settlement
    // banks it. Keep the separate BANKED readout honest when a leg is lost.
    const canyon = this.frame.bonus?.canyon;
    const asteroids = this.frame.bonus?.asteroidRun;
    const modeLabel = { journey: 'JOURNEY', endless: 'ATTACK', invaders: 'INVADERS', smuggler: 'SMUGGLER' }[run.mode];
    this.ui.text('stageLabel', `${run.practice ? 'TEST / ' : ''}${smuggler ? `SMUGGLER LEG ${run.stage} / D${bonus?.difficulty ?? 1}` : bonus ? `BONUS / DIFFICULTY ${bonus.difficulty}` : `${modeLabel} ${MODE_INFO[run.mode].unit} ${run.stage}`}`);
    this.ui.text('sectorName', bonus ? BONUS_NAMES[bonus.kind] : this.frame.definition.title);
    this.ui.text('reputation', smuggler ? `BANKED ${pilot.score}` : bonus ? 'MAIN SHIP SAFE' : run.mode === 'invaders' ? 'DEFENSIVE LANE' : pilot.wanted.active ? `WANTED / HEAT ${pilot.wanted.heat}` : 'SECTOR CLEARANCE: CLEAN');
    this.ui.text('scoreReadout', String(Math.floor(score)).padStart(6, '0'));
    this.ui.text('arcadeScore', String(Math.floor(pilot.score)).padStart(6, '0'));
    const recordKey: keyof ProfileSaveV2['records'] = this.frame.menu === 'title' ? this.frame.selectedMode : `${run.mode}${run.continued ? 'Continued' : ''}`;
    this.ui.text('arcadeBest', String(Math.max(run.practice ? 0 : pilot.score, this.frame.profile.records[recordKey])).padStart(6, '0'));
    this.ui.text('creditReadout', smuggler ? `HAUL +${score - pilot.score}` : `CR ${pilot.credits}`);
    this.ui.text('cargoReadout', smuggler ? `NEXT LIFE ${run.nextLifeScore}` : `CARGO ${pilot.inventory.legalCargo + pilot.inventory.rareMineral} / X ${pilot.inventory.contraband}`);
    this.ui.text('hullReadout', bonus ? `${bonus.health} / 3` : String(Math.ceil(pilot.hull)));
    this.ui.text('shieldReadout', smuggler ? 'RUNNER' : bonus ? 'LOAN SKIFF' : `${Math.ceil(pilot.shield)} / ${pilot.maxShield}`);
    this.ui.text('weaponReadout', bonus ? `${bonus.family.toUpperCase()} 1` : `${run.family.toUpperCase()} ${run.tiers[run.family]}`);
    document.querySelector('#weaponReadout')!.setAttribute('title', WEAPON_HELP[bonus?.family ?? run.family]);
    this.ui.text('speedLabel', canyon ? canyon.boosting ? 'BOOST' : 'AUTO SPEED' : asteroids ? 'AUTO SPEED' : 'THROTTLE');
    this.ui.text('speedReadout', canyon ? String(Math.round(canyon.speed)) : asteroids ? String(Math.round(asteroids.speed)) : bonus ? 'AUTO' : this.frame.definition.kind === 'armada' && (!run.cleared || run.mode === 'invaders') ? 'L / R' : throttleReadout(this.frame.throttle));
    this.ui.text('livesReadout', `LIVES ${run.lives}`);
    this.ui.text('chainReadout', smuggler ? 'BANK AT EXIT' : `CHAIN x${run.chain.multiplier}`);
    const charge = bonus?.charge ?? run.charge;
    const controls = CONTROL_LAYOUTS[this.frame.profile.settings.controlScheme];
    this.ui.text('chargeReadout', charge >= 100 ? `BLAST READY / ${controls.blast}` : `BLAST ${charge}%`);
    const armadaLocked = this.frame.definition.kind === 'armada' && (!run.cleared || run.mode === 'invaders') && !bonus;
    (document.querySelector('.reticle') as HTMLElement).hidden = armadaLocked;
    this.ui.text('missionTitle', bonus ? `${Math.ceil(bonus.remaining)} SECONDS` : run.phase === 'recovery' ? `NEXT WAVE IN ${Math.ceil(this.frame.recovery)}` : run.cleared ? 'MISSION COMPLETE' : armadaLocked ? run.mode === 'invaders' ? 'BREAK THE FORMATION' : 'TRACTOR BEAM LOCKED' : this.frame.definition.kind === 'boss' ? 'BREAK THE OUTER SYSTEMS' : 'CLEAR THE PIRATE FLIGHTS');
    const arrival = this.frame.arrivalTime > 0 && run.phase === 'playing' && !bonus;
    if (arrival) this.ui.text('missionTitle', 'REINFORCEMENTS ARRIVED');
    document.querySelector('#missionTitle')!.classList.toggle('arrival-alert', arrival);
    const boss = this.frame.actors.find(actor => actor.kind === 'pirate' && actor.essential && actor.role === 'carrier');
    const objective = boss ? `${this.frame.actors.filter(actor => actor.parent === boss.id).length} OUTER SYSTEMS / CORE ${Math.ceil(boss.hull / boss.maxHull * 100)}%`
      : this.frame.definition.kind === 'rescue' && !this.frame.rescued ? (pilot.inventory.rescuePods ? 'DELIVER POD TO STATION' : 'COLLECT THE WHITE POD')
      : this.frame.objectiveShip ? `PROTECT ${this.frame.definition.kind === 'escort' ? 'CONVOY' : 'STATION'}: ${Math.ceil(Math.max(0, this.frame.objectiveShip.hull))}` : `FLIGHT ${this.frame.director.flight}/${this.frame.director.totalFlights} / ${this.hostiles().length} HOSTILES`;
    this.ui.text('missionProgress', canyon ? `${canyon.nextGate >= 18 ? 'FLY THROUGH EXIT' : `GATE ${canyon.nextGate + 1}/18`} / MISSED ${canyon.missed}/2` : asteroids?.exitApproach ? 'FLY THROUGH THE EXIT GATE' : bonus ? bonus.kind === 'sequence' ? `NEXT MARKER ${Math.min(bonus.targetCount, bonus.nextMarker)} / ${bonus.targetCount}` : `SALVAGE ${bonus.points} / SKIFF ${bonus.health}` : run.cleared ? run.phase === 'recovery' ? `${controls.fire} TO START NOW` : 'HEAD TO THE WARP GATE!' : objective);
    const sequence = bonus?.kind === 'sequence' ? bonus : null;
    (document.querySelector('#levelTimer') as HTMLElement).hidden = !!bonus && !sequence;
    this.ui.text('levelClock', sequence ? `SHOTS ${sequence.shotsFired}` : `TIME ${formatStageTime(run)}`);
    const exitLabel = run.mode === 'invaders' || run.mode === 'endless' && run.stage % 5 !== 0 ? 'NEXT' : 'GATE';
    this.ui.text('timeBonusReadout', sequence ? `BONUS SCORE ${sequence.points}` : run.timeBonus !== null ? `PAID CR ${run.timeBonus}` : `${exitLabel} +CR ${timeBonusSeconds(run) * TIME_BONUS_RATE}`);
    document.querySelector('#levelClock')!.classList.toggle('danger', !bonus && run.timeRemaining < 30 && run.timeBonus === null);
    this.ui.text('messageLog', this.frame.messages.map(message => message.text).join('\n'));
    document.querySelector('#wantedBanner')!.classList.toggle('active', pilot.wanted.active && !bonus);
    document.querySelector('#hitCallout')!.classList.toggle('active', this.frame.feedbackTime > 0);
    (document.querySelector('#hitConfirm') as HTMLElement).style.opacity = this.frame.hitTime > 0 ? '1' : '0';
    (document.querySelector('#scorePopup') as HTMLElement).style.opacity = this.frame.popupTime > 0 ? '1' : '0';
    (document.querySelector('#bonusExitButton') as HTMLElement).hidden = !bonus || smuggler;
    (document.querySelector('#nextWaveButton') as HTMLElement).hidden = run.phase !== 'recovery';
    let destination: Actor | null = run.cleared ? run.phase === 'recovery' ? null : this.frame.gate : this.frame.definition.kind === 'rescue' && !this.frame.rescued ? (pilot.inventory.rescuePods ? this.frame.base : this.frame.objectivePod) : this.frame.objectiveShip;
    if (!destination && this.hostiles().length) destination = this.hostiles().sort((a, b) => a.object.position.distanceToSquared(this.frame.position) - b.object.position.distanceToSquared(this.frame.position))[0];
    this.indicator('objectiveArrow', bonus ? null : destination, run.cleared ? 'WARP' : destination?.faction === 'pirate' ? run.mode === 'invaders' ? 'ALIEN' : 'PIRATE' : 'OBJECTIVE');
    this.indicator('threatArrow', bonus ? null : this.frame.threat, 'INCOMING');
    this.drawRadar();
  }
  private indicator(id: string, actor: Actor | null, label: string): void {
    const element = document.getElementById(id)!;
    if (!actor || actor.dead || !actor.object.visible) { element.hidden = true; return; }
    const relative = actor.object.position.clone().sub(this.frame.position).applyQuaternion(this.frame.orientation.clone().invert());
    const angle = Math.atan2(relative.x, -relative.z);
    const vertical = relative.y > 30 ? 'UP' : relative.y < -30 ? 'DOWN' : '';
    const arrow = Math.abs(angle) > 2.4 ? 'TURN BACK' : angle > 0.25 ? '>' : angle < -0.25 ? '<' : '^';
    element.hidden = false; element.textContent = `${arrow} ${label} ${vertical} ${Math.round(relative.length())}`;
    element.style.color = label === 'WARP' ? `hsl(${performance.now() * 0.12 % 360} 100% 72%)` : label === 'INCOMING' ? '#ff6868' : '#ffff70';
  }
  private drawRadar(): void {
    const contacts: RadarContact[] = this.frame.bonus ? [] : this.frame.actors
      .filter(actor => !actor.dead && actor.object.visible && actor.kind !== 'part')
      .map(actor => ({ position: actor.object.position,
        color: actor.faction === 'pirate' ? '#ff4055' : actor.faction === 'police' ? '#75caff' : actor.faction === 'trader' ? '#60ff85' : actor.kind === 'market' || actor.drop?.type === 'contraband' ? '#ff55ef' : '#ffff70',
        glyph: actor.kind === 'cargo' || actor.kind === 'gate' || actor.kind === 'mine' ? actor.kind : 'ship' }));
    renderRadar(this.ui.radar.getContext('2d')!, contacts, this.frame.position, this.frame.orientation);
  }
}
