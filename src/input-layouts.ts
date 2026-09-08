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
// Fire and blast aliases stay available when the player changes steering layout.
const combatKeys = { primary: ['Space', 'KeyJ', 'KeyZ'], special: ['KeyK', 'KeyX'] };
const desktop: ControlLayout = {
  ...keyboard, ...combatKeys,
  name: 'MOUSE + KEYS', steering: 'MOUSE / WASD / ARROWS', horizontal: 'Mouse, A / D or Left / Right arrows',
  fire: 'LEFT CLICK / SPACE / J / Z', blast: 'RIGHT CLICK / K / X',
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight']
};

export const CONTROL_LAYOUTS: Record<ControlScheme, ControlLayout> = {
  touch: {
    ...combatKeys,
    name: 'TOUCH / TILT', steering: 'TILT / DRAG', horizontal: 'Tilt / drag', fire: 'LEFT SIDE', blast: 'TAP RIGHT SIDE',
    up: [], down: [], left: [], right: [],
    accelerate: [], brake: [], rollLeft: [], rollRight: []
  },
  // Saved desktop preferences all resolve to the same simultaneous bindings.
  mouse: desktop, wasd: desktop, arrows: desktop
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
