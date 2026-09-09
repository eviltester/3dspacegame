/**
 * Short application-wiring checks. Only device APIs are stubbed; game
 * decisions are covered separately by source-adjacent unit tests.
 */
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { ArcadeGame } from '../../../src/game';
import { SoundBank } from '../../../src/sound';
import type { GameMode } from '../../../src/arcade';

vi.mock('three', async importOriginal => {
  const three = await importOriginal<typeof import('three')>();
  return { ...three, WebGLRenderer: class {
    domElement = document.createElement('canvas');
    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
    dispose() {}
    render(scene: import('three').Scene, camera: import('three').Camera) {
      scene.updateMatrixWorld(); camera.updateMatrixWorld();
    }
  } };
});

const context = {
  save() {}, restore() {}, clearRect() {}, fillRect() {}, fillText() {},
  scale() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
  arc() {}, ellipse() {}, rect() {}, stroke() {}, fill() {}, setLineDash() {}
} as unknown as CanvasRenderingContext2D;

const listeners: Array<() => void> = [];
const pointer: { element: Element | null } = { element: null };

beforeEach(() => {
  // Each case owns its listeners, DOM, storage and deterministic display clock.
  // This also permits reloading an application inside one persistence test.
  for (const target of [window, document]) {
    const add = target.addEventListener.bind(target);
    vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
      add(type, listener, options);
      listeners.push(() => target.removeEventListener(type, listener, options));
    });
  }
  localStorage.clear(); sessionStorage.clear(); pointer.element = null;
  vi.spyOn(Date, 'now').mockReturnValue(41717);
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  vi.spyOn(SoundBank.prototype, 'start').mockResolvedValue();
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => pointer.element });
  document.exitPointerLock = () => { pointer.element = null; document.dispatchEvent(new Event('pointerlockchange')); };
  HTMLCanvasElement.prototype.requestPointerLock = function () {
    pointer.element = this; document.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve();
  };
  vi.stubGlobal('requestAnimationFrame', () => 1);
});
afterEach(() => {
  for (const remove of listeners.splice(0)) remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

export class GameHarness {
  readonly app: ArcadeGame;
  constructor() {
    document.body.innerHTML = '<div id="app"></div>';
    this.app = new ArcadeGame();
  }
  get debug() { return window.vectorShooterDebug; }
  state() { return this.debug.getState(); }
  text(selector: string) { return document.querySelector(selector)?.textContent ?? ''; }
  async action(name: string): Promise<void> {
    const button = document.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
    expect(button, `menu action ${name}`).not.toBeNull();
    expect(button!.disabled, `enabled action ${name}`).toBe(false);
    expect(button!.closest('[hidden], [inert]'), `visible action ${name}`).toBeNull();
    button!.click();
    // Flush the audio-start / input-engage promise chain, never wall-clock sleep.
    await Promise.resolve(); await Promise.resolve();
  }
  async start(mode: GameMode = 'journey') {
    await this.action(`mode:${mode}`); await this.action('newRun');
    if (mode === 'journey' || mode === 'endless') {
      expect(this.state().menu).toBe('briefing'); await this.action('launch');
    }
    expect(this.state().menu).toBe('');
    // Most adapter checks begin in controllable flight. Cinematic timing has its
    // own direct controller tests and explicit transition-wiring cases.
    if (mode === 'invaders') this.step(1.2);
  }
  stage(number: number) {
    this.debug.setStage(number);
    if (this.state().mode === 'invaders') this.step(1.2);
  }
  step(seconds: number) { this.debug.step(seconds); }
}
