import { test, expect } from './fixtures/game';

test('completion, time bonus, dock purchase and resume pay rewards exactly once', async ({ game, page }) => {
  await game.open(); await game.start(); await game.finish();
  await expect(page.locator('#missionProgress')).toHaveText('HEAD TO THE WARP GATE!');
  const cleared = await game.state(); await game.finish(); expect((await game.state()).credits).toBe(cleared.credits);
  const clock = (await game.state()).timeRemaining!; await game.step(1);
  expect((await game.state()).timeRemaining).toBeLessThan(clock);
  await game.gate(); expect((await game.state()).menu).toBe('shop');
  const docked = await game.state(); expect(docked.timeBonus).toBeGreaterThan(0);
  await expect(page.locator('#dockTimeBonus')).toContainText(String(docked.timeBonus));
  await game.action('equip:spread'); await game.action('buy:tier'); expect((await game.state()).tiers?.spread).toBe(2);
  const purchased = await game.state(); await game.action('title'); await page.reload(); await game.action('resumeRun');
  expect((await game.state()).credits).toBe(purchased.credits); expect((await game.state()).tiers?.spread).toBe(2);
  await game.action('depart'); await game.engage(); expect((await game.state()).stage).toBe(2);
  await expect(page.locator('#weaponReadout')).toContainText('SPREAD 2');
});

test('remaining lives respawn in flight and zero lives offers an immediate mouse continue', async ({ game, page }) => {
  await page.clock.install(); await game.open(); await game.start();
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { window.vectorShooterDebug.giveCredits(500); window.vectorShooterDebug.forcePlayerDeath(); });
    expect((await game.state()).lives).toBe(2 - i);
    if (i < 2) {
      await game.step(0.02); expect((await game.state()).menu).toBe('');
      expect((await game.state()).credits).toBe((i + 1) * 500);
    } else {
      await expect(page.locator('#deathTimer')).toHaveText('10');
      await expect(page.locator('#launchButton')).toBeEnabled(); await game.engage('relaunch');
      expect((await game.state()).credits).toBe(0);
    }
  }
  expect((await game.state()).continued).toBe(true); expect((await game.state()).lives).toBe(3); expect((await game.state()).score).toBe(0);
});
