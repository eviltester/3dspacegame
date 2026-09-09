import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { invaderStage } from './invaders';
import { EncounterDirector } from './encounters';
import { invaderHome, invaderPattern, invaderPosition, INVADER_PATTERNS, INVADER_SLOTS } from './invader-patterns';
import { INVADER_CLEARANCE, invaderDistance, invaderEntryPosition, stepInvaderFormation } from './invader-formation';

const fleet = () => Array.from({ length: INVADER_SLOTS }, (_, slot) => ({ slot, position: invaderHome(slot) }));
function minimumGap(positions: THREE.Vector3[]): number {
  let gap = Infinity;
  for (let a = 0; a < positions.length; a++) for (let b = a + 1; b < positions.length; b++) gap = Math.min(gap, invaderDistance(positions[a], positions[b]));
  return gap;
}

describe('Invader flight paths and separation', () => {
  it.each([1, 100, 1000])('all nine patterns at wave %i pressure keep eighteen moving ships apart', start => {
    let gap = Infinity, maxStep = 0, maxX = 0, nearest = -Infinity, furthest = Infinity;
    for (let wave = start; wave < start + INVADER_PATTERNS.length; wave++) {
      const ships = fleet(), speed = invaderStage(wave).difficulty.movementScale;
      // Thirty seconds at the real fixed timestep covers multiple full loops.
      for (let tick = 1; tick <= 1800; tick++) {
        const before = ships.map(ship => ship.position.clone());
        stepInvaderFormation(ships, 1 / 60, tick / 60, wave, speed);
        gap = Math.min(gap, minimumGap(ships.map(ship => ship.position)));
        ships.forEach((ship, i) => {
          maxStep = Math.max(maxStep, ship.position.distanceTo(before[i]));
          maxX = Math.max(maxX, Math.abs(ship.position.x));
          nearest = Math.max(nearest, ship.position.z); furthest = Math.min(furthest, ship.position.z);
        });
      }
    }
    expect(gap).toBeGreaterThanOrEqual(INVADER_CLEARANCE - 0.01);
    expect(maxStep).toBeLessThan(12); expect(maxX).toBeLessThanOrEqual(72);
    expect(nearest).toBeLessThanOrEqual(-56); expect(furthest).toBeGreaterThanOrEqual(-416);
  });
  it('separates exact overlaps, including at the boundaries', () => {
    for (const point of [new THREE.Vector3(0, 0, -200), new THREE.Vector3(72, 0, -56)]) {
      const ships = fleet(); ships.forEach(ship => ship.position.copy(point));
      stepInvaderFormation(ships, 1 / 60, 1, 5, 1);
      expect(minimumGap(ships.map(ship => ship.position))).toBeGreaterThanOrEqual(INVADER_CLEARANCE - 0.01);
    }
  });
  it('does not move when paused and is deterministic regardless of actor iteration order', () => {
    const a = fleet(), b = fleet().reverse();
    const before = a.map(ship => ship.position.clone());
    stepInvaderFormation(a, 0, 9, 3, 2); expect(a.map(ship => ship.position)).toEqual(before);
    for (let tick = 1; tick <= 180; tick++) {
      for (const ships of [a, b]) stepInvaderFormation(ships, 1 / 60, tick / 60, 4, 2);
    }
    expect(a.map(ship => ship.position)).toEqual(b.reverse().map(ship => ship.position));
  });
  it('reserves arrival space without moving surviving ships', () => {
    const ships = fleet();
    for (let tick = 1; tick < 400; tick++) stepInvaderFormation(ships, 1 / 60, tick / 60, 5, 2);
    const survivors = ships.filter(ship => ship.slot % 3 !== 0), before = survivors.map(ship => ship.position.clone());
    const positions = survivors.map(ship => ship.position);
    for (let slot = 0; slot < INVADER_SLOTS; slot += 3) positions.push(invaderEntryPosition(slot, positions));
    expect(minimumGap(positions)).toBeGreaterThanOrEqual(INVADER_CLEARANCE - 0.01);
    expect(survivors.map(ship => ship.position)).toEqual(before);
  });
  it('includes full circular orbits, three-ship wedges and time-delayed convoy followers', () => {
    const orbit = INVADER_PATTERNS.indexOf('ORBIT') + 1;
    const corners = Array.from({ length: 4 }, (_, i) => invaderPosition(0, i * Math.PI / 2 / 0.58, orbit, 1));
    expect(corners[0].x).toBeCloseTo(66); expect(corners[1].z).toBeCloseTo(-100);
    expect(corners[2].x).toBeCloseTo(-66); expect(corners[3].z).toBeCloseTo(-336);
    const swarm = INVADER_PATTERNS.indexOf('SWARM') + 1;
    const first = invaderPosition(0, 5, swarm, 1), wing = invaderPosition(1, 5, swarm, 1), tail = invaderPosition(2, 5, swarm, 1);
    expect(wing.x - first.x).toBe(24); expect(tail.z - first.z).toBe(-35);
    const convoy = INVADER_PATTERNS.indexOf('CONVOY') + 1;
    expect(invaderPosition(1, 7 + 0.036 / 0.055, convoy, 1).distanceTo(invaderPosition(0, 7, convoy, 1))).toBeLessThan(0.0001);
    for (let wave = 1; wave <= 9; wave++) expect(invaderPattern(wave + 9)).toBe(invaderPattern(wave));
  });
});

it.each([1, 10, 100, 1000])('wave %i arrives as finite, staggered groups without losing capped reinforcements', wave => {
  const stage = invaderStage(wave), director = new EncounterDirector(stage);
  expect(stage.waves.every(pack => pack.enemies.length <= 3)).toBe(true);
  expect(stage.waves[1].at - stage.waves[0].at).toBeGreaterThanOrEqual(0.7);
  expect(director.next(0, 0)).toHaveLength(3);
  expect(director.next(0.2, 3)).toHaveLength(0);
  const expected = stage.waves.reduce((sum, pack) => sum + pack.enemies.length, 0);
  let arrived = 3;
  for (let t = 1; !director.finished && t < 1000; t++) {
    expect(director.next(t, 18)).toHaveLength(0);
    arrived += director.next(t, 0).length;
  }
  expect(director.finished).toBe(true); expect(arrived).toBe(expected);
});
