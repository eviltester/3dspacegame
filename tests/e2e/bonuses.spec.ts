import { test, expect } from './fixtures/game';
import { MousePilot } from './fixtures/pilot';
import { PNG } from 'pngjs';
import { ASTEROID_COLORS } from '../../src/models/primitives';

test.use({ trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true } });

for (const kind of ['asteroids', 'canyon', 'sequence'] as const) {
  test(`${kind}: same weapons, right-click blast, pause and safe mouse exit`, async ({ game, page }) => {
    await game.open(); await game.unlockWarp(); await game.bonus(kind);
    const main = await game.state();
    for (const [key, weapon] of [['2', 'spread'], ['3', 'lance'], ['1', 'pulse']]) {
      await page.keyboard.press(key); await expect(page.locator('#weaponReadout')).toContainText(weapon.toUpperCase());
    }
    await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await game.step(0.02);
    expect((await game.state()).bonus?.charge).toBe(0); expect((await game.state()).phase).toBe('bonus');
    await game.pause(); const frozen = await game.state(); await game.step(2); expect((await game.state()).bonus).toEqual(frozen.bonus);
    await game.action('exitBonus'); expect((await game.state()).menu).toBe('bonusResult');
    const result = await game.state();
    expect(result.hull).toBe(main.hull); expect(result.shield).toBe(main.shield); expect(result.lives).toBe(main.lives); expect(result.tiers).toEqual(main.tiers);
    await page.evaluate(() => window.vectorShooterDebug.finishBonus('exit')); expect((await game.state()).score).toBe(result.score);
    await game.action('bonusDock'); expect((await game.state()).menu).toBe('shop');
  });
}

test('hardest target sequence: moving sizes, actual mouse hits, shot costs and once-only net payout', async ({ game, page }) => {
  await game.open(); await game.unlockWarp(); await game.bonus('sequence', 8);
  const pilot = new MousePilot(game), main = await game.state();
  expect(main.bonusSequence?.targets).toHaveLength(30);
  expect(new Set(main.bonusSequence!.targets.map(t => t.radius)).size).toBeGreaterThan(10);
  await pilot.aimMarker([0, 90, -190]); await pilot.fire(true); await game.step(0.5); await pilot.fire(false);
  const missed = (await game.state()).bonus!;
  expect(missed.shotsFired).toBeGreaterThanOrEqual(3); expect(missed.points).toBe(-5 * missed.shotsFired);
  await game.screenshot('hardest-target-sequence'); await pilot.targetSequence();
  const summary = await page.locator('#targetResults').innerText();
  const match = /TARGETS (\d+)\/30 \/ SHOTS (\d+) \/ NET (-?\d+)/.exec(summary)!;
  expect(Number(match[1])).toBe(30); expect(Number(match[3])).toBe(3000 - Number(match[2]) * 5);
  expect((await game.state()).score! - main.score!).toBe(Number(match[3]));
});

for (const width of [1440, 390]) {
  test(`hardest asteroid belt at ${width}px: mouse dodging, acceleration and terminal gate`, async ({ game, page }) => {
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
    const peak = await new MousePilot(game).asteroidRun();
    expect(peak).toBeGreaterThan(165); await expect(page.locator('#briefingStatus')).toContainText('BONUS COMPLETE');
  });
}

test('hardest canyon: mouse boost, turrets, moving gates and exit', async ({ game, page }) => {
  await game.open(); await game.unlockWarp(); await game.bonus('canyon', 8);
  const start = await game.state(); expect(start.bonusCourse?.targets.filter(t => t.kind === 'turret')).toHaveLength(40);
  await page.keyboard.down('s'); await page.mouse.wheel(0, 100); await game.step(0.1); await page.keyboard.up('s');
  expect((await game.state()).throttle).toBe(start.throttle);
  await game.screenshot('hardest-canyon');
  const result = await new MousePilot(game).canyonRun();
  expect(result.peak).toBeGreaterThan(300); expect(result.fired).toBeGreaterThan(10); expect(result.passed).toBe(18);
  await expect(page.locator('#briefingStatus')).toContainText('BONUS COMPLETE'); expect((await game.state()).hull).toBe(start.hull);
});
