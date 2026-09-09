import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArmadaRig, disposeObject } from '../models';
import { defensivePlatformColor, DefensiveWarpView } from './defensive-warp';

const cleanup: Array<() => void> = [];
afterEach(() => { for (const clear of cleanup.splice(0)) clear(); });
function scene() {
  const world = new THREE.Group(), rig = createArmadaRig(), camera = new THREE.PerspectiveCamera(68, 16 / 9);
  const burst = vi.fn(); world.add(rig.root);
  const view = new DefensiveWarpView(world, rig, 2, burst);
  cleanup.push(() => { view.dispose(); disposeObject(rig.root); });
  return { world, rig, camera, view, burst };
}
describe('Defensive Position cinematic rendering', () => {
  it('changes only the platform colour between consecutive levels', () => {
    const { rig } = scene();
    expect((rig.platform.children[0] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>).material.color.getHex()).toBe(defensivePlatformColor(2));
    expect((rig.craft.children[0] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>).material.color.getHex()).toBe(0xedffff);
    for (let level = 1; level <= 1000; level++) expect(defensivePlatformColor(level)).not.toBe(defensivePlatformColor(level + 1));
  });
  it('breaks the destroyed craft into moving panels and secondary particles, then brings it back from depth', () => {
    const { rig, view, camera, burst } = scene();
    rig.craft.position.x = 40; view.destroyCraft();
    expect(rig.craft.visible).toBe(false); expect(rig.platform.visible).toBe(true);
    expect(view.destruction.panels).toBeGreaterThan(0);
    view.update(0.9); expect(view.destruction.bursts).toBeGreaterThan(0); expect(burst).toHaveBeenCalled();
    view.showArrival(0, camera); expect(rig.craft.position.z).toBe(-600);
    view.showArrival(0.5, camera); expect(rig.craft.position.z).toBe(-75); expect(rig.craft.visible).toBe(true);
    view.showArrival(1, camera); view.finish(); expect(rig.craft.position.length()).toBe(0);
  });
  it('explodes the platform once, not the ship, and flies into the distance', () => {
    const { rig, view, camera, world } = scene();
    view.depart(); expect(view.showDeparture(0.1, camera)).toBe(false);
    expect(view.showDeparture(0.2, camera)).toBe(true); expect(view.showDeparture(0.3, camera)).toBe(false);
    expect(view.destruction.panels).toBeGreaterThan(0); expect(rig.platform.visible).toBe(false); expect(rig.craft.visible).toBe(true);
    const z = rig.craft.position.z; view.showDeparture(0.7, camera);
    expect(rig.craft.position.z).toBeLessThan(z); expect(world.getObjectByName('defensive-warp-trails')?.visible).toBe(true);
    view.update(1); expect(view.destruction.bursts).toBeGreaterThan(0);
    view.showDeparture(1, camera);
    for (let i = 0; i < 120; i++) view.update(1 / 60);
    expect(view.destruction).toEqual({ panels: 0, bursts: 0 });
    view.dispose(); expect(world.getObjectByName('defensive-warp-trails')).toBeUndefined();
  });
});
