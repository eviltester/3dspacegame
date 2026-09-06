import { PNG } from 'pngjs';
import { test, expect } from './fixtures/game';

for (const [width, height] of [[960, 600], [390, 844]]) {
  test(`ship hulls spin apart then burst into visible coloured particles at ${width}px`, async ({ game, page }) => {
    await game.open();
    const frames = await page.evaluate(async ({ path, width, height }) => {
      const { explosionPreview } = await import(path) as typeof import('./fixtures/rendering');
      return explosionPreview(width, height);
    }, { path: '/tests/e2e/fixtures/rendering.ts', width, height });
    expect(frames[1].panels).toBe(6); expect(frames[1].bursts).toBe(0);
    expect(frames[2].panels).toBeGreaterThan(0); expect(frames[2].bursts).toBeGreaterThan(0);
    expect(frames[3].panels).toBe(0); expect(frames[3].bursts).toBeGreaterThan(0);
    expect(frames[4].panels + frames[4].bursts).toBe(0);
    for (const [i, frame] of frames.entries()) {
      const buffer = Buffer.from(frame.image.split(',')[1], 'base64'), png = PNG.sync.read(buffer);
      let lit = 0;
      for (let pixel = 0; pixel < png.data.length; pixel += 4) if (Math.max(png.data[pixel], png.data[pixel + 1], png.data[pixel + 2]) > 45) lit++;
      if (frame.name === 'finished') expect(lit).toBe(0); else expect(lit).toBeGreaterThan(100);
      if (i) expect(frame.image).not.toBe(frames[i - 1].image);
      await game.info.attach(`ship-${frame.name}-${width}`, { body: buffer, contentType: 'image/png' });
    }
  });
}

test('weapon rings are visible, animated and hollow on an actual WebGL canvas', async ({ game, page }) => {
  await game.open();
  const images = await page.evaluate(async path => {
    const { projectilePreviews } = await import(path) as typeof import('./fixtures/rendering');
    return projectilePreviews();
  }, '/tests/e2e/fixtures/rendering.ts');
  for (const { family, bright, dim } of images) {
    expect(bright).not.toBe(dim);
    const buffer = Buffer.from(bright.split(',')[1], 'base64'), png = PNG.sync.read(buffer);
    let lit = 0; for (let i = 0; i < png.data.length; i += 4) if (Math.max(png.data[i], png.data[i + 1], png.data[i + 2]) > 50) lit++;
    expect(lit).toBeGreaterThan(70);
    const center = (130 * 360 + 180) * 4; expect(png.data[center] + png.data[center + 1] + png.data[center + 2]).toBe(0);
    await game.info.attach(`${family}-projectile`, { body: buffer, contentType: 'image/png' });
  }
});

test('radar animates with flight and maximum combat load stays bounded and responsive', async ({ game, page }) => {
  await game.open(); await game.start();
  const radar = await game.screenshot('radar-before', '#radar'); await game.move(200, 100); await game.step(0.2);
  expect(radar.equals(await game.screenshot('radar-after', '#radar'))).toBe(false);
  await page.evaluate(() => window.vectorShooterDebug.maximumLoad());
  const start = await game.state(); expect(start.hostileCount).toBe(18); expect(start.shots.length).toBeGreaterThanOrEqual(220);
  const times = await page.evaluate(() => new Promise<number[]>(resolve => {
    const times: number[] = []; let previous = performance.now(); const start = previous;
    const sample = (now: number) => { times.push(now - previous); previous = now; if (now - start < 2300) requestAnimationFrame(sample); else resolve(times); };
    requestAnimationFrame(sample);
  }));
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length * 0.5)], p95 = times[Math.floor(times.length * 0.95)];
  expect(median, 'maximum-load median frame time').toBeLessThan(50);
  const end = await game.state(); expect(end.hostileCount).toBeLessThanOrEqual(18); expect(end.attackerCount).toBeLessThanOrEqual(6);
  expect(end.speedScale).toBeLessThanOrEqual(1.35); expect(end.shots.length).toBeLessThanOrEqual(240);
  await game.screenshot('maximum-load'); await game.info.attach('frame-times', { body: JSON.stringify({ median, p95, frames: times.length }), contentType: 'application/json' });
  const debris = await page.evaluate(() => {
    const state = window.vectorShooterDebug.getState();
    for (const actor of state.actors.filter(actor => actor.kind === 'pirate')) window.vectorShooterDebug.hitActor(actor.id, 10000);
    return window.vectorShooterDebug.getState().destruction;
  });
  expect(debris.panels).toBeGreaterThan(0); expect(debris.panels).toBeLessThanOrEqual(48);
  await game.screenshot('mass-ship-breakup');
  await game.step(0.8);
  const showers = (await game.state()).destruction;
  expect(showers.bursts).toBeGreaterThan(0); expect(showers.bursts).toBeLessThanOrEqual(48);
  await game.screenshot('mass-ship-particles');
});
