import { describe, expect, it } from 'vitest';
import { freshProfile, newRun, settleStage } from '../arcade';
import { stageDefinition } from '../encounters';
import { MenuViews } from './views';
import { FrontMenus } from './front';
import { modeInstructions } from './instructions';

describe('menu views', () => {
  it('uses Defensive Position across title, help, records, wave titles and Level Warp while keeping saved progress', () => {
    const profile = freshProfile(), run = newRun('invaders', 1);
    run.stage = 7; profile.checkpoints.invaders = run; profile.records.invaders = 73295;
    const title = FrontMenus.title(profile, 'invaders', 'spread', true);
    const visible = [title[3], title[4]?.mode, FrontMenus.instructionContent(profile, 'invaders', 'spread'),
      FrontMenus.scoreContent(profile, 'invaders'), MenuViews.levelWarp(null)[3], MenuViews.gameOver(run, profile)[3], stageDefinition('invaders', 7).title];
    for (const content of visible) { expect(content).toContain('DEFENSIVE POSITION'); expect(content).not.toMatch(/\b(?:Invaders|INVADERS)\b/); }
    expect(title[4]?.actions).toContain('RESUME WAVE 7'); expect(title[4]?.actions).toContain('BEST 73295');
  });
  it('offers a clean mouse-playable start and hides the test menu until unlocked', () => {
    const profile = freshProfile();
    const normal = MenuViews.title(profile, 'journey', 'pulse', false);
    expect(normal[1]).toBe('3D VECTOR SPACE SHOOTER'); expect(normal[4]?.actions).toContain('PLAY GAME');
    expect(normal[4]?.controls).toContain('control-grid'); expect(normal[3]).not.toContain('control-grid'); expect(normal[3]).not.toContain('LEVEL WARP');
    expect(MenuViews.title(profile, 'journey', 'pulse', true)[3]).toContain('LEVEL WARP');
  });
  it('shows only the selected mode checkpoint and record', () => {
    const profile = freshProfile(); profile.checkpoints.endless = newRun('endless', 1); profile.checkpoints.endless.stage = 1000;
    profile.records.endless = 700;
    expect(MenuViews.title(profile, 'journey', 'pulse', false)[4]?.actions).not.toContain('RESUME');
    const endless = MenuViews.title(profile, 'endless', 'pulse', false)[4]?.actions;
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
  it('shows Defensive Position miss cost, mine armour and three-hit shields without numeric drop odds', () => {
    const view = FrontMenus.instructionContent(freshProfile(), 'invaders', 'pulse');
    expect(view).toContain('MISS COST: Pulse -100; Spread -100 per bolt; Lance -400 points');
    expect(view).toContain('four bolt hits or one Lance hit'); expect(view).toContain('three separately scored bolts');
    expect(view).toContain('A full shield absorbs three hits');
    expect(view).toContain('SPREAD 1.40s / LANCE 1.40s');
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
  it.each(['mouse', 'touch'] as const)('uses %s controls in course instructions', scheme => {
    const main = modeInstructions('smuggler', 'pulse', scheme);
    const optional = MenuViews.bonusOffer(newRun('journey', 1), 'canyon', scheme)[3];
    for (const content of [main, optional]) {
      expect(content).toContain(scheme === 'touch' ? 'on-screen Boost button' : 'Shift or wheel forward');
      expect(content).toContain(scheme === 'touch' ? 'on-screen Pause button' : 'Esc pauses');
      if (scheme === 'touch') expect(content).not.toMatch(/\b(Esc|Shift|wheel|click)\b/i);
    }
  });
  it.each(['journey', 'endless'] as const)('%s mission briefings have only Start Mission, including practice flights', mode => {
    const run = newRun(mode, 1); run.practice = true;
    const view = MenuViews.briefing(run, stageDefinition(mode, 1))[3];
    expect(view.match(/<button\b/g)).toHaveLength(1);
    expect(view).toContain('START MISSION'); expect(view).not.toContain('TITLE SCREEN'); expect(view).not.toContain('CHOOSE LEVEL');
  });
  it('lists every stage and difficulty with practice-safe navigation', () => {
    const content = MenuViews.levelWarp(null)[3];
    expect(content).toContain('99.'); expect(content).toContain('MAXIMUM'); expect(content).toContain('warpBonus:canyon');
    const run = newRun('journey', 1); run.practice = true;
    expect(MenuViews.gameOver(run)[3]).toContain('CHOOSE LEVEL');
  });
});
