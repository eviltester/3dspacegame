import { afterEach, expect, it, vi } from 'vitest';
import { SOUND_SAMPLE_RATE, SoundBank, synthesizeEffect } from '../sound';
import { FEEDBACK_EFFECTS } from './feedback-effects';
import { FIRING_EFFECTS } from './firing-effects';
import type { FeedbackCue, ShipVoice } from './events';

afterEach(() => vi.unstubAllGlobals());
async function bank() {
  const node = () => ({ connect: vi.fn().mockReturnThis(), disconnect: vi.fn() });
  const started: Array<{ buffer: Float32Array; stopped: boolean }> = [], gains: Array<{ value: number }> = [];
  const context = { state: 'running', currentTime: 0, destination: {},
    createGain: () => { const gain = { value: 1 }; gains.push(gain); return { ...node(), gain }; },
    createDynamicsCompressor: () => ({ ...node(), threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} }),
    createBuffer: (_channels: number, count: number) => { const samples = new Float32Array(count); return { getChannelData: () => samples }; },
    createBufferSource: () => {
      let entry: typeof started[number];
      return { ...node(), buffer: null as { getChannelData(): Float32Array } | null,
        start() { entry = { buffer: this.buffer!.getChannelData(), stopped: false }; started.push(entry); },
        stop() { if (entry) entry.stopped = true; } };
    }
  };
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  const sound = new SoundBank(); await sound.start();
  return { sound, context, started, gains };
}
it.each(Object.keys(FEEDBACK_EFFECTS) as FeedbackCue[])('%s routes to its own audible buffer', async cue => {
  const { sound, started } = await bank(); sound.event({ type: 'cue', cue });
  expect(started).toHaveLength(1); expect(started[0].buffer).toEqual(synthesizeEffect(cue));
});
it.each([...Object.keys(FIRING_EFFECTS), 'pirate', 'police', 'trader'] as ShipVoice[])('%s firing uses its own buffer and distance attenuation', async voice => {
  const { sound, context, started, gains } = await bank(); sound.event({ type: 'fire', voice, distance: 100 });
  expect(started[0].buffer).toEqual(synthesizeEffect(voice)); const volume = gains.at(-1)!.value;
  context.currentTime = 1; sound.enemyShoot(voice, 400); expect(gains.at(-1)!.value).toBeLessThan(volume);
  sound.enemyShoot(voice, 1000); expect(started).toHaveLength(2);
});
it('a life ping can replace a routine sound at capacity; lock-on cannot chatter each frame', async () => {
  const { sound, context, started } = await bank();
  for (let i = 0; i < 14; i++) { context.currentTime += 0.1; sound.shoot(); }
  sound.cue('score'); expect(started).toHaveLength(14);
  sound.cue('extraLife'); expect(started).toHaveLength(15); expect(started[0].stopped).toBe(true);
  expect(started.at(-1)!.buffer).toEqual(synthesizeEffect('extraLife'));
  context.currentTime += 1; sound.cue('lockOn');
  for (let i = 0; i < 20; i++) { context.currentTime += 1 / 60; sound.cue('lockOn'); }
  expect(started).toHaveLength(16);
  context.currentTime += 0.5; sound.cue('lockOn'); expect(started).toHaveLength(17);
});
it('mute applies to the shared output for every cue and firing voice', async () => {
  const { sound, gains } = await bank(); sound.setMuted(true);
  sound.cue('extraLife'); sound.enemyShoot('canyonGun', 100); expect(gains[0].value).toBe(0);
  sound.setMuted(false); expect(gains[0].value).toBe(0.48);
});
it('the extra-life reward is one ringing high ping, not a low warning or multi-note phrase', () => {
  const samples = synthesizeEffect('extraLife').slice(0, SOUND_SAMPLE_RATE / 10);
  const power = (hz: number) => {
    let real = 0, imaginary = 0;
    samples.forEach((sample, index) => { const phase = index * hz * 2 * Math.PI / SOUND_SAMPLE_RATE; real += sample * Math.cos(phase); imaginary += sample * Math.sin(phase); });
    return real * real + imaginary * imaginary;
  };
  expect(power(1760)).toBeGreaterThan(100 * power(440));
  expect(FEEDBACK_EFFECTS.extraLife.voices.every(voice => voice.notes.length === 1)).toBe(true);
});
