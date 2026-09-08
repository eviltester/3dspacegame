import { preview } from 'vite';
import type { PreviewServer } from 'vite';
import { test, expect } from './fixtures/game';

let server: PreviewServer;
test.beforeAll(async () => {
  server = await preview({ base: '/3dspacegame/', preview: { host: '127.0.0.1', port: 5181, strictPort: true } });
});
test.afterAll(async () => { if (server) await new Promise<void>((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve())); });

test('production game loads and plays from the GitHub Pages repository path', async ({ page, game }) => {
  const failures: string[] = [];
  page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
  await page.goto('http://127.0.0.1:5181/3dspacegame/');
  await expect(page.locator('#launchTitle')).toHaveText('3D VECTOR SPACE SHOOTER');
  await expect(page).toHaveTitle('3D Vector Space Shooter');
  expect(await page.evaluate(() => window.vectorShooterDebug)).toBeUndefined();
  await page.locator('[data-action="newRun"]').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('#launchOverlay')).toBeHidden();
  await expect(page.locator('#reputation')).toContainText('CLEAN');
  await page.keyboard.down('j');
  await game.screenshot('pages-flight');
  await expect(page.locator('#levelClock')).not.toHaveText('TIME 2:00');
  await page.keyboard.up('j'); await page.keyboard.press('Escape');
  await expect(page.locator('#launchTitle')).toHaveText('PAUSED');
  expect(failures).toEqual([]);
});
