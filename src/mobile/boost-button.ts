/** A real hold: releasing/cancelling the button stops thrust, not a remembered toggle. */
export class BoostButton {
  private pointer: number | null = null;
  private key: string | null = null;
  constructor(private held: (value: boolean) => void) {
    document.addEventListener('pointerdown', this.down);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(type, this.up);
    document.addEventListener('keydown', this.keydown); document.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.visibility);
  }
  private button(target: EventTarget | null): HTMLButtonElement | null {
    return target instanceof Element ? target.closest<HTMLButtonElement>('#touchBoost:not(:disabled)') : null;
  }
  private down = (event: PointerEvent): void => {
    const button = this.button(event.target);
    if (!button || event.button !== 0 || this.pointer !== null) return;
    event.preventDefault(); this.pointer = event.pointerId; button.setPointerCapture(event.pointerId); this.update();
  };
  private up = (event: Event): void => {
    if ((event as PointerEvent).pointerId !== this.pointer) return;
    this.pointer = null; this.update();
  };
  private keydown = (event: KeyboardEvent): void => {
    if (!this.button(event.target) || !['Space', 'Enter'].includes(event.code)) return;
    event.preventDefault(); this.key = event.code; this.update();
  };
  private keyup = (event: KeyboardEvent): void => {
    if (event.code !== this.key) return;
    event.preventDefault(); this.key = null; this.update();
  };
  private update(): void { this.held(this.pointer !== null || this.key !== null); }
  clear = (): void => { this.pointer = null; this.key = null; this.update(); };
  private visibility = (): void => { if (document.hidden) this.clear(); };
  dispose(): void {
    this.clear(); document.removeEventListener('pointerdown', this.down);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) document.removeEventListener(type, this.up);
    document.removeEventListener('keydown', this.keydown); document.removeEventListener('keyup', this.keyup);
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.visibility);
  }
}
