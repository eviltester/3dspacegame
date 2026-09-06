import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const output = 'output/playwright/arcade';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

try {
  await page.addInitScript(() => {
    localStorage.removeItem('vector-shooter-save-v1');
    window.arcadeAudioChecks = { sources: 0, contexts: [] };
    const createSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      window.arcadeAudioChecks.sources += 1;
      if (!window.arcadeAudioChecks.contexts.includes(this)) window.arcadeAudioChecks.contexts.push(this);
      return createSource.call(this);
    };
  });
  await page.goto(process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.vectorShooterDebug);
  const modelCount = Number((await page.locator('#modelCount').textContent()).split('/')[1]);
  for (let index = 0; index < modelCount; index += 1) {
    const bytes = await page.locator('#modelPreview canvas').screenshot({ path: `${output}/model-${String(index + 1).padStart(2, '0')}.png` });
    assertLit(bytes, `model ${index + 1}`);
    const before = bytes;
    await page.waitForTimeout(130);
    const after = await page.locator('#modelPreview canvas').screenshot();
    assert(!before.equals(after), `Model ${index + 1} should rotate`);
    await page.keyboard.press('ArrowRight');
  }
  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 },
    { width: 1024, height: 768 }, { width: 800, height: 600 }, { width: 390, height: 740 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(size);
    await checkScreenLayout();
    assertLit(await page.locator('#vectorTitle').screenshot(), `title at ${size.width}`);
    await page.screenshot({ path: `${output}/title-${size.width}.png` });
    if (size.width < 500) {
      await page.locator('.controls-card').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/controls-${size.width}.png` });
      await page.locator('.arcade-header').scrollIntoViewIfNeeded();
    }
  }

  const soundReport = await page.evaluate(async () => {
    const { SOUND_EFFECT_NAMES, synthesizeEffect, SOUND_SAMPLE_RATE } = await import('/src/sound.ts');
    return SOUND_EFFECT_NAMES.map(name => {
      const samples = synthesizeEffect(name);
      let peak = 0;
      let energy = 0;
      for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; }
      return { name, duration: samples.length / SOUND_SAMPLE_RATE, peak, rms: Math.sqrt(energy / samples.length),
        first: samples[0], last: samples.at(-1), finite: samples.every(Number.isFinite) };
    });
  });
  for (const sound of soundReport) {
    assert(sound.finite && sound.peak > 0.1 && sound.peak < 0.95 && sound.rms > 0.015, `Silent/clipped effect: ${sound.name}`);
    assert(Math.abs(sound.first) < 0.001 && Math.abs(sound.last) < 0.001, `Effect has a hard boundary: ${sound.name}`);
  }
  await writeFile(`${output}/sound-checks.json`, JSON.stringify(soundReport, null, 2));

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.click('#launchButton');
  await page.mouse.click(640, 360);
  await page.evaluate(() => window.vectorShooterDebug.forcePirateHit());
  await page.waitForTimeout(150);
  const soundState = await page.evaluate(() => ({ sources: window.arcadeAudioChecks.sources,
    running: window.arcadeAudioChecks.contexts.every(context => context.state === 'running') }));
  assert(soundState.sources >= 2 && soundState.running, 'Game sound sources must play in an unlocked audio context');
  assertLit(await page.locator('#viewport canvas').screenshot({ path: `${output}/flight.png` }), 'flight canvas');
  await page.evaluate(() => window.vectorShooterDebug.forcePlayerDeath());
  await page.waitForFunction(() => document.querySelector('#launchOverlay').dataset.mode === 'death');
  await checkScreenLayout();
  await page.screenshot({ path: `${output}/game-over-desktop.png` });
  await page.setViewportSize({ width: 390, height: 740 });
  await checkScreenLayout();
  await page.screenshot({ path: `${output}/game-over-mobile.png` });
  await page.click('#launchButton');
  await page.waitForFunction(() => document.querySelector('#launchOverlay').classList.contains('hidden'));
  await page.evaluate(() => window.vectorShooterDebug.forcePlayerDeath());
  await page.waitForFunction(() => document.querySelector('#launchOverlay').dataset.mode === 'briefing', undefined, { timeout: 12000 });
  assert.equal(await page.locator('#launchButton').textContent(), 'PLAY GAME');
  assert.equal(await page.locator('#modelPreview').isVisible(), true);
  assertLit(await page.locator('#modelPreview canvas').screenshot(), 'model after countdown');
  assert.deepEqual(errors, []);
  console.log(`Arcade checks passed: ${modelCount} animated models, 6 screen sizes, ${soundReport.length} sound effects, sound playback, relaunch and countdown.`);
} finally {
  await browser.close();
}

function assertLit(bytes, label) {
  const png = PNG.sync.read(bytes);
  let lit = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    if (png.data[index] + png.data[index + 1] + png.data[index + 2] > 75) lit += 1;
  }
  assert(lit > 30, `Blank vector canvas: ${label}`);
}

async function checkScreenLayout() {
  const problems = await page.evaluate(() => {
    const selectors = ['.arcade-header', '.mission-briefing', '.controls-card', '.model-card', '.start-actions'];
    const boxes = selectors.map(selector => ({ selector, element: document.querySelector(selector) }))
      .filter(({ element }) => getComputedStyle(element).display !== 'none')
      .map(({ selector, element }) => ({ selector, rect: element.getBoundingClientRect() }));
    const problems = [];
    for (let index = 0; index < boxes.length; index += 1) {
      const a = boxes[index];
      if (a.rect.left < -1 || a.rect.right > innerWidth + 1) problems.push(`${a.selector} outside viewport`);
      for (const b of boxes.slice(index + 1)) {
        if (a.rect.left < b.rect.right - 1 && a.rect.right > b.rect.left + 1 && a.rect.top < b.rect.bottom - 1 && a.rect.bottom > b.rect.top + 1) {
          problems.push(`${a.selector} overlaps ${b.selector}`);
        }
      }
    }
    for (const element of document.querySelectorAll('.briefing p, .briefing h2, .briefing dt, .briefing dd, .briefing button')) {
      if (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2) problems.push(`Text overflow: ${element.textContent}`);
    }
    return problems;
  });
  assert.deepEqual(problems, [], `Screen layout at ${page.viewportSize().width}`);
}
