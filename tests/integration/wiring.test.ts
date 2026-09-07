import { expect, it } from 'vitest';
import { GameHarness } from './fixtures/game';
import { WEAPON_HELP } from '../../src/weapons';

// Check adapters, not whole flights. Rules and edge cases belong beside their
// controllers; these four cases only verify that the application calls them.
it('menu actions launch and pause the lifecycle controller', async () => {
  const game = new GameHarness(); await game.start();
  expect(game.state().menu).toBe(''); expect(game.state().phase).toBe('playing');
  await game.action('pause'); const before = game.state().elapsed;
  game.step(1 / 60); expect(game.state().elapsed).toBe(before);
  expect(game.state().menu).toBe('pause');
  await game.action('unpause'); expect(game.state().menu).toBe('');
});

it('fatal damage consumes one queued respawn and projects protection into the HUD', async () => {
  const game = new GameHarness(); await game.start('invaders');
  game.debug.forcePlayerDeath(); game.step(1 / 60);
  const state = game.state();
  expect(state.lives).toBe(2); expect(state.respawn.pending).toBeNull();
  expect(state.menu).toBe(''); expect(state.respawn.protection).toBeGreaterThan(2.9);
  expect(game.text('#hitCallout')).toContain('2 LIVES LEFT / RESPAWN SHIELD');
});

it('a collected core updates the displayed equipped tier and weapon help', async () => {
  const game = new GameHarness(); await game.start();
  expect(game.state().weaponLevel).toBe(1);
  game.debug.grantCargo('weaponCore'); game.step(1 / 60);
  expect(game.state().weaponLevel).toBe(2);
  expect(game.text('#weaponReadout')).toBe('PULSE 2');
  expect(document.querySelector<HTMLElement>('#weaponReadout')!.title).toBe(WEAPON_HELP.pulse);
});

it('a completed Invaders wave uses recovery, keeps flight visible and pays once', async () => {
  const game = new GameHarness(); await game.start('invaders');
  game.debug.finishEncounter(); game.step(1 / 60);
  const state = game.state();
  expect(state.phase).toBe('recovery'); expect(state.menu).toBe('');
  expect(game.text('#messageLog')).toContain('WAVE 1 ACCURACY');
  game.debug.finishEncounter(); game.step(1 / 60);
  expect(game.state().score).toBe(state.score);
});
