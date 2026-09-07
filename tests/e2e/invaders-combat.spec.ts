import { test, expect } from './fixtures/game';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Invaders accuracy and cooldown HUD fits ${viewport.width}px`, async ({ game, page }) => {
    await page.setViewportSize(viewport);
    await game.open(); await game.start('invaders');
    await page.mouse.down(); await game.step(0.1); await page.mouse.up();
    await game.layout(); await game.screenshot('invaders-accuracy-flight');
    await page.screenshot({ path: game.info.outputPath('invaders-hud.png') });
    await game.finish(); await game.layout();
    await expect(page.locator('#sectorName')).toContainText('ACCURACY');
  });
}
