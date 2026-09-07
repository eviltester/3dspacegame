import { PNG } from 'pngjs';
import { test, expect } from './fixtures/game';

for (const [width, height] of [[960, 600], [390, 844]]) {
  test(`ship hulls spin apart then burst into visible coloured particles at ${width}px`, async ({ game, page }) => {
    await game.openRenderer();
    const frames = await page.evaluate(async ({ path, width, height }) => {
      const { explosionPreview } = await import(path) as typeof import('./fixtures/rendering');
      return explosionPreview(width, height);
    }, { path: '/tests/e2e/fixtures/rendering.ts', width, height });
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
  await game.openRenderer();
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

test('maximum-load canvas renders and reports hardware-dependent frame timings', async ({ game, page }) => {
  // This is a diagnostic measurement, not a correctness gate for shared CI CPUs.
  // Projectile/attacker/debris caps are enforced by direct controller tests.
  await game.open({ live: true }); await game.start();
  const radar = await game.screenshot('radar-before', '#radar'); await game.step(0.2);
  expect(radar.equals(await game.screenshot('radar-after', '#radar'))).toBe(false);
  await page.evaluate(() => window.vectorShooterDebug.maximumLoad());
  const times = await page.evaluate(() => new Promise<number[]>(resolve => {
    const times: number[] = []; let previous = performance.now(); const start = previous;
    const sample = (now: number) => { times.push(now - previous); previous = now; if (now - start < 2300) requestAnimationFrame(sample); else resolve(times); };
    requestAnimationFrame(sample);
  }));
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length * 0.5)], p95 = times[Math.floor(times.length * 0.95)];
  await game.screenshot('maximum-load');
  await game.info.attach('frame-times', {
    body: JSON.stringify({ diagnostic: true, median, p95, frames: times.length }), contentType: 'application/json'
  });
});
