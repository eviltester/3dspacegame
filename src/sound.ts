/**
 * Original short arcade sound phrases, synthesized locally without audio files.
 * synthesizeEffect is browser-independent; SoundBank handles Web Audio playback.
 */
import type { WeaponFamily } from './arcade';
import type { Effect } from './audio/effect-types';
import { FEEDBACK_EFFECTS } from './audio/feedback-effects';
import { FIRING_EFFECTS } from './audio/firing-effects';
import type { FeedbackCue, ShipVoice, SoundEvent } from './audio/events';

// Short, clocked phrases: pulse channels and shift-register noise, like an arcade sound board.
const EFFECTS = {
  ...FEEDBACK_EFFECTS,
  ...FIRING_EFFECTS,
  blastReady: { duration: 0.52, voices: [
    { wave: 'triangle', notes: [520, 1040, 1560, 0, 2080, 2080], level: 0.65, gated: true, decay: 0.3 },
    { wave: 'pulse', notes: [260, 520, 780], duty: 0.125, level: 0.18, start: 0.26, duration: 0.26, decay: 1 }
  ] },
  shatter: { duration: 0.23, voices: [
    { wave: 'noise', notes: [11000, 7200, 0, 5400, 2400, 900], level: 0.5, decay: 3.8, gated: true },
    { wave: 'metal', notes: [1560, 780, 390, 130], level: 0.2, duration: 0.16, decay: 4 }
  ] },
  fracture: { duration: 0.19, voices: [
    { wave: 'noise', notes: [8200, 4000, 1600, 900], level: 0.55, decay: 3.6 },
    { wave: 'metal', notes: [410, 205, 102], level: 0.3, decay: 3 }
  ] },
  unlock: { duration: 0.64, voices: [
    { wave: 'pulse', notes: [740, 0, 1110, 1480, 0, 2220, 1480, 2220], duty: 0.25, level: 0.3, gated: true, decay: 0.4 },
    { wave: 'triangle', notes: [185, 370, 555, 740], level: 0.35, start: 0.32, duration: 0.32, decay: 1 }
  ] },
  spread: { duration: 0.21, voices: [
    { wave: 'noise', notes: [6500, 4200, 1700, 900], level: 0.55, decay: 4 },
    { wave: 'pulse', notes: [630, 315, 157], duty: 0.33, level: 0.35, decay: 3 }
  ] },
  lance: { duration: 0.32, voices: [
    { wave: 'metal', notes: [1760, 1760, 880, 440, 220], level: 0.32, decay: 3 },
    { wave: 'triangle', notes: [220, 110, 55], level: 0.5, decay: 2 }
  ] },
  intercept: { duration: 0.1, voices: [
    { wave: 'triangle', notes: [2200, 3300], level: 0.8, decay: 4 }
  ] },
  blast: { duration: 0.75, voices: [
    { wave: 'noise', notes: [1200, 9000, 6500, 3000, 1400, 600], level: 0.7, decay: 2.5 },
    { wave: 'pulse', notes: [90, 180, 90, 45], duty: 0.2, level: 0.35, decay: 3 }
  ] },
  shoot: { duration: 0.15, voices: [
    { wave: 'pulse', notes: [1680, 1120, 840, 560, 360, 240], duty: 0.18, level: 0.48, decay: 3.5 },
    { wave: 'noise', notes: [7200], level: 0.2, duration: 0.012, decay: 5 }
  ] },
  pirate: { duration: 0.22, voices: [
    { wave: 'pulse', notes: [480, 320, 420, 260, 180], duty: 0.32, level: 0.45, decay: 2.8 },
    { wave: 'noise', notes: [2400, 1600, 800], level: 0.15, decay: 4 }
  ] },
  police: { duration: 0.17, voices: [
    { wave: 'pulse', notes: [1240, 620, 0, 1240, 620], duty: 0.125, level: 0.4, decay: 1.8, gated: true }
  ] },
  trader: { duration: 0.13, voices: [
    { wave: 'triangle', notes: [780, 520, 260], level: 0.65, decay: 3 }
  ] },
  pickup: { duration: 0.2, voices: [
    { wave: 'pulse', notes: [880, 0, 1760], duty: 0.25, level: 0.32, gated: true, decay: 0.8 }
  ] },
  // One low impact with a fast decay, not a repeated or rising reward phrase.
  miss: { duration: 0.13, voices: [
    { wave: 'triangle', notes: [110, 85, 65, 50], level: 0.75, decay: 5 },
    { wave: 'noise', notes: [650, 350, 160], level: 0.12, duration: 0.04, decay: 5 }
  ] },
  explosion: { duration: 0.58, voices: [
    { wave: 'noise', notes: [9000, 6500, 4200, 2400, 1200, 550], level: 0.75, decay: 4.5 },
    { wave: 'triangle', notes: [110, 82, 62, 46], level: 0.48, duration: 0.34, decay: 4 }
  ] },
  damage: { duration: 0.28, voices: [
    { wave: 'metal', notes: [920, 690, 460, 230], level: 0.46, decay: 4 },
    { wave: 'noise', notes: [6400, 3200, 1600], level: 0.48, decay: 5 },
    { wave: 'triangle', notes: [92, 55], level: 0.35, duration: 0.2, decay: 5 }
  ] },
  warp: { duration: 1.65, voices: [
    { wave: 'pulse', notes: [110, 147, 220, 294, 440, 587, 880, 1175, 1760, 2350, 0],
      duty: 0.125, level: 0.28, decay: 0.4, gated: true },
    { wave: 'noise', notes: [300, 600, 1200, 2400, 4800, 8000, 4000, 1800],
      level: 0.38, start: 0.55, duration: 1.1, decay: 1.5 }
  ] },
  reinforcements: { duration: 0.9, voices: [
    { wave: 'noise', notes: [600, 1800, 6000, 10000, 1200], level: 0.45, duration: 0.45, decay: 1.2 },
    { wave: 'triangle', notes: [45, 70, 105, 210], level: 0.5, duration: 0.4, decay: 0.7 },
    { wave: 'pulse', notes: [330, 0, 247, 0], duty: 0.25, level: 0.42, start: 0.45, duration: 0.44, gated: true }
  ] },
  complete: { duration: 0.48, voices: [
    { wave: 'pulse', notes: [660, 880, 1320, 0, 1760], duty: 0.25, level: 0.3, gated: true, decay: 0.6 }
  ] },
  gameOver: { duration: 0.88, voices: [
    { wave: 'pulse', notes: [440, 330, 262, 165, 110], duty: 0.25, level: 0.34, gated: true, decay: 0.8 },
    { wave: 'noise', notes: [3200, 1600, 400], level: 0.3, duration: 0.32, decay: 5 }
  ] }
} satisfies Record<string, Effect>;

export type SoundEffect = keyof typeof EFFECTS;
export const SOUND_EFFECT_NAMES = Object.keys(EFFECTS) as SoundEffect[];
export const SOUND_SAMPLE_RATE = 22050;

export function synthesizeEffect(name: SoundEffect): Float32Array {
  // Mix every voice into one mono buffer. Resetting the noise register per voice
  // makes repeated synthesis reproducible for tests and cached playback.
  const effect: Effect = EFFECTS[name];
  const samples = new Float32Array(Math.ceil(effect.duration * SOUND_SAMPLE_RATE));
  for (const voice of effect.voices) {
    const start = Math.round((voice.start ?? 0) * SOUND_SAMPLE_RATE);
    const duration = voice.duration ?? effect.duration;
    const count = Math.min(Math.ceil(duration * SOUND_SAMPLE_RATE), samples.length - start);
    let phase = 0;
    let metalPhase = 0;
    let register = 0x4a35;
    let noise = 0;
    for (let index = 0; index < count; index += 1) {
      const time = index / SOUND_SAMPLE_RATE;
      const progress = time / duration;
      const notePosition = progress * voice.notes.length;
      const frequency = voice.notes[Math.min(voice.notes.length - 1, Math.floor(notePosition))];
      phase += frequency / SOUND_SAMPLE_RATE;
      metalPhase = (metalPhase + frequency * 1.4375 / SOUND_SAMPLE_RATE) % 1;
      if (phase >= 1) {
        // A 15-bit feedback register supplies clocked noise without Math.random.
        // The current note frequency changes the noise clock, not its loudness.
        phase %= 1;
        const feedback = (register ^ (register >> 1)) & 1;
        register = (register >> 1) | (feedback << 14);
        noise = (register & 1) * 2 - 1;
      }
      const pulse = phase < (voice.duty ?? 0.5) ? 1 : -1;
      const wave = voice.wave === 'noise' ? noise
        : voice.wave === 'sine' ? Math.sin(phase * Math.PI * 2)
        : voice.wave === 'triangle' ? 1 - 4 * Math.abs(phase - 0.5)
          : voice.wave === 'metal' ? pulse * (metalPhase < 0.5 ? 1 : -1) : pulse;
      const attack = Math.min(1, time / 0.002);
      const release = Math.min(1, (duration - time) / 0.016);
      const gate = voice.gated ? Math.min(1, Math.max(0, (0.92 - notePosition % 1) * 18)) : 1;
      const envelope = attack * release * gate * Math.exp(-(voice.decay ?? 0.5) * progress);
      if (frequency > 0) samples[start + index] += wave * envelope * voice.level;
    }
  }

  // A little speaker filtering removes DC and the brittle top edge of the chip pulses.
  let lowPass = 0;
  let previous = 0;
  let highPass = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const quantized = Math.round(samples[index] * 63) / 63;
    lowPass += (quantized - lowPass) * 0.58;
    highPass = 0.995 * (highPass + lowPass - previous);
    previous = lowPass;
    const fade = Math.min(1, (samples.length - 1 - index) / 128);
    samples[index] = Math.tanh(highPass) * 0.8 * fade;
  }
  return samples;
}

export class SoundBank {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SoundEffect, AudioBuffer>();
  private voices = new Set<AudioBufferSourceNode>();
  private lastPlayed = new Map<SoundEffect, number>();
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.48;
  }

  async start(): Promise<void> {
    // Called from a user action because browsers suspend sound until interaction.
    // A shared limiter keeps overlapping weapons/explosions from overwhelming it.
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.48;
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -9;
      limiter.knee.value = 6;
      limiter.ratio.value = 10;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.12;
      this.master.connect(limiter).connect(this.context.destination);
    }
    if (this.context.state !== 'running') await this.context.resume();
  }

  shoot(family: WeaponFamily = 'pulse'): void { this.play(family === 'pulse' ? 'shoot' : family); }
  intercept(): void { this.play('intercept', 0.7); }
  blast(): void { this.play('blast'); }
  recharged(before: number, after: number): void {
    // Edge-triggered, so holding a full charge or resuming cannot repeat the cue.
    if (before < 100 && after >= 100) this.play('blastReady', 0.95, true);
  }
  enemyShoot(voice: ShipVoice, distance: number): void {
    const volume = Math.max(0, 1 - distance / 800) * 0.48;
    if (volume > 0.015) this.play(voice, volume);
  }
  event(event: SoundEvent): void {
    if (event.type === 'fire') this.enemyShoot(event.voice, event.distance); else this.cue(event.cue);
  }
  cue(cue: FeedbackCue): void {
    const priority = ['extraLife', 'policeDispatch', 'policeScan', 'lockOn', 'exitGate', 'gateMiss'].includes(cue);
    this.play(cue, cue === 'score' ? 0.4 : cue === 'extraLife' ? 0.95 : 0.75, priority, cue === 'lockOn' ? 0.45 : 0.055);
  }
  pickup(): void { this.cue('pickup'); }
  miss(): void { this.cue('miss'); }
  explosion(distance = 0): void { this.play('explosion', Math.max(0, 1 - distance / 1000)); }
  shatter(distance = 0): void { this.play('shatter', Math.max(0, 1 - distance / 700) * 0.65); }
  damage(): void { this.play('damage'); }
  warp(): void { this.play('warp', 0.85); }
  reinforcements(): void { this.play('reinforcements', 0.95, true); }
  complete(): void { this.play('complete', 0.85); }
  unlock(): void { this.play('unlock', 0.85); }
  fracture(): void { this.play('fracture', 0.9); }
  gameOver(): void {
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
    this.play('gameOver');
  }

  private play(name: SoundEffect, volume = 1, priority = false, repeatDelay = 0.055): void {
    if (!this.context || !this.master || this.context.state !== 'running' || volume <= 0) return;
    const now = this.context.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < repeatDelay) return;
    if (this.voices.size >= 14) {
      // Arrival warnings may replace the oldest voice at capacity; routine shots
      // can be dropped. This keeps the important cue audible during a busy battle.
      if (!priority) return;
      const oldest = this.voices.values().next().value!;
      this.voices.delete(oldest);
      oldest.stop();
    }
    this.lastPlayed.set(name, now);
    let buffer = this.buffers.get(name);
    // Synthesize each phrase once, but create a new source per playback: Web Audio
    // buffer sources are single-use, while their sample buffers can be reused.
    if (!buffer) {
      const samples = synthesizeEffect(name);
      buffer = this.context.createBuffer(1, samples.length, SOUND_SAMPLE_RATE);
      buffer.getChannelData(0).set(samples);
      this.buffers.set(name, buffer);
    }
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(this.master);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  }
}
