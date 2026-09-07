import type { RunState } from '../arcade';
import { smugglerLeg } from '../smuggler';
import { flightControls, boostControls, pauseControls } from '../input-layouts';
import type { ControlScheme } from '../input-layouts';
import { button } from './menu-shell';
import type { MenuView } from './views';
import { CANYON_GATE_BRIEF } from '../canyon-gates';
import { CANYON_COMBAT_BRIEF, CANYON_REPAIR_BRIEF } from '../canyon-combat';

export class SmugglerMenus {
  static briefing(run: RunState, scheme: ControlScheme): MenuView {
    const leg = smugglerLeg(run.stage);
    const instructions = leg.kind === 'asteroids'
      ? 'Dodge rocks and collect yellow salvage. Later belts include fast oncoming pirates and friendly police. Shot rocks can drop a blue shield (+1 hull, 1 in 15) or pink full repair (1 in 30). The belt accelerates: fly through green EXIT.'
      : `${CANYON_COMBAT_BRIEF} ${CANYON_REPAIR_BRIEF} ${CANYON_GATE_BRIEF} Later levels add fixed/retracting pillars and half-walls. Dodge around or above them. Find EXIT in the final wall. Speed is automatic. ${boostControls(scheme)}`;
    return ['briefing', 'SMUGGLER RUN', `LEG ${run.stage} / ${leg.kind === 'asteroids' ? 'ASTEROID BELT' : 'CANYON RUN'} / DIFFICULTY ${leg.difficulty}`, `
      <section class="mission-briefing"><h2 id="missionBriefTitle">DELIVER THE HAUL</h2><p id="missionBriefObjective">${instructions}</p><p id="missionBriefCaution">${flightControls(scheme)}</p></section>
      <p class="menu-description">Three hull points. A crash or missed exit costs one life and retries this leg. Flight points survive every life; EXIT adds delivery and hull bonuses. ${leg.kind === 'asteroids' ? 'Each salvage or target unit earns 25 points.' : 'Gate and combat points count immediately. Undelivered haul is lost on a crash or restarted leg.'}</p>
      <p class="run-loadout">${run.lives} LIVES / SCORE ${run.pilot.score} / NEXT LIFE ${run.nextLifeScore}</p><p class="safe-bonus">Extra life every 5,000 points, up to five lives, awarded at the end of a flight. ${pauseControls(scheme)} Saved flights restart the current leg with their score intact.</p>
      <div class="menu-actions">${button('launch', 'START RUN', 'id="launchButton"')}${run.practice ? button('levelWarp', 'CHOOSE LEVEL') : ''}${button('title', 'TITLE SCREEN')}</div>`];
  }
}
