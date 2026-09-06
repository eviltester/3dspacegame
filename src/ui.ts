import * as THREE from 'three';
import { createCatalog, disposeObject } from './models';
import { drawVectorTitle } from './vector-title';

export const button = (action: string, label: string, extra = '') => `<button type="button" data-action="${action}" ${extra}>${label}</button>`;
export class GameUI {
  readonly viewport: HTMLDivElement;
  readonly overlay: HTMLDivElement;
  readonly radar: HTMLCanvasElement;
  readonly preview: THREE.WebGLRenderer;
  readonly previewScene = new THREE.Scene();
  readonly previewCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
  readonly catalog = createCatalog();
  private previewObject: THREE.Object3D | null = null;
  private scan = 0;
  private scanTime = 0;
  private title = 'VECTOR SHOOTER';
  private screen = 'title';
  constructor(action: (action: string) => void) {
    document.querySelector('#app')!.innerHTML = `
      <main class="game-shell">
        <div id="viewport" class="viewport"></div>
        <div class="hud">
          <section class="hud-panel sector-panel"><div id="stageLabel" class="hud-label">JOURNEY</div><div id="sectorName" class="hud-value"></div><div id="reputation" class="hud-small"></div></section>
          <section class="hud-panel mission-panel"><div id="missionTitle" class="hud-value"></div><div id="missionProgress" class="hud-small"></div></section>
          <section class="hud-panel cargo-panel"><div class="hud-label">SCORE</div><div id="scoreReadout" class="hud-value">000000</div><div id="creditReadout" class="hud-small"></div><div id="cargoReadout" class="hud-small"></div></section>
          <div id="reticle" class="reticle"><span></span><span></span><span></span><span></span></div>
          <div id="hitConfirm" class="hit-confirm">+</div>
          <div id="objectiveArrow" class="objective-arrow"></div>
          <div id="threatArrow" class="threat-arrow"></div>
          <div id="hitCallout" class="hit-callout"></div><div id="wantedBanner" class="wanted-banner">WANTED</div>
          <div id="messageLog" class="message-log"></div><div id="scorePopup" class="score-popup"></div>
          <canvas id="radar" class="radar" width="180" height="180" aria-label="Radar"></canvas>
          <div class="bottom-strip"><div><span class="hud-label">HULL</span><strong id="hullReadout"></strong></div><div><span class="hud-label">SHIELD</span><strong id="shieldReadout"></strong></div><div><span class="hud-label">WEAPON</span><strong id="weaponReadout"></strong></div><div><span class="hud-label">THROTTLE</span><strong id="speedReadout"></strong></div></div>
          <div class="arcade-strip"><span id="livesReadout"></span><span id="chainReadout"></span><span id="chargeReadout"></span></div>
        </div>
        <div class="flight-buttons">${button('pause', '||', 'id="pauseButton" aria-label="Pause" title="Pause (middle mouse button)"')}${button('exitBonus', 'EXIT BONUS', 'id="bonusExitButton" hidden')}${button('nextWave', 'NEXT WAVE', 'id="nextWaveButton" hidden')}</div>
        <div id="damageLayer" class="damage-layer"></div><div id="warpLayer" class="warp-layer"></div>
        <div id="launchOverlay" class="launch-overlay">
          <div class="arcade-menu">
            <header class="arcade-header"><div class="arcade-scores"><span>1UP <strong id="arcadeScore">000000</strong></span><span>HI SCORE <strong id="arcadeBest">000000</strong></span></div><h1 id="launchTitle" class="screen-reader-only">VECTOR SHOOTER</h1><canvas id="vectorTitle" class="vector-title" aria-hidden="true"></canvas><p id="briefingStatus" class="briefing-status"></p></header>
            <div class="menu-layout"><div id="screenContent"></div>
              <section id="catalogSection" class="model-card" aria-label="Game objects"><div class="model-kicker"><p class="briefing-status">OBJECT SCAN</p><p id="modelCount"></p></div><div id="modelPreview" class="model-preview"></div><div class="model-copy"><h2 id="modelTitle"></h2><p id="modelDescription"></p></div><div class="scan-buttons">${button('scanPrevious', '<', 'aria-label="Previous object" title="Previous object"')}${button('scanNext', '>', 'aria-label="Next object" title="Next object"')}</div></section>
            </div>
          </div>
        </div>
      </main>`;
    this.viewport = document.querySelector('#viewport')!;
    this.overlay = document.querySelector('#launchOverlay')!;
    this.radar = document.querySelector('#radar')!;
    this.preview = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.preview.setPixelRatio(Math.min(devicePixelRatio, 2));
    document.querySelector('#modelPreview')!.append(this.preview.domElement);
    document.querySelector('#app')!.addEventListener('click', event => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      if (!target || target.disabled) return;
      if (target.dataset.action === 'scanPrevious') this.changeScan(-1);
      else if (target.dataset.action === 'scanNext') this.changeScan(1);
      else action(target.dataset.action!);
    });
    window.addEventListener('keydown', event => {
      if (this.overlay.hidden || !['title', 'briefing'].includes(this.screen)) return;
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') { event.preventDefault(); this.changeScan(event.code === 'ArrowLeft' ? -1 : 1); }
    });
    this.changeScan(0);
  }
  text(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element && element.textContent !== value) element.textContent = value;
  }
  show(screen: string, title: string, status: string, content: string): void {
    this.screen = screen;
    this.title = title;
    this.overlay.hidden = false;
    this.overlay.classList.remove('hidden');
    this.overlay.dataset.mode = screen;
    this.overlay.scrollTop = 0;
    this.text('launchTitle', title);
    this.text('briefingStatus', status);
    document.querySelector('#screenContent')!.innerHTML = content;
    const catalog = document.querySelector<HTMLElement>('#catalogSection')!;
    catalog.hidden = screen !== 'title' && screen !== 'briefing';
    this.overlay.classList.toggle('compact-menu', catalog.hidden);
    this.resize();
  }
  hide(): void { this.overlay.hidden = true; this.overlay.classList.add('hidden'); }
  resize(): void {
    const canvas = document.querySelector<HTMLCanvasElement>('#vectorTitle')!;
    drawVectorTitle(canvas, this.title, this.screen === 'gameover' ? '#ff5050' : '#ffff70');
    const bounds = document.querySelector('#modelPreview')!.getBoundingClientRect();
    const width = Math.max(180, bounds.width);
    const height = Math.max(160, bounds.height);
    this.preview.setSize(width, height, false);
    this.previewCamera.aspect = width / height;
    this.previewCamera.updateProjectionMatrix();
  }
  private changeScan(direction: number): void {
    this.scan = (this.scan + direction + this.catalog.length) % this.catalog.length;
    this.scanTime = 0;
    if (this.previewObject) { this.previewScene.remove(this.previewObject); disposeObject(this.previewObject); }
    const item = this.catalog[this.scan];
    this.previewObject = item.create();
    this.previewObject.scale.setScalar(item.scale);
    this.previewObject.rotation.set(0.35, -0.5, 0);
    this.previewScene.add(this.previewObject);
    this.previewCamera.position.z = item.cameraZ;
    this.text('modelTitle', item.title);
    this.text('modelDescription', item.description);
    this.text('modelCount', `${this.scan + 1}/${this.catalog.length}`);
  }
  tick(dt: number): void {
    if (this.overlay.hidden || !['title', 'briefing'].includes(this.screen)) return;
    this.scanTime += dt;
    if (this.scanTime >= 5) this.changeScan(1);
    if (this.previewObject) this.previewObject.rotation.y += dt * 0.55;
    this.preview.render(this.previewScene, this.previewCamera);
  }
}

export const CONTROLS = `<section class="controls-card"><h2>CONTROLS</h2><dl class="control-grid">
  <div><dt>MOUSE</dt><dd>Steer / aim</dd></div><div><dt>HOLD LEFT CLICK</dt><dd>Fire</dd></div>
  <div><dt>RIGHT CLICK</dt><dd>Charged blast</dd></div><div><dt>WHEEL / W / S</dt><dd>Forward / stop / reverse</dd></div>
  <div><dt>MIDDLE / ESC</dt><dd>Pause</dd></div><div><dt>LEFT / RIGHT</dt><dd>Browse object scan</dd></div>
  </dl></section>`;
