import { test, expect } from './fixtures/game';

for (const width of [1440, 390]) test(`tunnel vectors, open/closed framing and live shots at ${width}px`, async ({ game, page }) => {
  await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 }); await game.open();
  await game.action('mode:tunnels'); await game.layout();
  await page.screenshot({ path: game.info.outputPath(`tunnels-title-${width}.png`) });
  await game.unlockWarp();
  for (const level of [1,7,1000]) {
    await game.warpStage(level, 'tunnels');
    await game.step(2); await game.mouse(true); await game.step(0.15);
    const a = await game.screenshot(`tunnel-${level}-${width}`); await game.step(0.2);
    const b = await game.screenshot(`tunnel-moving-${level}-${width}`);
    expect(a.equals(b)).toBe(false); await game.mouse(false); await game.layout();
    await expect(page.locator('#radar')).toBeHidden();
    await expect(page.locator('#topDamageStat')).toBeHidden();
    await expect(page.locator('#topLives')).toBeVisible(); await expect(page.locator('#topShield')).toBeVisible();
    await page.screenshot({ path: game.info.outputPath(`tunnel-${level}-${width}.png`) });
    if (level === 1) {
      await game.finish(); await game.step(3.35);
      await game.screenshot(`tunnel-zoom-${width}`);
      await page.screenshot({ path: game.info.outputPath(`tunnel-zoom-${width}.png`) });
      await game.step(0.7); const panels = await game.screenshot(`tunnel-panels-${width}`);
      await page.screenshot({ path: game.info.outputPath(`tunnel-panels-${width}.png`) });
      await game.step(0.7); const particles = await game.screenshot(`tunnel-particles-${width}`);
      expect(panels.equals(particles)).toBe(false);
      await page.screenshot({ path: game.info.outputPath(`tunnel-particles-${width}.png`) });
      await expect(page.locator('#courseSummary')).toBeHidden();
    } else if (level === 1000) {
      await game.step(3.5); await game.screenshot(`tunnel-incoming-${width}`); await game.layout();
      await page.screenshot({ path: game.info.outputPath(`tunnel-incoming-${width}.png`) });
    }
    await game.pause(); await game.action('levelWarp');
  }
  expect(await page.evaluate(() => window.testAudio.samples.some(count => count > 0))).toBe(true);
});
