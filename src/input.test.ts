import { afterEach, expect, it, vi } from 'vitest';
import { FlightInput, throttleReadout, wheelThrottle } from './input';
afterEach(() => vi.unstubAllGlobals());
it('latches a quick mouse click, maintains throttle, and clears held input on pause', async () => {
  const canvas = new EventTarget() as HTMLCanvasElement;
  const windowTarget = new EventTarget();
  const documentTarget = Object.assign(new EventTarget(), { pointerLockElement: null as HTMLCanvasElement | null, hidden: false, exitPointerLock: () => {} });
  canvas.requestPointerLock = async () => { documentTarget.pointerLockElement = canvas; };
  vi.stubGlobal('window', windowTarget); vi.stubGlobal('document', documentTarget);
  const pause = vi.fn(), special = vi.fn();
  const input = new FlightInput(canvas, pause, special);
  await input.engage();
  const mouse = (target: EventTarget, name: string, button: number) => target.dispatchEvent(Object.assign(new Event(name), { button }));
  mouse(canvas, 'mousedown', 0); mouse(windowTarget, 'mouseup', 0);
  expect(input.consumeFire()).toBe(true); expect(input.consumeFire()).toBe(false);
  mouse(canvas, 'mousedown', 0);
  expect(input.consumeFire()).toBe(true); expect(input.consumeFire()).toBe(true);
  canvas.dispatchEvent(Object.assign(new Event('wheel'), { deltaY: -100 }));
  expect(input.consume(1).speed).toBe(80); expect(input.consume(10).speed).toBe(80);
  mouse(canvas, 'mousedown', 2); expect(special).toHaveBeenCalledOnce();
  windowTarget.dispatchEvent(new Event('blur')); expect(pause).toHaveBeenCalledOnce();
  input.release(); expect(input.consumeFire()).toBe(false);
});

it('stops the wheel at zero before reversing and clamps both thrust directions', () => {
  let throttle = 65;
  for (let i = 0; i < 5; i++) throttle = wheelThrottle(throttle, 100);
  expect(throttle).toBe(0);
  expect(wheelThrottle(throttle, 100)).toBe(-15);
  expect(wheelThrottle(-5, -100)).toBe(0);
  expect(wheelThrottle(0, -100)).toBe(15);
  expect(wheelThrottle(-90, 100)).toBe(-90);
  expect(wheelThrottle(180, -100)).toBe(180);
  expect(wheelThrottle(-45, 0)).toBe(-45);
});

it('labels forward, stopped, and reverse thrust clearly', () => {
  expect(throttleReadout(65)).toBe('FWD 65');
  expect(throttleReadout(0)).toBe('STOP');
  expect(throttleReadout(-45)).toBe('REV 45');
  expect(throttleReadout(-0.1)).toBe('STOP');
});

it.each(['KeyS', 'ArrowDown'])('allows %s to reverse, maintains reverse on release, and boosts backwards', async code => {
  const canvas = new EventTarget() as HTMLCanvasElement;
  const windowTarget = new EventTarget();
  const documentTarget = Object.assign(new EventTarget(), { pointerLockElement: null as HTMLCanvasElement | null, hidden: false, exitPointerLock: () => {} });
  canvas.requestPointerLock = async () => { documentTarget.pointerLockElement = canvas; };
  vi.stubGlobal('window', windowTarget); vi.stubGlobal('document', documentTarget);
  const input = new FlightInput(canvas, vi.fn(), vi.fn());
  await input.engage();
  const key = (name: string, code: string) => windowTarget.dispatchEvent(Object.assign(new Event(name), { code }));
  key('keydown', code);
  expect(input.consume(1).speed).toBe(-35);
  expect(input.consume(2).speed).toBe(-90);
  key('keyup', code);
  expect(input.consume(10)).toEqual({ x: 0, y: 0, roll: 0, speed: -90 });
  key('keydown', 'ShiftLeft');
  expect(input.consume(0.1).speed).toBe(-130);
  expect(input.throttle).toBe(-90);
  input.release();
  await input.engage();
  expect(input.consume(1).speed).toBe(-90);
  key('keydown', 'KeyW');
  expect(input.consume(1).speed).toBe(-10);
  expect(input.consume(1).speed).toBe(70);
  expect(input.consume(10).speed).toBe(180);
  key('keyup', 'KeyW'); key('keydown', 'ShiftRight');
  expect(input.consume(0.1).speed).toBe(230);
});
