import type { EnemyArchetype } from '../arcade';
import type { ActorKind } from '../combat/types';
import type { FEEDBACK_EFFECTS } from './feedback-effects';
import type { FIRING_EFFECTS } from './firing-effects';

export type FeedbackCue = keyof typeof FEEDBACK_EFFECTS | 'pickup' | 'miss' | 'fracture';
export type ShipVoice = keyof typeof FIRING_EFFECTS | 'pirate' | 'police' | 'trader';
export type SoundEvent = { type: 'cue'; cue: FeedbackCue } | { type: 'fire'; voice: ShipVoice; distance: number };

export function shipVoice(kind: ActorKind, role: EnemyArchetype): ShipVoice {
  return kind === 'part' ? 'carrierTurret' : kind === 'police' ? 'police' : kind === 'trader' ? 'trader' : role === 'raider' ? 'pirate' : role;
}
export function invaderVoice(role: EnemyArchetype): ShipVoice {
  return role === 'flanker' ? 'invaderFlanker' : role === 'diver' ? 'invaderDiver' : 'invaderRaider';
}

/** Typed, transient feedback, independent of log wording and score arithmetic.
 * Coalesce identical events per tick, retaining distinct simultaneous speakers.
 * The bounded map also suits silent demos/tests that never drain their sounds.
 */
export class SoundEvents {
  private pending = new Map<string, SoundEvent>();
  cue(cue: FeedbackCue): void { this.pending.set(cue, { type: 'cue', cue }); }
  fire(voice: ShipVoice, distance: number): void {
    const previous = this.pending.get(voice);
    if (previous?.type === 'fire' && previous.distance <= distance) return;
    this.pending.set(voice, { type: 'fire', voice, distance });
  }
  drain(): SoundEvent[] { const events = [...this.pending.values()]; this.pending.clear(); return events; }
}
