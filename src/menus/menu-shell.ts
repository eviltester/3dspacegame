/**
 * DOM-only menu shell. Rendering and game rules live elsewhere so navigation,
 * disabled actions and focus can be exercised without a GPU or running a game.
 */
import type { MenuPreview } from './views';
import { informationTabs, TITLE_TABS, type TitleTab } from './information-tabs';
export const button = (action: string, label: string, extra = '') => `<button type="button" data-action="${action}" ${extra}>${label}</button>`;

export class MenuShell {
  readonly viewport: HTMLDivElement;
  readonly overlay: HTMLDivElement;
  readonly radar: HTMLCanvasElement;
  screen = 'title';
  titleTab: TitleTab = 'game';
  title = '3D VECTOR SPACE SHOOTER';

  constructor(private root: HTMLElement, private action: (name: string) => void, private browse: (direction: number) => void) {
    root.innerHTML = `
      <main class="game-shell">
        <div id="viewport" class="viewport"></div>
        <div class="hud">
          <section class="hud-panel sector-panel"><div id="stageLabel" class="hud-label">JOURNEY</div><div id="sectorName" class="hud-value"></div><div id="reputation" class="hud-small"></div></section>
          <section class="hud-panel mission-panel"><div id="missionTitle" class="hud-value"></div><div id="missionProgress" class="hud-small"></div><div id="levelTimer" class="hud-small level-timer"><span id="levelClock"></span><span id="timeBonusReadout"></span></div></section>
          <div class="flight-status">
            <section class="hud-panel cargo-panel"><div class="hud-label">SCORE</div><div id="scoreReadout" class="hud-value">000000</div><div id="creditReadout" class="hud-small"></div><div id="cargoReadout" class="hud-small"></div></section>
            <section id="survivalStats" class="survival-stats" aria-label="Craft condition" hidden><div><span>LIVES</span><strong id="topLives"></strong></div><div><span>SHIELD</span><strong id="topShield"></strong></div><div id="topDamageStat"><span>DAMAGE</span><strong id="topDamage"></strong></div></section>
            <div class="bottom-strip"><div><span id="hullLabel" class="hud-label">HULL</span><strong id="hullReadout"></strong><span id="skiffDamage" hidden><span id="damageReadout"></span></span></div><div><span class="hud-label">SHIELD</span><strong id="shieldReadout"></strong></div><div><span class="hud-label">WEAPON</span><strong id="weaponReadout"></strong></div><div><span id="speedLabel" class="hud-label">THROTTLE</span><strong id="speedReadout"></strong></div></div>
            <div class="arcade-strip"><span id="livesReadout"></span><span id="chainReadout"></span><span id="chargeReadout"></span></div>
          </div>
          <div id="reticle" class="reticle"><span></span><span></span><span></span><span></span></div>
          <div id="hitConfirm" class="hit-confirm">+</div>
          <div id="objectiveArrow" class="objective-arrow"></div>
          <div id="threatArrow" class="threat-arrow"></div>
          <div id="hitCallout" class="hit-callout"></div><div id="wantedBanner" class="wanted-banner">WANTED</div>
          <div id="messageLog" class="message-log"></div><div id="scorePopup" class="score-popup"></div>
          <canvas id="radar" class="radar" width="180" height="180" aria-label="Ship-relative 3D radar: contacts above or below the flight plane have vertical height lines"></canvas>
        </div>
        <div class="flight-buttons">${button('pause', '||', 'id="pauseButton" aria-label="Pause" title="Pause"')}${button('exitBonus', 'EXIT BONUS', 'id="bonusExitButton" hidden')}${button('nextWave', 'NEXT WAVE', 'id="nextWaveButton" hidden')}
          <div id="touchTools" class="touch-tools" role="group" aria-label="Touch flight controls" hidden>
            ${button('centreTilt', '&#8982;', 'id="touchCentre" aria-label="Centre tilt" title="Centre tilt"')}
            ${button('touchBoost', '&#187;', 'id="touchBoost" aria-label="Boost" title="Boost"')}
            <span id="touchThrottle">${button('throttleDown', '-', 'aria-label="Decrease throttle" title="Decrease throttle"')}${button('throttleUp', '+', 'aria-label="Increase throttle" title="Increase throttle"')}</span>
          </div>
        </div>
        <section id="courseSummary" class="course-summary" role="status" aria-label="Level complete" hidden><h2 id="courseHeading">LEVEL COMPLETE</h2><p id="courseHaul" hidden></p><p id="courseAwards" hidden></p><p id="courseScore"></p><p id="courseLives"></p><p id="courseCondition" hidden></p><p id="courseNext"></p></section>
        <section id="lifeLost" class="life-lost-screen" role="status" hidden><h2 id="lifeLostHeading">LIFE LOST</h2><p id="lifeLostLives"></p><p id="lifeLostCountdown"></p></section>
        <div id="damageLayer" class="damage-layer"></div><div id="protectionLayer" class="protection-layer" hidden></div><div id="warpLayer" class="warp-layer"></div>
        <div id="launchOverlay" class="launch-overlay">
          <div class="arcade-menu">
            <header class="arcade-header"><div class="arcade-scores"><span>1UP <strong id="arcadeScore">000000</strong></span><span>HI SCORE <strong id="arcadeBest">000000</strong></span></div><h1 id="launchTitle" class="screen-reader-only">3D VECTOR SPACE SHOOTER</h1><canvas id="vectorTitle" class="vector-title" aria-hidden="true"></canvas><p id="briefingStatus" class="briefing-status"></p></header>
            <div class="menu-layout"><div id="screenContent"></div>
              <section id="modePreviewSection" class="mode-preview-section" aria-label="Selected mode preview">
                ${informationTabs()}
                <div class="title-panels">${TITLE_TABS.map(tab => `<div id="title-panel-${tab}" class="title-panel" role="tabpanel" aria-labelledby="title-tab-${tab}" ${tab === 'game' ? '' : 'hidden'}>${tab === 'game' ? '<div id="titleModePreview"><div id="modePreviewCopy"></div><div id="modeDemo" class="mode-demo"></div></div><div id="titleGameLoadout"></div><div id="weaponPreviewCopy"></div><div id="titleGameActions"></div>' : ''}</div>`).join('')}</div>
              </section>
              <section id="catalogSection" class="model-card" aria-label="Info Deck"><div class="model-kicker"><p class="briefing-status">INFO DECK</p><p id="modelCount"></p></div><div id="modelPreview" class="model-preview"></div><div class="model-copy"><h2 id="modelTitle"></h2><p id="modelDescription"></p></div><div class="scan-buttons">${button('scanPrevious', '<', 'aria-label="Previous object" title="Previous object"')}${button('scanNext', '>', 'aria-label="Next object" title="Next object"')}</div><p class="scan-hint"><span>LEFT / RIGHT</span> Browse entries</p></section>
            </div>
          </div>
        </div>
      </main>`;
    this.viewport = root.querySelector('#viewport')!;
    this.overlay = root.querySelector('#launchOverlay')!;
    this.radar = root.querySelector('#radar')!;
    for (const panel of root.querySelectorAll<HTMLElement>('.title-panel')) panel.tabIndex = 0;
    root.querySelector('#title-panel-objects')!.append(root.querySelector('#catalogSection')!);
    root.addEventListener('click', this.click);
    root.addEventListener('submit', this.submit);
    window.addEventListener('keydown', this.keydown);
  }

  private click = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    if (!target || target.disabled || target.closest('[hidden], [inert]') || this.overlay.hidden && this.overlay.contains(target)) return;
    if (target.dataset.action === 'scanPrevious') this.browse(-1);
    else if (target.dataset.action === 'scanNext') this.browse(1);
    else this.action(target.dataset.action!);
  };

  private submit = (event: SubmitEvent): void => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.submitAction) return;
    event.preventDefault();
    if (!this.overlay.hidden && form.reportValidity()) this.action(form.dataset.submitAction);
  };

  private keydown = (event: KeyboardEvent): void => {
    if (this.overlay.hidden || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    if (event.code === 'Escape' && this.screen === 'title' && this.titleTab !== 'game') {
      event.preventDefault();
      if (!event.repeat) { this.action('game'); this.root.querySelector<HTMLElement>('#title-tab-game')!.focus(); }
      return;
    }
    if (event.code === 'Escape' && ['controls', 'briefing', 'gameover'].includes(this.screen)) {
      event.preventDefault();
      // Use the displayed exit action so Controls can return to either the
      // title or the paused flight without duplicating navigation decisions.
      if (!event.repeat) {
        if (this.screen === 'briefing') this.action('title');
        else this.focusable().find(item => item.dataset.action === 'backToPause' || item.dataset.action === 'title')?.click();
      }
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) {
      event.preventDefault();
      const index = TITLE_TABS.indexOf(this.titleTab);
      const next = event.code === 'Home' ? 0 : event.code === 'End' ? TITLE_TABS.length - 1
        : (index + (event.code === 'ArrowRight' ? 1 : -1) + TITLE_TABS.length) % TITLE_TABS.length;
      this.action(TITLE_TABS[next]);
      this.root.querySelector<HTMLElement>(`#title-tab-${TITLE_TABS[next]}`)!.focus();
      return;
    }
    // Keep native arrows and letter keys in settings/Level Warp fields. Buttons
    // use the same visible focus order for arrow navigation and normal Tab.
    const editing = active instanceof HTMLElement && (active.matches('input, select, textarea, [role="tabpanel"]') || active.isContentEditable);
    if (!editing && (event.code === 'ArrowUp' || event.code === 'ArrowDown')) {
      event.preventDefault();
      const items = this.focusable().filter(item => item.getAttribute('role') !== 'tabpanel');
      const direction = event.code === 'ArrowDown' ? 1 : -1;
      const index = items.findIndex(item => item === active);
      const next = index < 0 ? direction > 0 ? 0 : items.length - 1 : (index + direction + items.length) % items.length;
      items[next]?.focus();
      return;
    }
    if (!editing && ['Enter', 'NumpadEnter', 'Space', 'KeyJ', 'KeyZ'].includes(event.code)) {
      // Prevent native Enter/Space activation as well, so a rebuilding menu
      // receives exactly one click and a held key cannot launch several screens.
      event.preventDefault();
      if (!event.repeat && active instanceof HTMLButtonElement && this.focusable().includes(active)) active.click();
      return;
    }
    if (event.code === 'Tab') {
      const items = this.focusable();
      const target = event.shiftKey ? items.at(-1) : items[0];
      if (document.activeElement === (event.shiftKey ? items[0] : items.at(-1))) {
        event.preventDefault(); target?.focus();
      }
    }
    if (editing || this.screen !== 'title' || this.titleTab !== 'objects') return;
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault(); this.browse(event.code === 'ArrowLeft' ? -1 : 1);
    }
  };

  private focusable(): HTMLElement[] {
    // Visibility is a DOM/style property here, not a measurement of element size.
    // Check ancestors too: hidden preview controls must not enter the focus loop.
    return [...this.overlay.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), [role="tabpanel"]')]
      .filter(item => {
        if (item.getAttribute('role') === 'tab' && item.tabIndex < 0) return false;
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

  /** Switching tabs retains panel DOM, scroll positions and the live preview canvas. */
  selectTitleTab(tab: TitleTab): void {
    if (this.screen !== 'title') return;
    this.titleTab = tab;
    this.overlay.dataset.tab = tab;
    for (const name of TITLE_TABS) {
      const selected = name === tab;
      const button = this.root.querySelector<HTMLButtonElement>(`#title-tab-${name}`)!;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      const panel = this.root.querySelector<HTMLElement>(`#title-panel-${name}`)!;
      panel.hidden = !selected;
      panel.tabIndex = selected ? 0 : -1;
    }
    this.root.querySelector<HTMLElement>('#catalogSection')!.hidden = tab !== 'objects';
    if (document.activeElement instanceof HTMLElement && document.activeElement.closest('.title-panel[hidden]')) {
      this.root.querySelector<HTMLElement>(`#title-tab-${tab}`)!.focus({ preventScroll: true });
    }
  }

  show(screen: string, title: string, status: string, content: string, preview?: MenuPreview): void {
    // Rebuilding a settings/shop view keeps the selected action when still usable.
    const previousAction = this.screen === screen && document.activeElement instanceof HTMLElement ? document.activeElement.dataset.action : undefined;
    if (this.screen !== screen) this.overlay.scrollTop = 0;
    this.screen = screen; this.title = title;
    this.overlay.hidden = false;
    this.overlay.classList.remove('hidden');
    this.overlay.dataset.mode = screen;
    this.text('launchTitle', title); this.text('briefingStatus', status);
    this.root.querySelector('#screenContent')!.innerHTML = content;
    this.root.querySelector('#modePreviewCopy')!.innerHTML = preview?.mode ?? '';
    this.root.querySelector('#weaponPreviewCopy')!.innerHTML = preview?.weapon ?? '';
    for (const [id, content] of Object.entries({
      titleGameLoadout: preview?.loadout, titleGameActions: preview?.actions,
      'title-panel-instructions': preview?.instructions, 'title-panel-controls': preview?.controls,
      'title-panel-scores': preview?.scores
    })) this.root.querySelector(`#${id}`)!.innerHTML = content ?? '';
    const catalog = this.root.querySelector<HTMLElement>('#catalogSection')!;
    catalog.hidden = true;
    this.root.querySelector<HTMLElement>('#modePreviewSection')!.hidden = screen !== 'title' || !preview;
    if (screen === 'title') this.selectTitleTab(preview?.tab ?? 'game');
    this.overlay.classList.toggle('compact-menu', catalog.hidden && screen !== 'title');
    this.root.querySelector<HTMLElement>('.flight-buttons')!.inert = true;
    const items = this.focusable();
    const focus = items.find(item => previousAction !== undefined && item.dataset.action === previousAction)
      ?? items.find(item => item.id === 'scoreInitials')
      ?? items.find(item => screen === 'title' && this.titleTab !== 'game' && item.id === `title-tab-${this.titleTab}`)
      ?? items.find(item => item.id === 'resumeButton' || item.id === 'launchButton') ?? items[0];
    focus?.focus({ preventScroll: true });
  }

  hide(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.overlay.contains(active)) active.blur();
    this.overlay.hidden = true; this.overlay.classList.add('hidden');
    this.root.querySelector<HTMLElement>('.flight-buttons')!.inert = false;
  }

  dispose(): void {
    this.root.removeEventListener('click', this.click);
    this.root.removeEventListener('submit', this.submit);
    window.removeEventListener('keydown', this.keydown);
  }
}
