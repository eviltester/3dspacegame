import { expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { GameHarness } from './fixtures/game';

it('shows only lives and shield in tunnels and restores the damage meter in Smuggler Run', async () => {
  const game = new GameHarness(); await game.start('tunnels'); game.step(0.01);
  expect(document.querySelector<HTMLElement>('#topDamageStat')!.hidden).toBe(true);
  expect(game.text('#topLives')).toBe('3'); expect(game.text('#topShield')).toBe('100');
  expect(game.text('#screenContent')).toContain('the next hit costs one life');
  await game.action('pause'); await game.action('title'); await game.start('smuggler'); game.step(0.01);
  expect(document.querySelector<HTMLElement>('#topDamageStat')!.hidden).toBe(false);
  expect(game.text('#topDamage')).toBe('0');
});

it('selects a mode, starts, opens pause settings and resumes using only arrows and fire keys', async () => {
  const game = new GameHarness(), user = userEvent.setup();
  const selected = () => (document.activeElement as HTMLElement)?.dataset.action;
  expect(selected()).toBe('newRun');
  await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}'); expect(selected()).toBe('mode:tunnels');
  await user.keyboard(' '); expect(game.state().menu).toBe('title');
  await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}'); expect(selected()).toBe('newRun');
  await user.keyboard('{Enter}'); expect(game.state().menu).toBe('briefing');
  await user.keyboard('z'); expect(game.state().menu).toBe(''); expect(game.state().mode).toBe('tunnels');
  game.step(0.1); expect(game.state().accuracy?.shots).toBe(0);
  await user.keyboard('{Escape}'); expect(game.state().menu).toBe('pause');
  await user.keyboard('{ArrowDown}'); expect(selected()).toBe('controls');
  await user.keyboard('j'); expect(game.state().menu).toBe('controls');
  await user.keyboard('{Enter}'); expect(game.state().menu).toBe('pause');
  await user.keyboard('z'); expect(game.state().menu).toBe('');
  game.step(0.1); expect(game.state().accuracy?.shots).toBe(0);
});

it('starts tunnel play, accepts mouse movement/fire, and pauses without advancing or holding fire', async () => {
  const game = new GameHarness(); await game.start('tunnels');
  expect(game.text('#missionBriefTitle')).toBe('DEFEND THE EDGE');
  const canvas = document.querySelector('canvas')!;
  game.debug.lookByMouse(90,500); game.step(0.4);
  expect(game.state().tunnel?.lane).toBeCloseTo(2);
  canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); game.step(0.3);
  expect(game.state().tunnel?.shots.length).toBeGreaterThan(0);
  document.querySelector<HTMLButtonElement>('#pauseButton')!.click();
  const saved = game.state().tunnel; game.step(10); expect(game.state().tunnel).toEqual(saved);
  expect(game.state().menu).toBe('pause'); await game.action('unpause');
  const fired = game.state().accuracy?.shots; game.step(0.5); expect(game.state().accuracy?.shots).toBe(fired);
});

it('keeps life loss in the animated game and continues only after game over', async () => {
  const game = new GameHarness(); await game.start('tunnels'); game.step(1);
  game.debug.giveScore(1234); game.debug.forcePlayerDeath(); game.step(0);
  expect(game.state().menu).toBe(''); expect(game.text('#lifeLostCountdown')).toBe('RESTART IN 4 SECONDS');
  game.step(1); expect(game.text('#lifeLostCountdown')).toBe('RESTART IN 3 SECONDS');
  game.step(3); expect(game.state().tunnel?.respawn).toBe(0); expect(game.state().tunnel?.protection).toBeGreaterThan(2.9);
  expect(game.state().score).toBe(1234); expect(game.state().lives).toBe(2);
  game.debug.forcePlayerDeath(); game.step(4.1); game.debug.forcePlayerDeath(); game.step(0);
  expect(game.state().menu).toBe('gameover'); expect(game.text('#finalScore')).toBe('1,234'); game.step(20); expect(game.state().menu).toBe('gameover');
  await game.action('relaunch'); expect(game.state().score).toBe(0); expect(game.state().lives).toBe(3); expect(game.state().continued).toBe(true);
});

it('automatically progresses after salvage and a paid three-second result, including resume', async () => {
  const game = new GameHarness(); await game.start('tunnels');
  game.debug.finishEncounter(); game.step(0.1); expect(game.state().tunnel?.phase).toBe('salvage');
  game.step(3); expect(game.state().tunnel?.phase).toBe('collapse');
  game.step(3); expect(game.state().tunnel?.phase).toBe('result'); expect(game.text('#courseAwards')).toContain('CLEAR +300');
  const score = game.state().score;
  document.querySelector<HTMLButtonElement>('#pauseButton')!.click(); await game.action('title'); await game.action('resumeRun'); await game.action('launch');
  expect(game.state().score).toBe(score); game.step(3.2);
  expect(game.state().stage).toBe(2); expect(game.state().menu).toBe(''); expect(game.state().phase).toBe('playing'); expect(game.state().score).toBe(score);
});

it('restores a mid-assault snapshot and exposes a separate score screen', async () => {
  const game = new GameHarness(); await game.start('tunnels'); game.step(4); game.debug.lookByMouse(180,0); game.step(0.7);
  const snapshot = game.state().tunnel;
  document.querySelector<HTMLButtonElement>('#pauseButton')!.click(); await game.action('title'); await game.action('resumeRun'); await game.action('launch');
  expect(game.state().tunnel).toEqual(snapshot);
  document.querySelector<HTMLButtonElement>('#pauseButton')!.click(); await game.action('title'); await game.action('scores');
  expect(game.text('#briefingStatus')).toBe('TEMPESTUOUS TUNNELS');
});

it('accepts precise keyboard movement and fire with the default mouse layout', async () => {
  const game = new GameHarness(); await game.start('tunnels');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' })); game.step(0.2);
  expect(game.state().tunnel?.lane).toBe(1);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' })); game.step(0.2);
  expect(game.state().accuracy?.shots).toBeGreaterThan(0);
  document.querySelector<HTMLButtonElement>('#pauseButton')!.click(); await game.action('unpause');
  const fired = game.state().accuracy?.shots; game.step(0.2); expect(game.state().accuracy?.shots).toBe(fired);
});

it('resumes a paused collapse without skipping the result or paying twice', async () => {
  const game = new GameHarness(); await game.start('tunnels'); game.debug.finishEncounter(); game.step(3.5);
  expect(game.state().tunnel?.phase).toBe('collapse'); const remaining = game.state().tunnel?.remaining;
  document.querySelector<HTMLButtonElement>('#pauseButton')!.click(); await game.action('title'); await game.action('resumeRun'); await game.action('launch');
  expect(game.state().tunnel?.remaining).toBe(remaining);
  game.step(2.7); expect(game.state().tunnel?.phase).toBe('result'); expect(game.state().score).toBe(300);
  game.step(3.1); expect(game.state().stage).toBe(2); expect(game.state().score).toBe(300);
});
