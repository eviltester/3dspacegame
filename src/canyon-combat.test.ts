import { expect, it } from 'vitest';
import { canyonHaulPoints, canyonTargetPoints, damageCanyonSkiff, dropsCanyonHaul } from './canyon-combat';
import { repairSkiff } from './skiff-vitals';

it('five gun hits empty full shields without hull loss; subsequent hits each cost one hull', () => {
  let vitals = { health: 3, shield: 100, damage: 0 };
  for (let hit = 1; hit <= 8; hit++) {
    const before = { ...vitals }; vitals = damageCanyonSkiff(vitals, 'gun');
    expect(vitals).toEqual({ health: hit <= 5 ? 3 : 8 - hit, shield: Math.max(0, 100 - hit * 20), damage: 0 });
    expect(before.health).toBeGreaterThan(0);
  }
  expect(damageCanyonSkiff(vitals, 'gun')).toEqual(vitals);
});
it.each(['wall', 'collision'] as const)('%s consumes only the applicable shield amount, then applies hull damage when unshielded', source => {
  for (const shield of [1, 20, 80, 100]) expect(damageCanyonSkiff({ health: 3, shield, damage: 0 }, source)).toEqual({ health: 3, shield: Math.max(0, shield - (source === 'wall' ? 10 : 20)), damage: 0 });
  expect(damageCanyonSkiff({ health: 3, shield: 0, damage: 0 }, source)).toEqual({ health: source === 'wall' ? 3 : 2, shield: 0, damage: source === 'wall' ? 10 : 0 });
  expect(damageCanyonSkiff({ health: 1, shield: 0, damage: 90 }, source)).toEqual({ health: 0, shield: 0, damage: 0 });
});
it('a last partial shield absorbs the whole shot without spilling damage into hull', () => {
  const vitals = { health: 2, shield: 1, damage: 0 };
  expect(damageCanyonSkiff(vitals, 'gun')).toEqual({ health: 2, shield: 0, damage: 0 }); expect(vitals.shield).toBe(1);
});
it('shield pickups restore twenty shield, full repairs fill it, and neither exceeds capacity', () => {
  expect(repairSkiff({ health: 3, shield: 0, damage: 0 }, 'shield').shield).toBe(20);
  expect(repairSkiff({ health: 3, shield: 90, damage: 0 }, 'shield').shield).toBe(100);
  expect(repairSkiff({ health: 3, shield: 0, damage: 0 }, 'repair').shield).toBe(100);
  expect(repairSkiff({ health: 3, shield: 100, damage: 0 }, 'repair').shield).toBe(100);
});
it('only gun destruction and bolt interception grant immediate canyon points', () => {
  expect(canyonTargetPoints('turret')).toBe(200); expect(canyonTargetPoints('hostileBolt')).toBe(10); expect(canyonTargetPoints('obstacle')).toBe(0);
});
it('exactly one of five equally likely haul slots succeeds, with strict probability boundaries', () => {
  expect(Array.from({ length: 5 }, (_, i) => dropsCanyonHaul((i + 0.5) / 5))).toEqual([true, false, false, false, false]);
  expect(dropsCanyonHaul(0)).toBe(true); expect(dropsCanyonHaul(0.2 - 1e-9)).toBe(true); expect(dropsCanyonHaul(0.2)).toBe(false);
  for (const roll of [-1, NaN, Infinity, 1]) expect(dropsCanyonHaul(roll)).toBe(false);
  expect(canyonHaulPoints(0)).toBe(0); expect(canyonHaulPoints(3)).toBe(225);
});
