import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const out = 'output/playwright';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const state = () => page.evaluate(() => window.vectorShooterDebug.getState());
const step = seconds => page.evaluate(seconds => window.vectorShooterDebug.step(seconds), seconds);
const action = name => page.locator(`#screenContent [data-action="${name}"]`).click();
const audioCount = () => page.evaluate(() => window.__blastSounds);
try {
  await page.addInitScript(() => {
    window.__blastSounds = 0;
    const createSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = createSource.call(this), start = source.start.bind(source);
      source.start = (...args) => {
        if (source.buffer?.length === 16538) window.__blastSounds++;
        return start(...args);
      };
      return source;
    };
  });
  for (const [stage, kind] of [[3, 'asteroids'], [7, 'canyon'], [11, 'sequence']]) {
    await page.goto(process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/');
    await page.waitForFunction(() => window.vectorShooterDebug);
    await action('newRun'); await page.evaluate(n => window.vectorShooterDebug.setStage(n), stage);
    await action('launch'); await step(0.1);
    await page.evaluate(() => window.vectorShooterDebug.finishEncounter());
    await page.evaluate(() => window.vectorShooterDebug.reachGate()); await step(2.2);
    assert.equal((await state()).menu, 'bonusOffer');
    const briefing = await page.locator('#screenContent').innerText();
    assert.match(briefing, /Right click uses your charged blast/);
    assert.doesNotMatch(briefing, /Right click exits/);
    const main = await state();
    await action('bonusPlay'); await step(2);
    const before = await state(), soundBefore = await audioCount();
    assert.equal(before.bonus.kind, kind); assert.equal(before.bonus.charge, 100);
    assert.equal(await page.locator('#chargeReadout').innerText(), 'BLAST READY / RIGHT CLICK');
    await page.mouse.click(720, 450, { button: 'right' }); await step(0.03);
    const blasted = await state();
    assert.equal(blasted.phase, 'bonus'); assert.equal(blasted.menu, '');
    assert.equal(blasted.bonus.charge, 0); assert.equal(blasted.bonus.finished, false);
    assert.equal(blasted.charge, main.charge, 'main ship charge must be isolated');
    assert.equal(await audioCount(), soundBefore + 1, 'blast sound must play');
    if (kind === 'sequence') {
      assert.equal(blasted.bonus.nextMarker, before.bonus.nextMarker);
      assert.equal(blasted.bonus.points, before.bonus.points);
    } else assert(blasted.bonus.points > before.bonus.points, 'blast must destroy nearby hazards');
    const png = PNG.sync.read(await page.locator('#viewport canvas').screenshot({ path: `${out}/bonus-blast-${kind}.png` }));
    let cyan = 0;
    for (let y = Math.round(png.height * 0.25); y < png.height * 0.75; y++) for (let x = Math.round(png.width * 0.15); x < png.width * 0.85; x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i + 1] > 200 && png.data[i + 2] > 200 && png.data[i + 2] > png.data[i] + 10) cyan++;
    }
    assert(cyan > 50, 'transparent blast pulse should render');
    await page.mouse.click(720, 450, { button: 'right' }); await step(0.02);
    assert.equal((await state()).phase, 'bonus'); assert.equal((await state()).bonus.charge, 0);
    assert.equal(await audioCount(), soundBefore + 1, 'empty charge must not fire a second blast');
    assert.equal(await page.locator('#chargeReadout').innerText(), 'BLAST 0%');
    await page.mouse.click(720, 450, { button: 'middle', delay: 700 });
    assert.equal((await state()).menu, 'pause');
    const frozen = (await state()).bonus.elapsed; await step(2); assert.equal((await state()).bonus.elapsed, frozen);
    await action('unpause'); await step(0.1);
    assert.equal((await state()).bonus.charge, 0);
    if (kind === 'asteroids') {
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 }); await step(0.02);
        const fits = await page.locator('#chargeReadout').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
        assert(fits);
        await page.screenshot({ path: `${out}/bonus-blast-hud-${width}.png` });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await page.mouse.click(720, 450, { button: 'middle', delay: 700 }); await action('exitBonus');
    const exited = await state();
    assert.equal(exited.menu, 'bonusResult'); assert.equal(exited.charge, main.charge);
    assert.equal(exited.lives, main.lives); assert.equal(exited.hull, main.hull); assert.equal(exited.shield, main.shield);
    assert.deepEqual(exited.tiers, main.tiers);
    const credits = exited.credits, score = exited.score;
    await page.evaluate(() => window.vectorShooterDebug.finishBonus('exit'));
    assert.equal((await state()).credits, credits); assert.equal((await state()).score, score);
    checks.push(`${kind}: right-click blast, audio/pulse, no accidental exit, charge isolation, pause/resume and explicit safe exit`);
  }
  assert.deepEqual(errors, []);
  await writeFile(`${out}/bonus-blast-report.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log('PASS BONUS BLAST', JSON.stringify({ checks, errors }));
} finally { await browser.close(); }
