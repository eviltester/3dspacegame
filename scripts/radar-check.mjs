import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const out = 'output/playwright';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const pixels = async () => PNG.sync.read(await page.locator('#radar').screenshot());
try {
  await page.goto(process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.vectorShooterDebug);
  await page.locator('[data-action="newRun"]').click();
  await page.locator('[data-action="launch"]').click();
  await page.evaluate(() => window.vectorShooterDebug.step(0.2));
  const before = await pixels();
  await page.mouse.move(720, 450);
  await page.mouse.move(750, 610);
  await page.evaluate(() => window.vectorShooterDebug.step(0.2));
  const after = await pixels();
  let changed = 0, lit = 0;
  for (let i = 0; i < after.data.length; i += 4) {
    if (Math.max(...after.data.subarray(i, i + 3)) > 60) lit++;
    if (before.data[i] !== after.data[i] || before.data[i + 1] !== after.data[i + 1] || before.data[i + 2] !== after.data[i + 2]) changed++;
  }
  assert(lit > 300, 'radar canvas must be nonblank');
  assert(changed > 100, 'radar must update when steering');
  await page.screenshot({ path: `${out}/radar-3d-desktop.png` });
  await page.locator('#radar').screenshot({ path: `${out}/radar-3d-live.png` });

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const fits = await page.evaluate(() => {
      const radar = document.querySelector('#radar').getBoundingClientRect();
      const readouts = document.querySelector('.bottom-strip').getBoundingClientRect();
      return radar.left >= 0 && radar.bottom <= innerHeight && radar.right < readouts.left;
    });
    assert(fits, `radar overlaps at ${width}px`);
    await page.screenshot({ path: `${out}/radar-3d-mobile-${width}.png` });
  }

  // A deterministic fixture uses the same renderer to verify individual stems and glyphs.
  const fixture = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { renderRadar, projectRadarContact } = await import('/src/radar.ts');
    const canvas = document.createElement('canvas');
    canvas.id = 'radarFixture'; canvas.width = canvas.height = 180;
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:180px;height:180px;background:black;z-index:100';
    document.body.append(canvas);
    const context = canvas.getContext('2d');
    const origin = new THREE.Vector3(), orientation = new THREE.Quaternion();
    const contacts = [
      { position: new THREE.Vector3(-240, 230, -180), color: '#ff4055', glyph: 'ship' },
      { position: new THREE.Vector3(220, -250, -200), color: '#75caff', glyph: 'ship' },
      { position: new THREE.Vector3(260, 130, 210), color: '#60ff85', glyph: 'ship' },
      { position: new THREE.Vector3(-290, -220, 230), color: '#ffff70', glyph: 'cargo' },
      { position: new THREE.Vector3(90, 400, -120), color: '#ffff70', glyph: 'gate' },
      { position: new THREE.Vector3(-80, -400, -40), color: '#ff4055', glyph: 'mine' }
    ];
    renderRadar(context, contacts, origin, orientation);
    const data = context.getImageData(0, 0, 180, 180).data;
    const coloredNear = (x, y, color, radius = 2) => {
      const rgb = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16));
      for (let py = Math.floor(y - radius); py <= Math.ceil(y + radius); py++) {
        for (let px = Math.floor(x - radius); px <= Math.ceil(x + radius); px++) {
          const index = (py * 180 + px) * 4;
          if (data[index + 3] > 40 && rgb.every((channel, i) => Math.abs(data[index + i] - channel) < 24)) return true;
        }
      }
      return false;
    };
    return contacts.map(contact => {
      const point = projectRadarContact(contact.position, origin, orientation);
      const stem = coloredNear(point.x, (point.y + point.planeY) / 2, contact.color);
      const glyph = contact.glyph === 'cargo'
        ? coloredNear(point.x, point.y - 4, contact.color) && coloredNear(point.x - 3, point.y + 3, contact.color)
        : contact.glyph === 'gate'
          ? coloredNear(point.x - 4, point.y, contact.color) && coloredNear(point.x + 4, point.y, contact.color)
          : coloredNear(point.x, point.y, contact.color);
      return { glyph: contact.glyph, height: point.height, stemVisible: stem, glyphVisible: glyph };
    });
  });
  assert(fixture.every(contact => contact.stemVisible && contact.glyphVisible), JSON.stringify(fixture));
  await page.locator('#radarFixture').screenshot({ path: `${out}/radar-3d-height-fixture.png` });
  assert.deepEqual(errors, []);
  const report = { lit, changed, fixture, errors };
  await writeFile(`${out}/radar-3d-report.json`, JSON.stringify(report, null, 2));
  console.log('PASS 3D RADAR', JSON.stringify(report));
} finally { await browser.close(); }
