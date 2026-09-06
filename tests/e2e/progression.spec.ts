import { test, expect } from './fixtures/game';

test('fresh runs import legacy records and choices but no money or power', async ({ game, page }) => {
  const legacy = JSON.stringify({ credits: 9999, bestScore: 1200, unlockedWeaponLevel: 3 });
  await page.addInitScript(value => localStorage.setItem('vector-shooter-save-v1', value), legacy);
  await game.open(); await game.action('scores'); await expect(page.locator('.record-line')).toContainText('LEGACY RECORD 1200'); await game.action('title'); await game.start();
  expect((await game.state()).credits).toBe(0); expect((await game.state()).weaponLevel).toBe(1); expect((await game.state()).wanted).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('vector-shooter-save-v1'))).toBe(legacy);
});

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

test('three deaths, immediate relaunch, checkpoint continue and ten-second title return', async ({ game, page }) => {
  await page.clock.install(); await game.open(); await game.start();
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { window.vectorShooterDebug.giveCredits(500); window.vectorShooterDebug.forcePlayerDeath(); });
    expect((await game.state()).lives).toBe(2 - i); await expect(page.locator('#deathTimer')).toHaveText('10');
    await expect(page.locator('#launchButton')).toBeEnabled(); await game.engage('relaunch');
    expect((await game.state()).credits).toBe(0);
  }
  expect((await game.state()).continued).toBe(true); expect((await game.state()).lives).toBe(3); expect((await game.state()).score).toBe(0);
  await page.evaluate(() => window.vectorShooterDebug.forcePlayerDeath());
  await page.clock.runFor(10400);
  expect((await game.state()).menu).toBe('title');
  await game.action('resumeRun'); expect((await game.state()).menu).toBe('gameover'); expect((await game.state()).lives).toBe(2);
});

test('Journey traverses all 99 checkpoints and Attack Challenge keeps its independent wave save', async ({ game, page }) => {
  test.setTimeout(180_000);
  await game.open(); await game.start();
  for (let stage = 1; stage <= 99; stage++) {
    expect((await game.state()).stage).toBe(stage); await game.finish(); await game.gate();
    if (stage === 99) { expect((await game.state()).menu).toBe('victory'); break; }
    if ((await game.state()).menu === 'bonusOffer') await game.action('bonusSkip');
    expect((await game.state()).menu).toBe('shop'); await game.action('depart'); await game.engage('launch', false);
  }
  // This is another rapid fixture transition, like the 99 launches above.
  // Actual pointer-lock acquisition is required by the separate mouse playthroughs.
  await game.action('title'); await game.action('mode:endless'); await game.action('newRun'); await game.engage('launch', false);
  for (let wave = 1; wave <= 10; wave++) {
    expect((await game.state()).stage).toBe(wave); await game.finish();
    if (wave % 5) {
      expect((await game.state()).phase).toBe('recovery');
      await page.mouse.down(); await game.step(0.02); await page.mouse.up();
      await expect.poll(async () => (await game.state()).stage).toBe(wave + 1);
    } else {
      await game.gate(); await game.action('bonusSkip'); await game.action('equip:lance'); await game.action('depart'); await game.engage('launch', false);
    }
  }
  await game.pause(); await game.action('title'); await page.reload(); await game.action('mode:endless'); await game.action('resumeRun');
  expect((await game.state()).stage).toBe(11); expect((await game.state()).weapon).toBe('lance');
  const profile = await page.evaluate(() => window.vectorShooterDebug.getProfile());
  expect(profile.checkpoints.journey?.phase).toBe('victory'); expect(profile.checkpoints.endless?.stage).toBe(11);
});
