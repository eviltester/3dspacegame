import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const out = 'output/playwright';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const state = () => page.evaluate(() => window.vectorShooterDebug.getState());
const step = seconds => page.evaluate(seconds => window.vectorShooterDebug.step(seconds), seconds);
const action = name => page.locator(`#screenContent [data-action="${name}"]`).click();
const code = async () => { for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'b', 'a']) await page.keyboard.press(key); };
const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('vector-shooter-save-v2')));
const pause = async () => { await page.mouse.click(720, 450, { button: 'middle', delay: 700 }); assert.equal((await state()).menu, 'pause'); };
const launch = async () => { await action('launch'); await page.waitForTimeout(80); await step(0.3); };
const canvas = async name => {
  const png = PNG.sync.read(await page.locator('#viewport canvas').screenshot({ path: `${out}/${name}.png` }));
  let lit = 0;
  for (let i = 0; i < png.data.length; i += 4) if (Math.max(png.data[i], png.data[i + 1], png.data[i + 2]) > 60) lit++;
  assert(lit > 500, `${name} canvas should contain visible vector geometry`);
  return png;
};
try {
  await page.addInitScript(() => {
    window.__unlockSounds = 0; window.__unlockContextRunning = false;
    const createSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = createSource.call(this), start = source.start.bind(source), context = this;
      source.start = (...args) => {
        if (source.buffer?.length === 14112) { window.__unlockSounds++; window.__unlockContextRunning = context.state === 'running'; }
        return start(...args);
      };
      return source;
    };
  });
  await page.goto(process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.vectorShooterDebug);
  assert.equal(await page.locator('#levelWarpButton').count(), 0);
  await action('newRun'); await code(); assert.equal((await state()).levelWarpUnlocked, false);
  await launch(); await code(); assert.equal((await state()).levelWarpUnlocked, false);
  await pause(); await action('title');
  await action('mode:endless'); await action('newRun'); await action('title');
  await action('mode:journey'); const normalSave = await save();
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'a', 'b']) await page.keyboard.press(key);
  assert.equal(await page.locator('#levelWarpButton').count(), 0);
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowUp'); await page.keyboard.up('ArrowUp');
  for (const key of ['ArrowDown', 'ArrowDown', 'b', 'a']) await page.keyboard.press(key);
  assert.equal((await state()).levelWarpUnlocked, false);
  await code(); assert.equal((await state()).levelWarpUnlocked, true);
  await page.waitForFunction(() => window.__unlockSounds === 1);
  assert.equal(await page.evaluate(() => window.__unlockContextRunning), true);
  assert.match(await page.locator('#briefingStatus').innerText(), /BONUS UNLOCKED - LEVEL WARP/);
  assert.equal(await page.locator('#levelWarpButton').count(), 1);
  await code(); assert.equal(await page.evaluate(() => window.__unlockSounds), 1);
  await page.screenshot({ path: `${out}/level-warp-unlocked.png` });
  checks.push('exact title-only code; wrong/repeated keys rejected; original audible unlock; one hidden menu item');

  await action('levelWarp');
  assert.equal(await page.locator('#warpStage option').count(), 99);
  assert.equal(await page.locator('[data-action^="warpBonus:"]').count(), 3);
  for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [320, 844]]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const root = document.querySelector('#launchOverlay');
      const overflow = [...root.querySelectorAll('button,select,input,h2,label')].filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 2).map(el => el.textContent);
      const controls = [...document.querySelectorAll('.warp-picker, #screenContent .menu-actions')].map(el => el.getBoundingClientRect());
      return { overflow, wide: root.scrollWidth > innerWidth + 1, overlap: controls.some((rect, index) => index > 0 && rect.top < controls[index - 1].bottom - 1) };
    });
    assert.deepEqual(layout, { overflow: [], wide: false, overlap: false });
    await page.screenshot({ path: `${out}/level-warp-menu-${width}.png` });
    await page.locator('[data-action="title"]').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('[data-action="title"]').isVisible(), true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  checks.push('mouse-operated selector: 99 stages and 3 bonuses; 1440/1024/390/320px menus fit and scroll');

  const kinds = ['patrol', 'rescue', 'armada', 'boss', 'ambush', 'escort', 'armada', 'boss', 'defend', 'assault', 'armada', 'boss'];
  for (const stage of [...Array.from({length:12}, (_, i) => i + 1), 13, 50, 97, 98, 99]) {
    await page.locator('#warpStage').selectOption(String(stage)); await action('warpJourney');
    assert.equal((await state()).menu, 'briefing'); assert.equal((await state()).stage, stage);
    assert.equal((await state()).practice, true); assert.equal((await state()).timeRemaining, 120);
    assert.equal((await state()).credits, 0); await launch();
    assert.equal((await state()).phase, 'playing'); assert.equal((await state()).stageKind, stage === 97 ? 'ambush' : stage === 98 ? 'assault' : stage === 99 ? 'boss' : kinds[(stage - 1) % 12]);
    assert.equal((await state()).wanted, false);
    await page.mouse.down(); await step(0.2); await page.mouse.up();
    assert((await state()).stats.shots > 0);
    if ([1, 3, 12].includes(stage)) await canvas(`level-warp-stage-${stage}`);
    if (stage === 1) {
      await page.evaluate(() => { window.vectorShooterDebug.finishEncounter(); window.vectorShooterDebug.reachGate(); });
      await step(2.2); assert.equal((await state()).menu, 'shop');
      await action('buy:tier'); await action('levelWarp');
    } else if (stage === 12) {
      await page.evaluate(() => window.vectorShooterDebug.forcePlayerDeath());
      assert.equal((await state()).menu, 'gameover'); await action('relaunch'); await page.waitForTimeout(80);
      assert.equal((await state()).stage, 12); assert.equal((await state()).practice, true);
      await pause(); await action('levelWarp');
    } else { await pause(); await action('levelWarp'); }
    assert.equal((await state()).menu, 'levelWarp'); assert.deepEqual(await save(), normalSave);
  }
  checks.push('first 12 stages plus 13/50/97/98/99 launch with working fire and correct encounters; test gate, purchase, death/retry preserve normal saves');

  for (const kind of ['asteroids', 'canyon', 'sequence']) {
    await action(`warpBonus:${kind}`); assert.equal((await state()).menu, 'bonusOffer');
    await action('bonusPlay'); await page.waitForTimeout(80); await step(0.2);
    assert.equal((await state()).bonus.kind, kind); assert.equal((await state()).phase, 'bonus');
    const a = await canvas(`level-warp-bonus-${kind}`); await step(0.2);
    const b = PNG.sync.read(await page.locator('#viewport canvas').screenshot());
    assert(!a.data.equals(b.data), 'bonus canvas should animate');
    await page.mouse.click(720, 450, { button: 'right' }); await step(0.03);
    assert.equal((await state()).bonus.charge, 0); assert.equal((await state()).phase, 'bonus');
    await pause();
    if (kind === 'canyon') { await action('exitBonus'); assert.equal((await state()).menu, 'bonusResult'); }
    await action('levelWarp'); assert.equal((await state()).menu, 'levelWarp');
    assert.equal((await state()).bonus, undefined); assert.deepEqual(await save(), normalSave);
  }
  checks.push('all bonus sorties accessible directly with animated canvas, charged blast and safe choose-level/exit paths');

  for (const invalid of ['', '0', '1.5']) {
    await page.locator('#warpWave').fill(invalid); await action('warpEndless');
    assert.equal((await state()).menu, 'levelWarp');
  }
  for (const [wave, kind] of [[8, 'armada'], [10, 'boss'], [17, 'patrol']]) {
    await page.locator('#warpWave').fill(String(wave)); await action('warpEndless'); await launch();
    assert.equal((await state()).mode, 'endless'); assert.equal((await state()).stage, wave); assert.equal((await state()).stageKind, kind);
    await pause(); await action('levelWarp');
  }
  await action('title'); await page.reload();
  assert.equal(await page.locator('#levelWarpButton').count(), 1); assert.deepEqual(await save(), normalSave);
  await action('resumeRun'); assert.equal((await state()).practice, false); assert.equal((await state()).stage, 1);
  assert.equal(await page.locator('[data-action="levelWarp"]').count(), 0);
  checks.push('Endless input validation and chosen waves; unlock survives reload; normal checkpoint resumes untouched');
  assert.deepEqual(errors, []);
  await writeFile(`${out}/level-warp-report.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log('PASS LEVEL WARP', JSON.stringify({ checks, errors }));
} finally { await browser.close(); }
