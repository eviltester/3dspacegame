import { expect, it } from 'vitest';
import { screen, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { GameHarness } from './fixtures/game';
import { FAMILIES, freshProfile, newRun, recordRun, SAVE_V2, saveCheckpoint } from '../../src/arcade';
import { GAME_MODES, MODE_INFO } from '../../src/modes';
import { WEAPON_HELP } from '../../src/weapons';
import { TUNNEL_WEAPON_HELP } from '../../src/tunnels/menus';

it.each(['controls', 'objects', 'scores'])('Escape returns from %s to the title without starting a run', async menu => {
  const game = new GameHarness(), user = userEvent.setup(); await game.action(menu);
  await user.keyboard('{Escape}');
  expect(game.state().menu).toBe('title'); expect(game.state().mode).toBeUndefined();
});

it.each(GAME_MODES)('Escape leaves the %s start screen with a resumable checkpoint', async mode => {
  const game = new GameHarness(), user = userEvent.setup();
  await game.action(`mode:${mode}`); await game.action('newRun');
  expect(game.state().menu).toBe('briefing');
  await user.keyboard('{Escape}'); expect(game.state().menu).toBe('title');
  expect(game.debug.getProfile().checkpoints[mode]?.stage).toBe(1);
  expect(document.pointerLockElement).toBeNull();
  await game.action('resumeRun'); expect(game.state().menu).toBe('briefing');
  await game.action('launch'); expect(game.state().menu).toBe(''); expect(game.state().mode).toBe(mode);
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
      expect(within(preview).getByText((mode === 'tunnels' ? TUNNEL_WEAPON_HELP : WEAPON_HELP)[family])).toBeTruthy();
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
