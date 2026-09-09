import { expect, it, vi } from 'vitest';
import { GameHarness } from './fixtures/game';
import { SoundBank } from '../../src/sound';
import { FlightLifecycle } from '../../src/session/flight-lifecycle';
import { invaderFieldDuration } from '../../src/invader-events';
import { ProjectileSystem } from '../../src/combat/projectiles';
import { weaponSpec } from '../../src/weapons';
import type * as THREE from 'three';

it('Defensive Position police arrive with a siren and WANTED alert, attack immediately, and pay a hostile kill reward', async () => {
  vi.spyOn(FlightLifecycle.prototype, 'damage').mockReturnValue({ type: 'ignored' });
  const cue = vi.spyOn(SoundBank.prototype, 'cue');
  const game = new GameHarness(); await game.start('invaders'); game.stage(3); game.step(6.1);
  expect(cue).toHaveBeenCalledWith('policeArrival');
  expect(game.state().wanted).toBe(true); expect(game.state().messageLog).toContain('WANTED!');
  game.step(2.4);
  const police = game.state().actors.find(actor => actor.kind === 'police')!; expect(police).toBeDefined();
  expect(game.state().shots.some(shot => shot.faction === 'police' && shot.target === 0)).toBe(true);
  const score = game.state().score!; game.debug.hitActor(police.id, 10000);
  expect(game.state().score).toBe(score + 1000);
});

it('clearing required formations removes an escaped cruiser without requiring its death or paying its reward', async () => {
  vi.spyOn(FlightLifecycle.prototype, 'damage').mockReturnValue({ type: 'ignored' });
  const game = new GameHarness(); await game.start('invaders'); game.stage(5); game.step(6.2);
  const visitor = game.state().actors.find(actor => actor.kind === 'pirate' && actor.role === 'carrier')!;
  expect(visitor).toBeDefined(); const roster = game.state().flights.roster;
  let cleared = 0;
  for (let i = 0; i < 20 && game.state().phase === 'playing'; i++) {
    const required = game.state().actors.filter(actor => actor.kind === 'pirate' && actor.id !== visitor.id);
    for (const actor of required) { game.debug.hitActor(actor.id, 10000, false); cleared++; }
    game.step(0.25);
  }
  expect(cleared).toBe(roster); expect(game.state().phase).toBe('recovery');
  expect(game.state().actors.some(actor => actor.id === visitor.id || actor.kind === 'mine')).toBe(false);
  expect(game.state().stats.kills).toBe(0);
});

it('destroying a cruiser awards its flyby reward exactly once and does not respawn it', async () => {
  vi.spyOn(FlightLifecycle.prototype, 'damage').mockReturnValue({ type: 'ignored' });
  const game = new GameHarness(); await game.start('invaders'); game.stage(5); game.step(6.2);
  const visitor = game.state().actors.find(actor => actor.role === 'carrier')!;
  const before = game.state().score!;
  game.debug.hitActor(visitor.id, 10000); expect(game.state().score).toBe(before + 2000);
  expect(game.state().destruction.panels).toBeGreaterThan(0);
  game.debug.hitActor(visitor.id, 10000); expect(game.state().score).toBe(before + 2000);
  game.step(2); expect(game.state().actors.some(actor => actor.role === 'carrier')).toBe(false);
});

it.each([[3, 'police', 1000], [5, 'carrier', 2000], [2, 'raider', 3000]] as const)('wave %i flyby leaves its %s reward beneath the explosion once', async (wave, role, reward) => {
  vi.spyOn(FlightLifecycle.prototype, 'damage').mockReturnValue({ type: 'ignored' });
  const updates = vi.spyOn(ProjectileSystem.prototype, 'update');
  const game = new GameHarness(); await game.start('invaders'); game.stage(wave); game.step(6.2);
  const visitor = updates.mock.calls.at(-1)![1].find(actor => actor.flyby)!;
  expect(role === 'police' ? visitor.kind : visitor.role).toBe(role);
  const point = visitor.object.position.clone(), before = game.state().score!;
  game.debug.hitActor(visitor.id, 1); expect(game.app.world.getObjectByName('flyby-score')).toBeUndefined();
  game.debug.hitActor(visitor.id, 10000);
  const label = game.app.world.getObjectByName('flyby-score') as THREE.Sprite;
  expect(label).toBeDefined(); expect(label.position).toEqual(point); expect(label.center.y).toBeGreaterThan(1);
  expect(label.userData.score).toBe(reward); expect(game.state().score).toBe(before + reward);
  expect(visitor.dead).toBe(true); game.debug.hitActor(visitor.id, 10000);
  expect(game.app.world.children.filter(object => object.name === 'flyby-score')).toHaveLength(1);
  await game.action('pause'); game.step(3); expect(label.material.opacity).toBe(1);
  await game.action('unpause'); game.step(2.3); expect(game.app.world.getObjectByName('flyby-score')).toBeUndefined();
});

it('a flyby popup shows the multiplied payout, while an escaped or allied kill creates none', async () => {
  vi.spyOn(FlightLifecycle.prototype, 'damage').mockReturnValue({ type: 'ignored' });
  const game = new GameHarness(); await game.start('invaders'); game.stage(5); game.step(6.2);
  const visitor = game.state().actors.find(actor => actor.role === 'carrier')!;
  for (const actor of game.state().actors.filter(actor => actor.kind === 'pirate' && actor.id !== visitor.id).slice(0, 2)) game.debug.hitActor(actor.id, 10000);
  const before = game.state().score!; game.debug.hitActor(visitor.id, 10000);
  expect(game.state().score).toBe(before + 4000);
  expect(game.app.world.getObjectByName('flyby-score')?.userData.score).toBe(4000);
  game.stage(3); game.step(6.2);
  const police = game.state().actors.find(actor => actor.kind === 'police')!;
  game.debug.hitActor(police.id, 10000, false);
  expect(game.app.world.getObjectByName('flyby-score')).toBeUndefined();
  game.stage(2); game.step(14); expect(game.app.world.getObjectByName('flyby-score')).toBeUndefined();
});

it('a field pauses its clock and ends automatically at its duration, without requiring every falling rock to be shot', async () => {
  // This checks the field/phase adapter, not survival skill; damage rules have unit coverage.
  vi.spyOn(FlightLifecycle.prototype, 'damage').mockReturnValue({ type: 'ignored' });
  const game = new GameHarness(); await game.start('invaders'); game.stage(6); game.step(2);
  expect(game.state().phase).toBe('playing'); expect(game.text('#missionProgress')).toContain('ASTEROID FIELD');
  await game.action('pause'); const elapsed = game.state().elapsed; game.step(60); expect(game.state().elapsed).toBe(elapsed);
  await game.action('unpause'); game.step(invaderFieldDuration(6) - 2.1); expect(game.state().phase).toBe('playing');
  game.step(0.2); expect(game.state().phase).toBe('recovery');
  expect(game.state().actors.some(actor => ['asteroid', 'mine', 'police', 'pirate'].includes(actor.kind))).toBe(false);
  expect(game.state().score).toBe(550); // Only the existing wave-clear award.
  const score = game.state().score; game.step(0.25); expect(game.state().score).toBe(score);
});

it('shooting field rocks creates smaller fragments; a blast vaporizes them without spawning more', async () => {
  const game = new GameHarness(); await game.start('invaders'); game.stage(6); game.step(5);
  const rock = game.state().actors.find(actor => actor.kind === 'asteroid')!;
  const existing = new Set(game.state().actors.map(actor => actor.id));
  game.debug.hitActor(rock.id, 32);
  const fragments = game.state().actors.filter(actor => actor.kind === 'asteroid' && !existing.has(actor.id));
  expect(fragments).toHaveLength(2); expect(game.state().score).toBe(75);
  game.step(1.4); game.debug.primeBlast();
  const before = game.state().actors.filter(actor => actor.kind === 'asteroid').length;
  game.debug.blast(); const after = game.state().actors.filter(actor => actor.kind === 'asteroid').length;
  expect(after).toBeLessThan(before);
});

it('wave completion clears the recent-hit callout before showing recovery controls', async () => {
  const game = new GameHarness(); await game.start('invaders'); game.step(3.2);
  game.debug.damagePlayer(1); game.step(0);
  expect(document.querySelector('#hitCallout')?.classList.contains('active')).toBe(true);
  game.debug.finishEncounter(); game.step(0);
  expect(document.querySelector('#hitCallout')?.classList.contains('active')).toBe(false);
});

it.each(['pulse', 'spread', 'lance'] as const)('%s mine hits use the fired family even after the player switches weapons', async family => {
  const updates = vi.spyOn(ProjectileSystem.prototype, 'update');
  const game = new GameHarness(); await game.start('invaders'); game.stage(6); game.step(5.1);
  const [, actors, , , callbacks] = updates.mock.calls.at(-1)!;
  const mine = actors.find(actor => actor.kind === 'mine')!; expect(mine.hull).toBe(4);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: family === 'lance' ? 'Digit1' : 'Digit3' }));
  const hits = family === 'lance' ? 1 : 4, score = game.state().score!;
  for (let hit = 1; hit <= hits; hit++) {
    callbacks.damageActor(mine, weaponSpec(family, 3, 'invaders').damage, true, family);
    expect(mine.dead).toBe(hit === hits);
    expect(game.state().score).toBe(score + (hit === hits ? 25 : 0));
  }
  callbacks.damageActor(mine, 1000, true, family); expect(game.state().score).toBe(score + 25);
});
