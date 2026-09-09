/**
 * Info Deck: descriptions plus factories for the actual game models.
 * Store factories, not live objects, to avoid allocating the whole catalog on load.
 * scale/cameraZ frame large landmarks and small pickups at readable preview sizes.
 */
import * as THREE from 'three';
import type { EnemyArchetype } from '../arcade';
import type { CargoType } from '../logic';
import { ASTEROID_COLORS, edgesFromGeometry, createPulseRing } from './primitives';
import { createEnemyModel, createInvaderModel, createInvaderFlybyModel, createPoliceModel, createTraderHaulerModel, createTraderUfoModel, createCanyonTurret } from './ships';
import { createCargoModel, createBaseModel, createPlanetModel, createBlackMarketModel, createGateModel, createCanyonGate } from './landmarks';
import { createSkiffRepairModel } from './skiff-repairs';
import { createCanyonBarrierModel } from '../canyon-barriers';
import type { CanyonBarrierKind } from '../canyon-barriers';

export interface CatalogItem { title: string; description: string; create: () => THREE.Object3D; scale: number; cameraZ: number }

export function createCatalog(): CatalogItem[] {
  const roles: Array<[EnemyArchetype, string]> = [
    ['raider', 'Charges head-on. Shoot the red ships and their incoming fire.'],
    ['flanker', 'Attacks in pairs from opposite sides. Turn toward one flight at a time.'],
    ['diver', 'Breaks formation and dives through your firing line.'],
    ['gunship', 'Flashes before firing a wide sweep. Move out of its line of fire.'],
    ['minelayer', 'Drops red wireframe mines. Shoot them before they arm.'],
    ['carrier', 'Launches reinforcements. Boss carriers have breakable outer systems.']
  ];
  const items: CatalogItem[] = roles.map(([role, description]) => ({ title: `RED ${role.toUpperCase()}`, description, create: () => createEnemyModel(role), scale: role === 'carrier' ? 0.55 : 2.2, cameraZ: 62 }));
  for (const [role, name] of [['raider', 'MARCHER'], ['diver', 'SWOOPER'], ['flanker', 'WEAVER']] as const) items.push({ title: `ALIEN ${name}`, description: 'Defensive Position mode enemy. Joins circling squads, looping convoys and diving swarms. Shoot incoming fire to charge blast.', create: () => createInvaderModel(role), scale: 2.2, cameraZ: 62 });
  items.push(
    { title: 'PIRATE FLYBY CRUISER', description: 'Large Defensive Position visitor. Sweeps across behind the formation, firing bursts. Later cruisers drop drifting mines. Destroy it for bonus points before it escapes.', create: () => createInvaderFlybyModel('pirate'), scale: 0.55, cameraZ: 62 },
    { title: 'POLICE FLYBY', description: 'In Defensive Position, this siren patrol declares you wanted and shoots at you. Return fire or dodge its rapid bursts.', create: () => createInvaderFlybyModel('police'), scale: 1.4, cameraZ: 62 },
    { title: 'BONUS COURIER', description: 'A fast gold cargo runner in Defensive Position. Destroy it for bonus points before it escapes. It does not shoot.', create: () => createInvaderFlybyModel('courier'), scale: 1.6, cameraZ: 62 },
    { title: 'POLICE', description: 'Blue interceptors fight pirates. Do not attack them. They collect contraband only.', create: createPoliceModel, scale: 2.2, cameraZ: 62 },
    { title: 'GREEN TRADER', description: 'Civilian hauler. Protect it from pirates; unprovoked attacks make you wanted.', create: createTraderHaulerModel, scale: 2, cameraZ: 62 },
    { title: 'GREEN SAUCER', description: 'Peaceful trader. Collects legal salvage and returns fire at pirates.', create: createTraderUfoModel, scale: 2, cameraZ: 62 }
  );
  const cargo: Array<[CargoType, string]> = [
    ['credits', 'Cash salvage. Spent at supply stops during this run.'], ['legalCargo', 'Sell automatically at a lawful station.'],
    ['rareMineral', 'Valuable salvage. Lawful stations buy it.'], ['contraband', 'Deliberate pickup only. Sell at the magenta black market; lawful scans can seize it.'],
    ['weaponCore', 'Improves the equipped weapon; capped cores award points in Defensive Position or credits in trading modes.'], ['shieldCell', 'Partially repairs hull and restores some shield points. Collect it during combat.'], ['rescuePod', 'Protected mission cargo. Deliver to the station.']
  ];
  for (const [kind, description] of cargo) items.push({ title: kind === 'shieldCell' ? 'REPAIR CELL' : kind.replace(/([A-Z])/g, ' $1').toUpperCase(), description, create: () => createCargoModel(kind), scale: 3.4, cameraZ: 62 });
  items.push(
    { title: 'SKIFF SHIELD', description: 'Blue pickup. Helps repairs and charge shields. Shooting rocks or canyon crates might release one.', create: () => createSkiffRepairModel('shield'), scale: 2.6, cameraZ: 62 },
    { title: 'SKIFF REPAIR', description: 'Pink pickup. Restores all skiff hull and canyon shields. Shooting rocks or canyon guns might release one.', create: () => createSkiffRepairModel('repair'), scale: 2.6, cameraZ: 62 },
    { title: 'SUPPLY STATION', description: 'Sell legal cargo here. Mission completion opens the upgrade dock.', create: createBaseModel, scale: 0.45, cameraZ: 86 },
    { title: 'OUTPOST PLANET', description: 'Solid landmark. Canyon bonus sorties use a loan skiff near the surface.', create: () => createPlanetModel(0x6fffbc), scale: 0.44, cameraZ: 96 },
    { title: 'BLACK MARKET', description: 'The magenta exchange buys contraband. Its outer ring is not cargo.', create: createBlackMarketModel, scale: 0.65, cameraZ: 92 },
    { title: 'WARP GATE', description: 'When the mission is complete, follow the flashing arrow and fly through the opening.', create: createGateModel, scale: 0.62, cameraZ: 104 },
    { title: 'MINE', description: 'A red wireframe star. It flashes before arming. In Defensive Position, a pulsing red ring warns of its blast radius. Get too close and it explodes. Shoot or dodge it.', create: () => edgesFromGeometry(new THREE.OctahedronGeometry(4), 0xff4055), scale: 3, cameraZ: 62 },
    { title: 'ASTEROID', description: 'Coloured rocks are hazards, not cargo. Large rocks split into smaller, drifting fragments. In Defensive Position, shoot or dodge falling rocks. In flight courses, reach EXIT. Blasts vaporize rocks.', create: () => edgesFromGeometry(new THREE.IcosahedronGeometry(6), ASTEROID_COLORS[0]), scale: 2, cameraZ: 62 },
    { title: 'BONUS MARKER', description: 'Find the shuffled numbers and shoot in order. Yellow is next. Remaining markers move faster after successful hits.', create: () => createPulseRing(0xffff60, 7, 0, 1, 8), scale: 2, cameraZ: 62 },
    { title: 'CANYON GATE', description: 'Fly through for points. Miss and get a penalty. The next gate pulses green while penalized.', create: createCanyonGate, scale: 1.5, cameraZ: 62 },
    { title: 'CANYON GUN', description: 'Flashes yellow before firing. Destroy it for points. Shoot or avoid its shots.', create: createCanyonTurret, scale: 2, cameraZ: 62 },
    { title: 'CANYON CRATE', description: 'Amber obstacles. Shooting one might release yellow haul. Collect the pickup for points. The crate itself gives no score.', create: () => edgesFromGeometry(new THREE.OctahedronGeometry(8), 0xffbf48), scale: 2, cameraZ: 62 }
  );
  const barriers: Array<[CanyonBarrierKind, string, string, number, number]> = [
    ['pillar', 'CANYON PILLAR', 'Full-height column. Dodge to either side; an impact empties shields and knocks your skiff clear.', 10, 36],
    ['halfPillar', 'LOW CANYON PILLAR', 'Fixed half-height column. Pass above it or to either side.', 10, 18],
    ['risingPillar', 'RISING PILLAR', 'Rises to full canyon height, then retracts completely into the floor. Watch its exposed height.', 10, 36],
    ['risingHalfPillar', 'LOW RISING PILLAR', 'Rises only halfway up the canyon, then retracts completely. The upper lane stays open.', 10, 18],
    ['sideWall', 'CANYON SIDE WALL', 'Extends halfway across from one canyon side. Dodge into the open half; cannot be destroyed.', 20, 36],
    ['floorWall', 'CANYON FLOOR WALL', 'Half-height wall across the floor. Fly over it; shots cannot pass through it.', 36, 18]
  ];
  for (const [kind, title, description, width, height] of barriers) items.push({ title, description, scale: 1, cameraZ: 62,
    create: () => { const group = new THREE.Group(), object = createCanyonBarrierModel(kind);
      object.scale.set(width, height, 8); group.add(object); return group; } });
  return items;
}
