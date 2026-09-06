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
let cursor = { x: 720, y: 450 };
const startBonus = async () => {
  await action('warpBonus:asteroids');
  const button = await page.locator('#screenContent [data-action="bonusPlay"]').boundingBox();
  cursor = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
  await action('bonusPlay'); await page.waitForTimeout(60);
};
const aimAt = async rock => {
  const view = (await state()).view.position;
  cursor.x += (rock.position[0] - view[0]) / 0.13;
  cursor.y -= (rock.position[1] - view[1]) / 0.13;
  await page.mouse.move(cursor.x, cursor.y); await step(0.02);
};
const fire = async () => { await page.mouse.down(); await step(0.02); await page.mouse.up(); };
const screenshot = async name => {
  const png = PNG.sync.read(await page.locator('#viewport canvas').screenshot({ path: `${out}/${name}.png` }));
  let lit = 0;
  for (let i = 0; i < png.data.length; i += 4) if (Math.max(png.data[i], png.data[i + 1], png.data[i + 2]) > 60) lit++;
  assert(lit > 500); return png;
};
try {
  await page.addInitScript(() => {
    window.__fractureSounds = 0;
    const createSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = createSource.call(this), start = source.start.bind(source);
      source.start = (...args) => { if (source.buffer?.length === Math.ceil(0.19 * 22050)) window.__fractureSounds++; return start(...args); };
      return source;
    };
  });
  await page.goto(process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.vectorShooterDebug);
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'b', 'a']) await page.keyboard.press(key);
  await action('levelWarp'); await startBonus();
  const main = await state();
  const target = main.bonusRocks.filter(rock => Math.abs(rock.position[0]) < 30 && Math.abs(rock.position[1]) < 20).sort((a, b) => b.position[2] - a.position[2])[0];
  await aimAt(target); await fire();
  const split = await state();
  assert(split.bonus.fractures >= 1); assert.equal(split.bonusRocks.filter(rock => rock.size === 1).length, 2);
  assert(!split.bonusRocks.some(rock => rock.id === target.id));
  assert(await page.evaluate(() => window.__fractureSounds > 0));
  const medium = split.bonusRocks.filter(rock => rock.size === 1).sort((a, b) => Math.abs(a.position[0]) - Math.abs(b.position[0]))[0];
  assert(medium.radius < target.radius);
  await aimAt(medium); await step(0.22); await fire();
  const small = (await state()).bonusRocks.filter(rock => rock.size === 0);
  assert.equal(small.length, 2); assert(small[0].radius < medium.radius);
  const a = await screenshot('asteroids-splitting');
  await step(0.12);
  const moved = (await state()).bonusRocks.find(rock => rock.id === small[0].id);
  assert(moved); assert.notDeepEqual(moved.position, small[0].position);
  const b = await screenshot('asteroids-fragment-motion');
  assert(!a.data.equals(b.data));
  checks.push('mouse-aimed shots split large into medium then small; original fracture sound; visible drifting vector fragments');

  const beforeBlast = await state();
  await page.mouse.down({ button: 'right' }); await step(0.02); await page.mouse.up({ button: 'right' });
  const blasted = await state();
  assert.equal(blasted.bonus.fractures, beforeBlast.bonus.fractures);
  assert.equal(blasted.bonus.charge, 0); assert.equal(blasted.phase, 'bonus');
  assert.equal(blasted.bonusRocks.filter(rock => rock.size < 2).length, 0);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await page.locator('#weaponReadout').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    assert(await page.locator('#speedReadout').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    assert.equal(await page.locator('#speedLabel').innerText(), 'AUTO SPEED');
    await page.screenshot({ path: `${out}/asteroids-split-hud-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  const frozen = (await state()).bonusAsteroids; await step(2); assert.deepEqual((await state()).bonusAsteroids, frozen);
  await action('exitBonus');
  const result = await state();
  assert.equal(result.lives, main.lives); assert.equal(result.hull, main.hull); assert.equal(result.shield, main.shield);
  assert.deepEqual(result.tiers, main.tiers); assert.equal(result.charge, main.charge);
  checks.push('blast vaporizes fragments without recursion; desktop/mobile HUD fits; safe exit preserves the main ship');

  await action('levelWarp'); await startBonus(); await step(60.1);
  assert.equal((await state()).menu, 'bonusResult'); assert.equal((await state()).lives, 3);
  assert.equal((await state()).hull, 100); assert((await state()).timeRemaining > 0);
  for (const ending of ['complete', 'gateMissed']) {
    await action('levelWarp'); await startBonus();
    let peak = 0, previousSpeed = 0, lateSpeed = 0, captured = false;
    for (let frame = 0; frame < 245 && (await state()).phase === 'bonus'; frame++) {
      const s = await state(), t = Math.min(1, (s.bonus.elapsed + 0.25) / 60), row = Math.min(55, (0.6 * t + 0.4 * t * t) * 58);
      const gap = [Math.sin(row * 0.85) * 20, Math.sin(row * 0.6) * 9];
      assert(s.bonusAsteroids.speed >= previousSpeed); previousSpeed = s.bonusAsteroids.speed;
      if (s.bonus.elapsed > 55) lateSpeed = s.bonusAsteroids.speed;
      if (s.bonusAsteroids.progress > 0.94 && !captured) {
        assert.match(await page.locator('#missionProgress').innerText(), /EXIT GATE/);
        const png = await screenshot(`asteroid-exit-${ending}`);
        let green = 0, yellow = 0;
        for (let i = 0; i < png.data.length; i += 4) {
          const [r, g, b] = png.data.subarray(i, i + 3);
          if (g > 140 && g > r * 1.3 && g > b * 1.1) green++;
          if (r > 160 && g > 160 && b < 120) yellow++;
        }
        assert(green > 40 && yellow > 40); captured = true;
      }
      if (ending === 'gateMissed' && s.bonusAsteroids.progress > 0.97) gap[0] = -38;
      cursor.x += (gap[0] - s.view.position[0]) / 0.13; cursor.y -= (gap[1] - s.view.position[1]) / 0.13;
      await page.mouse.move(cursor.x, cursor.y); await step(0.25);
      const after = await state();
      peak = Math.max(peak, after.bonusRocks.filter(rock => rock.size < 2).length);
    }
    const finished = await state();
    assert.equal(finished.menu, 'bonusResult'); assert(peak <= 64); assert(lateSpeed > 106); assert(captured);
    assert.match(await page.locator('#briefingStatus').innerText(), ending === 'complete' ? /BONUS COMPLETE/ : /EXIT GATE MISSED/);
    assert.equal(finished.hull, 100); assert.equal(finished.shield, 100); assert(finished.lives >= 3);
    const credits = finished.credits; await page.evaluate(() => window.vectorShooterDebug.finishBonus('complete'));
    assert.equal((await state()).credits, credits);
  }
  checks.push('accelerating mouse-steered belt, visible exit gate, correct success/miss outcomes, main-ship safety, single payouts and paused speed');
  assert.deepEqual(errors, []);
  await writeFile(`${out}/asteroid-split-report.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log('PASS ASTEROID SPLIT', JSON.stringify({ checks, errors }));
} finally { await browser.close(); }
