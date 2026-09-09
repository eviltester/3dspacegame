import { expect, it } from 'vitest';
import { screen, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { GameHarness } from './fixtures/game';
import { FAMILIES, freshProfile, newRun, recordRun, SAVE_V2, saveCheckpoint } from '../../src/arcade';
import { GAME_MODES, MODE_INFO } from '../../src/modes';
import { WEAPON_HELP } from '../../src/weapons';
import { TUNNEL_WEAPON_HELP } from '../../src/tunnels/menus';

it.each(['instructions', 'controls', 'objects', 'scores'])('Escape returns from %s to the title without starting a run', async menu => {
  const game = new GameHarness(), user = userEvent.setup(); await game.action(menu);
  await user.keyboard('{Escape}');
  expect(game.state().menu).toBe('title'); expect(game.state().mode).toBeUndefined();
});

it.each(['journey', 'endless'] as const)('Escape leaves the %s mission briefing with a resumable checkpoint', async mode => {
  const game = new GameHarness(), user = userEvent.setup();
  await game.action(`mode:${mode}`); await game.action('newRun');
  expect(game.state().menu).toBe('briefing');
  expect(document.querySelector<HTMLElement>('#catalogSection')!.hidden).toBe(true);
  expect(within(screen.getByRole('button', { name: 'START MISSION' }).parentElement!).getAllByRole('button')).toHaveLength(1);
  await user.keyboard('{Escape}'); expect(game.state().menu).toBe('title');
  expect(game.debug.getProfile().checkpoints[mode]?.stage).toBe(1);
  expect(document.pointerLockElement).toBeNull();
  await game.action('resumeRun'); expect(game.state().menu).toBe('briefing');
  await game.action('launch'); expect(game.state().menu).toBe(''); expect(game.state().mode).toBe(mode);
});

it.each(['invaders', 'smuggler', 'tunnels'] as const)('%s Play, Resume, New Run and Continue enter gameplay directly', async mode => {
  const game = new GameHarness(); await game.action(`mode:${mode}`);
  await game.action('newRun');
  expect(game.state()).toMatchObject({ mode, menu: '', phase: 'playing', stage: 1, lives: 3 });
  expect(game.text('#topLives')).toBe('3'); expect(game.text('#topShield')).toBe('100');
  expect(document.querySelector<HTMLElement>('#survivalStats')!.hidden).toBe(false);
  expect(document.querySelector<HTMLElement>('#topDamageStat')!.hidden).toBe(mode !== 'smuggler');
  if (mode === 'invaders') expect(document.querySelector<HTMLElement>('.bottom-strip > div:first-child')!.hidden).toBe(true);
  expect(document.pointerLockElement).not.toBeNull();
  game.debug.giveScore(1234);
  await game.action('pause'); await game.action('title'); await game.action('resumeRun');
  expect(game.state()).toMatchObject({ menu: '', score: 1234 });
  await game.action('pause'); await game.action('title'); await game.action('newRun');
  expect(game.state()).toMatchObject({ menu: '', score: 0, lives: 3 });
  if (mode === 'invaders') game.step(1.2);
  for (let i = 0; i < 3; i++) { game.debug.forcePlayerDeath(); game.step(i < 2 ? 4.1 : 0); }
  expect(game.state().menu).toBe('gameover');
  await game.action('relaunch'); expect(game.state()).toMatchObject({ menu: '', lives: 3, score: 0, continued: true });
});

it.each(GAME_MODES)('%s instructions describe the selected mode without creating or changing a checkpoint', async mode => {
  const game = new GameHarness(); await game.action(`mode:${mode}`);
  const before = game.debug.getProfile(); await game.action('instructions');
  expect(screen.getByRole('region', { name: `${MODE_INFO[mode].name} instructions` })).toBeTruthy();
  expect(game.state().mode).toBeUndefined(); expect(game.debug.getProfile()).toEqual(before);
  expect(screen.getByRole('tab', { name: 'INSTRUCTIONS', selected: true })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Info Deck' })).toBeNull();
  await game.action('controls'); await game.action('scores'); await game.action('objects'); await game.action('instructions');
  expect(game.state().menu).toBe('title'); expect(game.debug.getProfile()).toEqual(before);
});

it('switches panels in place, preserving the preview, loadout, controls and Info Deck entry', async () => {
  const profile = freshProfile(); profile.unlocked = [...FAMILIES];
  localStorage.setItem(SAVE_V2, JSON.stringify(profile));
  const game = new GameHarness(); await game.action('startFamily:spread');
  const modeChoices = screen.getByRole('group', { name: 'Game mode' });
  const preview = document.querySelector('#modeDemo canvas');
  const loadout = screen.getByRole('button', { name: 'SPREAD' });
  const before = game.debug.getProfile();
  await game.action('controls');
  const settings = screen.getByRole('slider', { name: 'MOUSE SENSITIVITY' });
  const controls = screen.getByRole('tabpanel', { name: 'CONTROLS' });
  await game.action('objects'); await game.action('scanNext');
  const entry = game.text('#modelTitle');
  await game.action('scores'); await game.action('instructions'); await game.action('objects');
  expect(game.text('#modelTitle')).toBe(entry);
  await game.action('controls');
  expect(screen.getByRole('slider', { name: 'MOUSE SENSITIVITY' })).toBe(settings);
  expect(screen.getByRole('tabpanel', { name: 'CONTROLS' })).toBe(controls);
  await game.action('game');
  expect(document.querySelector('#modeDemo canvas')).toBe(preview);
  expect(screen.getByRole('group', { name: 'Game mode' })).toBe(modeChoices);
  expect(screen.getByRole('button', { name: 'SPREAD' })).toBe(loadout);
  expect(loadout.getAttribute('aria-pressed')).toBe('true');
  expect(game.debug.getProfile()).toEqual(before);
  expect(game.state().mode).toBeUndefined();
});

it('updates the selected information panel when changing modes and retains title control settings', async () => {
  const game = new GameHarness(); await game.action('scores'); await game.action('mode:tunnels');
  expect(screen.getByRole('tab', { name: 'HIGH SCORES', selected: true })).toBeTruthy();
  expect(screen.getByRole('table', { name: 'TEMPESTUOUS TUNNELS high scores' })).toBeTruthy();
  await game.action('instructions'); await game.action('mode:invaders');
  expect(screen.getByRole('region', { name: 'DEFENSIVE POSITION instructions' })).toBeTruthy();
  await game.action('controls'); await game.action('mute'); await game.action('assist');
  await game.action('controls:touch');
  expect(screen.getByRole('tab', { name: 'CONTROLS', selected: true })).toBeTruthy();
  expect(screen.getByRole('slider', { name: 'TILT SENSITIVITY' })).toBeTruthy();
  await game.action('game'); await game.action('controls');
  expect(game.debug.getProfile().settings).toMatchObject({ muted: true, aimAssist: false, controlScheme: 'touch' });
  expect(document.querySelectorAll('#tiltSensitivity')).toHaveLength(1);
  await game.action('game'); await game.action('newRun'); await game.action('pause'); await game.action('controls');
  expect(game.state().menu).toBe('controls');
  expect(document.querySelectorAll('#tiltSensitivity')).toHaveLength(1);
  expect(screen.queryByRole('tablist')).toBeNull();
});

it('Escape from in-game Controls goes back to Pause without resuming or advancing the flight', async () => {
  const game = new GameHarness(), user = userEvent.setup(); await game.start('tunnels');
  await user.keyboard('{Escape}'); expect(game.state().menu).toBe('pause');
  await game.action('controls');
  await user.keyboard('{Escape}'); expect(game.state().menu).toBe('pause'); expect(game.state().paused).toBe(true);
  const before = game.state().tunnel; game.step(5); expect(game.state().tunnel).toEqual(before);
  await game.action('unpause'); expect(game.state().menu).toBe('');
});

it('changes selected mode details above the preview and weapon details below it', async () => {
  const profile = freshProfile(); profile.unlocked = [...FAMILIES]; localStorage.setItem(SAVE_V2, JSON.stringify(profile));
  const game = new GameHarness();
  for (const mode of GAME_MODES) {
    await game.action(`mode:${mode}`);
    expect(screen.getByText('GAME MODES')).toBeTruthy();
    const preview = screen.getByRole('region', { name: 'Selected mode preview' });
    expect(within(preview).getByRole('heading', { name: MODE_INFO[mode].name })).toBeTruthy();
    expect(within(preview).getByText(MODE_INFO[mode].summary)).toBeTruthy();
    expect(within(preview).getByText(MODE_INFO[mode].detail)).toBeTruthy();
    for (const family of FAMILIES) {
      await game.action(`startFamily:${family}`);
      expect(within(screen.getByRole('tabpanel', { name: 'GAME' })).getByText((mode === 'tunnels' ? TUNNEL_WEAPON_HELP : WEAPON_HELP)[family])).toBeTruthy();
      expect(game.text('#screenContent')).not.toContain(WEAPON_HELP[family]);
    }
    expect(document.querySelector('#modePreviewCopy')!.nextElementSibling?.id).toBe('modeDemo');
  }
});

it.each(GAME_MODES)('%s records initials from the real end screen and preserves them through title, reload and continue', async mode => {
  const game = new GameHarness(); await game.start(mode); game.debug.giveScore(1234);
  for (let i = 0; i < 3; i++) { game.debug.forcePlayerDeath(); game.step(i < 2 ? 4.1 : 0); }
  expect(game.state().menu).toBe('gameover');
  expect(within(screen.getByRole('table', { name: `${MODE_INFO[mode].name} high scores` })).getByText('1234')).toBeTruthy();
  const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'YOUR INITIALS' });
  expect(document.activeElement).toBe(input);
  const user = userEvent.setup();
  await user.type(input, 'jz'); await user.click(screen.getByRole('button', { name: 'SAVE' }));
  expect(game.state().menu).toBe('gameover'); expect(game.debug.getProfile().scoreboards[mode][0].initials).toBeUndefined();
  await user.type(input, 'a'); await user.keyboard('{Enter}');
  expect(game.text('.score-saved')).toContain('JZA'); expect(game.state().score).toBe(1234);
  expect(within(screen.getByRole('table')).getByText('JZA')).toBeTruthy();
  await user.keyboard('{Escape}'); expect(game.state().menu).toBe('title'); await game.action('scores');
  expect(game.text('.score-table')).toContain('JZA');
  const reloaded = new GameHarness(); await reloaded.action(`mode:${mode}`); await reloaded.action('resumeRun');
  expect(screen.queryByRole('textbox', { name: 'YOUR INITIALS' })).toBeNull();
  expect(game.text('.score-saved')).toContain('JZA');
  await reloaded.action('relaunch'); expect(reloaded.state().score).toBe(0);
  expect(reloaded.debug.getProfile().scoreboards[mode][0].initials).toBe('JZA');
});

it('resuming an unnamed qualifying score offers mouse submission without duplicating the entry', async () => {
  const profile = freshProfile(), run = newRun('journey', 4);
  run.phase = 'gameover'; run.lives = 0; run.pilot.score = 1200; recordRun(profile, run); saveCheckpoint(profile, run);
  localStorage.setItem(SAVE_V2, JSON.stringify(profile));
  const game = new GameHarness(); await game.action('resumeRun');
  const user = userEvent.setup(); await user.type(screen.getByRole('textbox', { name: 'YOUR INITIALS' }), 'ace');
  await user.click(screen.getByRole('button', { name: 'SAVE' }));
  expect(game.debug.getProfile().scoreboards.journey).toHaveLength(1);
  expect(game.text('.score-saved')).toContain('ACE');
});

it('Escape from unfinished Game Over initials returns to title without submitting or losing the checkpoint', async () => {
  const profile = freshProfile(), run = newRun('invaders', 4);
  run.phase = 'gameover'; run.lives = 0; run.pilot.score = 1200; recordRun(profile, run); saveCheckpoint(profile, run);
  localStorage.setItem(SAVE_V2, JSON.stringify(profile));
  const game = new GameHarness(), user = userEvent.setup();
  await game.action('mode:invaders'); await game.action('resumeRun');
  await user.type(screen.getByRole('textbox', { name: 'YOUR INITIALS' }), 'a');
  await user.keyboard('{Escape}'); expect(game.state().menu).toBe('title');
  expect(game.debug.getProfile().scoreboards.invaders[0].initials).toBeUndefined();
  await game.action('resumeRun'); expect(game.state().menu).toBe('gameover');
  expect(game.text('#finalScore')).toBe('1,200');
  await game.action('relaunch'); expect(game.state().score).toBe(0); expect(game.state().lives).toBe(3);
});
