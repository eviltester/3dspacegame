import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BonusController } from './bonus';
import { CanyonCourse, canyonGateCrossing, canyonSpeed, CANYON_GATES, CANYON_GUN_WARNING, CANYON_MAX_BOLTS } from './canyon';
import { clone, newRun, resources, settleBonus } from './arcade';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));

function drive(course: CanyonCourse, miss: number[] = [], boost = false) {
  const gate = course.gates.find(g => !g.resolved)!;
  const center = course.path.getPointAt(gate.progress);
  const target = gate.object.position.clone().sub(center);
  if (miss.includes(course.gates.indexOf(gate))) { target.x = target.x < 0 ? 30 : -30; target.y = 0; }
  return { x: (target.x - course.offset.x) / 0.13, y: -(target.y - course.offset.y) / 0.13, boost };
}

describe('accelerating canyon course', () => {
  it('starts at cruise, accelerates smoothly, and boosts without any braking path', () => {
    expect(canyonSpeed(0, false)).toBe(48); expect(canyonSpeed(0.5, false)).toBe(96);
    expect(canyonSpeed(1, false)).toBe(144); expect(canyonSpeed(0.5, true)).toBe(144);
    expect(canyonSpeed(99, true)).toBe(216);
  });
  it('has 18 differently sized moving gates, more obstacles and guns, and a stationary final exit', () => {
    const bonus = new BonusController('canyon', 42), course = bonus.canyon!;
    const gates = course.gates;
    expect(gates.length).toBe(19); expect(gates[17].radius).toBeLessThan(gates[0].radius * 0.5);
    expect(new Set(gates.map(g => g.radius)).size).toBeGreaterThan(10);
    const before = gates.map(g => g.object.position.clone());
    bonus.step(0.1, { x: 0, y: 0 }, new THREE.PerspectiveCamera());
    expect(gates.slice(0, 18).every((g, i) => !g.object.position.equals(before[i]))).toBe(true);
    expect(gates[18].object.position.equals(before[18])).toBe(true); expect(gates[18].exit).toBe(true);
    expect(course.targets.filter(t => t.kind === 'turret').length).toBe(26);
    expect(course.targets.filter(t => t.kind === 'obstacle').length).toBe(52);
    bonus.dispose();
  });
  it.each([1, 42, 12345, 0xffffffff])('keeps the moving-gate route clear of geometry for seed %s', seed => {
    const bonus = new BonusController('canyon', seed), course = bonus.canyon!, camera = new THREE.PerspectiveCamera();
    // Isolate route geometry from the separately tested turret fire.
    for (const target of course.targets) if (target.kind === 'turret') target.used = true;
    let lastSpeed = 0;
    for (let tick = 0; tick < 5000 && !bonus.state.finished; tick++) {
      bonus.step(1 / 60, drive(course), camera);
      expect(course.speed).toBeGreaterThanOrEqual(lastSpeed); lastSpeed = course.speed;
    }
    expect(bonus.state.reason).toBe('complete'); expect(bonus.state.elapsed).toBeGreaterThan(70);
    expect(bonus.state.elapsed).toBeLessThan(76); expect(course.passed).toBe(18);
    expect(bonus.state.health).toBe(3); expect(course.missed).toBe(0);
    bonus.dispose();
  });
  it('boost advances actual distance and reaches the final gate sooner', () => {
    const bonus = new BonusController('canyon', 5), camera = new THREE.PerspectiveCamera(), course = bonus.canyon!;
    for (const target of course.targets) if (target.kind === 'turret') target.used = true;
    while (!bonus.state.finished && bonus.state.elapsed < 60) bonus.step(1 / 60, drive(course, [], true), camera);
    expect(bonus.state.reason).toBe('complete'); expect(bonus.state.elapsed).toBeLessThan(51);
    expect(bonus.state.health).toBe(3); expect(course.passed).toBe(18); bonus.dispose();
  });
});

describe('gate crossing and safe failure', () => {
  it('sweeps across moving openings and rejects grazing the rim or flying beside them', () => {
    const course = new CanyonCourse(new THREE.Group(), 1), gate = course.gates[0];
    gate.previous.set(0, 0, -100); gate.object.position.set(8, 0, -100); gate.radius = 12;
    expect(canyonGateCrossing(new THREE.Vector3(4, 0, -80), new THREE.Vector3(4, 0, -120), gate)).toBe(true);
    expect(canyonGateCrossing(new THREE.Vector3(25, 0, -80), new THREE.Vector3(25, 0, -120), gate)).toBe(false);
    expect(canyonGateCrossing(new THREE.Vector3(14, 0, -80), new THREE.Vector3(14, 0, -120), gate)).toBe(false);
    expect(canyonGateCrossing(new THREE.Vector3(4, 0, -120), new THREE.Vector3(4, 0, -130), gate)).toBeNull();
  });
  it('allows one miss, resets after a pass, and ends immediately on two consecutive misses', () => {
    const bonus = new BonusController('canyon', 3), course = bonus.canyon!, camera = new THREE.PerspectiveCamera();
    for (const target of course.targets) target.used = true;
    const observed: number[] = []; let next = 0;
    while (!bonus.state.finished && bonus.state.elapsed < 35) {
      bonus.step(1 / 60, drive(course, [0, 2, 3]), camera);
      if (course.nextGate !== next) { observed.push(course.missed); next = course.nextGate; }
    }
    expect(observed).toEqual([1, 0, 1, 2]); expect(bonus.state.reason).toBe('missedGates');
    const snapshot = clone(bonus.state); bonus.step(10, { x: 0, y: 0 }, camera); bonus.finish('complete');
    expect(bonus.state).toEqual(snapshot); bonus.dispose();
  });
  it('ends in a wall impact when all green gates were passed but the final exit was missed', () => {
    const bonus = new BonusController('canyon', 7), course = bonus.canyon!, camera = new THREE.PerspectiveCamera();
    for (const target of course.targets) target.used = true;
    while (!bonus.state.finished && bonus.state.elapsed < 80) bonus.step(1 / 60, drive(course, [18]), camera);
    expect(course.passed).toBe(CANYON_GATES); expect(bonus.state.reason).toBe('wall');
    expect(bonus.state.health).toBe(3); bonus.dispose();
  });
  it.each(['missedGates', 'wall', 'crash', 'complete', 'exit'] as const)('%s banks partial rewards once without touching the main ship', reason => {
    const run = newRun('journey', 2); run.stage = 7; run.bonusStatus = 'entered';
    run.pilot.inventory.legalCargo = 2; run.tiers.lance = 2; run.charge = 35;
    const before = resources(run), lives = run.lives;
    const bonus = new BonusController('canyon', 2); bonus.state.points = 12; bonus.finish(reason);
    expect(settleBonus(run, bonus.ratio)).not.toBeNull(); const paid = clone(run);
    expect(settleBonus(run, bonus.ratio)).toBeNull(); expect(run).toEqual(paid);
    expect(run.lives).toBe(lives); expect(run.charge).toBe(before.charge); expect(run.tiers).toEqual(before.tiers);
    expect(run.pilot.hull).toBe(before.pilot.hull); expect(run.pilot.shield).toBe(before.pilot.shield);
    expect(run.pilot.inventory).toEqual(before.pilot.inventory); bonus.dispose();
  });
});

describe('canyon combat', () => {
  it('warns for at least 0.7 seconds before firing, produces visible bolts, and caps active shots', () => {
    const bonus = new BonusController('canyon', 12), camera = new THREE.PerspectiveCamera();
    expect(CANYON_GUN_WARNING).toBeGreaterThanOrEqual(0.7);
    for (let i = 0; i < 42; i++) bonus.step(1 / 60, { x: 0, y: 0 }, camera);
    expect(bonus.state.enemyShots).toBe(0);
    for (let i = 0; i < 90 && !bonus.canyon!.shots.length; i++) bonus.step(1 / 60, { x: 0, y: 0 }, camera);
    expect(bonus.state.enemyShots).toBeGreaterThan(0); expect(bonus.canyon!.shots.some(b => b.object.visible)).toBe(true);
    for (let i = 0; i < 600 && !bonus.state.finished; i++) {
      bonus.step(1 / 60, { x: 0, y: 0 }, camera); expect(bonus.canyon!.shots.length).toBeLessThanOrEqual(CANYON_MAX_BOLTS);
    }
    expect(bonus.state.health).toBeLessThan(3); bonus.dispose();
  });
  it('shoots guns and obstacles, and destroyed guns cannot fire', () => {
    const bonus = new BonusController('canyon', 12), course = bonus.canyon!, camera = new THREE.PerspectiveCamera();
    const gun = course.targets.find(t => t.kind === 'turret')!;
    camera.lookAt(gun.object.position); expect(bonus.shoot(camera)).toBe(true); expect(gun.used).toBe(true);
    const obstacle = course.targets.find(t => t.kind === 'obstacle')!;
    camera.lookAt(obstacle.object.position); expect(bonus.shoot(camera)).toBe(true); expect(obstacle.used).toBe(true);
    for (const target of course.targets) if (target.kind === 'turret') target.used = true;
    for (let i = 0; i < 180; i++) bonus.step(1 / 60, { x: 0, y: 0 }, camera);
    expect(bonus.state.enemyShots).toBe(0); bonus.dispose();
  });
  it('intercepts hostile fire for 10% charge and a blast clears nearby bolts without consuming gates', () => {
    const bonus = new BonusController('canyon', 12), course = bonus.canyon!, camera = new THREE.PerspectiveCamera();
    for (let i = 0; i < 120 && !course.shots.length; i++) bonus.step(1 / 60, { x: 0, y: 0 }, camera);
    for (let i = 0; i < 6; i++) bonus.step(1 / 60, { x: 0, y: 0 }, camera);
    const shot = course.shots[0]; expect(shot).toBeDefined();
    bonus.state.charge = 0; camera.lookAt(shot.object.position); expect(bonus.shoot(camera)).toBe(true);
    expect(shot.used).toBe(true); expect(bonus.state.charge).toBe(10);
    bonus.step(1 / 60, { x: 0, y: 0 }, camera);
    for (let i = 0; i < 600 && !bonus.state.finished && !course.shots.some(b => b.object.position.distanceTo(camera.position) <= 240); i++) bonus.step(1 / 60, { x: 0, y: 0 }, camera);
    const nearby = course.shots.filter(b => b.object.position.distanceTo(camera.position) <= 240);
    expect(nearby.length).toBeGreaterThan(0);
    bonus.state.charge = 100; expect(bonus.blast(camera)).toBe(true);
    expect(nearby.every(b => b.used && !b.object.visible)).toBe(true);
    expect(course.gates.every(g => g.object.visible)).toBe(true); bonus.dispose();
  });
});
