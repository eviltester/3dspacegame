/**
 * Shared browser fixture. Each test receives an isolated page/profile and this
 * driver; failures include browser errors, screenshots and a Playwright trace.
 * Explicit debug helpers arrange edge cases; they are not simulated user actions.
 */
import { test as base, expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { PNG } from 'pngjs';
import type { BonusKind, GameMode } from '../../../src/arcade';

declare global {
  interface Window {
    testAudio: { contexts: AudioContext[]; samples: number[] };
  }
}

export class GameDriver {
  cursor = { x: 720, y: 450 };
  constructor(readonly page: Page, readonly info: TestInfo) {}
  async open(): Promise<void> {
    await this.page.goto('/');
    await expect(this.page.locator('#launchTitle')).toHaveText('3D VECTOR SPACE SHOOTER');
    await expect(this.page).toHaveTitle('3D Vector Space Shooter');
    await this.page.waitForFunction(() => !!window.vectorShooterDebug);
  }
  state() { return this.page.evaluate(() => window.vectorShooterDebug.getState()); }
  asteroidFlight() {
    return this.page.evaluate(() => {
      const state = window.vectorShooterDebug.getState();
      return { bonus: state.bonus, view: state.view, flight: state.bonusAsteroids };
    });
  }
  canyonFlight() {
    return this.page.evaluate(() => {
      const state = window.vectorShooterDebug.getState(), course = state.bonusCourse;
      return { bonus: state.bonus, view: state.view, course: course && {
        gates: course.gates, shots: course.shots, speed: course.speed, fired: course.fired, passed: course.passed, offset: course.offset
      } };
    });
  }
  // Advance actual fixed-step gameplay without waiting wall-clock seconds. This
  // does not grant resources, hit targets or bypass collision/mission rules.
  step(seconds: number) { return this.page.evaluate(t => window.vectorShooterDebug.step(t), seconds); }
  async action(name: string): Promise<void> {
    const button = this.page.locator(`#screenContent [data-action="${name}"]`);
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    if (!box) throw new Error(`Missing action: ${name}`);
    this.cursor = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await button.click();
  }
  async engage(name = 'launch', requirePointerLock = true): Promise<void> {
    await this.action(name);
    // Rapid fixture-driven checkpoint traversal may use the game's pointer-lock fallback.
    // Real mouse-flight tests always require actual pointer lock.
    if (requirePointerLock) await expect.poll(() => this.page.evaluate(() => document.pointerLockElement === document.querySelector('#viewport canvas'))).toBe(true);
    await expect.poll(async () => (await this.state()).menu).toBe('');
  }
  async start(mode: GameMode = 'journey'): Promise<void> {
    await this.action(`mode:${mode}`); await this.action('newRun'); await this.engage();
  }
  async pause(): Promise<void> {
    await this.page.mouse.down({ button: 'middle' });
    await expect.poll(async () => (await this.state()).menu).toBe('pause');
    await this.page.mouse.up({ button: 'middle' });
  }
  async unlockWarp(): Promise<void> {
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'b', 'a']) await this.page.keyboard.press(key);
    await this.action('levelWarp');
  }
  async warpStage(stage: number, mode: GameMode = 'journey'): Promise<void> {
    if (mode === 'journey') { await this.page.locator('#warpStage').selectOption(String(stage)); await this.action('warpJourney'); }
    else {
      const [field, action] = { endless: ['warpWave', 'warpEndless'], invaders: ['warpInvaders', 'warpInvaders'], smuggler: ['warpSmuggler', 'warpSmuggler'] }[mode];
      await this.page.locator(`#${field}`).fill(String(stage)); await this.action(action);
    }
  }
  async bonus(kind: BonusKind, difficulty = 1): Promise<void> {
    await this.page.locator('#warpDifficulty').selectOption(String(difficulty));
    await this.action(`warpBonus:${kind}`); await this.engage('bonusPlay');
  }
  async move(dx: number, dy: number): Promise<void> {
    this.cursor.x += dx; this.cursor.y += dy;
    await this.page.mouse.move(this.cursor.x, this.cursor.y);
  }
  async finish(): Promise<void> {
    // Deliberate shortcut for checkpoint/menu wiring tests, never mouse playthroughs.
    await this.page.evaluate(() => window.vectorShooterDebug.finishEncounter()); await this.step(1 / 60);
  }
  async gate(): Promise<void> {
    await this.page.evaluate(() => window.vectorShooterDebug.reachGate()); await this.step(2.2);
  }
  async screenshot(name: string, selector = '#viewport canvas'): Promise<Buffer> {
    // Assert visible canvas pixels rather than a brittle exact screenshot match.
    // Individual rendering tests compare frames to also check motion/transparency.
    const buffer = await this.page.locator(selector).screenshot();
    await this.info.attach(name, { body: buffer, contentType: 'image/png' });
    const png = PNG.sync.read(buffer);
    let lit = 0;
    for (let i = 0; i < png.data.length; i += 4) if (Math.max(png.data[i], png.data[i + 1], png.data[i + 2]) > 60) lit++;
    expect(lit, `${name} must render visible pixels`).toBeGreaterThan(300);
    return buffer;
  }
  async layout(): Promise<void> {
    const result = await this.page.evaluate(() => {
      const overlay = document.querySelector<HTMLElement>('#launchOverlay')!;
      const root = overlay.hidden ? document.querySelector<HTMLElement>('.hud')! : overlay;
      const overflow = [...root.querySelectorAll<HTMLElement>('button, dt, dd, h2, .model-copy p, #levelTimer, #stageLabel, #missionProgress')]
        .filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 2).map(el => el.id || el.textContent);
      const selectors = '.hud-panel,.radar,.bottom-strip,.message-log,.arcade-strip,.flight-buttons,#objectiveArrow,#threatArrow,#hitCallout';
      const boxes = overlay.hidden ? [...document.querySelectorAll<HTMLElement>(selectors)]
        .filter(el => el.getClientRects().length && getComputedStyle(el).opacity !== '0')
        .map(el => ({ id: el.id || el.className, rect: el.getBoundingClientRect() })) : [];
      const overlaps: string[] = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].rect, b = boxes[j].rect;
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) overlaps.push(`${boxes[i].id} / ${boxes[j].id}`);
      }
      return { overflow, overlaps, wide: root.scrollWidth > innerWidth + 2 };
    });
    expect(result).toEqual({ overflow: [], overlaps: [], wide: false });
  }
}

export const test = base.extend<{ game: GameDriver }>({
  game: async ({ page }, use, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      // Observe genuine AudioContext/buffer starts; do not replace sound with a
      // silent stub. This proves playback was scheduled, not that speakers are on.
      const Context = window.AudioContext;
      window.testAudio = { contexts: [], samples: [] };
      window.AudioContext = class extends Context {
        constructor(options?: AudioContextOptions) { super(options); window.testAudio.contexts.push(this); }
      };
      // Capture the native method before wrapping it; call it with its original receiver below.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const createSource = Context.prototype.createBufferSource;
      Context.prototype.createBufferSource = function () {
        const source = createSource.call(this), start = source.start.bind(source);
        source.start = (...args) => { window.testAudio.samples.push(source.buffer?.length ?? 0); start(...args); };
        return source;
      };
    });
    await use(new GameDriver(page, info));
    expect(errors, 'browser console and page errors').toEqual([]);
  }
});
export { expect };
