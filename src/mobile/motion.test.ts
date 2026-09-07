import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MotionInput, touchCapable } from './motion';

let win: EventTarget & { isSecureContext: boolean; screen: { orientation: { angle: number } } };
beforeEach(() => {
  vi.useFakeTimers(); vi.spyOn(performance, 'now').mockReturnValue(0);
  win = Object.assign(new EventTarget(), { isSecureContext: true, screen: { orientation: { angle: 0 } } });
  vi.stubGlobal('window', win); vi.stubGlobal('DeviceOrientationEvent', class {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function sample(beta: number | null = 0, gamma = 0) { win.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta, gamma })); }

it('requests permission immediately from the button call, then centres on valid data', async () => {
  const request = vi.fn().mockResolvedValue('granted'); vi.stubGlobal('DeviceOrientationEvent', { requestPermission: request });
  const changed = vi.fn(), motion = new MotionInput(changed);
  const pending = motion.enable(); expect(request).toHaveBeenCalledOnce(); expect(motion.status).toBe('requesting');
  await pending; expect(motion.status).toBe('waiting'); sample(null); expect(motion.available).toBe(false);
  sample(); expect(motion.available).toBe(true); expect(motion.read(0.1, 1)).toEqual({ x: 0, y: 0 });
  sample(0, 20); expect(motion.read(0.1, 1).x).toBeGreaterThan(0);
  motion.calibrate(); expect(motion.status).toBe('waiting'); sample(0, 20); expect(motion.read(0.1, 1).x).toBe(0);
  vi.advanceTimersByTime(2000); expect(motion.status).toBe('ready'); expect(changed).toHaveBeenCalled(); motion.stop();
});
it('falls back on insecure connections and missing APIs without prompting', async () => {
  const motion = new MotionInput(); win.isSecureContext = false; await motion.enable(); expect(motion.status).toBe('insecure');
  win.isSecureContext = true; vi.stubGlobal('DeviceOrientationEvent', undefined); await motion.enable(); expect(motion.status).toBe('unavailable');
  expect(motion.read(1, 1)).toEqual({ x: 0, y: 0 });
});
it.each(['denied', 'throws'] as const)('keeps drag available when permission %s', async result => {
  const request = result === 'throws' ? vi.fn().mockRejectedValue(new Error('Denied')) : vi.fn().mockResolvedValue('denied');
  vi.stubGlobal('DeviceOrientationEvent', { requestPermission: request });
  const motion = new MotionInput(); await motion.enable(); sample(); expect(motion.status).toBe('denied'); expect(motion.available).toBe(false);
});
it('times out missing data, accepts late valid data, and falls back when the sensor stops', async () => {
  const motion = new MotionInput(); await motion.enable(); vi.advanceTimersByTime(1800); expect(motion.status).toBe('unavailable');
  sample(); expect(motion.status).toBe('ready'); vi.spyOn(performance, 'now').mockReturnValue(1001);
  expect(motion.read(1, 1)).toEqual({ x: 0, y: 0 }); expect(motion.status).toBe('unavailable');
  sample(); expect(motion.available).toBe(true); motion.stop(); sample(); expect(motion.status).toBe('off');
});
it.each(['granted', 'error'])('ignores a late permission %s after switching controls', async outcome => {
  let resolve!: (value: string) => void, reject!: (error: Error) => void;
  vi.stubGlobal('DeviceOrientationEvent', { requestPermission: () => new Promise<string>((yes, no) => { resolve = yes; reject = no; }) });
  const motion = new MotionInput(); const pending = motion.enable(); motion.stop();
  if (outcome === 'error') reject(new Error('late')); else resolve('granted');
  await pending; sample(); expect(motion.status).toBe('off');
});
it('clears a waiting timer on stop and restarts its calibration timeout', async () => {
  const motion = new MotionInput(); await motion.enable(); motion.calibrate();
  motion.stop(); vi.advanceTimersByTime(3000); expect(motion.status).toBe('off');
});
it('uses legacy screen rotation when the screen orientation API is absent', async () => {
  Object.assign(win, { screen: undefined, orientation: 90 }); const motion = new MotionInput(); await motion.enable();
  sample(); sample(15); expect(motion.read(1, 1).x).toBeGreaterThan(0); motion.stop();
});
it('assumes portrait only when neither screen rotation API exists', async () => {
  Object.assign(win, { screen: undefined }); const motion = new MotionInput(); await motion.enable();
  sample(); sample(15); expect(motion.read(1, 1).y).toBeGreaterThan(0); motion.stop();
});
it('detects touch capability, not user-agent names', () => {
  vi.stubGlobal('navigator', { maxTouchPoints: 5 }); expect(touchCapable()).toBe(true);
  vi.stubGlobal('navigator', { maxTouchPoints: 0 }); expect(touchCapable()).toBe(false);
  Object.assign(win, { matchMedia: () => ({ matches: true }) }); expect(touchCapable()).toBe(true);
});
