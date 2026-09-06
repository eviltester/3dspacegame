/**
 * Automated mouse pilot: reads state to aim, then sends real mouse input.
 * Only time is accelerated. It must earn kills, survive damage and cross gates
 * through the same gameplay as a player; GameDriver.finish/gate are not used here.
 */
import { Euler, Quaternion, Vector3 } from 'three';
import { expect } from './game';
import type { GameDriver } from './game';

export class MousePilot {
  private held = false;
  constructor(readonly game: GameDriver) {}
  async fire(value: boolean): Promise<void> {
    if (value === this.held) return;
    this.held = value;
    if (value) await this.game.page.mouse.down(); else await this.game.page.mouse.up();
  }
  async throttle(current: number, target: number): Promise<void> {
    const steps = Math.round((target - current) / 15);
    for (let i = 0; i < Math.abs(steps); i++) await this.game.page.mouse.wheel(0, steps > 0 ? -100 : 100);
  }
  async combatStep(): Promise<void> {
    const s = await this.game.state();
    const position = new Vector3().fromArray(s.position), inverse = new Quaternion().fromArray(s.orientation).invert();
    const candidates = s.actors.filter(a => ['pirate', 'part', 'mine'].includes(a.kind));
    const parts = candidates.filter(a => a.kind === 'part');
    const choices = parts.length ? parts : candidates;
    choices.sort((a, b) => position.distanceToSquared(new Vector3().fromArray(a.position)) - position.distanceToSquared(new Vector3().fromArray(b.position)));
    const target = s.phase === 'cleared' ? s.actors.find(a => a.kind === 'gate' && a.visible) : choices[0]
      ?? (s.stageKind === 'rescue' ? s.actors.find(a => a.kind === 'cargo' && a.essential && a.drop === 'rescuePod') ?? s.actors.find(a => a.kind === 'base') : undefined);
    const hostile = !!target && ['pirate', 'part', 'mine'].includes(target.kind);
    await this.fire(hostile);
    if (s.charge! >= 100 && s.phase === 'playing') {
      await this.game.page.mouse.down({ button: 'right' }); await this.game.page.mouse.up({ button: 'right' });
    }
    if (target) {
      const point = new Vector3().fromArray(target.position), distance = point.distanceTo(position);
      if (hostile) point.addScaledVector(new Vector3().fromArray(target.velocity), Math.min(0.8, distance / 440));
      const local = point.sub(position).applyQuaternion(inverse);
      // Aim in the ship's current local frame and convert angles to mouse deltas
      // using the same sensitivity as input.ts. Bound turns to normal-sized steps.
      const yaw = Math.atan2(local.x, -local.z), pitch = -Math.atan2(local.y, Math.hypot(local.x, local.z));
      const clamp = (n: number) => Math.max(-220, Math.min(220, n));
      if (s.stageKind === 'armada' && s.phase === 'playing') await this.game.move(clamp(local.x / 0.22), 0);
      else {
        await this.game.move(clamp(yaw / 0.0022), clamp(pitch / 0.0022));
        await this.throttle(s.throttle, Math.abs(yaw) < 0.22 ? hostile ? distance > 300 ? 65 : distance < 110 ? 0 : 20 : distance < 25 ? 20 : 95 : 0);
      }
    } else await this.throttle(s.throttle, 0);
    await this.game.step(0.14);
  }
  async aimMarker(position: number[]): Promise<void> {
    const state = await this.game.state(), [x, y, z] = position;
    const angles = new Euler().setFromQuaternion(new Quaternion().fromArray(state.view.orientation), 'YXZ');
    await this.game.move((angles.y - Math.atan2(-x, -z)) / 0.0022,
      (angles.x - Math.atan2(y, Math.hypot(x, z))) / 0.0022);
    await this.game.step(1 / 60);
  }
  async dodge(offset: number[], current: number[]): Promise<void> {
    await this.game.move((offset[0] - current[0]) / 0.13, -(offset[1] - current[1]) / 0.13);
  }
  async targetSequence(): Promise<void> {
    const count = (await this.game.state()).bonus!.targetCount;
    for (let number = 1; number <= count; number++) {
      for (let attempt = 0; attempt < 5; attempt++) {
        await this.game.step(0.2); const state = await this.game.state();
        expect(state.bonus, `bonus ended before marker ${number}`).toBeTruthy();
        await this.aimMarker(state.bonusSequence!.targets.find(t => t.number === number)!.position);
        await this.fire(true); await this.game.step(1 / 60); await this.fire(false);
        const hit = await this.game.state();
        if (!hit.bonus || hit.bonus.nextMarker === number + 1) break;
      }
      const state = await this.game.state();
      if (number === count) expect(state.menu).toBe('bonusResult');
      else { expect(state.bonus?.nextMarker).toBe(number + 1); expect(state.bonus?.points).toBe(number * 100 - state.bonus!.shotsFired * 5); }
    }
  }
  async asteroidRun(): Promise<number> {
    let peak = 0;
    for (let frame = 0; frame < 1500; frame++) {
      const s = await this.game.asteroidFlight(); if (!s.bonus) break;
      const t = Math.min(1, (s.bonus.elapsed + 0.05) / s.bonus.duration), row = Math.min(55, (0.6 * t + 0.4 * t * t) * 58);
      await this.dodge([Math.sin(row * 0.85) * 20, Math.sin(row * 0.6) * 9], s.view.position);
      peak = Math.max(peak, s.flight!.speed); await this.game.step(0.05);
    }
    return peak;
  }
  async canyonRun(): Promise<{ peak: number; fired: number; passed: number }> {
    await this.game.page.mouse.down({ button: 'middle' }); await this.game.page.mouse.up({ button: 'middle' }); await this.fire(true);
    let peak = 0, fired = 0, passed = 0;
    for (let frame = 0; frame < 1000; frame++) {
      const s = await this.game.canyonFlight(); if (!s.course) break;
      const course = s.course, gate = course.gates.find(g => !g.resolved)!;
      peak = Math.max(peak, course.speed); fired = Math.max(fired, course.fired); passed = Math.max(passed, course.passed);
      const sway = s.view.position[2] - gate.position[2] > 90 ? 7 : Math.min(1.8, gate.radius * 0.2);
      await this.dodge([Math.max(-22, Math.min(22, gate.offset[0] + Math.sin(s.bonus!.elapsed * 2.8) * sway)),
        Math.max(-16, Math.min(16, gate.offset[1] + Math.cos(s.bonus!.elapsed * 2.8) * sway))], course.offset);
      if (s.bonus!.charge >= 100 && course.shots.some(b => new Vector3().fromArray(b.position).distanceTo(new Vector3().fromArray(s.view.position)) < 120)) {
        await this.game.page.mouse.down({ button: 'right' }); await this.game.page.mouse.up({ button: 'right' });
      }
      if (frame % 12 === 0) await this.game.page.mouse.wheel(0, -100);
      await this.game.step(0.1);
    }
    await this.fire(false); return { peak, fired, passed };
  }
}
