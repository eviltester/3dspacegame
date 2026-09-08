import { expect, it } from 'vitest';
import { SoundEvents, shipVoice, invaderVoice } from './events';
import { FEEDBACK_EFFECTS } from './feedback-effects';
import { FIRING_EFFECTS } from './firing-effects';
import { SOUND_EFFECT_NAMES, synthesizeEffect } from '../sound';
import { createHash } from 'node:crypto';

it('every cue and weapon has distinct synthesized samples, not aliases of one beep', () => {
  const fingerprints = SOUND_EFFECT_NAMES.map(name => createHash('sha256').update(new Uint8Array(synthesizeEffect(name).buffer)).digest('hex'));
  expect(new Set(fingerprints).size).toBe(SOUND_EFFECT_NAMES.length);
  for (const name of [...Object.keys(FEEDBACK_EFFECTS), ...Object.keys(FIRING_EFFECTS)]) expect(SOUND_EFFECT_NAMES).toContain(name);
});
it('coalesces repeats, keeps different simultaneous voices, and drains exactly once', () => {
  const events = new SoundEvents();
  for (let i = 0; i < 100; i++) {
    events.cue('score'); events.cue('pickup'); events.fire('police', 100);
  }
  events.fire('police', 200); events.fire('police', 20); events.fire('pirate', 40); events.cue('gateMiss');
  expect(events.drain()).toEqual([{ type: 'cue', cue: 'score' }, { type: 'cue', cue: 'pickup' },
    { type: 'fire', voice: 'police', distance: 20 }, { type: 'fire', voice: 'pirate', distance: 40 }, { type: 'cue', cue: 'gateMiss' }]);
  expect(events.drain()).toEqual([]);
});
it('assigns a different identity to every pirate archetype, alien type and faction gun', () => {
  const roles = ['raider', 'flanker', 'diver', 'gunship', 'minelayer', 'carrier'] as const;
  const voices = [...roles.map(role => shipVoice('pirate', role)), ...roles.slice(0, 3).map(invaderVoice),
    shipVoice('police', 'raider'), shipVoice('trader', 'raider'), shipVoice('part', 'gunship'), 'saucer', 'canyonGun'];
  expect(new Set(voices).size).toBe(voices.length);
  for (const voice of voices) expect(SOUND_EFFECT_NAMES).toContain(voice);
});
