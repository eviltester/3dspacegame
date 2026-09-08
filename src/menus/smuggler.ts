import type { RunState } from '../arcade';
import { smugglerLeg } from '../smuggler';
import { flightControls, boostControls, pauseControls } from '../input-layouts';
import type { ControlScheme } from '../input-layouts';
import { SMUGGLER_EXTRA_LIFE_SCORE } from '../modes';
import { button } from './menu-shell';
import type { MenuView } from './views';
import { CANYON_GATE_SCORING_BRIEF } from '../canyon-gates';

export class SmugglerMenus {
  static briefing(run: RunState, scheme: ControlScheme): MenuView {
    const leg = smugglerLeg(run.stage);
    const instructions = leg.kind === 'asteroids'
      ? 'Dodge rocks and collect yellow salvage. Later belts include pirates and police who fire at your skiff. Intercepting fire pays +10. Each missed projectile costs 50 points. Rocks can drop a blue shield (1 in 15) or pink full repair (1 in 30). Fly through green EXIT.'
      : `Crates have a 20% chance of releasing yellow haul. Collect it to deliver it. Guns pay +200; intercepted shots +10; missed shots -50 each. ${CANYON_GATE_SCORING_BRIEF} Guns mount on the floor, canyon walls and fixed pillar tops. Dodge barriers and find EXIT in the final wall.`;
    return ['briefing', 'SMUGGLER RUN', `LEG ${run.stage} / ${leg.kind === 'asteroids' ? 'ASTEROID BELT' : 'CANYON RUN'} / DIFFICULTY ${leg.difficulty}`, `
      <section class="mission-briefing"><h2 id="missionBriefTitle">DELIVER THE HAUL</h2><p id="missionBriefObjective">${instructions} Speed is automatic. ${boostControls(scheme)}</p><p id="missionBriefCaution">${flightControls(scheme)} Hits recharge blast +5%; interceptions +10%. No charging delays.</p></section>
      <p class="menu-description">One skiff per life. Shield absorbs impacts first; at zero shield, hits fill DAMAGE. At 100 damage you lose a life. Large/medium/small rocks: 50/30/20. Ships and crates: 40. Walls, floor and enemy shots: 20. Pillars/barriers: 50. Blue pickups add 20 shield and repair 20 damage; pink pickups fully repair.</p>
      <p class="menu-description">Timer: full-boost flight plus 20 seconds. Each whole second left pays 500 points. Clean Finish +3000; full-boost finish +5000; No Hit +3000 when enemies are present; No Crash +4000; no guns or blast earns Peacemaker +5000; all canyon gates earns Super Flyer +5000. Missing EXIT still advances: -2000 Missed Gate, -2000 Lost Cargo, and no haul payout. Delivered haul pays 75 each.</p>
      <p class="run-loadout">${run.lives} LIVES / SCORE ${run.pilot.score} / NEXT LIFE ${run.nextLifeScore}</p><p class="safe-bonus">Shields and damage carry between legs. Extra life every ${SMUGGLER_EXTRA_LIFE_SCORE.toLocaleString('en-GB')} points, up to five lives, awarded at the end of a flight. ${pauseControls(scheme)} Saved flights restart this leg with score, damage and bonus eligibility intact. Losing a life shows a four-second restart countdown over the moving course, then retries with a fresh skiff.</p>
      <div class="menu-actions">${button('launch', 'START RUN', 'id="launchButton"')}${run.practice ? button('levelWarp', 'CHOOSE LEVEL') : ''}${button('title', 'TITLE SCREEN')}</div>`];
  }
}
