import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const out = 'output/playwright'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], samples = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const state = () => page.evaluate(() => window.vectorShooterDebug.getState());
const step = seconds => page.evaluate(t => window.vectorShooterDebug.step(t), seconds);
const action = name => page.locator(`#screenContent [data-action="${name}"]`).click();
async function start(wave) {
  await page.locator('#warpWave').fill(String(wave)); await action('warpEndless');
  if (wave === 1000) assert.match(await page.locator('#missionBriefObjective').innerText(), /7 escort flights/);
  await action('launch'); await page.waitForTimeout(30);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 100);
  await step(1 / 60); assert.equal((await state()).throttle, 0);
}
async function picker() {
  if (!(await state()).menu) {
    await page.mouse.down({ button: 'middle' }); await page.waitForTimeout(650); await page.mouse.up({ button: 'middle' });
  }
  await action('levelWarp');
}
async function screen(name) {
  const buffer = await page.locator('#viewport canvas').screenshot({ path: `${out}/${name}-canvas.png` });
  const png = PNG.sync.read(buffer); let red = 0;
  for (let y = 170; y < png.height - 170; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4;
    if (png.data[i] > 90 && png.data[i] > png.data[i + 1] * 1.4) red++;
  }
  assert(red > 80, 'visible enemy geometry in battlefield');
  await page.screenshot({ path: `${out}/${name}.png` }); return buffer;
}
try {
  await page.goto(process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/'); await page.waitForFunction(() => window.vectorShooterDebug);
  await page.evaluate(() => window.vectorShooterDebug.persist());
  const saved = await page.evaluate(() => localStorage.getItem('vector-shooter-save-v2'));
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'b', 'a']) await page.keyboard.press(key);
  await action('levelWarp');
  for (const wave of [10, 1000]) {
    await start(wave); const initial = await state();
    let peakHostiles = 0, peakAttackers = 0, peakShots = 0, firstShot = null, elapsed = initial.elapsed, damage = 0;
    for (let tick = 0; tick < 100; tick++) {
      await step(0.1); const s = await state();
      peakHostiles = Math.max(peakHostiles, s.hostileCount); peakAttackers = Math.max(peakAttackers, s.attackerCount); peakShots = Math.max(peakShots, s.shots.length);
      // Losing a life restores checkpoint resources and run.elapsed; retain the observed sample.
      elapsed = Math.max(elapsed, s.elapsed); damage = Math.max(damage, s.menu === 'gameover' ? 200 : 200 - s.hull - s.shield);
      assert(s.hostileCount <= 18); assert(s.attackerCount <= 6); assert(s.shots.length <= 240);
      if (s.stats.enemyShots && firstShot === null) firstShot = s.elapsed;
      if (tick === 40 && !s.menu) {
        const a = await screen(`endless-wave-${wave}`); await step(0.1);
        const b = await screen(`endless-wave-${wave}-motion`); assert(!a.equals(b));
      }
      if (s.menu) break;
    }
    const s = await state();
    samples.push({ wave, elapsed, enemyShots: s.stats.enemyShots, shotsPerSecond: s.stats.enemyShots / elapsed,
      peakHostiles, peakAttackers, peakShots, damage, lost: s.menu === 'gameover', firstShot,
      flights: initial.flights, difficulty: initial.difficulty });
    assert(firstShot >= 1.8, 'fresh spawns retain their warmup and warning');
    console.log('ENDLESS SAMPLE', JSON.stringify(samples.at(-1))); await picker();
  }
  assert(samples[1].shotsPerSecond > samples[0].shotsPerSecond * 1.4);
  assert(samples.every(s => Number.isFinite(s.shotsPerSecond)));
  assert(samples[1].peakHostiles > samples[0].peakHostiles);
  assert.equal(samples[1].flights.total, 8); assert.equal(samples[1].flights.roster, 99);
  checks.push('wave 1000 fires at least 40% more shots per second than wave 10 in a stationary combat sample; visible reinforcements and preserved caps');

  await start(1000); const first = await state();
  await page.mouse.down(); await step(0.4); await page.mouse.up(); assert((await state()).stats.shots > 0);
  await page.mouse.down({ button: 'middle' }); await page.waitForTimeout(650); await page.mouse.up({ button: 'middle' });
  assert.equal((await state()).menu, 'pause'); const frozen = await state(); await step(5); assert.equal((await state()).elapsed, frozen.elapsed);
  await action('unpause'); await step(0.02);
  await page.evaluate(() => window.vectorShooterDebug.forcePlayerDeath()); assert.equal((await state()).lives, 2);
  await action('relaunch'); await step(0.1); assert.deepEqual((await state()).difficulty, first.difficulty);
  await page.evaluate(() => window.vectorShooterDebug.finishEncounter()); assert.equal((await state()).phase, 'cleared');
  const paid = (await state()).credits; await page.evaluate(() => window.vectorShooterDebug.finishEncounter()); assert.equal((await state()).credits, paid);
  await page.evaluate(() => window.vectorShooterDebug.reachGate()); await step(2.2);
  assert.equal((await state()).menu, 'bonusOffer'); await action('bonusSkip'); await action('depart');
  assert.equal((await state()).stage, 1001); const later = await state();
  assert(later.difficulty.movementScale > first.difficulty.movementScale); assert(later.difficulty.cooldownScale < first.difficulty.cooldownScale);
  assert.equal(later.flights.total, 13);
  checks.push('mouse fire/pause, retry at wave 1000, once-only completion, boss gate/shop, and stronger wave 1001');
  await action('launch'); await step(0.1); await page.evaluate(() => window.vectorShooterDebug.finishEncounter());
  assert.equal((await state()).phase, 'recovery'); const remaining = (await state()).recovery;
  assert(remaining < 3 && remaining > 1.5); await step(remaining + 0.1); assert.equal((await state()).stage, 1002);
  checks.push('late-wave recovery drops below three seconds and advances automatically');
  await picker();

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.locator('#warpWave').fill('1000'); await action('warpEndless');
    const overflow = await page.evaluate(() => [...document.querySelectorAll('#screenContent p,#screenContent button,#briefingStatus')]
      .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.id || e.textContent));
    assert.deepEqual(overflow, []); await page.screenshot({ path: `${out}/endless-1000-briefing-${width}.png` });
    await action('levelWarp');
  }
  assert.equal(await page.evaluate(() => localStorage.getItem('vector-shooter-save-v2')), saved);
  assert.deepEqual(errors, []); checks.push('desktop/mobile briefings fit; practice leaves saved progress untouched');
  await writeFile(`${out}/endless-difficulty-report.json`, JSON.stringify({ samples, checks, errors }, null, 2));
  console.log('PASS ENDLESS DIFFICULTY', JSON.stringify({ checks, errors }));
} finally { await browser.close(); }
