/** Title, controls, weapon guide and score views; no saves or run mutations here. */
import type { GameMode, ProfileSaveV2, WeaponFamily } from '../arcade';
import { FAMILIES } from '../arcade';
import { GAME_MODES, MODE_INFO } from '../modes';
import { WEAPON_HELP } from '../weapons';
import { CONTROL_LAYOUTS } from '../input-layouts';
import { button } from './menu-shell';
import { controlsView } from './controls';
import { TUNNEL_WEAPON_HELP } from '../tunnels/menus';
import type { MenuView } from './views';
import { highScoreTable } from './high-score';

export function modeButtons(selected: GameMode, action = 'mode'): string {
  return `<div class="mode-select" role="group" aria-label="Game mode">${GAME_MODES.map(mode => button(`${action}:${mode}`,
    `<span>${MODE_INFO[mode].name}</span>`, `aria-pressed="${mode === selected}"`)).join('')}</div>`;
}

export class FrontMenus {
  static title(profile: ProfileSaveV2, mode: GameMode, family: WeaponFamily, warp: boolean): MenuView {
    const saved = profile.checkpoints[mode];
    const help = mode === 'tunnels' ? TUNNEL_WEAPON_HELP : WEAPON_HELP;
    return ['title', '3D VECTOR SPACE SHOOTER', '', `
      <div class="title-modes"><p class="briefing-status">GAME MODES</p>${modeButtons(mode)}</div>
      <div class="title-loadout"><div class="loadout-heading"><span>STARTING WEAPON</span>${button('weapons', 'WEAPONS')}</div>
      <div class="family-select">${FAMILIES.map(f => button(`startFamily:${f}`, f.toUpperCase(), `aria-pressed="${family === f}" title="${WEAPON_HELP[f]}" ${profile.unlocked.includes(f) ? '' : 'disabled'}`)).join('')}</div>
      </div><div class="title-secondary">
      <nav class="title-tools" aria-label="Pilot menus">${button('controls', 'CONTROLS')}${button('scores', 'HIGH SCORES')}${button('objects', 'INFO DECK')}${warp ? button('levelWarp', 'LEVEL WARP', 'id="levelWarpButton"') : ''}</nav>
      </div><div class="menu-actions title-play"><p class="record-line">${CONTROL_LAYOUTS[profile.settings.controlScheme].name} / BEST ${profile.records[mode]}</p>
      <div class="title-play-buttons">${saved && saved.phase !== 'victory' ? button('resumeRun', `RESUME ${MODE_INFO[mode].unit} ${saved.stage}`, 'id="resumeButton"') : ''}${button('newRun', saved ? 'NEW RUN' : 'PLAY GAME', 'id="launchButton"')}</div></div>`, { mode: `
      <div class="mode-preview-copy"><h2 id="modePreviewName">${MODE_INFO[mode].name}</h2>
      <p id="modePreviewTagline">${MODE_INFO[mode].summary}</p>
      <p class="menu-description" id="modeDescription">${MODE_INFO[mode].detail}</p></div>`, weapon: `
      <div class="weapon-preview-copy"><h3 id="weaponPreviewName">${family.toUpperCase()}</h3>
      <p class="weapon-purpose" id="weaponHelp">${help[family]}</p></div>` }];
  }
  static controls(profile: ProfileSaveV2, back = 'title', mode: GameMode = 'journey'): MenuView {
    return ['controls', 'CONTROLS', CONTROL_LAYOUTS[profile.settings.controlScheme].name, `${controlsView(profile.settings.controlScheme, profile.settings.tiltSensitivity, profile.settings.mouseSensitivity, mode === 'tunnels')}
      <div class="settings-row">${button('assist', `AIM ASSIST: ${profile.settings.aimAssist ? 'ON' : 'OFF'}`)}${button('mute', `SOUND: ${profile.settings.muted ? 'OFF' : 'ON'}`)}</div>
      <div class="menu-actions">${button(back, 'BACK', 'id="launchButton"')}</div>`];
  }
  static weapons(profile: ProfileSaveV2, selected: WeaponFamily): MenuView {
    return ['weapons', 'WEAPONS', 'UNLIMITED AMMUNITION / THREE TIERS', `<div class="weapon-guide">${FAMILIES.map(family => `<section><h2>${family.toUpperCase()}</h2><p>${WEAPON_HELP[family]}</p><p class="briefing-status">${profile.unlocked.includes(family) ? 'STARTING WEAPON AVAILABLE' : `STARTING CHOICE UNLOCKS AFTER ${family === 'spread' ? 4 : 8} CLEARED STAGES OR WAVES`}</p>${button(`startFamily:${family}`, selected === family ? 'EQUIPPED' : 'START WITH THIS', `aria-pressed="${selected === family}" ${profile.unlocked.includes(family) ? '' : 'disabled'}`)}</section>`).join('')}</div><p class="menu-description">During play: 1 / 2 / 3 selects a weapon. Tab or wheel click cycles weapons. All three are available in flight.</p><div class="menu-actions">${button('title', 'BACK', 'id="launchButton"')}</div>`];
  }
  static scores(profile: ProfileSaveV2, mode: GameMode): MenuView {
    return ['scores', 'HIGH SCORES', MODE_INFO[mode].name, `${modeButtons(mode, 'scores')}
      <div class="record-totals"><p>BEST <strong>${profile.records[mode]}</strong></p><p>CONTINUED <strong>${profile.records[`${mode}Continued`]}</strong></p></div>
      ${highScoreTable(profile, mode)}
      ${mode === 'journey' && profile.legacyScore ? `<p class="record-line">LEGACY RECORD ${profile.legacyScore}</p>` : ''}
      <div class="menu-actions">${button('title', 'BACK', 'id="launchButton"')}</div>`];
  }
  static objects(): MenuView {
    return ['objects', 'INFO DECK', 'SHIPS / SALVAGE / HAZARDS', `<section class="mission-briefing"><h2>SECTOR CONTACTS</h2><p>Red pirates and alien formations are hostile.</p><p>Blue police and green traders are allies. Unless you shoot them, at which point you are hostile, wanted, and hunted.</p><p>Cargo and pickups appear as triangles on your radar. Warp Gates appear as crosses.</p></section><div class="menu-actions">${button('title', 'BACK', 'id="launchButton"')}</div>`];
  }
}
