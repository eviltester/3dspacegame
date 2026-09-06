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
const action = name => page.locator(`[data-action="${name}"]`).click();
let mx = 720, my = 450;
const moveToX = async x => {
  mx += (x - (await state()).position[0]) / 0.22;
  await page.mouse.move(mx, my); await step(0.02);
};
const screenshot = async name => {
  const png = PNG.sync.read(await page.screenshot({ path: `${out}/${name}.png` }));
  let red = 0, white = 0;
  // Inspect the battlefield rather than accepting HUD pixels as scene content.
  for (let y = Math.round(png.height * 0.3); y < png.height * 0.82; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4;
    if (png.data[i] > 90 && png.data[i] > png.data[i + 1] * 1.5) red++;
    if (png.data[i] > 110 && png.data[i + 1] > 110 && png.data[i + 2] > 110) white++;
  }
  assert(red > 30, `${name}: enemies should be visible`);
  assert(white > 8, `${name}: player should be visible`);
};
try {
  await page.goto(process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.vectorShooterDebug);
  await action('newRun');
  await page.evaluate(() => window.vectorShooterDebug.setStage(3));
  assert.match(await page.locator('#missionBriefObjective').innerText(), /trapped in a tractor beam.*limited movement.*free yourself/);
  await page.screenshot({ path: `${out}/armada-tractor-briefing.png` });
  await action('launch');
  await page.mouse.move(mx, my); await step(0.2);
  const camera = (await state()).view;
  assert(camera.position[1] > 100 && camera.position[2] > 0);
  assert(camera.armadaCraftVisible);
  const playerBefore = (await state()).position;
  my += 80; mx += 60; await page.mouse.move(mx, my); await step(0.2);
  const moved = await state();
  assert.notEqual(moved.position[0], playerBefore[0]);
  assert.deepEqual(moved.position.slice(1), [0, 0]);
  assert.deepEqual(moved.orientation, [0, 0, 0, 1]);
  assert.deepEqual(moved.view.position, camera.position, 'the arcade camera stays fixed while the craft slides');
  await step(0.6);
  await screenshot('armada-angled-battlefield');
  checks.push('tractor-beam briefing, elevated fixed camera, visible player, mouse left/right, and ignored vertical input');

  const victim = (await state()).actors.find(actor => actor.kind === 'pirate');
  await page.evaluate(id => window.vectorShooterDebug.hitActor(id, 9999), victim.id);
  const initialDrop = (await state()).actors.find(actor => actor.kind === 'cargo' && actor.drop === 'weaponCore');
  assert(initialDrop && initialDrop.position[2] < -90, 'core must appear at the defeated ship');
  await moveToX(initialDrop.position[0]);
  await step(1);
  const drifting = (await state()).actors.find(actor => actor.id === initialDrop.id);
  assert(drifting.position[2] > initialDrop.position[2] + 20);
  assert(Math.abs(drifting.velocity[2] - 24) < 0.1);
  const pickups = (await state()).stats.pickups;
  await step(Math.abs(drifting.position[2]) / 24);
  assert((await state()).stats.pickups > pickups);
  assert.equal((await state()).phase, 'playing');
  checks.push('power-up spawns at the kill, drifts toward the lane at 24 units/second, and is caught during combat');

  const killCount = (await state()).stats.kills;
  await page.mouse.down();
  for (let i = 0; i < 50 && (await state()).stats.kills === killCount; i++) {
    const s = await state();
    const target = s.actors.filter(actor => actor.kind === 'pirate').sort((a, b) => b.position[2] - a.position[2])[0];
    assert(target && s.phase === 'playing');
    await moveToX(Math.max(-76, Math.min(76, target.position[0] + target.velocity[0] * Math.abs(target.position[2]) / 440)));
    await step(0.1);
  }
  await page.mouse.up();
  assert((await state()).stats.kills > killCount, 'normal forward shots must hit the displayed enemies');
  const interceptions = (await state()).stats.interceptions;
  await page.evaluate(() => window.vectorShooterDebug.spawnIncomingBolt());
  await page.mouse.down(); await step(0.7); await page.mouse.up();
  assert((await state()).stats.interceptions > interceptions, 'incoming shots remain interceptable');
  checks.push('real mouse-fired shots kill pirates and intercept enemy fire from the new view');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await step(0.1);
    await screenshot(`armada-angled-mobile-${width}`);
    const overlapping = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.hud-panel,.radar,.bottom-strip,.arcade-strip,.flight-buttons')]
        .filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect());
      return boxes.some((a, i) => boxes.slice(i + 1).some(b => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2));
    });
    assert(!overlapping);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.vectorShooterDebug.finishEncounter()); await step(0.02);
  const freed = await state();
  assert.equal(freed.phase, 'cleared'); assert.equal(freed.view.armadaCraftVisible, false);
  assert.deepEqual(freed.view.position, freed.position);
  assert.match(freed.messageLog, /TRACTOR BEAM RELEASED/);
  assert.equal(await page.locator('.reticle').isVisible(), true);
  await page.mouse.click(720, 450, { button: 'middle', delay: 700 }); await action('title'); await action('resumeRun');
  assert.match(await page.locator('#missionBriefObjective').innerText(), /tractor beam is released/);
  assert.doesNotMatch(await page.locator('#missionBriefCaution').innerText(), /LEFT \/ RIGHT/);
  await action('launch'); await step(0.02);
  assert.equal((await state()).view.armadaCraftVisible, false);
  await page.evaluate(() => window.vectorShooterDebug.reachGate()); await step(2.2);
  assert.equal((await state()).menu, 'bonusOffer');
  await action('bonusSkip'); await action('title');
  await action('mode:endless'); await action('newRun');
  await page.evaluate(() => window.vectorShooterDebug.setStage(3));
  assert.match(await page.locator('#missionBriefObjective').innerText(), /tractor beam/);
  await action('launch'); await step(0.2);
  assert((await state()).view.armadaCraftVisible);
  await page.evaluate(() => window.vectorShooterDebug.finishEncounter()); await step(0.02);
  assert.equal((await state()).phase, 'recovery');
  assert.equal((await state()).view.armadaCraftVisible, false);
  await page.mouse.click(720, 450); await step(0.1);
  assert.equal((await state()).stage, 4);
  assert.equal((await state()).view.armadaCraftVisible, false);
  checks.push('mobile layout, beam-release feedback, restored cockpit, Journey warp/bonus, and Endless recovery/next wave');
  assert.deepEqual(errors, []);
  await writeFile(`${out}/armada-report.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log('PASS ARMADA', JSON.stringify({ checks, errors }));
} finally { await browser.close(); }
