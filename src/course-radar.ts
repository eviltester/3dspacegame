/** Read live course objects for radar; never keep a second, stale list of entities. */
import type * as THREE from 'three';
import type { RadarContact } from './radar';

interface RadarObject { position: THREE.Vector3; visible: boolean }
interface CourseContact {
  kind: string; object: RadarObject; used: boolean; rock?: { color: number };
}
export interface CourseRadarSource {
  objects: readonly CourseContact[];
  canyon?: {
    gates: readonly { object: RadarObject; resolved: boolean; exit: boolean }[];
    shots: readonly CourseContact[];
    barriers: { items: readonly { object: RadarObject }[] };
  };
  repairs: { contacts: RadarContact[] };
  cargo: { contacts: RadarContact[] };
  traffic?: { contacts: RadarContact[] };
}

export function courseRadarContacts(source: CourseRadarSource): RadarContact[] {
  const contacts: RadarContact[] = [];
  for (const item of [...source.objects, ...source.canyon?.shots ?? []]) {
    if (item.used || !item.object.visible) continue;
    const position = item.object.position;
    if (item.kind === 'rock' && item.rock) contacts.push({ position, color: `#${item.rock.color.toString(16).padStart(6, '0')}`, glyph: 'rock' });
    else if (item.kind === 'salvage') contacts.push({ position, color: '#ffff70', glyph: 'cargo' });
    else if (item.kind === 'gate') contacts.push({ position, color: '#ffff70', glyph: 'gate' });
    else if (item.kind === 'obstacle') contacts.push({ position, color: '#ffbf48', glyph: 'obstacle' });
    else if (item.kind === 'turret') contacts.push({ position, color: '#ff4055', glyph: 'ship' });
    else if (item.kind === 'hostileBolt') contacts.push({ position, color: '#ff4055', glyph: 'shot' });
  }
  if (source.canyon) {
    // Only the next opening is a destination; drawing every gate hides the near hazards.
    const next = source.canyon.gates.find(gate => !gate.resolved);
    if (next?.object.visible) contacts.push({ position: next.object.position, color: next.exit ? '#ffff70' : '#48ff95', glyph: 'gate' });
    for (const { object } of source.canyon.barriers.items) {
      if (object.visible) contacts.push({ position: object.position, color: '#ff9050', glyph: 'obstacle' });
    }
  }
  contacts.push(...source.repairs.contacts, ...source.cargo.contacts, ...source.traffic?.contacts ?? []);
  return contacts;
}
