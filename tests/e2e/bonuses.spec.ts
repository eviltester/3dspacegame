import { test, expect } from './fixtures/game';
import { PNG } from 'pngjs';
import { ASTEROID_COLORS } from '../../src/models/primitives';

function greenPixels(frame: string) {
  const { data } = PNG.sync.read(Buffer.from(frame.split(',')[1], 'base64'));
  let pureGreen = 0, brightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 1] > 60 && data[i + 1] > data[i] * 2 && data[i + 1] > data[i + 2] * 3) pureGreen++;
    brightness += data[i + 1];
  }
  return { pureGreen, brightness };
}

for (const width of [1440, 390]) {
  test(`asteroid canvas at ${width}px renders distinct colours and motion`, async ({ game, page }) => {
    await game.openRenderer();
    const frames = await page.evaluate(async ({ path, width }) => {
      const { coursePreview } = await import(path) as typeof import('./fixtures/rendering');
      return coursePreview('asteroids', width, width === 1440 ? 900 : 844);
    }, { path: '/tests/e2e/fixtures/rendering.ts', width });
    const before = Buffer.from(frames[0].split(',')[1], 'base64'), pixels = PNG.sync.read(before).data;
    const counts = ASTEROID_COLORS.map(hex => {
      const rgb = [hex >> 16, hex >> 8 & 255, hex & 255], peak = Math.max(...rgb);
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const brightness = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
        if (brightness > 45 && rgb.every((value, channel) => Math.abs(pixels[i + channel] / brightness - value / peak) < 0.09)) count++;
      }
      return count;
    });
    expect(counts.filter(count => count > 5).length, 'distinct asteroid colours on WebGL canvas').toBeGreaterThanOrEqual(4);
    expect(frames[1]).not.toBe(frames[0]);
    await game.info.attach(`asteroids-${width}`, { body: before, contentType: 'image/png' });
  });
}

for (const kind of ['canyon', 'sequence'] as const) {
  test(`${kind} geometry renders on WebGL without playing a level`, async ({ game, page }) => {
    await game.openRenderer();
    const frames = await page.evaluate(async ({ path, kind }) => {
      const { coursePreview } = await import(path) as typeof import('./fixtures/rendering');
      return coursePreview(kind, 960, 600);
    }, { path: '/tests/e2e/fixtures/rendering.ts', kind });
    const buffer = Buffer.from(frames[0].split(',')[1], 'base64'), png = PNG.sync.read(buffer);
    let lit = 0;
    for (let i = 0; i < png.data.length; i += 4) if (Math.max(png.data[i], png.data[i + 1], png.data[i + 2]) > 60) lit++;
    expect(lit).toBeGreaterThan(300);
    if (kind === 'canyon') {
      expect(frames[1]).not.toBe(frames[0]);
      const gates = await page.evaluate(async path => {
        const { canyonGatePreview } = await import(path) as typeof import('./fixtures/rendering');
        return canyonGatePreview();
      }, '/tests/e2e/fixtures/rendering.ts');
      expect(greenPixels(gates[2]).pureGreen).toBeGreaterThan(greenPixels(gates[0]).pureGreen + 100);
      expect(greenPixels(gates[2]).brightness).toBeGreaterThan(greenPixels(gates[1]).brightness * 1.2);
      expect(gates[3]).toBe(gates[0]);
      await game.info.attach('canyon-gate-warning', { body: Buffer.from(gates[2].split(',')[1], 'base64'), contentType: 'image/png' });
    }
    await game.info.attach(kind, { body: buffer, contentType: 'image/png' });
  });
}
