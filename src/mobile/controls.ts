/** Pointer sensitivity settings, motion controls and in-flight touch buttons. */
import type { ProfileSaveV2 } from '../arcade';
import type { FlightInput } from '../input';
import { tiltSensitivity, mouseSensitivity } from '../input-layouts';
import { MOTION_MESSAGES } from './motion';
import { BoostButton } from './boost-button';

export class MobileControls {
  private readonly boostButton: BoostButton;
  constructor(private input: Pick<FlightInput, 'active' | 'mobile' | 'mouseSensitivity' | 'setBoostHeld' | 'adjustThrottle'>, private profile: ProfileSaveV2, private persist: () => void) {
    this.boostButton = new BoostButton(held => input.setBoostHeld(held));
    input.mobile.sensitivity = profile.settings.tiltSensitivity;
    input.mouseSensitivity = profile.settings.mouseSensitivity;
    document.addEventListener('input', this.change);
  }
  private change = (event: Event): void => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement)) return;
    if (field.id === 'tiltSensitivity') this.input.mobile.sensitivity = this.profile.settings.tiltSensitivity = tiltSensitivity(field.valueAsNumber);
    else if (field.id === 'mouseSensitivity') this.input.mouseSensitivity = this.profile.settings.mouseSensitivity = mouseSensitivity(field.valueAsNumber);
    else return;
    this.persist(); this.refresh();
  };
  dispose(): void { document.removeEventListener('input', this.change); this.boostButton.dispose(); }
  action(name: string): boolean {
    if (this.profile.settings.controlScheme !== 'touch') return false;
    const motion = this.input.mobile.motion;
    if (name === 'enableTilt') void motion.enable();
    else if (name === 'dragSteering') motion.stop();
    else if (name === 'centreTilt') motion.calibrate();
    else if (name === 'touchBoost') return true;
    else if (name === 'throttleUp') this.input.adjustThrottle(1);
    else if (name === 'throttleDown') this.input.adjustThrottle(-1);
    else return false;
    this.refresh(); return true;
  }
  refresh(): void {
    if (!this.input.active) this.boostButton.clear();
    const motion = this.input.mobile.motion;
    const status = document.querySelector('#motionStatus');
    if (status) status.textContent = MOTION_MESSAGES[motion.status];
    const enable = document.querySelector<HTMLButtonElement>('[data-action="enableTilt"]');
    if (enable) enable.disabled = motion.status === 'requesting';
    const value = document.querySelector('#tiltValue');
    if (value) value.textContent = `${this.input.mobile.sensitivity.toFixed(1)}x`;
    const mouse = document.querySelector('#mouseValue');
    if (mouse) mouse.textContent = `${this.input.mouseSensitivity.toFixed(1)}x`;
    const centre = document.querySelector<HTMLButtonElement>('#touchCentre');
    if (centre) centre.disabled = motion.status !== 'ready';
  }
}
