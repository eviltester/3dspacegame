import { PNG } from 'pngjs';
import { test, expect } from './fixtures/game';
import { freshProfile, SAVE_V2 } from '../../src/arcade';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`flashing blue respawn craft and HUD fit ${viewport.width}px`, async ({ game, page }) => {
    const profile = freshProfile();
    profile.scoreboards.invaders = Array.from({ length: 10 }, (_, i) => ({
      id: `record-${i}`, score: 120000 - i * 1000, stage: 100 - i, continued: i % 2 === 0, initials: 'ACE'
    }));
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SAVE_V2, value: JSON.stringify(profile) });
    await page.setViewportSize(viewport); await game.open(); await game.start('invaders');
    await expect(page.locator('#hullLabel')).toBeHidden();
    await expect(page.locator('#hullReadout')).toBeHidden();
    await expect(page.locator('#shieldReadout')).toBeHidden();
    await expect(page.locator('#livesReadout')).toBeHidden();
    await expect(page.locator('#topShield')).toBeVisible();
    await expect(page.locator('#topLives')).toBeVisible();
    const cluster = await page.locator('.flight-status').boundingBox();
    expect(cluster!.y).toBeGreaterThanOrEqual(0);
    expect(cluster!.y + cluster!.height).toBeLessThan(170);
    for (const id of ['scoreReadout', 'topLives', 'topShield', 'weaponReadout', 'speedReadout', 'chargeReadout']) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(cluster!.y);
      expect(box!.y + box!.height).toBeLessThanOrEqual(cluster!.y + cluster!.height);
    }
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
    await expect(page.getByRole('textbox', { name: 'YOUR INITIALS' })).toBeVisible();
    const table = page.getByRole('table', { name: 'INVADERS high scores' });
    await expect(table.locator('tbody tr')).toHaveCount(10);
    const actions = await page.locator('.gameover-actions button').evaluateAll(items => items.map(item => {
      const bounds = item.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right };
    }));
    expect(actions).toHaveLength(2);
    expect(Math.abs(actions[0].top - actions[1].top), 'Continue and Title Screen share one line').toBeLessThan(2);
    expect(actions[0].right).toBeLessThanOrEqual(actions[1].left);
    expect(actions[0].top).toBeGreaterThanOrEqual(0);
    expect(actions[0].bottom).toBeLessThanOrEqual(viewport.height);
    await game.layout();
    await page.screenshot({ path: game.info.outputPath(`gameover-score-${viewport.width}.png`) });
    // Persistence is unit-tested; the browser check only covers this screen's layout.
    await page.clock.runFor(50);
    await expect(page.locator('#launchOverlay')).toHaveAttribute('data-mode', 'gameover');
    await expect(page.locator('[data-action="relaunch"]')).toBeEnabled();
  });
}

test('Invaders charged-blast status fits beside score at intermediate and narrow sizes', async ({ game, page }) => {
  await game.open(); await game.start('invaders');
  await page.evaluate(() => window.vectorShooterDebug.primeBlast()); await game.step(0);
  for (const viewport of [{ width: 1024, height: 768 }, { width: 844, height: 390 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(viewport); await game.step(0);
    await expect(page.locator('#chargeReadout')).toContainText('BLAST READY');
    await game.layout();
    const status = await page.locator('.flight-status').boundingBox();
    const mission = await page.locator('.mission-panel').boundingBox();
    expect(status!.x).toBeGreaterThanOrEqual(0);
    expect(status!.x + status!.width).toBeLessThanOrEqual(viewport.width);
    if (viewport.width <= 760) expect(status!.y + status!.height).toBeLessThanOrEqual(mission!.y);
    await page.screenshot({ path: game.info.outputPath(`invaders-status-${viewport.width}.png`) });
  }
});
