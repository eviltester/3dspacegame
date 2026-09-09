import { test, expect } from './fixtures/game';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Defensive Position platform breakup and arrival render at ${viewport.width}px`, async ({ game, page }) => {
    await page.setViewportSize(viewport); await game.open(); await game.start('invaders');
    await game.finish();
    // Advance the recovery in simulation time; this case checks pixels, not pointer-lock input.
    await game.step(2.45);
    expect((await game.state()).defensiveDestruction!.panels).toBeGreaterThan(0);
    const panels = await game.screenshot('platform-panels');
    await page.screenshot({ path: game.info.outputPath('platform-departure.png') });
    await game.step(0.7);
    expect((await game.state()).defensiveDestruction!.bursts).toBeGreaterThan(0);
    const particles = await game.screenshot('platform-particles'); expect(particles.equals(panels)).toBe(false);
    await game.step(1.35);
    expect((await game.state()).defensiveSequence).toBe('arriving');
    const incoming = await game.screenshot('next-wave-arrival');
    await page.screenshot({ path: game.info.outputPath('next-wave-arrival.png') });
    await game.step(1.1);
    const ready = await game.screenshot('new-platform-ready'); expect(ready.equals(incoming)).toBe(false);
    await page.screenshot({ path: game.info.outputPath('new-platform-ready.png') });
    await game.layout();
  });
}
