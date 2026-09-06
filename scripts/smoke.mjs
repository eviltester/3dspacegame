import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const url = process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/';
const outputDir = 'output/playwright';

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const runtimeErrors = [];

page.on('console', (message) => {
  if (message.type() === 'error') {
    runtimeErrors.push(message.text());
  }
});
page.on('pageerror', (error) => runtimeErrors.push(error.message));

try {
  await page.addInitScript(() =>
    window.localStorage.setItem(
      'vector-shooter-save-v1',
      JSON.stringify({
        credits: 100,
        bestScore: 0,
        discoveredSectors: ['lyra-drift'],
        sectorReputation: { 'lyra-drift': 'pirate' },
        wantedBySector: { 'lyra-drift': 3 },
        unlockedWeaponLevel: 1
      })
    )
  );
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#viewport canvas');
  await page.waitForSelector('#modelPreview canvas');
  await page.waitForFunction(() => window.vectorShooterDebug);

  const briefing = await page.evaluate(() => ({
    title: document.querySelector('#launchTitle')?.textContent ?? '',
    launchButton: document.querySelector('#launchButton')?.textContent ?? '',
    controls: document.querySelector('.controls-card')?.textContent ?? '',
    modelTitle: window.vectorShooterDebug.getState().briefingTitle,
    modelCount: window.vectorShooterDebug.getState().briefingCount,
    missionBriefTitle: window.vectorShooterDebug.getState().missionBriefTitle,
    missionBriefObjective: window.vectorShooterDebug.getState().missionBriefObjective
  }));
  if (
    briefing.title !== 'VECTOR SHOOTER' ||
    briefing.launchButton !== 'PLAY GAME' ||
    !briefing.controls.includes('LEFT CLICK') ||
    !briefing.controls.includes('W / UP') ||
    !briefing.controls.includes('LEFT / RIGHT') ||
    !briefing.modelTitle ||
    !/^\d+\/\d+$/.test(briefing.modelCount) ||
    !briefing.missionBriefTitle ||
    !briefing.missionBriefObjective
  ) {
    throw new Error(`Briefing screen missing expected controls or model scan: ${JSON.stringify(briefing)}`);
  }

  const launchLaw = await page.evaluate(() => window.vectorShooterDebug.getState());
  if (launchLaw.wantedHere || launchLaw.wanted) {
    throw new Error(`Saved heat was not cleared on launch: wanted=${launchLaw.wanted}, wantedHere=${launchLaw.wantedHere}`);
  }

  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    (firstTitle) => window.vectorShooterDebug.getState().briefingTitle !== firstTitle,
    briefing.modelTitle,
    { timeout: 1000 }
  );
  const nextBriefing = await page.evaluate(() => window.vectorShooterDebug.getState());
  if (nextBriefing.briefingCount === briefing.modelCount) {
    throw new Error(`Briefing arrow navigation did not update the count: ${briefing.modelCount}`);
  }

  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(
    (firstTitle) => window.vectorShooterDebug.getState().briefingTitle === firstTitle,
    briefing.modelTitle,
    { timeout: 1000 }
  );
  await page.waitForTimeout(3600);
  const stillBriefingTitle = await page.evaluate(() => window.vectorShooterDebug.getState().briefingTitle);
  if (stillBriefingTitle !== briefing.modelTitle) {
    throw new Error('Briefing scan advanced before the 5 second delay');
  }
  await page.waitForFunction(
    (firstTitle) => window.vectorShooterDebug.getState().briefingTitle !== firstTitle,
    briefing.modelTitle,
    { timeout: 2500 }
  );

  await page.click('#launchButton');
  await page.evaluate(() => window.vectorShooterDebug.lookByMouse(0, 1800));
  const loopPitch = await page.evaluate(() => window.vectorShooterDebug.getState().pitch);
  if (loopPitch > -2.2) {
    throw new Error(`Mouse pitch still appears clamped: pitch=${loopPitch}`);
  }
  await page.evaluate(() => window.vectorShooterDebug.lookByMouse(0, -1800));

  await page.evaluate(() => window.vectorShooterDebug.hitNearestPirate());
  const lawAfterPirateHit = await page.evaluate(() => window.vectorShooterDebug.getState());
  if (lawAfterPirateHit.wantedHere) {
    throw new Error(`Pirate defense incorrectly triggered a warrant: wantedHere=${lawAfterPirateHit.wantedHere}`);
  }
  const npcShipHitsBefore = lawAfterPirateHit.npcShipHits;
  await page.evaluate(() => window.vectorShooterDebug.forceNpcCrossfire());
  await page.waitForFunction(
    (previousCount) => window.vectorShooterDebug.getState().npcShipHits > previousCount,
    npcShipHitsBefore,
    { timeout: 2500 }
  );
  const lawAfterNpcCrossfire = await page.evaluate(() => window.vectorShooterDebug.getState());
  if (lawAfterNpcCrossfire.wantedHere) {
    throw new Error('NPC crossfire incorrectly made the player wanted');
  }
  const pirateTookContraband = await page.evaluate(() => window.vectorShooterDebug.forceNpcPickup('pirate', 'contraband'));
  if (!pirateTookContraband) {
    throw new Error('Pirate failed to pick up contraband');
  }
  const policeTookContraband = await page.evaluate(() => window.vectorShooterDebug.forceNpcPickup('police', 'contraband'));
  if (!policeTookContraband) {
    throw new Error('Police failed to pick up contraband');
  }
  const policeTookLegalCargo = await page.evaluate(() => window.vectorShooterDebug.forceNpcPickup('police', 'legalCargo'));
  if (policeTookLegalCargo) {
    throw new Error('Police incorrectly picked up legal cargo');
  }
  const policeTookWeaponCore = await page.evaluate(() => window.vectorShooterDebug.forceNpcPickup('police', 'weaponCore'));
  if (policeTookWeaponCore) {
    throw new Error('Police incorrectly picked up a weapon core');
  }
  const traderTookContraband = await page.evaluate(() => window.vectorShooterDebug.forceNpcPickup('trader', 'contraband'));
  if (traderTookContraband) {
    throw new Error('Trader incorrectly picked up contraband');
  }
  const traderTookLegalCargo = await page.evaluate(() => window.vectorShooterDebug.forceNpcPickup('trader', 'legalCargo'));
  if (!traderTookLegalCargo) {
    throw new Error('Trader failed to pick up legal cargo');
  }

  await page.evaluate(() => window.vectorShooterDebug.completeActiveMission());
  await page.waitForFunction(
    () =>
      window.vectorShooterDebug.getState().messageLog.includes('Head to the Warp Gate!') &&
      window.vectorShooterDebug.getState().warpCueFlashing,
    undefined,
    { timeout: 1200 }
  );

  const shieldBeforeHit = await page.evaluate(() => window.vectorShooterDebug.getState().shield);
  await page.evaluate(() => window.vectorShooterDebug.forcePirateHit());
  await page.waitForFunction(
    () =>
      document.querySelector('#damageLayer')?.classList.contains('active') &&
      window.vectorShooterDebug.getState().hitCallout.includes('RED PIRATE SHOT YOU'),
    undefined,
    { timeout: 1200 }
  );
  const shieldAfterHit = await page.evaluate(() => window.vectorShooterDebug.getState().shield);
  if (shieldAfterHit >= shieldBeforeHit) {
    throw new Error(`Pirate-hit feedback did not apply damage; shield ${shieldBeforeHit} -> ${shieldAfterHit}`);
  }
  const planetDistance = await page.evaluate(() => {
    window.vectorShooterDebug.ramNearestPlanet();
    return window.vectorShooterDebug.getState().nearestPlanetDistance;
  });
  if (planetDistance === null || planetDistance < 61.5) {
    throw new Error(`Planet collision failed; distance after collision was ${planetDistance}`);
  }
  await page.keyboard.down('KeyW');
  await page.mouse.move(720, 320);
  await page.waitForTimeout(420);
  await page.keyboard.up('KeyW');
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => window.vectorShooterDebug.getState().playerShots > 0, undefined, { timeout: 2000 });
  await page.waitForTimeout(300);

  const shotInterceptionsBefore = await page.evaluate(() => window.vectorShooterDebug.getState().shotInterceptions);
  await page.waitForTimeout(450);
  await page.evaluate(() => window.vectorShooterDebug.spawnIncomingBolt());
  await page.mouse.click(640, 360);
  await page.waitForFunction(
    (previousCount) => window.vectorShooterDebug.getState().shotInterceptions > previousCount,
    shotInterceptionsBefore,
    { timeout: 3000 }
  );

  await assertNonBlank(page, `${outputDir}/desktop.png`);
  await assertNoHudOverlap(page, 'desktop');

  await page.evaluate(() => window.vectorShooterDebug.grantCargo('credits', 2));
  await page.evaluate(() => window.vectorShooterDebug.triggerTraderAttack());
  await page.waitForFunction(() => window.vectorShooterDebug.getState().wanted === true);

  const beforeWarp = await page.evaluate(() => window.vectorShooterDebug.getState().sector);
  await page.evaluate(() => window.vectorShooterDebug.triggerWarp());
  await page.waitForFunction((sector) => window.vectorShooterDebug.getState().sector !== sector, beforeWarp, {
    timeout: 4000
  });
  await page.waitForFunction(
    () =>
      document.querySelector('#launchOverlay')?.getAttribute('data-mode') === 'mission' &&
      window.vectorShooterDebug.getState().missionBriefObjective.length > 0 &&
      document.querySelector('#launchButton')?.textContent === 'START MISSION',
    undefined,
    { timeout: 1200 }
  );
  await page.click('#launchButton');
  await page.waitForFunction(() => document.querySelector('#launchOverlay')?.classList.contains('hidden'), undefined, {
    timeout: 1200
  });

  await page.setViewportSize({ width: 390, height: 740 });
  await page.waitForTimeout(300);
  await assertNonBlank(page, `${outputDir}/mobile.png`);
  await assertNoHudOverlap(page, 'mobile');

  await page.evaluate(() => window.vectorShooterDebug.forcePlayerDeath());
  await page.waitForFunction(
    () =>
      document.querySelector('#launchOverlay')?.getAttribute('data-mode') === 'death' &&
      window.vectorShooterDebug.getState().deathTimer === '10' &&
      document.querySelector('#launchButton')?.textContent === 'RELAUNCH NOW' &&
      !document.querySelector('#launchButton')?.disabled,
    undefined,
    { timeout: 1200 }
  );
  await page.waitForFunction(() => window.vectorShooterDebug.getState().deathTimer === '9', undefined, {
    timeout: 1700
  });
  await page.click('#launchButton');
  await page.waitForFunction(
    () =>
      document.querySelector('#launchOverlay')?.classList.contains('hidden') &&
      window.vectorShooterDebug.getState().deathTimer === '10' &&
      !window.vectorShooterDebug.getState().wantedHere,
    undefined,
    { timeout: 1200 }
  );

  if (runtimeErrors.length > 0) {
    throw new Error(`Browser reported errors:\n${runtimeErrors.join('\n')}`);
  }

  const state = await page.evaluate(() => window.vectorShooterDebug.getState());
  console.log(
    `Smoke passed: sector=${state.sector}, entities=${state.entityCount}, wanted=${state.wanted}, weapon=${state.weaponLevel}`
  );
} finally {
  await browser.close();
}

async function assertNonBlank(targetPage, path) {
  const screenshot = await targetPage.screenshot({ path });
  const png = PNG.sync.read(screenshot);
  let litPixels = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    const red = png.data[index];
    const green = png.data[index + 1];
    const blue = png.data[index + 2];
    if (red + green + blue > 45) {
      litPixels += 1;
    }
  }

  const ratio = litPixels / (png.width * png.height);
  if (ratio < 0.015) {
    throw new Error(`Canvas/render check failed for ${path}; lit pixel ratio was ${ratio.toFixed(4)}`);
  }
}

async function assertNoHudOverlap(targetPage, label) {
  const overlaps = await targetPage.evaluate(() => {
    const selectors = ['.sector-panel', '.mission-panel', '.cargo-panel', '.radar', '.bottom-strip'];
    const boxes = selectors.map((selector) => {
      const element = document.querySelector(selector);
      const rect = element.getBoundingClientRect();
      return {
        selector,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
      };
    });

    const result = [];
    for (let outer = 0; outer < boxes.length; outer += 1) {
      for (let inner = outer + 1; inner < boxes.length; inner += 1) {
        const a = boxes[outer];
        const b = boxes[inner];
        const separated = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        if (!separated) {
          result.push(`${a.selector} overlaps ${b.selector}`);
        }
      }
    }
    return result;
  });

  if (overlaps.length > 0) {
    throw new Error(`HUD overlap at ${label}: ${overlaps.join(', ')}`);
  }
}
