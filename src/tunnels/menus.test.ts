import { expect, it } from 'vitest';
import { CONTROL_SCHEMES, CONTROL_LAYOUTS } from '../input-layouts';
import { controlsView } from '../menus/controls';
import { tunnelBriefing, TUNNEL_WEAPON_HELP } from './menus';
import { tunnelFixture } from './test-helpers';

it.each(CONTROL_SCHEMES)('describes only active tunnel controls for %s', scheme => {
  const view = controlsView(scheme, 1, 1, true);
  expect(view).toContain('Move between lanes'); expect(view).toContain(CONTROL_LAYOUTS[scheme].horizontal);
  expect(view).not.toContain('Forward / stop / reverse'); expect(view).not.toContain('Roll left / right');
  expect(view).not.toContain('<dd>Boost');
  const { run } = tunnelFixture(); const brief = tunnelBriefing(run, scheme)[3];
  expect(brief).toContain('DEFEND THE EDGE'); expect(brief).toContain(CONTROL_LAYOUTS[scheme].blast);
  expect(brief).toContain(TUNNEL_WEAPON_HELP.pulse); expect(brief).toContain('full loop');
  run.stage = 7; expect(tunnelBriefing(run, scheme)[3]).toContain('stops at both ends');
});
