import { test, expect } from './fixtures/game';

test('keyboard flight launches without pointer lock and Escape returns focus to Resume', async ({ game, page }) => {
  await game.open(); await game.action('controls'); await game.action('controls:wasd'); await game.action('title');
  // Detailed layouts and menu traversal are DOM/input unit tests. This verifies
  // native key delivery across the real menu-to-flight boundary only once.
  await page.keyboard.press('Enter');
  await expect(page.locator('#missionBriefCaution')).toContainText('Hold J');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await game.state()).menu).toBe('');
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  const before = await game.state();
  await page.keyboard.down('w'); await page.keyboard.down('j'); await game.step(0.1);
  await page.keyboard.up('w'); await page.keyboard.up('j');
  expect((await game.state()).orientation).not.toEqual(before.orientation);
  expect((await game.state()).stats.shots).toBeGreaterThan(before.stats.shots);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await game.state()).menu).toBe('');
});
