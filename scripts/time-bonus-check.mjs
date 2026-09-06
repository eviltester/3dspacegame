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
const launch = async () => { await action('launch'); await page.waitForTimeout(100); };
const finish = () => page.evaluate(() => window.vectorShooterDebug.finishEncounter());
const pause = async () => { await page.mouse.click(720, 450, { button: 'middle', delay: 700 }); assert.equal((await state()).menu, 'pause'); };
const stop = async () => {
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 100);
  await step(0.02); assert.equal((await state()).throttle, 0);
};
const layout = async () => {
  const issues = await page.evaluate(() => {
    const timer = document.querySelector('#levelTimer'), rect = timer.getBoundingClientRect();
    const textOverflow = [...timer.children].filter(el => {
      const box = el.getBoundingClientRect();
      return box.left < rect.left - 1 || box.right > rect.right + 1 || box.bottom > rect.bottom + 1;
    }).map(el => el.id);
    const selectors = '.hud-panel,.radar,.bottom-strip,.message-log,.arcade-strip,.flight-buttons,#objectiveArrow,#threatArrow,#hitCallout';
    const boxes = [...document.querySelectorAll(selectors)].filter(el => el.getClientRects().length && getComputedStyle(el).opacity !== '0')
      .map(el => ({ id: el.id || el.className, rect: el.getBoundingClientRect() }));
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].rect, b = boxes[j].rect;
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2)
        overlaps.push(`${boxes[i].id} / ${boxes[j].id}`);
    }
    return { textOverflow, overlaps };
  });
  assert.deepEqual(issues, { textOverflow: [], overlaps: [] });
};
try {
  await page.goto(process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.vectorShooterDebug);
  await action('newRun');
  assert.match(await page.locator('#screenContent').innerText(), /TIME BONUS: 2:00 remaining/);
  await step(20); assert.equal((await state()).timeRemaining, 120);
  await launch(); await stop();
  const initial = (await state()).timeRemaining;
  await step(1); assert((await state()).timeRemaining < initial - 0.9);
  await pause(); const frozen = (await state()).timeRemaining;
  await step(20); await page.waitForTimeout(150); assert.equal((await state()).timeRemaining, frozen);
  await action('unpause'); await page.waitForTimeout(100);
  await finish(); await step(0.2);
  const cleared = await state();
  assert.equal(cleared.phase, 'cleared'); assert.equal(cleared.timeBonus, null);
  await step(6); const salvage = await state();
  assert(salvage.timeRemaining <= cleared.timeRemaining - 5.9);
  assert.equal(salvage.timeBonus, null);
  checks.push('briefing and pause freeze time; combat and post-objective salvage consume it');

  for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [320, 844]]) {
    await page.setViewportSize({ width, height }); await step(0.02); await layout();
    await page.screenshot({ path: `${out}/time-bonus-hud-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const a = PNG.sync.read(await page.locator('#viewport canvas').screenshot());
  await step(0.3);
  const b = PNG.sync.read(await page.locator('#viewport canvas').screenshot());
  let lit = 0, changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.max(a.data[i], a.data[i + 1], a.data[i + 2]) > 60) lit++;
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) changed++;
  }
  assert(lit > 500); assert(changed > 100);
  checks.push('visible animated vector canvas; timer layout fits 1440, 1024, 390 and 320px');

  await pause(); const saved = await state(); await action('title'); await page.reload();
  await action('resumeRun'); assert.equal((await state()).timeRemaining, saved.timeRemaining);
  assert.equal((await state()).timeBonus, null);
  await launch(); await step(2.9);
  const paid = await state();
  assert.equal(paid.timeBonus, Math.floor(paid.timeRemaining + 1e-6) * 10);
  assert(paid.timeBonus > 0); assert.equal(paid.credits, saved.credits + paid.timeBonus);
  assert.equal(paid.menu, '', 'payout must happen on gate entry, before warp completes');
  await step(0.1); assert.equal((await state()).timeRemaining, paid.timeRemaining);
  await page.reload(); await action('resumeRun'); await launch(); await step(5);
  assert.equal((await state()).menu, 'shop'); assert.equal((await state()).credits, paid.credits);
  assert.equal((await state()).timeBonus, paid.timeBonus);
  assert.match(await page.locator('#dockTimeBonus').innerText(), new RegExp(`\\+CR ${paid.timeBonus}$`));
  await step(20); assert.equal((await state()).timeRemaining, paid.timeRemaining);
  checks.push('normal flight into gate pays exact seconds x10; warp reload cannot duplicate payout; dock confirms award');

  await action('title'); await action('newRun'); await launch(); await stop(); await finish();
  const lives = (await state()).lives; await step(130);
  const expired = await state();
  assert.equal(expired.timeRemaining, 0); assert.equal(expired.phase, 'cleared'); assert.equal(expired.lives, lives);
  assert.equal(await page.locator('#levelClock').innerText(), 'TIME 0:00');
  assert.equal(await page.locator('#timeBonusReadout').innerText(), 'GATE +CR 0');
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -100);
  await step(5); assert.equal((await state()).menu, 'shop');
  assert.equal((await state()).timeBonus, 0); assert.equal((await state()).credits, expired.credits);
  checks.push('zero time remains playable and gate pays zero without costing a life');

  await action('title'); await action('mode:endless'); await action('newRun'); await launch(); await finish(); await step(0.3);
  assert.equal((await state()).phase, 'recovery');
  assert.match(await page.locator('#timeBonusReadout').innerText(), /^NEXT \+CR/);
  await page.mouse.click(720, 450); await page.waitForTimeout(100);
  assert.equal((await state()).stage, 2); assert((await state()).timeRemaining > 119);
  assert.equal((await state()).timeBonus, null);
  assert.match((await state()).messageLog, /TIME BONUS BANKED \+CR/);
  await finish(); await step(8.1);
  assert.equal((await state()).stage, 3); assert((await state()).timeRemaining > 119);
  assert.match((await state()).messageLog, /TIME BONUS BANKED \+CR/);
  checks.push('Endless next-wave mouse click and automatic recovery both bank once and reset the clock');

  await pause(); await action('title'); await action('mode:journey'); await action('newRun');
  await page.evaluate(() => window.vectorShooterDebug.setStage(3));
  await launch(); await finish();
  await page.evaluate(() => window.vectorShooterDebug.reachGate()); await step(2.2);
  assert.equal((await state()).menu, 'bonusOffer');
  const main = await state(); await action('bonusPlay'); await step(2);
  assert.equal((await state()).timeRemaining, main.timeRemaining);
  assert.equal(await page.locator('#levelTimer').isVisible(), false);
  await pause(); await action('exitBonus'); await action('bonusDock');
  assert.equal((await state()).timeRemaining, main.timeRemaining);
  assert.equal((await state()).timeBonus, main.timeBonus);
  checks.push('optional sortie uses its own clock and preserves banked main-level bonus');
  assert.deepEqual(errors, []);
  await writeFile(`${out}/time-bonus-report.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log('PASS TIME BONUS', JSON.stringify({ checks, errors }));
} finally { await browser.close(); }
