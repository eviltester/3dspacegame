import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/game';

async function keyAction(page: Page, action: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.action) === action) {
      await page.keyboard.press('Enter'); return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Cannot reach ${action} with the keyboard`);
}

for (const scheme of ['wasd', 'arrows'] as const) {
  const up = scheme === 'wasd' ? 'w' : 'ArrowUp';
  const right = scheme === 'wasd' ? 'd' : 'ArrowRight';
  const fire = scheme === 'wasd' ? 'j' : 'z';
  const blast = scheme === 'wasd' ? 'k' : 'x';

  test(`${scheme}: keyboard-only menus, flight, weapons, pause, death and continue`, async ({ game, page }) => {
    await game.open(); await keyAction(page, 'controls'); await keyAction(page, `controls:${scheme}`);
    await page.reload();
    await keyAction(page, 'controls');
    await expect(page.locator(`[data-action="controls:${scheme}"]`)).toHaveAttribute('aria-pressed', 'true');
    await keyAction(page, 'title');
    await keyAction(page, 'newRun'); await expect(page.locator('#missionBriefCaution')).toContainText(`Hold ${fire.toUpperCase()}`);
    await keyAction(page, 'launch');
    await expect.poll(async () => (await game.state()).menu).toBe('');
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    const before = await game.state();
    await page.keyboard.down(up); await game.step(0.3); await page.keyboard.up(up);
    expect((await game.state()).orientation).not.toEqual(before.orientation);
    expect((await game.state()).throttle).toBe(65);
    await page.keyboard.down('f'); await game.step(1); await page.keyboard.up('f');
    expect((await game.state()).throttle).toBeLessThan(0);
    await expect(page.locator('#speedReadout')).toContainText('REV');
    await page.keyboard.down(fire); await game.step(0.5); await page.keyboard.up(fire);
    expect((await game.state()).stats.shots).toBeGreaterThan(1);
    await page.keyboard.press('2'); await expect(page.locator('#weaponReadout')).toContainText('SPREAD');
    await page.keyboard.press('Tab'); await expect(page.locator('#weaponReadout')).toContainText('LANCE');
    await page.evaluate(() => window.vectorShooterDebug.primeBlast());
    await expect(page.locator('#chargeReadout')).toContainText(`BLAST READY / ${blast.toUpperCase()}`);
    await page.keyboard.press(blast); expect((await game.state()).charge).toBeLessThan(100);
    expect((await game.state()).wanted).toBe(false);
    await page.keyboard.down(fire); await page.keyboard.down(right); await page.keyboard.press('Escape');
    await expect.poll(async () => (await game.state()).menu).toBe('pause');
    const frozen = await game.state(); await game.step(2); expect((await game.state()).elapsed).toBe(frozen.elapsed);
    await page.keyboard.up(fire); await page.keyboard.up(right); await keyAction(page, 'unpause'); await game.step(0.3);
    expect((await game.state()).stats.shots).toBe(frozen.stats.shots);
    expect((await game.state()).orientation).toEqual(frozen.orientation);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(async () => (await game.state()).menu).toBe('pause'); await keyAction(page, 'unpause');
    for (const lives of [2, 1, 0]) {
      await page.evaluate(() => window.vectorShooterDebug.forcePlayerDeath());
      expect((await game.state()).lives).toBe(lives);
      if (lives === 0) await keyAction(page, 'relaunch'); else await game.step(0.02);
      await expect.poll(async () => (await game.state()).menu).toBe('');
    }
    expect((await game.state()).lives).toBe(3); expect((await game.state()).continued).toBe(true);
    await page.keyboard.press('Escape'); await keyAction(page, 'title');
    await expect(page.locator('#resumeButton')).toBeVisible();
  });

  test(`${scheme}: armada lane and all bonus craft remain keyboard-playable`, async ({ game, page }) => {
    await game.open(); await keyAction(page, 'controls'); await keyAction(page, `controls:${scheme}`); await keyAction(page, 'title'); await keyAction(page, 'newRun');
    await page.evaluate(() => window.vectorShooterDebug.setStage(3)); await keyAction(page, 'launch');
    await expect.poll(async () => (await game.state()).menu).toBe('');
    const position = (await game.state()).position;
    await page.keyboard.down(up); await game.step(0.25); await page.keyboard.up(up);
    expect((await game.state()).position).toEqual(position);
    await page.keyboard.down(right); await game.step(0.25); await page.keyboard.up(right);
    expect((await game.state()).position[0]).toBeGreaterThan(position[0]);
    expect((await game.state()).position.slice(1)).toEqual([0, 0]);
    await page.keyboard.press('Escape'); await keyAction(page, 'title');
    for (const code of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'b', 'a']) await page.keyboard.press(code);
    await keyAction(page, 'levelWarp');
    for (const kind of ['asteroids', 'canyon', 'sequence']) {
      await keyAction(page, `warpBonus:${kind}`);
      await expect(page.locator('.mission-copy')).toContainText(`Hold ${fire.toUpperCase()}`);
      await keyAction(page, 'bonusPlay'); await expect.poll(async () => (await game.state()).menu).toBe('');
      const initial = await game.state();
      await page.keyboard.down(up); await page.keyboard.down(right); await game.step(0.12);
      await page.keyboard.up(up); await page.keyboard.up(right);
      expect((await game.state()).view).not.toEqual(initial.view);
      await page.keyboard.down(fire); await game.step(0.3); await page.keyboard.up(fire);
      if (kind === 'sequence') expect((await game.state()).bonus?.shotsFired).toBeGreaterThan(0);
      await page.keyboard.press(blast); expect((await game.state()).phase).toBe('bonus');
      if (kind !== 'sequence') expect((await game.state()).bonus?.charge).toBe(0);
      if (kind === 'canyon') {
        const normal = (await game.state()).bonusCourse!.speed;
        const throttle = (await game.state()).throttle;
        await page.keyboard.down('f'); await page.keyboard.down('Shift'); await game.step(0.1);
        expect((await game.state()).bonusCourse!.speed).toBeGreaterThan(normal * 1.4);
        await page.keyboard.up('f'); await page.keyboard.up('Shift');
        expect((await game.state()).throttle).toBe(throttle);
      }
      await page.keyboard.press('Escape'); await keyAction(page, 'exitBonus');
      expect((await game.state()).menu).toBe('bonusResult');
      expect((await game.state()).lives).toBe(initial.lives);
      expect((await game.state()).hull).toBe(initial.hull);
      await keyAction(page, 'levelWarp');
    }
  });
}
