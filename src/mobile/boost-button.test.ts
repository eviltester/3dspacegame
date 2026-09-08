// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/dom';
import { BoostButton } from './boost-button';

let binding: BoostButton, button: HTMLButtonElement;
const held = vi.fn();
const capture = vi.fn();
beforeEach(() => {
  document.body.innerHTML = '<button id="touchBoost"><span>Boost</span></button><button>Other</button>';
  button = screen.getByRole('button', { name: 'Boost' }); button.setPointerCapture = capture;
  binding = new BoostButton(held);
});
afterEach(() => { binding.dispose(); document.body.innerHTML = ''; vi.restoreAllMocks(); held.mockClear(); capture.mockClear(); });
it.each(['pointerup', 'pointercancel', 'lostpointercapture'])('holds until the matching %s, including a release outside the button', type => {
  fireEvent.pointerDown(button.firstElementChild!, { pointerId: 3, button: 0 });
  expect(held).toHaveBeenLastCalledWith(true); expect(capture).toHaveBeenCalledWith(3);
  fireEvent.pointerDown(button, { pointerId: 4, button: 0 });
  fireEvent(document.body, new PointerEvent(type, { pointerId: 4, bubbles: true }));
  expect(held).toHaveBeenCalledTimes(1);
  fireEvent(document.body, new PointerEvent(type, { pointerId: 3, bubbles: true }));
  expect(held).toHaveBeenLastCalledWith(false);
});
it('ignores disabled, unrelated and non-primary presses', () => {
  fireEvent.pointerDown(document, { pointerId: 1 });
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Other' }), { pointerId: 1, button: 0 });
  fireEvent.pointerDown(button, { pointerId: 1, button: 2 });
  button.disabled = true; fireEvent.pointerDown(button, { pointerId: 1, button: 0 });
  expect(held).not.toHaveBeenCalled();
});
it.each(['Space', 'Enter'])('supports a held %s and ignores unrelated releases', code => {
  fireEvent.keyDown(document.body, { code }); fireEvent.keyDown(button, { code: 'KeyB' });
  expect(held).not.toHaveBeenCalled();
  fireEvent.keyDown(button, { code }); expect(held).toHaveBeenLastCalledWith(true);
  fireEvent.keyUp(button, { code: 'KeyB' }); expect(held).toHaveBeenCalledTimes(1);
  fireEvent.keyUp(button, { code }); expect(held).toHaveBeenLastCalledWith(false);
});
it('keeps thrust while either input is held, clears on pause/focus/hidden, and removes listeners', () => {
  fireEvent.keyDown(button, { code: 'Space' }); fireEvent.pointerDown(button, { pointerId: 2, button: 0 });
  fireEvent.keyUp(button, { code: 'Space' }); expect(held).toHaveBeenLastCalledWith(true);
  fireEvent(window, new Event('blur')); expect(held).toHaveBeenLastCalledWith(false);
  fireEvent.pointerDown(button, { pointerId: 2, button: 0 });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); fireEvent(document, new Event('visibilitychange'));
  expect(held).toHaveBeenLastCalledWith(true);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); fireEvent(document, new Event('visibilitychange'));
  expect(held).toHaveBeenLastCalledWith(false);
  binding.dispose(); held.mockClear();
  fireEvent.pointerDown(button, { pointerId: 1, button: 0 }); fireEvent.keyDown(button, { code: 'Enter' });
  fireEvent(window, new Event('blur')); fireEvent(document, new Event('visibilitychange'));
  expect(held).not.toHaveBeenCalled();
});
