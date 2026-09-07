import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { advance, bonusFor, clone, dock, freshProfile, loseLife, newRun, parseProfile, pickup, purchase, recordRun, resources, retry, rewardInterception, rewardKill, saveCheckpoint, settleBonus, settleStage, tickChain } from './arcade';
import { EncounterDirector, HULL, Random, stageDefinition } from './encounters';
import { rotateLocally } from './input';
import { sweptHit, weaponSpec } from './weapons';
import { SOUND_EFFECT_NAMES, synthesizeEffect } from './sound';
import { canNpcCollect } from './arcade';
import { crossedGate } from './encounters';

it('warps only through the gate opening, not by touching its surrounding sphere', () => {
  const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  const q = new THREE.Quaternion();
  expect(crossedGate(v(0, 10), v(0, 5), v(0, 0), q)).toBe(false);
  expect(crossedGate(v(0, 5), v(0, -5), v(0, 0), q)).toBe(true);
  expect(crossedGate(v(40, 5), v(40, -5), v(0, 0), q)).toBe(false);
});

describe('NPC salvage protection', () => {
  it.each(['credits', 'legalCargo', 'rareMineral', 'shieldCell', 'weaponCore'] as const)('only pirates and civilians collect %s', type => {
    expect(canNpcCollect('police', type)).toBe(false);
    expect(canNpcCollect('pirate', type)).toBe(true);
    expect(canNpcCollect('trader', type)).toBe(true);
    expect(canNpcCollect('pirate', type, true)).toBe(false);
  });
  it('reserves contraband for pirates/police and mission pods for the player', () => {
    expect(canNpcCollect('police', 'contraband')).toBe(true);
    expect(canNpcCollect('pirate', 'contraband')).toBe(true);
    expect(canNpcCollect('trader', 'contraband')).toBe(false);
    for (const faction of ['police', 'pirate', 'trader'] as const) expect(canNpcCollect(faction, 'rescuePod')).toBe(false);
  });
});

describe('arcade checkpoints and rewards', () => {
  it('starts clean with three lives and alternative weapons, never legacy power', () => {
    const old = JSON.stringify({ credits: 999999, bestScore: 3400, unlockedWeaponLevel: 5, wantedBySector: { old: 4 } });
    const p = parseProfile(null, old);
    expect(p.legacyScore).toBe(3400);
    expect(p.unlocked).toEqual(['pulse', 'spread', 'lance']);
    const r = newRun('journey', 42, 'lance');
    expect(r.pilot.credits).toBe(0);
    expect(r.pilot.wanted.active).toBe(false);
    expect(r.lives).toBe(3);
    expect(r.tiers).toEqual({ pulse: 1, spread: 1, lance: 1 });
  });
  it('restores stage equipment and cargo while retaining the score', () => {
    const r = newRun('journey', 42);
    r.phase = 'playing';
    const start = resources(r);
    pickup(r, { type: 'weaponCore', amount: 1 });
    pickup(r, { type: 'rareMineral', amount: 3 });
    rewardKill(r);
    start.pilot.score = r.pilot.score;
    r.pilot.hull = 10;
    loseLife(r);
    expect(resources(r)).toEqual(start);
    expect(r.lives).toBe(2);
    expect(r.phase).toBe('gameover');
    retry(r);
    expect(resources(r)).toEqual(start);
    expect(r.lives).toBe(2);
  });
  it('continues indefinitely at the checkpoint with separate records', () => {
    const r = newRun('journey', 5); const p = freshProfile();
    r.pilot.score = 500; r.checkpoint = resources(r);
    recordRun(p, r);
    for (let i = 0; i < 3; i++) loseLife(r);
    expect(r.lives).toBe(0);
    retry(r, true);
    expect(r.lives).toBe(3); expect(r.pilot.score).toBe(0);
    expect(r.continued).toBe(true);
    r.pilot.score = 120; recordRun(p, r);
    expect(p.records.journey).toBe(500);
    expect(p.records.journeyContinued).toBe(120);
    loseLife(r); expect(r.pilot.score).toBe(120);
  });
  it('banks a stage once and preserves purchases into the next checkpoint', () => {
    const r = newRun('journey', 77);
    expect(settleStage(r)).toBe(true);
    expect(r.pilot.credits).toBeGreaterThanOrEqual(350);
    const score = r.pilot.score, money = r.pilot.credits;
    expect(settleStage(r)).toBe(false);
    expect(r.pilot.score).toBe(score); expect(r.pilot.credits).toBe(money);
    dock(r); expect(purchase(r, 'tier')).toBe(true);
    advance(r); expect(r.stage).toBe(2);
    loseLife(r); expect(r.tiers.pulse).toBe(2);
    expect(r.pilot.credits).toBe(money - 350);
  });
  it('has separate resumable modes and cannot duplicate a resumed stage payment', () => {
    const p = freshProfile(), j = newRun('journey', 1), e = newRun('endless', 2);
    settleStage(j); saveCheckpoint(p, j);
    e.stage = 9; saveCheckpoint(p, e);
    const loaded = parseProfile(JSON.stringify(p), null);
    const resumed = loaded.checkpoints.journey!;
    expect(settleStage(resumed)).toBe(false);
    expect(resumed.pilot.credits).toBe(j.pilot.credits);
    expect(loaded.checkpoints.endless!.stage).toBe(9);
    const active = newRun('journey', 3); active.phase = 'playing'; active.pilot.credits = 900;
    saveCheckpoint(p, active); expect(p.checkpoints.journey!.pilot.credits).toBe(0);
    expect(active.pilot.credits).toBe(900);
  });
  it('ignores corrupt and invalid saves', () => {
    expect(parseProfile('{bad', '{bad').checkpoints).toEqual({});
    const p = freshProfile(); p.checkpoints.journey = newRun('journey', 5);
    p.checkpoints.journey.stage = 100;
    expect(parseProfile(JSON.stringify(p), null).checkpoints).toEqual({});
  });
});

describe('weapons and supply dock', () => {
  it('gates tiers without discarding cores and keeps family tiers', () => {
    const r = newRun('journey', 1);
    pickup(r, { type: 'weaponCore', amount: 1 });
    expect(r.tiers.pulse).toBe(2);
    pickup(r, { type: 'weaponCore', amount: 1 }); expect(r.pilot.credits).toBe(200);
    r.pilot.credits = 3000; dock(r);
    expect(purchase(r, 'tier')).toBe(false);
    r.family = 'spread'; expect(purchase(r, 'tier')).toBe(true);
    expect(r.tiers.pulse).toBe(2); expect(r.tiers.spread).toBe(2);
    r.stage = 5; expect(purchase(r, 'tier')).toBe(true);
    expect(r.tiers.spread).toBe(3); expect(purchase(r, 'tier')).toBe(false);
  });
  it('auto-sells legal goods once, leaves contraband and respects upgrade caps', () => {
    const r = newRun('journey', 1);
    pickup(r, { type: 'legalCargo', amount: 2 }); pickup(r, { type: 'rareMineral', amount: 1 });
    pickup(r, { type: 'contraband', amount: 2 }); dock(r);
    expect(r.pilot.credits).toBe(320); expect(r.pilot.inventory.contraband).toBe(2);
    dock(r); expect(r.pilot.credits).toBe(320);
    expect(purchase(r, 'magnet')).toBe(true); expect(r.magnet).toBe(35);
    expect(purchase(r, 'magnet')).toBe(false);
    r.pilot.credits = 2000;
    expect(purchase(r, 'shield')).toBe(true); expect(purchase(r, 'shield')).toBe(true);
    expect(purchase(r, 'shield')).toBe(false); expect(r.pilot.maxShield).toBe(150);
    r.pilot.hull = 20; r.pilot.shield = 0;
    expect(purchase(r, 'repair')).toBe(true);
    expect(r.pilot.hull).toBe(70); expect(r.pilot.shield).toBe(60);
    r.pilot.credits = 0; expect(purchase(r, 'repair')).toBe(false);
  });
  it('has distinct families and common fighters still take a few hits', () => {
    expect(weaponSpec('spread', 1).count).toBe(3);
    expect(weaponSpec('lance', 1).pierce).toBe(3);
    expect(weaponSpec('pulse', 3).cooldown).toBeLessThan(weaponSpec('pulse', 1).cooldown);
    expect(Math.ceil(HULL.raider / weaponSpec('pulse', 1).damage)).toBe(2);
  });
  it('uses swept collisions even when fast objects cross between frames', () => {
    const v = (x: number, y = 0) => new THREE.Vector3(x, y, 0);
    expect(sweptHit(v(-50), v(50), v(50), v(-50), 3)).toBeCloseTo(0.485);
    expect(sweptHit(v(-50), v(50), v(0, 10), v(0, 10), 3)).toBeNull();
    expect(sweptHit(v(0), v(0), v(0), v(0), 3)).toBe(0);
  });
});

describe('pacing, input and score chains', () => {
  it('has twelve authored stages and the endless boss/armada schedule', () => {
    expect(Array.from({ length: 12 }, (_, i) => stageDefinition('journey', i + 1).kind)).toEqual(
      ['patrol', 'rescue', 'armada', 'boss', 'ambush', 'escort', 'armada', 'boss', 'defend', 'assault', 'armada', 'boss']);
    for (const n of [3, 8, 13, 103]) expect(stageDefinition('endless', n).kind).toBe('armada');
    for (const n of [5, 10, 100]) expect(stageDefinition('endless', n).kind).toBe('boss');
    const maximum = stageDefinition('endless', 999);
    expect(maximum.speedScale).toBe(1.35); expect(maximum.attackerCap).toBe(6);
  });
  it('never exceeds eighteen hostiles and is finite', () => {
    const d = new EncounterDirector(stageDefinition('journey', 10));
    expect(d.next(0, 18)).toHaveLength(0);
    expect(d.next(0, 17)).toHaveLength(1);
    let count = 1;
    for (let i = 0; i < 50; i++) count += d.next(i * 20, 0).length;
    expect(d.finished).toBe(true); expect(count).toBeGreaterThan(20);
  });
  it('introduces new Endless roles in separate flights', () => {
    expect(new Set(stageDefinition('endless', 2).waves[0].enemies)).toEqual(new Set(['flanker']));
    expect(new Set(stageDefinition('endless', 2).waves[1].enemies)).toEqual(new Set(['diver']));
    expect(new Set(stageDefinition('endless', 4).waves[0].enemies)).toEqual(new Set(['gunship']));
    expect(new Set(stageDefinition('endless', 6).waves[0].enemies)).toEqual(new Set(['minelayer']));
  });
  it('reproduces seeded choices and permits complete local pitch rotations', () => {
    const a = new Random(42), b = new Random(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
    const q = new THREE.Quaternion();
    for (let i = 0; i < 360; i++) rotateLocally(q, 0, Math.PI / 180 / 0.0022, 0, 1 / 60);
    expect(q.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 5);
    expect(q.length()).toBeCloseTo(1);
  });
  it('requires three kills inside five seconds, freezes outside combat and resets on expiry', () => {
    const r = newRun('journey', 1); r.phase = 'playing';
    rewardKill(r); tickChain(r, 4); rewardKill(r); tickChain(r, 4); rewardKill(r);
    expect(r.chain.multiplier).toBe(1);
    rewardKill(r); rewardKill(r); expect(r.chain.multiplier).toBe(2);
    const chain = clone(r.chain);
    r.phase = 'shop'; tickChain(r, 100); expect(r.chain).toEqual(chain);
    r.phase = 'playing'; tickChain(r, 6); expect(r.chain.multiplier).toBe(1);
    for (let i = 0; i < 30; i++) rewardKill(r);
    expect(r.chain.multiplier).toBe(5); expect(r.charge).toBe(100);
    r.charge = 0; rewardInterception(r); expect(r.charge).toBe(10);
  });
  it('carries the paused chain through the dock and next briefing', () => {
    const r = newRun('journey', 3); r.phase = 'playing';
    rewardKill(r); rewardKill(r); rewardKill(r);
    settleStage(r); dock(r); const chain = clone(r.chain);
    advance(r); tickChain(r, 100);
    expect(r.chain).toEqual(chain);
    r.phase = 'playing'; tickChain(r, 6); expect(r.chain.multiplier).toBe(1);
  });
});

describe('bonus isolation and payout safety', () => {
  it.each(['asteroids', 'canyon', 'sequence'] as const)('%s never changes main equipment, cargo or health', kind => {
    const r = newRun('journey', 1);
    r.stage = kind === 'asteroids' ? 3 : kind === 'canyon' ? 7 : 11;
    expect(bonusFor(r)).toBe(kind);
    const before = resources(r);
    r.bonusStatus = 'entered'; settleBonus(r, 0.7);
    expect(r.pilot.hull).toBe(before.pilot.hull); expect(r.pilot.shield).toBe(before.pilot.shield);
    expect(r.pilot.inventory).toEqual(before.pilot.inventory);
    expect(r.tiers).toEqual(before.tiers); expect(r.lives).toBe(3);
    const paid = resources(r); expect(settleBonus(r, 1)).toBeNull();
    expect(resources(r)).toEqual(paid);
  });
  it.each([0, 0.2, 0.5, 0.75, 1])('pays partial results once at ratio %s', ratio => {
    const r = newRun('journey', 1); settleStage(r);
    const mainCredits = r.pilot.credits;
    r.bonusStatus = 'entered'; const result = settleBonus(r, ratio)!;
    expect(result.credits).toBeGreaterThanOrEqual(0);
    expect(r.pilot.credits).toBeGreaterThanOrEqual(mainCredits);
    const p = freshProfile(); saveCheckpoint(p, r);
    expect(settleBonus(p.checkpoints.journey!, 1)).toBeNull();
  });
  it('caps extra lives and consumes interrupted offers without duplicate payout', () => {
    const r = newRun('endless', 8); r.stage = 5;
    expect(bonusFor(r)).toBe('asteroids');
    r.stage = 10; expect(bonusFor(r)).toBe('canyon');
    r.stage = 15; expect(bonusFor(r)).toBe('sequence');
    r.lives = 5; r.bonusStatus = 'entered';
    expect(settleBonus(r, 1)!.extraLife).toBe(false); expect(r.lives).toBe(5);
    r.phase = 'bonus'; r.bonusStatus = 'entered';
    const p = freshProfile(); saveCheckpoint(p, r);
    expect(p.checkpoints.endless!.phase).toBe('shop');
    expect(p.checkpoints.endless!.bonusStatus).toBe('settled');
  });
});

describe('original synth effects', () => {
  it.each(SOUND_EFFECT_NAMES)('%s is finite, audible and fades to silence', name => {
    const samples = synthesizeEffect(name);
    expect(samples.length).toBeGreaterThan(1000);
    expect(samples.every(Number.isFinite)).toBe(true);
    expect(Math.max(...samples)).toBeGreaterThan(0.02);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.0001);
  });
});
