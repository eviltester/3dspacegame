import { test, expect } from './fixtures/game';

test('Invaders cooldowns persist through switching and pause, and Spread counts each bolt', async ({ game, page }) => {
  await game.open(); await game.start('invaders');
  await expect(page.locator('#speedLabel')).toHaveText('WEAPON COOLDOWN');
  await expect(page.locator('#speedReadout')).toHaveText('READY');
  for (const [key, family, count, cooldown] of [['1', 'pulse', 1, 0.6], ['2', 'spread', 3, 1], ['3', 'lance', 1, 1.4]] as const) {
    await game.step(1.5); await page.keyboard.press(key);
    const before = await game.state();
    await page.mouse.down(); await game.step(0.02); await page.mouse.up();
    const fired = await game.state();
    expect(fired.weapon).toBe(family); expect(fired.accuracy!.shots - before.accuracy!.shots).toBe(count);
    expect(fired.weaponCooldown).toBeGreaterThan(cooldown - 0.3);
    await page.keyboard.press('Tab'); await page.mouse.down(); await game.step(0.02); await page.mouse.up();
    expect((await game.state()).stats.shots).toBe(fired.stats.shots);
  }
  await page.keyboard.press('3'); await game.step(1.5);
  await page.mouse.down(); await game.step(0.02); await page.mouse.up();
  await page.keyboard.press('Escape'); await expect.poll(async () => (await game.state()).menu).toBe('pause');
  const paused = await game.state(); await game.step(3);
  expect((await game.state()).weaponCooldown).toBe(paused.weaponCooldown);
  expect((await game.state()).accuracy).toEqual(paused.accuracy);
  await game.engage('unpause'); await game.step(1.5);
  await expect(page.locator('#speedReadout')).toHaveText('READY');
  await expect(page.locator('#sectorName')).toContainText('ACCURACY');
});

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
