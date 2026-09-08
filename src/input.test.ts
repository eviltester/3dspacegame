import { afterEach, expect, it, vi } from 'vitest';
import { FlightInput, MOUSE_PAUSE_HOLD_MS, throttleReadout, weaponKey, wheelThrottle } from './input';
import { selectWeapon } from './weapons';
import { CONTROL_LAYOUTS, CONTROL_SCHEMES, KEYBOARD_LOOK_RATE } from './input-layouts';
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
  input.mouseSensitivity = 1.8;
  windowTarget.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 10, movementY: -5 }));
  expect(input.consume(0.1)).toMatchObject({ x: 18, y: -9 });
  input.mouseSensitivity = 0.5;
  windowTarget.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 10, movementY: -5 }));
  expect(input.consume(0.1)).toMatchObject({ x: 5, y: -2.5 });
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

it('allows F to reverse, maintains reverse on release, and boosts backwards', async () => {
  const code = 'KeyF';
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
  expect(input.consume(0.1).speed).toBeCloseTo(-92.25);
  expect(input.throttle).toBe(-90);
  input.release();
  await input.engage();
  expect(input.consume(1).speed).toBe(-90);
  key('keydown', 'KeyR');
  expect(input.consume(1).speed).toBe(-10);
  expect(input.consume(1).speed).toBe(70);
  expect(input.consume(10).speed).toBe(180);
  key('keyup', 'KeyR'); key('keydown', 'ShiftRight');
  expect(input.consume(0.1).speed).toBeCloseTo(184.5);
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
  return { input, mouse, key, pause, special, weapon, windowTarget, documentTarget, canvas };
}

it.each(CONTROL_SCHEMES)('%s accepts both fire/blast key pairs, including taps, holds and pause clearing', async scheme => {
  const { input, key, special, windowTarget } = weaponInputFixture(); input.setScheme(scheme);
  const up = (code: string) => windowTarget.dispatchEvent(Object.assign(new Event('keyup'), { code }));
  key('KeyJ'); key('KeyK'); expect(input.consumeFire()).toBe(false); expect(special).not.toHaveBeenCalled();
  await input.engage();
  for (const code of ['Space', 'KeyJ', 'KeyZ']) {
    expect(key(code).defaultPrevented).toBe(true);
    expect(input.consumeFire()).toBe(true); expect(input.consumeFire()).toBe(true);
    up(code); expect(input.consumeFire()).toBe(false);
    key(code); up(code); expect(input.consumeFire()).toBe(true); expect(input.consumeFire()).toBe(false);
  }
  for (const code of ['KeyK', 'KeyX']) {
    special.mockClear();
    expect(key(code).defaultPrevented).toBe(true); key(code, { repeat: true });
    expect(special).toHaveBeenCalledOnce();
    up(code); key(code); expect(special).toHaveBeenCalledTimes(2); up(code);
  }
  special.mockClear();
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'isComposing']) {
    for (const code of ['KeyJ', 'KeyZ', 'KeyK', 'KeyX']) expect(key(code, { [modifier]: true }).defaultPrevented).toBe(false);
  }
  expect(input.consumeFire()).toBe(false); expect(special).not.toHaveBeenCalled();
  key('KeyJ'); key('KeyZ'); input.release();
  expect(input.consumeFire()).toBe(false); key('KeyK'); key('KeyX'); expect(special).not.toHaveBeenCalled();
  await input.engage(); expect(input.consumeFire()).toBe(false);
});

it.each(['mouse','wasd','arrows','touch'] as const)('tunnel keyboard controls work alongside %s without changing that layout', async scheme => {
  const { input, key, special, windowTarget } = weaponInputFixture(); input.setScheme(scheme); input.tunnelControls = true;
  await input.engage(); key('KeyD');
  windowTarget.dispatchEvent(Object.assign(new Event('keyup'), { code: 'KeyD' }));
  expect(input.consume(0.01).x).toBe(0); expect(input.consumeLaneStep(0.01)).toBe(1);
  key('ArrowLeft'); expect(input.consumeLaneStep(0.01)).toBe(-1);
  key('KeyZ'); expect(input.consumeFire()).toBe(true);
  key('KeyX'); expect(special).toHaveBeenCalledOnce();
  input.release(); expect(input.consumeLaneStep(1)).toBe(0); expect(input.consumeFire()).toBe(false);
});

it('accumulates relative motion rather than absolute cursor positions and consumes it once', async () => {
  const { input, windowTarget } = weaponInputFixture(); await input.engage();
  for (const [movementX, movementY] of [[15, -10], [-3, 4]]) {
    windowTarget.dispatchEvent(Object.assign(new Event('mousemove'), { movementX, movementY, clientX: 700, clientY: 450 }));
  }
  expect(input.consume(0.1)).toMatchObject({ x: 12, y: -6 });
  expect(input.consume(0.1)).toMatchObject({ x: 0, y: 0 });
});

it('ignores movement while inactive or unlocked and discards unconsumed motion across pause', async () => {
  const { input, windowTarget, documentTarget, canvas } = weaponInputFixture();
  const move = () => windowTarget.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 50, movementY: 20 }));
  move(); expect(input.consume(1)).toMatchObject({ x: 0, y: 0 });
  await input.engage(); documentTarget.pointerLockElement = null;
  move(); expect(input.consume(1)).toMatchObject({ x: 0, y: 0 });
  documentTarget.pointerLockElement = canvas;
  move(); input.release(); move(); await input.engage();
  expect(input.consume(1)).toMatchObject({ x: 0, y: 0 });
});

it('uses relative motion in the fallback only after pointer lock is rejected', async () => {
  const { input, windowTarget, canvas } = weaponInputFixture();
  vi.spyOn(canvas, 'requestPointerLock').mockRejectedValue(new Error('Lock unavailable'));
  await input.engage();
  windowTarget.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: -30, movementY: 45 }));
  expect(input.consume(1)).toMatchObject({ x: -30, y: 45 });
});

it.each(['blur', 'visibilitychange', 'pointerlockchange'])('requests pause on %s and clears input when the owner releases it', async type => {
  const { input, mouse, pause, windowTarget, documentTarget } = weaponInputFixture();
  pause.mockImplementation(() => input.release()); await input.engage(); mouse(true, 0);
  windowTarget.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 50, movementY: 20 }));
  if (type === 'blur') windowTarget.dispatchEvent(new Event(type));
  else {
    if (type === 'visibilitychange') documentTarget.hidden = true;
    else documentTarget.pointerLockElement = null;
    documentTarget.dispatchEvent(new Event(type));
  }
  expect(pause).toHaveBeenCalledOnce(); expect(input.active).toBe(false);
  expect(input.consumeFire()).toBe(false); expect(input.consume(1)).toMatchObject({ x: 0, y: 0 });
});

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
  for (const code of ['KeyR', 'KeyF']) { key(code); input.consume(1); }
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

it.each(['mouse', 'wasd', 'arrows'] as const)('%s supports combined desktop steering, weapons, roll, reverse and boost', async scheme => {
  const { input, key, canvas, special, windowTarget } = weaponInputFixture();
  const lock = vi.spyOn(canvas, 'requestPointerLock');
  const layout = CONTROL_LAYOUTS[scheme];
  const up = (code: string) => windowTarget.dispatchEvent(Object.assign(new Event('keyup'), { code }));
  input.setScheme(scheme); await input.engage(); expect(lock).toHaveBeenCalledOnce();
  key(layout.up[0]); key(layout.right[0]); key(layout.primary[0]);
  expect(input.consume(0.5)).toEqual({ x: KEYBOARD_LOOK_RATE / 2, y: -KEYBOARD_LOOK_RATE / 2, roll: 0, speed: 65, boost: false });
  expect(input.consumeFire()).toBe(true); expect(input.consumeFire()).toBe(true);
  up(layout.up[0]); up(layout.right[0]); up(layout.primary[0]); expect(input.consumeFire()).toBe(false);
  key(layout.primary[0]); up(layout.primary[0]); expect(input.consumeFire()).toBe(true); expect(input.consumeFire()).toBe(false);
  key(layout.special[0]); key(layout.special[0], { repeat: true }); expect(special).toHaveBeenCalledOnce();
  up(layout.special[0]); key(layout.special[0]); expect(special).toHaveBeenCalledTimes(2);
  key('KeyF'); key('KeyQ'); expect(input.consume(1)).toMatchObject({ speed: -35, roll: 1 });
  up('KeyF'); up('KeyQ'); key('KeyE'); key('ShiftRight');
  expect(input.consume(1)).toMatchObject({ speed: -43.75, roll: -1, boost: true });
  up('ShiftRight'); up('KeyE'); key('KeyR'); expect(input.consume(1).speed).toBe(45);
  up('KeyR'); expect(input.consume(1).speed).toBe(45);
  input.autoFlight = true; key('KeyF'); key('ShiftLeft'); key(layout.down[0]);
  expect(input.consume(1)).toMatchObject({ y: KEYBOARD_LOOK_RATE, boost: true }); expect(input.throttle).toBe(45);
});

it.each(['mouse', 'wasd', 'arrows'] as const)('%s combines both keyboard sets with mouse motion, and clears everything on pause', async scheme => {
  const { input, key, pause, windowTarget } = weaponInputFixture();
  const layout = CONTROL_LAYOUTS[scheme]; input.setScheme(scheme); await input.engage();
  key(layout.left[0]);
  expect(input.consume(0.25).x + input.consume(0.75).x).toBe(-KEYBOARD_LOOK_RATE);
  key(layout.right[0]); expect(input.consume(1).x).toBe(0);
  input.clear(); key('KeyD'); key('ArrowRight'); key('KeyW'); key('ArrowUp');
  input.mouseSensitivity = 2;
  windowTarget.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 10, movementY: -5 }));
  expect(input.consume(1)).toMatchObject({ x: KEYBOARD_LOOK_RATE + 20, y: -KEYBOARD_LOOK_RATE - 10, roll: 0, speed: 65 });
  // Holding equivalent keys does not double the keyboard steering rate.
  expect(input.consume(1)).toMatchObject({ x: KEYBOARD_LOOK_RATE, y: -KEYBOARD_LOOK_RATE, roll: 0, speed: 65 });
  key('ArrowLeft'); key('KeyS'); expect(input.consume(1)).toMatchObject({ x: 0, y: 0, roll: 0, speed: 65 });
  key(layout.primary[0]); input.release(); await input.engage();
  document.dispatchEvent(new Event('pointerlockchange'));
  expect(pause).not.toHaveBeenCalled(); expect(input.consumeFire()).toBe(false);
  expect(input.consume(1)).toMatchObject({ x: 0, y: 0, roll: 0 });
  key(layout.up[0], { ctrlKey: true }); expect(input.consume(1).y).toBe(0);
  key('Escape'); expect(pause).toHaveBeenCalledOnce();
  windowTarget.dispatchEvent(new Event('blur')); expect(pause).toHaveBeenCalledTimes(2);
  input.setScheme('mouse'); expect(input.consume(1)).toMatchObject({ x: 0, y: 0, roll: 0 });
});

it('keeps combined desktop steering available when pointer lock is refused', async () => {
  const { input, key, canvas, windowTarget } = weaponInputFixture();
  vi.spyOn(canvas, 'requestPointerLock').mockRejectedValue(new Error('Lock unavailable'));
  await input.engage(); key('ArrowRight'); key('KeyW');
  windowTarget.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 10, movementY: 5 }));
  expect(input.consume(1)).toMatchObject({ x: KEYBOARD_LOOK_RATE + 10, y: -KEYBOARD_LOOK_RATE + 5, speed: 65, roll: 0 });
});
