import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { freshProfile, newRun, pickup, purchase } from '../arcade';
import type { GameMode, WeaponFamily } from '../arcade';
import { actorFixture } from '../testing/actors';
import { buildHud } from './hud-model';
import type { HudFrame } from './hud-model';
import { WEAPON_HELP } from '../weapons';
import { COURSE_RADAR_VIEW, SPACE_RADAR_VIEW } from '../radar';

function frame(mode: GameMode = 'journey'): HudFrame & { run: NonNullable<HudFrame['run']> } {
  const run = newRun(mode, 1); run.phase = 'playing';
  return { run, menu: '', profile: freshProfile(), selectedMode: mode, bonus: null, definition: { kind: mode === 'invaders' ? 'armada' : 'patrol', title: 'PATROL' },
    actors: [], throttle: 65, recovery: 8, intermission: 0, arrivalTime: 0, rescued: false, objectiveShip: null, director: { flight: 1, totalFlights: 2 },
    position: new Vector3(), orientation: new Quaternion(), messages: [], feedbackTime: 0, hitTime: 0, popupTime: 0,
    gate: null, base: null, objectivePod: null, threat: null, shotDelay: 0, protection: 0 };
}
function bonus(kind: 'asteroids' | 'canyon' | 'sequence'): NonNullable<HudFrame['bonus']> {
  return { state: { kind, difficulty: 4, points: 10, health: 2, shield: kind === 'canyon' ? 100 : 0, haul: 0, family: 'spread', charge: 100, remaining: 23.4, targetCount: 22, nextMarker: 4, shotsFired: 7 } };
}
describe('resource display is a projection, not independently updated state', () => {
  it('shows touch tools only in flight and throttle only during free flight', () => {
    const f = frame(); expect(buildHud(f).hidden['#touchTools']).toBe(true);
    f.profile.settings.controlScheme = 'touch';
    expect(buildHud(f).hidden).toMatchObject({ '#touchTools': false, '#touchThrottle': false, '#touchBoost': false });
    f.menu = 'pause'; expect(buildHud(f).hidden['#touchTools']).toBe(true);
    f.menu = ''; f.intermission = 3; expect(buildHud(f).hidden['#touchTools']).toBe(true);
    f.intermission = 0; f.bonus = bonus('canyon'); expect(buildHud(f).hidden).toMatchObject({ '#touchThrottle': true, '#touchBoost': false });
    f.bonus = bonus('asteroids'); expect(buildHud(f).hidden['#touchBoost']).toBe(true);
    f.bonus = bonus('sequence'); expect(buildHud(f).hidden['#touchBoost']).toBe(true);
    f.bonus = null; f.definition.kind = 'armada'; expect(buildHud(f).hidden).toMatchObject({ '#touchThrottle': true, '#touchBoost': true });
    f.run.cleared = true; expect(buildHud(f).hidden['#touchThrottle']).toBe(false);
    f.run.mode = 'invaders'; expect(buildHud(f).hidden['#touchThrottle']).toBe(true);
  });
  it('shows unconverted canyon cargo, numeric shields, and the paid conversion on the summary', () => {
    const f = frame('smuggler'); f.bonus = bonus('canyon'); f.bonus.state.haul = 3; f.bonus.state.shield = 40;
    const cargo = [{ position: new Vector3(0, 0, -40), color: '#ffff70', glyph: 'cargo' as const }]; f.bonus.radarContacts = cargo;
    const view = buildHud(f); expect(view.text.shieldReadout).toBe('40 / 100'); expect(view.text.cargoReadout).toBe('HAUL 3 / +225 AT EXIT');
    expect(view.text.scoreReadout).toBe('000010'); expect(view.radar).toEqual(cargo);
    f.bonus = null; f.run.stageHaul = 3; f.run.pilot.score = 1535; f.intermission = 3;
    const paid = buildHud(f); expect(paid.text.courseHaul).toBe('HAUL 3 x 75 = +225'); expect(paid.hidden['#courseHaul']).toBe(false);
    expect(paid.text.courseScore).toBe('SCORE 1535');
  });
  it('shows a compact score/lives summary and countdown, hidden while paused', () => {
    const f = frame('smuggler'); f.run.pilot.score = 1500; f.run.lives = 2; f.intermission = 2.1;
    const view = buildHud(f); expect(view.hidden['#courseSummary']).toBe(false);
    expect(view.text).toMatchObject({ courseScore: 'SCORE 1500', courseLives: 'LIVES 2', courseNext: 'LEVEL 2 IN 3' });
    f.menu = 'pause'; expect(buildHud(f).hidden['#courseSummary']).toBe(true);
  });
  it('projects skiff repair pickups onto the course radar', () => {
    const f = frame('smuggler'); f.bonus = bonus('canyon');
    const contacts = [{ position: new Vector3(10, 0, -50), color: '#70cfff', glyph: 'cargo' as const }];
    f.bonus.radarContacts = contacts; expect(buildHud(f).radar).toEqual(contacts);
  });
  for (const mode of ['journey', 'endless', 'invaders'] as const) for (const family of ['pulse', 'spread', 'lance'] as WeaponFamily[]) {
    it(`${mode} ${family} pickup and purchase always produce the new weapon readout`, () => {
      const f = frame(mode); f.run.family = family;
      expect(buildHud(f).text.weaponReadout).toBe(`${family.toUpperCase()} 1`);
      pickup(f.run, { type: 'weaponCore', amount: 1 });
      expect(buildHud(f).text.weaponReadout).toBe(`${family.toUpperCase()} 2`); expect(buildHud(f).titles['#weaponReadout']).toBe(WEAPON_HELP[family]);
      f.run.stage = 8; f.run.phase = 'shop'; f.run.pilot.credits = 1000;
      expect(purchase(f.run, 'tier')).toBe(mode !== 'invaders');
      expect(buildHud(f).text.weaponReadout).toBe(`${family.toUpperCase()} ${mode === 'invaders' ? 2 : 3}`);
    });
  }
  it('reflects repairs, shield caps, legal cargo and contraband without a game instance', () => {
    const f = frame(); f.run.pilot.hull = 10; f.run.pilot.shield = 20;
    pickup(f.run, { type: 'shieldCell', amount: 1 }); pickup(f.run, { type: 'legalCargo', amount: 2 }); pickup(f.run, { type: 'contraband', amount: 1 });
    const model = buildHud(f); expect(model.text.hullReadout).toBe('40'); expect(model.text.shieldReadout).toBe('50 / 100'); expect(model.text.cargoReadout).toBe('CARGO 2 / X 1');
  });
  it('displays Invaders accuracy, cooldown and the next-life milestone', () => {
    const f = frame('invaders'); f.run.accuracy = { shots: 3, hits: 1, misses: 2 }; f.run.nextLifeScore = 40000; f.shotDelay = 0.8;
    const model = buildHud(f); expect(model.text.sectorName).toBe('ACCURACY 33%'); expect(model.text.reputation).toBe('HIT 1/3 / MISS 2');
    expect(model.text.creditReadout).toBe('NEXT LIFE 40,000'); expect(model.text.speedReadout).toBe('0.8s'); expect(model.hidden['.reticle']).toBe(true);
    f.shotDelay = 0; expect(buildHud(f).text.speedReadout).toBe('READY');
  });
  it('shows held protection, life count and normal state after expiry', () => {
    const f = frame(); f.run.lives = 2; f.protection = 2.2;
    expect(buildHud(f).text.hitCallout).toBe('2 LIVES LEFT / RESPAWN SHIELD 3s'); expect(buildHud(f).hidden['#protectionLayer']).toBe(false);
    f.menu = 'pause'; expect(buildHud(f).hidden['#protectionLayer']).toBe(true);
    f.menu = ''; f.protection = 0; expect(buildHud(f).text.hitCallout).toBeUndefined(); expect(buildHud(f).hidden['#protectionLayer']).toBe(true);
  });
});
describe('mission and course readouts', () => {
  it('includes blue police and red pirate contacts during asteroid flight', () => {
    const f = frame('smuggler'); f.bonus = bonus('asteroids');
    const contacts = [{ position: new Vector3(10, 15, -300), color: '#75caff', glyph: 'ship' as const },
      { position: new Vector3(-10, -15, -200), color: '#ff4055', glyph: 'ship' as const }];
    f.bonus.radarContacts = contacts;
    expect(buildHud(f).radar).toEqual(contacts);
  });
  it('chooses the nearest live hostile for the objective indicator and ignores hidden contacts', () => {
    const f = frame('invaders'), near = actorFixture({ id: 1 }), far = actorFixture({ id: 2 }), hidden = actorFixture({ id: 3 });
    near.object.position.set(50, 0, -100); far.object.position.set(-300, 0, -400); hidden.object.visible = false;
    f.actors = [far, near, hidden]; hidden.dead = true;
    expect(buildHud(f).text.objectiveArrow).toBe('> ALIEN  112');
    expect(buildHud(f).radar).toHaveLength(2);
    f.messages = [{ text: 'REINFORCEMENTS' }]; f.arrivalTime = 1;
    expect(buildHud(f).text.messageLog).toBe('REINFORCEMENTS'); expect(buildHud(f).text.missionTitle).toBe('REINFORCEMENTS ARRIVED');
    f.definition.kind = 'boss'; near.role = 'carrier'; near.essential = true;
    f.actors = [...f.actors, actorFixture({ kind: 'part', parent: 1 })];
    expect(buildHud(f).text.missionProgress).toContain('1 OUTER SYSTEMS');
  });
  it('selects recovery or gate instructions directly from completion state', () => {
    const f = frame(); f.run.cleared = true; f.run.phase = 'cleared'; f.gate = actorFixture({ kind: 'gate', faction: 'neutral' }); f.gate.object.position.set(0, 60, -200);
    const model = buildHud(f, 100); expect(model.text.missionProgress).toBe('HEAD TO THE WARP GATE!'); expect(model.text.objectiveArrow).toContain('WARP UP');
    expect(buildHud(f, 200).styles['#objectiveArrow']).not.toEqual(model.styles['#objectiveArrow']);
    f.run.phase = 'recovery'; expect(buildHud(f).text.missionTitle).toBe('NEXT WAVE IN 8'); expect(buildHud(f).hidden['#nextWaveButton']).toBe(false);
    f.run.timeRemaining = 19; expect(buildHud(f).text.timeBonusReadout).toBe('GATE +CR 190'); f.run.timeBonus = 190; expect(buildHud(f).text.timeBonusReadout).toBe('PAID CR 190');
  });
  it('shows rescue pickup/delivery, escort health and boss systems', () => {
    const f = frame(); f.definition.kind = 'rescue'; expect(buildHud(f).text.missionProgress).toBe('COLLECT THE WHITE POD');
    f.run.pilot.inventory.rescuePods = 1; expect(buildHud(f).text.missionProgress).toBe('DELIVER POD TO STATION');
    f.definition.kind = 'escort'; f.objectiveShip = actorFixture({ kind: 'trader', hull: 35 }); expect(buildHud(f).text.missionProgress).toBe('PROTECT CONVOY: 35');
    f.definition.kind = 'defend'; expect(buildHud(f).text.missionProgress).toBe('PROTECT STATION: 35');
    f.actors = [actorFixture({ essential: true, role: 'carrier', hull: 20, maxHull: 40 })]; f.definition.kind = 'boss'; expect(buildHud(f).text.missionProgress).toBe('0 OUTER SYSTEMS / CORE 50%');
  });
  it.each(['asteroids', 'canyon', 'sequence'] as const)('%s projects loan-craft state and safe-exit visibility', kind => {
    const f = frame(); f.bonus = bonus(kind);
    if (kind === 'asteroids') f.bonus.asteroidRun = { speed: 150, exitApproach: true };
    if (kind === 'canyon') f.bonus.canyon = { speed: 250, boosting: true, nextGate: 18, penalty: 200, nextGatePoints: 0 };
    const model = buildHud(f); expect(model.text.weaponReadout).toBe('SPREAD 1'); expect(model.text.hullReadout).toBe('2 / 3'); expect(model.text.missionTitle).toBe('24 SECONDS'); expect(model.hidden['#bonusExitButton']).toBe(false);
    expect(model.radarView).toEqual(COURSE_RADAR_VIEW); expect(model.hidden['#radar']).toBe(kind === 'sequence');
    expect(buildHud({ ...f, bonus: null }).radarView).toEqual(SPACE_RADAR_VIEW);
    expect(buildHud({ ...f, bonus: null }).hidden['#radar']).toBe(false);
    expect(model.text.missionProgress).toBe(kind === 'asteroids' ? 'FLY THROUGH THE EXIT GATE' : kind === 'canyon' ? 'FLY THROUGH EXIT' : 'NEXT MARKER 4 / 22');
    if (kind === 'sequence') { expect(model.text.levelClock).toBe('SHOTS 7'); expect(model.text.timeBonusReadout).toBe('BONUS SCORE 10'); }
    f.run.mode = 'smuggler'; expect(buildHud(f).hidden['#bonusExitButton']).toBe(true); expect(buildHud(f).text.creditReadout).toBe(kind === 'canyon' ? 'FLIGHT +10' : 'FLIGHT +250'); expect(buildHud(f).text.reputation).toBe('LEG START 0');
  });
  it('does not replace banked records with preview score or mutate input state', () => {
    const f = frame(); f.run.pilot.score = 900; f.profile.records.invaders = 500; f.selectedMode = 'invaders';
    for (const menu of ['title', 'scores']) { f.menu = menu; expect(buildHud(f).text.arcadeBest).toBe('000500'); expect(buildHud(f).text.arcadeScore).toBe('000000'); }
    expect(buildHud({ ...f, menu: '', run: null }).text).toEqual({});
    const before = JSON.stringify(f); buildHud(f); expect(JSON.stringify(f)).toBe(before);
  });
  it('shows canyon penalties, face-value score, next-gate reward and paused blast charging', () => {
    const f = frame(); f.run.mode = 'smuggler'; f.run.pilot.score = 1000;
    f.bonus = bonus('canyon'); f.bonus.state.points = -200; f.bonus.state.charge = 40;
    f.bonus.canyon = { speed: 100, boosting: false, nextGate: 2, penalty: 400, nextGatePoints: 200 };
    const model = buildHud(f);
    expect(model.text.scoreReadout).toBe('000800'); expect(model.text.arcadeScore).toBe('000800');
    expect(model.text.creditReadout).toBe('FLIGHT -200'); expect(model.text.levelClock).toBe('PENALTY 400');
    expect(model.text.timeBonusReadout).toBe('COURSE SCORE -200'); expect(model.hidden['#levelTimer']).toBe(false);
    expect(model.text.missionProgress).toBe('GATE 3/18 / +200'); expect(model.text.chargeReadout).toBe('BLAST 40% / PAUSED');
    f.bonus.canyon.penalty = 0; expect(buildHud(f).text.levelClock).toBe('PENALTY 0'); expect(buildHud(f).text.chargeReadout).toBe('BLAST 40%');
    f.bonus = null; expect(buildHud(f).text.creditReadout).toBe('FLIGHT +0');
  });
  it('projects radar glyphs, colours, direction and hidden contacts', () => {
    const f = frame(); const pirate = actorFixture(); pirate.object.position.set(-100, -50, -100);
    const cargo = actorFixture({ id: 11, kind: 'cargo', faction: 'neutral', drop: { type: 'contraband', amount: 1 } });
    const gate = actorFixture({ id: 12, kind: 'gate', faction: 'neutral' });
    f.actors = [pirate, cargo, gate, actorFixture({ kind: 'part' }), actorFixture({ dead: true })]; f.threat = pirate;
    const model = buildHud(f); expect(model.radar!.map(c => c.glyph)).toEqual(['ship', 'cargo', 'gate']); expect(model.radar![1].color).toBe('#ff55ef');
    expect(model.text.threatArrow).toContain('< INCOMING DOWN'); expect(model.styles['#threatArrow'].color).toBe('#ff6868');
    pirate.object.position.set(0, 0, 100); expect(buildHud(f).text.threatArrow).toContain('TURN BACK');
    pirate.dead = true; expect(buildHud(f).hidden['#threatArrow']).toBe(true);
  });
});
