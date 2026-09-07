import { describe, expect, it } from 'vitest';
import { DOUBLE_TAP_MS as DELAY, MobileGestures } from './gestures';

function tap(input: MobileGestures, side: 'left' | 'right', at = 0, id = 1) {
  input.down(id, side, 20, 20, at); input.up(id, at + 20);
}
describe('touch gesture decisions', () => {
  it.each(['left', 'right'] as const)('delays a single %s tap and emits it exactly once', side => {
    const g = new MobileGestures(); tap(g, side);
    expect(g.read(DELAY)).toMatchObject({ fire: false, blast: false, cycle: false });
    expect(g.read(DELAY + 20)).toMatchObject({ fire: side === 'left', blast: side === 'right', cycle: false });
    expect(g.read(1000)).toMatchObject({ fire: false, blast: false });
  });
  it.each(['left', 'right'] as const)('double %s tap only switches weapon, even across the first deadline', side => {
    const g = new MobileGestures(); tap(g, side);
    g.down(2, side, 22, 21, DELAY - 10);
    expect(g.read(DELAY + 30)).toMatchObject({ fire: false, blast: false, cycle: false });
    g.up(2, DELAY + 50);
    expect(g.read(500)).toMatchObject({ fire: false, blast: false, cycle: true });
    expect(g.read(600).cycle).toBe(false);
  });
  it('holds left fire until release, without adding a release shot', () => {
    const g = new MobileGestures(); g.down(1, 'left', 0, 0, 0);
    expect(g.read(DELAY - 1).held).toBe(false);
    expect(g.read(DELAY).held).toBe(true); expect(g.read(900).held).toBe(true);
    g.up(1, 901); expect(g.read(1200)).toMatchObject({ held: false, fire: false });
  });
  it('can blast with a second finger while holding fire', () => {
    const g = new MobileGestures(); g.down(1, 'left', 0, 0, 0); tap(g, 'right', 300, 2);
    expect(g.read(600)).toMatchObject({ held: true, blast: true, cycle: false });
  });
  it('drag steering is consumed once and a right drag never becomes a blast', () => {
    const g = new MobileGestures(); g.down(1, 'right', 20, 20, 0);
    g.move(1, 40, 15, true); g.move(1, 50, 25, true);
    expect(g.read(100)).toMatchObject({ x: 60, y: 10 });
    g.up(1, 150); expect(g.read(500)).toMatchObject({ x: 0, y: 0, blast: false });
  });
  it('ignores drag deltas with tilt enabled but still detects an accidental swipe', () => {
    const g = new MobileGestures(); g.down(1, 'right', 0, 0, 0); g.move(1, 100, 100, false); g.up(1, 100);
    expect(g.read(500)).toMatchObject({ x: 0, y: 0, blast: false });
  });
  it('permits a little finger movement during a tap', () => {
    const g = new MobileGestures(); g.down(1, 'right', 20, 20, 0); g.move(1, 22, 21, false); g.up(1, 50);
    expect(g.read(400).blast).toBe(true);
  });
  it.each(['left', 'right'] as const)('a held second %s touch cancels the pending tap, not a weapon switch', side => {
    const g = new MobileGestures(); tap(g, side); g.down(2, side, 20, 20, 100);
    expect(g.read(500)).toMatchObject({ held: side === 'left', fire: false, blast: false, cycle: false });
    g.up(2, 600); expect(g.read(1000)).toMatchObject({ held: false, fire: false, blast: false, cycle: false });
  });
  it('cancellation discards a pending double tap and tolerates unknown pointers', () => {
    const g = new MobileGestures(); tap(g, 'right'); g.down(2, 'right', 20, 20, 100);
    g.cancel(2); g.cancel(77); g.move(77, 0, 0, true); g.up(77, 100);
    expect(g.read(1000)).toMatchObject({ held: false, fire: false, blast: false, cycle: false });
  });
  it('pause clears held touches, motion, pending taps and weapon switches', () => {
    const g = new MobileGestures(); tap(g, 'right'); tap(g, 'right', 50);
    tap(g, 'left'); g.down(3, 'left', 20, 20, 100); g.move(3, 100, 100, true);
    g.clear(); expect(g.read(1000)).toEqual({ x: 0, y: 0, held: false, fire: false, blast: false, cycle: false });
  });
});
