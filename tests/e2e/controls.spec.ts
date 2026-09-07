import { test, expect } from './fixtures/game';

test('native pointer lock, mouse buttons and wheel reach the game and release safely', async ({ game, page }) => {
  await game.open(); await game.start();
  // engage() verifies a real pointer lock. Relative movement and flight maths are
  // unit-tested with explicit MouseEvent deltas, not inferred viewport coordinates.
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 100);
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

test('weapon selection reaches the HUD and schedules each family\'s actual audio', async ({ game, page }) => {
  await game.open(); await game.start();
  for (const [key, family] of [['2', 'spread'], ['3', 'lance'], ['1', 'pulse'], ['Tab', 'spread'], ['Numpad3', 'lance']]) {
    await page.keyboard.press(key); await expect(page.locator('#weaponReadout')).toContainText(family.toUpperCase());
    await page.mouse.down(); await game.step(0.04); await page.mouse.up(); await game.step(0.6);
  }
  await page.mouse.down({ button: 'middle' }); await page.mouse.up({ button: 'middle' });
  await expect(page.locator('#weaponReadout')).toContainText('PULSE');
  const samples = await page.evaluate(() => window.testAudio.samples);
  for (const duration of [0.15, 0.21, 0.32]) expect(samples).toContain(Math.ceil(duration * 22050));
  expect(await page.evaluate(() => window.testAudio.contexts.some(c => c.state === 'running'))).toBe(true);
});
