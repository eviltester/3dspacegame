import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARMADA_SALVAGE_SPEED, armadaFormationPosition, armadaSalvageVelocity, configureArmadaCamera, driftArmadaSalvage } from './armada';
import { stageDefinition } from './encounters';

describe('armada battlefield', () => {
  it.each([4, 5, 6, 8])('arranges %i ships in separate receding rows inside the firing lane', count => {
    const positions = Array.from({ length: count }, (_, index) => armadaFormationPosition(index, count));
    expect(new Set(positions.map(position => position.z)).size).toBe(2);
    expect(new Set(positions.map(position => position.toArray().join(','))).size).toBe(count);
    for (const position of positions) {
      expect(position.y).toBe(0);
      expect(Math.abs(position.x)).toBeLessThanOrEqual(70);
      expect(position.z).toBeLessThan(-100);
    }
  });

  it.each([16 / 9, 1, 320 / 844])('frames the player and both rows at aspect %s with perspective depth', aspect => {
    const camera = new THREE.PerspectiveCamera(68, aspect, 0.1, 6000);
    configureArmadaCamera(camera);
    const near = new THREE.Vector3(0, 0, -165).project(camera);
    const far = new THREE.Vector3(0, 0, -243).project(camera);
    const player = new THREE.Vector3().project(camera);
    expect(far.y).toBeGreaterThan(near.y);
    expect(near.y).toBeGreaterThan(player.y);
    const nearSize = new THREE.Vector3(10, 0, -165).project(camera).x - near.x;
    const farSize = new THREE.Vector3(10, 0, -243).project(camera).x - far.x;
    expect(farSize).toBeLessThan(nearSize * 0.95);
    for (const z of [0, -165, -243]) for (const x of [-84, 0, 84]) {
      const projected = new THREE.Vector3(x, 0, z).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(0.92);
      expect(Math.abs(projected.y)).toBeLessThan(0.85);
    }
  });

  it('explains the tractor beam and escape objective in both modes', () => {
    for (const stage of [3, 7, 11]) expect(stageDefinition('journey', stage).objective).toMatch(/trapped in a tractor beam.*limited movement.*free yourself/);
    for (const wave of [3, 8, 13]) expect(stageDefinition('endless', wave).objective).toMatch(/trapped in a tractor beam.*free yourself/);
    expect(stageDefinition('journey', 1).objective).not.toMatch(/tractor/);
  });
});

describe('armada salvage drift', () => {
  it('gives drops a slow velocity into a reachable part of the lane', () => {
    const position = new THREE.Vector3(100, 30, -220);
    const velocity = armadaSalvageVelocity(position);
    expect(velocity.length()).toBeCloseTo(ARMADA_SALVAGE_SPEED);
    expect(velocity.z).toBeGreaterThan(0);
    expect(velocity.x).toBeLessThan(0);
    expect(velocity.y).toBeLessThan(0);
    const time = 220 / velocity.z;
    expect(driftArmadaSalvage(position, velocity, time, true)).toBe(false);
    expect(position.x).toBeCloseTo(70);
    expect(position.y).toBeCloseTo(0);
    expect(position.z).toBeCloseTo(0);
  });

  it('keeps the drop lane fixed instead of automatically homing onto the player', () => {
    const position = new THREE.Vector3(-50, 0, -180);
    const velocity = armadaSalvageVelocity(position);
    driftArmadaSalvage(position, velocity, 2, false);
    expect(position.toArray()).toEqual([-50, 0, -132]);
  });

  it('retains protected cargo at the lane and lets ordinary missed drops drift past', () => {
    const protectedDrop = new THREE.Vector3(40, 0, -24), drift = armadaSalvageVelocity(protectedDrop);
    expect(driftArmadaSalvage(protectedDrop, drift, 2, true)).toBe(false);
    expect(protectedDrop.toArray()).toEqual([40, 0, 0]);
    expect(drift.length()).toBe(0);
    expect(driftArmadaSalvage(protectedDrop, drift, 20, true)).toBe(false);
    const ordinary = new THREE.Vector3(-30, 0, -24), velocity = armadaSalvageVelocity(ordinary);
    expect(driftArmadaSalvage(ordinary, velocity, 1.5, false)).toBe(false);
    expect(ordinary.z).toBe(12);
    expect(driftArmadaSalvage(ordinary, velocity, 3, false)).toBe(true);
  });
});
