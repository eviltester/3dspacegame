// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { MenuShell, button } from './menu-shell';
import { FrontMenus } from './front';
import { MenuViews } from './views';
import { freshProfile, newRun } from '../arcade';
import { GAME_MODES, MODE_INFO } from '../modes';
import { CONTROL_LAYOUTS, CONTROL_SCHEMES } from '../input-layouts';
import { WEAPON_HELP } from '../weapons';

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
  expect(screen.queryByRole('region', { name: 'Ships and objects' })).toBeNull();
  expect(screen.getByRole('region', { name: 'Selected mode preview' })).toBeTruthy();
});

it('focuses Play, supports keyboard activation, and traps Tab away from hidden flight controls', async () => {
  shell.show(...FrontMenus.title(freshProfile(), 'journey', 'pulse', false));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'PLAY GAME' }));
  await user.keyboard('{Enter}'); expect(action).toHaveBeenCalledExactlyOnceWith('newRun');
  const last = screen.getByRole('button', { name: 'SHIPS & OBJECTS' });
  last.focus(); await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: /^ARCADE JOURNEY/ }));
  await user.tab({ shift: true }); expect(document.activeElement).toBe(last);
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

it.each(CONTROL_SCHEMES)('%s settings preserve focus after the owner rebuilds the view', async scheme => {
  const profile = freshProfile();
  shell.show(...FrontMenus.controls(profile));
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
  expect(screen.getByRole('region', { name: 'Ships and objects' })).toBeTruthy();
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

it.each([10, 5, 1, 0])('keeps Continue usable at countdown %s', async remaining => {
  const run = newRun('journey', 1); run.lives = 0;
  shell.show(...MenuViews.gameOver(run)); shell.text('deathTimer', String(remaining));
  expect(screen.getByText(String(remaining))).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'CONTINUE' }));
  expect(action).toHaveBeenCalledExactlyOnceWith('relaunch');
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
