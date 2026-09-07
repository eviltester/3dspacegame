import { expect, it } from 'vitest';
import { GameHarness } from './fixtures/game';
import { WEAPON_HELP } from '../../src/weapons';
import { LEVEL_WARP_KEY } from '../../src/level-warp';
import { SAVE_V2 } from '../../src/arcade';

// Check adapters, not whole flights. Rules and edge cases belong beside their
// controllers; these cases only verify that the application calls them.
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

it('respawning does not release held fire or native-input ownership', async () => {
  const game = new GameHarness(); await game.start('invaders');
  document.querySelector('#viewport canvas')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  game.step(1 / 60); const shots = game.state().stats.shots;
  game.debug.forcePlayerDeath(); game.step(0.8);
  expect(game.state().stats.shots).toBeGreaterThan(shots); expect(game.state().menu).toBe('');
  expect(document.pointerLockElement).toBe(document.querySelector('#viewport canvas'));
});

it('ship kills pay and remove the actor before any destruction animation ticks', async () => {
  const game = new GameHarness(); await game.start(); game.step(1 / 60);
  const before = game.state(), pirate = before.actors.find(actor => actor.kind === 'pirate')!;
  game.debug.hitActor(pirate.id, 10000);
  expect(game.state().score).toBeGreaterThan(before.score!);
  expect(game.state().actors.some(actor => actor.id === pirate.id)).toBe(false);
  expect(game.state().destruction.panels).toBeGreaterThan(0); expect(game.state().destruction.bursts).toBe(0);
});

it('a collected core updates the displayed equipped tier and weapon help', async () => {
  const game = new GameHarness(); await game.start();
  expect(game.state().weaponLevel).toBe(1);
  game.debug.grantCargo('weaponCore'); game.step(1 / 60);
  expect(game.state().weaponLevel).toBe(2);
  expect(game.text('#weaponReadout')).toBe('PULSE 2');
  expect(document.querySelector<HTMLElement>('#weaponReadout')!.title).toBe(WEAPON_HELP.pulse);
});

it('weapon selection is wired to the displayed loadout without resetting its cooldown', async () => {
  const game = new GameHarness(); await game.start('invaders');
  document.querySelector('#viewport canvas')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  game.step(1 / 60); const cooldown = game.state().weaponCooldown;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }));
  expect(game.text('#weaponReadout')).toContain('SPREAD'); expect(game.state().weaponCooldown).toBe(cooldown);
});

it('a practice destination cannot overwrite a normal checkpoint through the save adapter', async () => {
  sessionStorage.setItem(LEVEL_WARP_KEY, 'unlocked');
  const game = new GameHarness(); await game.start(); await game.action('pause'); await game.action('title');
  const saved = localStorage.getItem(SAVE_V2);
  await game.action('levelWarp');
  document.querySelector<HTMLSelectElement>('#warpStage')!.value = '99';
  await game.action('warpJourney'); game.debug.persist();
  expect(game.state().practice).toBe(true); expect(localStorage.getItem(SAVE_V2)).toBe(saved);
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
