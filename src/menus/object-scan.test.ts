import { expect, it } from 'vitest';
import { ObjectScan } from './object-scan';

it('advances after five seconds, wraps, and resets the delay after manual navigation', () => {
  const scan = new ObjectScan(29);
  expect(scan.label).toBe('1/29'); expect(scan.tick(4.99)).toBe(false); expect(scan.tick(0.01)).toBe(true); expect(scan.label).toBe('2/29');
  scan.move(-1); expect(scan.label).toBe('1/29'); scan.tick(4); scan.move(-1); expect(scan.label).toBe('29/29');
  expect(scan.tick(4.9)).toBe(false); expect(scan.tick(0.1)).toBe(true); expect(scan.label).toBe('1/29');
  scan.move(59); expect(scan.label).toBe('2/29'); scan.move(-59); expect(scan.label).toBe('1/29');
});
it('ignores invalid time, supports one entry and rejects empty catalogs', () => {
  const scan = new ObjectScan(1);
  for (const dt of [0, -1, NaN, Infinity]) expect(scan.tick(dt)).toBe(false);
  expect(scan.tick(10)).toBe(true); expect(scan.label).toBe('1/1');
  for (const count of [0, -1, 1.5]) expect(() => new ObjectScan(count)).toThrow();
});
