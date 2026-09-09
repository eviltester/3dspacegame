import type { WeaponFamily } from '../arcade';
import { CONTROL_LAYOUTS } from '../input-layouts';
import type { ControlScheme } from '../input-layouts';
export const TUNNEL_WEAPON_HELP = {
  pulse: 'Single-lane precision. Intercept incoming shots and pick out pirates among friendly traffic.',
  spread: 'Three bolts into neighbouring lanes with a longer wait between volleys. Every bolt counts toward accuracy. Watch for police and traders.',
  lance: 'A powerful bolt that pierces three targets in one lane, with the longest wait between shots. Break lines of enemies and rocks.'
};
export function tunnelInstructions(family: WeaponFamily, scheme: ControlScheme): string {
  const keys = CONTROL_LAYOUTS[scheme];
  return `
    <h2>DEFEND THE EDGE</h2><p>Destroy the assault. Enemies that reach the edge become edge pursuers, chasing and shooting at you across lanes. Shoot their lane before they strike. Every tenth tunnel ends with a carrier: destroy its two guns, then its core.</p>
    <p>${keys.horizontal} moves between lanes. A / D or Left / Right arrows always work too: tap for one lane, hold to keep moving. Hold ${keys.fire}, Space, J or Z to fire; ${keys.blast}, K or X uses a charged blast. Closed tunnels wrap around the full loop; an open track stops at both ends. No throttle or boost. Vertical movement has no effect.</p>
    <p>Enemies flash red before firing. Change lanes or shoot the incoming fire. Enemies aim at the lane you occupied when the warning began.</p>
    <p>${TUNNEL_WEAPON_HELP[family]}</p>
    <p>Pirates are hostile. Police and green traders are protected: attacking them makes you wanted until the next tunnel. Collect cargo in its lane. Legal goods pay out after each tunnel; contraband sells every fifth tunnel and can be detected by police scans.</p>
    <p>Asteroids split into neighbouring lanes. Dodge walls and rising pillars. Shields absorb hits; once they reach zero, the next hit costs one life. Blue pickups restore 20 shield, pink pickups refill shields, and weapon cores upgrade your weapon. Extra life every 35,000 points. Misses cost no points; accuracy of 80% / 90% / 100% earns 500 / 1,000 / 2,000.</p>
    <p>Start with three lives. Shields and weapons carry between tunnels. Losing a life preserves your score and defeated enemies. Continue from the tunnel checkpoint after Game Over with a fresh score.</p>`;
}
