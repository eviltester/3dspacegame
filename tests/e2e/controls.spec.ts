import { test, expect } from './fixtures/game';

test('native pointer lock, mouse buttons and wheel reach the game and release safely', async ({ game, page }) => {
  await game.open(); await game.start();
  // engage() verifies a real pointer lock. Relative movement and flight maths are
  // unit-tested with explicit MouseEvent deltas, not inferred viewport coordinates.
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 100);
  await game.step(1 / 60);
  await expect.poll(async () => (await game.state()).throttle).toBe(-15);
  await expect(page.locator('#speedReadout')).toContainText('REV');
  const shots = (await game.state()).stats.shots;
  await page.mouse.down(); await game.step(0.4);
  expect((await game.state()).stats.shots).toBeGreaterThan(shots);
  await game.pause(); await page.mouse.up();
  const frozen = await game.state(); await game.step(1);
  expect((await game.state()).elapsed).toBe(frozen.elapsed);
  await game.engage('unpause'); await game.step(0.3);
  expect((await game.state()).stats.shots).toBe(frozen.stats.shots);
  await page.evaluate(() => document.exitPointerLock());
  await expect.poll(async () => (await game.state()).menu).toBe('pause');
  await game.engage('unpause'); await page.keyboard.press('Escape');
  await expect.poll(async () => (await game.state()).menu).toBe('pause');
});
