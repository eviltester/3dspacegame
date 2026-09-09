import { GAME_MODES, MODE_INFO } from '../../src/modes';
import { test, expect } from './fixtures/game';
import { PNG } from 'pngjs';

test.use({ trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true } });

for (const width of [1440, 390]) {
  test(`live title previews, weapon help and score panels fit ${width}px`, async ({ game, page }) => {
    await page.setViewportSize({ width, height: width > 650 ? 900 : 844 });
    await game.open();
    const saved = await page.evaluate(() => localStorage.getItem('vector-shooter-save-v2'));
    for (const mode of GAME_MODES) {
      await game.action(`mode:${mode}`); await game.layout();
      await expect(page.locator('#modePreviewName')).toHaveText(MODE_INFO[mode].name);
      await expect(page.locator('.title-modes > .briefing-status')).toHaveText('GAME MODES');
      const tools = page.getByRole('tab');
      await expect(tools).toHaveText(['GAME', 'INSTRUCTIONS', 'CONTROLS', 'HIGH SCORES', 'INFO DECK']);
      const rows = await tools.evaluateAll(items => items.map(item => item.getBoundingClientRect().top));
      expect(Math.max(...rows) - Math.min(...rows), 'pilot menu choices share one line').toBeLessThan(2);
      const description = (await page.locator('#weaponHelp').boundingBox())!;
      const demo = (await page.locator('#modeDemo').boundingBox())!;
      const tabs = (await page.locator('.information-tabs').boundingBox())!;
      expect(tabs.y + tabs.height).toBeLessThanOrEqual(demo.y);
      expect(demo.width).toBeLessThanOrEqual(320);
      expect(demo.height).toBe(120);
      const canvasAspect = await page.locator('#modeDemo canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width / canvas.height);
      expect(canvasAspect).toBeCloseTo(demo.width / demo.height, 2);
      expect(demo.y + demo.height).toBeLessThanOrEqual(description.y);
      const play = (await page.locator('.title-play').boundingBox())!;
      expect(play.y).toBeGreaterThan(description.y + description.height);
      const record = (await page.locator('.title-play .record-line').boundingBox())!;
      const playButton = (await page.locator('.title-play button').first().boundingBox())!;
      expect(record.y + record.height).toBeLessThanOrEqual(playButton.y);
      if (width > 650) {
        const choices = (await page.locator('.title-modes').boundingBox())!;
        const weapons = (await page.locator('.title-loadout').boundingBox())!;
        expect(play.x).toBeGreaterThan(choices.x + choices.width);
        expect(weapons.y).toBeGreaterThanOrEqual(demo.y + demo.height);
        expect(weapons.y + weapons.height).toBeLessThanOrEqual(description.y);
      }
      await expect(page.locator('#launchOverlay')).not.toContainText('ATTRACT MODE');
      await expect(page.locator('#launchOverlay')).not.toContainText('LIVE DEMO');
      await expect(page.locator('.controls-card')).toBeHidden();
      await page.clock.runFor(300);
      const first = await game.screenshot(`${mode}-preview-${width}`, '#modeDemo canvas');
      await page.clock.runFor(700);
      const second = await game.screenshot(`${mode}-animated-${width}`, '#modeDemo canvas');
      expect(second.equals(first), 'preview must animate').toBe(false);
      if (mode === 'smuggler') {
        // Check both real courses inside the compact thumbnail, not only the belt.
        await page.clock.runFor(9100);
        await game.screenshot(`smuggler-canyon-preview-${width}`, '#modeDemo canvas');
        await page.screenshot({ path: game.info.outputPath(`smuggler-canyon-title-${width}.png`) });
        expect((await page.locator('#modeDemo').boundingBox())!.height).toBe(120);
      }
      await page.locator('#launchOverlay').evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: game.info.outputPath(`${mode}-title-${width}.png`) });
    }
    expect(await page.evaluate(() => localStorage.getItem('vector-shooter-save-v2'))).toBe(saved);
    // Include both Resume and New Run, not only a fresh profile's Play button.
    await game.engage('newRun'); await game.pause(); await game.action('title'); await game.layout();
    const playRows = await page.locator('.title-play-buttons button').evaluateAll(items => items.map(item => item.getBoundingClientRect().top));
    expect(playRows).toHaveLength(2);
    expect(Math.max(...playRows) - Math.min(...playRows), 'play options share one line').toBeLessThan(2);
    if (width > 650) {
      await page.setViewportSize({ width: 1366, height: 720 });
      await page.clock.runFor(30); await game.layout();
      const overlay = await page.locator('#launchOverlay').evaluate(el => ({ height: el.clientHeight, content: el.scrollHeight }));
      expect(overlay.content, 'the entire title fits a short desktop window').toBeLessThanOrEqual(overlay.height + 1);
      await page.screenshot({ path: game.info.outputPath('compact-title-720.png') });
      await page.setViewportSize({ width, height: 900 });
    }
    await expect(page.locator('.family-select button')).toHaveText(['PULSE', 'SPREAD', 'LANCE']);
    await game.action('scores');
    for (const mode of GAME_MODES) {
      await game.action(`mode:${mode}`); await game.layout();
      await expect(page.locator('.score-table')).toContainText('NO FLIGHTS RECORDED YET');
      await game.screenshot(`${mode}-scores-${width}`, '.arcade-menu');
    }
    await game.action('game'); await game.unlockWarp();
    for (const mode of ['invaders', 'smuggler'] as const) {
      await game.warpStage(mode === 'invaders' ? 1000 : 16, mode); await game.layout();
      await game.step(0.4); await game.layout();
      await page.screenshot({ path: game.info.outputPath(`${mode}-flight-${width}.png`) });
      await game.screenshot(`${mode}-flight-${width}`);
      if (mode === 'smuggler') {
        const radar = await game.screenshot(`smuggler-radar-${width}`, '#radar');
        const pixels = PNG.sync.read(radar).data;
        let contacts = 0;
        // The empty green grid has no bright red/blue channels. Require actual course contacts.
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 100 || pixels[i + 2] > 100) contacts++;
        expect(contacts, 'visible radar contacts, not just the grid and player marker').toBeGreaterThan(40);
        // Arrange a paid result for layout only; timer/progression rules have direct tests.
        await page.evaluate(() => {
          const bonus = window.vectorShooterDebug.getState().bonus!;
          Object.assign(bonus.flight, { bulletHits: 0, crashes: 0, shots: 0, blasts: 0, enemies: true, gatesPassed: 18, gatesMissed: 0, topBoost: true });
          window.vectorShooterDebug.finishBonus('complete');
        }); await game.step(0);
        const summary = page.locator('#courseSummary'); await expect(summary).toBeVisible();
        await expect(summary).toContainText('SCORE'); await expect(summary).toContainText(`LIVES ${(await game.state()).lives}`);
        await expect(summary).toContainText('SUPER FLYER BONUS +5000');
        for (const child of await summary.locator('h2,p').all()) {
          const bounds = (await child.boundingBox())!;
          expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
          expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(width > 650 ? 900 : 844);
        }
        await page.screenshot({ path: game.info.outputPath(`course-summary-${width}.png`) });
        await game.step(3.1);
        await page.evaluate(() => window.vectorShooterDebug.forcePlayerDeath()); await game.step(0.1);
        await expect(page.locator('#lifeLost')).toBeVisible();
        await expect(page.locator('#lifeLostCountdown')).toHaveText('RESTART IN 4 SECONDS');
        const deathFrame = await game.screenshot(`smuggler-death-background-${width}`);
        await game.step(1);
        const movingFrame = await game.screenshot(`smuggler-death-moving-${width}`);
        expect(movingFrame.equals(deathFrame), 'the retained course must keep animating').toBe(false);
        await expect(page.locator('#lifeLostCountdown')).toHaveText('RESTART IN 3 SECONDS');
        await page.screenshot({ path: game.info.outputPath(`smuggler-life-lost-${width}.png`) });
        await game.step(3); await expect(page.locator('#lifeLost')).toBeHidden();
      }
      await game.pause(); await game.action('levelWarp');
    }
  });
}
