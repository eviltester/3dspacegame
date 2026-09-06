import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { Quaternion, Vector3 } from 'three';

const out = 'output/playwright';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const state = () => page.evaluate(() => window.vectorShooterDebug.getState());
const step = seconds => page.evaluate(s => window.vectorShooterDebug.step(s), seconds);
const action = name => page.locator(`[data-action="${name}"]`).click();
const soundCount = () => page.evaluate(() => window.__arrivalSounds);
const snapshot = async name => {
  const png = PNG.sync.read(await page.screenshot({ path: `${out}/${name}.png` }));
  let lit = 0;
  for (let i = 0; i < png.data.length; i += 4) if (Math.max(...png.data.subarray(i, i + 3)) > 60) lit++;
  assert(lit > 800, 'blank frame');
};
try {
  await page.addInitScript(() => {
    window.__arrivalSounds = 0;
    const createSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = createSource.call(this), start = source.start.bind(source);
      source.start = (...args) => {
        if (source.buffer?.length === 19845) window.__arrivalSounds++;
        return start(...args);
      };
      return source;
    };
  });
  await page.goto(process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.vectorShooterDebug);
  await action('newRun'); await action('launch'); await step(0.05);
  assert.equal((await state()).arrival.effects, 4);
  assert.equal(await soundCount(), 1);
  assert.match(await page.locator('#missionTitle').innerText(), /REINFORCEMENTS ARRIVED/);
  await snapshot('reinforcements-warp-in');
  checks.push('initial flight has a single audio cue, readable message, and four visible warp effects');

  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 100);
  await step(0.02);
  assert.equal((await state()).throttle, 0);
  assert.equal(await page.locator('#speedReadout').innerText(), 'STOP');
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 100);
  await page.mouse.move(720, 450); await step(0.02);
  const initialHeading = (await state()).orientation;
  await page.mouse.move(742, 458);
  await step(0.02);
  const before = await state();
  assert.notDeepEqual(before.orientation, initialHeading, 'reverse should also work along a steered heading');
  assert.equal(before.throttle, -45);
  await step(0.5);
  const after = await state();
  const displacement = new Vector3().fromArray(after.position).sub(new Vector3().fromArray(before.position));
  const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().fromArray(before.orientation));
  assert(displacement.dot(forward) < -20, 'reverse must move backwards along the local ship orientation');
  assert.deepEqual(after.orientation, before.orientation);
  assert.equal(await page.locator('#speedReadout').innerText(), 'REV 45');
  await page.mouse.click(720, 450, { button: 'middle' });
  assert.equal((await state()).menu, 'pause');
  await action('unpause'); await step(0.1);
  assert.equal((await state()).throttle, -45);
  await page.mouse.down(); await step(0.2); await page.mouse.up();
  assert((await state()).stats.shots > 0, 'can still fire while reversing');
  checks.push('mouse wheel stop detent, reverse movement, orientation, speed label, paused throttle, and firing');

  await page.evaluate(() => {
    const debug = window.vectorShooterDebug;
    for (const actor of debug.getState().actors.filter(a => a.kind === 'pirate')) debug.hitActor(actor.id, 9999);
  });
  await page.waitForTimeout(80);
  const previousSounds = await soundCount();
  await step(Math.max(0.02, 5.2 - (await state()).elapsed));
  assert.equal(await soundCount(), previousSounds + 1);
  assert.equal((await state()).arrival.effects, 5);
  assert.match((await state()).arrival.message, /5 PIRATE REINFORCEMENTS WARPED IN/);
  await step(1);
  assert.equal((await state()).arrival.effects, 0);
  assert((await state()).arrival.remaining > 0);
  assert.equal(await soundCount(), previousSounds + 1);
  await step(3.1);
  assert.equal((await state()).arrival.remaining, 0);
  assert.doesNotMatch(await page.locator('#missionTitle').innerText(), /REINFORCEMENTS/);
  checks.push('later flight announces once, warp rings clean up, and objective heading returns');

  await page.evaluate(() => window.vectorShooterDebug.finishEncounter()); await step(0.01);
  assert.equal((await state()).throttle, -45, 'completion must not silently switch reverse into forward');
  assert.equal((await state()).arrival.remaining, 0);
  await page.evaluate(() => window.vectorShooterDebug.setStage(4));
  await action('launch'); await step(0.02);
  await page.waitForTimeout(100);
  const carrierSounds = await soundCount();
  for (let i = 0; i < 11; i++) await page.mouse.wheel(0, 100);
  await step(9.1);
  assert.equal((await state()).menu, '');
  assert.match((await state()).arrival.message, /CARRIER DEPLOYED REINFORCEMENTS/);
  assert.equal(await soundCount(), carrierSounds + 1);
  checks.push('carrier-deployed reinforcements also get the arrival cue');

  await page.evaluate(() => window.vectorShooterDebug.setStage(1));
  await action('launch'); await step(0.02);
  await snapshot('reinforcements-desktop');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await step(0.05);
    const layout = await page.evaluate(() => {
      const title = document.querySelector('#missionTitle'), speed = document.querySelector('#speedReadout');
      const panel = title.closest('.hud-panel').getBoundingClientRect();
      const boxes = [...document.querySelectorAll('.hud-panel,.radar,.bottom-strip,.arcade-strip,.flight-buttons')]
        .filter(el => el.getClientRects().length).map(el => ({ id: el.className, rect: el.getBoundingClientRect() }));
      return {
        textFits: [title, speed].every(el => el.scrollWidth <= el.clientWidth + 1),
        inViewport: panel.left >= 0 && panel.right <= innerWidth,
        overlaps: boxes.flatMap((first, i) => boxes.slice(i + 1).filter(second => {
          const a = first.rect, b = second.rect;
          return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
        }).map(second => `${first.id} / ${second.id}`))
      };
    });
    await snapshot(`reinforcements-mobile-${width}`);
    assert.deepEqual(layout, { textFits: true, inViewport: true, overlaps: [] });
  }
  checks.push('nonblank desktop/mobile rendering and readable nonoverlapping HUD at 320px and 390px');
  assert.deepEqual(errors, []);
  await writeFile(`${out}/reverse-arrivals-report.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally { await browser.close(); }
