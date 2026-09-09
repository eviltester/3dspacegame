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
import { COURSE_RADAR_VIEW, SPACE_RADAR_VIEW } from '../radar';
import type { RadarContact, RadarView } from '../radar';
import { MODE_INFO } from '../modes';
import { WEAPON_HELP } from '../weapons';
import { accuracyPercent } from '../combat/accuracy';
import { smugglerFlightPoints, smugglerFlightScore } from '../smuggler';
import { canyonHaulPoints, HAUL_PICKUP_POINTS } from '../canyon-combat';
import { SMUGGLER_TIME_RATE, smugglerResultLines } from '../smuggler-rewards';
import { tunnelHud } from '../tunnels/hud';
import { isInvaderField, invaderFieldDuration } from '../invader-events';
import { DEFENSIVE_ARRIVAL_SECONDS } from '../session/defensive-sequence';
import type { DefensiveSequencePhase } from '../session/defensive-sequence';

export interface HudFrame {
  menu: string;
  profile: ProfileSaveV2;
  selectedMode: GameMode;
  run: RunState | null;
  bonus: {
    state: Pick<BonusRunState, 'kind' | 'difficulty' | 'points' | 'health' | 'shield' | 'damage' | 'haul' | 'family' | 'charge' | 'remaining' | 'targetCount' | 'nextMarker' | 'shotsFired'>;
    canyon?: { speed: number; boosting: boolean; nextGate: number; penalty: number; nextGatePoints: number } | null;
    asteroidRun?: { speed: number; exitApproach: boolean; boosting?: boolean } | null;
    radarContacts?: RadarContact[];
  } | null;
  definition: Pick<StageDefinition, 'kind' | 'title'>;
  actors: readonly Actor[];
  throttle: number;
  recovery: number;
  intermission: number;
  respawnDelay: number;
  defensiveSequence?: DefensiveSequencePhase;
  escapeBonusTime?: number;
  arrivalTime: number;
  arrivalMessage?: string;
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
  radarView: RadarView;
}

export function buildHud(frame: HudFrame, now = 0): HudModel {
  const model: HudModel = { text: {}, classes: [], hidden: {}, styles: {}, titles: {}, radar: null, radarView: SPACE_RADAR_VIEW };
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
  const intermission = frame.intermission > 0 && !frame.menu;
  const respawning = frame.respawnDelay > 0;
  const lifeLost = respawning && !frame.menu;
  const smuggler = frame.run?.mode === 'smuggler';
  const invaders = frame.run?.mode === 'invaders';
  toggle('.game-shell', 'smuggler-hud', smuggler);
  toggle('.game-shell', 'invaders-hud', invaders);
  model.hidden['.bottom-strip > div:first-child'] = invaders;
  model.hidden['.bottom-strip > div:nth-child(2)'] = invaders;
  model.hidden['#survivalStats'] = !smuggler && !invaders;
  model.hidden['#topDamageStat'] = frame.run?.mode === 'tunnels' || invaders;
  model.hidden['#livesReadout'] = smuggler || invaders;
  model.hidden['#lifeLost'] = !lifeLost || invaders && frame.respawnDelay <= DEFENSIVE_ARRIVAL_SECONDS;
  toggle('.game-shell', 'life-lost', lifeLost);
  const touch = frame.profile.settings.controlScheme === 'touch';
  const armadaLocked = frame.definition.kind === 'armada' && (!frame.run?.cleared || frame.run.mode === 'invaders') && !frame.bonus;
  model.hidden['#touchTools'] = !touch || !!frame.menu || intermission || lifeLost;
  model.hidden['#touchThrottle'] = !!frame.bonus || armadaLocked;
  model.hidden['#touchBoost'] = armadaLocked || frame.bonus?.state.kind === 'sequence';
  toggle('.game-shell', 'touch-controls', touch);
  model.hidden['#courseSummary'] = !intermission;
  model.hidden['#courseCondition'] = !intermission;
  toggle('.game-shell', 'course-intermission', intermission);
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
  text('lifeLostHeading', invaders ? 'SHIP DESTROYED' : 'LIFE LOST');
  if (lifeLost) {
    text('lifeLostLives', `${run.lives} LIVES LEFT`);
    text('lifeLostCountdown', `RESTART IN ${Math.max(1, Math.ceil(frame.respawnDelay - 1e-6))} SECONDS`);
    return model;
  }
  if (intermission) {
    const result = run.smugglerResult;
    text('courseHeading', result?.awards.missedGate ? 'LEVEL COMPLETE / EXIT MISSED' : 'LEVEL COMPLETE');
    model.hidden['#courseAwards'] = !result;
    if (result) text('courseAwards', smugglerResultLines(result));
    model.hidden['#courseHaul'] = run.stageHaul === null;
    if (run.stageHaul !== null) text('courseHaul', `HAUL ${run.stageHaul} x ${HAUL_PICKUP_POINTS} = +${canyonHaulPoints(run.stageHaul)}`);
    if (result) text('courseHaul', result.awards.lostCargo ? `HAUL ${result.haul} LOST / +0` : `HAUL ${result.haul} x ${HAUL_PICKUP_POINTS} = +${result.haulPoints}`);
    text('courseScore', `SCORE ${pilot.score}`); text('courseLives', `LIVES ${run.lives}`);
    text('courseCondition', `SHIELD ${run.skiff.shield}/100 / DAMAGE ${run.skiff.damage}/100`);
    text('courseNext', `LEVEL ${run.stage + 1} IN ${Math.ceil(frame.intermission)}`);
    return model;
  }
  const bonus = frame.bonus?.state;
  model.hidden['#radar'] = bonus?.kind === 'sequence';
  if (bonus) model.radarView = COURSE_RADAR_VIEW;
  model.titles['#radar'] = bonus ? 'Course radar: circles are rocks; squares are obstacles; triangles are pickups; crosses are gates. Vertical lines show height.'
    : 'Ship-relative radar: triangles are pickups; crosses are Warp Gates. Vertical lines show height.';
  const score = smuggler && bonus ? smugglerFlightScore(pilot.score, bonus) : pilot.score;
  const canyon = frame.bonus?.canyon;
  const asteroids = frame.bonus?.asteroidRun;
  const modeLabel = { journey: 'JOURNEY', endless: 'ATTACK', invaders: 'DEFENSIVE POSITION', smuggler: 'SMUGGLER', tunnels: 'TUNNELS' }[run.mode];
  text('stageLabel', `${run.practice ? 'TEST / ' : ''}${smuggler ? `SMUGGLER LEG ${run.stage} / D${bonus?.difficulty ?? 1}` : bonus ? `BONUS / DIFFICULTY ${bonus.difficulty}` : `${modeLabel} ${MODE_INFO[run.mode].unit} ${run.stage}`}`);
  text('sectorName', invaders ? `ACCURACY ${run.accuracy.shots ? `${accuracyPercent(run.accuracy)}%` : '--'}` : bonus ? BONUS_NAMES[bonus.kind] : frame.definition.title);
  text('reputation', invaders ? `${pilot.wanted.active ? 'WANTED / ' : ''}HIT ${run.accuracy.hits}/${run.accuracy.shots} / MISS ${run.accuracy.misses}` : smuggler ? `LEG START ${pilot.score}` : bonus ? 'MAIN SHIP SAFE' : pilot.wanted.active ? `WANTED / HEAT ${pilot.wanted.heat}` : 'SECTOR CLEARANCE: CLEAN');
  text('scoreReadout', String(Math.floor(score)).padStart(6, '0'));
  text('arcadeScore', String(Math.floor(score)).padStart(6, '0'));
  const recordKey: keyof ProfileSaveV2['records'] = frame.menu === 'title' ? frame.selectedMode : `${run.mode}${run.continued ? 'Continued' : ''}`;
  text('arcadeBest', String(Math.max(run.practice ? 0 : score, frame.profile.records[recordKey])).padStart(6, '0'));
  const flightPoints = smuggler && bonus ? smugglerFlightPoints(bonus) : 0;
  text('creditReadout', invaders ? `NEXT LIFE ${run.nextLifeScore.toLocaleString('en-GB')}` : smuggler ? `FLIGHT ${flightPoints >= 0 ? '+' : ''}${flightPoints}` : `CR ${pilot.credits}`);
  text('cargoReadout', bonus && (smuggler || bonus.kind === 'canyon') ? `HAUL ${bonus.haul} / +${canyonHaulPoints(bonus.haul)} AT EXIT` : invaders ? '' : smuggler ? `NEXT LIFE ${run.nextLifeScore}` : `CARGO ${pilot.inventory.legalCargo + pilot.inventory.rareMineral} / X ${pilot.inventory.contraband}`);
  text('topLives', String(run.lives));
  text('topShield', String(invaders ? Math.ceil(pilot.shield) : bonus?.shield ?? run.skiff.shield));
  text('topDamage', String(bonus?.damage ?? run.skiff.damage));
  toggle('#topDamage', 'danger', (bonus?.damage ?? run.skiff.damage) >= 70);
  text('hullLabel', bonus ? 'SKIFF' : 'HULL');
  text('hullReadout', bonus ? `${bonus.health} / 3` : String(Math.ceil(pilot.hull)));
  model.hidden['#skiffDamage'] = !bonus;
  text('damageReadout', bonus ? `DAMAGE ${bonus.damage}/100` : '');
  toggle('#damageReadout', 'danger', !!bonus && bonus.damage >= 70);
  text('shieldReadout', bonus ? `${bonus.shield} / 100` : `${Math.ceil(pilot.shield)} / ${pilot.maxShield}`);
  text('weaponReadout', bonus ? `${bonus.family.toUpperCase()} 1` : `${run.family.toUpperCase()} ${run.tiers[run.family]}`);
  model.titles['#weaponReadout'] = WEAPON_HELP[bonus?.family ?? run.family];
  text('speedLabel', invaders ? 'WEAPON COOLDOWN' : canyon ? canyon.boosting ? 'BOOST' : 'AUTO SPEED' : asteroids ? asteroids.boosting ? 'BOOST' : 'AUTO SPEED' : 'THROTTLE');
  text('speedReadout', invaders ? frame.shotDelay > 0 ? `${frame.shotDelay.toFixed(1)}s` : 'READY' : canyon ? String(Math.round(canyon.speed)) : asteroids ? String(Math.round(asteroids.speed)) : bonus ? 'AUTO' : frame.definition.kind === 'armada' && !run.cleared ? 'L / R' : throttleReadout(frame.throttle));
  toggle('#speedReadout', 'cooling', invaders && frame.shotDelay > 0);
  text('livesReadout', `LIVES ${run.lives}`);
  text('chainReadout', smuggler ? 'DELIVER HAUL' : `CHAIN x${run.chain.multiplier}`);
  const charge = bonus?.charge ?? run.charge;
  const controls = CONTROL_LAYOUTS[frame.profile.settings.controlScheme];
  text('chargeReadout', invaders && run.blastUsed ? `BLAST USED / ${charge}%` : charge >= 100 ? `BLAST READY / ${controls.blast}` : `BLAST ${charge}%${!smuggler && canyon?.penalty ? ' / PAUSED' : ''}`);
  model.hidden['.reticle'] = armadaLocked;
  text('missionTitle', bonus ? `${Math.ceil(bonus.remaining)} SECONDS` : run.phase === 'recovery' ? `NEXT WAVE IN ${Math.ceil(frame.recovery)}` : run.cleared ? 'MISSION COMPLETE' : armadaLocked ? run.mode === 'invaders' ? 'BREAK THE FORMATION' : 'TRACTOR BEAM LOCKED' : frame.definition.kind === 'boss' ? 'BREAK THE OUTER SYSTEMS' : 'CLEAR THE PIRATE FLIGHTS');
  const arrival = frame.arrivalTime > 0 && run.phase === 'playing' && !bonus;
  if (invaders && isInvaderField(run.stage) && !run.cleared) text('missionTitle', 'SURVIVE THE FIELD');
  if (arrival) text('missionTitle', frame.arrivalMessage?.startsWith('WANTED') ? 'WANTED!'
    : frame.arrivalMessage?.startsWith('ASTEROID STORM') ? 'ASTEROID STORM'
    : frame.arrivalMessage?.startsWith('GOLD 2X') ? 'DOUBLE SCORE TARGET'
    : frame.arrivalMessage?.startsWith('BONUS COURIER') ? 'BONUS COURIER'
    : frame.arrivalMessage?.startsWith('LAST ALIEN') ? 'LAST CHANCE' : 'REINFORCEMENTS ARRIVED');
  toggle('#missionTitle', 'arrival-alert', arrival);
  const boss = frame.actors.find(actor => actor.kind === 'pirate' && actor.essential && actor.role === 'carrier');
  const objective = boss ? `${frame.actors.filter(actor => actor.parent === boss.id).length} OUTER SYSTEMS / CORE ${Math.ceil(boss.hull / boss.maxHull * 100)}%`
    : frame.definition.kind === 'rescue' && !frame.rescued ? (pilot.inventory.rescuePods ? 'DELIVER POD TO STATION' : 'COLLECT THE WHITE POD')
    : frame.objectiveShip ? `PROTECT ${frame.definition.kind === 'escort' ? 'CONVOY' : 'STATION'}: ${Math.ceil(Math.max(0, frame.objectiveShip.hull))}` : `FLIGHT ${frame.director.flight}/${frame.director.totalFlights} / ${hostiles().length} HOSTILES`;
  text('missionProgress', canyon ? canyon.nextGate >= 18 ? 'FLY THROUGH EXIT' : `GATE ${canyon.nextGate + 1}/18 / +${canyon.nextGatePoints}` : asteroids?.exitApproach ? 'FLY THROUGH THE EXIT GATE' : bonus ? bonus.kind === 'sequence' ? `NEXT MARKER ${Math.min(bonus.targetCount, bonus.nextMarker)} / ${bonus.targetCount}` : `SALVAGE ${bonus.points} / SKIFF ${bonus.health}` : run.cleared ? run.phase === 'recovery' ? `${controls.fire} TO START NOW` : 'HEAD TO THE WARP GATE!' : objective);
  if (invaders && isInvaderField(run.stage) && !run.cleared) text('missionProgress', `ASTEROID FIELD / SURVIVE ${Math.max(0, Math.ceil(invaderFieldDuration(run.stage) - run.elapsed))}s`);
  const sequence = bonus?.kind === 'sequence' ? bonus : null;
  // Miss deductions are score, not negative cargo. Keep the belt objective literal.
  if (smuggler && bonus?.kind === 'asteroids' && !asteroids?.exitApproach) text('missionProgress', 'REACH EXIT');
  model.hidden['#levelTimer'] = !!bonus && !sequence && !canyon && !smuggler;
  text('levelClock', canyon ? `PENALTY ${canyon.penalty}` : sequence ? `SHOTS ${sequence.shotsFired}` : `TIME ${formatStageTime(run)}`);
  const exitLabel = run.mode === 'invaders' || run.mode === 'endless' && run.stage % 5 !== 0 ? 'TIME BONUS' : 'GATE';
  text('timeBonusReadout', canyon && bonus ? `COURSE SCORE ${bonus.points}` : sequence ? `BONUS SCORE ${sequence.points}` : run.timeBonus !== null ? `PAID CR ${run.timeBonus}` : `${exitLabel} +CR ${timeBonusSeconds(run) * TIME_BONUS_RATE}`);
  if (smuggler && bonus) {
    text('levelClock', canyon ? `PENALTY ${canyon.penalty}` : 'TIME BONUS');
    text('timeBonusReadout', `+${Math.max(0, Math.floor(bonus.remaining + 1e-6)) * SMUGGLER_TIME_RATE}`);
  }
  toggle('#levelClock', 'danger', canyon ? canyon.penalty > 0 : !bonus && run.timeRemaining < 30 && run.timeBonus === null);
  text('messageLog', frame.messages.map(message => message.text).join('\n'));
  toggle('#wantedBanner', 'active', pilot.wanted.active && !bonus);
  if (protectedFlight) text('hitCallout', `${run.lives} LIVES LEFT / RESPAWN SHIELD ${Math.ceil(frame.protection)}s`);
  toggle('#hitCallout', 'active', protectedFlight || frame.feedbackTime > 0);
  model.styles['#hitConfirm'] = { opacity: frame.hitTime > 0 ? '1' : '0' };
  model.styles['#scorePopup'] = { opacity: frame.popupTime > 0 ? '1' : '0' };
  if ((frame.escapeBonusTime ?? 0) > 0) {
    text('scorePopup', 'LAST ALIEN +500 BONUS'); model.styles['#scorePopup'] = { opacity: '1' };
  }
  model.hidden['#bonusExitButton'] = !bonus || smuggler;
  const transitioning = frame.defensiveSequence === 'arriving' || frame.defensiveSequence === 'departing';
  model.hidden['#nextWaveButton'] = run.phase !== 'recovery' || transitioning;
  if (transitioning) {
    text('missionTitle', frame.defensiveSequence === 'departing' ? 'WARPING TO NEXT WAVE' : `ARRIVING AT WAVE ${run.stage}`);
    text('missionProgress', frame.defensiveSequence === 'departing' ? 'PLATFORM RELEASED' : 'STAND BY');
    model.hidden['#touchTools'] = true;
  }
  let destination: Actor | null = run.cleared ? run.phase === 'recovery' ? null : frame.gate : frame.definition.kind === 'rescue' && !frame.rescued ? (pilot.inventory.rescuePods ? frame.base : frame.objectivePod) : frame.objectiveShip;
  if (!destination && hostiles().length) destination = hostiles().sort((a, b) => a.object.position.distanceToSquared(frame.position) - b.object.position.distanceToSquared(frame.position))[0];
  const showDirections = !bonus && !invaders;
  indicator('objectiveArrow', showDirections ? destination : null, run.cleared ? 'WARP' : destination?.faction === 'pirate' ? 'PIRATE' : 'OBJECTIVE');
  indicator('threatArrow', showDirections ? frame.threat : null, 'INCOMING');
  model.radar = frame.bonus ? frame.bonus.radarContacts ?? [] : frame.actors
    .filter(actor => !actor.dead && actor.object.visible && actor.kind !== 'part')
    .map(actor => ({ position: actor.object.position,
      color: actor.faction === 'pirate' ? '#ff4055' : actor.faction === 'police' ? '#75caff' : actor.faction === 'trader' ? '#60ff85' : actor.kind === 'market' || actor.drop?.type === 'contraband' ? '#ff55ef' : '#ffff70',
      glyph: actor.kind === 'cargo' || actor.kind === 'gate' || actor.kind === 'mine' ? actor.kind : 'ship' }));
  return tunnelHud(frame, model);
}
