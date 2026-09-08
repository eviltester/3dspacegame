import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TunnelBreakup } from './breakup';
import { tunnelZoom } from './ending-timing';
import { tunnelShape } from './shapes';
import { tunnelFixture } from './test-helpers';
import { TunnelView } from './view';

it.each([1,7])('breaks tunnel %i into spinning panels and then particles, with complete cleanup', level => {
  const root = new THREE.Group(), burst = vi.fn(), ending = new TunnelBreakup(root, tunnelShape(level), 0x55dcca, burst);
  ending.update(0.5); expect(ending.exploded).toBe(false);
  ending.update(1); expect(ending.snapshot.panels).toBe(36);
  const panel = root.children[0], position = panel.position.clone(), rotation = panel.quaternion.clone();
  ending.update(1.3); expect(panel.position.equals(position)).toBe(false); expect(panel.quaternion.equals(rotation)).toBe(false);
  ending.update(1.8); expect(ending.snapshot.bursts).toBeGreaterThan(0); expect(burst).toHaveBeenCalled();
  ending.update(3); expect(root.children).toHaveLength(0);
  ending.update(3); expect(root.children).toHaveLength(0); ending.dispose();
});

it('reconstructs a saved breakup at the same visual time without recreating rewards', () => {
  const a = new TunnelBreakup(new THREE.Group(), tunnelShape(1), 0x55dcca, () => {});
  const b = new TunnelBreakup(new THREE.Group(), tunnelShape(1), 0x55dcca, () => {});
  a.update(1); a.update(1.8); b.update(1.8); expect(b.snapshot).toEqual(a.snapshot);
  a.dispose(); b.dispose();
});

it('zooms down the centre before detonation and does not alter the normal camera', () => {
  const { sim, s } = tunnelFixture(), view = new TunnelView(sim), camera = new THREE.PerspectiveCamera(58, 1.6);
  view.configureCamera(camera); const start = camera.position.z;
  s.phase = 'collapse'; s.remaining = 2.5; view.configureCamera(camera);
  expect(camera.position.z).toBeLessThan(start); expect(tunnelZoom(2.5)).toBe(0.5);
  s.remaining = 2; view.configureCamera(camera); expect(camera.position.z).toBe(-80);
  view.update(0); expect(view.craft.visible).toBe(false); view.dispose();
});
