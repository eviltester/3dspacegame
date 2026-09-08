/** Flight evidence and once-per-level award values, independent of the renderer. */
export interface SmugglerFlight {
  elapsed: number;
  shots: number;
  blasts: number;
  bulletHits: number;
  crashes: number;
  enemies: boolean;
  gatesPassed: number;
  gatesMissed: number;
  /** Current speed meets the Boost Finish threshold, independent of held inputs. */
  topBoost: boolean;
}
export function parseSmugglerFlight(value?: unknown): SmugglerFlight {
  const data = value && typeof value === 'object' ? value as Partial<SmugglerFlight> : {};
  const number = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : 0;
  return { elapsed: number(data.elapsed), shots: number(data.shots), blasts: number(data.blasts),
    bulletHits: number(data.bulletHits), crashes: number(data.crashes), enemies: data.enemies === true,
    gatesPassed: number(data.gatesPassed), gatesMissed: number(data.gatesMissed), topBoost: data.topBoost === true };
}
export const SMUGGLER_TIME_RATE = 500;
export const SMUGGLER_TIME_ALLOWANCE = 20;
export const BOOST_FINISH_SPEED_MARGIN = 20;
/** Compare against the level's unboosted EXIT speed, not its earlier, slower cruise. */
export function qualifiesBoostFinish(speed: number, unboostedFinishSpeed: number): boolean {
  return speed >= unboostedFinishSpeed + BOOST_FINISH_SPEED_MARGIN;
}
// Boost ramps from cruise to +50% at 0.65/second. Both courses accelerate by
// distance/travel time, so this integral converts their unboosted route duration.
export function smugglerTimeLimit(cruiseSeconds: number): number {
  const ramp = 0.5 / 0.65;
  const boosted = cruiseSeconds <= ramp * 1.25
    ? (Math.sqrt(1 + 1.3 * cruiseSeconds) - 1) / 0.65
    : (cruiseSeconds + ramp * 0.25) / 1.5;
  return Math.ceil(boosted + SMUGGLER_TIME_ALLOWANCE);
}
export const SMUGGLER_AWARDS = {
  delivery: 'DELIVERY BONUS', time: 'TIME BONUS', noHit: 'NO HIT BONUS', noCrash: 'NO CRASH BONUS',
  boostFinish: 'BOOST FINISH BONUS', cleanFinish: 'CLEAN FINISH BONUS', peacemaker: 'PEACEMAKER BONUS',
  superFlyer: 'SUPER FLYER BONUS', missedGate: 'MISSED GATE PENALTY', lostCargo: 'LOST CARGO PENALTY'
} as const;
export type SmugglerAwards = Record<keyof typeof SMUGGLER_AWARDS, number>;
export interface SmugglerResult {
  flight: number;
  haul: number;
  haulPoints: number;
  seconds: number;
  awards: SmugglerAwards;
}
export function smugglerAwards(flight: SmugglerFlight, cleanExit: boolean, canyon: boolean, remaining: number): SmugglerAwards {
  return {
    delivery: 0,
    time: Math.max(0, Math.floor(remaining + 1e-6)) * SMUGGLER_TIME_RATE,
    noHit: flight.enemies && flight.bulletHits === 0 ? 3000 : 0,
    noCrash: flight.crashes === 0 ? 4000 : 0,
    boostFinish: cleanExit && flight.topBoost ? 5000 : 0,
    cleanFinish: cleanExit ? 3000 : 0,
    peacemaker: flight.shots === 0 && flight.blasts === 0 ? 5000 : 0,
    superFlyer: cleanExit && canyon && flight.gatesPassed === 18 && flight.gatesMissed === 0 ? 5000 : 0,
    missedGate: cleanExit ? 0 : -2000,
    lostCargo: cleanExit ? 0 : -2000
  };
}
/** Saved results are display-only: settlement never reads them to grant rewards. */
export function parseSmugglerResult(value: unknown): SmugglerResult | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as SmugglerResult;
  if (![data.flight, data.haul, data.haulPoints, data.seconds, ...Object.keys(SMUGGLER_AWARDS).map(key => data.awards?.[key as keyof SmugglerAwards])].every(Number.isSafeInteger)) return null;
  return data;
}
export function smugglerResultLines(result: SmugglerResult): string {
  return Object.entries(SMUGGLER_AWARDS).filter(([key]) => result.awards[key as keyof SmugglerAwards] !== 0)
    .map(([key, label]) => {
      const points = result.awards[key as keyof SmugglerAwards];
      return `${label}${key === 'time' ? ` (${result.seconds}s x ${SMUGGLER_TIME_RATE})` : ''} ${points > 0 ? '+' : ''}${points}`;
    }).join('\n');
}
