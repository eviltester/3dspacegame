import { expect, it } from 'vitest';
import { damageSkiff, freshSkiff, parseSkiff, repairSkiff, SMUGGLER_SHIELD_DAMAGE } from './skiff-vitals';
import type { SkiffImpact } from './skiff-vitals';

it.each(Object.entries(SMUGGLER_SHIELD_DAMAGE) as [SkiffImpact, number][])('Smuggler %s costs %i shield, then the same damage on an unshielded craft', (source, cost) => {
  expect(damageSkiff(freshSkiff(true), source, true)).toEqual({ health: 1, shield: 100 - cost, damage: 0 });
  expect(damageSkiff({ health: 1, shield: 5, damage: 30 }, source, true)).toEqual({ health: 1, shield: 0, damage: 30 });
  expect(damageSkiff({ health: 1, shield: 0, damage: 0 }, source, true)).toEqual({ health: 1, shield: 0, damage: cost });
  expect(damageSkiff({ health: 1, shield: 0, damage: 100 - cost }, source, true)).toEqual({ health: 0, shield: 0, damage: 0 });
});
it('Smuggler repair never adds another skiff or life', () => {
  expect(repairSkiff({ health: 1, shield: 50, damage: 50 }, 'shield', true)).toEqual({ health: 1, shield: 70, damage: 30 });
  expect(repairSkiff({ health: 1, shield: 95, damage: 10 }, 'shield', true)).toEqual(freshSkiff(true));
  expect(repairSkiff({ health: 1, shield: 0, damage: 90 }, 'repair', true)).toEqual(freshSkiff(true));
  expect(parseSkiff({ health: 3, shield: 70, damage: 50 }, true)).toEqual({ health: 1, shield: 70, damage: 50 });
});

it('ten unshielded scrapes consume exactly one of three skiff points', () => {
  let state = { ...freshSkiff(), shield: 0 };
  for (let i = 1; i <= 30; i++) {
    state = damageSkiff(state, 'wall');
    expect(state).toEqual({ health: 3 - Math.floor(i / 10), shield: 0, damage: i % 10 * 10 });
  }
  expect(damageSkiff(state, 'wall')).toEqual(state);
});
it('repairs a point of damage, caps full health and cannot revive a wreck', () => {
  expect(repairSkiff({ health: 2, shield: 10, damage: 60 }, 'shield')).toEqual({ health: 3, shield: 30, damage: 60 });
  expect(repairSkiff({ health: 3, shield: 90, damage: 60 }, 'shield')).toEqual(freshSkiff());
  expect(repairSkiff({ health: 1, shield: 0, damage: 90 }, 'repair')).toEqual(freshSkiff());
  expect(repairSkiff({ health: 0, shield: 0, damage: 0 }, 'repair').health).toBe(0);
});
it('direct hits keep partial scrape damage and shield impacts never spill into hull', () => {
  const state = { health: 2, shield: 5, damage: 30 };
  expect(damageSkiff(state, 'gun')).toEqual({ health: 2, shield: 0, damage: 30 });
  expect(damageSkiff({ ...state, shield: 0 }, 'collision')).toEqual({ health: 1, shield: 0, damage: 30 });
  expect(state.shield).toBe(5);
});
it('migrates missing skiff data and sanitizes corrupt persisted values', () => {
  for (const value of [null, undefined, 5, {}, { health: NaN, shield: Infinity, damage: 'bad' }]) expect(parseSkiff(value)).toEqual(freshSkiff());
  expect(parseSkiff({ health: 9, shield: -20, damage: 500 })).toEqual({ health: 3, shield: 0, damage: 99 });
  expect(parseSkiff({ health: -1, shield: 500, damage: 50 })).toEqual({ health: 0, shield: 100, damage: 0 });
  expect(parseSkiff({ health: 2.7, shield: 45.2, damage: 20.9 })).toEqual({ health: 2, shield: 45, damage: 20 });
});
