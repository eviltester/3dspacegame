/**
 * Shared bindings and their human-readable labels for input, menus and briefings.
 * KeyboardEvent.code values describe physical keys; labels are presentation only.
 */
export type ControlScheme = 'mouse' | 'wasd' | 'arrows' | 'touch';
export const CONTROL_SCHEMES: readonly ControlScheme[] = ['mouse', 'wasd', 'arrows', 'touch'];
export const KEYBOARD_LOOK_RATE = 520;

export function tiltSensitivity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0.5, Math.min(2, value)) : 1;
}
export const mouseSensitivity = tiltSensitivity;

interface ControlLayout {
  name: string;
  steering: string;
  horizontal: string;
  fire: string;
  blast: string;
  up: readonly string[];
  down: readonly string[];
  left: readonly string[];
  right: readonly string[];
  primary: readonly string[];
  special: readonly string[];
  accelerate: readonly string[];
  brake: readonly string[];
  rollLeft: readonly string[];
  rollRight: readonly string[];
}

const keyboard = {
  accelerate: ['KeyR'], brake: ['KeyF'], rollLeft: ['KeyQ'], rollRight: ['KeyE']
};

export const CONTROL_LAYOUTS: Record<ControlScheme, ControlLayout> = {
  touch: {
    name: 'TOUCH / TILT', steering: 'TILT / DRAG', horizontal: 'Tilt / drag', fire: 'LEFT SIDE', blast: 'TAP RIGHT SIDE',
    up: [], down: [], left: [], right: [], primary: ['Space'], special: [],
    accelerate: [], brake: [], rollLeft: [], rollRight: []
  },
  mouse: {
    name: 'MOUSE', steering: 'MOUSE', horizontal: 'Mouse', fire: 'LEFT CLICK', blast: 'RIGHT CLICK',
    up: [], down: [], left: [], right: [], primary: ['Space'], special: [],
    accelerate: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'],
    rollLeft: ['KeyA', 'ArrowLeft'], rollRight: ['KeyD', 'ArrowRight']
  },
  wasd: {
    ...keyboard, name: 'WASD', steering: 'W / A / S / D', horizontal: 'A / D', fire: 'J', blast: 'K',
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], primary: ['KeyJ', 'Space'], special: ['KeyK']
  },
  arrows: {
    ...keyboard, name: 'ARROWS + Z/X', steering: 'ARROW KEYS', horizontal: 'Left / Right arrows', fire: 'Z', blast: 'X',
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], primary: ['KeyZ', 'Space'], special: ['KeyX']
  }
};

export function isControlScheme(value: unknown): value is ControlScheme {
  return CONTROL_SCHEMES.some(scheme => scheme === value);
}

export function flightControls(scheme: ControlScheme): string {
  const layout = CONTROL_LAYOUTS[scheme];
  return `${layout.steering} steers / aims. Hold ${layout.fire} to fire. ${layout.blast} uses your charged blast.`;
}

export function boostControls(scheme: ControlScheme): string {
  return scheme === 'touch' ? 'Hold the on-screen Boost button to accelerate.' : 'Hold Shift or wheel forward to accelerate with boost.';
}
export function pauseControls(scheme: ControlScheme): string {
  return scheme === 'touch' ? 'Use the on-screen Pause button.' : 'Esc pauses.';
}
