import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { courseRadarContacts } from './course-radar';
import type { CourseRadarSource } from './course-radar';
import { BonusController } from './bonus';
import { COURSE_RADAR_VIEW, projectRadarContact } from './radar';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));

function body(kind: string): CourseRadarSource['objects'][number] { return { kind, object: new THREE.Group(), used: false }; }
function source(): CourseRadarSource { return { objects: [], repairs: { contacts: [] }, cargo: { contacts: [] } }; }
it('maps course objects to distinct live radar glyphs and colours', () => {
  const frame = source(), rock = body('rock'); rock.rock = { color: 0x0055aa };
  frame.objects = [rock, ...['salvage', 'gate', 'obstacle', 'turret', 'hostileBolt', 'marker'].map(body)];
  const contacts = courseRadarContacts(frame);
  expect(contacts.map(contact => contact.glyph)).toEqual(['rock', 'cargo', 'gate', 'obstacle', 'ship', 'shot']);
  expect(contacts.map(contact => contact.color)).toEqual(['#0055aa', '#ffff70', '#ffff70', '#ffbf48', '#ff4055', '#ff4055']);
  expect(contacts[0].position).toBe(rock.object.position);
});
it('drops destroyed, collected and hidden objects, without inventing contacts for unrecognised objects', () => {
  const frame = source(), destroyed = body('obstacle'), hidden = body('salvage');
  destroyed.used = true; hidden.object.visible = false;
  frame.objects = [destroyed, hidden, body('rock'), body('unknown')];
  expect(courseRadarContacts(frame)).toEqual([]);
});
it('shows only the next canyon gate, advances to EXIT, and excludes resolved and hidden barriers', () => {
  const frame = source(), first = new THREE.Group(), second = new THREE.Group(), exit = new THREE.Group();
  const pillar = new THREE.Group(), retracted = new THREE.Group(); retracted.visible = false;
  frame.canyon = { gates: [{ object: first, resolved: false, exit: false }, { object: second, resolved: false, exit: false }, { object: exit, resolved: false, exit: true }],
    barriers: { items: [{ object: pillar }, { object: retracted }] }, shots: [body('hostileBolt')] };
  const gate = () => courseRadarContacts(frame).find(contact => contact.glyph === 'gate');
  expect(gate()).toEqual({ position: first.position, color: '#48ff95', glyph: 'gate' });
  expect(courseRadarContacts(frame).filter(contact => contact.glyph === 'obstacle')).toHaveLength(1);
  frame.canyon.gates[0].resolved = true; expect(gate()?.position).toBe(second.position);
  frame.canyon.gates[1].resolved = true; expect(gate()).toEqual({ position: exit.position, color: '#ffff70', glyph: 'gate' });
  exit.visible = false; expect(gate()).toBeUndefined();
  frame.canyon.gates[2].resolved = true; expect(gate()).toBeUndefined();
});
it('combines dropped repairs, haul and passing ships with the course contacts', () => {
  const frame = source();
  const repair = { position: new THREE.Vector3(10, 10, -50), color: '#70cfff', glyph: 'cargo' as const };
  const haul = { position: new THREE.Vector3(0, 0, -100), color: '#ffff70', glyph: 'cargo' as const };
  const police = { position: new THREE.Vector3(-20, -10, -300), color: '#75caff', glyph: 'ship' as const };
  frame.repairs.contacts = [repair]; frame.cargo.contacts = [haul]; frame.traffic = { contacts: [police] };
  expect(courseRadarContacts(frame)).toEqual([repair, haul, police]);
  frame.cargo.contacts = []; expect(courseRadarContacts(frame)).toEqual([repair, police]);
});
it.each(['asteroids', 'canyon'] as const)('%s radar is populated immediately on the first Smuggler difficulty', kind => {
  const bonus = new BonusController(kind, 42), camera = new THREE.PerspectiveCamera(); bonus.step(0, { x: 0, y: 0 }, camera);
  const contacts = bonus.radarContacts;
  expect(contacts.some(contact => contact.glyph === 'gate')).toBe(true);
  expect(contacts.some(contact => contact.glyph === (kind === 'asteroids' ? 'rock' : 'obstacle'))).toBe(true);
  const near = contacts.filter(contact => projectRadarContact(contact.position, camera.position, camera.quaternion, COURSE_RADAR_VIEW).inRange);
  expect(near.length).toBeGreaterThan(5);
  const positions = near.map(contact => projectRadarContact(contact.position, camera.position, camera.quaternion, COURSE_RADAR_VIEW).x);
  expect(Math.max(...positions) - Math.min(...positions)).toBeGreaterThan(25);
  bonus.dispose();
});
it('asteroid fragments replace their destroyed parent and collected salvage vanishes on the next read', () => {
  const bonus = new BonusController('asteroids', 42), camera = new THREE.PerspectiveCamera();
  const parent = bonus.root.getObjectById(bonus.rocks[0].id)!, salvage = bonus.radarContacts.find(contact => contact.glyph === 'cargo')!;
  for (const object of bonus.root.children) object.position.set(1000, 1000, -1000);
  parent.position.set(0, 0, -160); expect(bonus.shoot(camera)).toBe(true);
  expect(bonus.radarContacts.some(contact => contact.position === parent.position)).toBe(false);
  const fragments = bonus.rocks.filter(rock => rock.size === 1);
  expect(fragments).toHaveLength(2);
  for (const fragment of fragments) expect(bonus.radarContacts.some(contact => contact.position === bonus.root.getObjectById(fragment.id)!.position)).toBe(true);
  salvage.position.set(0, 0, -5); bonus.step(0, { x: 0, y: 0 }, camera);
  expect(bonus.radarContacts.some(contact => contact.position === salvage.position)).toBe(false); bonus.dispose();
});
it('moving gates and retracting pillars use current positions and visibility, not their spawn state', () => {
  const bonus = new BonusController('canyon', 42, 8), course = bonus.canyon!, camera = new THREE.PerspectiveCamera();
  course.gates[0].resolved = true;
  const before = bonus.radarContacts.find(contact => contact.glyph === 'gate')!.position.clone();
  bonus.step(0.2, { x: 0, y: 0 }, camera);
  const gate = bonus.radarContacts.find(contact => contact.glyph === 'gate')!;
  expect(gate.position.equals(before)).toBe(false); expect(gate.position).toBe(course.gates[1].object.position);
  const pillar = course.barriers.items.find(item => item.kind === 'risingPillar')!; pillar.phase = 0;
  course.barriers.step(0, camera.position, camera.position, camera.position, new THREE.Vector2());
  expect(bonus.radarContacts.some(contact => contact.position === pillar.object.position)).toBe(false);
  course.barriers.step(pillar.period * 0.6, camera.position, camera.position, camera.position, new THREE.Vector2());
  expect(bonus.radarContacts.some(contact => contact.position === pillar.object.position)).toBe(true); bonus.dispose();
});
