/**
 * Browser presentation shell: HUD elements, menu focus and rotating previews.
 * Menu buttons send named actions to ArcadeGame; displaying a view does not start
 * a mission or purchase anything by itself.
 */
import * as THREE from 'three';
import { MenuShell } from './menus/menu-shell';
import { createCatalog, disposeObject } from './models';
import { drawVectorTitle } from './vector-title';
import { ModePreview } from './menus/mode-preview';
import { MODE_INFO } from './modes';
import { ObjectScan } from './menus/object-scan';
import type { GameMode } from './modes';

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
  private readonly shell: MenuShell;
  private get screen() { return this.shell.screen; }
  private demo: ModePreview | null = null;
  constructor(action: (action: string) => void) {
    this.shell = new MenuShell(document.querySelector('#app')!, action, direction => this.changeScan(direction));
    this.viewport = this.shell.viewport; this.overlay = this.shell.overlay; this.radar = this.shell.radar;
    this.preview = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.preview.setPixelRatio(Math.min(devicePixelRatio, 2));
    document.querySelector('#modelPreview')!.append(this.preview.domElement);
    this.changeScan(0);
  }
  selectMode(mode: GameMode): void {
    if (this.demo?.mode !== mode) { this.demo?.dispose(); this.demo = new ModePreview(mode); }
    this.text('modePreviewName', MODE_INFO[mode].name); this.text('modePreviewTagline', MODE_INFO[mode].summary);
  }
  text(id: string, value: string): void { this.shell.text(id, value); }
  show(screen: string, title: string, status: string, content: string): void {
    this.shell.show(screen, title, status, content);
    // Reuse one preview renderer/context between the title demo and object guide.
    document.querySelector(screen === 'title' ? '#modeDemo' : '#modelPreview')!.append(this.preview.domElement);
    this.resize();
  }
  hide(): void { this.shell.hide(); }
  resize(): void {
    const canvas = document.querySelector<HTMLCanvasElement>('#vectorTitle')!;
    drawVectorTitle(canvas, this.shell.title, this.screen === 'gameover' ? '#ff5050' : '#ffff70');
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
