import { test, expect } from './fixtures/game';

test('ship destruction pays immediately, pauses its debris and plays secondary crackles', async ({ game, page }) => {
  await game.open(); await game.start();
  const destroyed = await page.evaluate(() => {
    const before = window.vectorShooterDebug.getState(), pirate = before.actors.find(actor => actor.kind === 'pirate')!;
    window.vectorShooterDebug.hitActor(pirate.id, 10000);
    return { before, after: window.vectorShooterDebug.getState(), id: pirate.id };
  });
  expect(destroyed.after.actors.some(actor => actor.id === destroyed.id)).toBe(false);
  expect(destroyed.after.score).toBeGreaterThan(destroyed.before.score!);
  expect(destroyed.after.destruction.panels).toBeGreaterThan(0);
  expect(destroyed.after.destruction.bursts).toBe(0);
  expect(destroyed.after.wanted).toBe(false);
  const audioBefore = await page.evaluate(() => window.testAudio.samples.length);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await game.state()).menu).toBe('pause');
  const frozen = (await game.state()).destruction; await game.step(2);
  expect((await game.state()).destruction).toEqual(frozen);
  await game.engage('unpause'); await game.step(0.9);
  expect((await game.state()).destruction.bursts).toBeGreaterThan(0);
  const crackleSamples = Math.ceil(0.23 * 22050);
  expect(await page.evaluate(({ audioBefore, crackleSamples }) => window.testAudio.samples.slice(audioBefore).includes(crackleSamples), { audioBefore, crackleSamples })).toBe(true);
  await game.step(1);
  expect((await game.state()).destruction).toEqual({ panels: 0, bursts: 0 });
});

test('reinforcements arrive with visible warp rings, message and sound; clean pilots remain protected', async ({ game, page }) => {
  await game.open(); await game.start(); await game.step(0.2);
  const arrival = await game.state();
  expect(arrival.arrival.effects).toBeGreaterThan(0); expect(arrival.arrival.remaining).toBeGreaterThan(0);
  await expect(page.locator('#missionTitle')).toHaveText('REINFORCEMENTS ARRIVED');
  expect(await page.evaluate(() => window.testAudio.samples.length)).toBeGreaterThan(0);
  const friends = arrival.actors.filter(a => ['police', 'trader'].includes(a.kind));
  await page.evaluate(() => { window.vectorShooterDebug.primeBlast(); window.vectorShooterDebug.blast(); });
  const blast = await game.state(); expect(blast.wanted).toBe(false);
  for (const friend of friends) expect(blast.actors.find(a => a.id === friend.id)?.hull).toBe(friend.hull);
  const pirate = blast.actors.find(a => a.kind === 'pirate');
  if (pirate) await page.evaluate(id => window.vectorShooterDebug.hitActor(id, 10), pirate.id);
  expect((await game.state()).wanted).toBe(false);
  const trader = blast.actors.find(a => a.kind === 'trader')!;
  await page.evaluate(id => window.vectorShooterDebug.hitActor(id, 1), trader.id); await game.step(0.02);
  expect((await game.state()).wanted).toBe(true); await expect(page.locator('#wantedBanner')).toHaveClass(/active/);
});

test('armada perspective, player craft and released-gate indicator render correctly', async ({ game, page }) => {
  await game.open(); await game.unlockWarp(); await game.warpStage(95);
  await expect(page.locator('#missionBriefObjective')).toContainText('tractor beam'); await game.engage(); await game.step(0.2);
  const before = await game.state(); expect(before.hostileCount).toBe(14); expect(before.view.position[1]).toBeGreaterThan(0);
  expect(before.view.armadaCraftVisible).toBe(true);
  const a = await game.screenshot('armada'); await game.step(0.3); const b = await game.screenshot('armada-motion'); expect(a.equals(b)).toBe(false);
  await game.finish(); await expect(page.locator('#objectiveArrow')).toContainText('WARP');
});
