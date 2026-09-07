import type { RunState } from '../arcade';
import { smugglerLeg } from '../smuggler';
import { flightControls } from '../input-layouts';
import type { ControlScheme } from '../input-layouts';
import { button } from './menu-shell';
import type { MenuView } from './views';

export class SmugglerMenus {
  static briefing(run: RunState, scheme: ControlScheme): MenuView {
    const leg = smugglerLeg(run.stage);
    const instructions = leg.kind === 'asteroids'
      ? 'Dodge the scattered rocks and collect yellow salvage. Large rocks split when shot. The belt accelerates: fly through the green EXIT gate.'
      : 'Follow the moving green gates. Missing two consecutively ends the leg. Shoot the red guns and amber obstacles. Find the EXIT opening in the final wall. Speed is automatic; Shift or wheel forward boosts.';
    return ['briefing', 'SMUGGLER RUN', `LEG ${run.stage} / ${leg.kind === 'asteroids' ? 'ASTEROID BELT' : 'CANYON RUN'} / DIFFICULTY ${leg.difficulty}`, `
      <section class="mission-briefing"><h2 id="missionBriefTitle">DELIVER THE HAUL</h2><p id="missionBriefObjective">${instructions}</p><p id="missionBriefCaution">${flightControls(scheme)}</p></section>
      <p class="menu-description">Three hits destroy the craft. A crash, missed exit or failed route costs one life and retries this leg. Points bank at EXIT only: 25 per salvage or target, plus delivery and hull bonuses.</p>
      <p class="run-loadout">${run.lives} LIVES / SCORE ${run.pilot.score} / NEXT LIFE ${run.nextLifeScore}</p><p class="safe-bonus">Extra life every 5,000 banked points, up to five lives. Esc pauses. Saved flights restart the current leg.</p>
      <div class="menu-actions">${button('launch', 'START RUN', 'id="launchButton"')}${run.practice ? button('levelWarp', 'CHOOSE LEVEL') : ''}${button('title', 'TITLE SCREEN')}</div>`];
  }
  static result(run: RunState, extraLives = 0): MenuView {
    return ['smugglerResult', 'HAUL DELIVERED', `SMUGGLER RUN / LEG ${run.stage} COMPLETE`, `<p class="result-score">+${run.stageReward} POINTS</p><p class="run-loadout">SCORE ${run.pilot.score} / ${run.lives} LIVES</p><p class="safe-bonus">${extraLives ? `EXTRA LIFE +${extraLives}! ` : ''}Next extra life at ${run.nextLifeScore} points.</p><div class="menu-actions">${button('depart', 'NEXT LEG', 'id="launchButton"')}${run.practice ? button('levelWarp', 'CHOOSE LEVEL') : ''}${button('title', 'SAVE AND TITLE')}</div>`];
  }
}
