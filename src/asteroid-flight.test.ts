import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { ASTEROID_DURATION, ASTEROID_LENGTH, asteroidFlight, asteroidGap, BonusController } from './bonus';
import { clone, newRun, resources, settleBonus } from './arcade';
import { bonusProfile } from './bonus-difficulty';
import { ASTEROID_COLORS, COLORS } from './models/primitives';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));

it.each([1, 4, 8])('uses a repeatable mix of bright asteroid colours at difficulty %s', difficulty => {
  const bonus = new BonusController('asteroids', 42, difficulty), repeat = new BonusController('asteroids', 42, difficulty);
  const colors = (course: BonusController) => course.rocks.map(rock => {
    const object = course.root.getObjectById(rock.id) as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    return object.material.color.getHex();
  });
  const palette = colors(bonus);
  expect(new Set(palette.slice(0, 10))).toEqual(new Set(ASTEROID_COLORS));
  expect(palette).toEqual(colors(repeat));
  expect(palette).not.toContain(COLORS.cargo);
  expect(palette).not.toContain(0x48ff95);
  bonus.step(0.1, { x: 0, y: 0 }, new THREE.PerspectiveCamera());
  expect(colors(bonus)).toEqual(palette);
  bonus.dispose(); repeat.dispose();
});

it.each([1, 4, 8])('scatters rocks above, below and in depth without blocking the route at difficulty %s', difficulty => {
  for (const seed of [1, 12, 99]) {
    const bonus = new BonusController('asteroids', seed, difficulty), repeat = new BonusController('asteroids', seed, difficulty);
    const rocks = bonus.rocks;
    expect(rocks).toHaveLength(bonusProfile(difficulty).asteroidRows * 2);
    expect(rocks.map(({ id, ...rock }) => rock)).toEqual(repeat.rocks.map(({ id, ...rock }) => rock));
    const quadrants = new Set<number>();
    let above = 0, below = 0, staggered = 0;
    for (const [i, rock] of rocks.entries()) {
      const [x, y, z] = rock.position;
      const route = asteroidGap(-z / ASTEROID_LENGTH * 58);
      const clearance = Math.hypot(x - route.x, y - route.y) - rock.radius;
      expect(clearance).toBeGreaterThanOrEqual(16 - 1e-8);
      expect(clearance).toBeLessThanOrEqual(21 + 1e-8);
      quadrants.add((x > route.x ? 1 : 0) + (y > route.y ? 2 : 0));
      if (y > 18) above++;
      if (y < -18) below++;
      if (i % 2 && Math.abs(z - rocks[i - 1].position[2]) > 3) staggered++;
    }
    expect(quadrants.size).toBe(4);
    expect(above).toBeGreaterThan(rocks.length * 0.15);
    expect(below).toBeGreaterThan(rocks.length * 0.15);
    expect(staggered).toBeGreaterThan(rocks.length * 0.3);
    bonus.dispose(); repeat.dispose();
  }
});

it('ramps from 48 to 112 while covering the original belt in sixty seconds', () => {
  expect(asteroidFlight(0)).toEqual({ speed: 48, progress: 0 });
  expect(asteroidFlight(30)).toEqual({ speed: 80, progress: 0.4 });
  expect(asteroidFlight(60)).toEqual({ speed: 112, progress: 1 });
  expect(asteroidFlight(70)).toEqual(asteroidFlight(60));
  let distance = 0;
  for (let i = 0; i < 3600; i++) distance += asteroidFlight((i + 0.5) / 60).speed / 60;
  expect(distance).toBeCloseTo(ASTEROID_LENGTH);
});

it.each(['complete', 'gateMissed'] as const)('requires a plane crossing through the opening: %s', outcome => {
  const bonus = new BonusController('asteroids', 42), camera = new THREE.PerspectiveCamera();
  let previous = new THREE.Vector2();
  let finalGate = false, earlySpeed = 0, lateSpeed = 0;
  for (let tick = 1; tick <= 3601 && !bonus.state.finished; tick++) {
    const flight = asteroidFlight(tick / 60), gap = asteroidGap(Math.min(55, flight.progress * 58));
    if (outcome === 'gateMissed' && flight.progress > 0.97) gap.x = -38;
    bonus.step(1 / 60, { x: (gap.x - previous.x) / 0.13, y: -(gap.y - previous.y) / 0.13 }, camera); previous = gap;
    if (tick === 600) earlySpeed = bonus.asteroidRun!.speed;
    if (tick === 3000) lateSpeed = bonus.asteroidRun!.speed;
    if (flight.progress > 0.99 && flight.progress < 0.995) {
      finalGate = true; expect(bonus.state.finished).toBe(false); expect(bonus.asteroidRun!.exitApproach).toBe(true);
    }
  }
  expect(lateSpeed).toBeGreaterThan(earlySpeed * 1.5); expect(finalGate).toBe(true);
  expect(bonus.state.reason).toBe(outcome); expect(bonus.state.health).toBe(3);
  const frozen = clone(bonus.state); bonus.step(10, { x: 0, y: 0 }, camera); bonus.finish('exit'); expect(bonus.state).toEqual(frozen);
  bonus.dispose();
});

it('keeps the exit opening beyond the last rocks and immune to weapons and blasts', () => {
  const bonus = new BonusController('asteroids', 9), camera = new THREE.PerspectiveCamera(), exit = bonus.asteroidRun!.gate;
  const position = new THREE.Vector3(...exit.position), lastRock = Math.min(...bonus.rocks.map(r => r.position[2]));
  expect(lastRock - position.z).toBeGreaterThan(200);
  camera.position.copy(position).add(new THREE.Vector3(0, 0, 60)); camera.lookAt(position);
  const gate = bonus.root.children.find(object => object.position.equals(position))!;
  const nearbyRocks = bonus.rocks.filter(rock => new THREE.Vector3(...rock.position).distanceTo(camera.position) <= 240).length;
  expect(bonus.shoot(camera)).toBe(false); expect(bonus.blast(camera)).toBe(true);
  expect(gate.visible).toBe(true); expect(bonus.state.finished).toBe(false); expect(bonus.state.points).toBe(nearbyRocks);
  expect(exit.radius).toBeGreaterThan(10); bonus.dispose();
});

it('announces the final approach once and retains the sixty-second clock', () => {
  const bonus = new BonusController('asteroids', 8), camera = new THREE.PerspectiveCamera();
  // Isolate the announcement from obstacle collisions.
  for (const rock of bonus.rocks) bonus.root.getObjectById(rock.id)!.position.x += 10000;
  bonus.step(50, { x: 0, y: 0 }, camera); expect(bonus.state.notice).toContain('EXIT GATE AHEAD');
  bonus.state.notice = ''; bonus.step(1, { x: 0, y: 0 }, camera);
  expect(bonus.state.notice).toBe(''); expect(bonus.state.remaining).toBe(ASTEROID_DURATION - 51);
  expect(bonus.state.finished).toBe(false); bonus.dispose();
});

it.each(['complete', 'gateMissed', 'exit', 'crash'] as const)('%s preserves the main ship and pays partial rewards only once', reason => {
  const run = newRun('journey', 5); run.bonusStatus = 'entered'; run.charge = 55; run.pilot.inventory.legalCargo = 2;
  const before = resources(run), lives = run.lives;
  const bonus = new BonusController('asteroids', 5); bonus.state.elapsed = 40; bonus.state.points = 5; bonus.finish(reason);
  expect(settleBonus(run, bonus.ratio)).not.toBeNull(); const paid = clone(run);
  expect(settleBonus(run, bonus.ratio)).toBeNull(); expect(run).toEqual(paid);
  expect(run.lives).toBe(lives); expect(run.charge).toBe(before.charge); expect(run.tiers).toEqual(before.tiers);
  expect(run.pilot.hull).toBe(before.pilot.hull); expect(run.pilot.shield).toBe(before.pilot.shield);
  expect(run.pilot.inventory).toEqual(before.pilot.inventory); bonus.dispose();
});
