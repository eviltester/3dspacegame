import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { Euler, Quaternion, Vector3 } from 'three';

const out = 'output/playwright'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], checks = [], runs = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const state = () => page.evaluate(() => window.vectorShooterDebug.getState());
const step = seconds => page.evaluate(t => window.vectorShooterDebug.step(t), seconds);
const action = name => page.locator(`#screenContent [data-action="${name}"]`).click();
let cursor;
async function tracked(name) {
  const button = page.locator(`#screenContent [data-action="${name}"]`); await button.scrollIntoViewIfNeeded();
  const r = await button.boundingBox(); cursor = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await button.click(); await page.waitForTimeout(30);
}
async function start(kind, difficulty) {
  await page.locator('#warpDifficulty').selectOption(String(difficulty));
  await action(`warpBonus:${kind}`);
  assert.match(await page.locator('#briefingStatus').innerText(), new RegExp(`DIFFICULTY ${difficulty}`));
  await tracked('bonusPlay'); assert.equal((await state()).bonus.difficulty, difficulty);
}
async function pause() {
  await page.mouse.down({ button: 'middle' }); await page.waitForTimeout(650); await page.mouse.up({ button: 'middle' });
  assert.equal((await state()).menu, 'pause');
}
async function leave() { await pause(); await action('exitBonus'); await action('levelWarp'); }
async function move(offset, current) {
  cursor.x += (offset[0] - current[0]) / 0.13; cursor.y -= (offset[1] - current[1]) / 0.13;
  await page.mouse.move(cursor.x, cursor.y);
}
async function aim(position) {
  const s = await state(), [x, y, z] = position;
  const angles = new Euler().setFromQuaternion(new Quaternion().fromArray(s.view.orientation), 'YXZ');
  cursor.x += (angles.y - Math.atan2(-x, -z)) / 0.0022;
  cursor.y += (angles.x - Math.atan2(y, Math.hypot(x, z))) / 0.0022;
  await page.mouse.move(cursor.x, cursor.y); await step(1 / 60);
}
async function shot() { await page.mouse.down(); await step(1 / 60); await page.mouse.up(); }
async function screen(name) {
  const buffer = await page.locator('#viewport canvas').screenshot({ path: `${out}/${name}-canvas.png` });
  const png = PNG.sync.read(buffer); let lit = 0;
  for (let y = 160; y < png.height - 160; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4;
    if (Math.max(...png.data.subarray(i, i + 3)) > 90) lit++;
  }
  assert(lit > 500, `${name}: scene must contain visible geometry`);
  await page.screenshot({ path: `${out}/${name}.png` }); return buffer;
}
try {
  await page.goto(process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/'); await page.waitForFunction(() => window.vectorShooterDebug);
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'b', 'a']) await page.keyboard.press(key);
  await action('levelWarp'); assert.equal(await page.locator('#warpDifficulty option').count(), 8);
  await start('sequence', 8);
  const main = await state(); assert.equal(main.stage, 95); assert.equal(main.bonusSequence.targets.length, 30);
  assert(new Set(main.bonusSequence.targets.map(t => t.radius)).size > 10);
  await screen('difficulty-8-targets');
  // Misses cost points even before the first hit; held fire counts actual cooldown-authorized volleys.
  await aim([0, 90, -190]); await page.mouse.down(); await step(0.5); await page.mouse.up();
  const missed = await state(); assert(missed.bonus.shotsFired >= 3); assert.equal(missed.bonus.points, -5 * missed.bonus.shotsFired);
  assert.match(await page.locator('#timeBonusReadout').innerText(), /BONUS SCORE -/);
  const speeds = [];
  for (let number = 1; number <= 30; number++) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await step(0.2); const s = await state(); assert(s.bonus, `bonus ended before target ${number}`);
      await aim(s.bonusSequence.targets.find(t => t.number === number).position); await shot();
      const hit = await state(); if (!hit.bonus) break;
      assert.equal(hit.bonus.points, (hit.bonus.nextMarker - 1) * 100 - hit.bonus.shotsFired * 5);
      if (hit.bonus.nextMarker === number + 1) break;
    }
    const s = await state();
    if (number === 30) { assert.equal(s.menu, 'bonusResult'); break; }
    assert.equal(s.bonus.nextMarker, number + 1); speeds.push(s.bonusSequence.speed);
    if (number === 10) {
      const a = await screen('difficulty-8-moving-targets'); await step(0.3);
      const b = await screen('difficulty-8-target-motion'); assert(!a.equals(b));
      await pause(); const frozen = await state(); await step(2);
      assert.deepEqual((await state()).bonus, frozen.bonus); await tracked('unpause');
    }
  }
  const result = await state(), summary = await page.locator('#targetResults').innerText();
  const [, targets, shots, net] = summary.match(/TARGETS (\d+)\/30 \/ SHOTS (\d+) \/ NET (-?\d+)/);
  assert.equal(Number(targets), 30); assert.equal(Number(net), 3000 - Number(shots) * 5);
  assert.equal(result.score - main.score, Number(net)); assert.equal(result.hull, main.hull); assert.equal(result.shield, main.shield);
  await page.evaluate(() => window.vectorShooterDebug.finishBonus('complete')); assert.equal((await state()).score, result.score);
  assert(speeds.at(-1) > 4); await page.screenshot({ path: `${out}/difficulty-8-target-result.png` });
  checks.push('30 differently sized moving targets completed with mouse shots; held-fire costs, exact net payout, pause freeze and once-only rewards');
  await action('levelWarp');

  await start('asteroids', 8); assert.equal((await state()).bonusRocks.length, 180);
  const startSpeed = (await state()).bonusAsteroids.speed;
  await screen('difficulty-8-asteroids'); let peakSpeed = startSpeed;
  for (let frame = 0; frame < 1500; frame++) {
    const s = await state(); if (!s.bonus) break;
    const t = Math.min(1, (s.bonus.elapsed + 0.05) / s.bonus.duration), row = Math.min(55, (0.6 * t + 0.4 * t * t) * 58);
    await move([Math.sin(row * 0.85) * 20, Math.sin(row * 0.6) * 9], s.view.position);
    peakSpeed = Math.max(peakSpeed, s.bonusAsteroids.speed); await step(0.05);
  }
  assert.equal((await state()).menu, 'bonusResult'); assert.match(await page.locator('#briefingStatus').innerText(), /BONUS COMPLETE/);
  assert(peakSpeed > 165 && startSpeed > 70); runs.push({ kind: 'asteroids', difficulty: 8, peakSpeed });
  checks.push('180-rock maximum-difficulty belt traversed with mouse steering, acceleration and final gate');
  await action('levelWarp'); await start('canyon', 8);
  assert.equal((await state()).bonusCourse.targets.filter(t => t.kind === 'turret').length, 40);
  await screen('difficulty-8-canyon');
  await page.mouse.down({ button: 'middle' }); await page.mouse.up({ button: 'middle' }); await page.mouse.down();
  let fired = 0, passed = 0; peakSpeed = 0;
  for (let frame = 0; frame < 1000; frame++) {
    const s = await state(); if (!s.bonusCourse) break;
    const course = s.bonusCourse, gate = course.gates.find(g => !g.resolved);
    peakSpeed = Math.max(peakSpeed, course.speed); fired = Math.max(fired, course.fired); passed = Math.max(passed, course.passed);
    const sway = s.view.position[2] - gate.position[2] > 90 ? 7 : Math.min(1.8, gate.radius * 0.2);
    await move([Math.max(-22, Math.min(22, gate.offset[0] + Math.sin(s.bonus.elapsed * 2.8) * sway)),
      Math.max(-16, Math.min(16, gate.offset[1] + Math.cos(s.bonus.elapsed * 2.8) * sway))], course.offset);
    if (s.bonus.charge >= 100 && course.shots.some(b => new Vector3().fromArray(b.position).distanceTo(new Vector3().fromArray(s.view.position)) < 120)) {
      await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
    }
    if (frame % 12 === 0) await page.mouse.wheel(0, -100);
    await step(0.1);
  }
  await page.mouse.up(); const message = await page.locator('#briefingStatus').innerText();
  runs.push({ kind: 'canyon', difficulty: 8, message, peakSpeed, fired, passed }); console.log('HARD CANYON', runs.at(-1));
  assert.match(message, /BONUS COMPLETE/); assert(peakSpeed > 300); assert(fired > 10); assert.equal(passed, 18);
  assert.equal((await state()).hull, 100); checks.push('fastest canyon completed with mouse dodging, shooting, wheel boost and defensive blast');
  await action('levelWarp');

  await page.locator('#warpStage').selectOption('95'); await action('warpJourney'); await tracked('launch'); await step(0.8);
  let s = await state(); assert.equal(s.hostileCount, 14); const a = await screen('difficulty-late-armada'); await step(0.3);
  const b = await screen('difficulty-late-armada-motion'); assert(!a.equals(b));
  assert(s.actors.filter(t => t.kind === 'pirate').every(t => Math.abs(t.position[0]) <= 82));
  await pause(); await action('levelWarp');
  checks.push('late armada has fourteen visible ships in reachable receding rows');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await page.screenshot({ path: `${out}/difficulty-picker-${width}.png` });
    assert.equal(await page.locator('#warpDifficulty option').count(), 8);
    await start('sequence', 8); await step(0.02);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('#stageLabel,#missionTitle,#missionProgress,#levelTimer,#levelClock,#timeBonusReadout')]
      .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.id));
    assert.deepEqual(overflow, []); await page.screenshot({ path: `${out}/difficulty-target-hud-${width}.png` });
    await leave();
  }
  assert.deepEqual(errors, []); checks.push('maximum-difficulty HUD and selector fit 390/320px screens');
  await writeFile(`${out}/bonus-difficulty-report.json`, JSON.stringify({ checks, runs, errors }, null, 2));
  console.log('PASS BONUS DIFFICULTY', JSON.stringify({ checks, runs, errors }));
} finally { await browser.close(); }
