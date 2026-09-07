/**
 * DOM-only menu shell. Rendering and game rules live elsewhere so navigation,
 * disabled actions and focus can be exercised without a GPU or running a game.
 */
export const button = (action: string, label: string, extra = '') => `<button type="button" data-action="${action}" ${extra}>${label}</button>`;

export class MenuShell {
  readonly viewport: HTMLDivElement;
  readonly overlay: HTMLDivElement;
  readonly radar: HTMLCanvasElement;
  screen = 'title';
  title = '3D VECTOR SPACE SHOOTER';

  constructor(private root: HTMLElement, private action: (name: string) => void, private browse: (direction: number) => void) {
    root.innerHTML = `
      <main class="game-shell">
        <div id="viewport" class="viewport"></div>
        <div class="hud">
          <section class="hud-panel sector-panel"><div id="stageLabel" class="hud-label">JOURNEY</div><div id="sectorName" class="hud-value"></div><div id="reputation" class="hud-small"></div></section>
          <section class="hud-panel mission-panel"><div id="missionTitle" class="hud-value"></div><div id="missionProgress" class="hud-small"></div><div id="levelTimer" class="hud-small level-timer"><span id="levelClock"></span><span id="timeBonusReadout"></span></div></section>
          <section class="hud-panel cargo-panel"><div class="hud-label">SCORE</div><div id="scoreReadout" class="hud-value">000000</div><div id="creditReadout" class="hud-small"></div><div id="cargoReadout" class="hud-small"></div></section>
          <div id="reticle" class="reticle"><span></span><span></span><span></span><span></span></div>
          <div id="hitConfirm" class="hit-confirm">+</div>
          <div id="objectiveArrow" class="objective-arrow"></div>
          <div id="threatArrow" class="threat-arrow"></div>
          <div id="hitCallout" class="hit-callout"></div><div id="wantedBanner" class="wanted-banner">WANTED</div>
          <div id="messageLog" class="message-log"></div><div id="scorePopup" class="score-popup"></div>
          <canvas id="radar" class="radar" width="180" height="180" aria-label="Ship-relative 3D radar: contacts above or below the flight plane have vertical height lines"></canvas>
          <div class="bottom-strip"><div><span class="hud-label">HULL</span><strong id="hullReadout"></strong></div><div><span class="hud-label">SHIELD</span><strong id="shieldReadout"></strong></div><div><span class="hud-label">WEAPON</span><strong id="weaponReadout"></strong></div><div><span id="speedLabel" class="hud-label">THROTTLE</span><strong id="speedReadout"></strong></div></div>
          <div class="arcade-strip"><span id="livesReadout"></span><span id="chainReadout"></span><span id="chargeReadout"></span></div>
        </div>
        <div class="flight-buttons">${button('pause', '||', 'id="pauseButton" aria-label="Pause" title="Pause (Esc or hold wheel click)"')}${button('exitBonus', 'EXIT BONUS', 'id="bonusExitButton" hidden')}${button('nextWave', 'NEXT WAVE', 'id="nextWaveButton" hidden')}</div>
        <div id="damageLayer" class="damage-layer"></div><div id="protectionLayer" class="protection-layer" hidden></div><div id="warpLayer" class="warp-layer"></div>
        <div id="launchOverlay" class="launch-overlay">
          <div class="arcade-menu">
            <header class="arcade-header"><div class="arcade-scores"><span>1UP <strong id="arcadeScore">000000</strong></span><span>HI SCORE <strong id="arcadeBest">000000</strong></span></div><h1 id="launchTitle" class="screen-reader-only">3D VECTOR SPACE SHOOTER</h1><canvas id="vectorTitle" class="vector-title" aria-hidden="true"></canvas><p id="briefingStatus" class="briefing-status"></p></header>
            <div class="menu-layout"><div id="screenContent"></div>
              <section id="modePreviewSection" class="mode-preview-section" aria-label="Selected mode preview"><div id="modeDemo" class="mode-demo"></div><h2 id="modePreviewName"></h2><p id="modePreviewTagline"></p></section>
              <section id="catalogSection" class="model-card" aria-label="Ships and objects"><div class="model-kicker"><p class="briefing-status">SHIPS &amp; OBJECTS</p><p id="modelCount"></p></div><div id="modelPreview" class="model-preview"></div><div class="model-copy"><h2 id="modelTitle"></h2><p id="modelDescription"></p></div><div class="scan-buttons">${button('scanPrevious', '<', 'aria-label="Previous object" title="Previous object"')}${button('scanNext', '>', 'aria-label="Next object" title="Next object"')}</div><p class="scan-hint"><span>LEFT / RIGHT</span> Browse ships &amp; objects</p></section>
            </div>
          </div>
        </div>
      </main>`;
    this.viewport = root.querySelector('#viewport')!;
    this.overlay = root.querySelector('#launchOverlay')!;
    this.radar = root.querySelector('#radar')!;
    root.addEventListener('click', this.click);
    window.addEventListener('keydown', this.keydown);
  }

  private click = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    if (!target || target.disabled) return;
    if (target.dataset.action === 'scanPrevious') this.browse(-1);
    else if (target.dataset.action === 'scanNext') this.browse(1);
    else this.action(target.dataset.action!);
  };

  private keydown = (event: KeyboardEvent): void => {
    if (this.overlay.hidden || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    if (event.code === 'Tab') {
      const items = this.focusable();
      const target = event.shiftKey ? items.at(-1) : items[0];
      if (document.activeElement === (event.shiftKey ? items[0] : items.at(-1))) {
        event.preventDefault(); target?.focus();
      }
    }
    if (!['objects', 'briefing'].includes(this.screen)) return;
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault(); this.browse(event.code === 'ArrowLeft' ? -1 : 1);
    }
  };

  private focusable(): HTMLElement[] {
    // Visibility is a DOM/style property here, not a measurement of element size.
    // Check ancestors too: hidden preview controls must not enter the focus loop.
    return [...this.overlay.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled)')]
      .filter(item => {
        for (let node: HTMLElement | null = item; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (node.hidden || node.inert || style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return true;
      });
  }

  text(id: string, value: string): void {
    const element = this.root.querySelector('#' + id);
    if (element && element.textContent !== value) element.textContent = value;
  }

  show(screen: string, title: string, status: string, content: string): void {
    // Rebuilding a settings/shop view keeps the selected action when still usable.
    const previousAction = this.screen === screen && document.activeElement instanceof HTMLElement ? document.activeElement.dataset.action : undefined;
    this.screen = screen; this.title = title;
    this.overlay.hidden = false;
    this.overlay.classList.remove('hidden');
    this.overlay.dataset.mode = screen; this.overlay.scrollTop = 0;
    this.text('launchTitle', title); this.text('briefingStatus', status);
    this.root.querySelector('#screenContent')!.innerHTML = content;
    const catalog = this.root.querySelector<HTMLElement>('#catalogSection')!;
    catalog.hidden = screen !== 'objects' && screen !== 'briefing';
    this.root.querySelector<HTMLElement>('#modePreviewSection')!.hidden = screen !== 'title';
    this.overlay.classList.toggle('compact-menu', catalog.hidden && screen !== 'title');
    this.root.querySelector<HTMLElement>('.flight-buttons')!.inert = true;
    const items = this.focusable();
    const focus = items.find(item => previousAction !== undefined && item.dataset.action === previousAction)
      ?? items.find(item => item.id === 'resumeButton' || item.id === 'launchButton') ?? items[0];
    focus?.focus({ preventScroll: true });
  }

  hide(): void {
    this.overlay.hidden = true; this.overlay.classList.add('hidden');
    this.root.querySelector<HTMLElement>('.flight-buttons')!.inert = false;
  }

  dispose(): void {
    this.root.removeEventListener('click', this.click);
    window.removeEventListener('keydown', this.keydown);
  }
}
