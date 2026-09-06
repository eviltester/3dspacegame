import { CONTROL_LAYOUTS, CONTROL_SCHEMES } from '../input-layouts';
import type { ControlScheme } from '../input-layouts';
import { button } from '../ui';

export function controlsView(scheme: ControlScheme): string {
  const layout = CONTROL_LAYOUTS[scheme];
  const rows = [
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
    `aria-pressed="${scheme === value}" title="${value === 'arrows' ? 'Left-handed: arrow steering, Z fire, X blast' : value === 'wasd' ? 'WASD steering, J fire, K blast' : 'Mouse steering and firing'}"`)).join('');
  return `<section class="controls-card"><h2>CONTROLS</h2><div class="control-select" role="group" aria-label="Control layout">${choices}</div><dl class="control-grid">${rows.map(([key, label]) => `<div><dt>${key}</dt><dd>${label}</dd></div>`).join('')}</dl></section>`;
}
