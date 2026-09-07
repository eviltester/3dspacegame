/**
 * Ships & Objects guide: descriptions plus factories for the actual game models.
 * Store factories, not live objects, to avoid allocating the whole catalog on load.
 * scale/cameraZ frame large landmarks and small pickups at readable preview sizes.
 */
import * as THREE from 'three';
import type { EnemyArchetype } from '../arcade';
import type { CargoType } from '../logic';
import { ASTEROID_COLORS, edgesFromGeometry, createPulseRing } from './primitives';
import { createEnemyModel, createInvaderModel, createPoliceModel, createTraderHaulerModel, createTraderUfoModel, createCanyonTurret } from './ships';
import { createCargoModel, createBaseModel, createPlanetModel, createBlackMarketModel, createGateModel, createCanyonGate } from './landmarks';

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
  for (const [role, name] of [['raider', 'MARCHER'], ['diver', 'SWOOPER'], ['flanker', 'WEAVER']] as const) items.push({ title: `ALIEN ${name}`, description: 'Invaders mode enemy. Breaks into marches, swoops and pincer attacks. Shoot its incoming fire to charge your blast.', create: () => createInvaderModel(role), scale: 2.2, cameraZ: 62 });
  items.push(
    { title: 'POLICE', description: 'Blue interceptors fight pirates. Do not attack them. They collect contraband only.', create: createPoliceModel, scale: 2.2, cameraZ: 62 },
    { title: 'GREEN TRADER', description: 'Civilian hauler. Protect it from pirates; unprovoked attacks make you wanted.', create: createTraderHaulerModel, scale: 2, cameraZ: 62 },
    { title: 'GREEN SAUCER', description: 'Peaceful trader. Collects legal salvage and returns fire at pirates.', create: createTraderUfoModel, scale: 2, cameraZ: 62 }
  );
  const cargo: Array<[CargoType, string]> = [
    ['credits', 'Cash salvage. Spent at supply stops during this run.'], ['legalCargo', 'Sell automatically at a lawful station.'],
    ['rareMineral', 'Valuable salvage. Lawful stations buy it.'], ['contraband', 'Deliberate pickup only. Sell at the magenta black market; lawful scans can seize it.'],
    ['weaponCore', 'Improves the equipped weapon; capped cores award points in Invaders or credits in trading modes.'], ['shieldCell', 'Repairs 30 hull points and restores 30 shield points. Collect it during combat.'], ['rescuePod', 'Protected mission cargo. Deliver to the station.']
  ];
  for (const [kind, description] of cargo) items.push({ title: kind === 'shieldCell' ? 'REPAIR CELL' : kind.replace(/([A-Z])/g, ' $1').toUpperCase(), description, create: () => createCargoModel(kind), scale: 3.4, cameraZ: 62 });
  items.push(
    { title: 'SUPPLY STATION', description: 'Sell legal cargo here. Mission completion opens the upgrade dock.', create: createBaseModel, scale: 0.45, cameraZ: 86 },
    { title: 'OUTPOST PLANET', description: 'Solid landmark. Canyon bonus sorties use a loan skiff near the surface.', create: () => createPlanetModel(0x6fffbc), scale: 0.44, cameraZ: 96 },
    { title: 'BLACK MARKET', description: 'The magenta exchange buys contraband. Its outer ring is not cargo.', create: createBlackMarketModel, scale: 0.65, cameraZ: 92 },
    { title: 'WARP GATE', description: 'When the mission is complete, follow the flashing arrow and fly through the opening.', create: createGateModel, scale: 0.62, cameraZ: 104 },
    { title: 'MINE', description: 'A red wireframe star. It flashes before arming. Destroy it from a distance.', create: () => edgesFromGeometry(new THREE.OctahedronGeometry(4), 0xff4055), scale: 3, cameraZ: 62 },
    { title: 'ASTEROID', description: 'Coloured rocks are hazards, not cargo. Large rocks split into medium rocks, then drifting fragments. Follow the gaps and fly through EXIT. Blasts vaporize rocks.', create: () => edgesFromGeometry(new THREE.IcosahedronGeometry(6), ASTEROID_COLORS[0]), scale: 2, cameraZ: 62 },
    { title: 'BONUS MARKER', description: 'Find the shuffled numbers and shoot in order. Yellow is next. Remaining markers move faster after successful hits.', create: () => createPulseRing(0xffff60, 7, 0, 1, 8), scale: 2, cameraZ: 62 },
    { title: 'CANYON GATE', description: 'Fly through the green opening. Gates shrink and move. Two consecutive misses end the bonus.', create: createCanyonGate, scale: 1.5, cameraZ: 62 },
    { title: 'CANYON GUN', description: 'Flashes yellow before firing red bolts. Shoot the gun or intercept its fire.', create: createCanyonTurret, scale: 2, cameraZ: 62 },
    { title: 'CANYON OBSTACLE', description: 'Amber rock spires obstruct the route. Dodge or shoot them. Find the exit opening in the final wall.', create: () => edgesFromGeometry(new THREE.OctahedronGeometry(8), 0xffbf48), scale: 2, cameraZ: 62 }
  );
  return items;
}
