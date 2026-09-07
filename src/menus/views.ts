/**
 * Menu builders return [screen ID, title, status, HTML] for GameUI to display.
 * data-action names are handled centrally in ArcadeGame.action. Shop eligibility
 * comes from the same rule helpers that validate an actual purchase.
 */
import { FAMILIES, JOURNEY_STAGE_COUNT, formatStageTime, TIME_BONUS_RATE, purchaseBlocked, purchasePrice } from '../arcade';
import type { ProfileSaveV2, GameMode, WeaponFamily, RunState, Purchase, BonusKind } from '../arcade';
import { bonusBrief, BONUS_NAMES } from '../bonus';
import { BONUS_DIFFICULTY_LEVELS, bonusDifficulty } from '../bonus-difficulty';
import { stageDefinition } from '../encounters';
import type { StageDefinition } from '../encounters';
import { WARP_BONUSES } from '../level-warp';
import { button } from './menu-shell';
import { FrontMenus } from './front';
import { SmugglerMenus } from './smuggler';
import { MODE_INFO } from '../modes';
import { WEAPON_HELP, weaponSpec } from '../weapons';
import { invaderMissCost } from '../combat/accuracy';
import { CONTROL_LAYOUTS } from '../input-layouts';
import type { ControlScheme } from '../input-layouts';

export type MenuView = [screen: string, title: string, status: string, content: string];
const warpBackButton = (run: RunState | null): string => run?.practice ? button('levelWarp', 'CHOOSE LEVEL') : '';

export class MenuViews {
  static title(profile: ProfileSaveV2, selectedMode: GameMode, selectedFamily: WeaponFamily, levelWarpUnlocked: boolean): MenuView {
    return FrontMenus.title(profile, selectedMode, selectedFamily, levelWarpUnlocked);
  }
  static levelWarp(run: RunState | null): MenuView {
    const stages = Array.from({ length: JOURNEY_STAGE_COUNT }, (_, index) => {
      const number = index + 1;
      return `<option value="${number}" ${run?.mode === 'journey' && run.stage === number ? 'selected' : ''}>${number}. ${stageDefinition('journey', number).title}</option>`;
    }).join('');
    return ['levelWarp', 'LEVEL WARP', 'TEST FLIGHT / SAVED PROGRESS SAFE', `
      <div class="warp-picker"><label for="warpStage">JOURNEY STAGE</label><select id="warpStage">${stages}</select>${button('warpJourney', 'WARP TO STAGE')}</div>
      <div class="warp-picker"><label for="warpWave">ATTACK CHALLENGE WAVE</label><input id="warpWave" type="number" min="1" max="${Number.MAX_SAFE_INTEGER - 1}" step="1" value="${run?.mode === 'endless' ? run.stage : 1}" required>${button('warpEndless', 'WARP TO WAVE')}</div>
      <div class="warp-picker"><label for="warpInvaders">INVADERS WAVE</label><input id="warpInvaders" type="number" min="1" max="1000000" step="1" value="1" required>${button('warpInvaders', 'WARP TO INVADERS')}</div>
      <div class="warp-picker"><label for="warpSmuggler">SMUGGLER RUN LEG</label><input id="warpSmuggler" type="number" min="1" max="1000000" step="1" value="1" required>${button('warpSmuggler', 'WARP TO SMUGGLER')}</div>
      <div class="warp-picker"><h2>BONUS SORTIES</h2><label for="warpDifficulty">DIFFICULTY</label><select id="warpDifficulty">${Array.from({ length: BONUS_DIFFICULTY_LEVELS }, (_, i) => `<option value="${i + 1}">${i + 1}${i === 0 ? ' / FIRST RUN' : i === BONUS_DIFFICULTY_LEVELS - 1 ? ' / MAXIMUM' : ''}</option>`).join('')}</select>${(Object.keys(WARP_BONUSES) as BonusKind[]).map(kind => button(`warpBonus:${kind}`, BONUS_NAMES[kind])).join('')}</div>
      <div class="menu-actions">${button('title', 'TITLE SCREEN')}</div>`];
  }
  static briefing(run: RunState, definition: StageDefinition, scheme: ControlScheme = 'mouse'): MenuView {
    if (run.mode === 'smuggler') return SmugglerMenus.briefing(run, scheme);
    const armada = definition.kind === 'armada' && (!run.cleared || run.mode === 'invaders');
    const layout = CONTROL_LAYOUTS[scheme];
    const caution = `${armada ? `${layout.horizontal} moves LEFT / RIGHT. Fire straight ahead.` : 'Police and green traders are allies. Pirates are red.'} Hold ${layout.fire} to fire. ${layout.blast} uses your charged blast.`;
    const objective = run.mode === 'invaders' && run.cleared ? 'Formation cleared. Resume for the next wave. Your ship stays in the defensive lane.' : definition.kind === 'armada' && run.cleared
      ? run.phase === 'recovery' ? 'The tractor beam is released. Resume to continue to the next wave.' : 'The tractor beam is released. Fly through the Warp Gate to continue.'
      : definition.objective;
    return ['briefing', definition.title.replace(/\d+/g, '').trim(), `${MODE_INFO[run.mode].name} / ${MODE_INFO[run.mode].unit} ${run.stage}${run.mode === 'journey' ? ` / ${JOURNEY_STAGE_COUNT}` : ''}`, `
      <section class="mission-briefing"><p class="briefing-status">MISSION BRIEFING</p><h2 id="missionBriefTitle">${definition.title}</h2><p id="missionBriefObjective">${objective}</p><p id="missionBriefCaution">${caution}</p><p id="missionBriefReward">REWARD CR ${200 + Math.min(20, run.stage) * 35 + (run.stage === 1 ? 150 : 0)}</p></section>
      <p class="menu-description">TIME BONUS: ${formatStageTime(run)} remaining. ${TIME_BONUS_RATE} CR per whole second left ${run.mode === 'invaders' || (run.mode === 'endless' && run.stage % 5 !== 0) ? 'when the next wave starts' : 'at the Warp Gate'}. Zero ends the bonus, not the mission.</p>
      ${run.mode === 'invaders' ? `<p class="menu-description">MISS COST: 11+ aliens -${invaderMissCost(11)} / 6-10 aliens -${invaderMissCost(6)} / 0-5 aliens -${invaderMissCost(5)} points per bolt, counted when fired. Spread fires three separately scored bolts; alien hits and interceptions count toward wave accuracy. Aliens take firing turns and recover faster as waves advance.</p><p class="menu-description">Extra life every 20,000 points, up to five lives. Repair drops have a 1-in-15 chance and restore +30 hull and +30 shield. Alien hits cost 10 shield or 20 unshielded hull. Weapon cores upgrade your equipped weapon. Respawn shields last three seconds.</p><p class="run-loadout">COOLDOWNS: ${FAMILIES.map(f => `${f.toUpperCase()} ${weaponSpec(f, run.tiers[f], run.mode).cooldown.toFixed(2)}s`).join(' / ')}</p>` : ''}
      <p class="run-loadout">${run.lives} LIVES / ${run.family.toUpperCase()} ${run.tiers[run.family]} / ${definition.waves.length} ${run.mode === 'invaders' ? 'ALIEN' : 'PIRATE'} FLIGHTS</p>
      <div class="menu-actions">${button('launch', 'START MISSION', 'id="launchButton"')}${warpBackButton(run)}${button('title', 'TITLE SCREEN')}</div>`];
  }
  static shop(run: RunState): MenuView {
    const choices: Array<[Purchase, string]> = [['tier', `${run.family.toUpperCase()} TIER ${Math.min(3, run.tiers[run.family] + 1)}`], ['repair', 'REPAIR +50 HULL / +60 SHIELD'], ['shield', 'SHIELD CAPACITY +25'], ['magnet', 'CARGO MAGNET 35']];
    const rows = choices.map(([kind, label]) => {
      const blocked = purchaseBlocked(run, kind);
      return `<div class="shop-row"><div><strong>${label}</strong><span>${blocked ?? `CR ${purchasePrice(run, kind)}`}</span></div>${button(`buy:${kind}`, 'BUY', `${blocked ? 'disabled' : ''} aria-label="Buy ${kind}"`)}</div>`;
    }).join('');
    return ['shop', 'SUPPLY DOCK', `CR ${run.pilot.credits} / HULL ${Math.ceil(run.pilot.hull)} / SHIELD ${Math.ceil(run.pilot.shield)}`, `
      <p class="briefing-status">EQUIP WEAPON</p><div class="family-select">${FAMILIES.map(f => button(`equip:${f}`, `${f.toUpperCase()} ${run.tiers[f]}`, `aria-pressed="${run.family === f}"`)).join('')}</div>
      <p class="weapon-purpose">${WEAPON_HELP[run.family]}</p>
      ${run.timeBonus !== null ? `<p class="briefing-status" id="dockTimeBonus">TIME BONUS BANKED +CR ${run.timeBonus}</p>` : ''}
      <div class="shop-list">${rows}</div><div class="menu-actions">${button('depart', 'NEXT STAGE', 'id="launchButton"')}${warpBackButton(run)}${button('title', run.practice ? 'TITLE SCREEN' : 'SAVE AND TITLE')}</div>`];
  }
  static bonusOffer(run: RunState, kind: BonusKind, scheme: ControlScheme = 'mouse'): MenuView {
    const difficulty = bonusDifficulty(run.mode, run.stage);
    return ['bonusOffer', BONUS_NAMES[kind], `OPTIONAL BONUS / DIFFICULTY ${difficulty}`, `<p class="mission-copy">${bonusBrief(kind, difficulty, scheme)}</p><p class="safe-bonus">Your main ship, cargo, equipment and lives stay safe. Finish, fail or skip: the journey continues.</p><div class="menu-actions">${button('bonusPlay', 'PLAY BONUS', 'id="launchButton"')}${button('bonusSkip', 'SKIP TO DOCK')}${warpBackButton(run)}</div>`];
  }
  static gameOver(run: RunState): MenuView {
    return ['gameover', 'GAME OVER', 'CONTINUE FROM CHECKPOINT / SCORE RESETS', `
      <div id="deathCountdown" class="death-countdown"><span>RETURN TO TITLE IN</span><strong id="deathTimer">10</strong></div>
      <div class="menu-actions">${button('relaunch', 'CONTINUE', 'id="launchButton"')}${warpBackButton(run)}${button('title', 'TITLE SCREEN')}</div>`];
  }
  static victory(run: RunState): MenuView {
    return ['victory', 'JOURNEY COMPLETE', run.continued ? 'CONTINUED FLIGHT' : 'ARCADE JOURNEY', `<p class="result-score">${run.pilot.score} POINTS</p><p>All ${JOURNEY_STAGE_COUNT} stages cleared.</p><div class="menu-actions">${button('title', 'TITLE SCREEN', 'id="launchButton"')}</div>`];
  }
}
