import { test, expect } from './fixtures/game';

test('mouse steering, continuous fire, interception, reverse and local rotation', async ({ game, page }) => {
  await game.open(); await game.start();
  expect((await game.state()).wanted).toBe(false);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await game.state()).throttle).toBe(0);
  const before = await game.state();
  await game.move(60, 25); await game.step(0.1);
  expect((await game.state()).orientation).not.toEqual(before.orientation);
  await page.evaluate(() => window.vectorShooterDebug.spawnIncomingBolt());
  await page.mouse.down(); await game.step(0.6); await page.mouse.up();
  expect((await game.state()).stats.interceptions).toBeGreaterThan(0);
  const stopped = (await game.state()).position;
  await page.mouse.wheel(0, 100); await game.step(0.5);
  expect((await game.state()).throttle).toBe(-15);
  expect((await game.state()).position).not.toEqual(stopped);
  await expect(page.locator('#speedReadout')).toContainText('REV');
  const shots = (await game.state()).stats.shots;
  await page.mouse.down(); await game.step(0.4); await page.mouse.up();
  expect((await game.state()).stats.shots).toBeGreaterThan(shots);
  await game.move(0, 1700); await game.step(0.1);
  const loop = (await game.state()).orientation;
  await game.move(0, 1700); await game.step(0.1);
  expect((await game.state()).orientation).not.toEqual(loop);
});

test('keys and mouse cycle weapons without bypassing cooldown; each family plays its sound', async ({ game, page }) => {
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
  await page.keyboard.press('3'); await page.mouse.down(); await game.step(0.02); await page.mouse.up();
  const fired = await game.state(); expect(fired.weaponCooldown).toBeGreaterThan(0.4);
  await page.keyboard.press('1'); await page.mouse.down(); await game.step(0.02); await page.mouse.up();
  expect((await game.state()).stats.shots).toBe(fired.stats.shots);
});

test('mouse pause, focus loss and pointer release freeze gameplay and clear held fire', async ({ game, page }) => {
  await game.open(); await game.start();
  await page.mouse.down(); await game.pause();
  const frozen = await game.state(); await game.step(5);
  expect((await game.state()).elapsed).toBe(frozen.elapsed);
  await page.mouse.up(); await game.engage('unpause');
  const shots = (await game.state()).stats.shots; await game.step(0.3);
  expect((await game.state()).stats.shots).toBe(shots);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(async () => (await game.state()).menu).toBe('pause'); await game.engage('unpause');
  await page.evaluate(() => document.exitPointerLock());
  await expect.poll(async () => (await game.state()).menu).toBe('pause'); await game.engage('unpause');
  await page.keyboard.press('Escape'); await expect.poll(async () => (await game.state()).menu).toBe('pause');
});
