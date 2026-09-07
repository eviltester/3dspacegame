/** Small DOM adapter for motion settings and in-flight touch buttons. */
import type { ProfileSaveV2 } from '../arcade';
import type { FlightInput } from '../input';
import { tiltSensitivity } from '../input-layouts';
import { MOTION_MESSAGES } from './motion';

export class MobileControls {
  constructor(private input: Pick<FlightInput, 'mobile' | 'boost' | 'adjustThrottle'>, private profile: ProfileSaveV2, private persist: () => void) {
    input.mobile.sensitivity = profile.settings.tiltSensitivity;
    document.addEventListener('input', this.change);
  }
  private change = (event: Event): void => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.id !== 'tiltSensitivity') return;
    this.input.mobile.sensitivity = this.profile.settings.tiltSensitivity = tiltSensitivity(field.valueAsNumber);
    this.persist(); this.refresh();
  };
  dispose(): void { document.removeEventListener('input', this.change); }
  action(name: string): boolean {
    if (this.profile.settings.controlScheme !== 'touch') return false;
    const motion = this.input.mobile.motion;
    if (name === 'enableTilt') void motion.enable();
    else if (name === 'dragSteering') motion.stop();
    else if (name === 'centreTilt') motion.calibrate();
    else if (name === 'touchBoost') this.input.boost();
    else if (name === 'throttleUp') this.input.adjustThrottle(1);
    else if (name === 'throttleDown') this.input.adjustThrottle(-1);
    else return false;
    this.refresh(); return true;
  }
  refresh(): void {
    const motion = this.input.mobile.motion;
    const status = document.querySelector('#motionStatus');
    if (status) status.textContent = MOTION_MESSAGES[motion.status];
    const enable = document.querySelector<HTMLButtonElement>('[data-action="enableTilt"]');
    if (enable) enable.disabled = motion.status === 'requesting';
    const value = document.querySelector('#tiltValue');
    if (value) value.textContent = `${this.input.mobile.sensitivity.toFixed(1)}x`;
    const centre = document.querySelector<HTMLButtonElement>('#touchCentre');
    if (centre) centre.disabled = motion.status !== 'ready';
  }
}
