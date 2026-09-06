import * as THREE from 'three';
import './style.css';
import {
  CARGO_VALUES,
  CargoDrop,
  CargoType,
  EntityKind,
  Faction,
  Mission,
  PlayerProgress,
  PlayerSave,
  SAVE_KEY,
  Sector,
  TradeZone,
  applyCargoPickup,
  attackFaction,
  completeMission,
  coolWantedAfterWarp,
  createInitialProgress,
  createInitialSave,
  createMission,
  discoverSector,
  getSector,
  instantTrade,
  markPoliceArrived,
  nextSectorId,
  policeDispatchDue,
  progressToSave,
  resolveContrabandScan,
  tickWanted,
  wantedAppliesInSector
} from './logic';

declare global {
  interface Window {
    vectorShooterDebug?: {
      getState: () => DebugState;
      grantCargo: (type: CargoType, amount?: number) => void;
      triggerTraderAttack: () => void;
      hitNearestPirate: () => void;
      triggerWarp: () => void;
      ramNearestPlanet: () => void;
      spawnIncomingBolt: () => void;
      forceNpcCrossfire: () => void;
      forceNpcPickup: (kind: ShipKind, type: CargoType) => boolean;
      forcePirateHit: () => void;
      forcePlayerDeath: () => void;
      completeActiveMission: () => void;
      lookByMouse: (movementX: number, movementY: number) => void;
    };
  }
}

interface DebugState {
  sector: string;
  entityCount: number;
  wanted: boolean;
  wantedHere: boolean;
  wantedSector: string | null;
  wantedReason: string | null;
  policeCount: number;
  credits: number;
  weaponLevel: number;
  weaponMode: string;
  mission: string;
  pitch: number;
  nearestPlanetDistance: number | null;
  playerShots: number;
  hostileShots: number;
  shotInterceptions: number;
  shield: number;
  hull: number;
  hitCallout: string;
  briefingTitle: string;
  briefingCount: string;
  missionBriefTitle: string;
  missionBriefObjective: string;
  messageLog: string;
  warpCueFlashing: boolean;
  deathTimer: string;
  npcShipHits: number;
  npcCargoPickups: number;
  cargoCount: number;
}

type ShipKind = 'pirate' | 'trader' | 'police';
type MissionRole = 'rescue' | 'courier' | 'smuggling' | 'ambush';

interface BriefingItem {
  title: string;
  description: string;
  create: () => THREE.Object3D;
  scale: number;
  cameraZ: number;
}

interface WorldEntity {
  id: string;
  kind: EntityKind;
  faction: Faction;
  object: THREE.Object3D;
  radius: number;
  hull: number;
  maxHull: number;
  velocity: THREE.Vector3;
  fireCooldown: number;
  scanCooldown: number;
  provoked: boolean;
  defenseTargetId: string | null;
  missionTarget: boolean;
  missionRole: MissionRole | null;
  cargoDrop: CargoDrop | null;
  waypoint: THREE.Vector3;
  pulse: number;
  label: string;
}

interface Projectile {
  id: string;
  object: THREE.Object3D;
  faction: Faction;
  sourceEntityId: string | null;
  targetFaction: Faction | null;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  ttl: number;
  damage: number;
  radius: number;
  spin: number;
}

interface CombatTarget {
  kind: 'player' | 'entity';
  faction: Faction;
  entity: WorldEntity | null;
  position: THREE.Vector3;
  radius: number;
}

interface MissionBrief {
  title: string;
  objective: string;
  caution: string;
}

interface WeaponSpec {
  mode: string;
  color: number;
  speed: number;
  damage: number;
  cooldown: number;
  spreadCount: number;
  spreadAngle: number;
  radius: number;
  length: number;
  ttl: number;
}

interface Explosion {
  object: THREE.Group;
  parts: THREE.LineSegments[];
  velocities: THREE.Vector3[];
  life: number;
  maxLife: number;
}

interface FloatingMessage {
  text: string;
  ttl: number;
}

interface Keys {
  forward: boolean;
  brake: boolean;
  rollLeft: boolean;
  rollRight: boolean;
  boost: boolean;
}

const COLORS = {
  pirate: 0xff3048,
  trader: 0x24ff7a,
  police: 0x72c8ff,
  policeAccent: 0xe8fbff,
  cargo: 0xffd766,
  mineral: 0xfff0a0,
  contraband: 0xff3df2,
  gate: 0x8dd9ff,
  base: 0x34f5c5,
  planet: 0x87ffb8,
  hud: '#46ffbd',
  warning: '#ff4d61',
  amber: '#ffd15c'
};

const SAFE_TRADE_RADIUS = 95;
const BLACK_MARKET_RADIUS = 70;
const GATE_RADIUS = 28;
const PICKUP_RADIUS = 9;
const SOLID_COLLISION_RADII: Partial<Record<EntityKind, number>> = {
  planet: 58,
  base: 32,
  blackMarket: 18
};
const ENEMY_FIRE_RANGE = 310;
const TRADER_FIRE_RANGE = 260;
const PIRATE_TARGET_RANGE = 760;
const POLICE_TARGET_RANGE = 920;
const TRADER_TARGET_RANGE = 360;
const SHIP_PICKUP_RANGE = 250;
const RADAR_RANGE = 720;
const PLAYER_RADIUS = 4;
const SAVE_INTERVAL_SECONDS = 3;
const BRIEFING_SCAN_SECONDS = 5;
const WARP_CUE_COLOR = 0xffd15c;

const WEAPON_SPECS: Record<number, WeaponSpec> = {
  1: {
    mode: 'PULSE',
    color: 0xf8ffee,
    speed: 320,
    damage: 32,
    cooldown: 0.3,
    spreadCount: 1,
    spreadAngle: 0,
    radius: 5.8,
    length: 20,
    ttl: 1.65
  },
  2: {
    mode: 'TWIN',
    color: 0x9dfffb,
    speed: 335,
    damage: 34,
    cooldown: 0.26,
    spreadCount: 2,
    spreadAngle: 0.022,
    radius: 5.5,
    length: 22,
    ttl: 1.7
  },
  3: {
    mode: 'LANCE',
    color: 0xffef77,
    speed: 380,
    damage: 46,
    cooldown: 0.28,
    spreadCount: 1,
    spreadAngle: 0,
    radius: 7,
    length: 32,
    ttl: 1.85
  },
  4: {
    mode: 'FORK',
    color: 0xff73ff,
    speed: 355,
    damage: 40,
    cooldown: 0.22,
    spreadCount: 3,
    spreadAngle: 0.026,
    radius: 6.4,
    length: 24,
    ttl: 1.75
  },
  5: {
    mode: 'NOVA',
    color: 0xff9a42,
    speed: 365,
    damage: 48,
    cooldown: 0.19,
    spreadCount: 3,
    spreadAngle: 0.03,
    radius: 8,
    length: 30,
    ttl: 1.95
  }
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('App root not found');
}

app.innerHTML = `
  <main class="game-shell">
    <div id="viewport" class="viewport"></div>
    <div class="hud" aria-live="polite">
      <section class="hud-panel sector-panel">
        <div class="hud-label">SECTOR</div>
        <div id="sectorName" class="hud-value">LYRA DRIFT</div>
        <div id="reputation" class="hud-small">CLEAR</div>
      </section>
      <section class="hud-panel mission-panel">
        <div class="hud-label">MISSION</div>
        <div id="missionTitle" class="hud-value">BOUNTY</div>
        <div id="missionProgress" class="hud-small">0 / 1</div>
      </section>
      <section class="hud-panel cargo-panel">
        <div class="hud-label">CARGO</div>
        <div id="cargoReadout" class="hud-value">EMPTY</div>
        <div id="creditReadout" class="hud-small">CR 0</div>
      </section>
      <canvas id="radar" class="radar" width="180" height="180" aria-label="Radar"></canvas>
      <div class="reticle" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>
      <div class="bottom-strip">
        <div>
          <span class="hud-label">HULL</span>
          <strong id="hullReadout">100</strong>
        </div>
        <div>
          <span class="hud-label">SHIELD</span>
          <strong id="shieldReadout">100</strong>
        </div>
        <div>
          <span class="hud-label">WEAPON</span>
          <strong id="weaponReadout">1</strong>
        </div>
        <div>
          <span class="hud-label">THROTTLE</span>
          <strong id="speedReadout">0</strong>
        </div>
      </div>
      <div id="wantedBanner" class="wanted-banner">WANTED</div>
      <div id="hitCallout" class="hit-callout"></div>
      <div id="messageLog" class="message-log"></div>
    </div>
    <div id="warpLayer" class="warp-layer" aria-hidden="true"></div>
    <div id="damageLayer" class="damage-layer" aria-hidden="true"></div>
    <div id="launchOverlay" class="launch-overlay">
      <div class="briefing">
        <section class="briefing-hero">
          <div>
            <p id="briefingStatus" class="briefing-status">PILOT BRIEFING</p>
            <h1 id="launchTitle">VECTOR SHOOTER</h1>
          </div>
          <div class="mission-briefing" aria-label="Mission briefing">
            <p class="briefing-status">MISSION BRIEFING</p>
            <h2 id="missionBriefTitle">BOUNTY: RED RAIDER ACE</h2>
            <p id="missionBriefObjective">Destroy the marked red pirate ace, then scoop any cargo it drops.</p>
            <p id="missionBriefCaution">Pirates are lawful targets. Do not shoot police or peaceful traders.</p>
            <p id="missionBriefReward">REWARD CR 460</p>
          </div>
          <button id="launchButton" type="button">PLAY GAME</button>
          <div id="deathCountdown" class="death-countdown hidden">
            <span>RETURNING TO START SCREEN IN</span>
            <strong id="deathTimer">10</strong>
          </div>
        </section>
        <section class="controls-card" aria-label="Controls">
          <h2>CONTROLS</h2>
          <dl class="control-grid">
            <div><dt>MOUSE</dt><dd>Steer ship</dd></div>
            <div><dt>LEFT CLICK</dt><dd>Fire weapon</dd></div>
            <div><dt>W / UP</dt><dd>Accelerate</dd></div>
            <div><dt>S / DOWN</dt><dd>Decelerate</dd></div>
            <div><dt>A / D</dt><dd>Roll</dd></div>
            <div><dt>LEFT / RIGHT</dt><dd>Browse object scan</dd></div>
            <div><dt>SHIFT</dt><dd>Boost</dd></div>
            <div><dt>ESC</dt><dd>Release mouse</dd></div>
          </dl>
        </section>
        <section class="model-card" aria-label="Game objects">
          <div id="modelPreview" class="model-preview"></div>
          <div class="model-copy">
            <div class="model-kicker">
              <p class="briefing-status">OBJECT SCAN</p>
              <p id="modelCount" class="model-count">1/1</p>
            </div>
            <h2 id="modelTitle">RED PIRATE</h2>
            <p id="modelDescription">Bad guys carrying stolen goods. They will shoot you.</p>
          </div>
        </section>
      </div>
    </div>
  </main>
`;

const viewport = document.querySelector<HTMLDivElement>('#viewport')!;
const launchOverlay = document.querySelector<HTMLDivElement>('#launchOverlay')!;
const gameShell = document.querySelector<HTMLElement>('.game-shell')!;
const launchTitle = document.querySelector<HTMLHeadingElement>('#launchTitle')!;
const briefingStatus = document.querySelector<HTMLParagraphElement>('#briefingStatus')!;
const launchButton = document.querySelector<HTMLButtonElement>('#launchButton')!;
const deathCountdown = document.querySelector<HTMLDivElement>('#deathCountdown')!;
const deathTimer = document.querySelector<HTMLElement>('#deathTimer')!;
const missionBriefTitle = document.querySelector<HTMLHeadingElement>('#missionBriefTitle')!;
const missionBriefObjective = document.querySelector<HTMLParagraphElement>('#missionBriefObjective')!;
const missionBriefCaution = document.querySelector<HTMLParagraphElement>('#missionBriefCaution')!;
const missionBriefReward = document.querySelector<HTMLParagraphElement>('#missionBriefReward')!;
const modelPreview = document.querySelector<HTMLDivElement>('#modelPreview')!;
const modelTitle = document.querySelector<HTMLHeadingElement>('#modelTitle')!;
const modelDescription = document.querySelector<HTMLParagraphElement>('#modelDescription')!;
const modelCount = document.querySelector<HTMLParagraphElement>('#modelCount')!;
const radar = document.querySelector<HTMLCanvasElement>('#radar')!;
const radarContext = radar.getContext('2d')!;
const warpLayer = document.querySelector<HTMLDivElement>('#warpLayer')!;
const sectorName = document.querySelector<HTMLDivElement>('#sectorName')!;
const reputation = document.querySelector<HTMLDivElement>('#reputation')!;
const missionTitle = document.querySelector<HTMLDivElement>('#missionTitle')!;
const missionProgress = document.querySelector<HTMLDivElement>('#missionProgress')!;
const cargoReadout = document.querySelector<HTMLDivElement>('#cargoReadout')!;
const creditReadout = document.querySelector<HTMLDivElement>('#creditReadout')!;
const hullReadout = document.querySelector<HTMLSpanElement>('#hullReadout')!;
const shieldReadout = document.querySelector<HTMLSpanElement>('#shieldReadout')!;
const weaponReadout = document.querySelector<HTMLSpanElement>('#weaponReadout')!;
const speedReadout = document.querySelector<HTMLSpanElement>('#speedReadout')!;
const wantedBanner = document.querySelector<HTMLDivElement>('#wantedBanner')!;
const hitCallout = document.querySelector<HTMLDivElement>('#hitCallout')!;
const messageLog = document.querySelector<HTMLDivElement>('#messageLog')!;
const damageLayer = document.querySelector<HTMLDivElement>('#damageLayer')!;

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0xffffffff;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(items: T[]): T {
    return items[Math.floor(this.next() * items.length)] ?? items[0];
  }
}

class SoundBank {
  private context: AudioContext | null = null;

  async start(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
    }
    if (this.context.state !== 'running') {
      await this.context.resume();
    }
  }

  shoot(): void {
    this.tone(580, 0.055, 'square', 0.045, 110);
  }

  enemyShoot(): void {
    this.tone(270, 0.07, 'sawtooth', 0.03, -80);
  }

  pickup(): void {
    this.tone(760, 0.09, 'triangle', 0.05, 240);
  }

  explosion(): void {
    this.tone(90, 0.18, 'sawtooth', 0.08, -40);
  }

  warning(): void {
    this.tone(140, 0.16, 'square', 0.07, 0);
  }

  damage(): void {
    this.tone(82, 0.22, 'sawtooth', 0.09, -28);
    this.tone(620, 0.11, 'square', 0.05, -260);
  }

  warp(): void {
    this.tone(180, 0.65, 'sawtooth', 0.08, 640);
  }

  private tone(frequency: number, duration: number, type: OscillatorType, gainValue: number, sweep: number): void {
    if (!this.context || this.context.state !== 'running') {
      return;
    }

    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.linearRampToValueAtTime(Math.max(20, frequency + sweep), now + duration);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function formatCredits(value: number): string {
  return `CR ${Math.floor(value).toLocaleString('en-US')}`;
}

function lineShape(
  vertices: Array<[number, number, number]>,
  edges: Array<[number, number]>,
  color: number,
  opacity = 0.94
): THREE.LineSegments {
  const positions: number[] = [];
  for (const [start, end] of edges) {
    positions.push(...vertices[start], ...vertices[end]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity
    })
  );
}

function edgesFromGeometry(geometry: THREE.BufferGeometry, color: number, opacity = 0.9): THREE.LineSegments {
  const edgeGeometry = new THREE.EdgesGeometry(geometry, 16);
  geometry.dispose();
  return new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity
    })
  );
}

function createPirateModel(): THREE.Group {
  const group = new THREE.Group();
  group.add(
    lineShape(
      [
        [0, 0, -7],
        [-3.8, -0.35, 2.5],
        [3.8, -0.35, 2.5],
        [0, 1.6, 0.8],
        [0, -1.2, 2.2],
        [-5.3, 0.05, 0.2],
        [5.3, 0.05, 0.2],
        [0, 0.05, 4.6]
      ],
      [
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [1, 3],
        [2, 3],
        [1, 4],
        [2, 4],
        [1, 7],
        [2, 7],
        [4, 7],
        [5, 1],
        [6, 2],
        [5, 7],
        [6, 7],
        [5, 0],
        [6, 0]
      ],
      COLORS.pirate
    )
  );
  const engine = edgesFromGeometry(new THREE.BoxGeometry(2.4, 0.8, 1.4), 0xff7a8a, 0.7);
  engine.position.z = 4.5;
  group.add(engine);
  return group;
}

function createTraderHaulerModel(): THREE.Group {
  const group = new THREE.Group();
  const body = edgesFromGeometry(new THREE.BoxGeometry(5.8, 2.4, 8), COLORS.trader);
  group.add(body);

  const leftPod = edgesFromGeometry(new THREE.BoxGeometry(1.2, 1.2, 6.5), COLORS.trader, 0.72);
  leftPod.position.x = -4;
  group.add(leftPod);

  const rightPod = leftPod.clone();
  rightPod.position.x = 4;
  group.add(rightPod);

  const nose = edgesFromGeometry(new THREE.ConeGeometry(2.7, 3.4, 4), 0xa2ffd4, 0.8);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -5.6;
  group.add(nose);
  return group;
}

function createTraderUfoModel(): THREE.Group {
  const group = new THREE.Group();
  const saucer = edgesFromGeometry(new THREE.CylinderGeometry(5.2, 5.8, 1, 10, 1), COLORS.trader);
  saucer.rotation.x = Math.PI / 2;
  group.add(saucer);

  const dome = edgesFromGeometry(new THREE.OctahedronGeometry(2.1, 0), 0xc7ffdf, 0.8);
  dome.position.y = 0.9;
  group.add(dome);

  const keel = edgesFromGeometry(new THREE.BoxGeometry(1.2, 2.2, 2), COLORS.trader, 0.72);
  keel.position.y = -1.1;
  group.add(keel);
  return group;
}

function createPoliceModel(): THREE.Group {
  const group = new THREE.Group();
  group.add(
    lineShape(
      [
        [0, 0, -7.2],
        [-2.6, 0, 3.5],
        [2.6, 0, 3.5],
        [0, 1.2, 1.4],
        [0, -1.2, 1.4],
        [-1.2, 0.55, -1.2],
        [1.2, 0.55, -1.2],
        [-4.2, 0, 1.6],
        [4.2, 0, 1.6]
      ],
      [
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [1, 3],
        [2, 3],
        [1, 4],
        [2, 4],
        [5, 7],
        [5, 0],
        [6, 8],
        [6, 0],
        [7, 1],
        [8, 2]
      ],
      COLORS.police
    )
  );
  const lightBar = edgesFromGeometry(new THREE.BoxGeometry(2.3, 0.4, 0.7), COLORS.policeAccent, 0.88);
  lightBar.position.y = 1.15;
  lightBar.position.z = 0.6;
  group.add(lightBar);
  return group;
}

function createCargoModel(type: CargoType): THREE.Group {
  const group = new THREE.Group();
  const addPickupHalo = (color: number): void => {
    const halo = edgesFromGeometry(new THREE.TorusGeometry(5.2, 0.22, 4, 10), color, 0.92);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
    const bracket = lineShape(
      [
        [-6.4, 0, 0],
        [-4.6, 0, 0],
        [4.6, 0, 0],
        [6.4, 0, 0],
        [0, -6.4, 0],
        [0, -4.6, 0],
        [0, 4.6, 0],
        [0, 6.4, 0]
      ],
      [
        [0, 1],
        [2, 3],
        [4, 5],
        [6, 7]
      ],
      color,
      0.8
    );
    group.add(bracket);
  };

  if (type === 'rareMineral') {
    group.add(edgesFromGeometry(new THREE.OctahedronGeometry(2.7, 0), COLORS.mineral));
    addPickupHalo(COLORS.mineral);
    return group;
  }

  if (type === 'contraband') {
    group.add(edgesFromGeometry(new THREE.DodecahedronGeometry(2.7, 0), COLORS.contraband));
    addPickupHalo(COLORS.contraband);
    return group;
  }

  if (type === 'rescuePod') {
    group.add(edgesFromGeometry(new THREE.CapsuleGeometry(1.5, 2.5, 4, 8), 0xffffff));
    addPickupHalo(0xffffff);
    return group;
  }

  const color = type === 'weaponCore' ? 0xff6b25 : type === 'shieldCell' ? 0x7edcff : COLORS.cargo;
  const crate = edgesFromGeometry(new THREE.BoxGeometry(3.6, 3.6, 3.6), color);
  group.add(crate);
  const diagonal = lineShape(
    [
      [-1.8, -1.8, -1.8],
      [1.8, 1.8, 1.8],
      [-1.8, 1.8, 1.8],
      [1.8, -1.8, -1.8]
    ],
    [
      [0, 1],
      [2, 3]
    ],
    color,
    0.58
  );
  group.add(diagonal);
  addPickupHalo(color);
  return group;
}

function createTextSprite(
  text: string,
  color: string,
  background = 'rgba(0, 0, 0, 0.0)',
  width = 58,
  height = 18
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas text context unavailable');
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = '900 86px Consolas, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = color;
  context.shadowBlur = 18;
  context.fillStyle = color;
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, height, 1);
  return sprite;
}

function setCueMaterial(material: THREE.Material, color: THREE.ColorRepresentation, opacity: number): void {
  if (!(material instanceof THREE.LineBasicMaterial || material instanceof THREE.SpriteMaterial)) {
    return;
  }
  material.color.set(color);
  material.opacity = opacity;
  material.transparent = true;
  material.blending = THREE.AdditiveBlending;
  material.depthWrite = false;
}

function updateWarpCueVisuals(gate: THREE.Object3D, active: boolean, elapsed: number): void {
  const arrow = gate.userData.warpArrow;
  const text = gate.userData.warpText;
  const pulse = active ? (Math.sin(elapsed * 9.2) + 1) / 2 : 0;
  const color = active ? new THREE.Color().setHSL((elapsed * 0.42) % 1, 1, 0.62) : new THREE.Color(WARP_CUE_COLOR);
  const opacity = active ? 0.58 + pulse * 0.42 : 1;
  const scale = active ? 1 + pulse * 0.12 : 1;

  if (arrow instanceof THREE.Object3D) {
    arrow.scale.setScalar(scale);
    arrow.traverse((child) => {
      if (child instanceof THREE.LineSegments && child.material instanceof THREE.Material) {
        setCueMaterial(child.material, color, opacity);
      }
    });
  }

  if (text instanceof THREE.Sprite) {
    const baseScale = text.userData.baseScale;
    if (baseScale instanceof THREE.Vector3) {
      text.scale.copy(baseScale).multiplyScalar(scale);
    }
    if (text.material instanceof THREE.Material) {
      setCueMaterial(text.material, color, opacity);
    }
  }
}

function createGateModel(): THREE.Group {
  const group = new THREE.Group();
  const rotor = new THREE.Group();

  const mouth = edgesFromGeometry(new THREE.TorusGeometry(36, 1.1, 4, 20), COLORS.gate, 0.92);
  rotor.add(mouth);
  const innerGuide = edgesFromGeometry(new THREE.TorusGeometry(GATE_RADIUS, 0.46, 4, 18), 0xc5f1ff, 0.52);
  rotor.add(innerGuide);

  for (let index = 0; index < 4; index += 1) {
    const tunnelRing = edgesFromGeometry(new THREE.TorusGeometry(34 - index * 3.8, 0.42, 4, 18), 0x9de2ff, 0.36 - index * 0.05);
    tunnelRing.position.z = -10 - index * 11;
    rotor.add(tunnelRing);
  }

  for (let index = 0; index < 16; index += 1) {
    const block = edgesFromGeometry(new THREE.BoxGeometry(4.2, 4.2, 3.1), 0x9de2ff, 0.78);
    const angle = (index / 16) * Math.PI * 2;
    block.position.set(Math.cos(angle) * 38, Math.sin(angle) * 38, index % 2 === 0 ? 4 : -4);
    block.rotation.z = angle;
    rotor.add(block);
  }

  for (let index = 0; index < 8; index += 1) {
    const brace = lineShape(
      [
        [0, -4.4, -7],
        [0, 4.4, -7],
        [0, -3.1, 7],
        [0, 3.1, 7]
      ],
      [
        [0, 1],
        [2, 3],
        [0, 2],
        [1, 3]
      ],
      0xc5f1ff,
      0.5
    );
    const angle = (index / 8) * Math.PI * 2;
    brace.position.set(Math.cos(angle) * 32, Math.sin(angle) * 32, -17);
    brace.rotation.z = angle;
    rotor.add(brace);
  }

  const arrow = lineShape(
    [
      [0, -2, 12],
      [-15, 21, 12],
      [-6, 21, 12],
      [-6, 43, 12],
      [6, 43, 12],
      [6, 21, 12],
      [15, 21, 12]
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 0],
      [0, 3],
      [0, 4]
    ],
    WARP_CUE_COLOR,
    1
  );
  group.add(rotor);
  group.add(arrow);

  const warpText = createTextSprite('WARP', '#ffffff', 'rgba(16, 8, 0, 0.32)', 44, 14);
  warpText.position.set(0, 43, 13);
  warpText.userData.baseScale = warpText.scale.clone();
  group.add(warpText);
  group.userData.rotor = rotor;
  group.userData.warpArrow = arrow;
  group.userData.warpText = warpText;
  updateWarpCueVisuals(group, false, 0);
  return group;
}

function createBaseModel(): THREE.Group {
  const group = new THREE.Group();
  group.add(edgesFromGeometry(new THREE.OctahedronGeometry(26, 1), COLORS.base, 0.62));
  const ring = edgesFromGeometry(new THREE.TorusGeometry(36, 0.9, 4, 22), COLORS.base, 0.5);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const safeRing = edgesFromGeometry(new THREE.TorusGeometry(SAFE_TRADE_RADIUS, 0.45, 4, 42), 0xffd15c, 0.34);
  safeRing.rotation.x = Math.PI / 2;
  group.add(safeRing);
  const mast = edgesFromGeometry(new THREE.BoxGeometry(5, 32, 5), 0xa7ffe7, 0.62);
  group.add(mast);
  const dockArm = edgesFromGeometry(new THREE.BoxGeometry(74, 2.2, 2.2), 0xa7ffe7, 0.38);
  group.add(dockArm);
  const crossArm = edgesFromGeometry(new THREE.BoxGeometry(2.2, 2.2, 74), 0xa7ffe7, 0.38);
  group.add(crossArm);
  return group;
}

function createPlanetModel(color: number): THREE.Group {
  const group = new THREE.Group();
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(52, 24, 16),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.055,
      depthWrite: false
    })
  );
  group.add(surface);
  const sphere = edgesFromGeometry(new THREE.SphereGeometry(52, 14, 10), color, 0.26);
  group.add(sphere);
  const horizon = edgesFromGeometry(new THREE.TorusGeometry(56, 0.7, 4, 36), 0xeafff8, 0.38);
  horizon.rotation.y = Math.PI / 2;
  group.add(horizon);
  const band = edgesFromGeometry(new THREE.TorusGeometry(72, 0.8, 4, 32), color, 0.42);
  band.rotation.x = Math.PI / 2.8;
  group.add(band);
  const gravityRing = edgesFromGeometry(new THREE.TorusGeometry(SAFE_TRADE_RADIUS, 0.38, 4, 46), 0xffd15c, 0.25);
  gravityRing.rotation.x = Math.PI / 2;
  group.add(gravityRing);
  return group;
}

function createBlackMarketModel(): THREE.Group {
  const group = new THREE.Group();
  group.add(edgesFromGeometry(new THREE.DodecahedronGeometry(16, 0), COLORS.contraband, 0.52));
  const mast = edgesFromGeometry(new THREE.BoxGeometry(3.4, 32, 3.4), COLORS.contraband, 0.42);
  group.add(mast);
  const exchangeRing = edgesFromGeometry(new THREE.TorusGeometry(BLACK_MARKET_RADIUS, 0.42, 4, 34), COLORS.contraband, 0.28);
  exchangeRing.rotation.x = Math.PI / 2;
  group.add(exchangeRing);
  const dockArm = edgesFromGeometry(new THREE.BoxGeometry(48, 1.8, 1.8), COLORS.contraband, 0.34);
  dockArm.rotation.z = Math.PI / 4;
  group.add(dockArm);
  return group;
}

function createBeaconModel(color: number): THREE.Group {
  const group = new THREE.Group();
  const gem = edgesFromGeometry(new THREE.OctahedronGeometry(5, 0), color, 0.82);
  group.add(gem);
  const halo = edgesFromGeometry(new THREE.TorusGeometry(8, 0.4, 4, 12), color, 0.48);
  group.add(halo);
  return group;
}

function createProjectileModel(color: number): THREE.LineSegments {
  const line = lineShape(
    [
      [0, 0, -2.6],
      [0, 0, 2.6]
    ],
    [[0, 1]],
    color,
    0.96
  );
  const material = materialFromLine(line);
  if (material) {
    tunePulseMaterial(material, 0.96);
  }
  return line;
}

let pulseTexture: THREE.CanvasTexture | null = null;

function createPulseTexture(): THREE.CanvasTexture {
  if (pulseTexture) {
    return pulseTexture;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas pulse context unavailable');
  }

  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.82)');
  gradient.addColorStop(0.28, 'rgba(255, 255, 255, 0.28)');
  gradient.addColorStop(0.58, 'rgba(255, 255, 255, 0.1)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);

  pulseTexture = new THREE.CanvasTexture(canvas);
  pulseTexture.colorSpace = THREE.SRGBColorSpace;
  return pulseTexture;
}

function tunePulseMaterial(material: THREE.Material, baseOpacity: number): void {
  material.transparent = true;
  material.opacity = baseOpacity;
  material.blending = THREE.AdditiveBlending;
  material.depthWrite = false;
  material.userData.baseOpacity = baseOpacity;
}

function createGlowLine(
  vertices: Array<[number, number, number]>,
  edges: Array<[number, number]>,
  color: number,
  opacity: number
): THREE.LineSegments {
  const line = lineShape(vertices, edges, color, opacity);
  const material = materialFromLine(line);
  if (material) {
    tunePulseMaterial(material, opacity);
  }
  return line;
}

function createPulseRing(color: number, radius: number, z: number, opacity: number, segments = 28): THREE.LineSegments {
  const positions: number[] = [];
  for (let index = 0; index < segments; index += 1) {
    const start = (index / segments) * Math.PI * 2;
    const end = ((index + 1) / segments) * Math.PI * 2;
    positions.push(
      Math.cos(start) * radius,
      Math.sin(start) * radius,
      z,
      Math.cos(end) * radius,
      Math.sin(end) * radius,
      z
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  material.userData.baseOpacity = opacity;
  return new THREE.LineSegments(geometry, material);
}

function setProjectilePulseOpacity(object: THREE.Object3D, pulse: number): void {
  object.traverse((child) => {
    if (
      (child instanceof THREE.LineSegments || child instanceof THREE.Points) &&
      child.material instanceof THREE.Material
    ) {
      const baseOpacity = Number(child.material.userData.baseOpacity ?? child.material.opacity);
      child.material.opacity = baseOpacity * (0.68 + pulse * 0.32);
    }
  });
}

function createStarTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas star context unavailable');
  }

  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 15);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.26, 'rgba(210, 255, 238, 0.82)');
  gradient.addColorStop(0.72, 'rgba(90, 255, 200, 0.18)');
  gradient.addColorStop(1, 'rgba(90, 255, 200, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  context.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  context.lineWidth = 1.1;
  context.beginPath();
  context.moveTo(16, 7);
  context.lineTo(16, 25);
  context.moveTo(7, 16);
  context.lineTo(25, 16);
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createBoltModel(color: number, radius: number, length: number, faction: Faction): THREE.Group {
  const group = new THREE.Group();
  const nose = -length * 0.54;
  const tail = length * 0.62;
  const ringRadius = Math.max(4.6, radius * 1.08);
  const coreRadius = Math.max(2.4, radius * 0.48);
  const lineOpacity = faction === 'player' ? 0.72 : 0.54;
  const haloOpacity = faction === 'player' ? 0.34 : 0.24;

  group.add(createPulseRing(color, ringRadius, -length * 0.1, lineOpacity, 32));
  group.add(createPulseRing(0xffffff, coreRadius, -length * 0.1, faction === 'player' ? 0.36 : 0.24, 24));
  group.add(createPulseRing(color, ringRadius * 0.62, tail * 0.32, haloOpacity, 24));
  group.add(createGlowLine([[0, 0, nose], [0, 0, tail]], [[0, 1]], color, lineOpacity));
  group.add(createGlowLine([[0, 0, nose * 0.62], [0, 0, tail * 0.42]], [[0, 1]], 0xffffff, faction === 'player' ? 0.3 : 0.2));

  const glowGeometry = new THREE.BufferGeometry();
  glowGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, -length * 0.12, 0, 0, tail * 0.28, 0, 0, tail * 0.56], 3)
  );
  const glowOpacity = faction === 'player' ? 0.36 : 0.28;
  const glowMaterial = new THREE.PointsMaterial({
    color,
    size: faction === 'player' ? radius * 2.9 : radius * 2.35,
    map: createPulseTexture(),
    transparent: true,
    opacity: glowOpacity,
    alphaTest: 0.02,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  glowMaterial.userData.baseOpacity = glowOpacity;
  const glow = new THREE.Points(
    glowGeometry,
    glowMaterial
  );
  group.add(glow);
  return group;
}

function getWeaponSpec(level: number): WeaponSpec {
  const clamped = THREE.MathUtils.clamp(Math.floor(level), 1, 5);
  return WEAPON_SPECS[clamped] ?? WEAPON_SPECS[1];
}

function vectorFromSpherical(radius: number, yaw: number, pitch: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch) * radius,
    Math.sin(pitch) * radius,
    Math.cos(yaw) * Math.cos(pitch) * radius
  );
}

function wrapAngle(angle: number): number {
  return THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
}

function materialFromLine(line: THREE.Object3D): THREE.LineBasicMaterial | null {
  if (line instanceof THREE.LineSegments && line.material instanceof THREE.LineBasicMaterial) {
    return line.material;
  }
  return null;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      if (child.material instanceof THREE.Material) {
        child.material.dispose();
      }
    }
    if (child instanceof THREE.Points) {
      child.geometry.dispose();
      if (child.material instanceof THREE.Material) {
        child.material.dispose();
      }
    }
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        for (const material of child.material) {
          material.dispose();
        }
      } else {
        child.material.dispose();
      }
    }
    if (child instanceof THREE.Sprite) {
      const material = child.material;
      material.map?.dispose();
      material.dispose();
    }
  });
}

function loadSave(): PlayerSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return createInitialSave();
    }
    return { ...createInitialSave(), ...JSON.parse(raw) } as PlayerSave;
  } catch {
    return createInitialSave();
  }
}

function saveGame(save: PlayerSave): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Local storage may be unavailable in private contexts; the game still runs.
  }
}

class VectorShooterGame {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 5000);
  private readonly briefingPreviewRenderer: THREE.WebGLRenderer;
  private readonly briefingPreviewScene = new THREE.Scene();
  private readonly briefingPreviewCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
  private readonly briefingItems: BriefingItem[];
  private readonly sound = new SoundBank();
  private readonly playerPosition = new THREE.Vector3(0, 0, 0);
  private readonly playerQuaternion = new THREE.Quaternion();
  private readonly keys: Keys = {
    forward: false,
    brake: false,
    rollLeft: false,
    rollRight: false,
    boost: false
  };

  private save: PlayerSave;
  private progress: PlayerProgress;
  private sector: Sector;
  private rng: SeededRandom;
  private entities: WorldEntity[] = [];
  private projectiles: Projectile[] = [];
  private explosions: Explosion[] = [];
  private messages: FloatingMessage[] = [];
  private starGeometry: THREE.BufferGeometry;
  private starPositions: Float32Array;
  private starField: THREE.Points;
  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private speed = 0;
  private fireCooldown = 0;
  private collisionCooldown = 0;
  private npcShipHits = 0;
  private npcCargoPickups = 0;
  private damageFlashReset: number | null = null;
  private hitCalloutReset: number | null = null;
  private saveTimer = 0;
  private scanTimer = 5;
  private started = false;
  private gameOver = false;
  private warpTimer = 0;
  private warpTarget: string | null = null;
  private activeMission: Mission;
  private ambushTriggered = false;
  private shotInterceptions = 0;
  private briefingObject: THREE.Object3D | null = null;
  private briefingIndex = 0;
  private briefingTimer = 0;
  private deathCountdownInterval: number | null = null;
  private deathCountdownRemaining = 10;
  private lastFrame = performance.now();
  private entityId = 0;

  constructor() {
    this.save = loadSave();
    this.progress = createInitialProgress(this.save);
    this.sector = getSector(this.progress.discoveredSectors[0] ?? 'lyra-drift');
    this.clearLaunchHeat();
    this.rng = new SeededRandom(hashString(this.sector.id));
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x010304, 1);
    viewport.appendChild(this.renderer.domElement);

    this.briefingPreviewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.briefingPreviewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.briefingPreviewRenderer.setClearColor(0x000000, 0);
    modelPreview.appendChild(this.briefingPreviewRenderer.domElement);
    this.briefingPreviewCamera.position.set(0, 0, 64);
    this.briefingItems = this.createBriefingItems();
    this.showBriefingItem(0);

    const stars = this.createStarField();
    this.starGeometry = stars.geometry;
    this.starPositions = stars.positions;
    this.starField = stars.points;
    this.scene.add(this.starField);

    this.activeMission = createMission(this.sector, 0);
    this.loadSector(this.sector.id, true);
    this.bindEvents();
    this.exposeDebugControls();
    this.showStartScreen();
    this.resize();
    this.updateHud();
  }

  start(): void {
    if (this.deathCountdownInterval !== null) {
      this.clearDeathCountdown();
      this.resetAfterDeath();
      deathCountdown.classList.add('hidden');
      deathTimer.textContent = '10';
    }
    this.started = true;
    this.gameOver = false;
    launchOverlay.classList.add('hidden');
    void this.sound.start();
    this.lockPointer();
  }

  run(): void {
    this.loop();
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const rawDelta = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    const delta = Math.min(rawDelta, 0.05);

    if (this.started && !this.gameOver) {
      this.update(delta);
    } else {
      this.animateIdle(delta);
    }
    this.updateBriefingPreview(delta);
    this.renderer.render(this.scene, this.camera);
  };

  private bindEvents(): void {
    launchButton.addEventListener('click', () => this.start());

    this.renderer.domElement.addEventListener('mousedown', (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      if (!this.started || this.gameOver) {
        this.start();
        return;
      }
      this.lockPointer();
      this.shoot();
    });

    window.addEventListener('blur', () => {
      this.keys.forward = false;
      this.keys.brake = false;
      this.keys.rollLeft = false;
      this.keys.rollRight = false;
      this.keys.boost = false;
    });
    this.renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (event) => this.handleKeyDown(event));
    window.addEventListener('keyup', (event) => this.setKey(event.code, false));
    window.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== this.renderer.domElement || !this.started || this.gameOver) {
        return;
      }
      this.applyMouseLook(event.movementX, event.movementY);
    });
  }

  private applyMouseLook(movementX: number, movementY: number): void {
    this.yaw = wrapAngle(this.yaw - movementX * 0.0016);
    this.pitch = wrapAngle(this.pitch - movementY * 0.0014);
    this.updateCamera();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!launchOverlay.classList.contains('hidden') && this.deathCountdownInterval === null) {
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        event.preventDefault();
        const direction = event.code === 'ArrowRight' ? 1 : -1;
        this.showBriefingItem(this.briefingIndex + direction);
        return;
      }
    }

    this.setKey(event.code, true);
  }

  private setKey(code: string, pressed: boolean): void {
    if (code === 'KeyW' || code === 'ArrowUp') this.keys.forward = pressed;
    if (code === 'KeyS' || code === 'ArrowDown') this.keys.brake = pressed;
    if (code === 'KeyA' || code === 'ArrowLeft') this.keys.rollLeft = pressed;
    if (code === 'KeyD' || code === 'ArrowRight') this.keys.rollRight = pressed;
    if (code === 'ShiftLeft' || code === 'ShiftRight') this.keys.boost = pressed;
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    const previewBounds = modelPreview.getBoundingClientRect();
    const previewWidth = Math.max(180, Math.floor(previewBounds.width));
    const previewHeight = Math.max(140, Math.floor(previewBounds.height));
    this.briefingPreviewCamera.aspect = previewWidth / previewHeight;
    this.briefingPreviewCamera.updateProjectionMatrix();
    this.briefingPreviewRenderer.setSize(previewWidth, previewHeight, false);
  }

  private update(delta: number): void {
    this.fireCooldown = Math.max(0, this.fireCooldown - delta);
    this.collisionCooldown = Math.max(0, this.collisionCooldown - delta);

    if (this.warpTarget) {
      this.updateWarp(delta);
      this.updateCamera();
      this.updateStars();
      this.updateProjectiles(delta);
      this.updateExplosions(delta);
      this.updateHud();
      return;
    }

    this.updatePlayer(delta);
    this.updateEntities(delta);
    this.updateProjectiles(delta);
    this.updateExplosions(delta);
    this.updatePickups(delta);
    this.updateLaw(delta);
    this.updateTrading();
    this.updateGateTravel();
    this.updateStars();
    this.updateMessages(delta);
    this.persistPeriodically(delta);
    this.updateHud();
  }

  private animateIdle(delta: number): void {
    for (const entity of this.entities) {
      entity.object.rotation.y += delta * 0.12;
      entity.object.rotation.z += delta * 0.05;
    }
    this.updateStars();
    this.updateExplosions(delta);
    this.updateHud();
  }

  private updateBriefingPreview(delta: number): void {
    if (launchOverlay.classList.contains('hidden')) {
      return;
    }

    this.briefingTimer += delta;
    if (this.briefingTimer >= BRIEFING_SCAN_SECONDS && this.deathCountdownInterval === null) {
      this.showBriefingItem((this.briefingIndex + 1) % this.briefingItems.length);
    }

    if (this.briefingObject) {
      this.briefingObject.rotation.x += delta * 0.16;
      this.briefingObject.rotation.y += delta * 0.72;
      this.briefingObject.rotation.z += delta * 0.05;
    }
    this.briefingPreviewRenderer.render(this.briefingPreviewScene, this.briefingPreviewCamera);
  }

  private showBriefingItem(index: number): void {
    if (this.briefingObject) {
      this.briefingPreviewScene.remove(this.briefingObject);
      disposeObject(this.briefingObject);
    }

    const normalizedIndex = (index + this.briefingItems.length) % this.briefingItems.length;
    const item = this.briefingItems[normalizedIndex];
    this.briefingIndex = normalizedIndex;
    this.briefingTimer = 0;
    this.briefingObject = item.create();
    this.briefingObject.scale.setScalar(item.scale);
    this.briefingObject.position.set(0, 0, 0);
    this.briefingPreviewCamera.position.z = item.cameraZ;
    this.briefingPreviewScene.add(this.briefingObject);
    modelTitle.textContent = item.title;
    modelDescription.textContent = item.description;
    modelCount.textContent = `${normalizedIndex + 1}/${this.briefingItems.length}`;
  }

  private createBriefingItems(): BriefingItem[] {
    return [
      {
        title: 'RED PIRATE',
        description: 'Bad guys carrying stolen goods. They will shoot you. Shoot them back.',
        create: createPirateModel,
        scale: 2.2,
        cameraZ: 58
      },
      {
        title: 'GREEN TRADER',
        description: 'Merchants and civilians. Do not shoot them unless they attack first.',
        create: createTraderHaulerModel,
        scale: 1.9,
        cameraZ: 62
      },
      {
        title: 'GREEN UFO TRADER',
        description: 'Neutral saucer trader. Attacking one without provocation makes you wanted.',
        create: createTraderUfoModel,
        scale: 1.8,
        cameraZ: 62
      },
      {
        title: 'POLICE',
        description: 'Good guys. Do not shoot them. They respond to piracy and contraband.',
        create: createPoliceModel,
        scale: 2.2,
        cameraZ: 58
      },
      {
        title: 'LEGAL CARGO',
        description: 'Small bright pickup. Collect it, then auto-sell near a lawful base or planet.',
        create: () => createCargoModel('legalCargo'),
        scale: 3.4,
        cameraZ: 58
      },
      {
        title: 'RARE MINERAL',
        description: 'Scarce salvage worth more than basic cargo.',
        create: () => createCargoModel('rareMineral'),
        scale: 3.4,
        cameraZ: 58
      },
      {
        title: 'CONTRABAND',
        description: 'Illegal pickup. Sell at black-market beacons, but police scans are risky.',
        create: () => createCargoModel('contraband'),
        scale: 3.4,
        cameraZ: 58
      },
      {
        title: 'WEAPON CORE',
        description: 'Pickup that upgrades your weapon mode and bolt power.',
        create: () => createCargoModel('weaponCore'),
        scale: 3.4,
        cameraZ: 58
      },
      {
        title: 'SHIELD CELL',
        description: 'Pickup that restores shield energy.',
        create: () => createCargoModel('shieldCell'),
        scale: 3.4,
        cameraZ: 58
      },
      {
        title: 'RESCUE POD',
        description: 'Mission pickup. Carry it to a lawful safe zone.',
        create: () => createCargoModel('rescuePod'),
        scale: 3,
        cameraZ: 58
      },
      {
        title: 'WAYBASE',
        description: 'Lawful trade and scan zone. Big boundary rings are not pickups.',
        create: createBaseModel,
        scale: 0.55,
        cameraZ: 86
      },
      {
        title: 'OUTPOST PLANET',
        description: 'Large fixed landmark and lawful trade zone. You cannot pick it up.',
        create: () => createPlanetModel(COLORS.planet),
        scale: 0.44,
        cameraZ: 96
      },
      {
        title: 'BLACK-MARKET BEACON',
        description: 'Contraband buyer. Useful, risky, and not cargo.',
        create: createBlackMarketModel,
        scale: 0.78,
        cameraZ: 92
      },
      {
        title: 'WARP GATE',
        description: 'Fly through the hollow center to warp sectors. The yellow WARP arrow points at the opening.',
        create: createGateModel,
        scale: 0.78,
        cameraZ: 96
      }
    ];
  }

  private updatePlayer(delta: number): void {
    const acceleration = this.keys.boost ? 110 : 72;
    const maxSpeed = this.keys.boost ? 230 : 150;
    if (this.keys.forward) {
      this.speed += acceleration * delta;
    }
    if (this.keys.brake) {
      this.speed -= 125 * delta;
    }
    if (!this.keys.forward && !this.keys.brake) {
      this.speed *= 1 - Math.min(0.55 * delta, 0.18);
    }
    this.speed = THREE.MathUtils.clamp(this.speed, 0, maxSpeed);

    const rollTarget = (this.keys.rollLeft ? 1 : 0) + (this.keys.rollRight ? -1 : 0);
    this.roll = THREE.MathUtils.lerp(this.roll, rollTarget * 0.7, Math.min(5 * delta, 1));
    this.yaw = wrapAngle(this.yaw + Math.sin(this.roll) * delta * 0.35);

    this.updateCamera();
    const forward = this.getForwardVector();
    this.playerPosition.addScaledVector(forward, this.speed * delta);
    this.resolveSolidCollisions();
    this.updateCamera();
  }

  private updateCamera(): void {
    this.playerQuaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
    this.camera.position.copy(this.playerPosition);
    this.camera.quaternion.copy(this.playerQuaternion);
  }

  private updateEntities(delta: number): void {
    for (const entity of this.entities) {
      entity.fireCooldown = Math.max(0, entity.fireCooldown - delta);
      entity.scanCooldown = Math.max(0, entity.scanCooldown - delta);
      entity.pulse += delta;

      if (entity.kind === 'pirate' || entity.kind === 'police') {
        this.updateCombatShip(entity, delta);
      } else if (entity.kind === 'trader') {
        this.updateTrader(entity, delta);
      } else if (entity.kind === 'gate') {
        const rotor = entity.object.userData.rotor;
        if (rotor instanceof THREE.Object3D) {
          rotor.rotation.z += delta * 0.22;
        }
        updateWarpCueVisuals(entity.object, this.activeMission.status === 'complete', entity.pulse);
      } else if (entity.kind === 'base' || entity.kind === 'planet' || entity.kind === 'blackMarket' || entity.kind === 'beacon') {
        entity.object.rotation.y += delta * 0.08;
      }
    }
  }

  private updateCombatShip(entity: WorldEntity, delta: number): void {
    const target = this.findCombatTarget(entity);
    const pickup = this.findPickupForShip(entity, SHIP_PICKUP_RANGE);
    if (pickup && this.shouldShipPrioritizePickup(entity, pickup, target)) {
      this.updateShipPickupChase(entity, pickup, delta, entity.kind === 'police' ? 72 : 60);
      return;
    }

    if (!target) {
      this.updatePatrolShip(entity, delta, entity.kind === 'police' ? 46 : 36);
      return;
    }

    const toTarget = target.position.clone().sub(entity.object.position);
    const distance = Math.max(toTarget.length(), 1);
    const direction = toTarget.normalize();
    const desiredDistance = entity.kind === 'police' ? 135 : 170;
    const speed = entity.kind === 'police' ? 86 : 58;
    const lateral = new THREE.Vector3(-direction.z, Math.sin(entity.pulse) * 0.25, direction.x).normalize();
    const chase = direction.clone().multiplyScalar(distance > desiredDistance ? speed : -speed * 0.38);
    chase.addScaledVector(lateral, entity.kind === 'police' ? 24 : 18);
    entity.velocity.lerp(chase, Math.min(delta * 0.9, 1));
    entity.object.position.addScaledVector(entity.velocity, delta);
    entity.object.lookAt(target.position);

    if (distance < ENEMY_FIRE_RANGE && entity.fireCooldown <= 0) {
      this.enemyShoot(entity, target);
      entity.fireCooldown = entity.kind === 'police' ? 0.72 : 1.1 + this.rng.range(0, 0.7);
    }
  }

  private updateTrader(entity: WorldEntity, delta: number): void {
    const toWaypoint = entity.waypoint.clone().sub(entity.object.position);
    if (toWaypoint.length() < 18) {
      entity.waypoint.copy(this.randomSectorPoint(280, 820));
    }

    const target = this.findCombatTarget(entity);
    const targetDistance = target ? target.position.distanceTo(entity.object.position) : Infinity;
    const wantedHere = wantedAppliesInSector(this.progress.wanted, this.sector.id);
    const fleePlayer = entity.provoked || wantedHere;
    const fleePirate = target?.entity?.kind === 'pirate' && targetDistance < 230;
    const pickup = !fleePlayer && !fleePirate ? this.findPickupForShip(entity, SHIP_PICKUP_RANGE) : null;
    if (pickup && (!target || pickup.object.position.distanceTo(entity.object.position) < targetDistance * 0.7)) {
      this.updateShipPickupChase(entity, pickup, delta, 44);
      return;
    }

    const direction = fleePlayer
      ? entity.object.position.clone().sub(this.playerPosition).normalize()
      : fleePirate && target
        ? entity.object.position.clone().sub(target.position).normalize()
        : toWaypoint.normalize();
    if (direction.lengthSq() === 0) {
      direction.set(0, 0, -1);
    }

    entity.velocity.lerp(direction.multiplyScalar(fleePlayer || fleePirate ? 88 : 32), Math.min(delta * 0.65, 1));
    entity.object.position.addScaledVector(entity.velocity, delta);
    entity.object.lookAt(target && targetDistance < TRADER_FIRE_RANGE ? target.position : entity.object.position.clone().add(entity.velocity));

    if (target && targetDistance < TRADER_FIRE_RANGE && entity.fireCooldown <= 0) {
      this.enemyShoot(entity, target);
      entity.fireCooldown = 1.35 + this.rng.range(0, 0.45);
    }
  }

  private updatePatrolShip(entity: WorldEntity, delta: number, speed: number): void {
    const toWaypoint = entity.waypoint.clone().sub(entity.object.position);
    if (toWaypoint.length() < 24) {
      entity.waypoint.copy(this.randomSectorPoint(240, 760));
    }

    const direction = toWaypoint.lengthSq() > 0 ? toWaypoint.normalize() : new THREE.Vector3(0, 0, -1);
    entity.velocity.lerp(direction.multiplyScalar(speed), Math.min(delta * 0.55, 1));
    entity.object.position.addScaledVector(entity.velocity, delta);
    entity.object.lookAt(entity.object.position.clone().add(entity.velocity));
  }

  private updateShipPickupChase(entity: WorldEntity, pickup: WorldEntity, delta: number, speed: number): void {
    const toPickup = pickup.object.position.clone().sub(entity.object.position);
    const direction = toPickup.lengthSq() > 0 ? toPickup.normalize() : new THREE.Vector3(0, 0, -1);
    entity.velocity.lerp(direction.multiplyScalar(speed), Math.min(delta * 0.82, 1));
    entity.object.position.addScaledVector(entity.velocity, delta);
    entity.object.lookAt(pickup.object.position);
  }

  private shouldShipPrioritizePickup(entity: WorldEntity, pickup: WorldEntity, target: CombatTarget | null): boolean {
    const wantedPolice = entity.kind === 'police' && wantedAppliesInSector(this.progress.wanted, this.sector.id);
    if (wantedPolice) {
      return false;
    }

    const pickupDistance = pickup.object.position.distanceTo(entity.object.position);
    if (!target) {
      return true;
    }

    const targetDistance = target.position.distanceTo(entity.object.position);
    return pickupDistance < 72 || pickupDistance < targetDistance * 0.45;
  }

  private findPickupForShip(entity: WorldEntity, maxDistance: number): WorldEntity | null {
    let nearest: WorldEntity | null = null;
    let nearestDistance = maxDistance;
    for (const candidate of this.entities) {
      if (!this.canShipCollectPickup(entity, candidate)) {
        continue;
      }

      const distance = candidate.object.position.distanceTo(entity.object.position);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private canShipCollectPickup(ship: WorldEntity, pickup: WorldEntity): boolean {
    if (!this.isShipEntity(ship) || pickup.kind !== 'cargo' || !pickup.cargoDrop || pickup.missionRole) {
      return false;
    }

    if (pickup.cargoDrop.type === 'rescuePod') {
      return false;
    }

    if (ship.kind === 'police') {
      return pickup.cargoDrop.type === 'contraband';
    }

    if (pickup.cargoDrop.type === 'contraband') {
      return ship.kind === 'pirate';
    }

    return ship.kind === 'pirate' || ship.kind === 'trader';
  }

  private findCombatTarget(entity: WorldEntity): CombatTarget | null {
    if (entity.kind === 'police') {
      if (wantedAppliesInSector(this.progress.wanted, this.sector.id)) {
        return this.createPlayerCombatTarget();
      }

      const pirate = this.findNearestShip(
        entity.object.position,
        (candidate) => candidate !== entity && candidate.kind === 'pirate' && !candidate.missionTarget,
        POLICE_TARGET_RANGE
      );
      return pirate ? this.createEntityCombatTarget(pirate) : null;
    }

    if (entity.kind === 'pirate') {
      const playerTarget = this.createPlayerCombatTarget();
      const shipTarget = this.findNearestShip(
        entity.object.position,
        (candidate) => candidate !== entity && (candidate.kind === 'trader' || candidate.kind === 'police'),
        PIRATE_TARGET_RANGE
      );
      if (!shipTarget) {
        return playerTarget;
      }

      const shipDistance = shipTarget.object.position.distanceTo(entity.object.position);
      const playerDistance = this.playerPosition.distanceTo(entity.object.position);
      return shipDistance <= playerDistance ? this.createEntityCombatTarget(shipTarget) : playerTarget;
    }

    if (entity.kind === 'trader') {
      if (entity.provoked || wantedAppliesInSector(this.progress.wanted, this.sector.id)) {
        return this.createPlayerCombatTarget();
      }

      const defenseTarget = entity.defenseTargetId ? this.findEntityById(entity.defenseTargetId) : null;
      if (defenseTarget?.kind === 'pirate') {
        return this.createEntityCombatTarget(defenseTarget);
      }

      const pirate = this.findNearestShip(
        entity.object.position,
        (candidate) => candidate !== entity && candidate.kind === 'pirate' && !candidate.missionTarget,
        TRADER_TARGET_RANGE
      );
      return pirate ? this.createEntityCombatTarget(pirate) : null;
    }

    return null;
  }

  private createPlayerCombatTarget(): CombatTarget {
    return {
      kind: 'player',
      faction: 'player',
      entity: null,
      position: this.playerPosition,
      radius: PLAYER_RADIUS
    };
  }

  private createEntityCombatTarget(entity: WorldEntity): CombatTarget {
    return {
      kind: 'entity',
      faction: entity.faction,
      entity,
      position: entity.object.position,
      radius: entity.radius
    };
  }

  private findNearestShip(
    origin: THREE.Vector3,
    predicate: (entity: WorldEntity) => boolean,
    maxDistance = Infinity
  ): WorldEntity | null {
    let nearest: WorldEntity | null = null;
    let nearestDistance = maxDistance;
    for (const candidate of this.entities) {
      if (!this.isShipEntity(candidate) || candidate.hull <= 0 || !predicate(candidate)) {
        continue;
      }

      const distance = candidate.object.position.distanceTo(origin);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private findEntityById(id: string): WorldEntity | null {
    return this.entities.find((entity) => entity.id === id) ?? null;
  }

  private isShipEntity(entity: WorldEntity): boolean {
    return entity.kind === 'pirate' || entity.kind === 'trader' || entity.kind === 'police';
  }

  private updateProjectiles(delta: number): void {
    const expired = new Set<Projectile>();
    for (const projectile of this.projectiles) {
      if (expired.has(projectile)) {
        continue;
      }

      projectile.ttl -= delta;
      projectile.position.addScaledVector(projectile.velocity, delta);
      projectile.object.position.copy(projectile.position);
      projectile.object.lookAt(projectile.position.clone().add(projectile.velocity));
      projectile.object.rotateZ(projectile.spin * delta);
      const pulse = (Math.sin(projectile.ttl * 24 + projectile.spin) + 1) / 2;
      projectile.object.scale.setScalar(0.86 + pulse * 0.24);
      setProjectilePulseOpacity(projectile.object, pulse);

      if (projectile.faction === 'player') {
        const intercepted = this.projectiles.find(
          (other) =>
            other !== projectile &&
            other.faction !== 'player' &&
            !expired.has(other) &&
            other.position.distanceTo(projectile.position) <= projectile.radius + other.radius
        );

        if (intercepted) {
          const impact = projectile.position.clone().lerp(intercepted.position, 0.5);
          this.createSpark(impact, 0xf8ffee);
          this.shotInterceptions += 1;
          this.progress = {
            ...this.progress,
            score: this.progress.score + 8
          };
          expired.add(projectile);
          expired.add(intercepted);
          continue;
        }

      }

      const hit = this.findProjectileEntityHit(projectile);
      if (hit) {
        this.damageEntity(hit, projectile.damage, projectile.faction, projectile.sourceEntityId);
        if (projectile.faction !== 'player') {
          this.npcShipHits += 1;
        }
        expired.add(projectile);
        continue;
      }

      if (
        projectile.faction !== 'player' &&
        this.canProjectileDamagePlayer(projectile) &&
        this.playerPosition.distanceTo(projectile.position) <= PLAYER_RADIUS + projectile.radius * 0.45
      ) {
        this.damagePlayer(projectile.damage, projectile.faction);
        expired.add(projectile);
      }

      if (projectile.ttl <= 0) {
        expired.add(projectile);
      }
    }

    for (const projectile of expired) {
      this.removeProjectile(projectile);
    }
  }

  private findProjectileEntityHit(projectile: Projectile): WorldEntity | null {
    return (
      this.entities.find(
        (entity) =>
          this.canProjectileDamageEntity(projectile, entity) &&
          entity.object.position.distanceTo(projectile.position) <= entity.radius + projectile.radius * 0.6
      ) ?? null
    );
  }

  private canProjectileDamageEntity(projectile: Projectile, entity: WorldEntity): boolean {
    if (!this.isShipEntity(entity) || entity.id === projectile.sourceEntityId || entity.faction === projectile.faction) {
      return false;
    }

    if (projectile.faction !== 'player' && entity.missionTarget) {
      return false;
    }

    if (projectile.faction === 'player') {
      return true;
    }

    if (projectile.faction === 'pirate') {
      return entity.kind === 'trader' || entity.kind === 'police';
    }

    if (projectile.faction === 'police' || projectile.faction === 'trader') {
      return entity.kind === 'pirate';
    }

    return false;
  }

  private canProjectileDamagePlayer(projectile: Projectile): boolean {
    return projectile.faction === 'pirate' || projectile.targetFaction === 'player';
  }

  private updateExplosions(delta: number): void {
    const expired: Explosion[] = [];
    for (const explosion of this.explosions) {
      explosion.life -= delta;
      for (let index = 0; index < explosion.parts.length; index += 1) {
        explosion.parts[index].position.addScaledVector(explosion.velocities[index], delta);
        const material = materialFromLine(explosion.parts[index]);
        if (material) {
          material.opacity = Math.max(0, explosion.life / explosion.maxLife);
        }
      }
      if (explosion.life <= 0) {
        expired.push(explosion);
      }
    }

    for (const explosion of expired) {
      this.scene.remove(explosion.object);
      disposeObject(explosion.object);
      this.explosions = this.explosions.filter((item) => item !== explosion);
    }
  }

  private updatePickups(delta: number): void {
    const collected = new Set<WorldEntity>();
    for (const entity of this.entities) {
      if (entity.kind !== 'cargo' || !entity.cargoDrop) {
        continue;
      }
      entity.object.rotation.x += delta * 1.2;
      entity.object.rotation.y += delta * 1.6;
      entity.object.position.addScaledVector(entity.velocity, delta);
      entity.velocity.multiplyScalar(1 - Math.min(delta * 0.35, 0.08));
      if (entity.object.position.distanceTo(this.playerPosition) <= PICKUP_RADIUS) {
        this.progress = applyCargoPickup(this.progress, entity.cargoDrop);
        this.sound.pickup();
        this.logPickup(entity.cargoDrop);
        collected.add(entity);
        continue;
      }

      const npcCollector = this.findNpcPickupCollector(entity);
      if (npcCollector) {
        this.collectPickupForNpc(npcCollector, entity);
        collected.add(entity);
      }
    }

    for (const entity of collected) {
      this.removeEntity(entity);
    }
  }

  private findNpcPickupCollector(pickup: WorldEntity): WorldEntity | null {
    let nearest: WorldEntity | null = null;
    let nearestDistance = Infinity;
    for (const entity of this.entities) {
      if (!this.canShipCollectPickup(entity, pickup)) {
        continue;
      }

      const distance = entity.object.position.distanceTo(pickup.object.position);
      const collectDistance = entity.radius + PICKUP_RADIUS + 4;
      if (distance <= collectDistance && distance < nearestDistance) {
        nearest = entity;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  private collectPickupForNpc(collector: WorldEntity, pickup: WorldEntity): void {
    if (!pickup.cargoDrop) {
      return;
    }

    this.npcCargoPickups += 1;
    this.createSpark(pickup.object.position, this.colorForCargo(pickup.cargoDrop.type));
    if (collector.object.position.distanceTo(this.playerPosition) < RADAR_RANGE * 0.58) {
      const cargoName = this.formatCargoName(pickup.cargoDrop.type).toLowerCase();
      const verb = collector.kind === 'police' && pickup.cargoDrop.type === 'contraband' ? 'confiscated' : 'scooped';
      this.log(`${collector.label} ${verb} ${cargoName}`);
    }
  }

  private updateLaw(delta: number): void {
    this.scanTimer = Math.max(0, this.scanTimer - delta);
    const wantedHere = wantedAppliesInSector(this.progress.wanted, this.sector.id);
    if (wantedHere) {
      this.progress = tickWanted(this.progress, delta);
    }

    if (wantedHere && policeDispatchDue(this.progress.wanted, this.progress.wanted.policeTimer)) {
      this.dispatchPolice();
      this.progress = markPoliceArrived(this.progress);
    }

    const nearLawfulZone = this.entities.some(
      (entity) =>
        (entity.kind === 'base' || entity.kind === 'planet') &&
        entity.object.position.distanceTo(this.playerPosition) <= SAFE_TRADE_RADIUS + 18
    );

    if (nearLawfulZone && this.scanTimer <= 0 && this.progress.inventory.contraband > 0 && this.sector.lawLevel > 0) {
      const scan = resolveContrabandScan(this.progress, this.sector.id);
      this.progress = scan.progress;
      this.scanTimer = 11 - Math.min(this.sector.lawLevel, 3);
      this.log(scan.message);
      this.sound.warning();
      if (scan.outcome === 'hostile-response') {
        this.dispatchPolice();
        this.progress = markPoliceArrived(this.progress);
      }
    }
  }

  private updateTrading(): void {
    const lawfulZone = this.entities.find(
      (entity) =>
        (entity.kind === 'base' || entity.kind === 'planet') &&
        entity.object.position.distanceTo(this.playerPosition) <= SAFE_TRADE_RADIUS
    );
    if (lawfulZone) {
      this.tradeAt('lawful');
    }

    const blackMarket = this.entities.find(
      (entity) => entity.kind === 'blackMarket' && entity.object.position.distanceTo(this.playerPosition) <= BLACK_MARKET_RADIUS
    );
    if (blackMarket) {
      this.tradeAt('blackMarket');
    }

    const ambushBeacon = this.entities.find(
      (entity) => entity.missionRole === 'ambush' && entity.object.position.distanceTo(this.playerPosition) < 45
    );
    if (ambushBeacon && this.activeMission.type === 'ambush' && !this.ambushTriggered) {
      this.ambushTriggered = true;
      this.removeEntity(ambushBeacon);
      this.log('Ambush signal opened');
      for (let index = 0; index < 3; index += 1) {
        this.spawnShip('pirate', this.playerPosition.clone().add(this.randomDirection(135 + index * 38)));
      }
    }
  }

  private tradeAt(zone: TradeZone): void {
    const before = this.progress;
    const result = instantTrade(before, zone);
    if (result.creditsEarned <= 0) {
      return;
    }

    this.progress = result.progress;
    const sold = Object.entries(result.sold)
      .map(([type, amount]) => `${amount} ${type}`)
      .join(', ');
    this.log(`${zone === 'lawful' ? 'Lawful exchange' : 'Black-market exchange'}: ${sold} +${result.creditsEarned}`);
    this.sound.pickup();

    if (
      this.activeMission.status === 'active' &&
      ((this.activeMission.type === 'rescue' && result.sold.rescuePod) ||
        (this.activeMission.type === 'courier' && result.sold.legalCargo) ||
        (this.activeMission.type === 'smuggling' && result.sold.contraband))
    ) {
      this.finishMission();
    }
  }

  private updateGateTravel(): void {
    const gate = this.entities.find(
      (entity) => entity.kind === 'gate' && entity.object.position.distanceTo(this.playerPosition) <= GATE_RADIUS
    );
    if (!gate || this.warpTarget) {
      return;
    }
    this.beginWarp(nextSectorId(this.sector.id));
  }

  private resolveSolidCollisions(): void {
    for (const entity of this.entities) {
      const solidRadius = SOLID_COLLISION_RADII[entity.kind];
      if (!solidRadius) {
        continue;
      }

      const minimumDistance = solidRadius + PLAYER_RADIUS;
      const offset = this.playerPosition.clone().sub(entity.object.position);
      const distance = offset.length();
      if (distance >= minimumDistance) {
        continue;
      }

      const normal = distance > 0.001 ? offset.multiplyScalar(1 / distance) : this.getForwardVector().multiplyScalar(-1);
      this.playerPosition.copy(entity.object.position).addScaledVector(normal, minimumDistance);
      this.speed = Math.max(0, this.speed * 0.22);
      if (this.collisionCooldown <= 0) {
        this.createSpark(this.playerPosition, COLORS.amber === '#ffd15c' ? 0xffd15c : COLORS.cargo);
        this.sound.warning();
        this.log(`${entity.label} collision boundary`);
        this.collisionCooldown = 0.28;
      }
    }
  }

  private updateWarp(delta: number): void {
    if (!this.warpTarget) {
      return;
    }

    this.warpTimer += delta;
    this.speed = THREE.MathUtils.lerp(this.speed, 360, Math.min(delta * 2.7, 1));
    this.playerPosition.addScaledVector(this.getForwardVector(), this.speed * delta);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 92, Math.min(delta * 2.2, 1));
    this.camera.updateProjectionMatrix();

    if (this.warpTimer >= 1.75) {
      const target = this.warpTarget;
      const previousSector = this.sector.id;
      this.warpTarget = null;
      this.warpTimer = 0;
      warpLayer.classList.remove('active');
      this.camera.fov = 68;
      this.camera.updateProjectionMatrix();
      this.progress = coolWantedAfterWarp(this.progress, previousSector);
      this.progress = discoverSector(this.progress, target);
      this.loadSector(target, false);
      this.log(`Warp exit: ${this.sector.name}`);
      this.showMissionBriefingScreen();
    }
  }

  private updateStars(): void {
    const positionAttribute = this.starGeometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < this.starPositions.length; index += 3) {
      const x = this.starPositions[index];
      const y = this.starPositions[index + 1];
      const z = this.starPositions[index + 2];
      const dx = x - this.playerPosition.x;
      const dy = y - this.playerPosition.y;
      const dz = z - this.playerPosition.z;
      if (dx * dx + dy * dy + dz * dz > 1900 * 1900) {
        const direction = this.randomDirection(1200 + this.rng.range(0, 650));
        this.starPositions[index] = this.playerPosition.x + direction.x;
        this.starPositions[index + 1] = this.playerPosition.y + direction.y;
        this.starPositions[index + 2] = this.playerPosition.z + direction.z;
      }
    }
    positionAttribute.needsUpdate = true;
  }

  private updateMessages(delta: number): void {
    for (const message of this.messages) {
      message.ttl -= delta;
    }
    this.messages = this.messages.filter((message) => message.ttl > 0);
  }

  private persistPeriodically(delta: number): void {
    this.saveTimer += delta;
    if (this.saveTimer < SAVE_INTERVAL_SECONDS) {
      return;
    }
    this.saveTimer = 0;
    this.save = progressToSave(this.progress, this.save);
    saveGame(this.save);
  }

  private shoot(): void {
    if (!this.started || this.gameOver || this.fireCooldown > 0 || this.warpTarget) {
      return;
    }
    const spec = getWeaponSpec(this.progress.weaponLevel);
    this.fireCooldown = spec.cooldown;
    const baseForward = this.getForwardVector();
    const baseRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.playerQuaternion);

    for (let index = 0; index < spec.spreadCount; index += 1) {
      const offset = (index - (spec.spreadCount - 1) / 2) * spec.spreadAngle;
      const direction = baseForward.clone().addScaledVector(baseRight, offset).normalize();
      this.spawnProjectile(
        'player',
        this.playerPosition.clone().addScaledVector(direction, 12),
        direction,
        spec.speed,
        spec.damage,
        spec.color,
        spec.radius,
        spec.length,
        spec.ttl
      );
    }

    this.sound.shoot();
  }

  private enemyShoot(entity: WorldEntity, target: CombatTarget): void {
    const direction = target.position.clone().sub(entity.object.position).normalize();
    const color = entity.kind === 'police' ? COLORS.police : entity.kind === 'trader' ? COLORS.trader : COLORS.pirate;
    const damage = entity.kind === 'trader' ? 7 : 10;
    const speed = entity.kind === 'trader' ? 148 : 165;
    this.spawnProjectile(
      entity.faction,
      entity.object.position.clone().addScaledVector(direction, 12),
      direction,
      speed,
      damage,
      color,
      entity.kind === 'trader' ? 6.8 : 7.5,
      entity.kind === 'trader' ? 20 : 22,
      3,
      entity.id,
      target.faction
    );
    this.sound.enemyShoot();
  }

  private spawnProjectile(
    faction: Faction,
    position: THREE.Vector3,
    direction: THREE.Vector3,
    speed: number,
    damage: number,
    color = 0xffffff,
    radius = 5,
    length = 18,
    ttl = 1.8,
    sourceEntityId: string | null = null,
    targetFaction: Faction | null = null
  ): void {
    const projectileColor = color;
    const object = createBoltModel(projectileColor, radius, length, faction);
    object.position.copy(position);
    object.lookAt(position.clone().add(direction));
    this.scene.add(object);
    this.projectiles.push({
      id: this.nextId('shot'),
      object,
      faction,
      sourceEntityId,
      targetFaction,
      position,
      velocity: direction.multiplyScalar(speed),
      ttl,
      damage,
      radius,
      spin: faction === 'player' ? 5.8 : -3.5
    });
  }

  private damageEntity(
    entity: WorldEntity,
    damage: number,
    attackerFaction: Faction = 'player',
    attackerEntityId: string | null = null
  ): void {
    if (attackerFaction === 'player' && entity.kind === 'trader' && !entity.provoked) {
      this.progress = attackFaction(this.progress, this.sector.id, entity.faction, false);
      entity.provoked = true;
      this.log('Trader strike logged: sector warrant active');
      this.sound.warning();
    }

    if (attackerFaction === 'player' && entity.kind === 'police') {
      this.progress = {
        ...this.progress,
        wanted: {
          active: true,
          heat: Math.max(3, this.progress.wanted.heat + 1),
          sectorId: this.sector.id,
          policeTimer: this.progress.wanted.policeTimer,
          policeArrived: this.progress.wanted.policeArrived,
          reason: 'Police attack'
        }
      };
    }

    if (attackerFaction === 'pirate' && attackerEntityId && (entity.kind === 'trader' || entity.kind === 'police')) {
      entity.defenseTargetId = attackerEntityId;
    }

    entity.hull -= damage;
    this.createSpark(entity.object.position, entity.faction === 'trader' ? COLORS.trader : entity.faction === 'police' ? COLORS.police : COLORS.pirate);
    if (entity.hull <= 0) {
      this.destroyEntity(entity, attackerFaction);
    }
  }

  private destroyEntity(entity: WorldEntity, attackerFaction: Faction = 'player'): void {
    this.createExplosion(entity.object.position, entity.faction);
    this.sound.explosion();
    const playerKill = attackerFaction === 'player';
    if (entity.kind === 'pirate') {
      if (playerKill) {
        this.progress = {
          ...this.progress,
          score: this.progress.score + (entity.missionTarget ? 320 : 120),
          credits: this.progress.credits + (entity.missionTarget ? 80 : 25)
        };
      }
      if (this.activeMission.type === 'bounty' && entity.missionTarget) {
        this.finishMission();
      }
      if (this.activeMission.type === 'ambush' && this.ambushTriggered) {
        this.activeMission = {
          ...this.activeMission,
          progress: Math.min(this.activeMission.goal, this.activeMission.progress + 1)
        };
        if (this.activeMission.progress >= this.activeMission.goal) {
          this.finishMission();
        }
      }
    }

    if (playerKill && entity.kind === 'trader') {
      this.progress = {
        ...this.progress,
        score: Math.max(0, this.progress.score - 100)
      };
    }

    if (playerKill && entity.kind === 'police') {
      this.progress = {
        ...this.progress,
        score: Math.max(0, this.progress.score - 160)
      };
    }

    this.dropLoot(entity);
    this.removeEntity(entity);
  }

  private damagePlayer(damage: number, attackerFaction: Faction): void {
    let shield = this.progress.shield;
    let hull = this.progress.hull;
    const absorbed = Math.min(shield, damage);
    shield -= absorbed;
    hull -= damage - absorbed;
    this.progress = {
      ...this.progress,
      shield: Math.max(0, shield),
      hull: Math.max(0, hull)
    };
    this.showDamageFeedback(attackerFaction);
    if (this.progress.hull <= 0) {
      document.exitPointerLock();
      this.log('Hull breach. Rescue tug reset engaged.');
      this.save = progressToSave(this.progress, this.save);
      saveGame(this.save);
      this.showDeathCountdown();
    }
  }

  private showDeathCountdown(): void {
    if (this.deathCountdownInterval !== null) {
      return;
    }

    this.started = false;
    this.gameOver = true;
    this.deathCountdownRemaining = 10;
    launchOverlay.dataset.mode = 'death';
    launchOverlay.classList.remove('hidden');
    briefingStatus.textContent = 'SHIP LOST';
    launchTitle.textContent = 'RELAUNCH';
    launchButton.textContent = 'RELAUNCH NOW';
    launchButton.disabled = false;
    deathTimer.textContent = this.deathCountdownRemaining.toString();
    deathCountdown.classList.remove('hidden');

    this.deathCountdownInterval = window.setInterval(() => {
      this.deathCountdownRemaining -= 1;
      deathTimer.textContent = Math.max(0, this.deathCountdownRemaining).toString();
      if (this.deathCountdownRemaining <= 0) {
        this.clearDeathCountdown();
        this.resetAfterDeath();
        this.showStartScreen();
      }
    }, 1000);
  }

  private clearDeathCountdown(): void {
    if (this.deathCountdownInterval !== null) {
      window.clearInterval(this.deathCountdownInterval);
      this.deathCountdownInterval = null;
    }
  }

  private showStartScreen(): void {
    this.started = false;
    this.gameOver = false;
    launchOverlay.dataset.mode = 'briefing';
    launchOverlay.classList.remove('hidden');
    briefingStatus.textContent = 'PILOT BRIEFING';
    launchTitle.textContent = 'VECTOR SHOOTER';
    launchButton.textContent = 'PLAY GAME';
    launchButton.disabled = false;
    deathCountdown.classList.add('hidden');
    deathTimer.textContent = '10';
    this.updateMissionBriefing();
  }

  private updateMissionBriefing(): void {
    const brief = this.describeMission();
    missionBriefTitle.textContent = brief.title.toUpperCase();
    missionBriefObjective.textContent = brief.objective;
    missionBriefCaution.textContent = brief.caution;
    missionBriefReward.textContent = `REWARD ${formatCredits(this.activeMission.reward)}`;
  }

  private describeMission(): MissionBrief {
    if (this.activeMission.status === 'complete') {
      return {
        title: this.activeMission.title,
        objective: 'Mission complete. Warp to another sector or keep clearing pirates and collecting cargo.',
        caution: 'Stay clean: police and peaceful traders are still protected targets.'
      };
    }

    switch (this.activeMission.type) {
      case 'bounty':
        return {
          title: this.activeMission.title,
          objective: 'Destroy the marked red pirate ace. Pirates are lawful targets, and they may be carrying stolen cargo.',
          caution: 'Police and traders may fight pirates too; do not shoot blue police or peaceful green traders.'
        };
      case 'rescue':
        return {
          title: this.activeMission.title,
          objective: 'Find the drifting rescue pod, pick it up, then fly close to a lawful base or planet to hand it over.',
          caution: 'Rescue pods are mission cargo. Avoid pirate fire and do not become wanted near lawful zones.'
        };
      case 'courier':
        return {
          title: this.activeMission.title,
          objective: 'Collect the sealed legal cargo, then deliver it by flying near a lawful base or planet.',
          caution: 'Pirates and other ships can scoop loose cargo, so reach the crate before the traffic does.'
        };
      case 'smuggling':
        return {
          title: this.activeMission.title,
          objective: 'Collect the quiet crate, then sell it at the black-market beacon.',
          caution: 'It is contraband. Traders will avoid it, but police can confiscate it and scans near lawful zones are dangerous.'
        };
      case 'ambush':
        return {
          title: this.activeMission.title,
          objective: 'Fly to the suspicious distress ping. When the trap opens, destroy three ambushing pirates.',
          caution: 'Expect close-range pirate fire. Police may attack the pirates, but your mission needs you to survive the ambush.'
        };
    }
  }

  private showDamageFeedback(attackerFaction: Faction): void {
    const message =
      attackerFaction === 'pirate'
        ? 'Red pirate shot you. Shoot them back!'
        : attackerFaction === 'police'
          ? 'Police interceptor hit you. Break away or fight.'
          : 'Incoming fire hit you. Return fire!';

    this.sound.damage();
    this.log(message);
    hitCallout.textContent = message.toUpperCase();

    if (this.damageFlashReset !== null) {
      window.clearTimeout(this.damageFlashReset);
    }
    if (this.hitCalloutReset !== null) {
      window.clearTimeout(this.hitCalloutReset);
    }

    damageLayer.classList.remove('active');
    gameShell.classList.remove('hit-shake');
    hitCallout.classList.remove('active');
    void damageLayer.offsetWidth;
    void gameShell.offsetWidth;
    void hitCallout.offsetWidth;
    damageLayer.classList.add('active');
    gameShell.classList.add('hit-shake');
    hitCallout.classList.add('active');

    this.damageFlashReset = window.setTimeout(() => {
      damageLayer.classList.remove('active');
      gameShell.classList.remove('hit-shake');
      this.damageFlashReset = null;
    }, 480);

    this.hitCalloutReset = window.setTimeout(() => {
      hitCallout.classList.remove('active');
      this.hitCalloutReset = null;
    }, 1800);
  }

  private resetAfterDeath(): void {
    this.progress = {
      ...createInitialProgress(this.save),
      credits: Math.max(0, Math.floor(this.progress.credits * 0.85)),
      weaponLevel: Math.max(1, this.progress.weaponLevel - 1)
    };
    this.clearLaunchHeat();
    this.playerPosition.set(0, 0, 0);
    this.speed = 0;
    this.loadSector(this.sector.id, true);
  }

  private clearLaunchHeat(): void {
    const sectorReputation: PlayerProgress['sectorReputation'] = { ...this.progress.sectorReputation };
    for (const sectorId of Object.keys(sectorReputation)) {
      sectorReputation[sectorId] = 'clean';
    }

    this.progress = {
      ...this.progress,
      wanted: {
        active: false,
        heat: 0,
        sectorId: null,
        policeTimer: 0,
        policeArrived: false,
        reason: null
      },
      sectorReputation
    };
    this.save = progressToSave(this.progress, this.save);
    saveGame(this.save);
  }

  private dropLoot(entity: WorldEntity): void {
    if (entity.kind !== 'pirate' && entity.kind !== 'trader' && entity.kind !== 'police') {
      return;
    }
    const roll = this.rng.next();
    let drop: CargoDrop;
    if (entity.kind === 'pirate') {
      drop = this.rng.pick<CargoDrop>([
        { type: 'credits', amount: this.rng.int(1, 3) },
        { type: 'rareMineral', amount: 1 },
        { type: 'contraband', amount: 1 },
        { type: 'weaponCore', amount: roll > 0.82 ? 1 : 0 },
        { type: 'shieldCell', amount: 1 }
      ]);
      if (drop.amount <= 0) drop = { type: 'credits', amount: 1 };
    } else if (entity.kind === 'police') {
      drop = roll > 0.7 ? { type: 'shieldCell', amount: 1 } : { type: 'credits', amount: 1 };
    } else {
      drop = roll > 0.55 ? { type: 'legalCargo', amount: this.rng.int(1, 2) } : { type: 'credits', amount: 2 };
    }
    this.spawnCargo(drop, entity.object.position.clone(), this.randomDirection(this.rng.range(18, 42)));
  }

  private spawnCargo(drop: CargoDrop, position: THREE.Vector3, velocity = new THREE.Vector3()): WorldEntity {
    const object = createCargoModel(drop.type);
    object.position.copy(position);
    this.scene.add(object);
    const entity = this.makeEntity('cargo', 'neutral', object, PICKUP_RADIUS, 1, `${drop.type}`);
    entity.cargoDrop = drop;
    entity.velocity.copy(velocity);
    this.entities.push(entity);
    return entity;
  }

  private dispatchPolice(): void {
    const bases = this.entities.filter((entity) => entity.kind === 'base' || entity.kind === 'planet');
    const nearest = bases.sort(
      (a, b) => a.object.position.distanceTo(this.playerPosition) - b.object.position.distanceTo(this.playerPosition)
    )[0];
    const spawnOrigin = nearest?.object.position.clone() ?? this.playerPosition.clone().add(this.randomDirection(360));
    const count = Math.min(5, 1 + this.progress.wanted.heat);
    for (let index = 0; index < count; index += 1) {
      this.spawnShip('police', spawnOrigin.clone().add(this.randomDirection(45 + index * 12)));
    }
    this.log(`Police interceptors launched: ${this.progress.wanted.reason ?? 'sector warrant'}`);
    this.sound.warning();
  }

  private beginWarp(targetSectorId: string): void {
    if (this.warpTarget) {
      return;
    }
    this.warpTarget = targetSectorId;
    this.warpTimer = 0;
    warpLayer.classList.add('active');
    this.log('Warp Gate lock: tunnel formed');
    this.sound.warp();
  }

  private finishMission(): void {
    const result = completeMission(this.progress, this.activeMission);
    this.progress = result.progress;
    this.activeMission = result.mission;
    this.log(`Mission complete +${this.activeMission.reward}`);
    this.log('Head to the Warp Gate!');
    this.updateMissionBriefing();
    this.sound.pickup();
  }

  private showMissionBriefingScreen(): void {
    this.started = false;
    this.gameOver = false;
    document.exitPointerLock();
    launchOverlay.dataset.mode = 'mission';
    launchOverlay.classList.remove('hidden');
    briefingStatus.textContent = 'NEW SECTOR';
    launchTitle.textContent = this.sector.name.toUpperCase();
    launchButton.textContent = 'START MISSION';
    launchButton.disabled = false;
    deathCountdown.classList.add('hidden');
    deathTimer.textContent = '10';
    this.updateMissionBriefing();
  }

  private loadSector(sectorId: string, preserveMissionSeed: boolean): void {
    for (const entity of this.entities) {
      this.scene.remove(entity.object);
      disposeObject(entity.object);
    }
    for (const projectile of this.projectiles) {
      this.scene.remove(projectile.object);
      disposeObject(projectile.object);
    }
    this.entities = [];
    this.projectiles = [];
    this.ambushTriggered = false;
    this.sector = getSector(sectorId);
    this.rng = new SeededRandom(hashString(`${sectorId}:${Date.now()}`));
    this.scene.fog = new THREE.FogExp2(this.sector.ambient, 0.00095);

    this.playerPosition.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = Math.min(this.speed, 35);
    this.updateCamera();

    this.spawnStaticWorld();
    const missionSeed = preserveMissionSeed ? 0 : this.rng.int(1, 9999);
    this.activeMission = createMission(this.sector, missionSeed);
    this.spawnTraffic();
    this.spawnMissionObjective();
    this.updateMissionBriefing();
    this.log(`${this.sector.name} traffic grid acquired`);
  }

  private spawnStaticWorld(): void {
    const base = createBaseModel();
    base.position.set(-160, -18, -420);
    this.scene.add(base);
    this.entities.push(this.makeEntity('base', 'neutral', base, 42, Infinity, 'Waybase'));

    const planet = createPlanetModel(this.sector.ambient);
    planet.position.set(340, -90, -700);
    this.scene.add(planet);
    this.entities.push(this.makeEntity('planet', 'neutral', planet, 78, Infinity, 'Outpost planet'));

    const gate = createGateModel();
    gate.position.set(0, 0, -920);
    this.scene.add(gate);
    this.entities.push(this.makeEntity('gate', 'neutral', gate, GATE_RADIUS, Infinity, 'Warp Gate'));

    const blackMarket = createBlackMarketModel();
    blackMarket.position.set(-420, 70, -620);
    this.scene.add(blackMarket);
    this.entities.push(this.makeEntity('blackMarket', 'neutral', blackMarket, BLACK_MARKET_RADIUS, Infinity, 'Black beacon'));
  }

  private spawnTraffic(): void {
    for (let index = 0; index < 5; index += 1) {
      this.spawnShip('pirate', this.randomSectorPoint(280, 780));
    }
    for (let index = 0; index < 5; index += 1) {
      this.spawnShip('trader', this.randomSectorPoint(220, 720));
    }
    for (let index = 0; index < 2; index += 1) {
      this.spawnShip('police', this.randomSectorPoint(200, 680));
    }
  }

  private spawnMissionObjective(): void {
    if (this.activeMission.type === 'bounty') {
      const target = this.spawnShip('pirate', new THREE.Vector3(120, 40, -360));
      target.missionTarget = true;
      target.label = 'Raider ace';
      this.activeMission = { ...this.activeMission, targetId: target.id };
      return;
    }

    if (this.activeMission.type === 'rescue') {
      const pod = this.spawnCargo({ type: 'rescuePod', amount: 1 }, new THREE.Vector3(260, 95, -520));
      pod.missionRole = 'rescue';
      this.activeMission = { ...this.activeMission, targetId: pod.id };
      return;
    }

    if (this.activeMission.type === 'courier') {
      const crate = this.spawnCargo({ type: 'legalCargo', amount: 1 }, new THREE.Vector3(-260, 80, -500));
      crate.missionRole = 'courier';
      this.activeMission = { ...this.activeMission, targetId: crate.id };
      return;
    }

    if (this.activeMission.type === 'smuggling') {
      const crate = this.spawnCargo({ type: 'contraband', amount: 1 }, new THREE.Vector3(220, -35, -430));
      crate.missionRole = 'smuggling';
      this.activeMission = { ...this.activeMission, targetId: crate.id };
      return;
    }

    const beacon = createBeaconModel(COLORS.warning === '#ff4d61' ? 0xff4d61 : COLORS.pirate);
    beacon.position.set(110, 65, -410);
    this.scene.add(beacon);
    const entity = this.makeEntity('beacon', 'neutral', beacon, 16, Infinity, 'Distress signal');
    entity.missionRole = 'ambush';
    this.entities.push(entity);
    this.activeMission = { ...this.activeMission, targetId: entity.id };
  }

  private spawnShip(kind: ShipKind, position = this.randomSectorPoint(230, 760)): WorldEntity {
    const object =
      kind === 'pirate'
        ? createPirateModel()
        : kind === 'police'
          ? createPoliceModel()
          : this.rng.next() > 0.42
            ? createTraderHaulerModel()
            : createTraderUfoModel();
    object.position.copy(position);
    object.scale.setScalar(kind === 'trader' ? 1.15 : 1);
    this.scene.add(object);

    const faction: Faction = kind;
    const hull = kind === 'police' ? 86 : kind === 'trader' ? 80 : 58;
    const radius = kind === 'trader' ? 11 : 9;
    const entity = this.makeEntity(kind, faction, object, radius, hull, kind);
    entity.fireCooldown = this.rng.range(0.4, 1.6);
    this.entities.push(entity);
    return entity;
  }

  private makeEntity(
    kind: EntityKind,
    faction: Faction,
    object: THREE.Object3D,
    radius: number,
    hull: number,
    label: string
  ): WorldEntity {
    return {
      id: this.nextId(kind),
      kind,
      faction,
      object,
      radius,
      hull,
      maxHull: hull,
      velocity: new THREE.Vector3(),
      fireCooldown: 0,
      scanCooldown: 0,
      provoked: false,
      defenseTargetId: null,
      missionTarget: false,
      missionRole: null,
      cargoDrop: null,
      waypoint: this.randomSectorPoint(240, 760),
      pulse: this.rng.range(0, Math.PI * 2),
      label
    };
  }

  private randomSectorPoint(minDistance: number, maxDistance: number): THREE.Vector3 {
    const direction = this.randomDirection(this.rng.range(minDistance, maxDistance));
    if (direction.z > -80) {
      direction.z -= maxDistance * 0.7;
    }
    return direction;
  }

  private randomDirection(radius: number): THREE.Vector3 {
    const yaw = this.rng.range(-Math.PI, Math.PI);
    const pitch = this.rng.range(-0.72, 0.72);
    return vectorFromSpherical(radius, yaw, pitch);
  }

  private createStarField(): { geometry: THREE.BufferGeometry; positions: Float32Array; points: THREE.Points } {
    const count = 1100;
    const positions = new Float32Array(count * 3);
    const color = new THREE.Color();
    const colors = new Float32Array(count * 3);
    const rng = new SeededRandom(124812);

    for (let index = 0; index < count; index += 1) {
      const direction = vectorFromSpherical(rng.range(120, 1700), rng.range(-Math.PI, Math.PI), rng.range(-1.1, 1.1));
      positions[index * 3] = direction.x;
      positions[index * 3 + 1] = direction.y;
      positions[index * 3 + 2] = direction.z;
      color.setHSL(rng.range(0.45, 0.62), 0.7, rng.range(0.55, 0.9));
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 3.2,
      map: createStarTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      alphaTest: 0.04,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    return {
      geometry,
      positions,
      points: new THREE.Points(geometry, material)
    };
  }

  private createSpark(position: THREE.Vector3, color: number): void {
    const group = new THREE.Group();
    group.position.copy(position);
    const parts: THREE.LineSegments[] = [];
    const velocities: THREE.Vector3[] = [];
    for (let index = 0; index < 5; index += 1) {
      const segment = createProjectileModel(color);
      segment.scale.setScalar(0.45);
      group.add(segment);
      parts.push(segment);
      velocities.push(this.randomDirection(this.rng.range(12, 38)));
    }
    this.scene.add(group);
    this.explosions.push({ object: group, parts, velocities, life: 0.18, maxLife: 0.18 });
  }

  private createExplosion(position: THREE.Vector3, faction: Faction): void {
    const group = new THREE.Group();
    group.position.copy(position);
    const color = faction === 'pirate' ? COLORS.pirate : faction === 'police' ? COLORS.police : faction === 'trader' ? COLORS.trader : COLORS.cargo;
    const parts: THREE.LineSegments[] = [];
    const velocities: THREE.Vector3[] = [];
    for (let index = 0; index < 16; index += 1) {
      const part = createProjectileModel(color);
      part.rotation.set(this.rng.next() * Math.PI, this.rng.next() * Math.PI, this.rng.next() * Math.PI);
      part.scale.setScalar(this.rng.range(0.35, 1.4));
      group.add(part);
      parts.push(part);
      velocities.push(this.randomDirection(this.rng.range(28, 92)));
    }
    this.scene.add(group);
    this.explosions.push({ object: group, parts, velocities, life: 0.62, maxLife: 0.62 });
  }

  private removeProjectile(projectile: Projectile): void {
    this.scene.remove(projectile.object);
    disposeObject(projectile.object);
    this.projectiles = this.projectiles.filter((item) => item !== projectile);
  }

  private removeEntity(entity: WorldEntity): void {
    this.scene.remove(entity.object);
    disposeObject(entity.object);
    this.entities = this.entities.filter((item) => item !== entity);
  }

  private getForwardVector(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.playerQuaternion).normalize();
  }

  private nextId(prefix: string): string {
    this.entityId += 1;
    return `${prefix}-${this.entityId}`;
  }

  private colorForCargo(type: CargoType): number {
    if (type === 'rareMineral') return COLORS.mineral;
    if (type === 'contraband') return COLORS.contraband;
    if (type === 'weaponCore') return 0xff6b25;
    if (type === 'shieldCell') return 0x7edcff;
    if (type === 'rescuePod') return 0xffffff;
    return COLORS.cargo;
  }

  private formatCargoName(type: CargoType): string {
    if (type === 'credits') return 'credits';
    if (type === 'legalCargo') return 'legal cargo';
    if (type === 'rareMineral') return this.sector.mineralName;
    if (type === 'weaponCore') return 'weapon core';
    if (type === 'shieldCell') return 'shield cell';
    if (type === 'rescuePod') return 'rescue pod';
    return 'contraband';
  }

  private logPickup(drop: CargoDrop): void {
    if (drop.type === 'credits') {
      this.log(`Cash salvage +${CARGO_VALUES.credits * drop.amount}`);
      return;
    }
    if (drop.type === 'rareMineral') {
      this.log(`${this.sector.mineralName} recovered`);
      return;
    }
    if (drop.type === 'weaponCore') {
      this.log(`Weapon core synced: ${getWeaponSpec(this.progress.weaponLevel).mode} ${this.progress.weaponLevel}`);
      return;
    }
    if (drop.type === 'shieldCell') {
      this.log('Shield cell absorbed');
      return;
    }
    if (drop.type === 'rescuePod') {
      this.log('Rescue pod secured');
      return;
    }
    this.log(`${drop.type} secured`);
  }

  private log(text: string): void {
    this.messages.unshift({ text, ttl: 5 });
    this.messages = this.messages.slice(0, 5);
  }

  private lockPointer(): void {
    const lockResult = this.renderer.domElement.requestPointerLock() as unknown;
    if (lockResult instanceof Promise) {
      void lockResult.catch(() => undefined);
    }
  }

  private updateHud(): void {
    sectorName.textContent = this.sector.name.toUpperCase();
    const sectorRep = this.progress.sectorReputation[this.sector.id] ?? 'clean';
    const wantedHere = wantedAppliesInSector(this.progress.wanted, this.sector.id);
    reputation.textContent = wantedHere ? `HEAT ${this.progress.wanted.heat}` : sectorRep.toUpperCase();
    reputation.classList.toggle('danger', sectorRep === 'pirate' || wantedHere);
    missionTitle.textContent = this.activeMission.title.toUpperCase();
    missionProgress.textContent = `${this.activeMission.status.toUpperCase()} ${this.activeMission.progress} / ${this.activeMission.goal}`;
    cargoReadout.textContent = this.formatCargo();
    creditReadout.textContent = `${formatCredits(this.progress.credits)}  SCORE ${Math.floor(this.progress.score)}`;
    hullReadout.textContent = Math.ceil(this.progress.hull).toString();
    shieldReadout.textContent = Math.ceil(this.progress.shield).toString();
    const weaponSpec = getWeaponSpec(this.progress.weaponLevel);
    weaponReadout.textContent = `${weaponSpec.mode} ${this.progress.weaponLevel}`;
    speedReadout.textContent = Math.floor(this.speed).toString();
    wantedBanner.classList.toggle('active', wantedHere);
    messageLog.textContent = this.messages.map((message) => message.text).join('\n');
    this.drawRadar();
  }

  private formatCargo(): string {
    const items = [
      this.progress.inventory.legalCargo ? `L ${this.progress.inventory.legalCargo}` : '',
      this.progress.inventory.rareMineral ? `M ${this.progress.inventory.rareMineral}` : '',
      this.progress.inventory.contraband ? `X ${this.progress.inventory.contraband}` : '',
      this.progress.inventory.rescuePods ? `POD ${this.progress.inventory.rescuePods}` : ''
    ].filter(Boolean);
    return items.length ? items.join('  ') : 'EMPTY';
  }

  private drawRadar(): void {
    const size = radar.width;
    const center = size / 2;
    radarContext.clearRect(0, 0, size, size);
    radarContext.strokeStyle = 'rgba(70, 255, 189, 0.72)';
    radarContext.lineWidth = 1;
    radarContext.beginPath();
    radarContext.arc(center, center, center - 8, 0, Math.PI * 2);
    radarContext.stroke();
    radarContext.beginPath();
    radarContext.moveTo(center, 8);
    radarContext.lineTo(center, size - 8);
    radarContext.moveTo(8, center);
    radarContext.lineTo(size - 8, center);
    radarContext.stroke();

    const inverse = this.playerQuaternion.clone().invert();
    for (const entity of this.entities) {
      const relative = entity.object.position.clone().sub(this.playerPosition).applyQuaternion(inverse);
      const distance = relative.length();
      if (distance > RADAR_RANGE) {
        continue;
      }
      const x = center + (relative.x / RADAR_RANGE) * (center - 13);
      const y = center + (relative.z / RADAR_RANGE) * (center - 13);
      const color =
        entity.kind === 'cargo' && entity.cargoDrop
          ? `#${this.colorForCargo(entity.cargoDrop.type).toString(16).padStart(6, '0')}`
          : entity.kind === 'pirate'
          ? '#ff3048'
          : entity.kind === 'trader'
            ? '#24ff7a'
            : entity.kind === 'police'
              ? '#72c8ff'
              : entity.kind === 'gate'
                ? '#ffd15c'
                : entity.kind === 'blackMarket'
                  ? '#ff3df2'
                  : '#ffd15c';
      if (entity.kind === 'gate') {
        radarContext.strokeStyle = color;
        radarContext.lineWidth = 2;
        radarContext.beginPath();
        radarContext.moveTo(x - 6, y);
        radarContext.lineTo(x + 6, y);
        radarContext.moveTo(x, y - 6);
        radarContext.lineTo(x, y + 6);
        radarContext.stroke();
      } else if (entity.kind === 'cargo') {
        radarContext.fillStyle = color;
        radarContext.strokeStyle = color;
        radarContext.lineWidth = 1;
        radarContext.beginPath();
        radarContext.moveTo(x, y - 5);
        radarContext.lineTo(x + 5, y + 4);
        radarContext.lineTo(x - 5, y + 4);
        radarContext.closePath();
        radarContext.fill();
        radarContext.stroke();
      } else {
        radarContext.fillStyle = color;
        radarContext.fillRect(x - 2, y - 2, 4, 4);
      }
    }
  }

  private exposeDebugControls(): void {
    window.vectorShooterDebug = {
      getState: () => {
        const wantedHere = wantedAppliesInSector(this.progress.wanted, this.sector.id);
        return {
          sector: this.sector.id,
          entityCount: this.entities.length,
          wanted: this.progress.wanted.active,
          wantedHere,
          wantedSector: this.progress.wanted.sectorId,
          wantedReason: this.progress.wanted.reason,
          policeCount: this.entities.filter((entity) => entity.kind === 'police').length,
          credits: this.progress.credits,
          weaponLevel: this.progress.weaponLevel,
          weaponMode: getWeaponSpec(this.progress.weaponLevel).mode,
          mission: this.activeMission.type,
          pitch: this.pitch,
          nearestPlanetDistance: this.nearestDistanceToKind('planet'),
          playerShots: this.projectiles.filter((projectile) => projectile.faction === 'player').length,
          hostileShots: this.projectiles.filter((projectile) => projectile.faction !== 'player').length,
          shotInterceptions: this.shotInterceptions,
          shield: this.progress.shield,
          hull: this.progress.hull,
          hitCallout: hitCallout.textContent ?? '',
          briefingTitle: modelTitle.textContent ?? '',
          briefingCount: modelCount.textContent ?? '',
          missionBriefTitle: missionBriefTitle.textContent ?? '',
          missionBriefObjective: missionBriefObjective.textContent ?? '',
          messageLog: messageLog.textContent ?? '',
          warpCueFlashing: this.activeMission.status === 'complete',
          deathTimer: deathTimer.textContent ?? '',
          npcShipHits: this.npcShipHits,
          npcCargoPickups: this.npcCargoPickups,
          cargoCount: this.entities.filter((entity) => entity.kind === 'cargo').length
        };
      },
      grantCargo: (type: CargoType, amount = 1) => {
        this.progress = applyCargoPickup(this.progress, { type, amount });
      },
      triggerTraderAttack: () => {
        const trader = this.entities.find((entity) => entity.kind === 'trader');
        if (trader) {
          this.damageEntity(trader, 4);
        }
      },
      hitNearestPirate: () => {
        const pirate = this.entities.find((entity) => entity.kind === 'pirate');
        if (pirate) {
          this.damageEntity(pirate, 4);
        }
      },
      triggerWarp: () => {
        this.beginWarp(nextSectorId(this.sector.id));
      },
      ramNearestPlanet: () => {
        const planet = this.entities.find((entity) => entity.kind === 'planet');
        if (!planet) {
          return;
        }
        this.playerPosition.copy(planet.object.position);
        this.speed = 120;
        this.resolveSolidCollisions();
        this.updateCamera();
      },
      spawnIncomingBolt: () => {
        const forward = this.getForwardVector();
        const position = this.playerPosition.clone().addScaledVector(forward, 78);
        this.spawnProjectile('pirate', position, forward.clone().multiplyScalar(-1), 170, 8, COLORS.pirate, 8.2, 24, 2.2);
      },
      forceNpcCrossfire: () => {
        let pirate = this.entities.find((entity) => entity.kind === 'pirate');
        let police = this.entities.find((entity) => entity.kind === 'police');
        if (!pirate) {
          pirate = this.spawnShip('pirate', this.playerPosition.clone().add(new THREE.Vector3(0, 0, -220)));
        }
        if (!police) {
          police = this.spawnShip('police', this.playerPosition.clone().add(new THREE.Vector3(0, 0, -150)));
        }

        pirate.object.position.copy(this.playerPosition.clone().add(new THREE.Vector3(0, 0, -220)));
        police.object.position.copy(this.playerPosition.clone().add(new THREE.Vector3(0, 0, -150)));
        pirate.velocity.set(0, 0, 0);
        police.velocity.set(0, 0, 0);
        const direction = police.object.position.clone().sub(pirate.object.position).normalize();
        this.spawnProjectile('pirate', pirate.object.position.clone().addScaledVector(direction, 12), direction, 210, 8, COLORS.pirate, 8.2, 24, 1.2, pirate.id, 'police');
      },
      forceNpcPickup: (kind: ShipKind, type: CargoType) => {
        const position = this.playerPosition.clone().add(new THREE.Vector3(3200, kind === 'pirate' ? 0 : kind === 'police' ? 120 : -120, -220));
        const ship = this.spawnShip(kind, position);
        ship.object.position.copy(position);
        ship.velocity.set(0, 0, 0);
        const pickup = this.spawnCargo({ type, amount: 1 }, position.clone());
        this.updatePickups(0);
        const collected = !this.entities.includes(pickup);
        if (!collected) {
          this.removeEntity(pickup);
        }
        this.removeEntity(ship);
        return collected;
      },
      forcePirateHit: () => {
        this.damagePlayer(12, 'pirate');
      },
      forcePlayerDeath: () => {
        this.damagePlayer(260, 'pirate');
      },
      completeActiveMission: () => {
        this.finishMission();
      },
      lookByMouse: (movementX: number, movementY: number) => {
        this.applyMouseLook(movementX, movementY);
      }
    };
  }

  private nearestDistanceToKind(kind: EntityKind): number | null {
    let nearest: number | null = null;
    for (const entity of this.entities) {
      if (entity.kind !== kind) {
        continue;
      }
      const distance = entity.object.position.distanceTo(this.playerPosition);
      nearest = nearest === null ? distance : Math.min(nearest, distance);
    }
    return nearest;
  }
}

const game = new VectorShooterGame();
game.run();
