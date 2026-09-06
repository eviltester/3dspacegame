import { test, expect } from './fixtures/game';

test('Ships & Objects has five-second cadence, count, keyboard and mouse navigation', async ({ game, page }) => {
  await page.clock.install(); await game.open(); await game.action('objects');
  await expect(page.locator('#launchTitle')).toHaveText('SHIPS & OBJECTS');
  await expect(page.locator('#catalogSection .briefing-status')).toHaveText('SHIPS & OBJECTS');
  const initial = (await game.state()).briefingCount;
  await page.locator('[data-action="scanNext"]').click();
  expect((await game.state()).briefingCount).not.toBe(initial);
  await page.keyboard.press('ArrowLeft'); expect((await game.state()).briefingCount).toBe(initial);
  await page.clock.runFor(3000); expect((await game.state()).briefingCount).toBe(initial);
  await page.clock.runFor(2100); expect((await game.state()).briefingCount).not.toBe(initial);
  const count = Number((await game.state()).briefingCount?.split('/')[1]); expect(count).toBe(29);
  for (let i = 0; i < count; i++) {
    await page.locator('[data-action="scanNext"]').click();
    await expect(page.locator('#modelTitle')).not.toBeEmpty(); await expect(page.locator('#modelDescription')).not.toBeEmpty();
    await game.screenshot(`object-${i}`, '#modelPreview canvas');
  }
});

test('hidden warp code exposes 99 Journey stages, arbitrary Attack Challenge waves and eight bonus difficulties without touching saves', async ({ game, page }) => {
  await game.open(); await game.start(); await game.pause(); await game.action('title');
  const saved = await page.evaluate(() => localStorage.getItem('vector-shooter-save-v2'));
  for (const key of ['ArrowUp', 'ArrowDown', 'b', 'a']) await page.keyboard.press(key);
  await expect(page.locator('#levelWarpButton')).toHaveCount(0);
  await game.unlockWarp();
  await expect(page.locator('#warpStage option')).toHaveCount(99); await expect(page.locator('#warpDifficulty option')).toHaveCount(8);
  await game.warpStage(99); expect((await game.state()).stage).toBe(99); expect((await game.state()).practice).toBe(true);
  await game.action('levelWarp'); await page.locator('#warpWave').fill('0'); await game.action('warpEndless');
  expect((await game.state()).menu).toBe('levelWarp');
  await game.warpStage(1000, 'endless'); await game.engage(); await game.pause(); await game.action('title');
  expect(await page.evaluate(() => localStorage.getItem('vector-shooter-save-v2'))).toBe(saved);
  await page.reload(); await expect(page.locator('#levelWarpButton')).toBeVisible();
  expect(await page.evaluate(() => window.testAudio.samples.length)).toBe(0);
});

for (const width of [1440, 1024, 650, 390, 320]) {
  test(`menus and HUD fit ${width}px without overlapping`, async ({ game, page }) => {
    await page.setViewportSize({ width, height: width > 650 ? 900 : 844 }); await game.open();
    await game.layout(); await game.screenshot(`title-${width}`, '.arcade-menu');
    await game.action('controls');
    for (const scheme of ['wasd', 'arrows', 'mouse']) {
      await game.action(`controls:${scheme}`); await game.layout();
      await game.screenshot(`${scheme}-controls-${width}`, '.controls-card');
    }
    await expect(page.locator('.controls-card')).not.toContainText('Browse ships & objects');
    await game.action('title'); await game.action('objects');
    await game.screenshot(`ships-objects-title-${width}`, '#vectorTitle');
    const placement = await page.locator('.scan-hint').evaluate(hint => {
      const arrows = document.querySelector('.scan-buttons')!.getBoundingClientRect();
      const catalog = document.querySelector('#catalogSection')!.getBoundingClientRect();
      const rect = hint.getBoundingClientRect();
      return { below: rect.top >= arrows.bottom, leftAligned: rect.left === catalog.left, textAlign: getComputedStyle(hint).textAlign };
    });
    expect(placement).toEqual({ below: true, leftAligned: true, textAlign: 'left' });
    await game.layout();
    await page.locator('#catalogSection').scrollIntoViewIfNeeded();
    await game.screenshot(`scan-${width}`, '#catalogSection');
    await game.action('title');
    await game.start(); await game.step(0.2); await game.layout(); await game.screenshot(`flight-${width}`);
    await game.pause(); await game.layout(); await game.action('title'); await game.unlockWarp(); await game.layout();
    await game.bonus('sequence', 8); await game.step(0.02); await game.layout();
  });
}
