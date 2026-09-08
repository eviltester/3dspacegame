import { describe, expect, it } from 'vitest';
import { freshProfile, parseProfile } from './arcade';
import { bonusBrief } from './bonus';
import { CONTROL_LAYOUTS, CONTROL_SCHEMES, isControlScheme } from './input-layouts';
import { controlsView } from './menus/controls';

describe('saved control layouts and instructions', () => {
  it.each(CONTROL_SCHEMES)('persists %s and uses the same mapping in controls and bonus briefings', scheme => {
    const profile = freshProfile(); profile.settings.controlScheme = scheme;
    expect(parseProfile(JSON.stringify(profile), null).settings.controlScheme).toBe(scheme);
    expect(isControlScheme(scheme)).toBe(true);
    const view = controlsView(scheme);
    expect(view).toContain(`data-action="controls:${scheme === 'touch' ? 'touch' : 'mouse'}" aria-pressed="true"`);
    expect(view).not.toContain('data-action="controls:wasd"'); expect(view).not.toContain('data-action="controls:arrows"');
    expect(view).toContain(CONTROL_LAYOUTS[scheme].fire);
    expect(view).toContain(CONTROL_LAYOUTS[scheme].blast);
    expect(view).toContain('SPACE / J / Z'); expect(view).toContain('K / X');
    expect(view).not.toContain('Browse ships &amp; objects');
    for (const kind of ['asteroids', 'canyon', 'sequence'] as const) {
      const brief = bonusBrief(kind, 1, scheme);
      expect(brief).toContain(`Hold ${CONTROL_LAYOUTS[scheme].fire}`);
      expect(brief).toContain(`${CONTROL_LAYOUTS[scheme].blast} uses your charged blast`);
      if (scheme === 'touch') expect(brief).not.toMatch(/mouse|click/i);
    }
  });
  it('uses one set of desktop bindings for every saved desktop preference', () => {
    for (const scheme of ['mouse', 'wasd', 'arrows'] as const) {
      expect(CONTROL_LAYOUTS[scheme]).toBe(CONTROL_LAYOUTS.mouse);
      const view = controlsView(scheme);
      for (const label of ['MOUSE / WASD / ARROWS', 'WHEEL / R / F', 'Q / E', 'MOUSE SENSITIVITY']) expect(view).toContain(label);
    }
  });
  it.each([undefined, null, 'joystick', {}, 1])('defaults old or invalid saved layout %j to mouse', controlScheme => {
    const profile = freshProfile();
    expect(parseProfile(JSON.stringify({ ...profile, settings: { ...profile.settings, controlScheme } }), null).settings.controlScheme).toBe('mouse');
    expect(isControlScheme(controlScheme)).toBe(false);
  });
  it.each(CONTROL_SCHEMES)('%s has no conflicting gameplay keys', scheme => {
    const { up, down, left, right, primary, special, accelerate, brake, rollLeft, rollRight } = CONTROL_LAYOUTS[scheme];
    const codes = [...up, ...down, ...left, ...right, ...primary, ...special, ...accelerate, ...brake, ...rollLeft, ...rollRight];
    expect(new Set(codes).size).toBe(codes.length);
  });
});
