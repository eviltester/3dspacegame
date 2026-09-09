// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { damageCracks, flashDamage } from './damage-cracks';

it('creates reproducible branched cracks reaching deep into the viewport', () => {
  const paths = damageCracks(1); expect(paths).toEqual(damageCracks(1)); expect(paths).not.toEqual(damageCracks(2));
  expect(paths.length).toBeGreaterThan(20);
  for (const path of paths) for (const [x, y] of path) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(100); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(100); }
  expect(Math.max(...paths.flat().map(([, y]) => y))).toBeGreaterThan(93);
  expect(paths.some(path => path[0][0] === 0 && path.at(-1)![0] > 30)).toBe(true);
  expect(paths.some(path => path[0][0] === 100 && path.at(-1)![0] < 70)).toBe(true);
});
it('replaces the old crack pattern on each hit without accumulating elements or changing controls', () => {
  const layer = document.createElement('div'); flashDamage(layer);
  const first = layer.innerHTML; expect(layer.querySelectorAll('polyline')).toHaveLength(32);
  expect(layer.classList.contains('active')).toBe(true);
  flashDamage(layer); expect(layer.innerHTML).not.toBe(first); expect(layer.querySelectorAll('svg')).toHaveLength(1);
  expect(layer.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  expect(() => flashDamage(null)).not.toThrow();
});
