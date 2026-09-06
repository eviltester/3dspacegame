import { GAME_MODES, MODE_INFO } from '../../src/modes';
import { test, expect } from './fixtures/game';
import { MousePilot } from './fixtures/pilot';

test.use({ trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true } });

for (const width of [1440, 390]) {
  test(`four live title previews, weapon help and separate score screens fit ${width}px`, async ({ game, page }) => {
    await page.setViewportSize({ width, height: width > 650 ? 900 : 844 });
    await page.clock.install(); await game.open();
    const saved = await page.evaluate(() => localStorage.getItem('vector-shooter-save-v2'));
    for (const mode of GAME_MODES) {
      await game.action(`mode:${mode}`); await game.layout();
      await expect(page.locator('#modePreviewName')).toHaveText(MODE_INFO[mode].name);
      await expect(page.locator('#launchOverlay')).not.toContainText('ATTRACT MODE');
      await expect(page.locator('#launchOverlay')).not.toContainText('LIVE DEMO');
      await expect(page.locator('.controls-card')).toHaveCount(0);
      await page.clock.runFor(300);
      const first = await game.screenshot(`${mode}-preview-${width}`, '#modeDemo canvas');
      await page.clock.runFor(700);
      const second = await game.screenshot(`${mode}-animated-${width}`, '#modeDemo canvas');
      expect(second.equals(first), 'preview must animate').toBe(false);
      await page.locator('#launchOverlay').evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: game.info.outputPath(`${mode}-title-${width}.png`) });
    }
    expect(await page.evaluate(() => localStorage.getItem('vector-shooter-save-v2'))).toBe(saved);
    await game.action('weapons'); await game.layout();
    for (const family of ['PULSE', 'SPREAD', 'LANCE']) await expect(page.locator('.weapon-guide')).toContainText(family);
    await expect(page.locator('.weapon-guide')).toContainText('pierc');
    await game.action('title'); await game.action('scores');
    for (const mode of GAME_MODES) {
      await game.action(`scores:${mode}`); await game.layout();
      await expect(page.locator('.score-table')).toContainText('NO FLIGHTS RECORDED YET');
      await game.screenshot(`${mode}-scores-${width}`, '.arcade-menu');
    }
    await game.action('title'); await game.unlockWarp();
    for (const mode of ['invaders', 'smuggler'] as const) {
      await game.warpStage(mode === 'invaders' ? 1000 : 16, mode); await game.layout(); await game.engage();
      await game.step(0.4); await game.move(15, 15); await game.layout();
      await page.screenshot({ path: game.info.outputPath(`${mode}-flight-${width}.png`) });
      await game.screenshot(`${mode}-flight-${width}`);
      await game.pause(); await game.action('levelWarp');
    }
  });
}

test('Invaders retains its lane, ramps formations and saves its supply-stop purchases', async ({ game, page }) => {
  await game.open(); await game.start('invaders'); await game.step(0.2);
  const initial = await game.state();
  expect(initial.stageKind).toBe('armada'); expect(initial.flights.roster).toBe(8);
  expect(initial.view.armadaCraftVisible).toBe(true);
  await game.move(100, 240); await game.step(0.1);
  expect((await game.state()).position[0]).toBeGreaterThan(initial.position[0]);
  expect((await game.state()).position.slice(1)).toEqual([0, 0]);
  await game.screenshot('invaders-first-wave');
  for (let wave = 1; wave <= 3; wave++) {
    const state = await game.state(); expect(state.stage).toBe(wave); expect(state.stageKind).toBe('armada');
    expect(state.flights.roster).toBeGreaterThanOrEqual(initial.flights.roster);
    await game.finish(); expect((await game.state()).phase).toBe('recovery');
    expect((await game.state()).view.armadaCraftVisible).toBe(true);
    await page.mouse.down(); await game.step(0.02); await page.mouse.up();
  }
  expect((await game.state()).menu).toBe('shop');
  await game.action('equip:spread'); await game.action('buy:tier');
  const purchased = await game.state(); expect(purchased.tiers?.spread).toBe(2);
  await game.action('title'); await page.reload(); await game.action('mode:invaders'); await game.action('resumeRun');
  expect((await game.state()).credits).toBe(purchased.credits);
  expect((await game.state()).tiers?.spread).toBe(2);
  await game.action('depart'); await game.engage(); expect((await game.state()).stage).toBe(4);
  await game.pause(); await game.action('title'); await game.action('scores');
  await expect(page.locator('.score-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.score-table')).toContainText(String(purchased.score));
  await game.action('scores:endless'); await expect(page.locator('.score-table')).toContainText('NO FLIGHTS RECORDED YET');
});

test('Smuggler Run is mouse-playable through the asteroid exit and canyon exit', async ({ game, page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { Date.now = () => 41717; });
  await game.open(); await game.start('smuggler');
  const pilot = new MousePilot(game);
  expect((await game.state()).bonus?.kind).toBe('asteroids');
  await expect(page.locator('#bonusExitButton')).toBeHidden();
  await game.screenshot('smuggler-asteroids');
  expect(await pilot.asteroidRun()).toBeGreaterThan(110);
  expect((await game.state()).menu).toBe('smugglerResult');
  const banked = (await game.state()).score!; expect(banked).toBeGreaterThan(1000);
  await game.action('depart'); await game.engage();
  expect((await game.state()).bonus?.kind).toBe('canyon');
  await game.pause(); await expect(page.locator('#screenContent [data-action="exitBonus"]')).toHaveCount(0);
  await game.action('controls'); await game.action('backToPause'); await game.engage('unpause');
  await game.screenshot('smuggler-canyon');
  const flight = await pilot.canyonRun(); expect(flight.passed).toBeGreaterThan(12);
  expect((await game.state()).menu).toBe('smugglerResult');
  expect((await game.state()).score).toBeGreaterThan(banked);
  expect((await game.state()).lives).toBe(Math.min(5, 3 + Math.floor((await game.state()).score! / 5000)));
  await game.action('depart'); await game.engage();
  expect((await game.state()).bonus?.kind).toBe('asteroids');
  expect((await game.state()).bonus?.difficulty).toBe(2);
});

test('Smuggler lives, banked rewards, continue and resume cannot duplicate payouts', async ({ game, page }) => {
  await page.clock.install(); await game.open(); await game.start('smuggler');
  await page.evaluate(() => { window.vectorShooterDebug.setBonusPoints(200); window.vectorShooterDebug.finishBonus('complete'); });
  const delivered = await game.state(); expect(delivered.score).toBe(6300); expect(delivered.lives).toBe(4);
  expect(delivered.nextLifeScore).toBe(10000);
  await game.action('title'); await page.reload(); await game.action('mode:smuggler'); await game.action('resumeRun');
  expect((await game.state()).menu).toBe('smugglerResult'); expect((await game.state()).score).toBe(delivered.score);
  await page.evaluate(() => window.vectorShooterDebug.finishBonus('complete'));
  expect((await game.state()).score).toBe(delivered.score);
  await game.action('depart'); await game.engage();
  await page.evaluate(() => window.vectorShooterDebug.setBonusPoints(99));
  await game.pause(); await game.action('title'); await game.action('resumeRun'); await game.engage();
  expect((await game.state()).bonus?.points).toBe(0); expect((await game.state()).lives).toBe(4);
  for (const lives of [3, 2, 1, 0]) {
    await page.evaluate(() => { window.vectorShooterDebug.setBonusPoints(200); window.vectorShooterDebug.forcePlayerDeath(); });
    expect((await game.state()).score).toBe(delivered.score); expect((await game.state()).lives).toBe(lives);
    expect((await game.state()).menu).toBe('gameover');
    await game.engage('relaunch', false);
  }
  expect((await game.state()).lives).toBe(3); expect((await game.state()).score).toBe(0);
  expect((await game.state()).continued).toBe(true); expect((await game.state()).nextLifeScore).toBe(5000);
  expect((await game.state()).bonus?.kind).toBe('canyon');
  await page.evaluate(() => { window.vectorShooterDebug.setBonusPoints(200); window.vectorShooterDebug.finishBonus('complete'); });
  await game.action('title'); await game.action('scores');
  await expect(page.locator('.score-table tbody tr')).toHaveCount(2);
  await expect(page.locator('.score-table')).toContainText('CONTINUED');
  await game.action('scores:invaders'); await expect(page.locator('.score-table')).toContainText('NO FLIGHTS RECORDED YET');
});
