import { describe, expect, it } from 'vitest';
import { newRun, retry } from '../arcade';
import type { GameMode } from '../arcade';
import { FlightLifecycle } from './flight-lifecycle';

function flight(mode: GameMode = 'invaders') {
  const run = newRun(mode, 1), life = new FlightLifecycle();
  life.launch(run); life.tick(run, 3); return { run, life };
}
describe('damage and life transitions', () => {
  it.each(['journey', 'endless', 'invaders'] as const)('%s fatal hit spends exactly one life and leaves simulation running', mode => {
    const { run, life } = flight(mode);
    run.pilot.score = 700; run.tiers.spread = 2; run.kills = 3; run.elapsed = 10; run.accuracy = { shots: 3, hits: 1, misses: 2 };
    const hit = life.damage(run, 200);
    expect(hit.type).toBe('respawn'); expect(run.lives).toBe(2); expect(life.menu).toBe(''); expect(life.canStep(run)).toBe(true);
    expect(life.pendingRespawn).toBe('combat'); expect(life.damage(run, 1000)).toEqual({ type: 'ignored' });
    expect(life.fail(run, 'combat')).toEqual({ type: 'ignored' }); expect(run.lives).toBe(2);
    expect(life.consumeRespawn(run)).toBe('combat'); expect(life.consumeRespawn(run)).toBeNull();
    expect(run).toMatchObject({ phase: 'playing', kills: 3, elapsed: 10, tiers: { spread: 2 }, pilot: { score: 700, hull: 100, shield: 100 }, accuracy: { shots: 3, hits: 1, misses: 2 } });
    expect(life.protection).toBe(3); expect(life.canStep(run)).toBe(true);
  });
  it('zero lives opens game over without clearing the final score', () => {
    const { run, life } = flight(); run.lives = 1; run.pilot.score = 1000;
    const hit = life.damage(run, 500);
    expect(hit.type).toBe('gameover');
    if (hit.type !== 'gameover') throw new Error('Expected game over');
    expect(hit.record!.pilot.score).toBe(1000); expect(run.pilot.score).toBe(1000);
    expect(run.lives).toBe(0); expect(life.menu).toBe('gameover'); expect(life.canStep(run)).toBe(false); expect(life.pendingRespawn).toBeNull();
    retry(run, true); life.resetStage(); life.launch(run);
    expect(run.lives).toBe(3); expect(run.continued).toBe(true); expect(life.canStep(run)).toBe(true);
  });
  it('objective failure queues a checkpoint rebuild without displaying a menu', () => {
    const { run, life } = flight('journey'); run.pilot.credits = 500;
    expect(life.fail(run, 'checkpoint').type).toBe('respawn'); expect(run.pilot.credits).toBe(0); expect(life.canStep(run)).toBe(true);
    expect(life.consumeRespawn(run)).toBe('checkpoint'); expect(run.phase).toBe('playing'); expect(life.menu).toBe('');
  });
  it.each([0, -1, Number.NaN, Infinity])('rejects invalid damage %s without side effects', amount => {
    const { run, life } = flight(), before = structuredClone(run);
    expect(life.damage(run, amount)).toEqual({ type: 'ignored' }); expect(run).toEqual(before);
  });
  it('consumes shields before hull, resets the chain and applies hit grace', () => {
    const { run, life } = flight('journey'); run.pilot.shield = 20; run.chain.multiplier = 5;
    expect(life.damage(run, 30)).toEqual({ type: 'hit' }); expect(run.pilot.hull).toBe(90); expect(run.pilot.shield).toBe(0);
    expect(run.chain.multiplier).toBe(1); expect(life.damage(run, 30)).toEqual({ type: 'ignored' });
    life.tick(run, 0.28); expect(life.damage(run, 10)).toEqual({ type: 'hit' }); expect(run.pilot.hull).toBe(80);
  });
  it.each([[100, 90, 100], [10, 0, 100], [5, 0, 90], [0, 0, 80]])('Invaders bolt against %i shield leaves %i shield and %i hull', (shield, remainingShield, hull) => {
    const { run, life } = flight(); run.pilot.shield = shield;
    expect(life.damage(run, 10)).toEqual({ type: 'hit' });
    expect(run.pilot.shield).toBe(remainingShield); expect(run.pilot.hull).toBe(hull);
    expect(life.damage(run, 10)).toEqual({ type: 'ignored' }); expect(run.pilot.hull).toBe(hull);
  });
  it.each(['journey', 'endless', 'smuggler'] as const)('%s keeps normal hull damage', mode => {
    const { run, life } = flight(mode); run.pilot.shield = 0;
    expect(life.damage(run, 10)).toEqual({ type: 'hit' }); expect(run.pilot.hull).toBe(90);
  });
  it('five unshielded Invaders bolts spend one life and retain protected respawn', () => {
    const { run, life } = flight(); run.pilot.shield = 0;
    for (let hit = 1; hit <= 4; hit++) {
      expect(life.damage(run, 10)).toEqual({ type: 'hit' }); expect(run.pilot.hull).toBe(100 - hit * 20);
      life.tick(run, 0.28);
    }
    expect(life.damage(run, 10).type).toBe('respawn'); expect(run.lives).toBe(2);
    expect(life.consumeRespawn(run)).toBe('combat'); expect(life.protection).toBe(3);
    expect(life.damage(run, 10)).toEqual({ type: 'ignored' }); expect(run.pilot.hull).toBe(100);
  });
});
describe('protection and pause contracts', () => {
  it.each(['journey', 'endless', 'invaders', 'smuggler'] as const)('%s pauses timers and cannot take damage while protected', mode => {
    const { run, life } = flight(mode); life.fail(run, 'checkpoint'); life.tick(run, 4); life.consumeRespawn(run);
    expect(life.damage(run, 500).type).toBe('ignored'); life.tick(run, 1); expect(life.protection).toBe(2);
    expect(life.pause(run)).toBe(true); expect(life.pause(run)).toBe(false); life.tick(run, 20);
    expect(life.protection).toBe(2); expect(life.canStep(run)).toBe(false); expect(life.damage(run, 500).type).toBe('ignored');
    life.launch(run); life.tick(run, 1.99); expect(life.damage(run, 500).type).toBe('ignored');
    life.tick(run, 0.01); expect(life.protection).toBe(0); expect(life.damage(run, 1).type).toBe('hit');
  });
  it('stage rebuild preserves only the supplied remaining shield time', () => {
    const { run, life } = flight(); life.fail(run, 'combat'); life.consumeRespawn(run); life.tick(run, 1);
    life.resetStage(life.protection); expect(life.protection).toBe(2); expect(life.grace).toBe(0);
    life.tick(run, 2); expect(life.protection).toBe(0); life.resetStage(); expect(life.protection).toBe(0); expect(life.grace).toBe(3);
    life.resetStage(10); expect(life.protection).toBe(3); life.resetStage(-1); expect(life.protection).toBe(0);
  });
  it.each(['briefing', 'shop', 'gameover', 'victory'] as const)('does not run or damage a ship in %s', phase => {
    const { run, life } = flight(); run.phase = phase;
    expect(life.canStep(run)).toBe(false); expect(life.pause(run)).toBe(false); expect(life.damage(run, 500).type).toBe('ignored');
  });
  it('ignores absent runs and invalid simulation intervals', () => {
    const { run, life } = flight(); life.resetStage(3);
    expect(life.canStep(null)).toBe(false); expect(life.pause(null)).toBe(false);
    for (const dt of [-1, 0, NaN, Infinity]) life.tick(run, dt);
    expect(life.protection).toBe(3);
  });
  it('game over waits indefinitely for a player action', () => {
    const { run, life } = flight(); run.lives = 1; life.fail(run, 'checkpoint');
    life.tick(run, 3600); expect(life.menu).toBe('gameover'); expect(life.canStep(run)).toBe(false);
  });
  it('Smuggler pauses for four active seconds before respawning, with focus/menu pause support', () => {
    const { run, life } = flight('smuggler'); life.fail(run, 'checkpoint');
    expect(life.respawnDelay).toBe(4); expect(life.consumeRespawn(run)).toBeNull();
    life.tick(run, 2); expect(life.respawnDelay).toBe(2); expect(life.pause(run)).toBe(true);
    life.tick(run, 100); expect(life.respawnDelay).toBe(2); life.launch(run);
    for (let i = 0; i < 119; i++) life.tick(run, 1 / 60);
    expect(life.consumeRespawn(run)).toBeNull(); life.tick(run, 1 / 60);
    expect(life.consumeRespawn(run)).toBe('checkpoint'); expect(life.protection).toBe(3); expect(run.lives).toBe(2);
  });
});
