import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { bonusFor, clone, freshProfile, newRun, parseProfile, resources, saveCheckpoint, settleBonus } from './arcade';
import { bonusDifficulty, bonusProfile, TARGET_HIT_POINTS, TARGET_SHOT_COST } from './bonus-difficulty';
import { asteroidFlight, asteroidGap, BonusController } from './bonus';
import { canyonSpeed, CANYON_GUN_WARNING, CANYON_MAX_BOLTS } from './canyon';
import { stageDefinition } from './encounters';
import { ARMADA_LANE_LIMIT, armadaFormationPosition, configureArmadaCamera } from './armada';
import { createWarpRun, WARP_BONUSES } from './level-warp';
import { asteroidTrafficCount } from './asteroid-traffic';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));

it('increases each recurring bonus once per cycle in both modes, with a playable cap', () => {
  for (let level = 1; level <= 8; level++) {
    for (const [kind, first] of Object.entries(WARP_BONUSES)) {
      const stage = first + (level - 1) * 12;
      expect(bonusDifficulty('journey', stage)).toBe(level);
      const run = createWarpRun('journey', stage, 'pulse', true);
      expect(bonusFor(run)).toBe(kind); expect(run.practice).toBe(true);
    }
    for (const first of [5, 10, 15]) expect(bonusDifficulty('endless', first + (level - 1) * 15)).toBe(level);
  }
  expect(bonusDifficulty('endless', 10000)).toBe(8);
  expect(bonusProfile(NaN).level).toBe(1); expect(bonusProfile(-10).level).toBe(1);
  expect(bonusProfile(99).level).toBe(8);
});

it('raises density, flight and motion smoothly, while preserving attack warning and speed caps', () => {
  for (let level = 2; level <= 8; level++) {
    const a = bonusProfile(level - 1), b = bonusProfile(level);
    for (const key of ['asteroidRows', 'canyonObstacles', 'flightScale', 'motionScale', 'targetCount'] as const) expect(b[key]).toBeGreaterThan(a[key]);
    expect(b.targetMinRadius).toBeLessThan(a.targetMinRadius);
    expect(b.shotSpeedScale).toBeLessThanOrEqual(1.35); expect(b.gunCooldown).toBeGreaterThanOrEqual(1.5);
    expect(canyonSpeed(0.5, true, level)).toBeCloseTo(canyonSpeed(0.5, false, level) * 1.5);
    expect(asteroidFlight(0, level).speed).toBeGreaterThan(asteroidFlight(0, level - 1).speed);
  }
  expect(CANYON_GUN_WARNING).toBeGreaterThanOrEqual(0.7); expect(CANYON_MAX_BOLTS).toBe(24);
});

it.each([2, 5, 8])('retains a damage-free route through the static rocks to the exit on difficulty %s', level => {
  const bonus = new BonusController('asteroids', 0x1984, level), camera = new THREE.PerspectiveCamera();
  expect(bonus.rocks).toHaveLength(bonusProfile(level).asteroidRows * 2 - asteroidTrafficCount(level));
  // Isolate rock placement from the separately exercised oncoming traffic.
  for (const ship of bonus.traffic!.ships) ship.used = true;
  let previous = new THREE.Vector2();
  for (let tick = 1; tick < 3601 && !bonus.state.finished; tick++) {
    const gap = asteroidGap(Math.min(55, asteroidFlight(tick / 60, level).progress * 58));
    bonus.step(1 / 60, { x: (gap.x - previous.x) / 0.13, y: -(gap.y - previous.y) / 0.13 }, camera);
    previous = gap;
  }
  expect(bonus.state.reason).toBe('complete'); expect(bonus.state.health).toBe(3);
  expect(bonus.state.elapsed).toBeCloseTo(60 / bonusProfile(level).flightScale, 1);
  bonus.dispose();
});

it.each([2, 5, 8])('keeps canyon gates and obstacles traversable at difficulty %s even with boost', level => {
  const bonus = new BonusController('canyon', 91, level), course = bonus.canyon!, camera = new THREE.PerspectiveCamera();
  expect(course.targets.filter(t => t.kind === 'obstacle')).toHaveLength(bonusProfile(level).canyonObstacles);
  expect(course.targets.filter(t => t.kind === 'turret')).toHaveLength(bonusProfile(level).canyonObstacles / 2);
  // Isolate course geometry; the gun warning and interception paths have their own tests.
  for (const t of course.targets) if (t.kind === 'turret') t.used = true;
  for (let tick = 0; tick < 5000 && !bonus.state.finished; tick++) {
    const gate = course.gates.find(g => !g.resolved)!;
    const target = gate.object.position.clone().sub(course.path.getPointAt(gate.progress));
    const barrier = course.barriers.items.find(item => {
      const ahead = camera.position.z - item.base.z;
      return ahead > -15 && ahead < 65;
    });
    if (barrier) {
      // A bounded dodge between gates: opposite half for side walls, above floor walls,
      // and the clear centre lane for narrow columns (including retracting ones).
      const center = course.path.getPointAt(course.progress);
      target.set(barrier.kind === 'sideWall' ? (barrier.base.x > center.x ? -12 : 12) : 0,
        barrier.kind === 'floorWall' ? 12 : 0, 0);
    }
    bonus.step(1 / 60, { x: (target.x - course.offset.x) / 0.13, y: -(target.y - course.offset.y) / 0.13, boost: true }, camera);
  }
  expect(bonus.state.reason).toBe('complete'); expect(course.passed).toBe(18); expect(bonus.state.health).toBe(3);
  expect(bonus.state.elapsed).toBeLessThan(51 / bonusProfile(level).flightScale);
  bonus.dispose();
});

it.each([2, 5, 8])('randomizes target sizes and positions reproducibly without overlap at difficulty %s', level => {
  const bonus = new BonusController('sequence', 41, level), repeat = new BonusController('sequence', 41, level), camera = new THREE.PerspectiveCamera();
  const field = () => bonus.targetSequence!.targets;
  const stripIds = (b: BonusController) => b.targetSequence!.targets.map(({ id, ...target }) => target);
  expect(stripIds(bonus)).toEqual(stripIds(repeat)); repeat.dispose();
  expect(field()).toHaveLength(bonusProfile(level).targetCount);
  expect(new Set(field().map(t => t.radius)).size).toBeGreaterThan(10);
  expect([...field().map(t => t.number)].sort((a, b) => a - b)).toEqual(Array.from({ length: bonus.state.targetCount }, (_, i) => i + 1));
  camera.lookAt(new THREE.Vector3(...field().find(t => t.number === 1)!.position)); bonus.shoot(camera);
  for (let tick = 0; tick < 180; tick++) {
    bonus.step(1 / 10, { x: 0, y: 0 }, camera);
    const targets = field().filter(t => !t.used);
    for (let i = 0; i < targets.length; i++) {
      const a = targets[i], p = new THREE.Vector3(...a.position);
      expect(Math.abs(Math.atan2(p.x, -p.z))).toBeLessThan(0.55);
      expect(Math.abs(Math.atan2(p.y, Math.hypot(p.x, p.z)))).toBeLessThan(0.45);
      for (const b of targets.slice(i + 1)) expect(p.distanceTo(new THREE.Vector3(...b.position))).toBeGreaterThan(a.radius + b.radius);
    }
  }
  expect(bonus.targetSequence!.speed).toBeGreaterThan(0.7);
  for (let n = 2; n <= bonus.state.targetCount; n++) {
    camera.lookAt(new THREE.Vector3(...field().find(t => t.number === n)!.position));
    expect(bonus.shoot(camera)).toBe(true); bonus.step(0.1, { x: 0, y: 0 }, camera);
  }
  expect(bonus.state.reason).toBe('complete'); expect(bonus.ratio).toBe(1);
  expect(bonus.state.points).toBe(bonus.state.targetCount * 95); expect(bonus.state.shotsFired).toBe(bonus.state.targetCount);
  bonus.dispose();
});

it.each(['pulse', 'spread', 'lance'] as const)('charges %s once per fired volley, including misses and wrong targets', family => {
  const bonus = new BonusController('sequence', 3), camera = new THREE.PerspectiveCamera();
  bonus.state.family = family;
  camera.lookAt(0, 100, 0); bonus.shoot(camera);
  expect(bonus.state.points).toBe(-TARGET_SHOT_COST); expect(bonus.state.shotsFired).toBe(1);
  bonus.blast(camera); expect(bonus.state.shotsFired).toBe(1);
  const aim = (number: number) => camera.lookAt(new THREE.Vector3(...bonus.targetSequence!.targets.find(t => t.number === number)!.position));
  aim(16); bonus.shoot(camera); expect(bonus.state.remaining).toBe(58); expect(bonus.state.points).toBe(-10);
  aim(1); bonus.shoot(camera); expect(bonus.state.points).toBe(TARGET_HIT_POINTS - 3 * TARGET_SHOT_COST);
  bonus.finish('exit'); bonus.shoot(camera); expect(bonus.state.shotsFired).toBe(3);
  bonus.dispose();
});

it('pays net target points once, preserves banked score on a negative result, and survives reload', () => {
  for (const points of [-100, 470, 2850]) {
    const run = newRun('journey', 5); run.stage = 95; run.bonusStatus = 'entered'; run.pilot.score = 500;
    const before = clone(resources(run));
    const result = settleBonus(run, Math.max(0, points / 2850), points)!;
    expect(result.score).toBe(Math.max(0, points)); expect(run.pilot.score).toBe(500 + Math.max(0, points));
    expect(run.pilot.hull).toBe(before.pilot.hull); expect(run.pilot.inventory).toEqual(before.pilot.inventory);
    const profile = freshProfile(); saveCheckpoint(profile, run);
    const restored = parseProfile(JSON.stringify(profile), null).checkpoints.journey!;
    expect(settleBonus(restored, 1, 2850)).toBeNull(); expect(restored.pilot.score).toBe(run.pilot.score);
  }
});

it.each(['journey', 'endless'] as const)('adds more armada ships in %s while keeping every column reachable', mode => {
  const late = stageDefinition(mode, mode === 'journey' ? 95 : 98), first = stageDefinition(mode, 3);
  expect(late.kind).toBe('armada'); expect(late.waves[0].enemies.length).toBe(14);
  expect(late.waves[0].enemies.length).toBeGreaterThan(first.waves[0].enemies.length);
  expect(late.attackerCap).toBeLessThanOrEqual(6);
  for (const count of [9, 12, 14, 18]) for (const aspect of [16 / 9, 390 / 844]) {
    const camera = new THREE.PerspectiveCamera(70, aspect, 1, 10000); configureArmadaCamera(camera);
    for (let i = 0; i < count; i++) {
      const position = armadaFormationPosition(i, count), projected = position.clone().project(camera);
      expect(Math.abs(position.x)).toBeLessThan(ARMADA_LANE_LIMIT);
      expect(Math.abs(projected.x)).toBeLessThan(1); expect(Math.abs(projected.y)).toBeLessThan(1);
    }
  }
});
