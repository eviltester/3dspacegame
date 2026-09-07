/**
 * Browser presentation shell: HUD elements, menu focus and rotating previews.
 * Menu buttons send named actions to ArcadeGame; displaying a view does not start
 * a mission or purchase anything by itself.
 */
import * as THREE from 'three';
import { createCatalog, disposeObject } from './models';
import { drawVectorTitle } from './vector-title';
import { ModePreview } from './menus/mode-preview';
import { MODE_INFO } from './modes';
import { ObjectScan } from './menus/object-scan';
import type { GameMode } from './modes';

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
  private readonly scan = new ObjectScan(this.catalog.length);
  private title = '3D VECTOR SPACE SHOOTER';
  private screen = 'title';
  private demo: ModePreview | null = null;
  constructor(action: (action: string) => void) {
    document.querySelector('#app')!.innerHTML = `
      <main class="game-shell">
        <div id="viewport" class="viewport"></div>
        <div class="hud">
          <section class="hud-panel sector-panel"><div id="stageLabel" class="hud-label">JOURNEY</div><div id="sectorName" class="hud-value"></div><div id="reputation" class="hud-small"></div></section>
          <section class="hud-panel mission-panel"><div id="missionTitle" class="hud-value"></div><div id="missionProgress" class="hud-small"></div><div id="levelTimer" class="hud-small level-timer"><span id="levelClock"></span><span id="timeBonusReadout"></span></div></section>
          <section class="hud-panel cargo-panel"><div class="hud-label">SCORE</div><div id="scoreReadout" class="hud-value">000000</div><div id="creditReadout" class="hud-small"></div><div id="cargoReadout" class="hud-small"></div></section>
          <div id="reticle" class="reticle"><span></span><span></span><span></span><span></span></div>
          <div id="hitConfirm" class="hit-confirm">+</div>
          <div id="objectiveArrow" class="objective-arrow"></div>
          <div id="threatArrow" class="threat-arrow"></div>
          <div id="hitCallout" class="hit-callout"></div><div id="wantedBanner" class="wanted-banner">WANTED</div>
          <div id="messageLog" class="message-log"></div><div id="scorePopup" class="score-popup"></div>
          <canvas id="radar" class="radar" width="180" height="180" aria-label="Ship-relative 3D radar: contacts above or below the flight plane have vertical height lines"></canvas>
          <div class="bottom-strip"><div><span class="hud-label">HULL</span><strong id="hullReadout"></strong></div><div><span class="hud-label">SHIELD</span><strong id="shieldReadout"></strong></div><div><span class="hud-label">WEAPON</span><strong id="weaponReadout"></strong></div><div><span id="speedLabel" class="hud-label">THROTTLE</span><strong id="speedReadout"></strong></div></div>
          <div class="arcade-strip"><span id="livesReadout"></span><span id="chainReadout"></span><span id="chargeReadout"></span></div>
        </div>
        <div class="flight-buttons">${button('pause', '||', 'id="pauseButton" aria-label="Pause" title="Pause (Esc or hold wheel click)"')}${button('exitBonus', 'EXIT BONUS', 'id="bonusExitButton" hidden')}${button('nextWave', 'NEXT WAVE', 'id="nextWaveButton" hidden')}</div>
        <div id="damageLayer" class="damage-layer"></div><div id="protectionLayer" class="protection-layer" hidden></div><div id="warpLayer" class="warp-layer"></div>
        <div id="launchOverlay" class="launch-overlay">
          <div class="arcade-menu">
            <header class="arcade-header"><div class="arcade-scores"><span>1UP <strong id="arcadeScore">000000</strong></span><span>HI SCORE <strong id="arcadeBest">000000</strong></span></div><h1 id="launchTitle" class="screen-reader-only">3D VECTOR SPACE SHOOTER</h1><canvas id="vectorTitle" class="vector-title" aria-hidden="true"></canvas><p id="briefingStatus" class="briefing-status"></p></header>
            <div class="menu-layout"><div id="screenContent"></div>
              <section id="modePreviewSection" class="mode-preview-section" aria-label="Selected mode preview"><div id="modeDemo" class="mode-demo"></div><h2 id="modePreviewName"></h2><p id="modePreviewTagline"></p></section>
              <section id="catalogSection" class="model-card" aria-label="Ships and objects"><div class="model-kicker"><p class="briefing-status">SHIPS &amp; OBJECTS</p><p id="modelCount"></p></div><div id="modelPreview" class="model-preview"></div><div class="model-copy"><h2 id="modelTitle"></h2><p id="modelDescription"></p></div><div class="scan-buttons">${button('scanPrevious', '<', 'aria-label="Previous object" title="Previous object"')}${button('scanNext', '>', 'aria-label="Next object" title="Next object"')}</div><p class="scan-hint"><span>LEFT / RIGHT</span> Browse ships &amp; objects</p></section>
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
      if (this.overlay.hidden || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      if (event.code === 'Tab') {
        const items = [...this.overlay.querySelectorAll<HTMLElement>('button:not(:disabled), select, input')].filter(item => item.getClientRects().length);
        const target = event.shiftKey ? items.at(-1) : items[0];
        if (document.activeElement === (event.shiftKey ? items[0] : items.at(-1))) { event.preventDefault(); target?.focus(); }
      }
      if (!['objects', 'briefing'].includes(this.screen)) return;
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') { event.preventDefault(); this.changeScan(event.code === 'ArrowLeft' ? -1 : 1); }
    });
    this.changeScan(0);
  }
  selectMode(mode: GameMode): void {
    if (this.demo?.mode !== mode) { this.demo?.dispose(); this.demo = new ModePreview(mode); }
    this.text('modePreviewName', MODE_INFO[mode].name); this.text('modePreviewTagline', MODE_INFO[mode].summary);
  }
  text(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element && element.textContent !== value) element.textContent = value;
  }
  show(screen: string, title: string, status: string, content: string): void {
    // Preserve the selected action when a shop/settings view is rebuilt. Otherwise
    // prefer Resume/Play, so keyboard users do not lose their place after each click.
    const previousAction = this.screen === screen && document.activeElement instanceof HTMLElement ? document.activeElement.dataset.action : undefined;
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
    catalog.hidden = screen !== 'objects' && screen !== 'briefing';
    document.querySelector<HTMLElement>('#modePreviewSection')!.hidden = screen !== 'title';
    // Reuse one preview renderer/context between the title demo and object guide.
    document.querySelector(screen === 'title' ? '#modeDemo' : '#modelPreview')!.append(this.preview.domElement);
    this.overlay.classList.toggle('compact-menu', catalog.hidden && screen !== 'title');
    document.querySelector<HTMLElement>('.flight-buttons')!.inert = true;
    this.resize();
    const buttons = [...this.overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(item => item.getClientRects().length);
    const focus = buttons.find(item => item.dataset.action === previousAction) ?? this.overlay.querySelector<HTMLElement>('#resumeButton, #launchButton') ?? buttons[0];
    focus?.focus({ preventScroll: true });
  }
  hide(): void { this.overlay.hidden = true; this.overlay.classList.add('hidden'); document.querySelector<HTMLElement>('.flight-buttons')!.inert = false; }
  resize(): void {
    const canvas = document.querySelector<HTMLCanvasElement>('#vectorTitle')!;
    drawVectorTitle(canvas, this.title, this.screen === 'gameover' ? '#ff5050' : '#ffff70');
    const bounds = document.querySelector(this.screen === 'title' ? '#modeDemo' : '#modelPreview')!.getBoundingClientRect();
    const width = Math.max(180, bounds.width);
    const height = Math.max(160, bounds.height);
    this.preview.setSize(width, height, false);
    this.previewCamera.aspect = width / height;
    this.previewCamera.updateProjectionMatrix();
    this.demo?.resize(width / height);
  }
  private changeScan(direction: number): void {
    // Manual navigation wraps and restarts the full five-second reading window.
    // Models are fresh instances: rotating or disposing one cannot affect a ship.
    this.scan.move(direction);
    if (this.previewObject) { this.previewScene.remove(this.previewObject); disposeObject(this.previewObject); }
    const item = this.catalog[this.scan.index];
    this.previewObject = item.create();
    this.previewObject.scale.setScalar(item.scale);
    this.previewObject.rotation.set(0.35, -0.5, 0);
    this.previewScene.add(this.previewObject);
    this.previewCamera.position.z = item.cameraZ;
    this.text('modelTitle', item.title);
    this.text('modelDescription', item.description);
    this.text('modelCount', this.scan.label);
  }
  tick(dt: number): void {
    if (this.overlay.hidden || document.hidden) return;
    if (this.screen === 'title' && this.demo) { this.demo.tick(dt); this.preview.render(this.demo.scene, this.demo.camera); return; }
    if (!['objects', 'briefing'].includes(this.screen)) return;
    if (this.scan.tick(dt)) this.changeScan(0);
    if (this.previewObject) this.previewObject.rotation.y += dt * 0.55;
    this.preview.render(this.previewScene, this.previewCamera);
  }
}
