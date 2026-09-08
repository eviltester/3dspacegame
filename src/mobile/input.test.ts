import { afterEach, expect, it, vi } from 'vitest';
import { FlightInput } from '../input';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const captures = new Set<number>();
  const lock = vi.fn();
  const canvas = Object.assign(new EventTarget(), {
    classList: { toggle: vi.fn() }, requestPointerLock: lock,
    getBoundingClientRect: () => ({ left: 10, width: 400 }),
    setPointerCapture: (id: number) => captures.add(id), hasPointerCapture: (id: number) => captures.has(id),
    releasePointerCapture: (id: number) => captures.delete(id)
  }) as unknown as HTMLCanvasElement;
  const win = new EventTarget(), doc = Object.assign(new EventTarget(), { hidden: false, pointerLockElement: null });
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
  const pause = vi.fn(), blast = vi.fn(), weapon = vi.fn();
  const input = new FlightInput(canvas, pause, blast, weapon);
  pause.mockImplementation(() => input.release()); input.setScheme('touch');
  function pointer(type: string, x = 50, y = 50, id = 1, pointerType = 'touch') {
    const event = Object.assign(new Event(type, { cancelable: true }), { pointerType, pointerId: id, clientX: x, clientY: y });
    canvas.dispatchEvent(event); return event;
  }
  return { input, pointer, canvas, win, doc, captures, blast, weapon, pause, lock, time: (t: number) => { now = t; } };
}
it('launches without mouse capture, handles real touch deltas and ignores synthetic mouse events', async () => {
  const f = setup(); await f.input.engage(); expect(f.lock).not.toHaveBeenCalled();
  expect(f.pointer('pointerdown').defaultPrevented).toBe(true);
  f.pointer('pointermove', 65, 60); expect(f.input.consume(0.01)).toMatchObject({ x: 30, y: 20 });
  f.pointer('pointerup'); f.time(500); expect(f.input.consume(0.01)).toMatchObject({ x: 0, y: 0 });
  f.canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 2 }));
  f.win.dispatchEvent(Object.assign(new Event('mouseup'), { button: 1 }));
  f.canvas.dispatchEvent(Object.assign(new Event('wheel'), { deltaY: -100 }));
  expect(f.blast).not.toHaveBeenCalled(); expect(f.weapon).not.toHaveBeenCalled(); expect(f.input.throttle).toBe(65);
});
it('routes short left fire, right blast and double-tap weapon cycling into flight actions', async () => {
  const f = setup(); await f.input.engage();
  f.pointer('pointerdown'); f.time(20); f.pointer('pointerup'); f.time(300); f.input.consume(0.01);
  expect(f.input.consumeFire()).toBe(true); expect(f.input.consumeFire()).toBe(false);
  f.pointer('pointerdown', 300); f.time(320); f.pointer('pointerup', 300); f.time(600); f.input.consume(0.01);
  expect(f.blast).toHaveBeenCalledOnce();
  for (const t of [700, 800]) { f.time(t); f.pointer('pointerdown', 300); f.time(t + 20); f.pointer('pointerup', 300); }
  f.input.consume(0.01); expect(f.weapon).toHaveBeenCalledExactlyOnceWith('next'); expect(f.blast).toHaveBeenCalledOnce();
});
it.each(['blur', 'visibilitychange', 'pointercancel', 'lostpointercapture'])('%s cancels held fire and cannot leak it into resume', async reason => {
  const f = setup(); await f.input.engage(); f.pointer('pointerdown'); f.time(300); f.input.consume(0.01);
  expect(f.input.consumeFire()).toBe(true);
  if (reason === 'blur') f.win.dispatchEvent(new Event(reason));
  else if (reason === 'visibilitychange') { f.doc.hidden = true; f.doc.dispatchEvent(new Event(reason)); }
  else f.pointer(reason);
  f.input.consume(0.01); expect(f.input.consumeFire()).toBe(false);
  f.input.release(); await f.input.engage(); f.time(1000);
  expect(f.input.consume(0.01)).toMatchObject({ x: 0, y: 0 }); expect(f.input.consumeFire()).toBe(false);
});
it('ignores paused, mouse and unowned touches and keeps keyboard mode available', async () => {
  const f = setup(); expect(f.pointer('pointerdown').defaultPrevented).toBe(false);
  f.pointer('pointermove'); f.pointer('pointerup'); await f.input.engage();
  expect(f.pointer('pointerdown', 50, 50, 1, 'mouse').defaultPrevented).toBe(false);
  f.pointer('pointermove', 50, 50, 1, 'mouse'); f.pointer('pointerup', 50, 50, 1, 'mouse');
  f.pointer('pointercancel'); f.doc.dispatchEvent(new Event('pointerlockchange')); expect(f.pause).not.toHaveBeenCalled();
  f.input.setScheme('wasd'); expect(f.pointer('pointerdown').defaultPrevented).toBe(false);
  expect(f.input.consume(1)).toMatchObject({ x: 0, y: 0 });
});
it('clears a touch even when the browser has already released capture', async () => {
  const f = setup(); await f.input.engage(); f.pointer('pointerdown'); f.captures.clear();
  f.input.clear(); f.time(1000); f.input.consume(1 / 60); expect(f.input.consumeFire()).toBe(false);
});
it('touch buttons adjust persistent throttle, including reverse, but cannot change course speed', async () => {
  const f = setup(); f.input.adjustThrottle(1); f.input.boost(); expect(f.input.consume(1).speed).toBe(65);
  await f.input.engage(); f.input.adjustThrottle(1); expect(f.input.consume(1).speed).toBe(80);
  for (let i = 0; i < 7; i++) f.input.adjustThrottle(-1);
  expect(f.input.throttle).toBe(-15); f.input.boost(); expect(f.input.consume(0.1).speed).toBeCloseTo(-15.375);
  f.input.autoFlight = true; f.input.adjustThrottle(1); expect(f.input.throttle).toBe(-15);
  expect(f.input.consume(0.1)).toMatchObject({ speed: -15, boost: true }); f.input.clear(); expect(f.input.consume(0.1).boost).toBe(false);
});
