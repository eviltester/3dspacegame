import type { HudFrame, HudModel } from '../rendering/hud-model';
import { tunnelEncounter } from './encounters';
import { laneDelta, tunnelShape } from './shapes';
import { tunnelAccuracy } from './rules';
import { TUNNEL_WEAPON_HELP } from './menus';
export function tunnelHud(frame: HudFrame, model: HudModel): HudModel {
  const run = frame.run, s = run?.tunnel;
  const active = run?.mode === 'tunnels';
  model.classes.push({ selector: '.game-shell', name: 'tunnel-hud', active });
  model.classes.push({ selector: '.game-shell', name: 'tunnel-collapse', active: active && s?.phase === 'collapse' });
  if (!active || !s) return model;
  const shape = tunnelShape(run.stage), d = tunnelEncounter(run.stage);
  const threatened = s.entities.some(e => e.warning >= 0 && e.targetId === -1 && Math.abs(laneDelta(s.lane, e.targetLane, shape.closed)) < (e.role === 'gunship' ? 1.5 : 0.5));
  const remaining = s.entities.filter(e => e.required).length + Math.max(0, (d.groups - s.group) * d.count - s.spawnIndex);
  Object.assign(model.text, {
    stageLabel: `TUNNEL ${run.stage}`, sectorName: shape.name, reputation: shape.closed ? 'CLOSED LOOP' : 'OPEN TRACK',
    missionTitle: s.phase !== 'assault' ? 'ASSAULT CLEARED' : threatened ? 'INCOMING FIRE - DODGE OR SHOOT' : 'DEFEND THE EDGE',
    missionProgress: s.phase === 'salvage' ? `COLLECT CARGO / ${Math.ceil(s.remaining)}s` : `${remaining} ENEMIES / ACCURACY ${tunnelAccuracy(run)}%`,
    topLives: String(run.lives), topShield: String(run.skiff.shield),
    creditReadout: `NEXT LIFE ${run.nextLifeScore.toLocaleString('en-GB')}`, cargoReadout: `CARGO ${run.pilot.inventory.legalCargo + run.pilot.inventory.rareMineral + run.pilot.inventory.rescuePods} / X ${run.pilot.inventory.contraband}`,
    weaponReadout: `${run.family.toUpperCase()} ${run.tiers[run.family]}`, speedReadout: '',
    courseHeading: `TUNNEL ${run.stage} CLEARED`, courseHaul: `CARGO +${s.result?.cargo ?? 0}`,
    courseAwards: `CLEAR +${s.result?.clear ?? 0} / ACCURACY ${s.result?.percent ?? 0}% +${s.result?.accuracy ?? 0}`,
    courseScore: `SCORE ${run.pilot.score.toLocaleString('en-GB')}`, courseLives: `${run.lives} LIVES LEFT`, courseNext: `NEXT TUNNEL IN ${Math.ceil(s.remaining)}`,
    lifeLostLives: `${run.lives} LIVES LEFT`, lifeLostCountdown: `RESTART IN ${Math.ceil(s.respawn - 1e-6)} SECONDS`
  });
  Object.assign(model.hidden, { '#survivalStats': false, '#levelTimer': true, '#objectiveArrow': true, '#threatArrow': true,
    '#livesReadout': true, '#bonusExitButton': true, '#nextWaveButton': true, '#touchBoost': true, '#touchThrottle': true,
    '#lifeLost': s.respawn <= 0 || !!frame.menu, '#courseSummary': s.phase !== 'result' || !!frame.menu,
    '#courseHaul': false, '#courseAwards': false, '#courseCondition': true });
  model.classes.push({ selector: '.game-shell', name: 'smuggler-hud', active: true },
    { selector: '.game-shell', name: 'life-lost', active: s.respawn > 0 && !frame.menu },
    { selector: '.game-shell', name: 'course-intermission', active: s.phase === 'result' && !frame.menu });
  model.titles['#weaponReadout'] = TUNNEL_WEAPON_HELP[run.family]; model.radar = null;
  return model;
}
