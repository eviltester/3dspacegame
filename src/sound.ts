import type { Faction } from './logic';

type Wave = 'pulse' | 'triangle' | 'noise' | 'metal';
interface Voice {
  wave: Wave;
  notes: number[];
  level: number;
  duty?: number;
  start?: number;
  duration?: number;
  decay?: number;
  gated?: boolean;
}
interface Effect {
  duration: number;
  voices: Voice[];
}

// Short, clocked phrases: pulse channels and shift-register noise, like an arcade sound board.
const EFFECTS = {
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
  explosion: { duration: 0.58, voices: [
    { wave: 'noise', notes: [9000, 6500, 4200, 2400, 1200, 550], level: 0.75, decay: 4.5 },
    { wave: 'triangle', notes: [110, 82, 62, 46], level: 0.48, duration: 0.34, decay: 4 }
  ] },
  warning: { duration: 0.4, voices: [
    { wave: 'pulse', notes: [660, 0, 440, 0, 660], duty: 0.5, level: 0.3, gated: true }
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
        phase %= 1;
        const feedback = (register ^ (register >> 1)) & 1;
        register = (register >> 1) | (feedback << 14);
        noise = (register & 1) * 2 - 1;
      }
      const pulse = phase < (voice.duty ?? 0.5) ? 1 : -1;
      const wave = voice.wave === 'noise' ? noise
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

  async start(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.48;
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

  shoot(): void { this.play('shoot'); }
  enemyShoot(faction: Faction, distance: number): void {
    const volume = Math.max(0, 1 - distance / 800) * 0.48;
    if (volume > 0.015) this.play(faction === 'police' ? 'police' : faction === 'trader' ? 'trader' : 'pirate', volume);
  }
  pickup(): void { this.play('pickup', 0.7); }
  explosion(distance = 0): void { this.play('explosion', Math.max(0, 1 - distance / 1000)); }
  warning(): void { this.play('warning', 0.8); }
  damage(): void { this.play('damage'); }
  warp(): void { this.play('warp', 0.85); }
  complete(): void { this.play('complete', 0.85); }
  gameOver(): void {
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
    this.play('gameOver');
  }

  private play(name: SoundEffect, volume = 1): void {
    if (!this.context || !this.master || this.context.state !== 'running' || volume <= 0) return;
    const now = this.context.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < 0.055 || this.voices.size >= 14) return;
    this.lastPlayed.set(name, now);
    let buffer = this.buffers.get(name);
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
