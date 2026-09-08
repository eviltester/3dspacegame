import { expect, it } from 'vitest';
import { newRun } from '../arcade';
import { bonusBrief } from '../bonus';
import { stageDefinition } from '../encounters';
import { GAME_MODES } from '../modes';
import { createCatalog } from '../models/catalog';
import { MenuViews } from './views';

// Drop odds are balance details. Accuracy and blast-charge percentages remain useful.
const numericOdds = /\b(?:\d+|one)[ -]+(?:in|out[ -]+of)[ -]+(?:\d+|five|fifteen|thirty)\b|\b\d+(?:\.\d+)?\s*(?:%|percent|\/\d+)\s*(?:chance|probability|odds)/i;

it('keeps drop odds out of every Info Deck description', () => {
  for (const item of createCatalog()) expect(item.description, item.title).not.toMatch(numericOdds);
  const crate = createCatalog().find(item => item.title === 'CANYON CRATE')!;
  expect(crate.description).toContain('Shooting one might release yellow haul.');
  expect(crate.description).toContain('Collect the pickup for points.');
});

it('describes repairs and gates without detailed balance figures in the Info Deck', () => {
  const catalog = createCatalog();
  const repair = catalog.find(item => item.title === 'REPAIR CELL')!.description;
  const gate = catalog.find(item => item.title === 'CANYON GATE')!.description;
  expect(repair).toBe('Partially repairs hull and restores some shield points. Collect it during combat.');
  expect(gate).toBe('Fly through for points. Miss and get a penalty. The next gate pulses green while penalized.');
});

it.each(GAME_MODES)('%s briefings explain pickups without numeric odds', mode => {
  for (const stage of [1, 2, 10, 99]) {
    const run = newRun(mode, 1); run.stage = stage;
    expect(MenuViews.briefing(run, stageDefinition(mode, stage))[3]).not.toMatch(numericOdds);
  }
});

it.each(['asteroids', 'canyon', 'sequence'] as const)('%s bonus descriptions omit numeric odds at every difficulty', kind => {
  for (let difficulty = 1; difficulty <= 8; difficulty++) expect(bonusBrief(kind, difficulty)).not.toMatch(numericOdds);
});
