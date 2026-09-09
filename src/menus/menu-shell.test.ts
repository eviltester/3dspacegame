// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { MenuShell, button } from './menu-shell';
import { FrontMenus } from './front';
import { MenuViews } from './views';
import { freshProfile, newRun, recordRun } from '../arcade';
import { nameScore } from '../scores';
import { GAME_MODES, MODE_INFO } from '../modes';
import { CONTROL_LAYOUTS } from '../input-layouts';
import { WEAPON_HELP } from '../weapons';
import { stageDefinition } from '../encounters';
import { isTitleTab, TITLE_TABS } from './information-tabs';

let shell: MenuShell;
let user: ReturnType<typeof userEvent.setup>;
const action = vi.fn<(name: string) => void>();
const browse = vi.fn<(direction: number) => void>();

beforeEach(() => {
  // Happy DOM needs the browser's hidden-element display rule for native Tab emulation.
  document.body.innerHTML = '<style>[hidden] { display: none !important; }</style><div id="app"></div>';
  action.mockReset(); browse.mockReset();
  shell = new MenuShell(document.querySelector('#app')!, action, browse);
  action.mockImplementation(name => { if (isTitleTab(name)) shell.selectTitleTab(name); });
  user = userEvent.setup({ document });
});
afterEach(() => { shell.dispose(); document.body.innerHTML = ''; });

it.each(GAME_MODES)('exposes and activates %s by accessible name, without mutating the profile', async mode => {
  const profile = freshProfile(), before = structuredClone(profile);
  shell.show(...FrontMenus.title(profile, mode, 'pulse', false));
  const choice = within(screen.getByRole('group', { name: 'Game mode' })).getByRole('button', { name: new RegExp(MODE_INFO[mode].name) });
  expect(choice.getAttribute('aria-pressed')).toBe('true');
  // Clicking nested text exercises the same delegated handler as the full button.
  await user.click(within(choice).getByText(MODE_INFO[mode].name));
  expect(action).toHaveBeenCalledExactlyOnceWith(`mode:${mode}`);
  expect(profile).toEqual(before);
  expect(screen.queryByRole('region', { name: 'Info Deck' })).toBeNull();
  expect(screen.getByRole('region', { name: 'Selected mode preview' })).toBeTruthy();
  expect(screen.getByText('GAME MODES')).toBeTruthy();
  const record = document.querySelector('.title-play .record-line')!;
  expect(record.textContent).toContain(`BEST ${profile.records[mode]}`);
  expect(record.nextElementSibling?.classList.contains('title-play-buttons')).toBe(true);
  expect(record.nextElementSibling?.querySelector('#launchButton')).toBeTruthy();
  expect(choice.textContent).toBe(MODE_INFO[mode].name);
  const preview = screen.getByRole('region', { name: 'Selected mode preview' });
  expect(within(preview).getByText(MODE_INFO[mode].summary)).toBeTruthy();
  expect(within(preview).getByText(MODE_INFO[mode].detail)).toBeTruthy();
  expect(document.querySelector('#screenContent')!.textContent).not.toContain(MODE_INFO[mode].detail);
  for (const other of GAME_MODES.filter(other => other !== mode)) expect(screen.queryByText(MODE_INFO[other].detail)).toBeNull();
});

it('focuses Play, supports keyboard activation, and traps Tab away from hidden flight controls', async () => {
  shell.show(...FrontMenus.title(freshProfile(), 'journey', 'pulse', false));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'PLAY GAME' }));
  await user.keyboard('{Enter}'); expect(action).toHaveBeenCalledExactlyOnceWith('newRun');
  const last = screen.getByRole('button', { name: 'PLAY GAME' });
  last.focus(); await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: /^ARCADE JOURNEY/ }));
  await user.tab({ shift: true }); expect(document.activeElement).toBe(last);
});

it.each(['title', 'pause'])('%s uses Up/Down to select enabled visible actions and wraps at the ends', async mode => {
  shell.show(mode, 'MENU', '', `${button('first', 'FIRST')}<div hidden>${button('hidden', 'HIDDEN')}</div>
    ${button('disabled', 'DISABLED', 'disabled')}${button('second', 'SECOND')}${button('last', 'LAST')}`);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'FIRST' }));
  await user.keyboard('{ArrowDown}'); expect(document.activeElement).toBe(screen.getByRole('button', { name: 'SECOND' }));
  await user.keyboard('{ArrowUp}{ArrowUp}'); expect(document.activeElement).toBe(screen.getByRole('button', { name: 'LAST' }));
  await user.keyboard('{ArrowDown}'); expect(document.activeElement).toBe(screen.getByRole('button', { name: 'FIRST' }));
  expect(action).not.toHaveBeenCalled();
});

it.each(['{Enter}', ' ', 'j', 'z'])('%s confirms the focused menu action exactly once', async key => {
  shell.show('pause', 'PAUSED', '', button('unpause', 'RESUME') + button('title', 'TITLE SCREEN'));
  await user.keyboard('{ArrowDown}'); await user.keyboard(key);
  expect(action).toHaveBeenCalledExactlyOnceWith('title');
});

it('holding confirmation cannot cascade through screens, and modified keys are left alone', async () => {
  const menu = () => shell.show('title', 'TITLE', '', button('newRun', 'PLAY'));
  action.mockImplementation(menu); menu();
  await user.keyboard('{Enter>4/}'); expect(action).toHaveBeenCalledTimes(1);
  await user.keyboard('{Control>}z{ArrowDown}{/Control}'); expect(action).toHaveBeenCalledTimes(1);
  shell.hide(); await user.keyboard('j{Enter}{ArrowDown}'); expect(action).toHaveBeenCalledTimes(1);
});

it('preserves typing and native arrow behaviour in editable fields', async () => {
  shell.show('settings', 'SETTINGS', '', '<input aria-label="Name"><select aria-label="Choice"><option>One</option><option>Two</option></select>' + button('done', 'DONE'));
  const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name' });
  await user.type(name, 'jz'); expect(name.value).toBe('jz');
  const arrow = new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true, cancelable: true }); name.dispatchEvent(arrow);
  expect(arrow.defaultPrevented).toBe(false); expect(document.activeElement).toBe(name);
  screen.getByRole('combobox').focus(); await user.keyboard('{ArrowUp}{Enter}');
  expect(document.activeElement).toBe(screen.getByRole('combobox')); expect(action).not.toHaveBeenCalled();
});

it.each(['briefing', 'gameover'] as const)('Escape returns from %s regardless of focus', async view => {
  const profile = freshProfile();
  const views = {
    briefing: MenuViews.briefing(newRun('journey', 1), stageDefinition('journey', 1)),
    gameover: MenuViews.gameOver(newRun('journey', 1), profile)
  };
  shell.show(...views[view]);
  shell.overlay.querySelector<HTMLButtonElement>('button')!.focus();
  await user.keyboard('{Escape}');
  expect(action).toHaveBeenCalledExactlyOnceWith('title');
});

it.each(TITLE_TABS.filter(tab => tab !== 'game'))('Escape returns the %s panel to GAME without replacing the title', async tab => {
  shell.show(...FrontMenus.title(freshProfile(), 'invaders', 'pulse', false, tab));
  const choices = screen.getByRole('group', { name: 'Game mode' });
  await user.keyboard('{Escape}');
  expect(action).toHaveBeenCalledExactlyOnceWith('game');
  expect(screen.getByRole('group', { name: 'Game mode' })).toBe(choices);
  expect(screen.getByRole('tabpanel', { name: 'GAME' })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'GAME' }));
});

it('Escape from a focused Controls slider returns to the pause menu', async () => {
  shell.show(...FrontMenus.controls(freshProfile(), 'backToPause'));
  shell.overlay.querySelector<HTMLInputElement>('input')!.focus();
  await user.keyboard('{Escape}');
  expect(action).toHaveBeenCalledExactlyOnceWith('backToPause');
});

it('does not repeat or modify Escape navigation, or activate hidden exit buttons', async () => {
  shell.show(...FrontMenus.title(freshProfile(), 'journey', 'pulse', false, 'objects'));
  await user.keyboard('{Escape>4/}'); expect(action).toHaveBeenCalledExactlyOnceWith('game');
  action.mockClear();
  await user.keyboard('{Control>}{Escape}{/Control}'); expect(action).not.toHaveBeenCalled();
  shell.show('objects', 'INFO DECK', '', `<div hidden>${button('title', 'TITLE SCREEN')}</div>`);
  await user.keyboard('{Escape}'); expect(action).not.toHaveBeenCalled();
  shell.show(...FrontMenus.title(freshProfile(), 'journey', 'pulse', false, 'objects')); shell.hide();
  await user.keyboard('{Escape}'); expect(action).not.toHaveBeenCalled();
});

it.each(['title', 'pause'])('Escape does not trigger a different action on %s', async view => {
  shell.show(view, 'MENU', '', button('title', 'TITLE SCREEN'));
  await user.keyboard('{Escape}'); expect(action).not.toHaveBeenCalled();
});

it('prefers the selected mode checkpoint and makes Resume keyboard-accessible', async () => {
  const profile = freshProfile(); profile.checkpoints.invaders = newRun('invaders', 3);
  profile.checkpoints.invaders.stage = 12;
  shell.show(...FrontMenus.title(profile, 'invaders', 'pulse', false));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'RESUME WAVE 12' }));
  await user.keyboard(' '); expect(action).toHaveBeenCalledExactlyOnceWith('resumeRun');
  shell.show(...FrontMenus.title(profile, 'journey', 'pulse', false));
  expect(screen.queryByRole('button', { name: /RESUME/ })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'PLAY GAME' }));
});

it.each(['mouse', 'touch'] as const)('%s device settings preserve focus after the owner rebuilds the view', async scheme => {
  const profile = freshProfile();
  shell.show(...FrontMenus.controls(profile));
  expect(within(screen.getByRole('group', { name: 'Input device' })).getAllByRole('button')).toHaveLength(2);
  action.mockImplementation(name => {
    if (name === `controls:${scheme}`) profile.settings.controlScheme = scheme;
    shell.show(...FrontMenus.controls(profile));
  });
  await user.click(screen.getByRole('button', { name: CONTROL_LAYOUTS[scheme].name }));
  const selected = screen.getByRole('button', { name: CONTROL_LAYOUTS[scheme].name });
  expect(selected.getAttribute('aria-pressed')).toBe('true'); expect(document.activeElement).toBe(selected);
  expect(screen.getByText(scheme === 'touch' ? 'LEFT SIDE' : `HOLD ${CONTROL_LAYOUTS[scheme].fire}`)).toBeTruthy();
  expect(action).toHaveBeenCalledExactlyOnceWith(`controls:${scheme}`);
});

it('shows weapon purposes and prevents locked starting choices from activating', async () => {
  shell.show(...FrontMenus.title(freshProfile(), 'journey', 'pulse', false));
  expect(screen.getByText(WEAPON_HELP.pulse)).toBeTruthy();
  const spread = screen.getByRole<HTMLButtonElement>('button', { name: 'SPREAD' });
  expect(spread.title).toBe(WEAPON_HELP.spread); expect(spread.disabled).toBe(true);
  await user.click(spread); expect(action).not.toHaveBeenCalled();
  for (const family of ['pulse', 'spread', 'lance'] as const) {
    shell.show(...FrontMenus.title(freshProfile(), 'journey', family, false));
    expect(screen.getByText(WEAPON_HELP[family])).toBeTruthy();
  }
});

it('respects disabled shop purchases and moves focus if a purchase becomes unavailable', async () => {
  const run = newRun('journey', 1); run.pilot.credits = 1000; run.phase = 'shop';
  shell.show(...MenuViews.shop(run));
  await user.click(screen.getByRole('button', { name: 'Buy tier' }));
  expect(action).toHaveBeenCalledExactlyOnceWith('buy:tier');
  run.tiers.pulse = 3;
  shell.show(...MenuViews.shop(run));
  const buy = screen.getByRole<HTMLButtonElement>('button', { name: 'Buy tier' });
  expect(buy.disabled).toBe(true);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'NEXT STAGE' }));
  action.mockClear(); await user.click(buy); expect(action).not.toHaveBeenCalled();
});

it('Level Warp fields support labelled selection and typing before dispatching an action', async () => {
  shell.show(...MenuViews.levelWarp(null));
  const stage = screen.getByRole<HTMLSelectElement>('combobox', { name: 'JOURNEY STAGE' });
  expect(within(stage).getAllByRole('option')).toHaveLength(99);
  await user.selectOptions(stage, '99'); expect(stage.value).toBe('99');
  const wave = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'ATTACK CHALLENGE WAVE' });
  await user.clear(wave); await user.type(wave, '1000'); expect(wave.value).toBe('1000');
  const difficulty = screen.getByRole<HTMLSelectElement>('combobox', { name: 'DIFFICULTY' });
  expect(within(difficulty).getAllByRole('option')).toHaveLength(8);
  await user.selectOptions(difficulty, '8'); expect(difficulty.value).toBe('8');
  expect(action).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'WARP TO WAVE' }));
  expect(action).toHaveBeenCalledExactlyOnceWith('warpEndless');
});

it('Info Deck supports object arrows with mouse and keyboard', async () => {
  shell.show(...FrontMenus.title(freshProfile(), 'journey', 'pulse', false, 'objects'));
  expect(screen.getByRole('region', { name: 'Info Deck' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Next object' }));
  await user.click(screen.getByRole('button', { name: 'Previous object' }));
  await user.keyboard('{ArrowRight}{ArrowLeft}');
  expect(browse.mock.calls).toEqual([[1], [-1], [1], [-1]]); expect(action).not.toHaveBeenCalled();
  await user.keyboard('{Control>}{ArrowRight}{/Control}'); expect(browse).toHaveBeenCalledTimes(4);
});
it('mission briefings have no Info Deck or object navigation', async () => {
  shell.show(...MenuViews.briefing(newRun('journey', 1), stageDefinition('journey', 1)));
  expect(screen.queryByRole('region', { name: 'Info Deck' })).toBeNull();
  expect(within(shell.overlay).getAllByRole('button').map(item => item.textContent)).toEqual(['START MISSION']);
  await user.keyboard('{ArrowLeft}{ArrowRight}'); expect(browse).not.toHaveBeenCalled();
});
it.each(GAME_MODES)('%s includes one plain radar paragraph in Instructions without duplicate contact guidance', async mode => {
  shell.show(...FrontMenus.title(freshProfile(), mode, 'pulse', false, 'objects'));
  const deck = screen.getByRole('tabpanel', { name: 'INFO DECK' });
  expect(within(deck).queryByText('SECTOR CONTACTS')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'SECTOR CONTACTS' })).toBeNull();
  expect(within(deck).getByRole('button', { name: 'Next object' })).toBeTruthy();
  await user.click(screen.getByRole('tab', { name: 'INSTRUCTIONS' }));
  const instructions = screen.getByRole('tabpanel', { name: 'INSTRUCTIONS' });
  expect(within(instructions).queryByRole('heading', { name: 'SECTOR CONTACTS' })).toBeNull();
  const radar = within(instructions).getByText('Cargo and pickups appear as triangles on your radar. Warp Gates appear as crosses.');
  expect(radar.tagName).toBe('P'); expect(radar.parentElement?.className).toBe('game-instructions');
  for (const text of [
    'Red pirates and alien formations are hostile.',
    'Blue police and green traders are allies. Unless you shoot them, at which point you are hostile, wanted, and hunted.'
  ]) expect(within(instructions).queryByText(text)).toBeNull();
  expect(instructions.querySelector('.mission-briefing, p[class]')).toBeNull();
});
it('groups five linked tabs above the shared panels with roving keyboard focus', async () => {
  shell.show(...FrontMenus.title(freshProfile(), 'invaders', 'pulse', false));
  const nav = screen.getByRole('tablist', { name: 'Game information' });
  expect(within(nav).getAllByRole('tab').map(item => item.textContent)).toEqual(['GAME', 'INSTRUCTIONS', 'CONTROLS', 'HIGH SCORES', 'INFO DECK']);
  expect(nav.nextElementSibling?.classList.contains('title-panels')).toBe(true);
  within(nav).getByRole('tab', { name: 'GAME' }).focus();
  await user.keyboard('{ArrowRight}'); expect(action).toHaveBeenCalledExactlyOnceWith('instructions');
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'INSTRUCTIONS', selected: true }));
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  await user.keyboard('{End}{ArrowRight}{ArrowLeft}{Home}');
  expect(action.mock.calls.map(([name]) => name)).toEqual(['instructions', 'objects', 'game', 'objects', 'game']);
  expect(browse).not.toHaveBeenCalled();
  for (const tab of within(nav).getAllByRole('tab')) {
    expect(document.getElementById(tab.getAttribute('aria-controls')!)?.getAttribute('aria-labelledby')).toBe(tab.id);
    expect(tab.tabIndex).toBe(tab.getAttribute('aria-selected') === 'true' ? 0 : -1);
  }
});

it('does not browse objects from unrelated menus or after returning to flight', async () => {
  shell.show(...FrontMenus.title(freshProfile(), 'journey', 'pulse', false));
  await user.keyboard('{ArrowRight}{ArrowLeft}'); expect(browse).not.toHaveBeenCalled();
  shell.show(...FrontMenus.title(freshProfile(), 'journey', 'pulse', false, 'objects')); shell.hide();
  await user.keyboard('{ArrowRight}{ArrowLeft}'); expect(browse).not.toHaveBeenCalled();
  expect(shell.overlay.hidden).toBe(true);
  expect(document.querySelector<HTMLElement>('.flight-buttons')!.inert).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Pause' }));
  expect(action).toHaveBeenCalledExactlyOnceWith('pause');
});

it('allows keyboard focus and native page scrolling from help without launching hidden GAME actions', async () => {
  shell.show(...FrontMenus.title(freshProfile(), 'journey', 'pulse', false, 'instructions'));
  screen.getByRole('tab', { name: 'INSTRUCTIONS' }).focus(); await user.tab();
  const panel = screen.getByRole('tabpanel', { name: 'INSTRUCTIONS' });
  expect(document.activeElement).toBe(panel);
  for (const code of ['ArrowDown', 'PageDown', 'Space']) {
    const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
    panel.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
  }
  document.querySelector<HTMLButtonElement>('[data-action="newRun"]')!.click();
  expect(action).not.toHaveBeenCalled();
});

it.each([0, 1000, 20000, 123456])('shows final score %s and a usable Continue choice', async score => {
  const run = newRun('journey', 1); run.lives = 0; run.pilot.score = score;
  shell.show(...MenuViews.gameOver(run));
  expect(screen.getByText(score.toLocaleString('en-GB'))).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'CONTINUE' }));
  expect(action).toHaveBeenCalledExactlyOnceWith('relaunch');
});

it.each(GAME_MODES)('Game Over shows only the %s high scores, using the same table as High Scores', mode => {
  const profile = freshProfile();
  for (const [index, other] of GAME_MODES.entries()) profile.scoreboards[other] = [
    { id: `${other}-clean`, score: 9000 + index, stage: 8, continued: false, initials: 'ACE' },
    { id: `${other}-continued`, score: 8000 + index, stage: 10, continued: true }
  ];
  const before = structuredClone(profile);
  shell.show(...MenuViews.gameOver(newRun(mode, 1), profile));
  const table = screen.getByRole('table', { name: `${MODE_INFO[mode].name} high scores` });
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  expect(within(table).getByRole('columnheader', { name: MODE_INFO[mode].unit })).toBeTruthy();
  expect(within(table).getByText('ACE')).toBeTruthy(); expect(within(table).getByText('---')).toBeTruthy();
  expect(within(table).getByText('CONTINUED')).toBeTruthy(); expect(within(table).getByText('CLEAN')).toBeTruthy();
  for (const other of GAME_MODES) {
    for (const entry of profile.scoreboards[other]) expect(!!within(table).queryByText(String(entry.score))).toBe(other === mode);
  }
  const html = table.outerHTML;
  shell.show(...FrontMenus.title(profile, mode, 'pulse', false, 'scores'));
  expect(screen.getByRole('table').outerHTML).toBe(html); expect(profile).toEqual(before);
});

it('Game Over has an empty high-score table when no flights qualify', () => {
  shell.show(...MenuViews.gameOver(newRun('invaders', 1), freshProfile()));
  expect(within(screen.getByRole('table')).getByText('NO FLIGHTS RECORDED YET')).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
});

it('focuses qualifying initials, validates them, submits once and displays the saved name', async () => {
  const profile = freshProfile(), run = newRun('invaders', 1);
  run.phase = 'gameover'; run.pilot.score = 12345; recordRun(profile, run);
  shell.show(...MenuViews.gameOver(run, profile));
  const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'YOUR INITIALS' });
  expect(document.activeElement).toBe(field);
  const form = screen.getByRole<HTMLFormElement>('form', { name: 'High score initials' });
  // Explicit submission also exercises validation for non-native submit callers.
  form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  expect(action).not.toHaveBeenCalled();
  await user.type(field, '123'); await user.click(screen.getByRole('button', { name: 'SAVE' }));
  expect(action).not.toHaveBeenCalled();
  await user.clear(field); await user.type(field, 'ace');
  action.mockImplementation(name => {
    if (name === 'saveInitials') nameScore(profile, run, field.value);
    shell.show(...MenuViews.gameOver(run, profile));
  });
  await user.click(screen.getByRole('button', { name: 'SAVE' }));
  expect(action).toHaveBeenCalledExactlyOnceWith('saveInitials');
  expect(screen.getByRole('status').textContent).toBe('HIGH SCORE SAVED: ACE');
  expect(within(screen.getByRole('table')).getByText('ACE')).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
});

it('ignores unrelated submission events and suppresses forms while the overlay is hidden', () => {
  shell.show('form', 'FORM', '', '<form aria-label="Unmanaged"></form><form aria-label="Managed" data-submit-action="save"></form>');
  for (const target of [shell.overlay, screen.getByRole('form', { name: 'Unmanaged' })]) {
    const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
    target.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
  }
  const managed = screen.getByRole('form', { name: 'Managed' });
  shell.hide();
  const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
  managed.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  expect(action).not.toHaveBeenCalled();
});

it('moves focus out of hidden tab content and leaves paused-flight screens unchanged', () => {
  shell.show(...FrontMenus.title(freshProfile(), 'journey', 'pulse', false, 'objects'));
  screen.getByRole('button', { name: 'Next object' }).focus();
  shell.selectTitleTab('scores');
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'HIGH SCORES' }));
  shell.show('pause', 'PAUSED', '', button('resume', 'RESUME'));
  shell.selectTitleTab('controls'); expect(shell.titleTab).toBe('scores');
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'RESUME' }));
});

it('arrow selection recovers absent focus and empty menus safely', async () => {
  shell.show('pause', 'PAUSED', '', button('first', 'FIRST') + button('last', 'LAST'));
  screen.getByRole<HTMLButtonElement>('button', { name: 'FIRST' }).blur();
  await user.keyboard('{ArrowUp}'); expect(document.activeElement).toBe(screen.getByRole('button', { name: 'LAST' }));
  screen.getByRole<HTMLButtonElement>('button', { name: 'LAST' }).blur();
  await user.keyboard('{ArrowDown}'); expect(document.activeElement).toBe(screen.getByRole('button', { name: 'FIRST' }));
  shell.show('empty', 'EMPTY', '', '');
  await user.keyboard('{ArrowUp}{ArrowDown}{Enter}'); expect(action).not.toHaveBeenCalled();
});

it('repeat, modified and composing keys do not activate exits or menu items', () => {
  shell.show('gameover', 'GAME OVER', '', button('title', 'TITLE SCREEN'));
  for (const options of [{ repeat: true }, { altKey: true }, { metaKey: true }, { isComposing: true }]) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', ...options }));
  }
  expect(action).not.toHaveBeenCalled();
  shell.show('gameover', 'GAME OVER', '', '');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  expect(action).not.toHaveBeenCalled();
});

it('excludes hidden, CSS-hidden, inert and disabled elements from focus wrapping', async () => {
  shell.show('test', 'TEST', '', `${button('first', 'FIRST')}<div hidden>${button('hidden', 'HIDDEN')}</div>
    <div style="display:none">${button('cssHidden', 'CSS HIDDEN')}</div><div style="visibility:hidden">${button('invisible', 'INVISIBLE')}</div>
    ${button('disabled', 'DISABLED', 'disabled')}<div inert>${button('inert', 'INERT')}</div>${button('last', 'LAST')}`);
  const first = screen.getByRole('button', { name: 'FIRST' }), last = screen.getByRole('button', { name: 'LAST' });
  expect(document.activeElement).toBe(first);
  await user.tab({ shift: true }); expect(document.activeElement).toBe(last);
  await user.tab(); expect(document.activeElement).toBe(first);
});

it('handles empty views, missing text and disposal without leaving navigation listeners', async () => {
  shell.show('empty', 'EMPTY', '', ''); await user.tab();
  shell.text('notPresent', 'ignored'); shell.text('launchTitle', 'EMPTY');
  shell.show(...FrontMenus.title(freshProfile(), 'journey', 'pulse', false, 'objects')); shell.dispose();
  await user.keyboard('{ArrowRight}'); await user.click(screen.getByRole('tab', { name: 'GAME' }));
  expect(browse).not.toHaveBeenCalled(); expect(action).not.toHaveBeenCalled();
});
