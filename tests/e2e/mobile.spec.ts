import { test, expect } from './fixtures/game';

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

// Native touch delivery, canvas rendering and responsive layout require a browser.
// Tilt maths, permission outcomes and gesture timing are tested directly in src/mobile.
test('touch launch, native pointer capture and portrait/landscape flight controls', async ({ game, page }) => {
  await game.open();
  await page.getByRole('button', { name: 'CONTROLS', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'TOUCH / TILT', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await game.layout();
  await page.screenshot({ path: game.info.outputPath('touch-controls.png'), fullPage: true });
  await page.locator('[data-action="title"]').tap();
  await page.locator('[data-action="newRun"]').tap();
  await page.locator('[data-action="launch"]').tap(); await page.clock.runFor(80);
  await expect(page.locator('#launchOverlay')).toBeHidden();
  expect(await page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  // Real touches must reach the canvas without a browser scroll/cancel or synthetic mouse double fire.
  const canvas = page.locator('#viewport canvas');
  await expect(canvas).toHaveCSS('touch-action', 'none');
  await canvas.tap({ position: { x: 90, y: 420 } }); await page.clock.runFor(300);
  expect((await game.state()).stats.shots).toBeGreaterThan(0);
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await page.clock.runFor(80);
    await game.layout();
    for (const label of ['Pause', 'Boost', 'Increase throttle', 'Decrease throttle']) {
      const box = (await page.getByRole('button', { name: label, exact: true }).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width); expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    }
    const first = await game.screenshot(`touch-canvas-${size.width}`); await page.clock.runFor(200);
    expect((await game.screenshot(`touch-animated-${size.width}`)).equals(first)).toBe(false);
    await page.screenshot({ path: game.info.outputPath(`touch-flight-${size.width}.png`) });
  }
  // The browser owns pointer IDs and capture; record that actual touch contact was captured.
  await canvas.evaluate(element => element.addEventListener('pointerdown', event => {
    element.setAttribute('data-captured-touch', String((event as PointerEvent).pointerType === 'touch' && element.hasPointerCapture((event as PointerEvent).pointerId)));
  }));
  await canvas.tap({ position: { x: 700, y: 200 } });
  await expect(canvas).toHaveAttribute('data-captured-touch', 'true');
  await page.getByRole('button', { name: 'Pause', exact: true }).tap();
  await expect(page.locator('[data-action="unpause"]')).toBeVisible();
  await page.locator('[data-action="unpause"]').tap(); await page.clock.runFor(50);
  await expect(page.locator('#launchOverlay')).toBeHidden();
  await page.getByRole('button', { name: 'Pause', exact: true }).tap();
  await page.locator('[data-action="title"]').tap();
  await page.locator('[data-action="mode:smuggler"]').tap();
  await page.locator('[data-action="newRun"]').tap(); await page.locator('[data-action="launch"]').tap();
  await page.clock.runFor(50);
  // Arrange the canyon HUD without playing an entire asteroid belt.
  await page.evaluate(() => window.vectorShooterDebug.finishBonus('complete')); await game.step(3.1);
  expect((await game.state()).bonus?.kind).toBe('canyon');
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await page.clock.runFor(80); await game.layout();
    await expect(page.locator('#touchThrottle')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Boost', exact: true })).toBeVisible();
    await game.screenshot(`touch-canyon-${size.width}`);
    await page.screenshot({ path: game.info.outputPath(`touch-canyon-${size.width}.png`) });
  }
});
