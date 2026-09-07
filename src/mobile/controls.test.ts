// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { freshProfile, parseProfile } from '../arcade';
import { FrontMenus } from '../menus/front';
import { MobileControls } from './controls';
import { MobileInput } from './input';

let controls: MobileControls;
const profile = freshProfile(), persist = vi.fn(), boost = vi.fn(), throttle = vi.fn();
let mobile: MobileInput;
beforeEach(() => {
  profile.settings.controlScheme = 'touch'; profile.settings.tiltSensitivity = 1.4;
  document.body.innerHTML = FrontMenus.controls(profile)[3] + '<button id="touchCentre">Centre</button>';
  mobile = new MobileInput(document.createElement('canvas'), () => false, () => controls?.refresh());
  controls = new MobileControls({ mobile, boost, adjustThrottle: throttle }, profile, persist);
  controls.refresh(); document.body.addEventListener('click', click);
});
const click = (event: MouseEvent) => { const name = (event.target as HTMLElement).dataset.action; if (name) controls.action(name); };
afterEach(() => {
  controls.dispose(); mobile.motion.stop(); document.body.removeEventListener('click', click);
  document.body.innerHTML = ''; vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals();
});
it('shows the actual touch gestures and saves slider interaction without rebuilding the menu', () => {
  expect(screen.getByText('DOUBLE TAP EITHER SIDE')).toBeTruthy();
  expect(screen.getByText('Tap to fire; hold for continuous fire')).toBeTruthy();
  const slider = screen.getByRole('slider', { name: 'TILT SENSITIVITY' });
  fireEvent.input(slider, { target: { value: '1.8' } });
  expect(profile.settings.tiltSensitivity).toBe(1.8); expect(mobile.sensitivity).toBe(1.8);
  expect(screen.getByText('1.8x')).toBeTruthy(); expect(persist).toHaveBeenCalledOnce();
  fireEvent.input(document.body); fireEvent.input(document.createElement('input')); expect(persist).toHaveBeenCalledOnce();
});
it('allows enable, centre and drag selection with accessible buttons', async () => {
  const user = userEvent.setup();
  const enable = vi.spyOn(mobile.motion, 'enable').mockResolvedValue();
  const centre = vi.spyOn(mobile.motion, 'calibrate'), stop = vi.spyOn(mobile.motion, 'stop');
  await user.click(screen.getByRole('button', { name: 'ENABLE TILT' })); expect(enable).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'CENTRE' })); expect(centre).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'USE DRAG' })); expect(stop).toHaveBeenCalledOnce();
  mobile.motion.status = 'denied'; controls.refresh(); expect(screen.getByRole('status', { name: 'Motion controls' }).textContent).toContain('denied');
  mobile.motion.status = 'requesting'; controls.refresh(); expect(screen.getByRole<HTMLButtonElement>('button', { name: 'ENABLE TILT' }).disabled).toBe(true);
  mobile.motion.status = 'ready'; controls.refresh(); expect(document.querySelector<HTMLButtonElement>('#touchCentre')!.disabled).toBe(false);
});
it('routes flight buttons, ignores unknown commands, and leaves non-touch controls alone', () => {
  controls.action('touchBoost'); controls.action('throttleUp'); controls.action('throttleDown');
  expect(boost).toHaveBeenCalledOnce(); expect(throttle.mock.calls).toEqual([[1], [-1]]);
  expect(controls.action('pause')).toBe(false); profile.settings.controlScheme = 'mouse';
  expect(controls.action('touchBoost')).toBe(false); expect(boost).toHaveBeenCalledOnce();
  document.body.innerHTML = ''; controls.refresh();
});
it('defaults new touch devices to touch but preserves explicit saved layouts and sensitivity', () => {
  expect(parseProfile(null, null, 'touch').settings.controlScheme).toBe('touch');
  expect(parseProfile('{', null, 'touch').settings.controlScheme).toBe('touch');
  expect(parseProfile('{"version":2}', null, 'touch').settings.controlScheme).toBe('touch');
  const saved = freshProfile(); saved.settings.controlScheme = 'wasd'; saved.settings.tiltSensitivity = 1.8;
  expect(parseProfile(JSON.stringify(saved), null, 'touch').settings).toEqual(saved.settings);
  saved.settings.controlScheme = 'touch'; saved.settings.tiltSensitivity = 100;
  expect(parseProfile(JSON.stringify(saved), null).settings).toMatchObject({ controlScheme: 'touch', tiltSensitivity: 2 });
});
