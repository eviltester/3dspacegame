import { expect, it, vi } from 'vitest';
import { GameHarness } from './fixtures/game';
import { WEAPON_HELP } from '../../src/weapons';
import { LEVEL_WARP_KEY } from '../../src/level-warp';
import { SAVE_V2 } from '../../src/arcade';
import { ShotAccuracy } from '../../src/combat/accuracy';
import { BonusController } from '../../src/bonus';
import * as radar from '../../src/radar';

// Check adapters, not whole flights. Rules and edge cases belong beside their
// controllers; these cases only verify that the application calls them.
it.each(['journey', 'endless', 'invaders', 'smuggler'] as const)('%s consumes touch steering, fire and weapon selection without pointer lock', async mode => {
  const game = new GameHarness();
  await game.action('controls'); await game.action('controls:touch'); await game.action('title'); await game.start(mode);
  const input = game.app.input.mobile.gestures;
  expect(document.pointerLockElement).toBeNull();
  const before = game.state(); input.down(1, 'left', 0, 0, 0); input.move(1, 30, 10, true);
  vi.spyOn(performance, 'now').mockReturnValue(300); game.step(1 / 60);
  const fired = game.state();
  expect(mode === 'smuggler' ? fired.bonus?.shotsFired : fired.stats.shots).toBeGreaterThan(0);
  expect(mode === 'invaders' ? fired.position : mode === 'smuggler' ? fired.view.position : fired.orientation)
    .not.toEqual(mode === 'invaders' ? before.position : mode === 'smuggler' ? before.view.position : before.orientation);
  input.up(1, 310);
  input.down(2, 'right', 100, 0, 320); input.up(2, 340); input.down(3, 'right', 100, 0, 350); input.up(3, 370);
  vi.spyOn(performance, 'now').mockReturnValue(380); game.step(1 / 60);
  expect(game.text('#weaponReadout')).toContain('SPREAD');
  await game.action('pause'); const paused = game.state().elapsed;
  game.step(1); expect(game.state().elapsed).toBe(paused);
  await game.action('unpause'); expect(game.app.input.consumeFire()).toBe(false);
});
it('Smuggler radar receives live course objects, magnified lanes and the moving skiff camera', async () => {
  const draw = vi.spyOn(radar, 'renderRadar'), game = new GameHarness(); await game.start('smuggler');
  game.step(0.05);
  const [, contacts, position, orientation, view] = draw.mock.lastCall!;
  expect(contacts.some(contact => contact.glyph === 'rock')).toBe(true);
  expect(contacts.some(contact => contact.glyph === 'cargo')).toBe(true);
  expect(contacts.some(contact => contact.glyph === 'gate')).toBe(true);
  expect(position.toArray()).toEqual(game.state().view.position);
  expect(orientation.toArray()).toEqual(game.state().view.orientation);
  expect(view).toEqual(radar.COURSE_RADAR_VIEW);
  expect(position.z).toBeLessThan(0);
});
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

it('saving and respawning a Smuggler flight retain the displayed score without adding it twice', async () => {
  const game = new GameHarness(); await game.start('smuggler');
  game.debug.giveScore(1000); game.debug.setBonusPoints(8); game.step(0);
  expect(game.text('#arcadeScore')).toBe('001200');
  await game.action('pause'); game.debug.persist(); game.debug.persist();
  expect(game.debug.getProfile().checkpoints.smuggler?.pilot.score).toBe(1200);
  expect(game.state().score).toBe(1000);
  await game.action('unpause'); game.debug.forcePlayerDeath(); game.step(1 / 60);
  expect(game.state().lives).toBe(2); expect(game.state().score).toBe(1200);
  expect(game.text('#arcadeScore')).toBe('001200');
  game.debug.persist(); expect(game.debug.getProfile().checkpoints.smuggler?.pilot.score).toBe(1200);
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

it('Invaders passes the remaining live alien count to every bolt in a Spread volley', async () => {
  const game = new GameHarness(); await game.start('invaders'); game.step(1 / 60);
  const alien = game.state().actors.find(actor => actor.kind === 'pirate')!;
  game.debug.hitActor(alien.id, 10000, false);
  expect(game.state().hostileCount).toBe(7);
  const begin = vi.spyOn(ShotAccuracy.prototype, 'begin');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }));
  document.querySelector('#viewport canvas')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  game.step(1 / 60);
  expect(begin.mock.calls.map(([, , aliens]) => aliens)).toEqual([7, 7, 7]);
  expect(game.state().accuracy?.shots).toBe(3);
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

it('Smuggler shows score and lives for three seconds, preserves mouse ownership, then starts the next leg', async () => {
  const game = new GameHarness(); await game.start('smuggler');
  game.debug.setBonusPoints(40); game.debug.finishBonus('complete'); game.step(0);
  const score = game.state().score;
  expect(game.state().menu).toBe(''); expect(game.state().phase).toBe('cleared');
  expect(game.text('#courseScore')).toBe('SCORE 2300'); expect(game.text('#courseLives')).toBe('LIVES 3');
  expect(document.querySelector<HTMLElement>('#courseSummary')!.hidden).toBe(false);
  expect(document.pointerLockElement).toBe(document.querySelector('#viewport canvas'));
  game.step(1); await game.action('pause'); game.step(10); expect(game.state().stage).toBe(1);
  await game.action('unpause'); game.step(1.5); expect(game.state().stage).toBe(1);
  game.step(0.6); expect(game.state().stage).toBe(2); expect(game.state().bonus?.kind).toBe('canyon');
  expect(game.state().phase).toBe('playing'); expect(game.state().menu).toBe(''); expect(game.state().score).toBe(score);
  expect(document.querySelector<HTMLElement>('#courseSummary')!.hidden).toBe(true);
  expect(document.pointerLockElement).toBe(document.querySelector('#viewport canvas'));
  game.debug.finishBonus('complete'); game.step(3.1); expect(game.state().stage).toBe(3); expect(game.state().bonus?.kind).toBe('asteroids');
});

it('Save and Title preserves a live haul, and a paid summary resumes without paying twice', async () => {
  const game = new GameHarness(); await game.start('smuggler'); game.debug.setBonusPoints(8);
  await game.action('pause'); await game.action('title');
  expect(game.debug.getProfile().checkpoints.smuggler?.pilot.score).toBe(200);
  await game.action('resumeRun'); await game.action('launch');
  expect(game.state().score).toBe(200); game.debug.finishBonus('complete'); const paid = game.state().score;
  await game.action('pause'); await game.action('title'); await game.action('resumeRun');
  game.step(3.1); expect(game.state().stage).toBe(2); expect(game.state().menu).toBe(''); expect(game.state().score).toBe(paid);
});

it('canyon cargo, shields and the paid haul breakdown reach the HUD through the real course adapter', async () => {
  const step = vi.spyOn(BonusController.prototype, 'step');
  const game = new GameHarness(); await game.start('smuggler'); game.debug.setStage(2); await game.action('launch'); game.step(1 / 60);
  const course = step.mock.contexts.at(-1)!;
  if (!(course instanceof BonusController)) throw new Error('Expected the active canyon controller');
  // Arrange collected cargo/vitals here; collision and drop rules are unit-tested.
  course.state.haul = 2; course.state.shield = 40; game.step(0);
  expect(game.text('#cargoReadout')).toBe('HAUL 2 / +150 AT EXIT'); expect(game.text('#shieldReadout')).toBe('40 / 100');
  expect(game.state().score).toBe(0);
  game.debug.finishBonus('complete'); game.step(0);
  expect(game.text('#courseHaul')).toBe('HAUL 2 x 75 = +150'); expect(game.text('#courseScore')).toBe('SCORE 1450');
  expect(game.debug.getProfile().checkpoints.smuggler?.stageHaul).toBe(2);
  game.step(3.1); expect(game.state().stage).toBe(3); expect(game.state().score).toBe(1450);
});
