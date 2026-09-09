import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { FAMILIES } from '../arcade';
import { GAME_MODES } from '../modes';
import { actorFixture } from '../testing/actors';
import { weaponSpec } from '../weapons';
import { actorProjectileDamage, DEFENSIVE_MINE_HITS } from './defensive-position';
import { ProjectileSystem } from './projectiles';

for (const tier of [1, 2, 3]) it.each(FAMILIES)(`tier ${tier} %s takes the required individual contacts to detonate a mine`, family => {
  const mine = actorFixture({ kind: 'mine', hull: DEFENSIVE_MINE_HITS, maxHull: DEFENSIVE_MINE_HITS });
  mine.object.position.z = -20; mine.previous.copy(mine.object.position);
  const system = new ProjectileSystem(new THREE.Group()), origin = new THREE.Vector3();
  const spec = weaponSpec(family, tier, 'invaders'), required = family === 'lance' ? 1 : 4;
  let contacts = 0;
  try {
    for (let hit = 1; hit <= required; hit++) {
      system.spawn('player', 0, mine.id, origin, new THREE.Vector3(0, 0, -1), spec.speed, spec.damage, spec.color, spec.radius, spec.length, spec.pierce, family);
      const tick = () => system.update(1 / 60, [mine], origin, origin, {
        damageActor: (actor, damage, byPlayer, firedFamily) => {
          expect(byPlayer).toBe(true); expect(firedFamily).toBe(family); contacts++;
          actor.hull -= actorProjectileDamage('invaders', actor.kind, firedFamily, damage);
          actor.dead = actor.hull <= 0;
        }, damagePlayer: vi.fn(), intercepted: vi.fn(), npcHit: vi.fn(), stopped: () => false
      });
      for (let step = 0; step < 8; step++) tick();
      expect(contacts).toBe(hit); expect(mine.dead).toBe(hit === required);
    }
  } finally { system.clear(); }
});

it.each(GAME_MODES)('%s changes damage only for Defensive Position mines', mode => {
  for (const family of FAMILIES) {
    expect(actorProjectileDamage(mode, 'pirate', family, 73)).toBe(73);
    expect(actorProjectileDamage(mode, 'asteroid', family, 73)).toBe(73);
    expect(actorProjectileDamage(mode, 'mine', family, 73)).toBe(mode === 'invaders' ? family === 'lance' ? 4 : 1 : 73);
  }
});
