import { test, expect } from './fixtures/game';
import { MousePilot } from './fixtures/pilot';

test.use({ trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true } });

for (const [mode, lastStage] of [['journey', 4], ['endless', 10], ['invaders', 4]] as const) {
  test(`${mode}: mouse-only combat through ${lastStage} encounters`, async ({ game, page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => { Date.now = () => 41717; });
    await game.open(); await game.start(mode);
    const pilot = new MousePilot(game); let deaths = 0, ticks = 0, cleared = 0;
    const stages = new Map<number, Awaited<ReturnType<typeof game.state>>['stats']>();
    while (ticks++ < 5000) {
      const state = await game.state();
      if (state.stage! > lastStage) { cleared = lastStage; break; }
      if (state.stats.kills >= (stages.get(state.stage!)?.kills ?? 0)) stages.set(state.stage!, state.stats);
      if (state.menu) {
        await pilot.fire(false);
        if (state.menu === 'briefing') await game.engage();
        else if (state.menu === 'gameover') { expect(++deaths).toBeLessThan(10); await game.engage('relaunch'); }
        else if (state.menu === 'pause') await game.engage('unpause');
        else if (state.menu === 'shop') {
          for (const item of ['repair', 'tier', 'shield', 'magnet']) if (await page.locator(`[data-action="buy:${item}"]`).isEnabled()) await game.action(`buy:${item}`);
          await game.action('depart');
        } else if (state.menu === 'bonusOffer') await game.action('bonusSkip');
        else throw new Error(`Unexpected screen ${state.menu}`);
      } else if (state.phase === 'recovery') {
        await pilot.fire(false); await page.mouse.down(); await game.step(0.02); await page.mouse.up();
      } else await pilot.combatStep();
    }
    await pilot.fire(false);
    expect(cleared).toBe(lastStage);
    expect([...stages.values()].reduce((sum, stats) => sum + stats.kills, 0)).toBeGreaterThan(10);
    expect(stages.get(1)!.firstCombat).toBeGreaterThanOrEqual(0); expect(stages.get(1)!.firstCombat).toBeLessThan(5);
    await game.info.attach('mouse-playthrough', { body: JSON.stringify({ mode, lastStage, deaths, ticks, stages: [...stages] }), contentType: 'application/json' });
  });
}
