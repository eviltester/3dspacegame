import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { ASTEROID_DURATION, BonusController } from './bonus';
import { bonusProfile } from './bonus-difficulty';
import { Random } from './encounters';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));
const courses: BonusController[] = [];
afterEach(() => { for (const course of courses) course.dispose(); courses.length = 0; vi.restoreAllMocks(); });
function setup(kind: 'canyon' | 'asteroids' | 'sequence' = 'canyon') {
  const course = new BonusController(kind, 42, 3, true); courses.push(course);
  const camera = new THREE.PerspectiveCamera();
  return { course, camera };
}
it.each(['pirate', 'police'] as const)('asteroid %s arrivals, lock-on and firing retain separate identities', kind => {
  const { course, camera } = setup('asteroids'), traffic = course.traffic!;
  const ship = traffic.ships.find(ship => ship.kind === kind)!;
  traffic.ships.splice(0, traffic.ships.length, ship); ship.object.position.set(20, 0, -300);
  traffic.step(0, 0, camera.position, camera.position);
  expect(course.sounds.drain()).toEqual([{ type: 'cue', cue: 'patrolApproach' }]);
  traffic.fire.step(0.3, 0.3, [ship], camera.position, camera.position);
  expect(course.sounds.drain()).toEqual([{ type: 'cue', cue: 'lockOn' }]);
  traffic.fire.step(0.86, 1.16, [ship], camera.position, camera.position);
  expect(course.sounds.drain()).toMatchObject([{ type: 'fire', voice: kind }]);
});
it('a canyon gun emits its own firing sound after its lock-on cue', () => {
  const { course, camera } = setup(), canyon = course.canyon!;
  const gun = canyon.targets.find(target => target.kind === 'turret')!;
  for (const target of canyon.targets) target.used = target !== gun;
  gun.object.position.set(0, 0, -250);
  course.step(0.8, { x: 0, y: 0 }, camera);
  expect(course.sounds.drain()).toContainEqual({ type: 'cue', cue: 'lockOn' });
  course.step(0.86, { x: 0, y: 0 }, camera);
  expect(course.sounds.drain().filter(event => event.type === 'fire')).toMatchObject([{ type: 'fire', voice: 'canyonGun' }]);
});
it('canyon gate misses, reduced penalties and cleared penalties emit different cues', () => {
  const { course, camera } = setup(), canyon = course.canyon!;
  for (const target of canyon.targets) target.used = true;
  const observed: string[] = [];
  for (let i = 0; i < 2500 && canyon.nextGate < 4 && !course.state.finished; i++) {
    const gate = canyon.gates[canyon.nextGate], target = gate.object.position.clone().sub(canyon.path.getPointAt(gate.progress));
    if (canyon.nextGate < 2) { target.x = target.x < 0 ? 30 : -30; target.y = 0; }
    course.step(1 / 60, { x: (target.x - canyon.offset.x) / 0.13, y: -(target.y - canyon.offset.y) / 0.13 }, camera);
    observed.push(...course.sounds.drain().filter(event => event.type === 'cue').map(event => event.cue));
  }
  expect(observed).toEqual(['gateMiss', 'gateMiss', 'penaltyReduced', 'penaltyCleared']);
});
it.each(['canyon', 'asteroids'] as const)('%s exit approach announces once', kind => {
  const { course, camera } = setup(kind);
  if (course.canyon) course.canyon.progress = 0.91;
  else course.state.elapsed = ASTEROID_DURATION / bonusProfile(course.state.difficulty).flightScale * 0.9;
  // Move near the exit without flying the whole course or resolving its rewards.
  if (course.canyon) course.canyon.step(200, { x: 0, y: 0 }, camera);
  else course.step(0.01, { x: 0, y: 0 }, camera);
  expect(course.sounds.drain()).toContainEqual({ type: 'cue', cue: 'exitGate' });
  course.step(0.01, { x: 0, y: 0 }, camera);
  expect(course.sounds.drain()).not.toContainEqual({ type: 'cue', cue: 'exitGate' });
});
it('a wrong numbered target gets its own rejection sound, not score or pickup', () => {
  const { course, camera } = setup('sequence');
  const target = course.targetSequence!.targets.find(target => target.number === 2)!;
  camera.lookAt(new THREE.Vector3(...target.position));
  course.shoot(camera);
  expect(course.sounds.drain()).toEqual([{ type: 'cue', cue: 'wrongTarget' }]);
});
it.each(['shield', 'repair', 'haul'] as const)('%s only plays pickup on collection, never on drop creation', kind => {
  const { course, camera } = setup();
  vi.spyOn(Random.prototype, 'next').mockReturnValue(0);
  if (kind === 'haul') course.cargo.release(new THREE.Vector3(0, 0, -5));
  else course.repairs.release(kind === 'shield' ? 'obstacle' : 'turret', new THREE.Vector3(0, 0, -5));
  expect(course.sounds.drain()).toEqual([]);
  course.step(1 / 60, { x: 0, y: 0 }, camera);
  expect(course.sounds.drain()).toEqual([{ type: 'cue', cue: 'pickup' }]);
});
it('hits that pay points use score feedback, while misses retain the thud', () => {
  const { course, camera } = setup();
  for (const target of course.canyon!.targets) target.used = true;
  const gun = course.canyon!.targets.find(target => target.kind === 'turret')!;
  gun.used = false; gun.object.position.set(0, 0, -100);
  course.shoot(camera); expect(course.sounds.drain()).toEqual([{ type: 'cue', cue: 'score' }]);
  course.shoot(camera); expect(course.sounds.drain()).toEqual([{ type: 'cue', cue: 'miss' }]);
});
