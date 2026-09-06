import { expect, it } from 'vitest';
import { advance, bonusFor, freshProfile, JOURNEY_STAGE_COUNT, newRun, parseProfile, saveCheckpoint, settleBonus, settleStage } from './arcade';
import { EncounterDirector, stageDefinition } from './encounters';

it('traverses and resumes all 99 stages without early victory or duplicate rewards', () => {
  const profile = freshProfile(); let run = newRun('journey', 91);
  for (let n = 1; n <= JOURNEY_STAGE_COUNT; n++) {
    expect(run.stage).toBe(n); expect(settleStage(run)).toBe(true);
    const credits = run.pilot.credits; saveCheckpoint(profile, run);
    run = parseProfile(JSON.stringify(profile), null).checkpoints.journey!;
    expect(run.stage).toBe(n); expect(settleStage(run)).toBe(false); expect(run.pilot.credits).toBe(credits);
    advance(run); expect(run.phase).toBe(n === 99 ? 'victory' : 'briefing');
  }
  expect(run.stage).toBe(99);
});
it('resumes an old completed twelve-stage save at its dock, without paying it again', () => {
  const profile = freshProfile(), run = newRun('journey', 12); run.stage = 12;
  settleStage(run); run.phase = 'victory'; run.timeBonus = 0; saveCheckpoint(profile, run);
  const loaded = parseProfile(JSON.stringify(profile), null).checkpoints.journey!;
  expect(loaded.phase).toBe('shop'); expect(loaded.pilot.credits).toBe(run.pilot.credits);
  expect(settleStage(loaded)).toBe(false); advance(loaded); expect(loaded.stage).toBe(13);
});
it('keeps a real stage-99 victory completed after reload', () => {
  const profile = freshProfile(), run = newRun('journey', 99); run.stage = 99; settleStage(run); advance(run); saveCheckpoint(profile, run);
  expect(parseProfile(JSON.stringify(profile), null).checkpoints.journey!.phase).toBe('victory');
});
it('remixes finite encounters with bounded health, hostiles, attackers and projectile speeds', () => {
  const titles = new Set<string>();
  for (let n = 1; n <= 99; n++) {
    const d = stageDefinition('journey', n); titles.add(d.title);
    expect(d).toEqual(stageDefinition('journey', n)); expect(d.chapter).toBeLessThanOrEqual(3);
    expect(d.bossParts).toBeLessThanOrEqual(6); expect(d.speedScale).toBeLessThanOrEqual(1.35);
    expect(d.attackerCap).toBeLessThanOrEqual(6); expect(d.waves.length).toBeLessThanOrEqual(8);
    expect(d.waves.every(w => w.enemies.length > 0 && w.enemies.length <= (d.kind === 'armada' ? 14 : 8))).toBe(true);
    const director = new EncounterDirector(d);
    expect(director.next(0, 18)).toEqual([]); expect(director.next(0, 17).length).toBe(1);
    for (let t = 1; t < 1000 && !director.finished; t++) expect(director.next(t, 0).length).toBeLessThanOrEqual(18);
    expect(director.finished).toBe(true);
  }
  expect(titles.size).toBe(99); expect(stageDefinition('journey', 99).kind).toBe('boss');
  expect(stageDefinition('journey', 85).waves.length).toBeGreaterThan(stageDefinition('journey', 13).waves.length);
});
it('cycles optional bonuses through stage 95, with once-only rewards and no final-stage detour', () => {
  const run = newRun('journey', 4);
  for (let n = 3, i = 0; n < 99; n += 4, i++) {
    run.stage = n; run.bonusStatus = 'entered';
    expect(bonusFor(run)).toBe(['asteroids', 'canyon', 'sequence'][i % 3]);
    expect(settleBonus(run, 0.5)).not.toBeNull(); expect(settleBonus(run, 1)).toBeNull();
  }
  run.stage = 99; expect(bonusFor(run)).toBeNull();
});
