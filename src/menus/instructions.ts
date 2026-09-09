/** Mode rules are available on demand, independent of a live run or checkpoint. */
import type { GameMode, WeaponFamily } from '../arcade';
import { FAMILIES } from '../arcade';
import { CONTROL_LAYOUTS, flightControls } from '../input-layouts';
import type { ControlScheme } from '../input-layouts';
import { INVADER_EXTRA_LIFE_SCORE } from '../modes';
import { DEFENSIVE_MISS_PENALTIES } from '../combat/defensive-position';
import { weaponSpec } from '../weapons';
import { tunnelInstructions } from '../tunnels/menus';
import { smugglerInstructions } from './smuggler';

export function modeInstructions(mode: GameMode, family: WeaponFamily, scheme: ControlScheme): string {
  if (mode === 'tunnels') return tunnelInstructions(family, scheme);
  if (mode === 'smuggler') return smugglerInstructions(scheme);
  const keys = CONTROL_LAYOUTS[scheme];
  if (mode === 'invaders') return `
    <h2>HOLD THE LINE</h2><p>${keys.horizontal} moves LEFT / RIGHT. Fire straight ahead. Hold ${keys.fire} to fire; ${keys.blast} uses a charged blast.</p>
    <p>Destroy each formation to warp to the next wave. Watch for circling squads, looping convoys and diving swarms. Aliens recover faster as waves advance and their numbers fall. Some shots aim into open spaces: avoid dodging into them. Shoot incoming fire to charge blast.</p>
    <p>Police flybys declare you WANTED and attack with a siren and rapid fire. Pirate cruisers fire bursts and drop flashing mines. Shoot or dodge the mines. Catch fleeing gold couriers for bonus points and gold 2X aliens for double points before their marker fades. The last alien fires rapidly throughout its escape, aiming at you first then scattering shots. Shoot it during the dash for a +500 bonus.</p>
    <p>Watch for short asteroid storms. Every sixth wave is an asteroid field: survive the countdown as rocks and mines fall toward your lane, with occasional police or pirate flybys. Shot rocks split into smaller, spreading fragments. Flybys are optional targets; escaping ships give no kill points.</p>
    <p>One blast per wave. Charge keeps building after use, ready for the next wave.</p>
    <p>MISS COST: Pulse -${DEFENSIVE_MISS_PENALTIES.pulse}; Spread -${DEFENSIVE_MISS_PENALTIES.spread} per bolt; Lance -${DEFENSIVE_MISS_PENALTIES.lance} points. Spread fires three separately scored bolts; two misses cost 200 points. Hits and interceptions count toward wave accuracy. Mines take four bolt hits or one Lance hit to destroy.</p>
    <p>A full shield absorbs three hits. Once your shield is empty, the next hit costs a life. Destroyed aliens might release pickups that restore some shield. Weapon cores upgrade your equipped weapon. After your ship explodes, wait for it to warp back in. Control returns with three seconds of flashing blue protection.</p>
    <p>Start with three lives. Extra life every ${INVADER_EXTRA_LIFE_SCORE.toLocaleString('en-GB')} points, up to five lives. Score carries across lives; continuing after Game Over resets score.</p>
    <p>STARTING COOLDOWNS: ${FAMILIES.map(f => `${f.toUpperCase()} ${weaponSpec(f, 1, mode).cooldown.toFixed(2)}s`).join(' / ')}</p>`;
  return `
    <h2>${mode === 'journey' ? 'FLY THE JOURNEY' : 'SURVIVE THE WAVES'}</h2>
    <p>${mode === 'journey' ? 'Complete 99 missions, including pirate patrols, rescues, convoy escorts, armadas and carrier battles.' : 'Face increasingly difficult waves. Every fifth wave is a carrier battle; armadas lock you into a left/right defensive lane.'} Each mission briefing explains the current objective.</p>
    <p>${flightControls(scheme)} Shoot incoming fire to charge blast. Collect weapon cores to upgrade your equipped weapon, and build score chains by destroying enemies in quick succession.</p>
    <p>Red pirates are hostile. Blue police and green traders are allies unless you attack them. Attacking protected ships makes you wanted and brings police reinforcements.</p>
    <p>Collect cargo and powerups. Legal goods sell at friendly docks; contraband sells at black markets but risks police scans. Docks offer weapon changes, upgrades and repairs.</p>
    <p>${mode === 'journey' ? 'Complete the objective, then head to the flashing Warp Gate.' : 'Ordinary waves have a short recovery break; start the next wave immediately when ready. After a carrier battle, head to the Warp Gate.'} Finishing quickly earns a time bonus. Optional bonus sorties never block progress or risk your main ship.</p>
    <p>Start with three lives. Score carries across lives. Continue as often as you like from your checkpoint after Game Over, with a fresh score. Progress saves between missions.</p>`;
}
