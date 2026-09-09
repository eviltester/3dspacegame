/** Title panels and paused-flight controls; displaying them never mutates a run. */
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
import type { TitleTab } from './information-tabs';
import { modeInstructions } from './instructions';

export function modeButtons(selected: GameMode): string {
  return `<div class="mode-select" role="group" aria-label="Game mode">${GAME_MODES.map(mode => button(`mode:${mode}`,
    `<span>${MODE_INFO[mode].name}</span>`, `aria-pressed="${mode === selected}"`)).join('')}</div>`;
}

export class FrontMenus {
  static title(profile: ProfileSaveV2, mode: GameMode, family: WeaponFamily, warp: boolean, tab: TitleTab = 'game'): MenuView {
    const saved = profile.checkpoints[mode];
    const help = mode === 'tunnels' ? TUNNEL_WEAPON_HELP : WEAPON_HELP;
    return ['title', '3D VECTOR SPACE SHOOTER', '', `
      <div class="title-modes"><p class="briefing-status">GAME MODES</p>${modeButtons(mode)}</div>
      ${warp ? `<nav class="title-tools" aria-label="Test flights">${button('levelWarp', 'LEVEL WARP', 'id="levelWarpButton"')}</nav>` : ''}`, {
      tab,
      mode: `<div class="mode-preview-copy"><h2 id="modePreviewName">${MODE_INFO[mode].name}</h2>
        <p id="modePreviewTagline">${MODE_INFO[mode].summary}</p>
        <p class="menu-description" id="modeDescription">${MODE_INFO[mode].detail}</p></div>`,
      loadout: `<div class="title-loadout"><div class="loadout-heading">STARTING WEAPON</div>
        <div class="family-select">${FAMILIES.map(f => button(`startFamily:${f}`, f.toUpperCase(), `aria-pressed="${family === f}" title="${help[f]}" ${profile.unlocked.includes(f) ? '' : 'disabled'}`)).join('')}</div></div>`,
      weapon: `<div class="weapon-preview-copy"><h3 id="weaponPreviewName">${family.toUpperCase()}</h3>
        <p class="weapon-purpose" id="weaponHelp">${help[family]}</p></div>`,
      actions: `<div class="menu-actions title-play"><p class="record-line">${CONTROL_LAYOUTS[profile.settings.controlScheme].name} / BEST ${profile.records[mode]}</p>
        <div class="title-play-buttons">${saved && saved.phase !== 'victory' ? button('resumeRun', `RESUME ${MODE_INFO[mode].unit} ${saved.stage}`, 'id="resumeButton"') : ''}${button('newRun', saved ? 'NEW RUN' : 'PLAY GAME', 'id="launchButton"')}</div></div>`,
      instructions: FrontMenus.instructionContent(profile, mode, family),
      controls: FrontMenus.controlContent(profile, mode),
      scores: FrontMenus.scoreContent(profile, mode)
    }];
  }

  static instructionContent(profile: ProfileSaveV2, mode: GameMode, family: WeaponFamily): string {
    return `<section class="game-instructions" aria-label="${MODE_INFO[mode].name} instructions"><h2>${MODE_INFO[mode].name}</h2>${modeInstructions(mode, family, profile.settings.controlScheme)}<p>Cargo and pickups appear as triangles on your radar. Warp Gates appear as crosses.</p></section>`;
  }

  /** Paused flights keep their own Back action; title controls live inside a tab. */
  static controls(profile: ProfileSaveV2, back = 'backToPause', mode: GameMode = 'journey'): MenuView {
    return ['controls', 'CONTROLS', CONTROL_LAYOUTS[profile.settings.controlScheme].name, `${FrontMenus.controlContent(profile, mode)}
      <div class="menu-actions">${button(back, 'BACK', 'id="launchButton"')}</div>`];
  }

  static controlContent(profile: ProfileSaveV2, mode: GameMode): string {
    return `${controlsView(profile.settings.controlScheme, profile.settings.tiltSensitivity, profile.settings.mouseSensitivity, mode === 'tunnels')}
      <div class="settings-row">${button('assist', `AIM ASSIST: ${profile.settings.aimAssist ? 'ON' : 'OFF'}`)}${button('mute', `SOUND: ${profile.settings.muted ? 'OFF' : 'ON'}`)}</div>`;
  }

  static scoreContent(profile: ProfileSaveV2, mode: GameMode): string {
    return `<h2 class="panel-heading">${MODE_INFO[mode].name}</h2>
      <div class="record-totals"><p>BEST <strong>${profile.records[mode]}</strong></p><p>CONTINUED <strong>${profile.records[`${mode}Continued`]}</strong></p></div>
      ${highScoreTable(profile, mode)}
      ${mode === 'journey' && profile.legacyScore ? `<p class="record-line">LEGACY RECORD ${profile.legacyScore}</p>` : ''}`;
  }
}
