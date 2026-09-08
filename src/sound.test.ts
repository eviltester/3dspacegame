import { afterEach, expect, it, vi } from 'vitest';
import { SOUND_SAMPLE_RATE, SoundBank, synthesizeEffect } from './sound';

afterEach(() => vi.unstubAllGlobals());
it('miss feedback is a short bass impact that fades quickly to silence', () => {
  const samples = synthesizeEffect('miss');
  expect(samples.length / SOUND_SAMPLE_RATE).toBeLessThanOrEqual(0.15);
  expect(Math.max(...samples.map(Math.abs))).toBeGreaterThan(0.15);
  expect(samples.every(sample => Number.isFinite(sample) && Math.abs(sample) < 1)).toBe(true);
  expect(samples[samples.length - 1]).toBe(0);
  const energy = (part: Float32Array) => part.reduce((sum, sample) => sum + sample * sample, 0);
  const third = Math.floor(samples.length / 3);
  expect(energy(samples.slice(0, third))).toBeGreaterThan(25 * energy(samples.slice(-third)));
  // The audible attack must remain bass-heavy, not turn into a high-pitched beep.
  const attack = samples.slice(0, Math.round(0.06 * SOUND_SAMPLE_RATE));
  const crossings = attack.reduce((count, sample, index) => count + Number(index > 0 && sample > 0 && attack[index - 1] <= 0), 0);
  expect(crossings / 0.06).toBeLessThan(250);
});
it('the blast-ready phrase is a distinct, audible, bounded original sound', () => {
  const ready = synthesizeEffect('blastReady');
  expect(ready.length).toBeGreaterThan(synthesizeEffect('pickup').length);
  expect(Math.max(...ready.map(Math.abs))).toBeGreaterThan(0.1);
  expect(ready.every(sample => Number.isFinite(sample) && Math.abs(sample) < 1)).toBe(true);
  expect(ready[ready.length - 1]).toBe(0);
});
it('plays the ready phrase once per recharge, including after the next blast, never for steady charge', async () => {
  const starts = vi.fn();
  const node = () => ({ connect: vi.fn().mockReturnThis(), disconnect: vi.fn() });
  const context = { state: 'running', currentTime: 0, destination: {},
    createGain: () => ({ ...node(), gain: { value: 0 } }),
    createDynamicsCompressor: () => ({ ...node(), threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} }),
    createBuffer: (_channels: number, count: number) => ({ getChannelData: () => new Float32Array(count) }),
    createBufferSource: () => ({ ...node(), start: starts, stop: vi.fn() }) };
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  const sound = new SoundBank(); await sound.start();
  sound.recharged(0, 95); sound.recharged(100, 100); sound.recharged(100, 0); expect(starts).not.toHaveBeenCalled();
  sound.recharged(95, 100); expect(starts).toHaveBeenCalledTimes(1);
  context.currentTime = 1; sound.recharged(100, 100); sound.recharged(0, 90); expect(starts).toHaveBeenCalledTimes(1);
  sound.recharged(90, 100); expect(starts).toHaveBeenCalledTimes(2);
});
