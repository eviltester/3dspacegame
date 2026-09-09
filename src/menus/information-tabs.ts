export const TITLE_TABS = ['game', 'instructions', 'controls', 'scores', 'objects'] as const;
export type TitleTab = typeof TITLE_TABS[number];
const labels: Record<TitleTab, string> = {
  game: 'GAME', instructions: 'INSTRUCTIONS', controls: 'CONTROLS', scores: 'HIGH SCORES', objects: 'INFO DECK'
};
export function isTitleTab(value: string): value is TitleTab {
  return TITLE_TABS.some(tab => tab === value);
}

/** One tab stop for the strip; Left/Right move between its associated panels. */
export function informationTabs(selected: TitleTab = 'game'): string {
  return `<div class="information-tabs" role="tablist" aria-label="Game information">${TITLE_TABS.map(tab =>
    `<button type="button" role="tab" id="title-tab-${tab}" data-action="${tab}" aria-controls="title-panel-${tab}" aria-selected="${tab === selected}" tabindex="${tab === selected ? 0 : -1}">${labels[tab]}</button>`).join('')}</div>`;
}
