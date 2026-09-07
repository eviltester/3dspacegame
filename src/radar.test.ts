import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { COURSE_RADAR_VIEW, projectRadarContact, RADAR_RANGE, renderRadar, SPACE_RADAR_VIEW } from './radar';
import type { RadarContact } from './radar';

const origin = new THREE.Vector3();
const orientation = new THREE.Quaternion();
const project = (x: number, y: number, z: number) => projectRadarContact(new THREE.Vector3(x, y, z), origin, orientation);

function drawingFixture() {
  const context = {
    save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(),
    stroke: vi.fn(), arc: vi.fn(), ellipse: vi.fn(), rect: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), setLineDash: vi.fn(), fillRect: vi.fn(),
    lineWidth: 1, strokeStyle: '', fillStyle: '', globalAlpha: 1
  };
  const draw = (contacts: RadarContact[], view = SPACE_RADAR_VIEW) => renderRadar(context as unknown as CanvasRenderingContext2D, contacts, origin, orientation, view);
  return { context, draw };
}

describe('radar drawing commands', () => {
  it('draws rocks, obstacles and incoming shots distinctly, and keeps the next gate above the hazards', () => {
    const { context, draw } = drawingFixture();
    const position = new THREE.Vector3(25, 10, -120), p = projectRadarContact(position, origin, orientation, COURSE_RADAR_VIEW);
    draw(['gate', 'rock', 'obstacle', 'shot'].map(glyph => ({ position, color: '#ff0', glyph: glyph as RadarContact['glyph'] })), COURSE_RADAR_VIEW);
    expect(context.arc).toHaveBeenCalledWith(p.x, p.y, 2.5, 0, Math.PI * 2);
    expect(context.rect).toHaveBeenCalledWith(p.x - 3, p.y - 3, 6, 6);
    expect(context.moveTo).toHaveBeenCalledWith(p.x, p.y - 2);
    // Last contact is the gate cross; only the white player chevron follows it.
    expect(context.lineTo.mock.calls.at(-3)).toEqual([p.x, p.y + 4]);
  });
  it('hides passed course objects and out-of-range hazards but pins a distant exit', () => {
    const { context, draw } = drawingFixture();
    draw([{ position: new THREE.Vector3(0, 0, 60), color: '#f00', glyph: 'ship' },
      { position: new THREE.Vector3(0, 0, -510), color: '#f00', glyph: 'rock' },
      { position: new THREE.Vector3(0, 0, -4800), color: '#ff0', glyph: 'gate' }], COURSE_RADAR_VIEW);
    expect(context.fillRect).not.toHaveBeenCalled(); expect(context.arc).toHaveBeenCalledTimes(1);
    const exit = projectRadarContact(new THREE.Vector3(0, 0, -4800), origin, orientation, COURSE_RADAR_VIEW);
    expect(context.lineTo).toHaveBeenCalledWith(exit.x, exit.y + 4);
  });
  it('draws cargo as an outlined triangle and a distant gate as a cross', () => {
    const { context, draw } = drawingFixture();
    draw([{ position: new THREE.Vector3(0, 0, -100), color: '#ff0', glyph: 'cargo' },
      { position: new THREE.Vector3(0, 0, -1000), color: '#ff0', glyph: 'gate' }]);
    expect(context.closePath).toHaveBeenCalledOnce(); expect(context.fillRect).not.toHaveBeenCalled();
    const gate = project(0, 0, -1000);
    expect(context.moveTo).toHaveBeenCalledWith(gate.x - 4, gate.y); expect(context.lineTo).toHaveBeenCalledWith(gate.x + 4, gate.y);
    expect(context.moveTo).toHaveBeenCalledWith(gate.x, gate.y - 4); expect(context.lineTo).toHaveBeenCalledWith(gate.x, gate.y + 4);
  });
  it('uses dashed lower stems, solid upper stems and excludes distant ordinary contacts', () => {
    const { context, draw } = drawingFixture();
    draw([{ position: new THREE.Vector3(100, 200, -100), color: '#f00', glyph: 'ship' },
      { position: new THREE.Vector3(-100, -200, -100), color: '#0f0', glyph: 'mine' },
      { position: new THREE.Vector3(0, 0, -1000), color: '#fff', glyph: 'ship' }]);
    expect(context.setLineDash).toHaveBeenCalledWith([2, 2]); expect(context.setLineDash).toHaveBeenCalledWith([]);
    expect(context.fillRect).toHaveBeenCalledOnce(); expect(context.restore).toHaveBeenCalledOnce(); expect(context.globalAlpha).toBe(1);
  });
});

describe('ship-relative 3D radar', () => {
  it('spreads canyon-width lanes and amplifies height without changing the world positions', () => {
    const position = new THREE.Vector3(30, 15, -150), snapshot = position.clone();
    const course = projectRadarContact(position, origin, orientation, COURSE_RADAR_VIEW), space = projectRadarContact(position, origin, orientation);
    expect(course.x - 90).toBeGreaterThan(25); expect(course.height).toBeGreaterThan(10);
    expect(course.x - 90).toBeGreaterThan((space.x - 90) * 5); expect(course.inRange).toBe(true);
    expect(position).toEqual(snapshot);
    const moved = projectRadarContact(position, new THREE.Vector3(20, 0, -100), orientation, COURSE_RADAR_VIEW);
    expect(moved.x).toBeLessThan(course.x); expect(moved.planeY).toBeGreaterThan(course.planeY);
  });
  it('course magnification keeps all contact stems and glyphs inside the rim after rotation', () => {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, -0.15, 0.3));
    for (const distance of [0, 100, 500, 10000]) for (let i = 0; i < 60; i++) {
      const point = new THREE.Vector3().setFromSphericalCoords(distance, i * Math.PI / 60, i * 0.75);
      const projected = projectRadarContact(point, origin, rotation, COURSE_RADAR_VIEW);
      expect(Math.hypot(projected.x - 90, projected.y - 90)).toBeLessThanOrEqual(76.001);
      expect(Number.isFinite(projected.height)).toBe(true);
    }
  });
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
