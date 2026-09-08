import type { RunState } from '../arcade';
import { CONTROL_LAYOUTS } from '../input-layouts';
import type { ControlScheme } from '../input-layouts';
import { button } from '../menus/menu-shell';
import type { MenuView } from '../menus/views';
import { tunnelShape } from './shapes';
export const TUNNEL_WEAPON_HELP = {
  pulse: 'Single-lane precision. Intercept incoming shots and pick out pirates among friendly traffic.',
  spread: 'Three bolts into neighbouring lanes with a longer wait between volleys. Every bolt counts toward accuracy. Watch for police and traders.',
  lance: 'A powerful bolt that pierces three targets in one lane, with the longest wait between shots. Break lines of enemies and rocks.'
};
export function tunnelBriefing(run: RunState, scheme: ControlScheme): MenuView {
  const shape = tunnelShape(run.stage), keys = CONTROL_LAYOUTS[scheme];
  return ['briefing', 'TEMPESTUOUS TUNNELS', `TUNNEL ${run.stage} / ${shape.name} / ${shape.closed ? 'CLOSED LOOP' : 'OPEN TRACK'}`, `
    <section class="mission-briefing"><h2 id="missionBriefTitle">DEFEND THE EDGE</h2><p id="missionBriefObjective">Destroy the assault. Enemies that reach the edge become edge pursuers, chasing and shooting at you across lanes. Shoot their lane before they strike. Every tenth tunnel ends with a carrier: destroy its two guns, then its core.</p>
    <p id="missionBriefCaution">${keys.horizontal} moves between lanes. A / D or Left / Right arrows always work too: tap for one lane, hold to keep moving. Hold ${keys.fire}, Space, J or Z to fire; ${keys.blast}, K or X uses a charged blast. ${shape.closed ? 'Keep moving around the full loop.' : 'The track stops at both ends.'} No throttle or boost. Vertical movement has no effect.</p></section>
    <p class="menu-description">Enemies flash red before firing. Change lanes or shoot the incoming fire. Enemies aim at the lane you occupied when the warning began.</p>
    <p class="weapon-purpose">${TUNNEL_WEAPON_HELP[run.family]}</p>
    <p class="menu-description">Pirates are hostile. Police and green traders are protected: attacking them makes you wanted until the next tunnel. Collect cargo in its lane. Legal goods pay out after each tunnel; contraband sells every fifth tunnel and can be detected by police scans.</p>
    <p class="menu-description">Asteroids split into neighbouring lanes. Dodge walls and rising pillars. Shields absorb hits; once they reach zero, the next hit costs one life. Blue pickups restore 20 shield, pink pickups refill shields, and weapon cores upgrade your weapon. Extra life every 35,000 points. Misses cost no points; accuracy of 80% / 90% / 100% earns 500 / 1,000 / 2,000.</p>
    <p class="run-loadout">${run.lives} LIVES / SCORE ${run.pilot.score} / ${run.family.toUpperCase()} ${run.tiers[run.family]}</p>
    <div class="menu-actions">${button('launch', run.tunnel?.elapsed ? 'RESUME TUNNEL' : 'PLAY GAME', 'id="launchButton"')}${run.practice ? button('levelWarp', 'CHOOSE LEVEL') : ''}${button('title', 'TITLE SCREEN')}</div>`];
}
