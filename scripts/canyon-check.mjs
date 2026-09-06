import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { Quaternion, Vector3 } from 'three';

const out = 'output/playwright'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], checks = [], runs = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const state = () => page.evaluate(() => window.vectorShooterDebug.getState());
const step = seconds => page.evaluate(s => window.vectorShooterDebug.step(s), seconds);
const action = name => page.locator(`#screenContent [data-action="${name}"]`).click();
let cursor;
async function start() {
  await action('warpBonus:canyon');
  assert.match(await page.locator('#screenContent').innerText(), /no throttle or brake/);
  assert.match(await page.locator('#screenContent').innerText(), /Miss two in a row/);
  const r = await page.locator('[data-action="bonusPlay"]').boundingBox();
  cursor = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await action('bonusPlay'); await page.waitForTimeout(40);
}
async function move(offset, current) {
  cursor.x += (offset[0] - current[0]) / 0.13; cursor.y -= (offset[1] - current[1]) / 0.13;
  await page.mouse.move(cursor.x, cursor.y);
}
async function shot() { await page.mouse.down(); await step(0.03); await page.mouse.up(); }
async function screenshot(name) {
  const buffer = await page.locator('#viewport canvas').screenshot({ path: `${out}/${name}.png` }), p = PNG.sync.read(buffer);
  let lit = 0, green = 0, red = 0;
  for (let i = 0; i < p.data.length; i += 4) {
    const [r, g, b] = p.data.subarray(i, i + 3);
    if (Math.max(r, g, b) > 70) lit++;
    if (g > 100 && g > r * 1.3 && g > b * 1.15) green++;
    if (r > 130 && r > g * 1.3 && r > b * 1.1) red++;
  }
  assert(lit > 1000); return { buffer, lit, green, red };
}
try {
  await page.addInitScript(() => {
    window.__audio = { sources: 0, running: false };
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this), start = source.start.bind(source), context = this;
      source.start = (...args) => { window.__audio.sources++; window.__audio.running ||= context.state === 'running'; return start(...args); };
      return source;
    };
  });
  await page.goto(process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/'); await page.waitForFunction(() => window.vectorShooterDebug);
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'b', 'a']) await page.keyboard.press(key);
  await action('levelWarp'); assert.equal(await page.locator('#warpStage option').count(), 99);
  await start(); const main = await state();
  const a = await screenshot('canyon-course'); await step(0.15); const b = await screenshot('canyon-moving');
  assert(a.green > 50 && a.red > 5); assert(!a.buffer.equals(b.buffer));
  const throttle = (await state()).throttle;
  await page.keyboard.down('s'); await page.keyboard.down('ArrowDown'); await page.mouse.wheel(0, 500); await step(0.2);
  await page.keyboard.up('s'); await page.keyboard.up('ArrowDown');
  assert.equal((await state()).throttle, throttle);
  await page.keyboard.down('w'); await page.keyboard.down('ArrowUp'); await step(0.2); await page.keyboard.up('w'); await page.keyboard.up('ArrowUp');
  assert.equal((await state()).throttle, throttle);
  const baseSpeed = (await state()).bonusCourse.speed;
  await page.mouse.wheel(0, -100); await step(0.03);
  assert.equal((await state()).bonusCourse.boosting, true); assert((await state()).bonusCourse.speed > baseSpeed * 1.4);
  await page.keyboard.press('Escape'); await action('unpause'); await step(0.03);
  assert.equal((await state()).bonusCourse.boosting, false);
  await page.keyboard.down('Shift'); await step(0.03); assert.equal((await state()).bonusCourse.boosting, true); await page.keyboard.up('Shift');
  await page.keyboard.press('Escape'); await action('exitBonus');
  assert.equal((await state()).lives, main.lives); assert.equal((await state()).hull, main.hull);
  checks.push('99 warp choices; visible animated gates/obstacles/guns; locked throttle; wheel and Shift boost; pause clears boost; main ship safe');

  await action('levelWarp'); await start();
  let gunHit = false;
  for (let i = 0; i < 12 && !gunHit; i++) {
    const s = await state(), gun = s.bonusCourse.targets.find(t => t.kind === 'turret');
    const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().fromArray(s.view.orientation));
    const d = (gun.position[2] - s.view.position[2]) / forward.z;
    const target = [s.bonusCourse.offset[0] + gun.position[0] - s.view.position[0] - forward.x * d,
      s.bonusCourse.offset[1] + gun.position[1] - s.view.position[1] - forward.y * d];
    await move([Math.max(-35, Math.min(35, target[0])), Math.max(-20, Math.min(28, target[1]))], s.bonusCourse.offset);
    await shot(); await step(0.15);
    gunHit = !(await state()).bonusCourse.targets.some(t => t.kind === 'turret' && t.position[2] === gun.position[2]);
  }
  assert(gunHit, 'mouse-aimed shot destroys a turret');
  const audio = await page.evaluate(() => window.__audio); assert(audio.running && audio.sources > 3);
  await page.keyboard.press('Escape'); await action('exitBonus'); await action('levelWarp');
  checks.push('mouse-aimed gun destruction and running audio playback');

  // Normal mouse steering, held fire and defensive blasts; only elapsed simulation time is accelerated.
  for (const ending of ['complete', 'wall', 'missedGates']) {
    await start(); let peakSpeed = 0, fired = 0, passed = 0, shotCount = 0;
    await page.mouse.down({button:'middle'}); await page.mouse.up({button:'middle'});
    await page.mouse.down();
    for (let frame = 0; frame < 1000; frame++) {
      const s = await state(); if (!s.bonusCourse) break;
      const course = s.bonusCourse, gate = course.gates.find(g => !g.resolved);
      peakSpeed = Math.max(peakSpeed, course.speed); fired = Math.max(fired, course.fired); passed = Math.max(passed, course.passed);
      const miss = ending === 'missedGates' && course.nextGate < 2 || ending === 'wall' && gate.exit;
      const sway = s.view.position[2] - gate.position[2] > 90 ? 7 : Math.min(2.3, gate.radius * 0.22);
      const target = miss ? [gate.offset[0] < 0 ? 27 : -27, 4] : [Math.max(-22, Math.min(22, gate.offset[0] + Math.sin(s.bonus.elapsed * 2.8) * sway)), Math.max(-16, Math.min(16, gate.offset[1] + Math.cos(s.bonus.elapsed * 2.8) * sway))];
      await move(target, course.offset);
      if (s.bonus.charge >= 100 && course.shots.some(b => new Vector3().fromArray(b.position).distanceTo(new Vector3().fromArray(s.view.position)) < 120)) {
        await page.mouse.down({button:'right'}); await page.mouse.up({button:'right'});
      }
      if (frame % 12 === 0) await page.mouse.wheel(0, -100);
      if (gate.exit && ending === 'complete' && !shotCount++) await screenshot('canyon-final-exit');
      await step(0.1);
    }
    await page.mouse.up(); const s = await state(), message = await page.locator('#briefingStatus').innerText();
    runs.push({ ending, message, peakSpeed, fired, passed });
    console.log('CANYON RUN', JSON.stringify(runs.at(-1)));
    assert.equal(s.menu, 'bonusResult'); assert.equal(s.hull, 100); assert.equal(s.shield, 100); assert(s.lives >= 3);
    assert.match(message, ending === 'complete' ? /BONUS COMPLETE/ : ending === 'wall' ? /WALL IMPACT/ : /TWO CONSECUTIVE/);
    const reward = s.credits; await page.evaluate(() => window.vectorShooterDebug.finishBonus('complete')); assert.equal((await state()).credits, reward);
    await page.screenshot({ path: `${out}/canyon-result-${ending}.png` }); await action('levelWarp');
  }
  checks.push('mouse-steered combat run reaches the exit; wall and consecutive-miss failures; partial rewards paid once');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 }); await start(); await page.mouse.wheel(0, -100); await step(0.02);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('#speedReadout,#missionProgress,#missionTitle,#weaponReadout')]
      .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.id));
    assert.deepEqual(overflow, []); await page.screenshot({ path: `${out}/canyon-hud-${width}.png` });
    await page.keyboard.press('Escape'); await action('exitBonus'); await action('levelWarp');
  }
  assert.deepEqual(errors, []); await writeFile(`${out}/canyon-report.json`, JSON.stringify({ checks, runs, errors }, null, 2));
  console.log('PASS CANYON', JSON.stringify({ checks, runs, errors }));
} finally { await browser.close(); }
