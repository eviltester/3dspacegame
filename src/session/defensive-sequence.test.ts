import { describe, expect, it } from 'vitest';
import { DEFENSIVE_ARRIVAL_SECONDS, DEFENSIVE_DEPARTURE_SECONDS, DefensiveSequence, defensiveRespawnProgress } from './defensive-sequence';

describe('Defensive Position transitions', () => {
  it.each([['departing', DEFENSIVE_DEPARTURE_SECONDS, 'advance'], ['arriving', DEFENSIVE_ARRIVAL_SECONDS, 'ready']] as const)(
    '%s completes once after its full simulation interval', (phase, duration, event) => {
      const sequence = new DefensiveSequence();
      expect(sequence.active).toBe(false); expect(sequence.tick(5)).toBeNull();
      expect(sequence.start(phase)).toBe(true); expect(sequence.start(phase)).toBe(false);
      expect(sequence.progress).toBe(0);
      for (const invalid of [0, -1, NaN, Infinity]) expect(sequence.tick(invalid)).toBeNull();
      expect(sequence.tick(duration / 2)).toBeNull(); expect(sequence.progress).toBeCloseTo(0.5);
      expect(sequence.tick(duration / 2)).toBe(event); expect(sequence.active).toBe(false);
      expect(sequence.tick(10)).toBeNull();
      sequence.start(phase); sequence.reset(); expect(sequence.phase).toBe('idle'); expect(sequence.progress).toBe(0);
    });
  it('maps only the final death interval onto the warp-in, clamping outside it', () => {
    expect(defensiveRespawnProgress(4)).toBe(0);
    expect(defensiveRespawnProgress(DEFENSIVE_ARRIVAL_SECONDS)).toBe(0);
    expect(defensiveRespawnProgress(DEFENSIVE_ARRIVAL_SECONDS / 2)).toBe(0.5);
    expect(defensiveRespawnProgress(0)).toBe(1); expect(defensiveRespawnProgress(-2)).toBe(1);
  });
});
