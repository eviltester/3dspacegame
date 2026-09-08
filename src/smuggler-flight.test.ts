import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { BonusController } from './bonus';
import { freshSkiff } from './skiff-vitals';
import { parseSmugglerFlight, smugglerAwards } from './smuggler-rewards';

vi.mock('./models', async original => ({ ...await original<typeof import('./models')>(), createTextSprite: () => new THREE.Group() }));
const courses: BonusController[] = [];
afterEach(() => { for (const course of courses) course.dispose(); courses.length = 0; });
function course(kind: 'asteroids' | 'canyon', difficulty = 1) {
  const bonus = new BonusController(kind, 42, difficulty, true), camera = new THREE.PerspectiveCamera(); courses.push(bonus);
  return { bonus, camera };
}
function clearHazards(bonus: BonusController) {
  if (bonus.canyon) { for (const target of bonus.canyon.targets) target.used = true; for (const item of bonus.canyon.barriers.items) item.base.x += 10000; }
  else { for (const rock of bonus.rocks) bonus.root.getObjectById(rock.id)!.position.x += 10000; for (const ship of bonus.traffic!.ships) ship.used = true; }
}
for (const kind of ['asteroids', 'canyon'] as const) for (const difficulty of [1, 8]) for (const boost of [true, false]) {
  it(`${kind} D${difficulty} ${boost ? 'boosted' : 'cruise'} reaches the real exit with a separate elapsed-time bonus clock`, () => {
    const { bonus, camera } = course(kind, difficulty); clearHazards(bonus);
    for (let i = 0; i < 6000 && !bonus.state.finished; i++) {
      const gate = bonus.canyon?.gates.at(-1);
      const offset = bonus.canyon?.offset ?? new THREE.Vector2(camera.position.x, camera.position.y);
      const target = gate ? new THREE.Vector2(0, 1) : new THREE.Vector2(...bonus.asteroidRun!.gate.position.slice(0, 2));
      bonus.step(1 / 60, { x: (target.x - offset.x) / 0.13, y: -(target.y - offset.y) / 0.13, boost }, camera);
    }
    expect(bonus.state.reason).toBe('complete'); expect(bonus.state.health).toBe(1);
    expect(bonus.state.flight.topBoost).toBe(boost);
    expect(bonus.state.remaining).toBeCloseTo(Math.max(0, bonus.state.duration - bonus.state.elapsed), 6);
    if (boost) { expect(bonus.state.remaining).toBeGreaterThanOrEqual(20); expect(bonus.state.remaining).toBeLessThan(21.1); }
    else expect(bonus.state.remaining).toBeLessThan(20);
    const snapshot = structuredClone(bonus.state); bonus.step(4, { x: 0, y: 0 }, camera); expect(bonus.state).toEqual(snapshot);
  });
}
it.each(['asteroids', 'canyon'] as const)('%s missed exit is a finish, not a life-ending crash, even after the bonus clock expires', kind => {
  const { bonus, camera } = course(kind); clearHazards(bonus);
  bonus.state.flight.elapsed = 100;
  for (let i = 0; i < 6000 && !bonus.state.finished; i++) {
    const currentX = bonus.canyon?.offset.x ?? camera.position.x;
    bonus.step(1 / 60, { x: (-30 - currentX) / 0.13, y: 0 }, camera);
  }
  expect(bonus.state).toMatchObject({ reason: 'gateMissed', health: 1, remaining: 0 });
  expect(bonus.state.flight.crashes).toBe(kind === 'canyon' ? 1 : 0);
});
it('restarting a saved flight preserves spent time and failed bonus qualifications', () => {
  const flight = { ...parseSmugglerFlight(), elapsed: 25, bulletHits: 1, crashes: 1, shots: 2, gatesMissed: 1 };
  const bonus = new BonusController('canyon', 42, 1, true, freshSkiff(true), flight); courses.push(bonus);
  expect(bonus.state.remaining).toBe(bonus.state.duration - 25);
  expect(smugglerAwards(bonus.state.flight, true, true, 0)).toMatchObject({ noHit: 0, noCrash: 0, peacemaker: 0, superFlyer: 0 });
  bonus.shoot(new THREE.PerspectiveCamera()); expect(flight.shots).toBe(2); expect(bonus.state.flight.shots).toBe(3);
});
it.each([['large', 2, 50], ['medium', 1, 30], ['small', 0, 20]] as const)('%s asteroid collision uses its size for damage and records a crash', (_name, size, damage) => {
  const { bonus, camera } = course('asteroids'); clearHazards(bonus);
  let rock = bonus.rocks[0];
  while (rock.size > size) {
    bonus.root.getObjectById(rock.id)!.position.set(0, 0, -100); bonus.shoot(camera);
    rock = bonus.rocks.find(item => item.size === rock.size - 1)!;
    for (const other of bonus.rocks) bonus.root.getObjectById(other.id)!.position.x += 10000;
  }
  // Allow fragmentation grace to end before positioning this one collision.
  bonus.step(0.5, { x: 0, y: 0 }, camera);
  bonus.root.getObjectById(rock.id)!.position.copy(camera.position);
  bonus.step(0, { x: 0, y: 0 }, camera);
  expect(bonus.state.shield).toBe(100 - damage); expect(bonus.state.flight.crashes).toBe(1);
});
it.each(['pirate', 'police'] as const)('%s collision costs forty shield and invalidates No Crash', kind => {
  const { bonus, camera } = course('asteroids', 8); clearHazards(bonus);
  const ship = bonus.traffic!.ships.find(item => item.kind === kind)!; ship.used = false; ship.object.position.set(0, 0, 0);
  bonus.step(0, { x: 0, y: 0 }, camera);
  expect(bonus.state.shield).toBe(60); expect(bonus.state.flight.crashes).toBe(1);
});
it.each(['wall', 'floor', 'crate', 'barrier'] as const)('canyon %s collision has the correct damage and cannot grant haul', source => {
  const { bonus, camera } = course('canyon', 4); clearHazards(bonus);
  if (source === 'crate') { const crate = bonus.canyon!.targets[0]; crate.used = false; crate.object.position.set(0, 0, 0); }
  if (source === 'barrier') bonus.canyon!.barriers.items[0].base.set(0, -32, -15);
  bonus.step(0.01, { x: source === 'wall' ? 1000 : 0, y: source === 'floor' ? 1000 : 0 }, camera);
  if (source === 'barrier') bonus.step(0.4, { x: 0, y: 0 }, camera);
  expect(bonus.state.shield).toBe(100 - (source === 'barrier' ? 50 : source === 'crate' ? 40 : 20));
  expect(bonus.state.flight.crashes).toBeGreaterThan(0); expect(bonus.state.haul).toBe(0);
});
it.each(['asteroids', 'canyon'] as const)('%s enemy bullets drain twenty shield or twenty damage and 100 damage loses the single skiff', kind => {
  const { bonus, camera } = course(kind, 8); clearHazards(bonus);
  for (let hit = 1; hit <= 10; hit++) {
    const shots = bonus.canyon?.shots ?? bonus.traffic!.fire.shots;
    const object = new THREE.Group(); object.position.copy(camera.position);
    shots.push({ kind: 'hostileBolt', object, radius: 2.4, number: 0, used: false, velocity: new THREE.Vector3(), life: 4, color: '#ff4055' });
    bonus.step(0, { x: 0, y: 0 }, camera);
    expect(bonus.state.shield).toBe(Math.max(0, 100 - hit * 20));
    if (hit < 10) expect(bonus.state.health).toBe(1);
  }
  expect(bonus.state).toMatchObject({ health: 0, reason: 'crash', flight: { bulletHits: 10 } });
});
it('asteroid salvage is held as cargo, not paid before delivery', () => {
  const { bonus, camera } = course('asteroids'); clearHazards(bonus);
  const contact = bonus.radarContacts.find(item => item.glyph === 'cargo')!;
  contact.position.set(0, 0, 0); bonus.step(0, { x: 0, y: 0 }, camera);
  expect(bonus.state.haul).toBe(1); expect(bonus.state.points).toBe(0); expect(bonus.state.flight.crashes).toBe(0);
});
