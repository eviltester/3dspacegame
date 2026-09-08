import { test, expect } from './fixtures/game';

test('a user gesture unlocks Web Audio and schedules weapon and destruction sounds', async ({ game, page }) => {
  await game.openRenderer();
  await page.evaluate(async path => {
    const { SoundBank } = await import(path) as typeof import('../../src/sound');
    const bank = new SoundBank(), play = document.createElement('button'); play.textContent = 'Play sounds';
    play.addEventListener('click', () => {
      void bank.start().then(() => {
        bank.shoot('pulse'); bank.shoot('spread'); bank.shoot('lance'); bank.shatter(); bank.reinforcements(); bank.recharged(95, 100); bank.miss();
        bank.cue('weaponSwitch'); bank.cue('extraLife'); bank.cue('policeScan'); bank.enemyShoot('canyonGun', 100); bank.enemyShoot('police', 100);
      });
    });
    document.body.append(play);
  }, '/src/sound.ts');
  await page.getByRole('button', { name: 'Play sounds' }).click();
  await expect.poll(() => page.evaluate(() => window.testAudio.samples.length)).toBe(12);
  expect(await page.evaluate(() => window.testAudio.contexts.some(context => context.state === 'running'))).toBe(true);
});
