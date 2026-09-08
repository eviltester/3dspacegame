import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { BonusController } from './bonus';
import { Random } from './encounters';
import { freshProfile, newRun, parseProfile, saveCheckpoint } from './arcade';
import { settleCourse } from './session/stage-flow';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));
afterEach(() => vi.restoreAllMocks());
function course() {
  const bonus = new BonusController('canyon', 3), camera = new THREE.PerspectiveCamera();
  for (const target of bonus.canyon!.targets) target.used = true;
  return { bonus, camera, step: (dt = 0, x = 0) => bonus.step(dt, { x, y: 0 }, camera) };
}
function incoming(bonus: BonusController, camera: THREE.Camera) {
  const object = new THREE.Group(); object.position.copy(camera.position);
  bonus.canyon!.shots.push({ kind: 'hostileBolt', object, radius: 2, number: 0, used: false, life: 2, velocity: new THREE.Vector3() });
}
it('every actual gun-bolt impact costs twenty shield, including simultaneous hits, before exposing hull', () => {
  const { bonus, camera, step } = course();
  for (let i = 0; i < 5; i++) incoming(bonus, camera);
  step(); expect(bonus.state).toMatchObject({ shield: 0, health: 3, finished: false });
  for (let hull = 2; hull >= 0; hull--) { incoming(bonus, camera); step(); expect(bonus.state.health).toBe(hull); }
  expect(bonus.state.reason).toBe('crash'); expect(bonus.canyon!.shots).toHaveLength(0); bonus.dispose();
});
it('canyon scrapes cost ten shield or ten damage, with grace between repeated contacts', () => {
  const { bonus, step } = course();
  step(0, 1000); expect(bonus.state.shield).toBe(90); expect(bonus.state.health).toBe(3);
  step(0.1); expect(bonus.state.health).toBe(3);
  bonus.state.shield = 0;
  step(1.21); expect(bonus.state.damage).toBe(10); expect(bonus.state.health).toBe(3); expect(bonus.state.finished).toBe(false);
  bonus.dispose();
});
it('respawn protection ignores gun and wall hits until it expires', () => {
  const { bonus, camera, step } = course(); bonus.protect(3);
  incoming(bonus, camera); step(0, 1000); expect(bonus.state).toMatchObject({ health: 3, shield: 100 });
  step(1); expect(bonus.state.shield).toBe(100);
  step(2.01); expect(bonus.state.shield).toBe(90); expect(bonus.state.health).toBe(3); bonus.dispose();
});
it('colliding with a crate uses the shield-impact rule but never grants a kill or haul', () => {
  const { bonus, step } = course(); const target = bonus.canyon!.targets[0]; target.used = false; target.object.position.set(0, 0, 0);
  step(); expect(target.used).toBe(true); expect(bonus.state).toMatchObject({ shield: 80, health: 3, points: 0, haul: 0 });
  expect(bonus.cargo.drops).toHaveLength(0); bonus.dispose();
});
it('shot crates release haul, collection changes cargo only, and EXIT pays once with a saved breakdown', () => {
  const { bonus, camera, step } = course(), run = newRun('smuggler', 3); run.stage = 2; run.phase = 'playing';
  const target = bonus.canyon!.targets[0]; target.used = false; target.object.position.set(0, 0, -100);
  const random = vi.spyOn(Random.prototype, 'next').mockReturnValue(0.1);
  expect(bonus.shoot(camera)).toBe(true); expect(bonus.state).toMatchObject({ haul: 0, points: 0 }); expect(bonus.cargo.drops).toHaveLength(1);
  random.mockRestore();
  bonus.cargo.drops[0].object.position.set(0, 0, -5); step(); expect(bonus.state).toMatchObject({ haul: 1, points: 0 });
  step(); expect(bonus.state.haul).toBe(1); expect(bonus.state.notice).toContain('HAUL +1');
  expect(settleCourse(run, bonus.state, bonus.ratio)).toBeNull(); expect(run.pilot.score).toBe(0);
  bonus.finish('complete'); const paid = settleCourse(run, bonus.state, bonus.ratio)!;
  expect(run.smugglerResult?.haulPoints).toBe(75); expect(paid.score).toBeGreaterThan(1375);
  expect(run.stageHaul).toBe(1); expect(settleCourse(run, bonus.state, bonus.ratio)).toBeNull();
  const profile = freshProfile(); saveCheckpoint(profile, run);
  const saved = parseProfile(JSON.stringify(profile), null).checkpoints.smuggler!;
  expect(saved.stageHaul).toBe(1); expect(saved.pilot.score).toBe(paid.score); expect(settleCourse(saved, bonus.state, bonus.ratio)).toBeNull(); bonus.dispose();
});
it.each(['shield', 'repair'] as const)('%s collection restores canyon shield alongside its hull repair', kind => {
  const { bonus, step } = course(); bonus.state.health = 1; bonus.state.shield = 0;
  const random = vi.spyOn(Random.prototype, 'next').mockReturnValue(0);
  bonus.repairs.release(kind === 'shield' ? 'obstacle' : 'turret', new THREE.Vector3(0, 0, -5)); random.mockRestore();
  step(); expect(bonus.state.health).toBe(kind === 'shield' ? 2 : 3); expect(bonus.state.shield).toBe(kind === 'shield' ? 20 : 100);
  step(); expect(bonus.repairs.collected).toBe(1); bonus.dispose();
});
it.each(['shot', 'blast'] as const)('%s gun kills pay two hundred points, with no duplicate award', method => {
  const { bonus, camera } = course(); const gun = bonus.canyon!.targets.find(target => target.kind === 'turret')!;
  gun.used = false; gun.object.position.set(0, 0, -100);
  const action = () => method === 'shot' ? bonus.shoot(camera) : bonus.blast(camera);
  action(); expect(gun.used).toBe(true); expect(bonus.state.points).toBe(200);
  action(); expect(bonus.state.points).toBe(method === 'shot' ? 150 : 200); bonus.dispose();
});
it('a solid pillar impact drains shields, deflects the skiff and never halts forward progress', () => {
  const bonus = new BonusController('canyon', 3, 2), canyon = bonus.canyon!, camera = new THREE.PerspectiveCamera();
  for (const target of canyon.targets) target.used = true;
  const item = canyon.barriers.items[0]; item.base.set(0, -32, -15);
  bonus.step(0.01, { x: 0, y: 0 }, camera);
  for (let tick = 0; tick < 120; tick++) bonus.step(1 / 60, { x: 0, y: 0 }, camera);
  expect(bonus.state.shield).toBe(80); expect(bonus.state.health).toBe(3);
  expect(item.collided).toBe(true); expect(camera.position.z).toBeLessThan(-90);
  expect(Math.abs(canyon.offset.x)).toBeGreaterThan(5); expect(bonus.state.finished).toBe(false); bonus.dispose();
});
it('solid scenery blocks primary and enemy fire, survives a blast, and leaves open-lane targets shootable', () => {
  const bonus = new BonusController('canyon', 3, 2), canyon = bonus.canyon!, camera = new THREE.PerspectiveCamera();
  for (const target of canyon.targets) target.used = true;
  canyon.barriers.items[0].base.set(0, -32, -100);
  bonus.step(0, { x: 0, y: 0 }, camera);
  const gun = canyon.targets.find(target => target.kind === 'turret')!; gun.used = false; gun.object.position.set(0, 0, -160);
  expect(bonus.shoot(camera)).toBe(false); expect(gun.used).toBe(false); expect(bonus.state.points).toBe(-50);
  const object = new THREE.Group(); object.position.set(0, 0, -150);
  canyon.shots.push({ kind: 'hostileBolt', object, radius: 2, number: 0, used: false, life: 4, velocity: new THREE.Vector3(0, 0, 1000) });
  bonus.step(0.2, { x: 0, y: 0 }, camera);
  expect(canyon.shots).toHaveLength(0); expect(bonus.state.shield).toBe(100);
  gun.object.position.x = 30; camera.lookAt(gun.object.position);
  expect(bonus.shoot(camera)).toBe(true); expect(gun.used).toBe(true);
  expect(bonus.blast(camera)).toBe(true); expect(canyon.barriers.items[0].object.visible).toBe(true);
  bonus.dispose();
});
