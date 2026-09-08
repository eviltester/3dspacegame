/** Frequencies are Hz; timing is in seconds. These definitions need no audio device. */
export interface Voice {
  wave: 'pulse' | 'triangle' | 'sine' | 'noise' | 'metal';
  notes: number[];
  level: number;
  duty?: number;
  start?: number;
  duration?: number;
  decay?: number;
  gated?: boolean;
}
export interface Effect { duration: number; voices: Voice[] }
