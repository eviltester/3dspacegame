/** Apply the unit-tested HUD projection to DOM nodes and the radar canvas. */
import { buildHud } from './hud-model';
import type { HudFrame } from './hud-model';
import { renderRadar } from '../radar';
import type { GameUI } from '../ui';
export type { HudFrame } from './hud-model';

export class HudController {
  constructor(private readonly ui: GameUI) {}
  update(frame: HudFrame): void {
    const model = buildHud(frame, performance.now());
    for (const [id, value] of Object.entries(model.text)) this.ui.text(id, value);
    for (const { selector, name, active } of model.classes) document.querySelector(selector)!.classList.toggle(name, active);
    for (const [selector, hidden] of Object.entries(model.hidden)) document.querySelector<HTMLElement>(selector)!.hidden = hidden;
    for (const [selector, style] of Object.entries(model.styles)) Object.assign(document.querySelector<HTMLElement>(selector)!.style, style);
    for (const [selector, title] of Object.entries(model.titles)) document.querySelector(selector)!.setAttribute('title', title);
    if (model.radar) renderRadar(this.ui.radar.getContext('2d')!, model.radar, frame.position, frame.orientation);
  }
}
