import { newRun } from '../arcade';
import { TunnelSimulation } from './simulation';
export function tunnelFixture(level = 1, seed = 412) {
  const run = newRun('tunnels', seed); run.stage = level; run.phase = 'playing';
  const sim = new TunnelSimulation(run);
  return { run, sim, s: sim.state, ctx: sim.ctx, combat: sim.combat };
}
export function advanceTunnel(sim: TunnelSimulation, seconds: number, fire = false): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.step(1 / 60, 0, fire);
}
