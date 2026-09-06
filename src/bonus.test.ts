import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ASTEROID_FRAGMENT_GRACE, asteroidFlight, asteroidGap, BonusController, MAX_ASTEROID_FRAGMENTS } from './bonus';
import { weaponSpec } from './weapons';

vi.mock('./models', async importOriginal => ({
  ...await importOriginal<typeof import('./models')>(),
  createTextSprite: () => new THREE.Group()
}));

describe('bonus defensive blast', () => {
  it('clears nearby rocks once, preserves salvage, and never exits the asteroid run', () => {
    const bonus = new BonusController('asteroids', 12);
    const camera = new THREE.PerspectiveCamera();
    const originalObjects = [...bonus.root.children];
    const rocks = originalObjects.filter(object => object instanceof THREE.LineSegments);
    const near = rocks.filter(object => object.position.length() <= 240);
    const far = rocks.filter(object => object.position.length() > 240);
    const salvage = originalObjects.filter(object => object instanceof THREE.Group);
    expect(near.length).toBeGreaterThan(0); expect(far.length).toBeGreaterThan(0); expect(salvage.length).toBeGreaterThan(0);
    expect(bonus.state.charge).toBe(100);
    expect(bonus.blast(camera)).toBe(true);
    expect(bonus.state.charge).toBe(0);
    expect(bonus.state.points).toBe(near.length);
    expect(near.every(object => !object.visible)).toBe(true);
    expect([...far, ...salvage].every(object => object.visible)).toBe(true);
    expect(bonus.state.health).toBe(3);
    expect(bonus.state.finished).toBe(false); expect(bonus.state.reason).toBeNull();
    expect(bonus.blast(camera)).toBe(false);
    expect(bonus.state.points).toBe(near.length);
    expect(bonus.root.children.length).toBe(originalObjects.length + 1);
    bonus.step(0.7, { x: 0, y: 0 }, camera);
    expect(bonus.root.children.length).toBe(originalObjects.length);
    bonus.dispose();
  });

  it('recharges 5% on successful shots, not on misses or blast kills, and caps at full', () => {
    const bonus = new BonusController('asteroids', 12);
    const camera = new THREE.PerspectiveCamera();
    bonus.blast(camera);
    const aimAtRock = () => {
      const target = bonus.root.children.find(object => object instanceof THREE.LineSegments && object.visible && object.position.z < -240 && object.position.length() < 600)!;
      camera.lookAt(target.position);
    };
    aimAtRock(); expect(bonus.shoot(camera)).toBe(true); expect(bonus.state.charge).toBe(5);
    camera.lookAt(0, 100, 0); expect(bonus.shoot(camera)).toBe(false); expect(bonus.state.charge).toBe(5);
    bonus.state.charge = 98;
    aimAtRock(); expect(bonus.shoot(camera)).toBe(true); expect(bonus.state.charge).toBe(100);
    bonus.finish('exit');
    expect(bonus.blast(camera)).toBe(false); expect(bonus.shoot(camera)).toBe(false);
    expect(bonus.state.charge).toBe(100);
    bonus.dispose();
  });

  it('uses a 240-unit range around the current craft position', () => {
    const bonus = new BonusController('asteroids', 1);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(30, 0, -400);
    const [inside, outside] = bonus.root.children;
    inside.position.copy(camera.position).add(new THREE.Vector3(0, 0, -240));
    outside.position.copy(camera.position).add(new THREE.Vector3(0, 0, -241));
    bonus.blast(camera);
    expect(inside.visible).toBe(false); expect(outside.visible).toBe(true);
    bonus.dispose();
  });

  it('destroys canyon turrets without consuming gates or canyon walls', () => {
    const bonus = new BonusController('canyon', 1);
    const camera = new THREE.PerspectiveCamera();
    const turrets = bonus.canyon!.targets.filter(target => target.kind === 'turret').map(target => target.object);
    const safe = bonus.root.children.filter(object => !bonus.canyon!.targets.some(target => target.object === object));
    camera.position.copy(turrets[0].position).add(new THREE.Vector3(0, 0, 20));
    const nearby = turrets.filter(object => object.position.distanceTo(camera.position) <= 240);
    const obstacles = bonus.canyon!.targets.filter(target => target.kind === 'obstacle' && target.object.position.distanceTo(camera.position) <= 240);
    expect(bonus.blast(camera)).toBe(true);
    expect(nearby.every(object => !object.visible)).toBe(true);
    expect(safe.every(object => object.visible)).toBe(true);
    expect(bonus.state.points).toBe(nearby.length * 4 + obstacles.length);
    expect(bonus.state.finished).toBe(false);
    bonus.dispose();
  });

  it('leaves numbered markers and sequence progress intact', () => {
    const bonus = new BonusController('sequence', 1);
    const markers = [...bonus.root.children];
    expect(bonus.blast(new THREE.PerspectiveCamera())).toBe(true);
    expect(markers.every(marker => marker.visible)).toBe(true);
    expect(bonus.state.nextMarker).toBe(1); expect(bonus.state.points).toBe(0);
    expect(bonus.state.remaining).toBe(60); expect(bonus.state.finished).toBe(false);
    bonus.dispose();
  });
});

describe('bonus weapon families', () => {
  it.each(['pulse', 'spread', 'lance'] as const)('%s uses its own bolt count and hit pattern', family => {
    const bonus = new BonusController('asteroids', 12), camera = new THREE.PerspectiveCamera();
    const rocks = bonus.root.children.filter(object => object instanceof THREE.LineSegments).slice(0, 3);
    for (const object of bonus.root.children) object.position.set(1000, 1000, -1000);
    rocks.forEach((rock, index) => {
      rock.position.set(0, 0, -300 - index * 40);
      if (family === 'spread') rock.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), (index - 1) * weaponSpec(family, 1).spread);
    });
    bonus.state.family = family; bonus.state.charge = 0;
    const count = bonus.root.children.length;
    expect(bonus.shoot(camera)).toBe(true);
    const fragments = bonus.rocks.filter(rock => rock.size < 2).length;
    expect(bonus.root.children.length - count - fragments).toBe(weaponSpec(family, 1).count);
    expect(rocks.filter(rock => !rock.visible).length).toBe(family === 'pulse' ? 1 : 3);
    expect(bonus.state.charge).toBe(5); expect(bonus.state.finished).toBe(false);
    bonus.dispose();
  });
  it('a spread volley touching a wrong marker charges only one two-second penalty', () => {
    const bonus = new BonusController('sequence', 1), camera = new THREE.PerspectiveCamera();
    bonus.state.family = 'spread';
    for (const object of bonus.root.children) object.position.set(1000, 1000, -1000);
    const wrong = bonus.targetSequence!.targets.find(target => target.number === 2)!;
    bonus.root.children.find(object => object.id === wrong.id)!.position.set(0, 0, -40);
    expect(bonus.shoot(camera)).toBe(false);
    expect(bonus.state.remaining).toBe(58); expect(bonus.state.nextMarker).toBe(1);
    expect(bonus.state.notice).toBe('WRONG MARKER: -2 SECONDS');
    bonus.dispose();
  });
});

function isolatedAsteroid(seed = 12) {
  const bonus = new BonusController('asteroids', seed), camera = new THREE.PerspectiveCamera();
  const rock = bonus.root.children[0];
  for (const object of bonus.root.children) object.position.set(1000, 1000, -1000);
  rock.position.set(0, 0, -160);
  return { bonus, camera, rock };
}

describe('splitting asteroid belt', () => {
  it('splits large into two medium, medium into two small, and destroys small outright', () => {
    const { bonus, camera, rock } = isolatedAsteroid();
    const originalRadius = bonus.rocks.find(item => item.id === rock.id)!.radius;
    expect(bonus.shoot(camera)).toBe(true); expect(rock.visible).toBe(false);
    const medium = bonus.rocks.filter(item => item.size === 1);
    expect(medium).toHaveLength(2); expect(bonus.state.fractures).toBe(1);
    for (const fragment of medium) {
      expect(fragment.radius).toBeCloseTo(originalRadius * 0.57);
      expect(fragment.grace).toBe(ASTEROID_FRAGMENT_GRACE);
    }
    for (const item of bonus.root.children) item.position.set(1000, 1000, -1000);
    bonus.root.getObjectById(medium[0].id)!.position.set(0, 0, -160);
    expect(bonus.shoot(camera)).toBe(true);
    const small = bonus.rocks.filter(item => item.size === 0);
    expect(small).toHaveLength(2); expect(bonus.state.fractures).toBe(2);
    expect(small[0].radius).toBeCloseTo(medium[0].radius * 0.57);
    for (const item of bonus.root.children) item.position.set(1000, 1000, -1000);
    bonus.root.getObjectById(small[0].id)!.position.set(0, 0, -160);
    expect(bonus.shoot(camera)).toBe(true);
    expect(bonus.rocks.filter(item => item.size === 0)).toHaveLength(1);
    expect(bonus.state.fractures).toBe(2); expect(bonus.state.points).toBe(3);
    bonus.dispose();
  });

  it.each(['pulse', 'spread', 'lance'] as const)('%s cannot erase newborn fragments in the same volley', family => {
    const { bonus, camera } = isolatedAsteroid(); bonus.state.family = family;
    bonus.shoot(camera);
    expect(bonus.rocks.filter(item => item.size === 1)).toHaveLength(2);
    expect(bonus.rocks.filter(item => item.size === 0)).toHaveLength(0);
    expect(bonus.state.fractures).toBe(1);
    bonus.dispose();
  });

  it('gives fragments reproducible diverging velocities and moves their collision bodies', () => {
    const first = isolatedAsteroid(42), second = isolatedAsteroid(42);
    first.bonus.shoot(first.camera); second.bonus.shoot(second.camera);
    const fragments = (bonus: BonusController) => bonus.rocks.filter(item => item.size === 1).map(({ id, ...body }) => body);
    const initial = fragments(first.bonus);
    expect(initial).toEqual(fragments(second.bonus));
    expect(Math.hypot(...initial[0].velocity)).toBeGreaterThan(10);
    expect(initial[0].velocity[0] * initial[1].velocity[0] + initial[0].velocity[1] * initial[1].velocity[1]).toBeLessThan(0);
    first.bonus.step(0.1, { x: 0, y: 0 }, first.camera);
    const moved = fragments(first.bonus);
    for (let axis = 0; axis < 3; axis++) expect(moved[0].position[axis]).toBeCloseTo(initial[0].position[axis] + initial[0].velocity[axis] * 0.1);
    first.bonus.dispose(); second.bonus.dispose();
  });

  it('protects the skiff during the birth flash, then makes fragments collidable', () => {
    const { bonus, camera } = isolatedAsteroid(); bonus.shoot(camera);
    const fragment = bonus.rocks.find(item => item.size === 1)!;
    const object = bonus.root.getObjectById(fragment.id)!;
    object.position.copy(camera.position);
    bonus.step(1 / 60, { x: 0, y: 0 }, camera); expect(bonus.state.health).toBe(3);
    object.position.set(0, 0, -200);
    for (let i = 0; i < 30; i++) bonus.step(1 / 60, { x: 0, y: 0 }, camera);
    expect(bonus.rocks.find(item => item.id === fragment.id)!.grace).toBe(0);
    object.position.copy(camera.position);
    bonus.step(1 / 60, { x: 0, y: 0 }, camera);
    expect(bonus.state.health).toBe(2); expect(bonus.rocks.some(item => item.id === fragment.id)).toBe(false);
    bonus.dispose();
  });

  it('charged blasts vaporize both generations without triggering more splits', () => {
    const { bonus, camera } = isolatedAsteroid(); bonus.shoot(camera);
    const fragments = bonus.rocks.filter(item => item.size < 2);
    expect(bonus.blast(camera)).toBe(true);
    expect(bonus.rocks.filter(item => item.size < 2)).toHaveLength(0); expect(bonus.state.fractures).toBe(1);
    bonus.step(0.02, { x: 0, y: 0 }, camera);
    for (const item of fragments) expect(bonus.root.getObjectById(item.id)).toBeUndefined();
    bonus.dispose();
  });

  it('caps fragment count and releases passed/expired fragment geometry', () => {
    const { bonus, camera } = isolatedAsteroid();
    const originals = bonus.rocks.map(item => item.id);
    let peak = 0;
    for (const id of originals) {
      for (const object of bonus.root.children) object.position.set(1000, 1000, -1000);
      bonus.root.getObjectById(id)!.position.set(0, 0, -160);
      bonus.shoot(camera);
      peak = Math.max(peak, bonus.rocks.filter(item => item.size < 2).length);
    }
    expect(peak).toBe(MAX_ASTEROID_FRAGMENTS);
    const fragments = bonus.rocks.filter(item => item.size < 2);
    const object = bonus.root.getObjectById(fragments[0].id) as THREE.LineSegments;
    const dispose = vi.spyOn(object.geometry, 'dispose');
    object.position.set(0, 0, 60);
    bonus.step(0.02, { x: 0, y: 0 }, camera);
    expect(dispose).toHaveBeenCalledOnce();
    bonus.step(12.1, { x: 0, y: 0 }, camera);
    expect(bonus.rocks.filter(item => item.size < 2)).toHaveLength(0);
    bonus.dispose();
  });

  it('requires dodging but retains a traversable weaving route', () => {
    const idle = new BonusController('asteroids', 12), idleCamera = new THREE.PerspectiveCamera();
    for (let i = 0; i < 3601 && !idle.state.finished; i++) idle.step(1 / 60, { x: 0, y: 0 }, idleCamera);
    expect(idle.state.reason).toBe('crash'); idle.dispose();
    for (const seed of [1, 12, 99]) {
      const bonus = new BonusController('asteroids', seed), camera = new THREE.PerspectiveCamera();
      let previous = new THREE.Vector2();
      for (let i = 1; i <= 3601; i++) {
        const gap = asteroidGap(Math.min(55, asteroidFlight(i / 60).progress * 58));
        bonus.step(1 / 60, { x: (gap.x - previous.x) / 0.13, y: -(gap.y - previous.y) / 0.13 }, camera);
        previous = gap;
      }
      expect(bonus.state.reason).toBe('complete'); expect(bonus.state.health).toBe(3);
      bonus.dispose();
    }
  });
});
