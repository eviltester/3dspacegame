import { expect, it } from 'vitest';
import { repairedSkiffHealth, skiffRepairDrop } from './skiff-repairs';

it.each([
  ['rock', 2, 1], ['obstacle', 2, 0], ['turret', 0, 1]
] as const)('%s has exact shield/repair odds across thirty equally likely slots', (source, shields, repairs) => {
  const drops = Array.from({ length: 30 }, (_, i) => skiffRepairDrop(source, (i + 0.5) / 30));
  expect(drops.filter(kind => kind === 'shield')).toHaveLength(shields);
  expect(drops.filter(kind => kind === 'repair')).toHaveLength(repairs);
  expect(drops.filter(kind => kind === null)).toHaveLength(30 - shields - repairs);
});
it('uses half-open probability boundaries', () => {
  expect(skiffRepairDrop('rock', 0)).toBe('shield');
  expect(skiffRepairDrop('rock', 1 / 15 - 1e-9)).toBe('shield');
  expect(skiffRepairDrop('rock', 1 / 15)).toBe('repair');
  expect(skiffRepairDrop('rock', 0.1)).toBeNull();
  expect(skiffRepairDrop('turret', 1 / 30)).toBeNull();
});
it.each([NaN, Infinity, -1, 1])('rejects invalid random value %s', roll => {
  expect(skiffRepairDrop('rock', roll)).toBeNull();
});
it.each([
  [1, 'shield', 2], [2, 'shield', 3], [3, 'shield', 3],
  [1, 'repair', 3], [2, 'repair', 3], [3, 'repair', 3], [0, 'repair', 0], [-1, 'shield', 0]
] as const)('%s health plus %s becomes %s', (health, kind, expected) => {
  expect(repairedSkiffHealth(health, kind)).toBe(expected);
});
