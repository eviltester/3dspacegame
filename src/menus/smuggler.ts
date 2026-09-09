import { flightControls, boostControls, pauseControls } from '../input-layouts';
import type { ControlScheme } from '../input-layouts';
import { SMUGGLER_EXTRA_LIFE_SCORE } from '../modes';
import { CANYON_GATE_SCORING_BRIEF } from '../canyon-gates';

export function smugglerInstructions(scheme: ControlScheme): string {
  return `
    <h2>DELIVER THE HAUL</h2><p>Alternate asteroid belts and canyon runs. Speed is automatic. ${boostControls(scheme)} ${flightControls(scheme)} Hits recharge blast; intercepting shots charges it faster.</p>
    <h2>ASTEROID BELTS</h2><p>Dodge rocks and collect yellow salvage. Shooting rocks splits them into smaller pieces and might release a shield or full repair. Later belts include pirates and police who fire at your skiff. Shoot or avoid their fire, then fly through green EXIT.</p>
    <h2>CANYON RUNS</h2><p>Shooting crates might release yellow haul. Collect it to deliver it. ${CANYON_GATE_SCORING_BRIEF} Guns mount on the floor, canyon walls and fixed pillar tops. Shoot them for points. Dodge barriers and find EXIT in the final wall.</p>
    <p>Each missed projectile costs 50 points. Intercepting enemy fire earns points. One skiff per life: shields absorb impacts first, then hits fill DAMAGE. At full damage you lose a life. Blue pickups restore some shield and repair damage; pink pickups fully repair.</p>
    <h2>FINISH BONUSES</h2><p>Time left on the clock earns points. Fly through EXIT for Clean Finish, and cross at maximum boost for Boost Finish. Avoid enemy shots for No Hit, avoid collisions for No Crash, use no guns or blast for Peacemaker, and pass every canyon gate for Super Flyer. Missing EXIT still advances, but costs points and loses your haul.</p>
    <p>Start with three lives. Shields and damage carry between legs. Extra life every ${SMUGGLER_EXTRA_LIFE_SCORE.toLocaleString('en-GB')} points, up to five lives, awarded at the end of a flight. ${pauseControls(scheme)} Saved flights restart the leg with score, damage and bonus eligibility intact. Losing a life shows a four-second restart countdown, then retries with a fresh skiff.</p>`;
}
