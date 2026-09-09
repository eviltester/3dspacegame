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
import { MODE_INFO } from '../modes';
import { WEAPON_HELP } from '../weapons';
import { CONTROL_LAYOUTS } from '../input-layouts';
import type { ControlScheme } from '../input-layouts';
import { highScoreEntry, highScoreTable } from './high-score';
import type { TitleTab } from './information-tabs';

export interface MenuPreview {
  mode: string; weapon: string;
  tab?: TitleTab;
  loadout?: string; actions?: string;
  instructions?: string; controls?: string; scores?: string;
}
export type MenuView = [screen: string, title: string, status: string, content: string, preview?: MenuPreview];
const warpBackButton = (run: RunState | null): string => run?.practice ? button('levelWarp', 'CHOOSE LEVEL') : '';

export class MenuViews {
  static title(profile: ProfileSaveV2, selectedMode: GameMode, selectedFamily: WeaponFamily, levelWarpUnlocked: boolean, tab: TitleTab = 'game'): MenuView {
    return FrontMenus.title(profile, selectedMode, selectedFamily, levelWarpUnlocked, tab);
  }
  static levelWarp(run: RunState | null): MenuView {
    const stages = Array.from({ length: JOURNEY_STAGE_COUNT }, (_, index) => {
      const number = index + 1;
      return `<option value="${number}" ${run?.mode === 'journey' && run.stage === number ? 'selected' : ''}>${number}. ${stageDefinition('journey', number).title}</option>`;
    }).join('');
    return ['levelWarp', 'LEVEL WARP', 'TEST FLIGHT / SAVED PROGRESS SAFE', `
      <div class="warp-picker"><label for="warpStage">JOURNEY STAGE</label><select id="warpStage">${stages}</select>${button('warpJourney', 'WARP TO STAGE')}</div>
      <div class="warp-picker"><label for="warpWave">ATTACK CHALLENGE WAVE</label><input id="warpWave" type="number" min="1" max="${Number.MAX_SAFE_INTEGER - 1}" step="1" value="${run?.mode === 'endless' ? run.stage : 1}" required>${button('warpEndless', 'WARP TO WAVE')}</div>
      <div class="warp-picker"><label for="warpInvaders">DEFENSIVE POSITION WAVE</label><input id="warpInvaders" type="number" min="1" max="1000000" step="1" value="1" required>${button('warpInvaders', 'WARP TO DEFENSIVE POSITION')}</div>
      <div class="warp-picker"><label for="warpSmuggler">SMUGGLER RUN LEG</label><input id="warpSmuggler" type="number" min="1" max="1000000" step="1" value="1" required>${button('warpSmuggler', 'WARP TO SMUGGLER')}</div>
      <div class="warp-picker"><label for="warpTunnels">TEMPESTUOUS TUNNELS</label><input id="warpTunnels" type="number" min="1" max="1000000" step="1" value="1" required>${button('warpTunnels', 'WARP TO TUNNEL')}</div>
      <div class="warp-picker"><h2>BONUS SORTIES</h2><label for="warpDifficulty">DIFFICULTY</label><select id="warpDifficulty">${Array.from({ length: BONUS_DIFFICULTY_LEVELS }, (_, i) => `<option value="${i + 1}">${i + 1}${i === 0 ? ' / FIRST RUN' : i === BONUS_DIFFICULTY_LEVELS - 1 ? ' / MAXIMUM' : ''}</option>`).join('')}</select>${(Object.keys(WARP_BONUSES) as BonusKind[]).map(kind => button(`warpBonus:${kind}`, BONUS_NAMES[kind])).join('')}</div>
      <div class="menu-actions">${button('title', 'TITLE SCREEN')}</div>`];
  }
  static briefing(run: RunState, definition: StageDefinition, scheme: ControlScheme = 'mouse'): MenuView {
    const armada = definition.kind === 'armada' && !run.cleared;
    const layout = CONTROL_LAYOUTS[scheme];
    const caution = `${armada ? `${layout.horizontal} moves LEFT / RIGHT. Fire straight ahead.` : 'Police and green traders are allies. Pirates are red.'} Hold ${layout.fire} to fire. ${layout.blast} uses your charged blast.`;
    const objective = definition.kind === 'armada' && run.cleared
      ? run.phase === 'recovery' ? 'The tractor beam is released. Resume to continue to the next wave.' : 'The tractor beam is released. Fly through the Warp Gate to continue.'
      : definition.objective;
    return ['briefing', definition.title.replace(/\d+/g, '').trim(), `${MODE_INFO[run.mode].name} / ${MODE_INFO[run.mode].unit} ${run.stage}${run.mode === 'journey' ? ` / ${JOURNEY_STAGE_COUNT}` : ''}`, `
      <section class="mission-briefing"><p class="briefing-status">MISSION BRIEFING</p><h2 id="missionBriefTitle">${definition.title}</h2><p id="missionBriefObjective">${objective}</p><p id="missionBriefCaution">${caution}</p><p id="missionBriefReward">REWARD CR ${200 + Math.min(20, run.stage) * 35 + (run.stage === 1 ? 150 : 0)}</p></section>
      <p class="menu-description">TIME BONUS: ${formatStageTime(run)} remaining. ${TIME_BONUS_RATE} CR per whole second left ${run.mode === 'endless' && run.stage % 5 !== 0 ? 'when the next wave starts' : 'at the Warp Gate'}. Zero ends the bonus, not the mission.</p>
      <p class="run-loadout">${run.lives} LIVES / ${run.family.toUpperCase()} ${run.tiers[run.family]} / ${definition.waves.length} PIRATE FLIGHTS</p>
      <div class="menu-actions">${button('launch', 'START MISSION', 'id="launchButton"')}</div>`];
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
  static gameOver(run: RunState, profile?: ProfileSaveV2): MenuView {
    return ['gameover', 'GAME OVER', 'CONTINUE FROM CHECKPOINT / SCORE RESETS', `
      <div class="gameover-summary">
      <p class="gameover-score"><span>FINAL SCORE</span><strong id="finalScore">${run.pilot.score.toLocaleString('en-GB')}</strong></p>
      ${profile ? highScoreEntry(profile, run) : ''}
      <div class="menu-actions gameover-actions">${button('relaunch', 'CONTINUE', 'id="launchButton"')}${button('title', 'TITLE SCREEN')}</div>
      ${run.practice ? `<div class="menu-actions">${warpBackButton(run)}</div>` : ''}</div>
      ${profile ? `<section class="gameover-records" aria-labelledby="gameoverRecordsTitle"><h2 id="gameoverRecordsTitle">HIGH SCORES</h2><p class="briefing-status">${MODE_INFO[run.mode].name}</p>${highScoreTable(profile, run.mode)}</section>` : ''}`];
  }
  static victory(run: RunState, profile?: ProfileSaveV2): MenuView {
    return ['victory', 'JOURNEY COMPLETE', run.continued ? 'CONTINUED FLIGHT' : 'ARCADE JOURNEY', `<p class="result-score">${run.pilot.score} POINTS</p><p>All ${JOURNEY_STAGE_COUNT} stages cleared.</p>${profile ? highScoreEntry(profile, run) : ''}<div class="menu-actions">${button('title', 'TITLE SCREEN', 'id="launchButton"')}</div>`];
  }
}
