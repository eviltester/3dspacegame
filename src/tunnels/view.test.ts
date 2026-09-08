import { expect, it } from 'vitest';
import * as THREE from 'three';
import { TunnelView } from './view';
import { tunnelFixture } from './test-helpers';
import { addEntity } from './encounters';
import { lanePoint, tunnelShape } from './shapes';

it.each([1,2,3,4,5,6,7,8,9,10])('fits the complete level %i rim on desktop and mobile', level => {
  const { sim } = tunnelFixture(level), view = new TunnelView(sim);
  for (const aspect of [1440 / 900, 390 / 844]) {
    const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 6000); view.configureCamera(camera); camera.updateMatrixWorld();
    for (let lane = 0; lane < 12; lane++) {
      const p = new THREE.Vector3(...lanePoint(tunnelShape(level), lane, -12)).project(camera);
      expect(Math.abs(p.x)).toBeLessThan(0.85); expect(Math.abs(p.y)).toBeLessThan(0.8); expect(Math.abs(p.z)).toBeLessThan(1);
    }
  }
  view.dispose(); expect(view.root.children).toHaveLength(0);
});
it('renders existing models, warnings, projectiles and animated death without mutating state', () => {
  const { sim, ctx, s, run, combat } = tunnelFixture();
  for (const kind of ['ship','core','gun','pickup','crate','asteroid','mine','wall','pillar'] as const) addEntity(ctx,kind,1,100,{retracting:kind==='pillar',warning:0.9});
  for (const faction of ['police','trader'] as const) addEntity(ctx,'ship',2,120,{faction});
  addEntity(ctx,'pickup',4,80,{drop:'fullRepair'});
  run.charge = 100; combat.fire(); const view = new TunnelView(sim); view.update(0.1, sim.drain());
  const initial = structuredClone(s); s.respawn = 4; view.update(0.5); expect(s.elapsed).toBe(initial.elapsed); expect(view.craft.visible).toBe(false);
  s.respawn = 0; combat.blast(); view.update(0.1,sim.drain()); expect(view.craft.visible).toBe(true);
  view.dispose();
});

it('keeps the tunnel clear of position/danger guides and floating attack arrows', () => {
  const { sim, ctx } = tunnelFixture();
  addEntity(ctx, 'ship', 2, 100, { faction: 'pirate', warning: 0.9, targetId: -1 });
  const view = new TunnelView(sim); view.update(0.1);
  expect(view.root.getObjectByName('attack-chevron')).toBeUndefined();
  expect(view.root.children.filter(object => object instanceof THREE.LineSegments
    && (object.geometry as THREE.BufferGeometry).getAttribute('position').count === 2)).toHaveLength(0);
  expect(view.craft.visible).toBe(true); view.dispose();
});
