import { test, expect } from './fixtures/game';
import { PNG } from 'pngjs';
import { writeFile } from 'node:fs/promises';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Invader formations render distinct animated silhouettes at ${viewport.width}px`, async ({ game, page }) => {
    await game.openRenderer();
    const frames = await page.evaluate(async ({ width, height }) => {
      const path = '/tests/e2e/fixtures/invader-rendering.ts';
      const { formationPreviews } = await import(path) as typeof import('./fixtures/invader-rendering');
      return formationPreviews(width, height);
    }, viewport);
    for (const frame of frames) {
      const buffers = frame.images.map(image => Buffer.from(image.split(',')[1], 'base64'));
      const pixels = PNG.sync.read(buffers[0]).data;
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 40) lit++;
      expect(lit, frame.pattern).toBeGreaterThan(frame.minimumPixels);
      expect(buffers[0].equals(buffers[1]), `${frame.pattern} moves`).toBe(false);
      const path = game.info.outputPath(`${frame.pattern.toLowerCase().replaceAll(' ', '-')}.png`);
      await writeFile(path, buffers[0]);
      await game.info.attach(frame.pattern, { path, contentType: 'image/png' });
    }
  });
  test(`Defensive Position accuracy and cooldown HUD fits ${viewport.width}px`, async ({ game, page }) => {
    await page.setViewportSize(viewport);
    await game.open(); await game.start('invaders');
    await page.mouse.down(); await game.step(0.1); await page.mouse.up();
    await game.layout(); await game.screenshot('invaders-accuracy-flight');
    await page.screenshot({ path: game.info.outputPath('invaders-hud.png') });
    await page.evaluate(() => window.vectorShooterDebug.setStage(5)); await game.step(8.3);
    await game.layout(); await game.screenshot('cruiser-flyby-and-formation');
    await page.screenshot({ path: game.info.outputPath('cruiser-flyby-hud.png') });
    await game.finish(); await game.layout();
    await expect(page.locator('#sectorName')).toContainText('ACCURACY');
    // Only rendering is checked here; field timing, collisions and payouts are unit/DOM tests.
    await page.evaluate(wave => window.vectorShooterDebug.setStage(wave), viewport.width === 390 ? 12 : 6);
    await game.step(12); await game.layout();
    const field = await game.screenshot('asteroid-field'); await game.step(0.2);
    expect(field.equals(await game.screenshot('asteroid-field-moving'))).toBe(false);
    await page.screenshot({ path: game.info.outputPath('asteroid-field-hud.png') });
    await page.evaluate(async () => {
      const path = '/src/rendering/damage-cracks.ts';
      const { flashDamage } = await import(path) as typeof import('../../src/rendering/damage-cracks');
      flashDamage(document.querySelector<HTMLElement>('#damageLayer'));
    });
    await page.clock.runFor(80);
    const cracks = page.locator('#damageLayer'); await expect(cracks.locator('polyline')).toHaveCount(32);
    await expect(cracks).toHaveCSS('pointer-events', 'none');
    await page.screenshot({ path: game.info.outputPath('cracked-window.png') });
  });
}
