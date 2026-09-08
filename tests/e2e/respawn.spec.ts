import { PNG } from 'pngjs';
import { test, expect } from './fixtures/game';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`flashing blue respawn craft and HUD fit ${viewport.width}px`, async ({ game, page }) => {
    await page.setViewportSize(viewport); await game.open(); await game.start('invaders');
    await page.evaluate(() => window.vectorShooterDebug.forcePlayerDeath()); await game.step(0.02); await page.clock.runFor(20);
    await game.layout();
    const pixels = PNG.sync.read(await game.screenshot('blue-respawn-craft'));
    let blue = 0;
    for (let i = 0; i < pixels.data.length; i += 4) {
      const [r, g, b] = pixels.data.subarray(i, i + 3);
      if (b > 100 && b > g * 1.4 && g > r * 1.6) blue++;
    }
    expect(blue, 'the player craft renders blue on the actual canvas').toBeGreaterThan(12);
    await page.screenshot({ path: game.info.outputPath('respawn-hud.png') });
    await game.step(3.1); await page.clock.runFor(20);
    await expect(page.locator('.game-shell')).not.toHaveClass(/protected-flight/);
    const normal = PNG.sync.read(await game.screenshot('normal-craft'));
    let normalBlue = 0;
    for (let i = 0; i < normal.data.length; i += 4) {
      const [r, g, b] = normal.data.subarray(i, i + 3);
      if (b > 100 && b > g * 1.4 && g > r * 1.6) normalBlue++;
    }
    expect(normalBlue).toBeLessThan(blue);
    await page.evaluate(() => window.vectorShooterDebug.giveScore(123456));
    const lives = (await game.state()).lives!;
    for (let i = 0; i < lives; i++) { await page.evaluate(() => window.vectorShooterDebug.forcePlayerDeath()); await game.step(0.02); }
    await expect(page.locator('#finalScore')).toHaveText('123,456');
    await game.layout();
    await page.screenshot({ path: game.info.outputPath(`gameover-score-${viewport.width}.png`) });
    // Persistence is unit-tested; the browser check only covers this screen's layout.
    await page.clock.runFor(50);
    await expect(page.locator('#launchOverlay')).toHaveAttribute('data-mode', 'gameover');
    await expect(page.locator('[data-action="relaunch"]')).toBeEnabled();
  });
}
