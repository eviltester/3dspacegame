import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { Euler, Quaternion } from 'three';

const out = 'output/playwright'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const state = () => page.evaluate(() => window.vectorShooterDebug.getState());
const step = seconds => page.evaluate(t => window.vectorShooterDebug.step(t), seconds);
const action = name => page.locator(`#screenContent [data-action="${name}"]`).click();
let cursor;
async function clickTracked(name) {
  const r = await page.locator(`#screenContent [data-action="${name}"]`).boundingBox();
  cursor = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await action(name); await page.waitForTimeout(40);
}
async function start() { await action('warpBonus:sequence'); await clickTracked('bonusPlay'); }
async function hit(number) {
  await step(0.25);
  const s = await state(), target = s.bonusSequence.targets.find(t => t.number === number), [x, y, z] = target.position;
  const angles = new Euler().setFromQuaternion(new Quaternion().fromArray(s.view.orientation), 'YXZ');
  const yaw = Math.atan2(-x, -z), pitch = Math.atan2(y, Math.hypot(x, z));
  cursor.x += (angles.y - yaw) / 0.0022; cursor.y += (angles.x - pitch) / 0.0022;
  await page.mouse.move(cursor.x, cursor.y); await step(0.02);
  const before = await state();
  await page.mouse.down(); await step(0.02); await page.mouse.up();
  return before;
}
async function screenshot(name) {
  const buffer = await page.locator('#viewport canvas').screenshot({ path: `${out}/${name}.png` }), png = PNG.sync.read(buffer);
  let lit = 0, yellow = 0;
  for (let y = 160; y < png.height - 160; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4, [r, g, b] = png.data.subarray(i, i + 3);
    if (Math.max(r, g, b) > 100) lit++;
    if (r > 140 && g > 140 && b < r * 0.7) yellow++;
  }
  assert(lit > 700); assert(yellow > 20); return buffer;
}
try {
  await page.goto(process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/'); await page.waitForFunction(() => window.vectorShooterDebug);
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'b', 'a']) await page.keyboard.press(key);
  await action('levelWarp'); await start();
  const main = await state(), initial = main.bonusSequence.targets;
  const numbers = initial.map(t => t.number), ordered = Array.from({ length: 16 }, (_, i) => i + 1);
  assert.deepEqual([...numbers].sort((a, b) => a - b), ordered); assert.notDeepEqual(numbers, ordered);
  await step(1); assert.deepEqual((await state()).bonusSequence.targets, initial);
  await screenshot('target-sequence-shuffled');
  const beforeWrong = await hit(2), afterWrong = await state();
  assert.equal(afterWrong.bonus.nextMarker, 1); assert.equal(afterWrong.bonusSequence.speed, 0);
  assert(beforeWrong.bonus.remaining - afterWrong.bonus.remaining >= 2);
  await hit(1); assert.equal((await state()).bonus.nextMarker, 2);
  const a = await screenshot('target-sequence-first-hit'); await step(1);
  const moving = await state(); assert(moving.bonusSequence.speed > 0);
  assert(moving.bonusSequence.targets.filter(t => !t.used).every(t => JSON.stringify(t.position) !== JSON.stringify(initial.find(i => i.number === t.number).position)));
  const b = await screenshot('target-sequence-moving'); assert(!a.equals(b));
  checks.push('shuffled unique numbers; still until the first correct hit; wrong-number penalty unchanged; visible moving field and yellow next target');

  await page.mouse.down({button:'middle'}); await page.waitForTimeout(700); await page.mouse.up({button:'middle'});
  assert.equal((await state()).menu, 'pause'); const frozen = await state(); await step(2);
  assert.deepEqual((await state()).bonusSequence, frozen.bonusSequence); assert.equal((await state()).bonus.remaining, frozen.bonus.remaining);
  await clickTracked('unpause');
  const speeds = [];
  for (let number = 2; number <= 16; number++) {
    await hit(number); const s = await state();
    if (number === 16) { assert.equal(s.menu, 'bonusResult'); break; }
    assert.equal(s.bonus.nextMarker, number + 1); assert.equal(s.bonus.points, number * 100 - s.bonus.shotsFired * 5);
    assert.deepEqual(s.bonusSequence.targets.filter(t => t.highlighted).map(t => t.number), [number + 1]);
    speeds.push(s.bonusSequence.speed);
    if (number === 10) await screenshot('target-sequence-fast');
  }
  assert(speeds.at(-1) > speeds[0] * 2);
  const result = await state(); assert(result.lives >= main.lives); assert.equal(result.hull, main.hull); assert.equal(result.shield, main.shield);
  assert.deepEqual(result.tiers, main.tiers); assert.match(await page.locator('#briefingStatus').innerText(), /BONUS COMPLETE/);
  assert.equal(await page.locator('#launchTitle').innerText(), 'GOLD');
  await page.evaluate(() => window.vectorShooterDebug.finishBonus('complete')); assert.equal((await state()).credits, result.credits);
  checks.push('mouse-only completion of all sixteen moving targets; rising speed, pause/resume, gold payout once and main-ship isolation');

  await action('levelWarp');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await start(); await hit(1); await step(0.3);
    assert.equal((await state()).bonus.nextMarker, 2);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('#missionTitle,#missionProgress,#weaponReadout')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.id));
    assert.deepEqual(overflow, []); await page.screenshot({ path: `${out}/target-sequence-hud-${width}.png` });
    await page.mouse.down({button:'middle'}); await page.waitForTimeout(700); await page.mouse.up({button:'middle'});
    await action('exitBonus'); assert.equal((await state()).menu, 'bonusResult'); await action('levelWarp');
  }
  checks.push('390/320px HUDs fit; mouse aiming and safe exit still work');
  assert.deepEqual(errors, []); await writeFile(`${out}/target-sequence-report.json`, JSON.stringify({ checks, numbers, speeds, errors }, null, 2));
  console.log('PASS TARGET SEQUENCE', JSON.stringify({ checks, numbers, speeds, errors }));
} finally { await browser.close(); }
