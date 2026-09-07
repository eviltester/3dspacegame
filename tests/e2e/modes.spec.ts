import { GAME_MODES, MODE_INFO } from '../../src/modes';
import { test, expect } from './fixtures/game';

test.use({ trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true } });

for (const width of [1440, 390]) {
  test(`four live title previews, weapon help and separate score screens fit ${width}px`, async ({ game, page }) => {
    await page.setViewportSize({ width, height: width > 650 ? 900 : 844 });
    await game.open();
    const saved = await page.evaluate(() => localStorage.getItem('vector-shooter-save-v2'));
    for (const mode of GAME_MODES) {
      await game.action(`mode:${mode}`); await game.layout();
      await expect(page.locator('#modePreviewName')).toHaveText(MODE_INFO[mode].name);
      await expect(page.locator('#launchOverlay')).not.toContainText('ATTRACT MODE');
      await expect(page.locator('#launchOverlay')).not.toContainText('LIVE DEMO');
      await expect(page.locator('.controls-card')).toHaveCount(0);
      await page.clock.runFor(300);
      const first = await game.screenshot(`${mode}-preview-${width}`, '#modeDemo canvas');
      await page.clock.runFor(700);
      const second = await game.screenshot(`${mode}-animated-${width}`, '#modeDemo canvas');
      expect(second.equals(first), 'preview must animate').toBe(false);
      await page.locator('#launchOverlay').evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: game.info.outputPath(`${mode}-title-${width}.png`) });
    }
    expect(await page.evaluate(() => localStorage.getItem('vector-shooter-save-v2'))).toBe(saved);
    await game.action('weapons'); await game.layout();
    for (const family of ['PULSE', 'SPREAD', 'LANCE']) await expect(page.locator('.weapon-guide')).toContainText(family);
    await expect(page.locator('.weapon-guide')).toContainText('pierc');
    await game.action('title'); await game.action('scores');
    for (const mode of GAME_MODES) {
      await game.action(`scores:${mode}`); await game.layout();
      await expect(page.locator('.score-table')).toContainText('NO FLIGHTS RECORDED YET');
      await game.screenshot(`${mode}-scores-${width}`, '.arcade-menu');
    }
    await game.action('title'); await game.unlockWarp();
    for (const mode of ['invaders', 'smuggler'] as const) {
      await game.warpStage(mode === 'invaders' ? 1000 : 16, mode); await game.layout(); await game.engage();
      await game.step(0.4); await game.layout();
      await page.screenshot({ path: game.info.outputPath(`${mode}-flight-${width}.png`) });
      await game.screenshot(`${mode}-flight-${width}`);
      await game.pause(); await game.action('levelWarp');
    }
  });
}
