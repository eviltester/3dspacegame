import { expect, it, vi } from 'vitest';
import { GameHarness } from './fixtures/game';
import { SoundBank } from '../../src/sound';
import { EnemySystem } from '../../src/combat/enemies';
import { FlightLifecycle } from '../../src/session/flight-lifecycle';

it('explodes a dead ship, blocks controls, warps it in, then restores protected play without losing score or enemies', async () => {
  const explosion = vi.spyOn(SoundBank.prototype, 'explosion'), warp = vi.spyOn(SoundBank.prototype, 'warp');
  const game = new GameHarness(); await game.start('invaders'); game.step(1.3);
  game.debug.giveScore(1234);
  const enemies = game.state().actors.map(a => a.id), score = game.state().score, shots = game.state().stats.shots;
  game.debug.forcePlayerDeath(); game.step(0);
  expect(game.state().respawn.delay).toBe(4); expect(game.state().lives).toBe(2);
  expect(game.text('#lifeLostHeading')).toBe('SHIP DESTROYED'); expect(game.text('#lifeLostLives')).toBe('2 LIVES LEFT');
  expect(document.querySelector<HTMLElement>('#lifeLost')!.hidden).toBe(false);
  expect(explosion).toHaveBeenCalledWith(0); expect(game.state().defensiveDestruction!.panels).toBeGreaterThan(0);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  game.debug.primeBlast(); game.debug.blast(); game.step(1);
  expect(game.state().position).toEqual([0, 0, 0]); expect(game.state().stats.shots).toBe(shots);
  expect(game.state().charge).toBe(100); expect(game.state().defensiveDestruction!.bursts).toBeGreaterThan(0);
  await game.action('pause'); game.step(10); expect(game.state().respawn.delay).toBeCloseTo(3);
  await game.action('unpause'); game.step(1.9);
  expect(document.querySelector<HTMLElement>('#lifeLost')!.hidden).toBe(true); expect(warp).toHaveBeenCalledTimes(2);
  expect(game.state().respawn.pending).toBe('combat');
  game.step(1.1);
  expect(game.state().respawn.pending).toBeNull(); expect(game.state().respawn.protection).toBeCloseTo(3, 1);
  expect(game.state().score).toBe(score); expect(game.state().actors.map(a => a.id)).toEqual(enemies);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' })); game.step(0.1);
  expect(game.state().position[0]).toBeGreaterThan(0);
  game.debug.damagePlayer(10); expect(game.state().shield).toBe(100);
});

it('wave departure/arrival pauses combat and rewards, changes the platform and grants control only after arrival', async () => {
  const game = new GameHarness(); await game.start('invaders'); game.step(1.3);
  game.debug.finishEncounter(); game.step(0);
  const score = game.state().score;
  await game.action('nextWave');
  expect(game.state().defensiveSequence).toBe('departing');
  game.step(0.5); expect(game.state().stage).toBe(1); expect(game.state().score).toBe(score);
  expect(game.state().defensiveDestruction!.panels).toBeGreaterThan(0);
  await game.action('pause'); game.step(20); expect(game.state().stage).toBe(1);
  await game.action('unpause'); game.step(1.9);
  expect(game.state().stage).toBe(2); expect(game.state().defensiveSequence).toBe('arriving');
  expect(game.state().elapsed).toBe(0);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' })); game.step(0.5);
  expect(game.state().position).toEqual([0, 0, 0]); expect(game.state().elapsed).toBe(0);
  game.step(0.7); expect(game.state().defensiveSequence).toBe('idle');
  expect(game.state().respawn.protection).toBeGreaterThan(2.9);
  const platform = game.app.world.getObjectByName('defensive-platform')!;
  expect(platform.visible).toBe(true);
});

it('pays and displays the flat +500 escape bonus once, alongside the ordinary kill reward', async () => {
  vi.spyOn(FlightLifecycle.prototype, 'damage').mockReturnValue({ type: 'ignored' });
  const update = vi.spyOn(EnemySystem.prototype, 'update');
  const game = new GameHarness(); await game.start('invaders'); game.step(4);
  const actors = game.state().actors.filter(a => a.kind === 'pirate');
  for (const actor of actors.slice(1)) game.debug.hitActor(actor.id, 10000, false);
  game.step(4.2);
  const last = update.mock.calls.at(-1)![1].actors().find(a => a.kind === 'pirate')!;
  expect(last.escape!.age).toBeGreaterThan(0.9);
  const score = game.state().score!;
  game.debug.hitActor(last.id, 10000); game.debug.hitActor(last.id, 10000); game.step(0);
  expect(game.state().score).toBe(score + 600); expect(game.text('#scorePopup')).toBe('LAST ALIEN +500 BONUS');
});

it.each(['relaunch', 'title'])('game over animates only scenery, stays silent, and clears the backdrop on %s', async exit => {
  let display: FrameRequestCallback = () => {};
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { display = callback; return 1; });
  const damage = vi.spyOn(FlightLifecycle.prototype, 'damage').mockReturnValue({ type: 'ignored' });
  const ai = vi.spyOn(EnemySystem.prototype, 'update');
  const audio = (['enemyShoot', 'cue', 'shoot', 'explosion', 'shatter', 'gameOver'] as const).map(name => vi.spyOn(SoundBank.prototype, name));
  const game = new GameHarness(); await game.start('invaders'); game.stage(6);
  await Promise.resolve(); await Promise.resolve(); game.step(7); damage.mockRestore();
  const lives = game.state().lives!;
  for (let i = 0; i < lives; i++) { game.debug.forcePlayerDeath(); if (i < lives - 1) game.step(4); }
  expect(game.state().menu).toBe('gameover');
  const background = game.app.scene.getObjectByName('defensive-gameover-backdrop')!;
  expect(background).toBeDefined(); expect(background.children.length).toBeGreaterThan(1);
  expect(game.app.world.visible).toBe(false);
  expect(document.querySelector('.game-shell')!.classList.contains('defensive-gameover')).toBe(true);
  const state = game.state(), profile = game.debug.getProfile(), positions = background.children.map(model => model.position.clone());
  const calls = ai.mock.calls.length; audio.forEach(spy => spy.mockClear());
  for (let frame = 1; frame <= 120; frame++) display(frame * 100);
  expect(background.children.some((model, i) => !model.position.equals(positions[i]))).toBe(true);
  expect(ai).toHaveBeenCalledTimes(calls); audio.forEach(spy => expect(spy).not.toHaveBeenCalled());
  expect(game.debug.getProfile()).toEqual(profile);
  expect(game.state()).toMatchObject({ actors: state.actors, score: state.score, lives: state.lives, elapsed: state.elapsed, shield: state.shield, phase: state.phase, charge: state.charge });
  await game.action(exit);
  expect(game.app.scene.getObjectByName('defensive-gameover-backdrop')).toBeUndefined();
  expect(game.app.world.visible).toBe(true);
  expect(document.querySelector('.game-shell')!.classList.contains('defensive-gameover')).toBe(false);
  expect(game.state().menu).toBe(exit === 'title' ? 'title' : '');
});
