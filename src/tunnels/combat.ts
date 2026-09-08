/** Lane projectiles retain independent IDs and outcomes, including Spread pellets. */
import { rewardKill } from '../arcade';
import { weaponSpec } from '../weapons';
import { laneSweep } from './collision';
import { isPirate, isShip, random, tunnelEncounter } from './encounters';
import { laneDelta, lanePoint, tunnelShape, TUNNEL_DEPTH, wrapLane } from './shapes';
import { splitAsteroid } from './asteroids';
import { dropPickup, provoke, scoreLives, tunnelDamage } from './rules';
import type { TunnelContext, TunnelEntity, TunnelShot } from './types';

export class TunnelCombat {
  constructor(private ctx: TunnelContext, private closed: boolean) {}
  fire(): boolean {
    const { state: s, run } = this.ctx;
    if (s.phase !== 'assault' || s.respawn > 0 || s.fireDelay > 0 || s.shots.length >= 150) return false;
    const spec = weaponSpec(run.family, run.tiers[run.family], 'tunnels'), volley = s.nextId++;
    s.fireDelay = spec.cooldown;
    for (let i = 0; i < spec.count; i++) {
      const lane = wrapLane(Math.round(s.lane) + i - (spec.count - 1) / 2, this.closed);
      s.shots.push({ id: s.nextId++, volley, lane, depth: 0, previousDepth: 0, faction: 'player', target: -1,
        damage: spec.damage, speed: spec.speed, pierce: spec.pierce, family: run.family, hit: false, contacts: [] });
      run.accuracy.shots++;
    }
    this.ctx.events.push({ type: 'shoot', family: run.family }); return true;
  }
  private hitShot(shot: TunnelShot, damage = true): void {
    const { state: s, run } = this.ctx;
    if (!shot.hit) { shot.hit = true; run.accuracy.hits++; }
    if (damage && !s.chargedVolleys.includes(shot.volley)) { s.chargedVolleys.push(shot.volley); run.charge = Math.min(100, run.charge + 5); }
    this.ctx.events.push({ type: 'hit' });
  }
  damage(entity: TunnelEntity, damage: number, player = true): boolean {
    if (entity.hp <= 0 || ['pickup', 'wall', 'pillar'].includes(entity.kind)) return false;
    if (entity.kind === 'core' && this.ctx.state.entities.some(e => e.hp > 0 && e.parent === entity.id)) return false;
    if (player) provoke(this.ctx, entity);
    entity.hp -= damage;
    if (entity.hp <= 0) this.destroy(entity, player);
    return true;
  }
  destroy(entity: TunnelEntity, player: boolean, vaporize = false): void {
    const { state: s, run, events } = this.ctx;
    entity.hp = 0; events.push({ type: 'explosion', entity: { ...entity } });
    if (isPirate(entity)) {
      if (player) {
        const before = run.charge;
        rewardKill(run, entity.kind === 'mine' ? 25 : entity.kind === 'gun' ? 200 : entity.role === 'carrier' ? 500 : 100);
        // Tunnel charge counts damaging volleys, not both the hit and its kill.
        run.charge = before;
      }
      if (isShip(entity)) {
        s.kills++;
        if (!s.earlyCore) { dropPickup(this.ctx, entity, 'weaponCore', true); s.earlyCore = true; }
        else {
          const roll = random(s, true);
          if (roll < 1 / 15) dropPickup(this.ctx, entity, 'shieldCell');
          else if (roll < 1 / 10) dropPickup(this.ctx, entity, 'fullRepair');
          else if (roll < 0.18) dropPickup(this.ctx, entity, 'weaponCore');
          else if (roll < 0.38) dropPickup(this.ctx, entity, random(s, true) < 0.3 ? 'contraband' : 'legalCargo');
        }
      }
    } else if (entity.kind === 'asteroid') {
      if (player) run.pilot.score += (3 - entity.size) * 25;
      if (!vaporize) splitAsteroid(this.ctx, entity, this.closed);
      const roll = random(s, true);
      if (roll < 1 / 15) dropPickup(this.ctx, entity, 'shieldCell');
      else if (roll < 1 / 10) dropPickup(this.ctx, entity, 'fullRepair');
      events.push({ type: 'cue', cue: 'fracture' });
    } else if (entity.kind === 'crate') {
      if (random(s, true) < 0.2) dropPickup(this.ctx, entity, (['legalCargo', 'rareMineral', 'credits', 'rescuePod'] as const)[Math.floor(random(s, true) * 4)]);
    } else if (player) run.pilot.score = Math.max(0, run.pilot.score - 150);
    scoreLives(this.ctx);
  }
  step(dt: number): void {
    const { state: s, run } = this.ctx;
    for (const shot of s.shots) {
      shot.previousLane = shot.lane; shot.previousDepth = shot.depth; shot.depth += shot.speed * dt;
      if (shot.originLane !== undefined && shot.aimLane !== undefined && shot.originDepth !== undefined) {
        const travel = Math.max(0, Math.min(1, 1 - shot.depth / Math.max(1, shot.originDepth)));
        shot.lane = wrapLane(shot.originLane + laneDelta(shot.originLane, shot.aimLane, this.closed) * travel, this.closed);
      }
    }
    for (const shot of s.shots) {
      if (shot.pierce <= 0) continue;
      if (shot.faction === 'player') {
        // Resolve contacts in travel order, so an obstacle cannot be shot through.
        const contacts: Array<{ t: number; entity?: TunnelEntity; bolt?: TunnelShot }> = [];
        for (const entity of s.entities) {
          if (entity.hp <= 0 || entity.depth < 0 || entity.kind === 'pickup' || shot.contacts.includes(entity.id) || entity.extension < 0.15) continue;
          const t = laneSweep(shot.lane, shot.lane, shot.previousDepth, shot.depth, entity.previousLane, entity.lane, entity.previousDepth, entity.depth, this.closed);
          if (t !== null) contacts.push({ t, entity });
        }
        for (const bolt of s.shots) if (bolt.faction !== 'player' && bolt.target === -1 && bolt.pierce > 0) {
          const t = laneSweep(shot.lane, shot.lane, shot.previousDepth, shot.depth, bolt.previousLane ?? bolt.lane, bolt.lane, bolt.previousDepth, bolt.depth, this.closed, 0.45, 5);
          if (t !== null) contacts.push({ t, bolt });
        }
        for (const contact of contacts.sort((a, b) => a.t - b.t)) {
          if (shot.pierce <= 0) break;
          if (contact.bolt) {
            if (contact.bolt.pierce <= 0) continue;
            contact.bolt.pierce = 0; shot.pierce--; this.hitShot(shot, false); run.charge = Math.min(100, run.charge + 10); run.pilot.score += 10; scoreLives(this.ctx);
          } else if (contact.entity) {
            const e = contact.entity; if (e.hp <= 0) continue;
            shot.contacts.push(e.id); shot.pierce--;
            if (this.damage(e, shot.damage) && !['police', 'trader'].includes(e.faction)) this.hitShot(shot);
            if (['pillar', 'wall', 'core'].includes(e.kind) && e.hp > 0) shot.pierce = 0;
          }
        }
      } else if (shot.target === -1) {
        if (laneSweep(s.previousLane, s.lane, 0, 0, shot.previousLane ?? shot.lane, shot.lane, shot.previousDepth, shot.depth, this.closed) !== null) {
          tunnelDamage(this.ctx, 'gun'); shot.pierce = 0;
        }
      } else {
        const target = s.entities.find(e => e.id === shot.target && e.hp > 0 && e.depth >= 0);
        if (target && laneSweep(shot.lane, shot.lane, shot.previousDepth, shot.depth, target.previousLane, target.lane, target.previousDepth, target.depth, this.closed) !== null) {
          this.damage(target, shot.damage, false); shot.pierce = 0;
        }
      }
      if (s.respawn > 0 || run.lives <= 0) break;
    }
    const expired = s.shots.filter(shot => shot.pierce <= 0 || shot.depth > TUNNEL_DEPTH + 30 || shot.depth < -30);
    for (const shot of expired) if (shot.faction === 'player' && !shot.hit) run.accuracy.misses++;
    s.shots = s.shots.filter(shot => !expired.includes(shot));
    s.chargedVolleys = s.chargedVolleys.filter(id => s.shots.some(shot => shot.volley === id));
  }
  blast(): boolean {
    const { state: s, run } = this.ctx;
    if (s.phase !== 'assault' || s.respawn > 0 || run.charge < 100) return false;
    run.charge = 0;
    const shape = tunnelShape(s.level), origin = lanePoint(shape, s.lane, 0);
    const nearby = (lane: number, depth: number) => {
      const point = lanePoint(shape, lane, depth);
      return Math.hypot(...point.map((value, i) => value - origin[i])) <= 240;
    };
    for (const shot of s.shots) if (shot.faction !== 'player' && shot.target === -1 && nearby(shot.lane, shot.depth)) shot.pierce = 0;
    for (const e of [...s.entities]) if (e.hp > 0 && nearby(e.lane, e.depth)) {
      if (isPirate(e)) this.damage(e, 120);
      else if (e.kind === 'asteroid') this.destroy(e, true, true);
    }
    this.ctx.events.push({ type: 'blast' }); return true;
  }
  hostileShot(entity: TunnelEntity): void {
    const s = this.ctx.state;
    if (s.shots.length >= 160) return;
    const target = s.entities.find(e => e.id === entity.targetId && e.hp > 0);
    const direction = entity.targetId === -1 || !target ? -1 : Math.sign(target.depth - entity.depth) || -1;
    const lanes = entity.role === 'gunship' && entity.targetId === -1 ? [-1, 0, 1] : [0];
    if (s.shots.length + lanes.length > 160) return;
    for (const offset of lanes) {
      const aimLane = wrapLane(entity.targetLane + offset, this.closed);
      const normalSpeed = 120 * tunnelEncounter(s.level).shotSpeed;
      // Close-range fire travels visibly around the inner edge. Using the normal
      // depth speed here would turn cross-lane shots into almost instant hits.
      const flightTime = 0.4 + Math.abs(laneDelta(entity.lane, aimLane, this.closed)) * 0.05;
      const speed = entity.rim && entity.targetId === -1 ? Math.min(normalSpeed, entity.depth / flightTime) : normalSpeed;
      s.shots.push({ id: s.nextId++, volley: 0, lane: entity.lane,
        depth: entity.depth, previousDepth: entity.depth, faction: entity.faction, target: entity.targetId,
        ...(entity.targetId === -1 ? { originLane: entity.lane, originDepth: entity.depth, aimLane } : {}),
        damage: 24, speed: direction * speed, pierce: 1, family: 'pulse', hit: false, contacts: [] });
    }
    if (entity.policeEntry) entity.policeEntry = false;
    this.ctx.events.push({ type: 'fire', voice: entity.kind === 'gun' ? 'carrierTurret' : entity.faction === 'police' ? 'police' : entity.faction === 'trader' ? 'trader' : entity.role === 'raider' ? 'pirate' : entity.role });
  }
}
