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
const launch = async () => { await action('launch'); await page.waitForTimeout(80); };
const pause = async () => {
  const before = await state();
  await page.mouse.click(720, 450, { button: 'middle', delay: 700 });
  const after = await state(); assert.equal(after.menu, 'pause');
  assert.equal(after.weapon, before.weapon); assert.equal(after.bonus?.family, before.bonus?.family);
};
const activeWeapon = async (family, tier = 1, bonus = false) => {
  const s = await state();
  assert.equal(s.menu, ''); assert.equal(s.paused, false);
  assert.equal(bonus ? s.bonus.family : s.weapon, family);
  if (!bonus) assert.equal(s.weaponLevel, tier);
  assert.equal(await page.locator('#weaponReadout').innerText(), `${family.toUpperCase()} ${tier}`);
};
const snapshot = async name => {
  const png = PNG.sync.read(await page.locator('#viewport canvas').screenshot({ path: `${out}/${name}.png` }));
  let lit = 0;
  for (let i = 0; i < png.data.length; i += 4) if (Math.max(png.data[i], png.data[i + 1], png.data[i + 2]) > 60) lit++;
  assert(lit > 500); return png;
};
try {
  await page.addInitScript(() => {
    window.__shotSounds = [];
    const createSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = createSource.call(this), start = source.start.bind(source);
      source.start = (...args) => { window.__shotSounds.push(source.buffer?.length); return start(...args); };
      return source;
    };
  });
  await page.goto(process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.vectorShooterDebug);
  const controls = await page.locator('.control-grid').innerText();
  assert.match(controls, /1 \/ 2 \/ 3/); assert.match(controls, /TAB \/ WHEEL CLICK/); assert.match(controls, /HOLD WHEEL \/ ESC/);
  for (const [width, height] of [[1440, 900], [390, 844], [320, 844]]) {
    await page.setViewportSize({ width, height });
    const fits = await page.locator('.control-grid').evaluate(el => [...el.querySelectorAll('dt,dd')].every(cell => cell.scrollWidth <= cell.clientWidth + 1));
    assert(fits); await page.screenshot({ path: `${out}/weapon-controls-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 }); await action('newRun');
  await page.keyboard.press('3'); assert.equal((await state()).weapon, 'pulse');
  const focus = await page.evaluate(() => document.activeElement?.outerHTML);
  await page.keyboard.press('Tab'); assert.notEqual(await page.evaluate(() => document.activeElement?.outerHTML), focus);
  await launch();
  assert(await page.evaluate(() => document.pointerLockElement === document.querySelector('#viewport canvas')));
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 100);
  await page.evaluate(() => window.vectorShooterDebug.grantCargo('weaponCore'));
  for (const [key, family, tier] of [['2', 'spread', 1], ['3', 'lance', 1], ['1', 'pulse', 2]]) {
    await page.keyboard.press(key); await activeWeapon(family, tier);
    assert.equal((await state()).throttle, 0); assert.equal((await state()).wanted, false);
  }
  await page.keyboard.press('Tab'); await activeWeapon('spread');
  await page.keyboard.down('Tab'); await page.keyboard.down('Tab'); await page.keyboard.up('Tab'); await activeWeapon('lance');
  await page.mouse.click(720, 450, { button: 'middle' }); await activeWeapon('pulse', 2);
  await page.mouse.click(720, 450, { button: 'middle' }); await activeWeapon('spread');
  await page.keyboard.press('Numpad3'); await activeWeapon('lance');
  await page.keyboard.press('Numpad1'); await activeWeapon('pulse', 2);
  assert(await page.evaluate(() => document.pointerLockElement === document.querySelector('#viewport canvas')), 'switching must retain pointer lock');
  checks.push('1/2/3 and numpad directly select; Tab and short wheel click cycle once without pausing; throttle and tiers preserved');

  await page.mouse.down(); await step(0.03); const pulseShot = (await state()).stats.shots;
  await page.keyboard.press('2'); await step(0.4); assert((await state()).stats.shots > pulseShot);
  await snapshot('weapon-switch-spread');
  await page.mouse.up(); await step(0.4); await page.keyboard.press('3');
  await page.mouse.down(); await step(0.02); await page.mouse.up();
  const lance = await state(); assert(lance.weaponCooldown > 0.4);
  await page.keyboard.press('1'); await page.mouse.down(); await step(0.03); await page.mouse.up();
  assert.equal((await state()).stats.shots, lance.stats.shots, 'switch must not reset the firing cooldown');
  const sounds = await page.evaluate(() => window.__shotSounds);
  for (const duration of [0.15, 0.21, 0.32]) assert(sounds.includes(Math.ceil(duration * 22050)), 'each weapon must use its own sound');
  await page.evaluate(() => window.vectorShooterDebug.primeBlast());
  await page.keyboard.press('2'); assert.equal((await state()).charge, 100);
  await page.mouse.click(720, 450, { button: 'right' }); await step(0.02); assert((await state()).charge < 100);
  await pause(); await page.keyboard.press('1'); assert.equal((await state()).weapon, 'spread');
  await action('unpause'); await page.waitForTimeout(80); await activeWeapon('spread', (await state()).tiers.spread);
  await page.keyboard.press('Escape'); await page.waitForTimeout(80); assert.equal((await state()).menu, 'pause');
  await action('unpause'); await page.waitForTimeout(80);
  checks.push('continuous fire survives switching; distinct weapon sounds; cooldown cannot be bypassed; right-click blast and both pause methods work');

  await page.evaluate(() => { window.vectorShooterDebug.finishEncounter(); window.vectorShooterDebug.reachGate(); }); await step(2.2);
  assert.equal((await state()).menu, 'shop');
  if ((await state()).tiers.spread < 2) await action('buy:tier');
  await action('equip:lance'); await action('buy:tier');
  await action('depart'); await launch();
  for (const [key, family] of [['1', 'pulse'], ['2', 'spread'], ['3', 'lance']]) {
    await page.keyboard.press(key); await activeWeapon(family, 2);
  }
  await pause(); await action('title');
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'b', 'a']) await page.keyboard.press(key);
  await action('levelWarp'); await page.locator('#warpStage').selectOption('3'); await action('warpJourney'); await launch();
  await page.keyboard.press('2'); await activeWeapon('spread');
  await page.mouse.click(720, 450, { button: 'middle' }); await activeWeapon('lance');
  assert.equal((await state()).stageKind, 'armada'); await pause(); await action('levelWarp');
  checks.push('purchased tiers survive family changes; armada controls support the same switching');

  for (const kind of ['asteroids', 'canyon', 'sequence']) {
    await action(`warpBonus:${kind}`); await action('bonusPlay'); await page.waitForTimeout(80);
    const main = await state();
    for (const [key, family] of [['2', 'spread'], ['3', 'lance'], ['1', 'pulse']]) {
      await page.keyboard.press(key); await activeWeapon(family, 1, true);
    }
    await page.keyboard.press('Tab'); await activeWeapon('spread', 1, true);
    await page.mouse.down(); await step(0.03); await page.mouse.up(); await snapshot(`bonus-switch-${kind}-spread`);
    await page.mouse.click(720, 450, { button: 'middle' }); await activeWeapon('lance', 1, true);
    await step(0.4); await page.mouse.click(720, 450); await step(0.03);
    assert.equal((await state()).weapon, main.weapon); assert.deepEqual((await state()).tiers, main.tiers);
    await pause(); await action('exitBonus'); assert.equal((await state()).weapon, main.weapon);
    await action('levelWarp');
  }
  await action('title'); await action('mode:endless'); await action('newRun'); await launch();
  await page.keyboard.press('3'); await activeWeapon('lance');
  await page.keyboard.press('Tab'); await activeWeapon('pulse');
  await page.mouse.click(720, 450, { button: 'middle' }); await activeWeapon('spread');
  checks.push('all three bonus craft and Endless use the same controls; bonus weapon choices leave main equipment untouched');
  assert.deepEqual(errors, []);
  await writeFile(`${out}/weapon-switch-report.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log('PASS WEAPON SWITCH', JSON.stringify({ checks, errors }));
} finally { await browser.close(); }
