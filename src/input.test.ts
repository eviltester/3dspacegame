import { afterEach, expect, it, vi } from 'vitest';
import { FlightInput, MOUSE_PAUSE_HOLD_MS, throttleReadout, weaponKey, wheelThrottle } from './input';
import { selectWeapon } from './weapons';
import { CONTROL_LAYOUTS, KEYBOARD_LOOK_RATE } from './input-layouts';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('latches a quick mouse click, maintains throttle, and clears held input on pause', async () => {
  const canvas = new EventTarget() as HTMLCanvasElement;
  const windowTarget = new EventTarget();
  const documentTarget = Object.assign(new EventTarget(), { pointerLockElement: null as HTMLCanvasElement | null, hidden: false, exitPointerLock: () => {} });
  canvas.requestPointerLock = () => { documentTarget.pointerLockElement = canvas; return Promise.resolve(); };
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
  canvas.requestPointerLock = () => { documentTarget.pointerLockElement = canvas; return Promise.resolve(); };
  vi.stubGlobal('window', windowTarget); vi.stubGlobal('document', documentTarget);
  const input = new FlightInput(canvas, vi.fn(), vi.fn());
  await input.engage();
  const key = (name: string, code: string) => windowTarget.dispatchEvent(Object.assign(new Event(name), { code }));
  key('keydown', code);
  expect(input.consume(1).speed).toBe(-35);
  expect(input.consume(2).speed).toBe(-90);
  key('keyup', code);
  expect(input.consume(10)).toEqual({ x: 0, y: 0, roll: 0, speed: -90, boost: false });
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

it.each([
  ['Digit1', 'pulse'], ['Numpad1', 'pulse'], ['Digit2', 'spread'], ['Numpad2', 'spread'],
  ['Digit3', 'lance'], ['Numpad3', 'lance'], ['Tab', 'next'], ['KeyA', null], ['Digit4', null]
])('maps weapon key %s to %s', (key, family) => { expect(weaponKey(key)).toBe(family); });

it('cycles Pulse, Spread, Lance and wraps back to Pulse', () => {
  expect(selectWeapon('pulse', 'next')).toBe('spread');
  expect(selectWeapon('spread', 'next')).toBe('lance');
  expect(selectWeapon('lance', 'next')).toBe('pulse');
  expect(selectWeapon('lance', 'spread')).toBe('spread');
  expect(selectWeapon('pulse', 'pulse')).toBe('pulse');
});

function weaponInputFixture() {
  const canvas = new EventTarget() as HTMLCanvasElement;
  const windowTarget = new EventTarget();
  const documentTarget = Object.assign(new EventTarget(), { pointerLockElement: null as HTMLCanvasElement | null, hidden: false, exitPointerLock: () => {} });
  canvas.requestPointerLock = () => { documentTarget.pointerLockElement = canvas; return Promise.resolve(); };
  vi.stubGlobal('window', windowTarget); vi.stubGlobal('document', documentTarget);
  const pause = vi.fn(), special = vi.fn(), weapon = vi.fn();
  const input = new FlightInput(canvas, pause, special, weapon);
  const mouse = (down: boolean, button = 1) => (down ? canvas : windowTarget).dispatchEvent(Object.assign(new Event(down ? 'mousedown' : 'mouseup', { cancelable: true }), { button }));
  const key = (code: string, extra = {}) => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { code, repeat: false, ...extra });
    windowTarget.dispatchEvent(event); return event;
  };
  return { input, mouse, key, pause, special, weapon, windowTarget, canvas };
}

it('switches once per active key press, consumes Tab, and keeps firing/throttle intact', async () => {
  const { input, key, mouse, weapon, special } = weaponInputFixture();
  expect(key('Tab').defaultPrevented).toBe(false); expect(weapon).not.toHaveBeenCalled();
  await input.engage(); mouse(true, 0);
  expect(key('Digit2').defaultPrevented).toBe(true); expect(weapon).toHaveBeenLastCalledWith('spread');
  key('Digit2', { repeat: true }); expect(weapon).toHaveBeenCalledTimes(1);
  expect(key('Tab').defaultPrevented).toBe(true); expect(weapon).toHaveBeenLastCalledWith('next');
  key('Tab', { repeat: true }); expect(weapon).toHaveBeenCalledTimes(2);
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'isComposing']) expect(key('Tab', { [modifier]: true }).defaultPrevented).toBe(false);
  expect(weapon).toHaveBeenCalledTimes(2);
  expect(input.consumeFire()).toBe(true); expect(input.consume(1).speed).toBe(65);
  mouse(true, 2); expect(special).toHaveBeenCalledOnce();
  input.release(); expect(key('Tab').defaultPrevented).toBe(false);
  key('Digit3'); expect(weapon).toHaveBeenCalledTimes(2);
});

it('short wheel clicks cycle exactly once without pausing', async () => {
  vi.useFakeTimers();
  const { input, mouse, weapon, pause } = weaponInputFixture(); await input.engage();
  mouse(true); vi.advanceTimersByTime(MOUSE_PAUSE_HOLD_MS - 1);
  expect(weapon).not.toHaveBeenCalled(); expect(pause).not.toHaveBeenCalled();
  mouse(false); expect(weapon).toHaveBeenCalledExactlyOnceWith('next');
  mouse(false); vi.advanceTimersByTime(1000);
  expect(weapon).toHaveBeenCalledOnce(); expect(pause).not.toHaveBeenCalled();
});

it('holding the wheel pauses without cycling on release', async () => {
  vi.useFakeTimers();
  const { input, mouse, weapon, pause } = weaponInputFixture(); await input.engage();
  mouse(true); vi.advanceTimersByTime(MOUSE_PAUSE_HOLD_MS);
  expect(pause).toHaveBeenCalledOnce(); mouse(false); vi.advanceTimersByTime(1000);
  expect(weapon).not.toHaveBeenCalled(); expect(pause).toHaveBeenCalledOnce();
});

it('clears pending wheel holds on release/pause so they cannot fire after resume', async () => {
  vi.useFakeTimers();
  const { input, mouse, weapon, pause } = weaponInputFixture(); await input.engage();
  mouse(true); vi.advanceTimersByTime(200); input.release(); await input.engage();
  vi.advanceTimersByTime(1000); mouse(false);
  expect(pause).not.toHaveBeenCalled(); expect(weapon).not.toHaveBeenCalled();
});

it('locks canyon throttle, permits Shift and wheel-forward boost, and clears boosts on pause', async () => {
  const { input, key, canvas, windowTarget } = weaponInputFixture();
  input.throttle = -45; input.autoFlight = true; await input.engage();
  const wheel = (deltaY: number) => canvas.dispatchEvent(Object.assign(new Event('wheel'), { deltaY }));
  for (const code of ['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown']) { key(code); input.consume(1); }
  wheel(100); expect(input.consume(0.1).boost).toBe(false); expect(input.throttle).toBe(-45);
  wheel(-100); expect(input.consume(0.1).boost).toBe(true); expect(input.throttle).toBe(-45);
  input.consume(2); expect(input.consume(0.1).boost).toBe(false);
  key('ShiftLeft'); expect(input.consume(0.1).boost).toBe(true);
  windowTarget.dispatchEvent(Object.assign(new Event('keyup'), { code: 'ShiftLeft' }));
  expect(input.consume(0.1).boost).toBe(false);
  wheel(-100); input.release(); await input.engage();
  expect(input.consume(0.1).boost).toBe(false); expect(input.throttle).toBe(-45);
  input.autoFlight = false; wheel(-100); expect(input.throttle).toBe(-30);
});

it.each(['wasd', 'arrows'] as const)('%s supports independent steering, weapons, roll, reverse and boost without pointer lock', async scheme => {
  const { input, key, canvas, special, windowTarget } = weaponInputFixture();
  const lock = vi.spyOn(canvas, 'requestPointerLock');
  const layout = CONTROL_LAYOUTS[scheme];
  const up = (code: string) => windowTarget.dispatchEvent(Object.assign(new Event('keyup'), { code }));
  input.setScheme(scheme); await input.engage(); expect(lock).not.toHaveBeenCalled();
  key(layout.up[0]); key(layout.right[0]); key(layout.primary[0]);
  expect(input.consume(0.5)).toEqual({ x: KEYBOARD_LOOK_RATE / 2, y: -KEYBOARD_LOOK_RATE / 2, roll: 0, speed: 65, boost: false });
  expect(input.consumeFire()).toBe(true); expect(input.consumeFire()).toBe(true);
  up(layout.up[0]); up(layout.right[0]); up(layout.primary[0]); expect(input.consumeFire()).toBe(false);
  key(layout.primary[0]); up(layout.primary[0]); expect(input.consumeFire()).toBe(true); expect(input.consumeFire()).toBe(false);
  key(layout.special[0]); key(layout.special[0], { repeat: true }); expect(special).toHaveBeenCalledOnce();
  up(layout.special[0]); key(layout.special[0]); expect(special).toHaveBeenCalledTimes(2);
  key('KeyF'); key('KeyQ'); expect(input.consume(1)).toMatchObject({ speed: -35, roll: 1 });
  up('KeyF'); up('KeyQ'); key('KeyE'); key('ShiftRight');
  expect(input.consume(1)).toMatchObject({ speed: -130, roll: -1, boost: true });
  up('ShiftRight'); up('KeyE'); key('KeyR'); expect(input.consume(1).speed).toBe(45);
  up('KeyR'); expect(input.consume(1).speed).toBe(45);
  input.autoFlight = true; key('KeyF'); key('ShiftLeft'); key(layout.down[0]);
  expect(input.consume(1)).toMatchObject({ y: KEYBOARD_LOOK_RATE, boost: true }); expect(input.throttle).toBe(45);
});

it.each(['wasd', 'arrows'] as const)('%s steering is time-based, clears on pause, and never responds to stray mouse movement', async scheme => {
  const { input, key, pause, windowTarget } = weaponInputFixture();
  const layout = CONTROL_LAYOUTS[scheme]; input.setScheme(scheme); await input.engage();
  key(layout.left[0]);
  expect(input.consume(0.25).x + input.consume(0.75).x).toBe(-KEYBOARD_LOOK_RATE);
  key(layout.right[0]); expect(input.consume(1).x).toBe(0);
  key(layout.primary[0]); input.release(); await input.engage();
  windowTarget.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 500, movementY: 500 }));
  document.dispatchEvent(new Event('pointerlockchange'));
  expect(pause).not.toHaveBeenCalled(); expect(input.consumeFire()).toBe(false);
  expect(input.consume(1)).toMatchObject({ x: 0, y: 0, roll: 0 });
  key(layout.up[0], { ctrlKey: true }); expect(input.consume(1).y).toBe(0);
  key('Escape'); expect(pause).toHaveBeenCalledOnce();
  windowTarget.dispatchEvent(new Event('blur')); expect(pause).toHaveBeenCalledTimes(2);
  input.setScheme('mouse'); expect(input.consume(1)).toMatchObject({ x: 0, y: 0, roll: 0 });
});
