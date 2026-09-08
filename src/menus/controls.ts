import { CONTROL_LAYOUTS } from '../input-layouts';
import type { ControlScheme } from '../input-layouts';
import { button } from './menu-shell';

export function controlsView(scheme: ControlScheme, sensitivity = 1, mouseSensitivity = 1, tunnels = false): string {
  const layout = CONTROL_LAYOUTS[scheme];
  const rows = scheme === 'touch' ? [
    ['TILT / DRAG', 'Steer / aim'], ['LEFT SIDE', 'Tap to fire; hold for continuous fire'],
    ['TAP RIGHT SIDE', 'Charged blast'], ['DOUBLE TAP EITHER SIDE', 'Cycle weapon; no blast'],
    ['+ / -', 'Forward / stop / reverse'], ['HOLD BOOST', 'Accelerate in space, canyons and asteroid belts'],
    ['CENTRE', 'Recalibrate tilt at your current grip'], ['PAUSE', 'Pause / controls']
  ] : [
    [layout.steering, 'Steer / aim'],
    [`HOLD ${layout.fire}`, 'Fire'],
    [layout.blast, 'Charged blast'],
    ['WHEEL / R / F', 'Forward / stop / reverse'],
    ['Q / E', 'Roll left / right'],
    ['SHIFT', 'Boost'],
    ['1 / 2 / 3', 'Pulse / Spread / Lance'],
    ['TAB / WHEEL CLICK', 'Cycle weapon'],
    ['HOLD WHEEL / ESC', 'Pause'],
    ['UP / DOWN / TAB', 'Select menu option'],
    ['ENTER / SPACE / J / Z', 'Confirm menu option']
  ];
  const choices = (['mouse', 'touch'] as const).map(value => button(`controls:${value}`, CONTROL_LAYOUTS[value].name,
    `aria-pressed="${(scheme === 'touch') === (value === 'touch')}" title="${value === 'touch' ? 'Phone tilt or touch-drag steering' : 'Mouse and keyboard together'}"`)).join('');
  const motion = scheme === 'touch' ? `<div class="motion-settings">
    <div class="settings-row">${button('enableTilt', 'ENABLE TILT')}${button('dragSteering', 'USE DRAG')}${button('centreTilt', 'CENTRE')}</div>
    <p id="motionStatus" role="status" aria-label="Motion controls"></p>
    <label class="tilt-setting" for="tiltSensitivity">TILT SENSITIVITY <input id="tiltSensitivity" type="range" min="0.5" max="2" step="0.1" value="${sensitivity}"><output id="tiltValue" for="tiltSensitivity">${sensitivity.toFixed(1)}x</output></label>
    <p class="menu-description">Tap actions wait briefly to distinguish a double tap. Hold your phone comfortably, then enable tilt. Motion access requires HTTPS; drag steering is always available when tilt is off.</p>
  </div>` : `<label class="tilt-setting" for="mouseSensitivity">MOUSE SENSITIVITY <input id="mouseSensitivity" type="range" min="0.5" max="2" step="0.1" value="${mouseSensitivity}"><output id="mouseValue" for="mouseSensitivity">${mouseSensitivity.toFixed(1)}x</output></label>`;
  const visibleRows = tunnels ? rows.filter(([, label]) => !/Forward|Roll|Boost|Accelerate/.test(label))
    .map(([key, label]) => label === 'Steer / aim' ? [layout.horizontal, 'Move between lanes'] : [key, label]) : rows;
  if (scheme === 'touch') visibleRows.push(['SPACE / J / Z', 'Keyboard fire'], ['K / X', 'Keyboard charged blast']);
  if (tunnels) visibleRows.push(['A / D / LEFT / RIGHT', 'Tap for one lane; hold to repeat']);
  return `<section class="controls-card"><h2>CONTROLS</h2><div class="control-select" role="group" aria-label="Input device">${choices}</div>${motion}<dl class="control-grid">${visibleRows.map(([key, label]) => `<div><dt>${key}</dt><dd>${label}</dd></div>`).join('')}</dl></section>`;
}
