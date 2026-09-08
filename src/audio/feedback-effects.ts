import type { Effect } from './effect-types';

// Different rhythms and timbres identify events, not just different pitches of
// the same beep. Frequent score ticks stay short; important rewards can ring out.
export const FEEDBACK_EFFECTS = {
  // Repeated by the tunnel beacon while a collectible remains on screen.
  pickupNearby: { duration: 0.12, voices: [
    { wave: 'sine', notes: [1200], level: 0.55, decay: 4 },
    { wave: 'sine', notes: [2400], level: 0.08, duration: 0.05, decay: 5 }
  ] },
  policeDispatch: { duration: 0.68, voices: [
    { wave: 'pulse', notes: [310, 620, 310, 620], duty: 0.35, level: 0.35, decay: 0.8 },
    { wave: 'noise', notes: [2400], level: 0.12, duration: 0.05, decay: 4 }
  ] },
  policeArrival: { duration: 1.2, voices: [
    { wave: 'triangle', notes: [640, 960, 640, 960], level: 0.55, decay: 0.45 },
    { wave: 'pulse', notes: [320, 480, 320, 480], duty: 0.35, level: 0.14, decay: 0.6 }
  ] },
  policeScan: { duration: 0.45, voices: [
    { wave: 'triangle', notes: [240, 300, 360, 420, 480, 540, 600], level: 0.55, gated: true, decay: 0.5 }
  ] },
  patrolApproach: { duration: 0.38, voices: [
    { wave: 'triangle', notes: [160, 0, 120], level: 0.65, gated: true, decay: 1 }
  ] },
  lockOn: { duration: 0.24, voices: [
    { wave: 'metal', notes: [500, 700, 1000], level: 0.34, gated: true, decay: 0.5 }
  ] },
  exitGate: { duration: 0.6, voices: [
    { wave: 'triangle', notes: [392, 0, 523], level: 0.5, decay: 0.6 },
    { wave: 'sine', notes: [784], start: 0.4, duration: 0.2, level: 0.18, decay: 3 }
  ] },
  gateMiss: { duration: 0.22, voices: [
    { wave: 'pulse', notes: [180, 130, 85], duty: 0.5, level: 0.38, decay: 2.8 }
  ] },
  penaltyReduced: { duration: 0.09, voices: [
    { wave: 'triangle', notes: [360, 420], level: 0.55, decay: 3 }
  ] },
  penaltyCleared: { duration: 0.32, voices: [
    { wave: 'sine', notes: [440, 660], level: 0.65, decay: 1.4 }
  ] },
  wrongTarget: { duration: 0.14, voices: [
    { wave: 'metal', notes: [290, 90], level: 0.4, decay: 3 },
    { wave: 'noise', notes: [1800], level: 0.2, duration: 0.035, decay: 4 }
  ] },
  weaponSwitch: { duration: 0.11, voices: [
    { wave: 'metal', notes: [1800, 500], level: 0.32, decay: 4 },
    { wave: 'noise', notes: [7000], level: 0.25, duration: 0.009, decay: 3 }
  ] },
  transaction: { duration: 0.26, voices: [
    { wave: 'metal', notes: [1200, 0, 900], level: 0.28, gated: true, decay: 2 },
    { wave: 'triangle', notes: [240], start: 0.17, duration: 0.09, level: 0.3, decay: 4 }
  ] },
  // A single bell-like ping: no multi-note fanfare to confuse with a payment.
  extraLife: { duration: 0.72, voices: [
    { wave: 'sine', notes: [1760], level: 0.8, decay: 5 },
    { wave: 'sine', notes: [3520], level: 0.1, duration: 0.16, decay: 5 }
  ] },
  bonusPayment: { duration: 0.44, voices: [
    { wave: 'triangle', notes: [330, 440, 660, 880], level: 0.58, gated: true, decay: 0.7 },
    { wave: 'pulse', notes: [165], duty: 0.25, level: 0.15, duration: 0.12, decay: 3 }
  ] },
  score: { duration: 0.075, voices: [
    { wave: 'sine', notes: [720, 960], level: 0.5, decay: 3.5 }
  ] }
} satisfies Record<string, Effect>;
