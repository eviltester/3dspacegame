/**
 * Pure HUD projection: current state in, display values out. No DOM or clock.
 * This is a view of existing state, not the authority for rewards or objectives.
 */
import type * as THREE from 'three';
import { formatStageTime, timeBonusSeconds, TIME_BONUS_RATE } from '../arcade';
import type { GameMode, ProfileSaveV2, RunState } from '../arcade';
import { BONUS_NAMES } from '../bonus';
import type { BonusRunState } from '../bonus';
import type { Actor } from '../combat/types';
import type { EncounterDirector, StageDefinition } from '../encounters';
import { throttleReadout } from '../input';
import { CONTROL_LAYOUTS } from '../input-layouts';
import type { RadarContact } from '../radar';
import { MODE_INFO } from '../modes';
import { WEAPON_HELP } from '../weapons';
import { accuracyPercent } from '../combat/accuracy';

export interface HudFrame {
  menu: string;
  profile: ProfileSaveV2;
  selectedMode: GameMode;
  run: RunState | null;
  bonus: {
    state: Pick<BonusRunState, 'kind' | 'difficulty' | 'points' | 'health' | 'family' | 'charge' | 'remaining' | 'targetCount' | 'nextMarker' | 'shotsFired'>;
    canyon?: { speed: number; boosting: boolean; nextGate: number; missed: number } | null;
    asteroidRun?: { speed: number; exitApproach: boolean } | null;
  } | null;
  definition: Pick<StageDefinition, 'kind' | 'title'>;
  actors: readonly Actor[];
  throttle: number;
  recovery: number;
  arrivalTime: number;
  rescued: boolean;
  objectiveShip: Actor | null;
  director: Pick<EncounterDirector, 'flight' | 'totalFlights'>;
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
  shotDelay: number;
  protection: number;
}

export interface HudModel {
  text: Record<string, string>;
  classes: Array<{ selector: string; name: string; active: boolean }>;
  hidden: Record<string, boolean>;
  styles: Record<string, { color?: string; opacity?: string }>;
  titles: Record<string, string>;
  radar: RadarContact[] | null;
}

export function buildHud(frame: HudFrame, now = 0): HudModel {
  const model: HudModel = { text: {}, classes: [], hidden: {}, styles: {}, titles: {}, radar: null };
  const text = (id: string, value: string) => { model.text[id] = value; };
  const toggle = (selector: string, name: string, active: boolean) => { model.classes.push({ selector, name, active }); };
  const hostiles = () => frame.actors.filter(actor => !actor.dead && (actor.kind === 'pirate' || actor.kind === 'mine'));
  const indicator = (id: string, actor: Actor | null, label: string) => {
    model.hidden[`#${id}`] = !actor || actor.dead || !actor.object.visible;
    if (!actor || model.hidden[`#${id}`]) return;
    const relative = actor.object.position.clone().sub(frame.position).applyQuaternion(frame.orientation.clone().invert());
    const angle = Math.atan2(relative.x, -relative.z);
    const vertical = relative.y > 30 ? 'UP' : relative.y < -30 ? 'DOWN' : '';
    const arrow = Math.abs(angle) > 2.4 ? 'TURN BACK' : angle > 0.25 ? '>' : angle < -0.25 ? '<' : '^';
    text(id, `${arrow} ${label} ${vertical} ${Math.round(relative.length())}`);
    model.styles[`#${id}`] = { color: label === 'WARP' ? `hsl(${now * 0.12 % 360} 100% 72%)` : label === 'INCOMING' ? '#ff6868' : '#ffff70' };
  };
  const protectedFlight = frame.protection > 0 && !frame.menu;
  toggle('.game-shell', 'protected-flight', protectedFlight);
  model.hidden['#protectionLayer'] = !protectedFlight;
  model.styles['#protectionLayer'] = { opacity: String(0.5 + 0.3 * Math.cos(frame.protection * Math.PI * 6)) };
  if (frame.menu === 'title' || frame.menu === 'scores') {
    text('arcadeScore', '000000');
    text('arcadeBest', String(frame.profile.records[frame.selectedMode]).padStart(6, '0'));
    return model;
  }
  if (!frame.run) return model;
  const run = frame.run; const pilot = run.pilot;
  const bonus = frame.bonus?.state;
  const smuggler = run.mode === 'smuggler';
  const invaders = run.mode === 'invaders';
  const score = pilot.score + (smuggler && bonus ? Math.max(0, bonus.points) * 25 : 0);
  // Smuggler displays the current haul immediately, but only exit settlement
  // banks it. Keep the separate BANKED readout honest when a leg is lost.
  const canyon = frame.bonus?.canyon;
  const asteroids = frame.bonus?.asteroidRun;
  const modeLabel = { journey: 'JOURNEY', endless: 'ATTACK', invaders: 'INVADERS', smuggler: 'SMUGGLER' }[run.mode];
  text('stageLabel', `${run.practice ? 'TEST / ' : ''}${smuggler ? `SMUGGLER LEG ${run.stage} / D${bonus?.difficulty ?? 1}` : bonus ? `BONUS / DIFFICULTY ${bonus.difficulty}` : `${modeLabel} ${MODE_INFO[run.mode].unit} ${run.stage}`}`);
  text('sectorName', invaders ? `ACCURACY ${run.accuracy.shots ? `${accuracyPercent(run.accuracy)}%` : '--'}` : bonus ? BONUS_NAMES[bonus.kind] : frame.definition.title);
  text('reputation', invaders ? `HIT ${run.accuracy.hits}/${run.accuracy.shots} / MISS ${run.accuracy.misses}` : smuggler ? `BANKED ${pilot.score}` : bonus ? 'MAIN SHIP SAFE' : pilot.wanted.active ? `WANTED / HEAT ${pilot.wanted.heat}` : 'SECTOR CLEARANCE: CLEAN');
  text('scoreReadout', String(Math.floor(score)).padStart(6, '0'));
  text('arcadeScore', String(Math.floor(pilot.score)).padStart(6, '0'));
  const recordKey: keyof ProfileSaveV2['records'] = frame.menu === 'title' ? frame.selectedMode : `${run.mode}${run.continued ? 'Continued' : ''}`;
  text('arcadeBest', String(Math.max(run.practice ? 0 : pilot.score, frame.profile.records[recordKey])).padStart(6, '0'));
  text('creditReadout', invaders ? `NEXT LIFE ${run.nextLifeScore.toLocaleString('en-GB')}` : smuggler ? `HAUL +${score - pilot.score}` : `CR ${pilot.credits}`);
  text('cargoReadout', invaders ? '' : smuggler ? `NEXT LIFE ${run.nextLifeScore}` : `CARGO ${pilot.inventory.legalCargo + pilot.inventory.rareMineral} / X ${pilot.inventory.contraband}`);
  text('hullReadout', bonus ? `${bonus.health} / 3` : String(Math.ceil(pilot.hull)));
  text('shieldReadout', smuggler ? 'RUNNER' : bonus ? 'LOAN SKIFF' : `${Math.ceil(pilot.shield)} / ${pilot.maxShield}`);
  text('weaponReadout', bonus ? `${bonus.family.toUpperCase()} 1` : `${run.family.toUpperCase()} ${run.tiers[run.family]}`);
  model.titles['#weaponReadout'] = WEAPON_HELP[bonus?.family ?? run.family];
  text('speedLabel', invaders ? 'WEAPON COOLDOWN' : canyon ? canyon.boosting ? 'BOOST' : 'AUTO SPEED' : asteroids ? 'AUTO SPEED' : 'THROTTLE');
  text('speedReadout', invaders ? frame.shotDelay > 0 ? `${frame.shotDelay.toFixed(1)}s` : 'READY' : canyon ? String(Math.round(canyon.speed)) : asteroids ? String(Math.round(asteroids.speed)) : bonus ? 'AUTO' : frame.definition.kind === 'armada' && !run.cleared ? 'L / R' : throttleReadout(frame.throttle));
  toggle('#speedReadout', 'cooling', invaders && frame.shotDelay > 0);
  text('livesReadout', `LIVES ${run.lives}`);
  text('chainReadout', smuggler ? 'BANK AT EXIT' : `CHAIN x${run.chain.multiplier}`);
  const charge = bonus?.charge ?? run.charge;
  const controls = CONTROL_LAYOUTS[frame.profile.settings.controlScheme];
  text('chargeReadout', charge >= 100 ? `BLAST READY / ${controls.blast}` : `BLAST ${charge}%`);
  const armadaLocked = frame.definition.kind === 'armada' && (!run.cleared || run.mode === 'invaders') && !bonus;
  model.hidden['.reticle'] = armadaLocked;
  text('missionTitle', bonus ? `${Math.ceil(bonus.remaining)} SECONDS` : run.phase === 'recovery' ? `NEXT WAVE IN ${Math.ceil(frame.recovery)}` : run.cleared ? 'MISSION COMPLETE' : armadaLocked ? run.mode === 'invaders' ? 'BREAK THE FORMATION' : 'TRACTOR BEAM LOCKED' : frame.definition.kind === 'boss' ? 'BREAK THE OUTER SYSTEMS' : 'CLEAR THE PIRATE FLIGHTS');
  const arrival = frame.arrivalTime > 0 && run.phase === 'playing' && !bonus;
  if (arrival) text('missionTitle', 'REINFORCEMENTS ARRIVED');
  toggle('#missionTitle', 'arrival-alert', arrival);
  const boss = frame.actors.find(actor => actor.kind === 'pirate' && actor.essential && actor.role === 'carrier');
  const objective = boss ? `${frame.actors.filter(actor => actor.parent === boss.id).length} OUTER SYSTEMS / CORE ${Math.ceil(boss.hull / boss.maxHull * 100)}%`
    : frame.definition.kind === 'rescue' && !frame.rescued ? (pilot.inventory.rescuePods ? 'DELIVER POD TO STATION' : 'COLLECT THE WHITE POD')
    : frame.objectiveShip ? `PROTECT ${frame.definition.kind === 'escort' ? 'CONVOY' : 'STATION'}: ${Math.ceil(Math.max(0, frame.objectiveShip.hull))}` : `FLIGHT ${frame.director.flight}/${frame.director.totalFlights} / ${hostiles().length} HOSTILES`;
  text('missionProgress', canyon ? `${canyon.nextGate >= 18 ? 'FLY THROUGH EXIT' : `GATE ${canyon.nextGate + 1}/18`} / MISSED ${canyon.missed}/2` : asteroids?.exitApproach ? 'FLY THROUGH THE EXIT GATE' : bonus ? bonus.kind === 'sequence' ? `NEXT MARKER ${Math.min(bonus.targetCount, bonus.nextMarker)} / ${bonus.targetCount}` : `SALVAGE ${bonus.points} / SKIFF ${bonus.health}` : run.cleared ? run.phase === 'recovery' ? `${controls.fire} TO START NOW` : 'HEAD TO THE WARP GATE!' : objective);
  const sequence = bonus?.kind === 'sequence' ? bonus : null;
  model.hidden['#levelTimer'] = !!bonus && !sequence;
  text('levelClock', sequence ? `SHOTS ${sequence.shotsFired}` : `TIME ${formatStageTime(run)}`);
  const exitLabel = run.mode === 'invaders' || run.mode === 'endless' && run.stage % 5 !== 0 ? 'NEXT' : 'GATE';
  text('timeBonusReadout', sequence ? `BONUS SCORE ${sequence.points}` : run.timeBonus !== null ? `PAID CR ${run.timeBonus}` : `${exitLabel} +CR ${timeBonusSeconds(run) * TIME_BONUS_RATE}`);
  toggle('#levelClock', 'danger', !bonus && run.timeRemaining < 30 && run.timeBonus === null);
  text('messageLog', frame.messages.map(message => message.text).join('\n'));
  toggle('#wantedBanner', 'active', pilot.wanted.active && !bonus);
  if (protectedFlight) text('hitCallout', `${run.lives} LIVES LEFT / RESPAWN SHIELD ${Math.ceil(frame.protection)}s`);
  toggle('#hitCallout', 'active', protectedFlight || frame.feedbackTime > 0);
  model.styles['#hitConfirm'] = { opacity: frame.hitTime > 0 ? '1' : '0' };
  model.styles['#scorePopup'] = { opacity: frame.popupTime > 0 ? '1' : '0' };
  model.hidden['#bonusExitButton'] = !bonus || smuggler;
  model.hidden['#nextWaveButton'] = run.phase !== 'recovery';
  let destination: Actor | null = run.cleared ? run.phase === 'recovery' ? null : frame.gate : frame.definition.kind === 'rescue' && !frame.rescued ? (pilot.inventory.rescuePods ? frame.base : frame.objectivePod) : frame.objectiveShip;
  if (!destination && hostiles().length) destination = hostiles().sort((a, b) => a.object.position.distanceToSquared(frame.position) - b.object.position.distanceToSquared(frame.position))[0];
  indicator('objectiveArrow', bonus ? null : destination, run.cleared ? 'WARP' : destination?.faction === 'pirate' ? run.mode === 'invaders' ? 'ALIEN' : 'PIRATE' : 'OBJECTIVE');
  indicator('threatArrow', bonus ? null : frame.threat, 'INCOMING');
  model.radar = frame.bonus ? [] : frame.actors
    .filter(actor => !actor.dead && actor.object.visible && actor.kind !== 'part')
    .map(actor => ({ position: actor.object.position,
      color: actor.faction === 'pirate' ? '#ff4055' : actor.faction === 'police' ? '#75caff' : actor.faction === 'trader' ? '#60ff85' : actor.kind === 'market' || actor.drop?.type === 'contraband' ? '#ff55ef' : '#ffff70',
      glyph: actor.kind === 'cargo' || actor.kind === 'gate' || actor.kind === 'mine' ? actor.kind : 'ship' }));
  return model;
}
