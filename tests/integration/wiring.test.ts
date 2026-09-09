import { expect, it, vi } from 'vitest';
import { GameHarness } from './fixtures/game';
import { WEAPON_HELP } from '../../src/weapons';
import { LEVEL_WARP_KEY } from '../../src/level-warp';
import { SAVE_V2, freshProfile } from '../../src/arcade';
import { ShotAccuracy } from '../../src/combat/accuracy';
import { EnemySystem } from '../../src/combat/enemies';
import { ProjectileSystem } from '../../src/combat/projectiles';
import { BonusController } from '../../src/bonus';
import * as radar from '../../src/radar';

// Check adapters, not whole flights. Rules and edge cases belong beside their
// controllers; these cases only verify that the application calls them.
it.each([1, 2])('stage %s retains a visual-only course during the restart countdown and disposes it on respawn', async stage => {
  const step = vi.spyOn(BonusController.prototype, 'step');
  const game = new GameHarness(); await game.start('smuggler');
  if (stage === 2) game.debug.setStage(2);
  game.step(1 / 60);
  const course = step.mock.contexts.at(-1)!;
  if (!(course instanceof BonusController)) throw new Error('Expected active course');
  const scene = course.root.parent;
  game.debug.setBonusPoints(8); game.debug.forcePlayerDeath(); game.step(0);
  const score = game.state().score, position = game.state().view.position;
  const frozen = structuredClone(course.state);
  expect(course.root.parent).toBe(scene); expect(game.state().bonus).toBeUndefined();
  expect(game.text('#lifeLostCountdown')).toBe('RESTART IN 4 SECONDS');
  game.app.input.firing = true; game.debug.blast(); game.debug.damagePlayer(1000); game.step(1);
  expect(game.state().view.position).not.toEqual(position); expect(game.state().score).toBe(score);
  expect(course.state).toEqual(frozen); expect(game.state().lives).toBe(2);
  expect(game.text('#lifeLostCountdown')).toBe('RESTART IN 3 SECONDS');
  await game.action('pause'); const paused = game.state().view.position; game.step(20);
  expect(game.state().view.position).toEqual(paused); expect(game.state().respawn.delay).toBeCloseTo(3);
  game.debug.persist(); expect(game.debug.getProfile().checkpoints.smuggler?.pilot.score).toBe(score);
  await game.action('unpause'); game.step(3);
  expect(game.state().bonus?.finished).toBe(false); expect(game.state().respawn.protection).toBeGreaterThan(2.9);
  expect(course.root.parent).toBeNull(); expect(course.root.children).toHaveLength(0);
});
it('leaving a life-lost countdown disposes its scenery without paying the flight again', async () => {
  const step = vi.spyOn(BonusController.prototype, 'step');
  const game = new GameHarness(); await game.start('smuggler'); game.step(1 / 60);
  const course = step.mock.contexts.at(-1)!;
  if (!(course instanceof BonusController)) throw new Error('Expected active course');
  game.debug.setBonusPoints(8); game.debug.forcePlayerDeath(); await game.action('pause'); await game.action('title');
  expect(course.root.parent).toBeNull(); expect(course.root.children).toHaveLength(0);
  await game.action('resumeRun');
  expect(game.state().score).toBe(200); expect(game.state().lives).toBe(2);
});
it('pausing a Smuggler life-loss delay does not create a new course before respawn', async () => {
  const game = new GameHarness(); await game.start('smuggler'); game.debug.forcePlayerDeath(); game.step(1);
  await game.action('pause'); game.step(20); expect(game.state().bonus).toBeUndefined();
  await game.action('unpause'); expect(game.state().bonus).toBeUndefined();
  game.step(2.9); expect(game.state().bonus).toBeUndefined();
  game.step(0.1); expect(game.state().bonus?.health).toBe(1); expect(game.state().lives).toBe(2);
});
it('a missed Smuggler exit shows both penalties, then advances without spending a life', async () => {
  const game = new GameHarness(); await game.start('smuggler');
  game.state().bonus!.haul = 4; game.debug.finishBonus('gateMissed'); game.step(0);
  expect(game.text('#courseAwards')).toContain('MISSED GATE PENALTY -2000');
  expect(game.text('#courseAwards')).toContain('LOST CARGO PENALTY -2000'); expect(game.text('#courseHaul')).toBe('HAUL 4 LOST / +0');
  expect(game.state().lives).toBeGreaterThanOrEqual(3);
  game.step(3.1); expect(game.state().stage).toBe(2); expect(game.state().bonus?.kind).toBe('canyon');
});
it('Smuggler passes live skiff condition through both course handoffs, pause, save and respawn', async () => {
  const game = new GameHarness(); await game.start('smuggler');
  Object.assign(game.state().bonus!, { health: 1, shield: 40, damage: 60 });
  game.debug.finishBonus('complete'); game.step(3.05);
  expect(game.state().bonus).toMatchObject({ kind: 'canyon', health: 1, shield: 40, damage: 60 });
  await game.action('pause'); const remaining = game.state().bonus!.remaining;
  game.step(5); expect(game.state().bonus!.remaining).toBe(remaining);
  game.debug.persist(); expect(game.debug.getProfile().checkpoints.smuggler?.skiff).toEqual({ health: 1, shield: 40, damage: 60 });
  await game.action('unpause'); game.debug.finishBonus('complete'); game.step(3.05);
  expect(game.state().bonus).toMatchObject({ kind: 'asteroids', health: 1, shield: 40, damage: 60 });
  game.debug.forcePlayerDeath(); game.step(3.9);
  expect(game.state().bonus).toBeUndefined(); expect(game.text('#lifeLostLives')).toContain('LIVES LEFT');
  game.step(0.1);
  expect(game.state().bonus).toMatchObject({ health: 1, shield: 100, damage: 0 });
});
it('saved mouse sensitivity initializes flight input and the control slider changes it immediately', async () => {
  const game = new GameHarness(); await game.action('controls');
  const slider = document.querySelector<HTMLInputElement>('#mouseSensitivity')!;
  slider.value = '1.7'; slider.dispatchEvent(new Event('input', { bubbles: true }));
  expect(game.app.input.mouseSensitivity).toBe(1.7);
  expect(game.text('#mouseValue')).toBe('1.7x');
  const reloaded = new GameHarness(); expect(reloaded.app.input.mouseSensitivity).toBe(1.7);
});
it.each(['mouse', 'wasd', 'arrows'] as const)('saved %s preference enables mouse, WASD and arrow movement together in Defensive Position', async scheme => {
  const profile = freshProfile(); profile.settings.controlScheme = scheme;
  localStorage.setItem(SAVE_V2, JSON.stringify(profile));
  const game = new GameHarness(); await game.action('controls');
  expect(document.querySelectorAll('.control-select button')).toHaveLength(2);
  expect(document.querySelector('[data-action="controls:mouse"]')?.getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('#mouseSensitivity')).not.toBeNull();
  await game.action('game'); await game.start('invaders');
  const throttle = game.state().throttle;
  for (const code of ['KeyD', 'ArrowRight']) {
    const before = game.state().position[0];
    window.dispatchEvent(new KeyboardEvent('keydown', { code })); game.step(1 / 60);
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    expect(game.state().position[0]).toBeGreaterThan(before);
  }
  const before = game.state().position[0];
  window.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: -10, movementY: 0 })); game.step(1 / 60);
  expect(game.state().position[0]).toBeLessThan(before);
  expect(game.state().throttle).toBe(throttle);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
  await game.action('pause'); await game.action('unpause');
  const pausedPosition = game.state().position; game.step(1 / 60);
  expect(game.state().position).toEqual(pausedPosition);
});
it('held boost reaches the asteroid and canyon controllers and release returns toward automatic speed', async () => {
  const game = new GameHarness(); await game.start('smuggler');
  for (const kind of ['asteroids', 'canyon']) {
    expect(game.state().bonus?.kind).toBe(kind);
    game.app.input.setBoostHeld(true); game.step(0.8);
    const boosted = game.state().bonusAsteroids?.speed ?? game.state().bonusCourse!.speed;
    expect(boosted).toBeGreaterThan(72);
    game.app.input.setBoostHeld(false); game.step(0.1);
    expect(game.state().bonusAsteroids?.speed ?? game.state().bonusCourse!.speed).toBeLessThan(boosted);
    if (kind === 'asteroids') { game.debug.finishBonus('complete'); game.step(3.05); }
  }
});
it.each([
  [1, false], [1, true], [2, false], [2, true]
])('Smuggler stage %s plays a thud for a missed shot, including partial hits (%s)', async (stage, partialHit) => {
  const game = new GameHarness(); await game.start('smuggler');
  if (stage === 2) game.debug.setStage(2);
  const cue = vi.spyOn(game.app.sound, 'cue');
  vi.spyOn(BonusController.prototype, 'shoot').mockImplementation(function (this: BonusController) {
    this.state.notice = 'SHOT MISSED -50'; this.sounds.cue('miss'); return !!partialHit;
  });
  game.app.input.firing = true; game.step(1 / 60); game.app.input.firing = false;
  game.step(1 / 60);
  expect(cue).toHaveBeenCalledExactlyOnceWith('miss');
  expect(game.text('#messageLog')).toContain('SHOT MISSED -50');
});
it('log text alone cannot accidentally play a warning or reward', async () => {
  const game = new GameHarness(); await game.start('smuggler');
  const cue = vi.spyOn(game.app.sound, 'cue');
  game.state().bonus!.notice = 'SHIELDS DOWN'; game.step(1 / 60);
  expect(cue).not.toHaveBeenCalled();
});
it('course feedback reaches playback once, preserving simultaneous voices and independent cues', async () => {
  const game = new GameHarness(); await game.start('smuggler');
  const cue = vi.spyOn(game.app.sound, 'cue'), fire = vi.spyOn(game.app.sound, 'enemyShoot');
  vi.spyOn(BonusController.prototype, 'shoot').mockImplementationOnce(function (this: BonusController) {
    this.sounds.fire('police', 120); this.sounds.fire('pirate', 200); this.sounds.fire('canyonGun', 80);
    this.sounds.cue('pickup'); this.sounds.cue('score'); this.sounds.cue('penaltyCleared');
    this.state.notice = 'ANY DISPLAY WORDING'; return true;
  });
  game.app.input.firing = true; game.step(1 / 60); game.app.input.firing = false; game.step(1 / 60);
  expect(fire.mock.calls).toEqual([['police', 120], ['pirate', 200], ['canyonGun', 80]]);
  expect(cue.mock.calls).toEqual([['pickup'], ['score'], ['penaltyCleared']]);
});
it('weapon switching and Defensive Position extra lives never use the pickup chime', async () => {
  const game = new GameHarness(); await game.start('invaders');
  const cue = vi.spyOn(game.app.sound, 'cue');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }));
  expect(cue).toHaveBeenCalledExactlyOnceWith('weaponSwitch'); cue.mockClear();
  game.debug.giveScore(35000);
  expect(cue).toHaveBeenCalledExactlyOnceWith('extraLife'); cue.mockClear();
  game.debug.giveScore(1); expect(cue).not.toHaveBeenCalled();
});
it('Defensive Position empty shields lose a life on the next hit, with shield pickups and protected live respawn', async () => {
  // Exercise the life/HUD adapter with controlled hits, not autonomous enemy fire.
  vi.spyOn(EnemySystem.prototype, 'update').mockReturnValue(null);
  const game = new GameHarness(); await game.start('invaders'); game.step(3);
  game.debug.giveScore(1234);
  for (const shield of [66, 32, 0]) {
    game.debug.damagePlayer(10); game.step(0);
    expect(game.state()).toMatchObject({ shield, lives: 3 });
    expect(game.text('#topShield')).toBe(String(shield)); game.step(0.3);
  }
  expect(game.state()).toMatchObject({ shield: 0, lives: 3, score: 1234 });
  expect(game.text('#topShield')).toBe('0');
  expect(document.querySelector<HTMLElement>('#survivalStats')!.hidden).toBe(false);
  expect(document.querySelector<HTMLElement>('.bottom-strip > div:nth-child(2)')!.hidden).toBe(true);
  expect(document.querySelector<HTMLElement>('#livesReadout')!.hidden).toBe(true);
  expect(document.querySelector<HTMLElement>('.bottom-strip > div:first-child')!.hidden).toBe(true);
  game.debug.grantCargo('shieldCell'); game.step(0);
  expect(game.state()).toMatchObject({ shield: 30, lives: 3 });
  expect(game.text('#topShield')).toBe('30');
  game.step(0.3); game.debug.damagePlayer(1000);
  expect(game.state()).toMatchObject({ shield: 0, lives: 3 });
  game.step(0.3); game.debug.damagePlayer(1); game.step(4);
  expect(game.state()).toMatchObject({ shield: 100, lives: 2, score: 1249, menu: '', phase: 'playing' });
  expect(game.text('#topLives')).toBe('2');
  expect(game.text('#topShield')).toBe('100');
  expect(game.state().respawn.protection).toBeGreaterThan(2.9);
  game.debug.damagePlayer(1000); expect(game.state().shield).toBe(100);
});
it('Defensive Position shares one wave blast across keyboard and mouse, persists it, and unlocks it on the next wave', async () => {
  const game = new GameHarness(); await game.start('invaders'); game.debug.primeBlast();
  const sound = vi.spyOn(game.app.sound, 'blast');
  const key = (code: string) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  };
  key('KeyX'); game.step(0);
  expect(sound).toHaveBeenCalledOnce(); expect(game.text('#chargeReadout')).toContain('BLAST USED');
  expect(game.debug.getProfile().checkpoints.invaders?.blastUsed).toBe(true);
  game.debug.primeBlast(); key('KeyK');
  document.querySelector('#viewport canvas')!.dispatchEvent(new MouseEvent('mousedown', { button: 2 }));
  game.step(0);
  expect(sound).toHaveBeenCalledOnce(); expect(game.state().charge).toBe(100);
  expect(game.text('#chargeReadout')).toBe('BLAST USED / 100%');
  expect(game.text('#messageLog')).toContain('AVAILABLE NEXT WAVE');
  game.debug.forcePlayerDeath(); game.step(0.02); key('KeyX');
  expect(sound).toHaveBeenCalledOnce();
  await game.action('pause'); await game.action('title'); await game.action('resumeRun');
  game.step(1.2);
  game.debug.primeBlast(); key('KeyK'); expect(sound).toHaveBeenCalledOnce();
  game.debug.finishEncounter(); game.step(0.02); await game.action('nextWave'); game.step(3.6);
  expect(game.state().stage).toBe(2); expect(game.state().charge).toBe(100);
  expect(game.text('#chargeReadout')).toContain('BLAST READY');
  key('KeyX'); expect(sound).toHaveBeenCalledTimes(2);
});
it.each([['KeyJ', 'KeyK'], ['KeyZ', 'KeyX']])('Defensive Position accepts %s fire and %s blast with the default Mouse layout', async (fire, blast) => {
  const game = new GameHarness(); await game.start('invaders');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: fire })); game.step(1 / 60);
  expect(game.state().stats.shots).toBe(1);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: fire }));
  game.debug.primeBlast();
  const sound = vi.spyOn(game.app.sound, 'blast');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: blast }));
  expect(sound).toHaveBeenCalledOnce(); expect(game.state().charge).toBeLessThan(100);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: blast }));
  game.step(1 / 60); expect(game.text('#timeBonusReadout')).toMatch(/^TIME BONUS \+CR /);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: fire }));
  await game.action('pause');
  const shots = game.state().stats.shots; game.debug.primeBlast();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: blast }));
  game.step(1); expect(game.state().stats.shots).toBe(shots); expect(game.state().charge).toBe(100);
  await game.action('unpause'); game.step(0.5);
  expect(game.state().stats.shots).toBe(shots); expect(game.state().charge).toBe(100);
});
it('Smuggler payout and extra life announce independently, without replaying a paid result', async () => {
  const game = new GameHarness(); await game.start('smuggler'); game.debug.giveScore(34999);
  const cue = vi.spyOn(game.app.sound, 'cue');
  game.debug.finishBonus('complete');
  expect(cue.mock.calls).toEqual([['extraLife'], ['bonusPayment']]); cue.mockClear();
  game.debug.finishBonus('complete'); expect(cue).not.toHaveBeenCalled();
});
it('docking cargo sales and shop purchases use transaction audio, with separate gate-bonus payment', async () => {
  const game = new GameHarness(); await game.start(); game.debug.grantCargo('legalCargo', 2);
  game.debug.finishEncounter();
  const cue = vi.spyOn(game.app.sound, 'cue');
  game.debug.reachGate(); game.step(2);
  expect(game.state().menu).toBe('shop');
  expect(cue.mock.calls).toEqual([['bonusPayment'], ['transaction']]); cue.mockClear();
  await game.action('buy:magnet'); expect(cue).toHaveBeenCalledExactlyOnceWith('transaction');
});
it('course shooting reports the charge transition to the ready-sound adapter once', async () => {
  const game = new GameHarness(); await game.start('smuggler');
  const ready = vi.spyOn(game.app.sound, 'recharged');
  vi.spyOn(BonusController.prototype, 'shoot').mockImplementation(function (this: BonusController) { this.state.charge = 100; return true; });
  game.state().bonus!.charge = 95;
  game.app.input.firing = true; game.step(1 / 60);
  expect(ready).toHaveBeenCalledWith(95, 100);
  game.step(0.5);
  expect(ready.mock.calls.filter(([before, after]) => before < 100 && after === 100)).toHaveLength(1);
});
it.each(['journey', 'endless', 'invaders', 'smuggler'] as const)('%s consumes touch steering, fire and weapon selection without pointer lock', async mode => {
  const game = new GameHarness();
  await game.action('controls'); await game.action('controls:touch'); await game.action('game'); await game.start(mode);
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
  game.debug.forcePlayerDeath(); game.step(4);
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
  await game.action('unpause'); game.debug.forcePlayerDeath(); game.step(4.01);
  expect(game.state().lives).toBe(2); expect(game.state().score).toBe(1200);
  expect(game.text('#arcadeScore')).toBe('001200');
  game.debug.persist(); expect(game.debug.getProfile().checkpoints.smuggler?.pilot.score).toBe(1200);
});

it('Defensive Position clears held fire during destruction but retains native-input ownership', async () => {
  const game = new GameHarness(); await game.start('invaders');
  document.querySelector('#viewport canvas')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  game.step(1 / 60); const shots = game.state().stats.shots;
  game.debug.forcePlayerDeath(); game.step(0.8);
  expect(game.state().stats.shots).toBe(shots); expect(game.state().menu).toBe('');
  game.step(3.2);
  document.querySelector('#viewport canvas')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  game.step(1 / 60); expect(game.state().stats.shots).toBeGreaterThan(shots);
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

it('Defensive Position tracks all three Spread bolts independently', async () => {
  const game = new GameHarness(); await game.start('invaders'); game.step(1.6);
  const alien = game.state().actors.find(actor => actor.kind === 'pirate')!;
  game.debug.hitActor(alien.id, 10000, false);
  expect(game.state().hostileCount).toBe(7);
  const begin = vi.spyOn(ShotAccuracy.prototype, 'begin');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }));
  document.querySelector('#viewport canvas')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  game.step(1 / 60);
  expect(begin).toHaveBeenCalledTimes(3);
  expect(new Set(begin.mock.calls.map(([id]) => id)).size).toBe(3);
  expect(begin.mock.calls.map(([, , family]) => family)).toEqual(['spread', 'spread', 'spread']);
  expect(game.state().accuracy?.shots).toBe(3);
});

it('a Lance miss deducts 400 and displays the penalty after switching to Pulse', async () => {
  const updates = vi.spyOn(ProjectileSystem.prototype, 'update');
  const game = new GameHarness(); await game.start('invaders'); game.debug.giveScore(1000);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3' }));
  game.app.input.firing = true; game.step(1 / 60); game.app.input.firing = false;
  const system = updates.mock.contexts.at(-1);
  if (!(system instanceof ProjectileSystem)) throw new Error('Expected the active projectile system');
  const shot = system.shots.find(shot => shot.faction === 'player')!;
  const callbacks = updates.mock.calls.at(-1)![4];
  expect(shot.family).toBe('lance');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));
  // Deliver an expiry to the real scoring adapter; collision timing has unit coverage.
  callbacks.playerExpired!(shot); game.step(0);
  expect(game.state().score).toBe(600); expect(game.text('#scorePopup')).toBe('MISS -400');
  expect(game.state().accuracy).toEqual({ shots: 1, hits: 0, misses: 1 });
  callbacks.playerExpired!(shot); expect(game.state().score).toBe(600);
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

it('a completed Defensive Position wave uses recovery, keeps flight visible and pays once', async () => {
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
  expect(game.text('#courseScore')).toBe(`SCORE ${score}`); expect(game.text('#courseLives')).toBe(`LIVES ${game.state().lives}`);
  expect(game.text('#courseAwards')).toContain('CLEAN FINISH BONUS +3000');
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
  await game.action('resumeRun');
  expect(game.state().score).toBe(200); game.debug.finishBonus('complete'); const paid = game.state().score;
  await game.action('pause'); await game.action('title'); await game.action('resumeRun');
  game.step(3.1); expect(game.state().stage).toBe(2); expect(game.state().menu).toBe(''); expect(game.state().score).toBe(paid);
});

it('canyon cargo, shields and the paid haul breakdown reach the HUD through the real course adapter', async () => {
  const step = vi.spyOn(BonusController.prototype, 'step');
  const game = new GameHarness(); await game.start('smuggler'); game.debug.setStage(2); game.step(1 / 60);
  const course = step.mock.contexts.at(-1)!;
  if (!(course instanceof BonusController)) throw new Error('Expected the active canyon controller');
  // Arrange collected cargo/vitals here; collision and drop rules are unit-tested.
  course.state.haul = 2; course.state.shield = 40; game.step(0);
  expect(game.text('#cargoReadout')).toBe('HAUL 2 / +150 AT EXIT'); expect(game.text('#shieldReadout')).toBe('40 / 100');
  expect(game.state().score).toBe(0);
  game.debug.finishBonus('complete'); game.step(0);
  const score = game.state().score;
  expect(game.text('#courseHaul')).toBe('HAUL 2 x 75 = +150'); expect(game.text('#courseScore')).toBe(`SCORE ${score}`);
  expect(game.debug.getProfile().checkpoints.smuggler?.stageHaul).toBe(2);
  game.step(3.1); expect(game.state().stage).toBe(3); expect(game.state().score).toBe(score);
});
