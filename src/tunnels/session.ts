/** Browser adapter: turns simulation events into effects and application transitions. */
import type { RunState } from '../arcade';
import type { SoundBank } from '../sound';
import { nextTunnel, tunnelDamage } from './rules';
import { TunnelSimulation } from './simulation';
import { TunnelView } from './view';
interface Hooks { notice(text: string): void; persist(): void; record(): void; next(): void; gameOver(): void; clearInput(): void; hit(): void }
export class TunnelSession {
  readonly simulation: TunnelSimulation;
  readonly view: TunnelView;
  private saveDelay = 2;
  constructor(readonly run: RunState, private sound: SoundBank, private hooks: Hooks) {
    this.simulation = new TunnelSimulation(run); this.view = new TunnelView(this.simulation, () => this.sound.shatter()); this.view.update(0);
  }
  step(dt: number, horizontal: number, fire: boolean, laneStep = 0): void {
    const paid = this.simulation.state.paid;
    this.simulation.step(dt, horizontal, fire, laneStep); this.flush(dt);
    if (!paid && this.simulation.state.paid) this.hooks.record();
    if (nextTunnel(this.run)) { this.hooks.next(); return; }
    this.saveDelay -= dt;
    if (this.saveDelay <= 0) { this.saveDelay = 2; this.hooks.persist(); }
  }
  blast(): void { if (!this.simulation.combat.blast()) this.hooks.notice(`BLAST ${this.run.charge}%`); this.flush(0); }
  private flush(dt: number): void {
    const events = this.simulation.drain(); this.view.update(dt, events);
    for (const event of events) switch (event.type) {
      case 'notice': this.hooks.notice(event.text); break;
      case 'cue': this.sound.cue(event.cue); break;
      case 'fire': this.sound.enemyShoot(event.voice, 150); break;
      case 'shoot': this.sound.shoot(event.family); break;
      case 'explosion': this.sound.explosion(event.entity.depth); break;
      case 'blast': this.sound.blast(); break;
      case 'ready': this.sound.recharged(99, 100); break;
      case 'hit': this.sound.intercept(); this.hooks.hit(); break;
      case 'damage': {
        this.sound.damage(); this.hooks.notice(!this.run.skiff.health ? 'SHIP LOST' : this.run.skiff.shield > 0 ? 'SHIELD HIT' : 'SHIELDS DOWN - NEXT HIT LOSES A LIFE');
        const layer = document.querySelector<HTMLElement>('#damageLayer')!;
        layer.classList.remove('active'); void layer.offsetWidth; layer.classList.add('active'); break;
      }
      case 'life': this.hooks.clearInput(); this.sound.explosion(0); this.hooks.record(); break;
      case 'gameover': this.sound.gameOver(); this.hooks.record(); this.hooks.gameOver(); break;
      case 'clear': this.sound.complete(); this.hooks.notice('ASSAULT CLEARED - COLLECT CARGO'); this.hooks.clearInput(); break;
      case 'collapse': this.sound.warp(); this.hooks.notice('TUNNEL CLEARED'); this.hooks.clearInput(); break;
      case 'detonate': this.sound.explosion(); this.sound.blast(); break;
      case 'next': break;
    }
  }
  forceDeath(): void {
    const s = this.simulation.state; s.respawn = 0; s.protection = 0; s.hitGrace = 0;
    this.run.skiff = { health: 1, shield: 0, damage: 0 }; tunnelDamage(this.simulation.ctx, 'gun'); this.flush(0);
  }
  dispose(): void { this.view.dispose(); }
}
