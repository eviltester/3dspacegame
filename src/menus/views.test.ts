import { describe, expect, it } from 'vitest';
import { freshProfile, newRun, settleStage } from '../arcade';
import { stageDefinition } from '../encounters';
import { MenuViews } from './views';

describe('menu views', () => {
  it('offers a clean mouse-playable start and hides the test menu until unlocked', () => {
    const profile = freshProfile();
    const normal = MenuViews.title(profile, 'journey', 'pulse', false);
    expect(normal[1]).toBe('3D VECTOR SPACE SHOOTER'); expect(normal[3]).toContain('PLAY GAME');
    expect(normal[3]).toContain('data-action="controls"'); expect(normal[3]).not.toContain('control-grid'); expect(normal[3]).not.toContain('LEVEL WARP');
    expect(MenuViews.title(profile, 'journey', 'pulse', true)[3]).toContain('LEVEL WARP');
  });
  it('shows only the selected mode checkpoint and record', () => {
    const profile = freshProfile(); profile.checkpoints.endless = newRun('endless', 1); profile.checkpoints.endless.stage = 1000;
    profile.records.endless = 700;
    expect(MenuViews.title(profile, 'journey', 'pulse', false)[3]).not.toContain('RESUME');
    const endless = MenuViews.title(profile, 'endless', 'pulse', false)[3];
    expect(endless).toContain('RESUME WAVE 1000'); expect(endless).toContain('BEST 700');
    expect(MenuViews.title(profile, 'endless', 'pulse', false)[4]?.mode).toContain('ATTACK CHALLENGE');
  });
  it.each(['journey', 'endless'] as const)('explains locked and released armadas in %s', mode => {
    const run = newRun(mode, 1); run.stage = 3; const definition = stageDefinition(mode, 3);
    expect(MenuViews.briefing(run, definition)[3]).toContain('tractor beam');
    expect(MenuViews.briefing(run, definition)[3]).toContain('LEFT / RIGHT');
    settleStage(run);
    expect(MenuViews.briefing(run, definition)[3]).toContain('beam is released');
  });
  it('shows Invaders miss bands, repair benefits and damage without numeric drop odds', () => {
    const run = newRun('invaders', 1), view = MenuViews.briefing(run, stageDefinition('invaders', 1))[3];
    expect(view).toContain('11+ aliens -100 / 6-10 aliens -75 / 0-5 aliens -50');
    expect(view).toContain('counted when fired'); expect(view).toContain('three separately scored bolts');
    expect(view).toContain('might release pickups that restore some shield');
    expect(view).not.toContain('1-in-15'); expect(view).not.toMatch(/hull/i);
    expect(view).toContain('Once your shield is empty, the next hit costs a life');
    expect(MenuViews.briefing(newRun('journey', 1), stageDefinition('journey', 1))[3]).not.toContain('MISS COST');
  });
  it('shows the final score and active choices without a countdown', () => {
    const run = newRun('journey', 1);
    run.lives = 0;
    const content = MenuViews.gameOver(run)[3]; expect(content).toContain('CONTINUE'); expect(content).not.toContain('disabled');
    expect(content).toContain('id="finalScore"'); expect(content).not.toContain('deathTimer');
    run.lives = 0; expect(MenuViews.gameOver(run)[3]).toContain('CONTINUE');
  });
  it('shows progression locks and purchased family tiers without changing resources', () => {
    const run = newRun('journey', 1); run.tiers.pulse = 2; run.phase = 'shop'; const before = structuredClone(run);
    const content = MenuViews.shop(run)[3]; expect(content).toContain('PULSE 2'); expect(content).toContain('stage 5');
    expect(run).toEqual(before);
  });
  it.each(['wasd', 'arrows'] as const)('uses %s instructions in the tractor-beam briefing', scheme => {
    const run = newRun('journey', 1); run.stage = 3;
    const view = MenuViews.briefing(run, stageDefinition('journey', 3), scheme)[3];
    expect(view).toContain('Mouse, A / D or Left / Right arrows');
    expect(view).toContain('LEFT CLICK / SPACE / J / Z'); expect(view).toContain('RIGHT CLICK / K / X');
  });
  it.each(['mouse', 'touch'] as const)('uses %s controls in course briefings', scheme => {
    const run = newRun('smuggler', 1); run.stage = 2;
    const main = MenuViews.briefing(run, stageDefinition('smuggler', 2), scheme)[3];
    const optional = MenuViews.bonusOffer(newRun('journey', 1), 'canyon', scheme)[3];
    for (const content of [main, optional]) {
      expect(content).toContain(scheme === 'touch' ? 'on-screen Boost button' : 'Shift or wheel forward');
      expect(content).toContain(scheme === 'touch' ? 'on-screen Pause button' : 'Esc pauses');
      if (scheme === 'touch') expect(content).not.toMatch(/\b(Esc|Shift|wheel|click)\b/i);
    }
  });
  it('lists every stage and difficulty with practice-safe navigation', () => {
    const content = MenuViews.levelWarp(null)[3];
    expect(content).toContain('99.'); expect(content).toContain('MAXIMUM'); expect(content).toContain('warpBonus:canyon');
    const run = newRun('journey', 1); run.practice = true;
    expect(MenuViews.gameOver(run)[3]).toContain('CHOOSE LEVEL');
  });
});
