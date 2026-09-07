import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { BonusController } from './bonus';
import { Random } from './encounters';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));
afterEach(() => vi.restoreAllMocks());

function canyon() {
  const bonus = new BonusController('canyon', 3), camera = new THREE.PerspectiveCamera();
  for (const target of bonus.canyon!.targets) target.used = true;
  return { bonus, camera };
}
it.each([['pulse', 50], ['spread', 150], ['lance', 50]] as const)('%s charges %s for a wholly missed canyon volley, once only', (family, cost) => {
  const { bonus, camera } = canyon(); bonus.state.family = family; bonus.state.charge = 20;
  expect(bonus.shoot(camera)).toBe(false); expect(bonus.state.points).toBe(-cost);
  expect(bonus.state.notice).toBe(`SHOT MISSED -${cost}`); expect(bonus.state.shotsFired).toBe(1);
  expect(bonus.canyon!.penalty).toBe(0); expect(bonus.state.charge).toBe(20);
  bonus.step(0, { x: 0, y: 0 }, camera); expect(bonus.state.points).toBe(-cost);
  bonus.finish('exit'); expect(bonus.shoot(camera)).toBe(false); expect(bonus.state.points).toBe(-cost);
  bonus.dispose();
});
it('Spread can hit once while two other bolts miss, and cannot farm a destroyed target for drops', () => {
  const { bonus, camera } = canyon(); bonus.state.family = 'spread';
  const target = bonus.canyon!.targets[0]; target.used = false; target.object.position.set(0, 0, -300);
  const release = vi.spyOn(bonus.repairs, 'release');
  expect(bonus.shoot(camera)).toBe(true); expect(bonus.state.points).toBe(-100);
  expect(release).toHaveBeenCalledExactlyOnceWith('obstacle', target.object.position);
  expect(bonus.shoot(camera)).toBe(false); expect(release).toHaveBeenCalledTimes(1); expect(bonus.state.points).toBe(-250);
  bonus.dispose();
});
it('Lance piercing multiple targets is one hit and interceptions prevent miss penalties', () => {
  const { bonus, camera } = canyon(); bonus.state.family = 'lance';
  const targets = bonus.canyon!.targets.filter(target => target.kind === 'obstacle').slice(0, 3);
  targets.forEach((target, i) => { target.used = false; target.object.position.set(0, 0, -100 - i * 60); });
  expect(bonus.shoot(camera)).toBe(true); expect(bonus.state.points).toBe(0);
  const object = new THREE.Group(); object.position.set(0, 0, -50);
  bonus.canyon!.shots.push({ kind: 'hostileBolt', object, radius: 2, number: 0, used: false, life: 2, velocity: new THREE.Vector3() });
  bonus.state.charge = 20; expect(bonus.shoot(camera)).toBe(true);
  expect(bonus.state.points).toBe(10); expect(bonus.state.charge).toBe(30); bonus.dispose();
});
it.each([['obstacle', 'shield', 2], ['turret', 'repair', 3]] as const)('shot %s releases a collectible %s that repairs %s skiff health', (kind, repair, health) => {
  const { bonus, camera } = canyon(); bonus.state.health = 1;
  const target = bonus.canyon!.targets.find(target => target.kind === kind)!;
  target.used = false; target.object.position.set(0, 0, -100);
  vi.spyOn(Random.prototype, 'next').mockReturnValue(0);
  expect(bonus.shoot(camera)).toBe(true); expect(bonus.repairs.drops[0].kind).toBe(repair); expect(bonus.state.health).toBe(1);
  bonus.repairs.drops[0].object.position.set(0, 0, -5);
  bonus.step(0, { x: 0, y: 0 }, camera); expect(bonus.state.health).toBe(health); expect(bonus.state.notice).toContain('PICKUP');
  bonus.step(0, { x: 0, y: 0 }, camera); expect(bonus.state.health).toBe(health); expect(bonus.repairs.collected).toBe(1);
  bonus.dispose();
});
it('asteroid shots and fragments can release repairs, but misses, crashes and blasts do not roll drops', () => {
  const bonus = new BonusController('asteroids', 12), camera = new THREE.PerspectiveCamera();
  for (const child of bonus.root.children) child.position.set(1000, 0, -1000);
  const rock = bonus.root.children[0]; rock.position.set(0, 0, -160);
  const release = vi.spyOn(bonus.repairs, 'release'); vi.spyOn(Random.prototype, 'next').mockReturnValue(2.5 / 30);
  expect(bonus.shoot(camera)).toBe(true); expect(release).toHaveBeenCalledExactlyOnceWith('rock', rock.position);
  expect(bonus.repairs.drops[0].kind).toBe('repair');
  const fragment = bonus.rocks.find(item => item.size === 1)!;
  for (const child of bonus.root.children) child.position.set(1000, 0, -1000);
  bonus.root.getObjectById(fragment.id)!.position.set(0, 0, -160);
  bonus.shoot(camera); expect(release).toHaveBeenCalledTimes(2);
  camera.lookAt(0, 100, 0); const points = bonus.state.points;
  expect(bonus.shoot(camera)).toBe(false); expect(bonus.state.points).toBe(points);
  bonus.blast(camera); bonus.finish('crash'); bonus.step(0, { x: 0, y: 0 }, camera);
  expect(release).toHaveBeenCalledTimes(2); bonus.dispose();
});
it('canyon blasts leave pickups intact and never charge a shot-miss penalty', () => {
  const { bonus, camera } = canyon(); vi.spyOn(Random.prototype, 'next').mockReturnValue(0);
  bonus.repairs.release('rock', new THREE.Vector3(0, 0, -80)); expect(bonus.repairs.drops).toHaveLength(1);
  const release = vi.spyOn(bonus.repairs, 'release');
  const target = bonus.canyon!.targets[0]; target.used = false; target.object.position.set(0, 0, -50);
  expect(bonus.blast(camera)).toBe(true); expect(bonus.state.points).toBe(0);
  expect(release).not.toHaveBeenCalled(); expect(bonus.repairs.drops[0].object.visible).toBe(true); bonus.dispose();
});
