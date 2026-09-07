import { test, expect } from './fixtures/game';

test('armada perspective, player craft and released-gate indicator render correctly', async ({ game, page }) => {
  await game.open(); await game.unlockWarp(); await game.warpStage(95);
  await expect(page.locator('#missionBriefObjective')).toContainText('tractor beam'); await game.engage(); await game.step(0.2);
  const a = await game.screenshot('armada'); await game.step(0.3); const b = await game.screenshot('armada-motion'); expect(a.equals(b)).toBe(false);
  await game.finish(); await expect(page.locator('#objectiveArrow')).toContainText('WARP');
});
