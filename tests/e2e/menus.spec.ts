import { test, expect } from './fixtures/game';
import { GAME_MODES } from '../../src/modes';
import { createCatalog } from '../../src/models/catalog';

test('Info Deck renders every model with keyboard and mouse navigation', async ({ game, page }) => {
  await game.open(); await game.action('objects');
  await expect(page.getByRole('tab', { name: 'INFO DECK', selected: true })).toBeVisible();
  await expect(page.locator('#catalogSection .briefing-status')).toHaveText('INFO DECK');
  const initial = (await game.state()).briefingCount;
  await page.locator('[data-action="scanNext"]').click();
  expect((await game.state()).briefingCount).not.toBe(initial);
  await page.keyboard.press('ArrowLeft'); expect((await game.state()).briefingCount).toBe(initial);
  const count = Number((await game.state()).briefingCount?.split('/')[1]); expect(count).toBe(createCatalog().length);
  for (let i = 0; i < count; i++) {
    await page.locator('[data-action="scanNext"]').click();
    await expect(page.locator('#modelTitle')).not.toBeEmpty(); await expect(page.locator('#modelDescription')).not.toBeEmpty();
    // A single sparse pickup outline covers fewer pixels than a whole flight scene.
    await game.screenshot(`object-${i}`, '#modelPreview canvas', 150);
  }
});

for (const width of [1440, 1024, 650, 390, 320]) {
  test(`menus and HUD fit ${width}px without overlapping`, async ({ game, page }) => {
    await page.setViewportSize({ width, height: width > 650 ? 900 : 844 }); await game.open();
    await game.layout(); await game.screenshot(`title-${width}`, '.arcade-menu');
    const panelBounds = await page.locator('.title-panels').boundingBox();
    await game.action('instructions'); await game.layout();
    await expect(page.locator('#catalogSection')).toBeHidden();
    for (const mode of GAME_MODES) {
      await game.action(`mode:${mode}`);
      const fonts = await page.locator('.game-instructions p').evaluateAll(paragraphs => paragraphs.map(paragraph => {
        const style = getComputedStyle(paragraph);
        return { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight, lineHeight: style.lineHeight, colour: style.color };
      }));
      expect(fonts.length).toBeGreaterThan(1);
      expect(new Set(fonts.map(font => JSON.stringify(font))).size, `${mode} instruction paragraphs share one text style`).toBe(1);
      expect(fonts[0]).toMatchObject({ size: '13px', weight: '400' });
      await expect(page.locator('#title-panel-instructions')).toHaveCSS('overflow-y', 'visible');
      await expect(page.locator('.title-panels')).toHaveCSS('overflow-y', 'visible');
    }
    await page.screenshot({ path: game.info.outputPath(`tunnel-instructions-${width}.png`), fullPage: true });
    await game.action('mode:journey');
    await game.screenshot(`instructions-${width}`, '.arcade-menu');
    await game.action('controls');
    for (const scheme of ['touch', 'mouse']) {
      await game.action(`controls:${scheme}`); await game.layout();
      await expect(page.locator('#title-panel-controls')).toHaveCSS('overflow-y', 'visible');
      const height = await page.locator('#title-panel-controls').evaluate(panel => ({ box: panel.clientHeight, content: panel.scrollHeight }));
      expect(height.box, 'Controls grows to fit its contents').toBeGreaterThanOrEqual(height.content - 1);
      await game.screenshot(`${scheme}-controls-${width}`, '.controls-card');
    }
    await expect(page.locator('.controls-card')).not.toContainText('Browse entries');
    await game.action('objects');
    await game.screenshot(`ships-objects-title-${width}`, '#vectorTitle');
    const placement = await page.locator('.scan-hint').evaluate(hint => {
      const arrows = document.querySelector('.scan-buttons')!.getBoundingClientRect();
      const catalog = document.querySelector('#catalogSection')!.getBoundingClientRect();
      const rect = hint.getBoundingClientRect();
      return { below: rect.top >= arrows.bottom, leftAligned: rect.left === catalog.left, textAlign: getComputedStyle(hint).textAlign };
    });
    expect(placement).toEqual({ below: true, leftAligned: true, textAlign: 'left' });
    await game.layout();
    await page.locator('#catalogSection').scrollIntoViewIfNeeded();
    await game.screenshot(`scan-${width}`, '#catalogSection');
    await game.action('game');
    // GAME returns to its original size after the longer help expands the page.
    expect(await page.locator('.title-panels').boundingBox()).toMatchObject({ width: panelBounds!.width, height: panelBounds!.height, x: panelBounds!.x });
    await page.screenshot({ path: game.info.outputPath(`tabbed-title-${width}.png`) });
    await game.start(); await game.step(0.2); await game.layout(); await game.screenshot(`flight-${width}`);
    await game.pause(); await game.layout(); await game.action('title'); await game.unlockWarp(); await game.layout();
    await game.bonus('sequence', 8); await game.step(0.02); await game.layout();
  });
}
