import type { TunnelRunState } from './types';
const factions = ['player','pirate','police','trader','neutral'];
const roles = ['raider','flanker','diver','gunship','minelayer','carrier'];
const drops = ['credits','legalCargo','rareMineral','contraband','weaponCore','shieldCell','rescuePod','fullRepair'];
const lane = (value: number) => Number.isFinite(value) && value >= 0 && value < 12;
const id = (value: number) => Number.isSafeInteger(value) && value > 0;
/** Reject partial/corrupt snapshots as a unit; never replay a paid encounter. */
export function parseTunnel(value: unknown, level: number): TunnelRunState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const s = value as TunnelRunState;
  const response = s.policeResponse;
  if (response !== undefined && (!response || ![2,10].includes(response.limit)
    || !Number.isInteger(response.spawned) || response.spawned < 0 || response.spawned > response.limit
    || !Number.isFinite(response.delay) || response.delay < 0 || response.delay > 2)) return undefined;
  if (s.version !== 1 || s.level !== level || !['assault','salvage','collapse','result','over'].includes(s.phase)
    || !Array.isArray(s.entities) || s.entities.length > 256 || !Array.isArray(s.shots) || s.shots.length > 170
    || !Array.isArray(s.chargedVolleys) || s.chargedVolleys.length > 170 || !s.startVitals) return undefined;
  const numbers = ['random','lootRandom','nextId','lane','previousLane','desiredLane','elapsed','group','spawnIndex','spawnDelay','hazardDelay','fireDelay','attackDelay','lastAttacker','protection','respawn','hitGrace','remaining','scan','kills'] as const;
  if (numbers.some(k => !Number.isFinite(s[k])) || !id(s.nextId) || s.elapsed < 0 || !lane(s.lane) || !lane(s.previousLane) || !lane(s.desiredLane)
    || !['paid','scanned','patrol','earlyCore'].every(k => typeof s[k as keyof TunnelRunState] === 'boolean')
    || ![0,1].includes(s.startVitals.health) || !Number.isFinite(s.startVitals.shield) || s.startVitals.shield < 0 || s.startVitals.shield > 100
    || !Number.isFinite(s.startVitals.damage) || s.startVitals.damage < 0 || s.startVitals.damage >= 100
    || s.chargedVolleys.some(n => !id(n) || n >= s.nextId)) return undefined;
  if (s.entities.some(e => !e || !['ship','gun','core','asteroid','crate','pickup','pillar','wall','mine'].includes(e.kind)
    || !['id','lane','previousLane','depth','previousDepth','hp','size','age','grace','cooldown','warning','targetLane','targetId','changing','nextLane','parent','extension'].every(k => Number.isFinite((e as unknown as Record<string, unknown>)[k]))
    || !factions.includes(e.faction) || !roles.includes(e.role) || !lane(e.lane) || !lane(e.nextLane) || ![0,1,2].includes(e.size)
    || ![e.required,e.rim,e.retracting,e.essential].every(n => typeof n === 'boolean') || e.drop !== undefined && !drops.includes(e.drop)
    || e.fragmentSpeed !== undefined && (e.kind !== 'asteroid' || ![1,3].includes(e.fragmentSpeed))
    || e.policeEntry !== undefined && (typeof e.policeEntry !== 'boolean' || e.faction !== 'police' || e.kind !== 'ship'))) return undefined;
  if (s.shots.some(e => !e || !['pulse','spread','lance'].includes(e.family) || !Array.isArray(e.contacts)
    || !['id','volley','lane','depth','previousDepth','damage','speed','pierce','target'].every(k => Number.isFinite((e as unknown as Record<string, unknown>)[k]))
    || !factions.includes(e.faction) || !lane(e.lane) || typeof e.hit !== 'boolean' || e.contacts.length > 3 || e.contacts.some(n => !id(n))
    || [e.previousLane,e.originLane,e.aimLane].some(n => n !== undefined && !lane(n)) || e.originDepth !== undefined && !Number.isFinite(e.originDepth))) return undefined;
  const ids = [...s.entities, ...s.shots].map(e => e.id);
  if (ids.some(n => !id(n) || n >= s.nextId) || new Set(ids).size !== ids.length) return undefined;
  if (s.paid !== (s.phase === 'result') || s.paid && (!s.result || !['cargo','accuracy','clear','percent'].every(k => Number.isFinite(s.result![k as keyof typeof s.result])))) return undefined;
  return structuredClone(s);
}
