import { test, expect } from './fixtures/game';
import { PNG } from 'pngjs';
import { ASTEROID_COLORS } from '../../src/models/primitives';

test.use({ trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true } });

for (const width of [1440, 390]) {
  test(`asteroid canvas at ${width}px: colours, motion and safe exit`, async ({ game, page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await game.open(); await game.unlockWarp(); await game.bonus('asteroids', 8);
    expect((await game.state()).bonusRocks).toHaveLength(180); await game.layout();
    const before = await game.screenshot(`hardest-asteroids-${width}`);
    // Check colours on the actual game canvas, allowing antialiasing to dim lines.
    const pixels = PNG.sync.read(before).data;
    const counts = ASTEROID_COLORS.map(hex => {
      const rgb = [hex >> 16, hex >> 8 & 255, hex & 255], peak = Math.max(...rgb);
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const brightness = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
        if (brightness > 45 && rgb.every((value, channel) => Math.abs(pixels[i + channel] / brightness - value / peak) < 0.09)) count++;
      }
      return count;
    });
    expect(counts.filter(count => count > 5).length, 'distinct asteroid colours visible in flight').toBeGreaterThanOrEqual(4);
    await game.step(0.12);
    const after = await game.screenshot(`moving-asteroids-${width}`);
    expect(after.equals(before)).toBe(false);
    await game.pause(); await game.action('exitBonus'); await expect(page.locator('#launchOverlay')).toBeVisible();
  });
}

test('canyon: mouse boost, fire, blast, pause and safe exit render correctly', async ({ game, page }) => {
  await game.open(); await game.unlockWarp(); await game.bonus('canyon', 8);
  const start = await game.state();
  await page.mouse.wheel(0, -100);
  await page.mouse.down(); await game.step(0.1); await page.mouse.up();
  expect((await game.state()).bonusCourse!.speed).toBeGreaterThan(start.bonusCourse!.speed);
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await game.step(0.02);
  expect((await game.state()).bonus?.charge).toBe(0);
  await game.screenshot('canyon-flight');
  await game.pause(); await game.action('exitBonus'); expect((await game.state()).menu).toBe('bonusResult');
});

test('numbered targets and their highlight render on the game canvas', async ({ game }) => {
  await game.open(); await game.unlockWarp(); await game.bonus('sequence', 8);
  // Ray/target hits, highlight progression and penalties are direct controller tests.
  expect((await game.state()).bonusSequence!.targets.filter(target => target.highlighted).map(target => target.number)).toEqual([1]);
  await game.screenshot('numbered-targets');
});
