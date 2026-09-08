import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { BonusController } from './bonus';
import { smugglerFlightPoints } from './smuggler';
import { freshSkiff } from './skiff-vitals';
import { canyonGunMuzzle } from './canyon-gun-mounts';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));
const courses: BonusController[] = [];
afterEach(() => { for (const course of courses) course.dispose(); courses.length = 0; });
function course(kind: 'asteroids' | 'canyon', difficulty = 1) {
  const bonus = new BonusController(kind, 42, difficulty, true, freshSkiff()); courses.push(bonus);
  const camera = new THREE.PerspectiveCamera();
  for (const child of bonus.root.children) child.position.set(5000, 5000, -5000);
  if (bonus.canyon) for (const target of bonus.canyon.targets) target.used = true;
  return { bonus, camera };
}
it.each(['asteroids', 'canyon'] as const)('%s builds boost quickly, releases smoothly, and does not remember the old boost', kind => {
  const { bonus, camera } = course(kind);
  const speed = () => bonus.canyon?.speed ?? bonus.asteroidRun!.speed;
  bonus.protect(100);
  bonus.step(0, { x: 0, y: 0, boost: true }, camera); expect(speed()).toBe(48);
  for (let i = 0; i < 48; i++) bonus.step(1 / 60, { x: 0, y: 0, boost: true }, camera);
  expect(speed()).toBeGreaterThan(72);
  const boosted = speed(); bonus.step(0.1, { x: 0, y: 0 }, camera);
  expect(speed()).toBeLessThan(boosted); expect(speed()).toBeGreaterThan(boosted * 0.9);
  for (let i = 0; i < 120; i++) bonus.step(1 / 60, { x: 0, y: 0 }, camera);
  const cruising = speed(); bonus.step(1 / 60, { x: 0, y: 0, boost: true }, camera);
  expect(speed()).toBeGreaterThan(cruising); expect(speed()).toBeLessThan(cruising * 1.03);
});
it.each(['pulse', 'spread', 'lance'] as const)('Smuggler asteroid %s misses cost fifty per projectile, and hits are not misses', family => {
  const { bonus, camera } = course('asteroids'); bonus.state.family = family;
  bonus.shoot(camera); const count = family === 'spread' ? 3 : 1;
  expect(smugglerFlightPoints(bonus.state)).toBe(-50 * count);
  const rock = bonus.root.getObjectById(bonus.rocks[0].id)!; rock.position.set(0, 0, -600);
  bonus.state.points = 0; expect(bonus.shoot(camera)).toBe(true);
  expect(smugglerFlightPoints(bonus.state)).toBe(25 - 50 * (count - 1));
});
it.each(['pirate', 'police'] as const)('Smuggler %s ships are shootable and intercepting their fire pays ten actual points', kind => {
  const { bonus, camera } = course('asteroids', 8);
  const ship = bonus.traffic!.ships.find(ship => ship.kind === kind)!; ship.object.position.set(0, 0, -100);
  expect(bonus.shoot(camera)).toBe(true); expect(ship.used).toBe(true);
  const object = new THREE.Group(); object.position.set(0, 0, -50);
  bonus.traffic!.fire.shots.push({ kind: 'hostileBolt', object, radius: 2.4, number: 0, used: false, velocity: new THREE.Vector3(), life: 4, color: '#ff4055' });
  bonus.state.charge = 0; expect(bonus.shoot(camera)).toBe(true);
  expect(smugglerFlightPoints(bonus.state)).toBe(35); expect(bonus.state.charge).toBe(10);
  expect(bonus.radarContacts.some(contact => contact.glyph === 'shot')).toBe(false);
});
it('Smuggler blast clears police, pirates and their fire without splitting ships', () => {
  const { bonus, camera } = course('asteroids', 8);
  for (const ship of bonus.traffic!.ships.slice(0, 2)) ship.object.position.set(0, 0, -100);
  expect(bonus.blast(camera)).toBe(true);
  expect(bonus.traffic!.ships.slice(0, 2).every(ship => ship.used)).toBe(true);
  expect(smugglerFlightPoints(bonus.state)).toBe(50); expect(bonus.state.fractures).toBe(0);
});
it.each(['asteroids', 'canyon'] as const)('%s damage and gate penalties never block hit-earned blast charge', kind => {
  const { bonus, camera } = course(kind, kind === 'asteroids' ? 3 : 1);
  const shots = bonus.canyon?.shots ?? bonus.traffic!.fire.shots;
  const incoming = () => {
    const object = new THREE.Group(); object.position.copy(camera.position);
    shots.push({ kind: 'hostileBolt', object, radius: 2.4, number: 0, used: false, velocity: new THREE.Vector3(), life: 4, color: '#ff4055' });
  };
  incoming(); incoming(); bonus.step(0, { x: 0, y: 0 }, camera);
  expect(bonus.state).toMatchObject({ shield: 60, health: 1, flight: { bulletHits: 2 } });
  bonus.state.charge = 0;
  if (bonus.canyon) {
    bonus.canyon.gateScore.penalty = 600;
    const gun = bonus.canyon.targets.find(target => target.kind === 'turret')!; gun.used = false;
    gun.object.position.copy(camera.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 100);
  } else bonus.root.getObjectById(bonus.rocks[0].id)!.position.set(0, 0, -100);
  expect(bonus.shoot(camera)).toBe(true); expect(bonus.state.charge).toBe(5);
  bonus.protect(100); bonus.step(1, { x: 0, y: 0 }, camera); expect(bonus.state.charge).toBe(5);
  const before = bonus.state.flight.elapsed; bonus.finish('exit'); bonus.step(1, { x: 0, y: 0 }, camera);
  expect(bonus.state.flight.elapsed).toBe(before);
});
it.each([1, 4, 8])('difficulty %i mounts Smuggler guns on diverse surfaces, with stationary pillar tops only', difficulty => {
  const bonus = new BonusController('canyon', 42, difficulty, true); courses.push(bonus);
  const canyon = bonus.canyon!, guns = canyon.targets.filter(target => target.kind === 'turret');
  for (const kind of ['floor', 'leftWall', 'rightWall']) expect(guns.some(gun => gun.mount?.kind === kind)).toBe(true);
  const tops = guns.filter(gun => gun.mount?.kind === 'pillar'); expect(tops.length > 0).toBe(difficulty >= 4);
  for (const gun of tops) {
    const pillar = canyon.barriers.items.find(item => item.object.id === gun.mount!.pillarId)!;
    expect(pillar.kind).toBe('halfPillar');
    expect(gun.object.position.y - (pillar.base.y + 32)).toBeLessThan(30);
    expect(gun.object.position.y).toBe(pillar.base.y + pillar.height + 3);
    const muzzle = canyonGunMuzzle(gun.object);
    expect(canyon.barriers.hitTime(muzzle, muzzle.clone().add(new THREE.Vector3(0, 0, 10)), 2.4)).toBeNull();
  }
  const floor = guns.filter(gun => gun.mount?.kind === 'floor');
  expect(floor.some(gun => Math.abs(gun.object.position.x - canyon.path.getPointAt(0.022).x) < 1)).toBe(true);
});
it('mounted guns actually fire from their exposed muzzles while the course advances', () => {
  const bonus = new BonusController('canyon', 42, 4, true); courses.push(bonus);
  const camera = new THREE.PerspectiveCamera(); bonus.protect(100);
  for (let tick = 0; tick < 120; tick++) bonus.step(1 / 60, { x: 0, y: 0 }, camera);
  expect(bonus.state.enemyShots).toBeGreaterThan(0);
  expect(bonus.canyon!.shots.some(shot => shot.velocity.length() > 180)).toBe(true);
});
