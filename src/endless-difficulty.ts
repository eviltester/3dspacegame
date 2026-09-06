// Attack Challenge difficulty tuning.
// Tune pressure here; encounter composition and physical ship models live elsewhere.
export const ENEMY_ATTACK_WARNING = 0.8;

export function endlessDifficulty(wave: number) {
  const n = Number.isFinite(wave) ? Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(wave))) : 1;
  // Logarithmic growth keeps huge wave selections cheap without flattening the whole encounter.
  const pressure = Math.log2(1 + (n - 1) / 5);
  // Counts grow with pressure; speeds/cooldowns approach bounded limits. This keeps
  // wave 1000 harder without requiring impossible reactions or enormous allocations.
  return {
    pressure,
    flights: 2 + Math.floor(pressure * 1.5),
    fighters: Math.min(14, 2 + Math.floor(pressure * 2.5)),
    escortFlights: Math.floor(pressure),
    flightInterval: 2 + 10 / (1 + pressure * 0.5),
    clearInterval: 0.6 + 4.4 / (1 + pressure * 0.65),
    recovery: 1.5 + 6.5 / (1 + pressure * 0.55),
    movementScale: 1 + 1.1 * pressure / (pressure + 4),
    cooldownScale: 0.2 + 0.8 / (1 + pressure * 0.65),
    leadBonus: 0.25 * pressure / (pressure + 3),
    fighterShots: n >= 75 ? 3 : 1,
    heavyShots: n >= 150 ? 5 : 3,
    carrierInterval: 2 + 7 / (1 + pressure * 0.35),
    carrierLaunches: 6 + Math.floor(pressure * 1.5)
  };
}
