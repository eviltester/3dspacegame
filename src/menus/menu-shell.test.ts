// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { MenuShell, button } from './menu-shell';
import { FrontMenus } from './front';
import { MenuViews } from './views';
import { freshProfile, newRun } from '../arcade';
import { GAME_MODES, MODE_INFO } from '../modes';
import { CONTROL_LAYOUTS } from '../input-layouts';
import { WEAPON_HELP } from '../weapons';
import { stageDefinition } from '../encounters';

let shell: MenuShell;
let user: ReturnType<typeof userEvent.setup>;
const action = vi.fn<(name: string) => void>();
const browse = vi.fn<(direction: number) => void>();

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  action.mockReset(); browse.mockReset();
  shell = new MenuShell(document.querySelector('#app')!, action, browse);
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

it.each(['controls', 'objects', 'scores', 'briefing', 'gameover'] as const)('Escape uses the Title Screen exit from %s regardless of focus', async view => {
  const profile = freshProfile();
  const views = {
    controls: FrontMenus.controls(profile), objects: FrontMenus.objects(), scores: FrontMenus.scores(profile, 'journey'),
    briefing: MenuViews.briefing(newRun('journey', 1), stageDefinition('journey', 1)),
    gameover: MenuViews.gameOver(newRun('journey', 1), profile)
  };
  shell.show(...views[view]);
  shell.overlay.querySelector<HTMLButtonElement>('button')!.focus();
  await user.keyboard('{Escape}');
  expect(action).toHaveBeenCalledExactlyOnceWith('title');
});

it('Escape from a focused Controls slider returns to the pause menu', async () => {
  shell.show(...FrontMenus.controls(freshProfile(), 'backToPause'));
  shell.overlay.querySelector<HTMLInputElement>('input')!.focus();
  await user.keyboard('{Escape}');
  expect(action).toHaveBeenCalledExactlyOnceWith('backToPause');
});

it('does not repeat or modify Escape navigation, or activate hidden exit buttons', async () => {
  shell.show(...FrontMenus.objects());
  await user.keyboard('{Escape>4/}'); expect(action).toHaveBeenCalledExactlyOnceWith('title');
  action.mockClear();
  await user.keyboard('{Control>}{Escape}{/Control}'); expect(action).not.toHaveBeenCalled();
  shell.show('objects', 'INFO DECK', '', `<div hidden>${button('title', 'TITLE SCREEN')}</div>`);
  await user.keyboard('{Escape}'); expect(action).not.toHaveBeenCalled();
  shell.show(...FrontMenus.objects()); shell.hide();
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
  shell.show(...FrontMenus.weapons(freshProfile(), 'pulse'));
  for (const help of Object.values(WEAPON_HELP)) expect(screen.getByText(help)).toBeTruthy();
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

it.each(['objects', 'briefing'])('%s supports object arrows with mouse and keyboard', async mode => {
  shell.show(mode, 'CONTACTS', '', button('title', 'BACK'));
  expect(screen.getByRole('region', { name: 'Info Deck' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Next object' }));
  await user.click(screen.getByRole('button', { name: 'Previous object' }));
  await user.keyboard('{ArrowRight}{ArrowLeft}');
  expect(browse.mock.calls).toEqual([[1], [-1], [1], [-1]]); expect(action).not.toHaveBeenCalled();
  await user.keyboard('{Control>}{ArrowRight}{/Control}'); expect(browse).toHaveBeenCalledTimes(4);
});

it('does not browse objects from unrelated menus or after returning to flight', async () => {
  shell.show(...FrontMenus.title(freshProfile(), 'journey', 'pulse', false));
  await user.keyboard('{ArrowRight}{ArrowLeft}'); expect(browse).not.toHaveBeenCalled();
  shell.show(...FrontMenus.objects()); shell.hide();
  await user.keyboard('{ArrowRight}{ArrowLeft}'); expect(browse).not.toHaveBeenCalled();
  expect(shell.overlay.hidden).toBe(true);
  expect(document.querySelector<HTMLElement>('.flight-buttons')!.inert).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Pause' }));
  expect(action).toHaveBeenCalledExactlyOnceWith('pause');
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
  shell.show(...FrontMenus.scores(profile, mode));
  expect(screen.getByRole('table').outerHTML).toBe(html); expect(profile).toEqual(before);
});

it('Game Over has an empty high-score table when no flights qualify', () => {
  shell.show(...MenuViews.gameOver(newRun('invaders', 1), freshProfile()));
  expect(within(screen.getByRole('table')).getByText('NO FLIGHTS RECORDED YET')).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
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
  shell.show(...FrontMenus.objects()); shell.dispose();
  await user.keyboard('{ArrowRight}'); await user.click(screen.getByRole('button', { name: 'BACK' }));
  expect(browse).not.toHaveBeenCalled(); expect(action).not.toHaveBeenCalled();
});
