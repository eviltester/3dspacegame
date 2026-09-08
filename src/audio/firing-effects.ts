import type { Effect } from './effect-types';

// Weapon identities: paired crack, diving whistle, heavy cannon, dry rattle,
// carrier rumble, turret bark, saucer chirrup, and three alien energy textures.
export const FIRING_EFFECTS = {
  flanker: { duration: 0.16, voices: [
    { wave: 'metal', notes: [1450, 0, 720], level: 0.45, gated: true, decay: 2 }
  ] },
  diver: { duration: 0.26, voices: [
    { wave: 'sine', notes: [1700, 1200, 800, 300], level: 0.7, decay: 2.5 }
  ] },
  gunship: { duration: 0.28, voices: [
    { wave: 'noise', notes: [5000, 2200, 900], level: 0.6, decay: 4 },
    { wave: 'triangle', notes: [150, 75], level: 0.55, decay: 3 }
  ] },
  minelayer: { duration: 0.19, voices: [
    { wave: 'pulse', notes: [220, 0, 180, 0, 140], duty: 0.12, level: 0.4, gated: true, decay: 1.5 }
  ] },
  carrier: { duration: 0.42, voices: [
    { wave: 'metal', notes: [120, 80, 40], level: 0.4, decay: 3 },
    { wave: 'noise', notes: [900, 1800, 400], level: 0.45, decay: 3.5 }
  ] },
  carrierTurret: { duration: 0.2, voices: [
    { wave: 'noise', notes: [4000, 1600, 600], level: 0.45, decay: 4 },
    { wave: 'pulse', notes: [660, 220], duty: 0.25, level: 0.35, decay: 2.5 }
  ] },
  canyonGun: { duration: 0.17, voices: [
    { wave: 'noise', notes: [1600, 700], level: 0.5, decay: 4.5 },
    { wave: 'sine', notes: [100, 55], level: 0.7, decay: 3.5 }
  ] },
  saucer: { duration: 0.23, voices: [
    { wave: 'triangle', notes: [450, 900, 450, 225], level: 0.6, decay: 2 }
  ] },
  invaderRaider: { duration: 0.12, voices: [
    { wave: 'pulse', notes: [900, 450, 225], duty: 0.4, level: 0.46, decay: 3 }
  ] },
  invaderFlanker: { duration: 0.29, voices: [
    { wave: 'metal', notes: [350, 1050, 350, 175], level: 0.35, decay: 2.2 }
  ] },
  invaderDiver: { duration: 0.18, voices: [
    { wave: 'sine', notes: [2400, 1600, 600], level: 0.6, decay: 2.8 },
    { wave: 'pulse', notes: [300], duty: 0.125, level: 0.2, duration: 0.08, decay: 4 }
  ] }
} satisfies Record<string, Effect>;
