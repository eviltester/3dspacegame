# 3D Vector Space Shooter

A browser local-only 3D vector arcade shooter. Built with TypeScript, Vite and Three.js.

Design: Alan Richardson
Programming: Codex

## Play

Run `npm install`, then `npm run dev`, and open the local address printed by Vite.

- Mouse, WASD and arrow keys work together: unrestricted steering in space, lateral movement in armadas.
- Hold left click: fire. Quick clicks also fire.
- Mouse wheel: adjust maintained thrust through forward, stop, and reverse. Scroll down once more after stop to back up; reverse tops out at 90, forward at 180.
- Right click: defensive blast at 100% charge, including bonus sorties. To leave a bonus early, pause and choose Exit Bonus Safely.
- 1 / 2 / 3: select Pulse / Spread / Lance during flight. Tab or a short mouse-wheel click cycles in that order.
- Hold the mouse-wheel button for 0.6 seconds, or press Esc: pause and release the mouse. A long hold does not change weapons. Up/Down or Tab/Shift+Tab selects menu options; Enter, Space, J or Z confirms. Mouse clicks also work. Settings fields keep their normal editing keys.
- R/F adjusts throttle (hold F past stop to reverse), Q/E rolls, Shift boosts and Esc pauses.
- In every mode and steering layout, hold Space, J or Z to fire; K or X uses the charged blast.

Open **Controls** from the title or pause menu to see the bindings and adjust sensitivity. Mouse and keyboard are available together; Touch / Tilt has its own device option.

The mouse sensitivity slider is saved from 0.5x to 2.0x (default 1.0x). It changes mouse steering/aiming only; keyboard and tilt sensitivity remain independent.

| Action | Controls |
| --- | --- |
| Pitch up / down | Mouse / W / S / Up / Down |
| Turn left / right | Mouse / A / D / Left / Right |
| Hold to fire | Left click / J / Z / Space |
| Charged blast | Right click / K / X |
| Increase / decrease throttle, through stop into reverse | Wheel / R / F |
| Roll left / right | Q / E |
| Boost | Shift |
| Select Pulse / Spread / Lance | 1 / 2 / 3 |
| Cycle weapon | Tab / wheel click |
| Pause | Esc / hold wheel |

Desktop flight captures mouse motion; keyboard controls also work if capture is unavailable. In armadas the steering keys slide left/right and vertical movement is locked; in bonus skiffs they move or aim the craft. Canyon throttle remains automatic, but Shift still boosts. Focus loss and hidden tabs pause every device and clear held inputs. Tab navigates menus when paused, and cycles weapons only during play.

### Phone And Tablet Controls

New touch-capable devices default to **Touch / Tilt**. An explicitly saved layout is respected; choose Touch / Tilt in Controls to change it. Touch flight does not request pointer lock.

- Drag on the game to steer, or select **Enable Tilt** in Controls and grant motion permission. Hold the phone comfortably: that becomes the neutral steering position. Tilt steers left/right and up/down; armadas keep lateral movement only.
- Tap the left half to fire, or hold it for continuous fire. Tap the right half for the charged blast. Double-tap either half to cycle weapons without triggering a blast. Single taps and the start of held fire wait 260 milliseconds to distinguish a double-tap.
- Use the on-screen pause and centre-tilt buttons. The + / - buttons adjust free-flight throttle through stop into reverse. Hold Boost to accelerate in free flight, canyons or asteroid belts; release to decelerate. Automatic courses hide the throttle buttons.
- Adjust tilt sensitivity in Controls. Tilt has a small dead zone and smoothing, and recentres on resume or a portrait/landscape change. Denied permission, unavailable sensors or interrupted motion data leave drag steering available. **Use Drag** disables tilt explicitly.

Motion controls need a secure connection, normally **HTTPS**. A phone opening the development server over a plain HTTP LAN address can use touch-drag controls, but not tilt. Motion permission is requested only from Enable Tilt and is not assumed from a saved setting. Menus retain normal touch scrolling; leaving the tab or switching apps pauses and clears held touches. Automated tests cover sensor events and permissions, but sensitivity and grip comfort should also be playtested on a physical phone.

Pirate reinforcements arrive with a brief contracting warp ring, a dedicated arrival sound, and a four-second HUD alert. Carrier-deployed fighters also announce their arrival.

The 3D radar is relative to the ship's current heading and flight plane. Solid stems rise to contacts above you; dashed stems descend to contacts below. Cargo keeps its triangle symbol and Warp Gates keep their cross symbol.

Armada briefings explain the tractor-beam trap. These stages use an elevated, angled view of the player's ship and receding enemy rows. Later armadas increase from four ships per flight to fourteen, using up to three rows with all columns inside firing reach. Total hostiles still cap at eighteen and attackers at six. Mouse movement slides the ship along its defensive lane; destroying the armada releases the beam and restores cockpit flight. Dropped salvage drifts into the lane at 24 units per second, so it can be caught during combat. Protected cargo waits at the lane if missed; ordinary drops pass through, and contraband still requires direct contact.
- Info Deck changes the displayed model every five seconds. Its arrows, or the left/right keys, browse immediately.

## Modes

**Tempestuous Tunnels** defends the near edge of a twelve-lane tunnel. Move horizontally with mouse, keyboard or touch/tilt; closed shapes wrap all the way around, while open shapes stop at their ends. Vertical steering, throttle and boost are inactive. Hold fire, switch between Pulse/Spread/Lance, and use the charged blast with the normal controls.

Keyboard lane controls work in every control layout: A/D or Left/Right move one lane per tap and repeat while held. Space/J/Z fire; K/X trigger the charged blast. Enemy models gently flash red before firing at your position when the warning began. Those shots do not follow subsequent movement. After the cargo-collection window, the camera dives down the centre and the tunnel breaks into spinning panels and particle bursts before the score summary.

Ten original shapes repeat with changing colours and seeded assaults. Pirates charge, change lanes, dive, sweep and lay mines; escaped enemies become edge pursuers. Police fight pirates unless you attack protected ships or evade a contraband fine. Every tenth tunnel includes a carrier with two guns shielding its core. Shootable asteroids split into neighbouring lanes; walls and fixed/retracting pillars force you to move. Attack and lane-change warnings last at least 0.9 seconds.

Enemies at the edge chase and fire across lanes at the same time. Their bolts remain visible, dodgeable and shootable. The last three hostiles recover faster between shots, with the final survivor firing most frequently; the warning flash and staggered attack limits still apply.

Shooting police calls a finite response of up to ten extra officers per tunnel, arriving in pairs two seconds apart after the eight-second dispatch delay. Ordinary trader/contraband warrants call two officers; attacking police raises that total to ten. Arriving wanted police hold at the far bottom until their first staggered, warned shot, then advance. Their arrival sounds a distinct siren. The response waits for space within the eighteen-hostile cap; repeated hits, life loss and reloading cannot refill it. Once all ten have arrived, extra spawning stops. Wanted status lasts until the next tunnel, and reinforcements never become required targets.

Asteroid fragments scatter sideways immediately; one in four surges towards the player at triple fragment speed after a 0.9-second warning. Open ends scatter fragments back into the track. Mines flash red, arm for 0.9 seconds, then explode within 32 depth units and 0.8 lanes of the player, removing 40 shield or destroying an unshielded life. Shooting a mine from outside that range destroys it safely. Cargo, debris and friendly traffic pass off the edge; only hostile armed ships become edge pursuers. Approaching pickups sound a repeating ping-ping-ping until collected or passed, sharing one rhythm regardless of pickup count.

Cargo is collected in its lane and converted to points after the assault. Crates release cargo with a 20% chance. Contraband stays aboard until a black-market delivery every fifth tunnel; police scans warn before confiscation and a 140-point fine, or pursuit when the fine cannot be paid. Weapon cores and shield pickups replace shopping. Start with three lives and 100 shield, with an extra life every 35,000 points. Shields carry between tunnels. A shielded hit can empty the shield but cannot cost a life; the next unshielded hit costs one life. Blue pickups restore 20 shield and pink pickups refill it. Losing a life preserves score, equipment and defeated enemies; a four-second countdown precedes a protected respawn with full shields.

Tunnel tier-one firing cooldowns are 0.22 seconds for Pulse, 0.65 for Spread and 1.00 for Lance. Each upgrade shortens these by 8% of the base time. Switching weapons does not bypass the wait; bolt travel speeds are unchanged.

Misses cost no points in this mode. Spread counts three individual shots; Lance counts one accuracy hit even when piercing multiple targets. Accuracy of 80%, 90% and 100% pays 500, 1,000 and 2,000 points respectively; zero shots earn no accuracy bonus. After clearing, three seconds of safe cargo collection precede a three-second results display. The title has separate tunnel records and resume; Level Warp supports tunnel practice. Saves retain the exact encounter and pending projectile outcomes.

Arcade Journey has 99 stages. The first twelve stages introduce patrol, rescue, armada, carrier; ambush, escort, diving armada, shield carrier; station defence, fleet assault, elite armada, command carrier. Stages 13-96 remix those encounter types with shifted enemy combinations, more flights and shorter arrival gaps. Stages 97-99 close with an ambush, a fleet assault and the Terminal Carrier. Ordinary fighter health stays fixed; hostiles cap at 18, attackers at six and projectile-speed growth at 35%.

Attack Challenge has compact numbered waves, formation encounters on waves 3/8/13/etc., and a carrier every fifth wave. Its own difficulty curve raises movement, firing cadence, aiming lead and reinforcement pressure after every wave, including beyond wave 1000. Reinforcement budgets grow logarithmically with the wave number; handling speeds approach playable limits instead of growing without bound. Ordinary-wave recovery decreases from eight seconds initially to about 2.75 seconds at wave 1000; a fresh click starts the next wave early.

Later Attack Challenge carriers have finite escort flights as well as their own drone bays. Wave 10 has one escort flight; wave 100 has four; wave 1000 has seven flights of fourteen fighters, plus a carrier capable of launching seventeen more until its lower bays are destroyed. Destroying the carrier does not skip its remaining escort flights. Ordinary wave 1001 has thirteen flights; wave 10001 has eighteen. Scheduled flights arrive about every four seconds at wave 1000, with quicker replacement after a fast clear.

Enemy hull and damage stay fixed. Fighters acquire three-shot fans at wave 75, and heavy ships five-shot fans at wave 150. The 0.8-second attack warning and initial spawn grace remain intact. Eighteen hostiles, six simultaneous attackers, 240 live projectiles and 35% projectile-speed growth remain hard safety limits. Difficulty is derived from mode and wave, so retries and resumed checkpoints reconstruct the same challenge without adding save fields.

Defensive Position is an uninterrupted formation campaign. Original alien saucers cycle through marches, circular orbits, three-ship swarms, figure-eights, mirrored pincers, coils, swoops, following convoys and weaving rows. Reinforcements arrive in staggered groups of up to three, with reserved formation slots and spacing maintained through crossing paths. Flights grow from eight to eighteen aliens, then additional flights keep increasing the total roster. Movement and firing pressure rise every wave within readable limits. After a two-second recovery, or an early Next Wave command, the platform breaks into spinning panels and particles while the ship flies into the distance. It then warps onto a differently coloured platform. Combat, stage clocks and controls wait for arrival. Collect weapon cores and repair cells during combat. Every 35,000 points awards an extra life, capped at five, with the next milestone visible on the HUD. Crossed milestones are consumed even at the cap.

Defensive Position spread weapons occupy fixed formation slots: none before wave 13, one spread-firing alien at a time on waves 13-18, two on 19-24, three on 25-30, then one more every six waves up to six. Other formation aliens keep single-shot weapons. Destroying a spread-firing alien does not upgrade a survivor; only a new reinforcement can fill the vacated slot. Cover fire remains single-shot, and flyby attack patterns are separate.

Optional Defensive Position visitors cross behind the formation: fleeing gold couriers begin on wave 2, hostile police on wave 3, and pirate cruisers on wave 5. Each visits once on its scheduled waves, after six seconds when the battlefield has space. Defensive Position police declare the player WANTED and attack with sirens and rapid bursts; this exception does not alter other modes' faction rules. Cruisers fire varied bursts and, from wave 9, drop up to three flashing, shootable drifting mines. Bursts have a visible 0.9-second warning and share the attacker cap. All Defensive Position mines require four individual Pulse or Spread hits, or one Lance hit, at every weapon tier. Couriers award 3000 base points, police 1000 and cruisers 2000; the actual reward, including the kill-chain multiplier, appears beneath their destruction position. Escaped visitors award nothing and never block completion. A gold 2X target briefly doubles its kill value. After three seconds alone, the last required alien warns, then makes a final escape dash; escaping ends its part in the wave without kill points.

Every sixth Defensive Position wave is a timed asteroid field with ongoing falling rocks, drifting mines and a police or pirate flyby. Other selected waves receive short five-rock storms. Large rocks split into two medium rocks, each of which can split into two small fragments; fragments spread sideways with collision grace and a cap of 64. Destroyed rocks can release ordinary Defensive Position salvage. The defensive lane and all existing controls remain unchanged. Clearing formations removes optional hazards; surviving a field's countdown clears that wave.

Defensive Position rewards deliberate aim. Tier-one cooldowns are 0.60 seconds for Pulse and 1.40 seconds for both Spread and Lance; each upgrade shortens these by 8% of the base time. Switching weapons does not bypass cooldown. Aimed alien fire is staggered alongside additional cover-fire pairs, with at most eight simultaneous attack warnings. Cover bolts target reachable gaps at least 28 units from the player's current position, rather than tracking them. Individual cooldowns and fleet waits shorten with both wave progression and fewer surviving aliens; already-running cooldowns shorten after casualties too. Each attack keeps its visible warning. The HUD shows weapon readiness and the current wave's accuracy, hits, shots and misses; accuracy remains visible during recovery.

Catching the last alien during its escape dash awards a flat 500 points on top of its ordinary kill reward, with a bonus sound and prominent `LAST ALIEN +500 BONUS` message. The bonus is not multiplied by the kill chain. After its warning, the alien fires continuously throughout the dash: three rapid aimed shots, then seeded random shots across the player lane until departure. Escape firing intervals shorten from 0.22 to a minimum of 0.14 seconds with wave progression, without increasing projectile speed beyond its existing cap.

Defensive Position game over keeps the surviving fleet and rocks moving behind the score and choices. This silent background is display-only: no shots, collisions, rewards or run timers advance. Continue restores the checkpoint; Title Screen ends the background animation.

When a Defensive Position ship is destroyed with lives remaining, its hull breaks apart with an explosion sound and a central `SHIP DESTROYED` / lives-left message. The four-second sequence keeps debris and stars animating without advancing the fight. During its final 1.2 seconds the message disappears and the blue craft warps back in. Movement and weapons resume after arrival, with three seconds of invulnerability and a ready weapon. Score, equipment, defeated enemies and blast allowance are preserved; pausing freezes the sequence.

Defensive Position allows one charged blast per wave. Charge still builds after use and carries into the next wave. The HUD shows BLAST USED alongside the charge percentage until the next wave; life loss and save/resume do not grant another use. Starting a new run or continuing from game over restores the allowance.

Missed Defensive Position bolts cost 100 points for Pulse, 100 per individual Spread bolt, and 400 for Lance, regardless of the number of aliens remaining. Score is floored at zero. Spread counts as three shots: one hit and two misses means 33% accuracy and two separate penalties. Hitting an alien or intercepting hostile fire counts as a hit; Lance can hit several targets but earns one accuracy hit per bolt. Each bolt retains its firing weapon's penalty when weapons are switched. Airborne misses settle at those same penalties when the wave clears. Each new wave starts fresh accuracy counters; respawning preserves the current wave's score and accuracy.

Smuggler Run alternates asteroid belts and canyon runs. Legs 1/2 use difficulty 1, legs 3/4 use difficulty 2, through difficulty 8 at legs 15/16; later legs generate new seeded courses at that maximum difficulty. A skiff is one life: start with three lives, 100 shield and a 100-point damage meter, all three tier-one weapons and a full defensive blast. Shield and damage carry between legs and through saves; losing a life supplies a fresh craft. Target units in asteroid belts pay 25 points; canyon gate/combat points count at face value. Collected yellow salvage in either course is held as haul and pays 75 points per pickup only on delivery. Flight points survive lost lives and saved restarts. Destroyed craft retry the leg after a four-second LIFE LOST / LIVES LEFT countdown. The course continues animating behind it while the destroyed craft is inactive; RESTART IN shows the seconds remaining. Pausing freezes the countdown and background. Extra lives are awarded for every 35,000 points at settlement, up to five; consumed thresholds cannot award twice. There is no safe bonus-exit button in this mode.

Smuggler blast charge is earned by hits only, with no timed or gate-penalty lockout: +5% per successful target volley and +10% per intercepted enemy projectile. Blast damage does not recharge itself. A distinct two-part rising chime announces each recharge to 100%, without repeating while full.

All four modes begin with three lives. Score accumulates across every life, including the final loss, and resets only for a new game or Continue. While lives remain, a destroyed combat ship automatically respawns with full hull and shields, keeping the current fight, equipment, cargo, score and wave accuracy. Three seconds of protection flash the visible ship blue; cockpit flight shows a blue shield outline and a lives-remaining message. Protection freezes during pause. Failed main objectives and destroyed Smuggler craft restart from their route/equipment checkpoint without rolling score back. Zero lives opens a persistent game-over screen with a large final score. It waits for Continue or Title Screen; Continue refills three lives and resets score. Each mode owns its checkpoint, records and top-ten high-score screen.

Completed Smuggler legs show score, lives, craft condition, haul conversion and an itemized bonus/penalty breakdown for three seconds, then start the next course automatically. Pause, lost focus and hidden tabs freeze the interval. Play and Resume start the course directly. Resuming a paid result shows its saved breakdown without paying again.

Smuggler level clocks allow the full-boost route time (including acceleration from cruise) plus 20 seconds, rounded up to whole seconds. Time runs down by actual active flight time, not distance; zero stops the bonus, not the level. Each whole second remaining awards 500 points. Bonuses stack: Clean Finish +3,000 for passing EXIT, Boost Finish +5,000 for passing EXIT at least 20 speed units above that difficulty's unboosted finish speed (crossing speed counts, not how long boost is held), No Hit +3,000 if enemies were present and no enemy bullet touched the craft, No Crash +4,000 for avoiding all solid contacts, Peacemaker +5,000 for firing neither guns nor blast, and Super Flyer +5,000 for passing every canyon gate. A clean delivery also pays 1,000 plus 100 for the surviving craft and 150 per difficulty above one. Missing EXIT still completes the level, but costs 2,000 Missed Gate Penalty and 2,000 Lost Cargo Penalty; collected haul pays nothing. Save/restart retains spent time and failed bonus qualifications; a new life or new level resets the attempt.

Smuggler radar shows the live course: circles for rocks/fragments, squares for crates and solid obstacles, triangles for salvage/repair pickups, faction-coloured ship blips for guns and passing traffic, and short red strokes for incoming gunfire. A cross marks the next canyon gate or asteroid EXIT, pinned at the radar edge when distant. The course view covers 500 units ahead with magnified left/right and height separation, solid stems above and dashed stems below the skiff. Objects more than 50 units behind disappear. Collected/destroyed objects and fully retracted pillars disappear immediately; moving contacts follow their actual positions. Free-space radar retains its 650-unit scale.

The title keeps its five mode choices beside a shared tab panel. **GAME** shows the selected mode's live vector preview, starting weapon and Play, Resume or New Run buttons. **Instructions**, **Controls**, **High Scores** and **Info Deck** replace that panel's contents in place, keeping the mode choices visible. Left/Right selects tabs when the tab strip is focused; Escape returns to GAME. Long help content expands the page naturally, with ordinary page scrolling. Tab changes preserve the selected weapon, settings and Info Deck entry without affecting saves or scores. Smuggler's preview alternates the actual asteroid and canyon courses. Defensive Position, Smuggler Run and Tempestuous Tunnels launch directly. Arcade Journey and Attack Challenge show the current mission briefing, with Start Mission as its only button; Escape returns to the title.

Each combat stage or wave has a two-minute bonus clock. Entering the Warp Gate pays 10 CR per whole second remaining, with the potential payout shown beside the countdown. The clock keeps running after the objective is complete: grab more cargo or leave quickly for a larger time bonus. Zero ends the bonus, not the mission. Ordinary Attack Challenge waves and all Defensive Position waves pay when the next wave starts, so clicking early beats waiting through recovery. Briefings, pauses, shops and optional bonus sorties do not consume main-level time. Gate awards are saved immediately and paid only once, even if reloaded during warp. Smuggler Run uses course timers and delivery points instead of trading credits.

## Weapons And Rewards

Pulse is fast precision fire, Spread fires a close-range fan, and Lance fires slower bolts that pierce three targets. Each family has three tiers. Help is visible beneath the GAME tab's starting-weapon selector and at the dock; each starting choice also has a description on hover. The HUD weapon readout has a description on hover. Docks retain the run's purchased family tiers. The first destroyed hostile supplies a protected weapon core; later cores are progression-gated and become credits when capped.

In-flight weapon changes retain each family's purchased tier and do not reset the firing cooldown, shield, blast charge or throttle. All three families are available in flight; permanent unlocks still determine the starting-family choices for fresh runs. Bonus skiffs use independent tier-one weapons with the same selection controls, leaving your main ship's equipment untouched.

Interceptions charge the defensive blast by 10%; kills add 5%. At full charge, the blast clears nearby hostile fire and damages pirates within 240 units without hurting friendlies. Three kills within five seconds increase the score chain, capped at x5. Damage or inactivity resets it.

Destroyed ships shed spinning wireframe hull panels in their faction colours. After a short staggered delay, each panel bursts into a coloured spark shower with a secondary crackle. These are cosmetic effects: kills and cargo pay immediately, debris cannot hit the player or be collected, and pausing freezes the animation. Panel and shower counts are capped during mass kills.

Legal cargo sells at stations and docks; contraband sells only at the black market. The normal collection magnet is 20 units, upgraded to 35. Contraband always requires deliberate close collection. Police collect contraband only; civilians avoid it; essential mission cargo is protected.

Repair cells restore 30 hull and 30 shield, capped at the ship's capacities; in Defensive Position they restore only shield. After the guaranteed opening weapon core, each Defensive Position salvage drop has a 1-in-15 chance of being a repair cell; the rest are equally split between weapon cores and score-bearing cash salvage. Capped weapon cores award 200 extra points. Defensive Position survival is shield-only: a full shield absorbs three hits. Each hit removes a third of maximum shield capacity, rounded up; a partial shield absorbs the whole hit, and the next hit while shields are empty costs one life. Pickups or a respawn restore shields, with shield condition carried between waves. Other modes keep their normal damage and loot rules.

Dock prices: tier 2 350 CR, tier 3 800 CR, repairs 150 CR, shield capacity 300 CR, magnet 200 CR. The opening stage guarantees at least 385 CR at completion. Tier 3 opens at Journey stage 5 or Attack Challenge/Defensive Position wave 8. Fresh runs gain no permanent starting power; unlocks only offer starting weapon choices.

## Bonus Sorties

Optional asteroid, canyon and ordered-target challenges cycle after Journey stages 3, 7, 11, 15 and every fourth stage through 95. Attack Challenge cycles through them after carriers. Each bonus has eight difficulty levels: Journey stages 3/7/11 use difficulty 1, stages 15/19/23 use difficulty 2, through stages 87/91/95 at difficulty 8. Attack Challenge raises difficulty every three bosses (fifteen waves), also capped at 8. Briefings and the HUD show the current difficulty; seeds reproduce each field. The safe-exit and main-ship preservation rules below apply to optional sorties, not Smuggler Run's life-based deliveries.

Target Sequence lasts 60 seconds, increasing from 16 to 30 shuffled markers. Higher difficulties add seeded position variations, smaller mixed-size rings and faster movement. The next target is yellow. The field stays still until the first correct hit, then remaining markers drift in separate bounded paths and accelerate as more are cleared. Numbers move with their rings and do not overlap. Pausing freezes the motion along with the clock.

Each correct target earns 100 points. Every fired shot deducts 5, including misses and wrong-target hits; Spread counts as one volley, not three pellets. Holding fire counts each actual shot. Wrong targets also cost two seconds. The HUD shows shots fired and net bonus score, and results show hits, shots and net points. Shot costs reduce medals as well as score; a perfect run pays 1,520 points on difficulty 1 or 2,850 on difficulty 8. Negative bonus scores bank zero and never subtract from the main ship's banked score. Defensive blasts do not shoot or damage markers.

Canyon sorties accelerate automatically from 48 to 144 speed on difficulty 1, rising to about 72 to 215 on difficulty 8. Throttle/brake controls cannot override course speed. Both canyons and asteroid belts ramp to 1.5x their current automatic pace in about 0.77 seconds while boost is held, then ease back in about 1.43 seconds after release. No absolute boosted speed is remembered. Shift or the touch Boost button holds thrust; wheel-forward adds a refreshable 1.5-second pulse. Pausing clears held thrust. The 18 green gates mix stationary and moving openings, shrink along the route, and include four seeded half-size gates. Large stationary gates pay 50 points, small stationary gates 100, large moving gates 100, and small moving gates 200. The HUD shows the next reward, current penalty and net course score.

Each missed canyon gate raises the active penalty by 200 and deducts that amount: 200, 400, 600, and so on. A successful gate pays its reward and reduces the penalty by 200, down to zero, without refunding prior deductions. Misses neither end the flight nor spend lives. While the penalty is active, the next opening pulses vivid green and hits/interceptions cannot recharge the blast; an already charged blast can still be used. The opening's visual size and collision radius remain fixed during the pulse. The final wall has a labelled EXIT opening: fly through to finish or hit the wall. Optional sorties retain the main ship and settle the positive net course score once; Smuggler flights apply both earnings and deductions to the ongoing score.

The canyon grows from 52 shootable amber obstacles and 26 red guns to 80 obstacles and 40 guns. Later guns recover faster and their shots accelerate by up to 35%, but the warning stays at 0.85 seconds and no more than four guns engage together. They lock an intercept before the warning, then fire toward that locked point; change course to evade or shoot back. Hostile bolts are transparent and interceptable for 10% blast charge, and blasts clear nearby gunfire. Geometry leaves a traversable moving-gate corridor. Green gates, guns and obstacles also appear in Info Deck.

Floor and canyon-side guns are double size at difficulties 1-2, then shrink through 1.75x, 1.5x and 1.25x to normal size at difficulty 6. Pillar and blocking-wall mounts always use normal-sized guns. Shot targets scale with the models, but the skiff collision margin does not grow. Enlarged surface mounts extend into the corridor, with their bases flush against the scenery and fire emitted from the scaled muzzle.

Difficulty 2 adds fixed full-height and half-height pillars. Difficulty 3 adds columns that rise from the floor to full or half height, then retract completely with a pause below ground. Difficulty 4 adds full-height walls extending halfway across from either side and half-height walls across the floor. Density rises from four to eighteen solid obstacles, spaced between gate planes with room to dodge. Pillars and walls cannot be destroyed and block gunfire. Impacts use the canyon shield rule and deflect the skiff sideways or above the obstacle without stopping forward travel or repeatedly damaging it. All six shapes appear in Info Deck.

Destroying a canyon gun pays 200 points; shooting down one of its bolts pays 10 points. Shooting an amber crate gives no immediate score or cargo. It has a 1 in 5 chance to release the normal yellow haul pickup. Collecting it increases the visible carried haul, not the score; only reaching EXIT converts each pickup into 75 points. Uncollected drops, collisions and blast-destroyed crates give no haul. Gun kills from a blast still pay 200, but cleared gunfire pays no interception points.

Every canyon projectile, and every Smuggler asteroid projectile, that hits neither a target nor hostile fire costs 50 points. Spread counts each of its three bolts separately: one hit and two misses costs 100 points, minus the target reward. Lance's piercing hits count as one successful bolt. Blasts have no miss cost. Shot misses do not increase the gate-penalty counter or block charging by themselves.

Shot asteroids (including fragments) have a 1 in 15 chance of dropping a blue shield and a 1 in 30 chance of dropping a pink full repair. Shot canyon crates have the shield chance; shot canyon guns have the full-repair chance. Each destroyed object can release at most one repair pickup; the crate's separate 20% haul roll can also succeed. In Smuggler Run a shield pickup restores 20 shield and repairs 20 damage; a full repair fills shield and clears damage. Pickups never grant extra skiffs or lives. Optional sorties repair one of their three temporary hull points with a shield pickup, or all hull points with a full repair. Neither mode revives destroyed craft. Pickups are radar triangles with a 20-unit magnet. Blasts and collisions do not release pickups.

Smuggler impact costs: large asteroid 50, medium 30, small 20, ship or crate 40, canyon wall/floor 20, enemy shot 20, pillar/barrier 50. Shield absorbs a hit without spilling into damage on that same hit. With no shield, that amount fills the damage meter; 100 damage destroys the skiff and costs one life. Continuous solid contact has 1.2 seconds of grace; gun hits count individually. Respawn protection ignores damage, but contact still disqualifies the corresponding No Hit or No Crash award. In optional sorties, guns and solid objects cost 20 shield or one of three temporary hull points; wall/floor scrapes cost 10 shield or 10 partial damage. Missing an optional sortie's final EXIT ends that bonus only. Smuggler guns mount on varied floor positions, both canyon walls, and fixed pillar tops from difficulty four; moving pillars never carry guns.

The asteroid belt has weaving gaps. Shooting a large rock produces two medium rocks; each medium rock splits into two small fragments, which can be destroyed outright. Fragments tumble and drift across the flight path, with a brief bright collision-grace flash after breakup. A volley cannot destroy its own newly spawned fragments. Charged blasts vaporize nearby rocks without splitting them. At most 64 fragments are active, and fragments expire after passing the player or twelve seconds.

From asteroid difficulty 3, some rock positions contain oncoming pirate and police ships: four ships initially, increasing to fourteen at difficulty 8. They approach faster than drifting rocks, weave gently, point their noses along their flight direction and never turn back after passing. At most three approach at once. In Smuggler Run both factions attack: a yellow lock-on flash precedes fire by at least 0.85 seconds, with staggered cooldowns and at most 24 active bolts. Both are destructible for 25 points and break into spinning hull panels and sparks. Their transparent, faction-coloured bolts appear on radar and can be intercepted for 10 points and 10% charge. Blasts destroy nearby hostile patrols and clear their fire. Optional asteroid sorties retain friendly, non-firing police. Either ship can damage the skiff in a collision.

Asteroid flight accelerates automatically from 48 to 112 speed across the sixty-second first belt. By difficulty 8, the same route has 180 rocks instead of 110 and takes about 40 seconds, accelerating from about 72 to 167; fragments drift faster too. Each level preserves a traversable weaving gap. The HUD shows the current speed and announces the final approach. A hollow green gate with a yellow EXIT label and arrow sits beyond the last rocks. Fly through its opening to complete the sortie; flying past it ends the bonus as an exit miss, with partial rewards and the main ship preserved. Shots and blasts cannot destroy the gate.

Sorties use temporary craft health. Completion, failure, timeout, skipping and manual exit never cost main-ship equipment, cargo or lives. Partial performance pays salvage or bronze/silver/gold rewards once per offer; gold can add a life up to five. An interrupted saved bonus is treated as consumed, so reloading cannot duplicate payment.

Loan skiffs start with an independent, fully charged defensive blast. Right click clears rocks and hostile surface targets within 240 units, without harming salvage, gates or numbered markers. Successful shots restore 5% charge; the blast does not recharge itself. Your main ship's charge is preserved.

## Sound Cues

Pulse, Spread and Lance have separate firing sounds. Pirate archetypes, the three Defensive Position fighter types, police interceptors, trader haulers, trader saucers, carrier turrets and canyon guns each have their own firing identity. Asteroid patrols retain their faction sounds. Guns of the same type share a sound regardless of where they are mounted.

- All collected cargo and powerups share the pickup chirp, including weapon cores, shields and repairs.
- Weapon switching uses a mechanical click; shop purchases and cargo sales share a transaction clink.
- Extra lives use a single ringing ping, given playback priority during busy combat.
- Bonus payments use a short rising phrase; positive course score changes use a brief, quieter tick.
- Police dispatch uses a siren phrase, scans use a stepped sweep, approaching patrols use a low double knock, and enemy lock-on uses a short metallic alarm.
- Exit approach uses a navigation tone. Missed canyon gates use a falling buzz; reducing a gate penalty uses a short confirmation, and clearing it uses a rising resolved tone.
- Wrong numbered targets use a rasp. Missed shots use a low thud.

Course controllers emit typed sound events, separately from messages and score totals. Identical events are coalesced per tick while different firing voices remain independent. Lock-on alarms are rate-limited; all effects respect mute and the shared playback limiter. Sound definitions and event routing live in `src/audio`, with Web Audio playback in `src/sound.ts`.

## Saves

Progress uses `vector-shooter-save-v2` in browser local storage, with separate checkpoints, top-ten scores and normal/continued records for each mode. Settings and unlocked starting-weapon choices are saved alongside progress. Fresh runs start with mode-specific equipment and no carried-over money or upgrades.

Top-ten entries identify a run across retries and resumes, with a separate entry for a continued score. At game over or Journey completion, a qualifying score offers three-letter initials: type A-Z and press Enter or select Save. Initials appear beside the score and survive reloads. Unnamed entries display `---`. Resuming restores the available checkpoint without duplicating rewards.

## Verification

### Hidden Level Warp

On the title screen, press Up, Up, Down, Down, B, A. A short original chime and "BONUS UNLOCKED" message reveal Level Warp. The unlock survives reloads in the current tab. Its mouse-operated menu jumps to any of the 99 Journey stages, any Attack Challenge or Defensive Position wave, any Smuggler leg, or directly to Asteroid Run, Canyon Sortie and Target Sequence. The bonus difficulty selector offers levels 1-8 and jumps to the corresponding Journey offer. Briefings still appear before launch. Pause a test flight and choose Choose Level to jump again.

Warp flights use a fixed seed and clean starting equipment. They are labelled TEST and never overwrite normal checkpoints, records or permanent unlocks. Progression, shops, retries and bonus exits still work inside the temporary flight.

### Checks

Use Node.js 24 or newer, matching CI. On a fresh checkout:

```sh
npm ci
npx playwright install chromium
npm test
```

- `npm test`: runs unit tests with enforced coverage thresholds, integration tests, then the focused Playwright suite. No manually started server is needed.
- `npm run test:unit`: source-adjacent tests of rules, controllers, view models and Testing Library DOM interactions; no application instance or Chromium.
- `npm run test:integration`: short checks that menu actions, lifecycle events and HUD updates are wired into the application.
- `npm run test:e2e`: native controls, short play flows, responsive menus, audio and WebGL rendering.
- `npm run test:e2e -- tests/e2e/controls.spec.ts`: run one browser suite.
- `npm run test:e2e:ui`: interactive Playwright test explorer.
- `npm run test:report`: open the last browser HTML report, including attached screenshots and failure traces.
- `npm run test:coverage`: unit-only coverage in `coverage/index.html`, with strict module thresholds for session decisions, HUD projection and gameplay rules.
- `npm run lint`: type-aware ESLint, including unsafe values, unhandled promises and unused code.
- `npm run typecheck`: strict TypeScript checks for application, tests and configuration.
- `npm run build`: typecheck and production bundle.
- `npm run check`: lint, static types, fast tests with coverage, and the browser suite with a production build. Each suite runs once.
- `npm run check:commit`: checks the staged commit with the same unit coverage thresholds as CI.

`npm ci` and `npm install` automatically install the versioned pre-commit hook. For an existing checkout, `npm run prepare` installs it without reinstalling dependencies. Normal commits are blocked if tests or coverage thresholds fail. The hook exports staged files into a temporary directory, reuses installed dependencies, and leaves the working tree and index unchanged. Stage the corresponding tests with each code change; unstaged fixes cannot make a failing commit pass. A different staged dependency lock requires aligning dependencies and running `npm ci` before committing. Existing custom Git hooks are reported rather than overwritten.

The commit hook runs unit and DOM component coverage only, not browser tests. CI independently enforces coverage and the remaining checks before deployment.

Playwright manages a separate server at `127.0.0.1:5180`; it will not reuse an existing process there. It leaves the player's development server on port 5173 and browser saves alone. Each test gets a fresh browser context. Browser tests run serially to avoid WebGL and pointer-lock contention. Stage destinations, respawns, rewards and course outcomes are tested directly from state; course geometry is tested with its own controller.

Failure screenshots, traces and machine-readable test timings are in `test-results/`, with the HTML report in `playwright-report/`. These generated directories are ignored by Git. CI installs headless Chromium and runs the same checks on each push and pull request.

Suite responsibilities and coverage boundaries are documented in [Testing](docs/testing.md). Browser checks cannot prove human enjoyment, audio-device output, or playability on every GPU.

## Structure And Originality

Start with the [Code Guide](docs/code-guide.md) for a human-readable tour, the game-loop flow, save/reward rules, and a map of where to make changes. Comments in the source explain the less obvious decisions and ownership boundaries.

- `game.ts`: fixed 60 Hz orchestration connecting controllers to input, world objects, audio and browser presentation.
- `flight-motion.ts`, `combat/aim.ts`: relative flight/lane movement and hostile-only aim assistance, independent of browser input delivery.
- `session/flight-lifecycle.ts`: damage, queued respawn, life-loss delay, pause, protection and persistent game over.
- `session/stage-flow.ts`, `session/encounter-outcome.ts`: objective requirements, opening salvage, once-only settlements and transition destinations.
- `modes.ts`, `invaders.ts`, `smuggler.ts`, `scores.ts`: mode definitions, alien formations, delivery/life rules and per-mode score tables.
- `combat/weapon-fire.ts`, `combat/defensive-blast.ts`: ship-wide cooldowns, volley emission and faction-safe charged blasts.
- `combat/projectiles.ts`: projectile ownership, swept contacts, interceptions and faction collision rules.
- `combat/enemies.ts`: enemy movement, targeting, warnings and attack cadence.
- `world/actors.ts`: actor lifecycle, original encounter formations and level population.
- `world/interactions.ts`: salvage magnets, trade, police dispatch/scans and solid-world collision.
- `rendering/hud-model.ts`: pure state-to-HUD projection; `rendering/hud.ts` applies it to the DOM. `rendering/effects.ts` owns visual effects.
- `menus/views.ts`, `menus/front.ts`, `menus/smuggler.ts`: menu content built from explicit run/profile inputs; `menus/mode-preview.ts` owns title simulations.
- `menus/menu-shell.ts`: DOM-only menu actions, visibility and keyboard focus; `ui.ts` connects it to the vector previews.
- `input-layouts.ts` and `menus/controls.ts`: shared, saved control bindings and their title/briefing labels.
- `models/`: separate wireframe primitives, ship silhouettes, landmarks, projectiles and object catalog. `models.ts` exports the shared model API.
- `input.ts`, `encounters.ts`, `weapons.ts`, `arcade.ts`, `bonus.ts` and `canyon.ts`: control, encounter, weapon, progression and bonus-course rules.
- `tests/e2e/fixtures/`: browser driver and pixel fixtures. Debug controls are exposed only in development builds.
- `tests/integration/`: short adapter-wiring checks with a DOM/device harness, run separately from unit tests and their coverage.

All ship outlines, formations, canyon paths, vector lettering and sound phrases are procedural original assets. No film, television or commercial game artwork, names, music or recreated levels are included. Three.js provides geometry, curves and rendering. Broad arcade mechanics are inspirations, not copied expressive assets.

## GitHub Pages

[Checks and Pages](.github/workflows/check.yml) installs dependencies and Chromium, runs lint, strict TypeScript checks, every unit and Playwright test, coverage thresholds and a production build. Reports are retained for seven days, including on failures. Only successful default-branch pushes or manual default-branch runs deploy `dist/`; pull requests and other branches never deploy. The deployment uses the same tested artifact and a protected `github-pages` environment, with write permissions limited to the deployment job.

In the repository's **Settings > Pages > Build and deployment**, select **GitHub Actions** as the source. Then push these changes to `main`, or run **Checks and Pages** from the Actions tab once the workflow is on `main`. The expected project URL is `https://eviltester.github.io/3dspacegame/`; the deployment job reports the actual URL. Pages has not been enabled or published by the local setup. Private repositories need a GitHub plan that supports Pages; enabling the website does not require making the source repository public.

Vite uses relative asset URLs so the bundle works under the repository path as well as at `/`. A Playwright production smoke test builds the actual app and serves it at `/3dspacegame/`, checking startup, flight, pause, assets and absence of development debug controls. It temporarily uses port 5181, separate from the development tests on 5180.

References: [GitHub Pages workflow setup](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite relative base paths](https://vite.dev/guide/build#relative-base).

## License

Project code and original assets are distributed under the [MIT License](LICENSE). Third-party dependencies retain their own licenses.
