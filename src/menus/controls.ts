import { CONTROL_LAYOUTS, CONTROL_SCHEMES } from '../input-layouts';
import type { ControlScheme } from '../input-layouts';
import { button } from './menu-shell';

export function controlsView(scheme: ControlScheme, sensitivity = 1): string {
  const layout = CONTROL_LAYOUTS[scheme];
  const rows = scheme === 'touch' ? [
    ['TILT / DRAG', 'Steer / aim'], ['LEFT SIDE', 'Tap to fire; hold for continuous fire'],
    ['TAP RIGHT SIDE', 'Charged blast'], ['DOUBLE TAP EITHER SIDE', 'Cycle weapon; no blast'],
    ['+ / -', 'Forward / stop / reverse'], ['BOOST', 'Brief boost in space or canyons'],
    ['CENTRE', 'Recalibrate tilt at your current grip'], ['PAUSE', 'Pause / controls']
  ] : [
    [layout.steering, 'Steer / aim'],
    [`HOLD ${layout.fire}`, 'Fire'],
    [layout.blast, 'Charged blast'],
    [scheme === 'mouse' ? 'WHEEL / W / S' : 'R / F', 'Forward / stop / reverse'],
    [scheme === 'mouse' ? 'A / D' : 'Q / E', 'Roll left / right'],
    ['SHIFT', 'Boost'],
    ['1 / 2 / 3', 'Pulse / Spread / Lance'],
    ['TAB / WHEEL CLICK', 'Cycle weapon'],
    [scheme === 'mouse' ? 'HOLD WHEEL / ESC' : 'ESC', 'Pause'],
    ['TAB / ENTER', 'Menu select / confirm']
  ];
  const choices = CONTROL_SCHEMES.map(value => button(`controls:${value}`, CONTROL_LAYOUTS[value].name,
    `aria-pressed="${scheme === value}" title="${value === 'touch' ? 'Phone tilt or touch-drag steering' : value === 'arrows' ? 'Left-handed: arrow steering, Z fire, X blast' : value === 'wasd' ? 'WASD steering, J fire, K blast' : 'Mouse steering and firing'}"`)).join('');
  const motion = scheme === 'touch' ? `<div class="motion-settings">
    <div class="settings-row">${button('enableTilt', 'ENABLE TILT')}${button('dragSteering', 'USE DRAG')}${button('centreTilt', 'CENTRE')}</div>
    <p id="motionStatus" role="status" aria-label="Motion controls"></p>
    <label class="tilt-setting" for="tiltSensitivity">TILT SENSITIVITY <input id="tiltSensitivity" type="range" min="0.5" max="2" step="0.1" value="${sensitivity}"><output id="tiltValue" for="tiltSensitivity">${sensitivity.toFixed(1)}x</output></label>
    <p class="menu-description">Tap actions wait briefly to distinguish a double tap. Hold your phone comfortably, then enable tilt. Motion access requires HTTPS; drag steering is always available when tilt is off.</p>
  </div>` : '';
  return `<section class="controls-card"><h2>CONTROLS</h2><div class="control-select" role="group" aria-label="Control layout">${choices}</div>${motion}<dl class="control-grid">${rows.map(([key, label]) => `<div><dt>${key}</dt><dd>${label}</dd></div>`).join('')}</dl></section>`;
}
