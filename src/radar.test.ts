import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { projectRadarContact, RADAR_RANGE } from './radar';

const origin = new THREE.Vector3();
const orientation = new THREE.Quaternion();
const project = (x: number, y: number, z: number) => projectRadarContact(new THREE.Vector3(x, y, z), origin, orientation);

describe('ship-relative 3D radar', () => {
  it('anchors height stems to the flight plane and distinguishes above, below, and level', () => {
    const above = project(130, 260, -195);
    const below = project(130, -260, -195);
    const level = project(130, 0, -195);
    expect(above.x).toBe(below.x);
    expect(above.planeY).toBe(below.planeY);
    expect(above.y).toBeLessThan(above.planeY);
    expect(below.y).toBeGreaterThan(below.planeY);
    expect(above.height).toBeCloseTo(-below.height);
    expect(level.y).toBe(level.planeY);
    expect(level.height).toBe(0);
    expect(above.x).toBeGreaterThan(90);
    expect(above.planeY).toBeLessThan(90);
    expect(project(-130, 0, 195).x).toBeLessThan(90);
    expect(project(-130, 0, 195).planeY).toBeGreaterThan(90);
  });

  it('shows directly overhead and underneath contacts at the player bearing', () => {
    const above = project(0, RADAR_RANGE, 0), below = project(0, -RADAR_RANGE, 0);
    expect(above.x).toBe(90); expect(above.planeY).toBe(90); expect(above.y).toBe(32);
    expect(below.x).toBe(90); expect(below.planeY).toBe(90); expect(below.y).toBe(148);
  });

  it('uses the player position and local axes after combined pitch, yaw, and roll', () => {
    const offset = new THREE.Vector3(1500, -820, 400);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.1, -2.2, 0.8));
    const local = new THREE.Vector3(-150, 300, -270);
    const world = local.clone().applyQuaternion(rotation).add(offset);
    const actual = projectRadarContact(world, offset, rotation);
    const expected = projectRadarContact(local, origin, orientation);
    for (const key of ['x', 'planeY', 'y', 'height', 'distance'] as const) expect(actual[key]).toBeCloseTo(expected[key]);
    expect(world).toEqual(local.clone().applyQuaternion(rotation).add(offset));
  });

  it('reverses up and down when the ship rolls upside down', () => {
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
    const contact = projectRadarContact(new THREE.Vector3(0, 300, 0), origin, rotation);
    expect(contact.height).toBeLessThan(0);
    expect(contact.y).toBeGreaterThan(contact.planeY);
  });

  it('fits all contact endpoints and distant gate bearings inside the radar rim', () => {
    for (const distance of [0, 100, 650, 10000]) {
      for (let lat = 0; lat <= 12; lat++) for (let lon = 0; lon < 24; lon++) {
        const vector = new THREE.Vector3().setFromSphericalCoords(distance, lat * Math.PI / 12, lon * Math.PI / 12);
        const point = projectRadarContact(vector, origin, orientation);
        expect(Math.hypot(point.x - 90, point.y - 90)).toBeLessThanOrEqual(76.001);
        expect(Math.hypot(point.x - 90, point.planeY - 90)).toBeLessThanOrEqual(76.001);
        expect(Number.isFinite(point.height)).toBe(true);
      }
    }
  });
});
