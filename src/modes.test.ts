import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bonusFor, freshProfile, newRun, parseProfile, recordRun, retry, saveCheckpoint } from './arcade';
import { stageDefinition } from './encounters';
import { GAME_MODES, MODE_INFO, isGameMode } from './modes';
import { invaderPattern, invaderPosition } from './invaders';
import { armadaFormationPosition } from './armada';
import { FrontMenus } from './menus/front';
import { MenuViews } from './menus/views';
import { parseScoreboards } from './scores';
import { WEAPON_HELP } from './weapons';

describe('four independent game modes', () => {
  it('accepts only supported mode identifiers', () => {
    for (const mode of GAME_MODES) expect(isGameMode(mode)).toBe(true);
    for (const mode of [undefined, null, '', 'attack', 'INVADERS', {}, 1]) expect(isGameMode(mode)).toBe(false);
  });
  it('retains the Endless save key under the Attack Challenge name', () => {
    const old = freshProfile(); old.records.endless = 4000;
    const run = newRun('endless', 1); run.stage = 1000; saveCheckpoint(old, run);
    const { scoreboards, ...legacy } = old; void scoreboards;
    const profile = parseProfile(JSON.stringify(legacy), null);
    expect(MODE_INFO.endless.name).toBe('ATTACK CHALLENGE');
    expect(profile.records.endless).toBe(4000); expect(profile.checkpoints.endless?.stage).toBe(1000);
    expect(profile.records.invaders).toBe(0); expect(profile.scoreboards.smuggler).toEqual([]);
  });
  it.each(GAME_MODES)('%s owns its save, high scores and continued records', mode => {
    const profile = freshProfile(), run = newRun(mode, 1);
    run.pilot.score = 900; recordRun(profile, run); recordRun(profile, run); saveCheckpoint(profile, run);
    expect(profile.scoreboards[mode]).toHaveLength(1); expect(profile.records[mode]).toBe(900);
    retry(run, true); run.pilot.score = 300; recordRun(profile, run);
    expect(profile.records[`${mode}Continued`]).toBe(300); expect(profile.records[mode]).toBe(900);
    const restored = parseProfile(JSON.stringify(profile), null);
    expect(restored.scoreboards[mode]).toHaveLength(2);
    for (const other of GAME_MODES.filter(m => m !== mode)) {
      expect(restored.checkpoints[other]).toBeUndefined(); expect(restored.scoreboards[other]).toEqual([]); expect(restored.records[other]).toBe(0);
    }
    const screen = FrontMenus.scores(restored, mode);
    expect(screen[2]).toBe(MODE_INFO[mode].name); expect(screen[3]).toContain('900'); expect(screen[3]).toContain('300');
  });
  it('keeps ten ranked runs, updates rather than duplicates, and excludes practice', () => {
    const profile = freshProfile();
    for (let i = 1; i <= 14; i++) { const run = newRun('invaders', i); run.pilot.score = i * 100; recordRun(profile, run); }
    const run = newRun('invaders', 14); run.pilot.score = 1800; recordRun(profile, run);
    expect(profile.scoreboards.invaders).toHaveLength(10); expect(profile.scoreboards.invaders[0].score).toBe(1800);
    run.practice = true; run.pilot.score = 9000; recordRun(profile, run); expect(profile.records.invaders).toBe(1800);
    expect(parseScoreboards({ invaders: [{ id: 'bad', score: Infinity, stage: 1, continued: false }] }).invaders).toEqual([]);
  });
  it('validates saved score rows and retains the highest duplicate entry', () => {
    const valid = { id: 'one', score: 300, stage: 2, continued: false };
    expect(parseScoreboards(null)).toEqual(freshProfile().scoreboards);
    const boards = parseScoreboards({ journey: 'invalid', invaders: [null, 2, {}, { ...valid, id: 'x'.repeat(121) },
      { ...valid, stage: -1 }, { ...valid, continued: 'no' }, valid, { ...valid, score: 200 }, { ...valid, score: 400 }] });
    expect(boards.invaders).toEqual([{ ...valid, score: 400 }]); expect(boards.journey).toEqual([]);
  });
  it('adds new run fields when loading an existing v2 checkpoint without changing its power', () => {
    const profile = freshProfile(), run: Partial<ReturnType<typeof newRun>> = newRun('endless', 123);
    delete run.id; delete run.nextLifeScore; delete run.stageReward;
    const restored = parseProfile(JSON.stringify({ ...profile, checkpoints: { endless: run } }), null).checkpoints.endless!;
    expect(restored.id).toBe('endless-legacy-123'); expect(restored.nextLifeScore).toBe(5000);
    expect(restored.stageReward).toBe(0); expect(restored.family).toBe('pulse'); expect(restored.tiers.pulse).toBe(1);
  });
  it('shows all modes, descriptions for every weapon, and separate controls', () => {
    const profile = freshProfile(); const title = FrontMenus.title(profile, 'invaders', 'pulse', false)[3];
    for (const mode of GAME_MODES) expect(title).toContain(MODE_INFO[mode].name);
    expect(title).not.toContain('control-grid');
    const weapons = FrontMenus.weapons(profile, 'pulse')[3];
    for (const help of Object.values(WEAPON_HELP)) expect(weapons).toContain(help);
    expect(FrontMenus.controls(profile)[3]).toContain('control-grid');
  });
});

describe('Invaders progression and patterns', () => {
  it('keeps resumed wave briefings in the defensive lane', () => {
    const run = newRun('invaders', 123); run.cleared = true; run.phase = 'recovery';
    const content = MenuViews.briefing(run, stageDefinition('invaders', 1))[3];
    expect(content).toContain('ship stays in the defensive lane'); expect(content).not.toContain('tractor beam is released');
    expect(content).toContain('Extra life every 20,000 points');
  });
  it('has only armadas, no bonus detours, fixed fighter health and increasing pressure', () => {
    for (let wave = 1; wave <= 100; wave++) {
      const stage = stageDefinition('invaders', wave);
      expect(stage.kind).toBe('armada'); expect(bonusFor({ mode: 'invaders', stage: wave })).toBeNull();
      expect(stage.waves.every(flight => flight.enemies.every(role => ['raider', 'flanker', 'diver'].includes(role)))).toBe(true);
      expect(stage.waves.every(flight => flight.enemies.length <= 18)).toBe(true); expect(stage.attackerCap).toBeLessThanOrEqual(6);
      expect(stage.speedScale).toBeLessThanOrEqual(1.35);
      if (wave > 1) {
        const before = stageDefinition('invaders', wave - 1);
        expect(stage.difficulty.movementScale).toBeGreaterThan(before.difficulty.movementScale);
        expect(stage.difficulty.cooldownScale).toBeLessThan(before.difficulty.cooldownScale);
        expect(stage.waves.flatMap(w => w.enemies).length).toBeGreaterThanOrEqual(before.waves.flatMap(w => w.enemies).length);
      }
    }
    expect(stageDefinition('invaders', 1000).waves.length).toBeGreaterThan(stageDefinition('invaders', 100).waves.length);
  });
  it('cycles four original attack patterns while keeping aliens inside the firing lane', () => {
    expect(new Set([1, 2, 3, 4].map(invaderPattern)).size).toBe(4);
    const paths = new Set<string>();
    for (let wave = 1; wave <= 4; wave++) {
      const samples: number[] = [];
      for (let i = 0; i < 18; i++) for (let tick = 0; tick < 80; tick++) {
        const position = invaderPosition(armadaFormationPosition(i, 18), tick / 10, wave, 1.5);
        expect(Math.abs(position.x)).toBeLessThanOrEqual(72); expect(position.y).toBe(0); expect(position.z).toBeLessThanOrEqual(-34);
        if (i === 0) samples.push(position.x, position.z);
      }
      paths.add(JSON.stringify(samples));
    }
    expect(paths.size).toBe(4);
    expect(invaderPosition(new THREE.Vector3(30, 0, -200), 2, 3, 1)).toEqual(invaderPosition(new THREE.Vector3(30, 0, -200), 2, 3, 1));
  });
});
