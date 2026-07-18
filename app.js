/* ================================================================
   Semafor App — app.js
   ================================================================
   Obsah:
   1. Konstanty a datové modely (AppState, Mode, AUDIO_CONFIG)
   2. TrafficLight — DOM controller semaforu
   3. CountdownTimer — třísekundový odpočet
   4. AudioEngine — Web Audio API wrapper
   5. ModeManager — správa provozního režimu
   6. AppController — hlavní orchestrátor (stavový automat)
   7. Inicializace aplikace (DOMContentLoaded)
   ================================================================ */

'use strict';


/* ================================================================
   1. Konstanty a datové modely
   ================================================================ */

/** Stavy stavového automatu semaforu */
const AppState = Object.freeze({
  RED:        'RED',
  COUNTING_3: 'COUNTING_3',
  COUNTING_2: 'COUNTING_2',
  COUNTING_1: 'COUNTING_1',
  GREEN:      'GREEN',
});

/** Provozní režimy */
const Mode = Object.freeze({
  START:  'start',   // Startovací_Režim — odpočítávání + zvuky
  TOGGLE: 'toggle',  // Přepínací_Režim — okamžité přepínání
});

/** Konfigurace zvuků */
const AUDIO_CONFIG = Object.freeze({
  shortBeep: { frequency: 880, duration: 0.25, type: 'sine' },
  longBeep:  { frequency: 660, duration: 0.90, type: 'sine' },
});

/** ARIA popisky pro každou kombinaci stav × režim */
const ARIA_LABELS = Object.freeze({
  [AppState.RED]: {
    [Mode.START]:  'Červená. Klepněte pro spuštění odpočítávání.',
    [Mode.TOGGLE]: 'Červená. Klepněte pro přepnutí na zelenou.',
  },
  [AppState.COUNTING_3]: 'Odpočítávání: 3',
  [AppState.COUNTING_2]: 'Odpočítávání: 2',
  [AppState.COUNTING_1]: 'Odpočítávání: 1',
  [AppState.GREEN]: {
    [Mode.START]:  'Zelená! Klepněte pro reset na červenou.',
    [Mode.TOGGLE]: 'Zelená. Klepněte pro přepnutí na červenou.',
  },
});


/* ================================================================
   2. TrafficLight — DOM controller
   ================================================================ */

/**
 * Vrátí ARIA popisek odpovídající danému stavu a režimu.
 * @param {string} state  - hodnota z AppState
 * @param {string} mode   - hodnota z Mode
 * @returns {string}
 */
function getAriaLabel(state, mode) {
  const entry = ARIA_LABELS[state];
  if (typeof entry === 'string') {
    // stavem COUNTING_* nemají závislost na režimu
    return entry;
  }
  if (entry && mode) {
    return entry[mode] ?? '';
  }
  return '';
}

class TrafficLight {
  /**
   * @param {HTMLElement} element - odkaz na element #semaphore
   */
  constructor(element) {
    this._el = element;
    this._countdown = document.getElementById('countdown');
  }

  /**
   * Nastaví CSS třídu semaforu a aktualizuje ARIA atributy.
   * @param {string} state - hodnota z AppState
   * @param {string} mode  - hodnota z Mode
   */
  setState(state, mode) {
    // Odstranit staré stavové třídy
    this._el.classList.remove('state-red', 'state-green');

    // Přidat správnou třídu dle stavu
    // CSS pravidla state-red / state-green rozsvítí správné světlo
    if (state === AppState.GREEN) {
      this._el.classList.add('state-green');
    } else {
      // RED i všechny COUNTING_* stavy zobrazují červenou
      this._el.classList.add('state-red');
    }

    // Aktualizovat aria-label
    const label = getAriaLabel(state, mode);
    this._el.setAttribute('aria-label', label);

    // Pomocný atribut pro debugging / testování
    this._el.dataset.state = state;
  }

  /**
   * Zobrazí nebo skryje číslo odpočtu překrývající semafor.
   * @param {number|null} n - číslo k zobrazení, nebo null pro skrytí
   */
  showCountdown(n) {
    if (n !== null && n !== undefined) {
      this._countdown.textContent = String(n);
      this._countdown.removeAttribute('aria-hidden');
    } else {
      this._countdown.textContent = '';
      this._countdown.setAttribute('aria-hidden', 'true');
    }
  }
}


/* ================================================================
   3. CountdownTimer
   ================================================================ */

class CountdownTimer {
  constructor() {
    this._handles = [];
    this._running = false;
  }

  /**
   * Spustí odpočet. Cascade tří setTimeout (1000, 2000, 3000 ms).
   * Okamžitě volá onTick(3), poté onTick(2) po 1 s, onTick(1) po 2 s,
   * onComplete() po 3 s.
   * Pokud již běží, předchozí timer se zruší.
   * @param {(n: number) => void} onTick
   * @param {() => void} onComplete
   */
  start(onTick, onComplete) {
    if (this._running) {
      this.cancel();
    }
    this._running = true;

    // t=0: okamžité volání onTick(3)
    onTick(3);

    this._handles.push(
      setTimeout(() => { onTick(2); },    1000),
      setTimeout(() => { onTick(1); },    2000),
      setTimeout(() => {
        this._running = false;
        this._handles = [];
        onComplete();
      }, 3000),
    );
  }

  /**
   * Zruší všechny naplánované callbacky a zastaví odpočet.
   */
  cancel() {
    this._handles.forEach(h => clearTimeout(h));
    this._handles = [];
    this._running = false;
  }

  /** @returns {boolean} true pokud odpočet právě běží */
  get isRunning() {
    return this._running;
  }
}


/* ================================================================
   4. AudioEngine
   ================================================================ */

class AudioEngine {
  constructor() {
    this._audioContext = null;
    this._isAvailable = true;
    this._noticeShown = false;
  }

  /**
   * Inicializuje AudioContext. Musí být voláno v reakci na uživatelskou
   * interakci (požadavek mobilních prohlížečů).
   * Pokud Web Audio API není dostupné, nastaví _isAvailable = false
   * a zobrazí jednorázovou informační zprávu v DOM.
   */
  initialize() {
    if (this._audioContext) {
      // Již inicializováno — nic neděláme
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;

    if (!AudioCtx) {
      this._isAvailable = false;
      this._showUnavailableNotice();
      return;
    }

    try {
      this._audioContext = new AudioCtx();
    } catch (e) {
      this._isAvailable = false;
      this._showUnavailableNotice();
    }
  }

  /**
   * Přehraje krátké pípnutí (880 Hz, 0.25 s, sine).
   * Před přehráváním zkontroluje stav AudioContext — pokud je suspended, zavolá resume().
   */
  playShortBeep() {
    const { frequency, duration, type } = AUDIO_CONFIG.shortBeep;
    this._playBeep(frequency, duration, type);
  }

  /**
   * Přehraje dlouhé pípnutí (660 Hz, 0.90 s, sine).
   * Před přehráváním zkontroluje stav AudioContext — pokud je suspended, zavolá resume().
   */
  playLongBeep() {
    const { frequency, duration, type } = AUDIO_CONFIG.longBeep;
    this._playBeep(frequency, duration, type);
  }

  /**
   * @returns {boolean} false pokud Web Audio API není dostupné
   */
  get isAvailable() {
    return this._isAvailable;
  }

  // ---- Privátní metody ----

  /**
   * Interní metoda pro přehrání tónu zadané frekvence a délky.
   * Tiché selhání pokud AudioEngine není dostupný.
   * @param {number} frequency  - frekvence v Hz
   * @param {number} duration   - délka v sekundách
   * @param {string} type       - typ oscilátoru (např. 'sine')
   */
  async _playBeep(frequency, duration, type) {
    if (!this._isAvailable || !this._audioContext) {
      return;
    }

    try {
      // Obnovit pozastavený kontext (iOS vyžaduje resume po první interakci)
      if (this._audioContext.state === 'suspended') {
        await this._audioContext.resume();
      }

      const ctx = this._audioContext;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

      // Plynulé ztlumení (gain ramp) ke konci tónu — eliminuje praskání
      gainNode.gain.setValueAtTime(1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (e) {
      // Tiché selhání — zvuk se přeskočí, aplikace pokračuje
    }
  }

  /**
   * Zobrazí jednorázovou informační zprávu v DOM, že zvuky nejsou dostupné.
   */
  _showUnavailableNotice() {
    if (this._noticeShown) {
      return;
    }
    this._noticeShown = true;

    const notice = document.createElement('div');
    notice.id = 'audio-unavailable-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.textContent = 'Zvuky nejsou na tomto zařízení k dispozici.';

    // Vložit do body pokud je DOM dostupný
    if (document.body) {
      document.body.appendChild(notice);
    }
  }
}


/* ================================================================
   5. ModeManager
   ================================================================ */

class ModeManager {
  /**
   * @param {HTMLInputElement} toggleElement - odkaz na element #mode-switch (checkbox)
   * @param {(mode: string) => void} onModeChange - callback volaný při změně režimu
   */
  constructor(toggleElement, onModeChange) {
    this._toggle = toggleElement;
    this._onModeChange = onModeChange;
    this._currentMode = Mode.START;

    // Nastavit výchozí stav checkboxu
    this._toggle.checked = false;

    // Poslouchat změny přepínače
    this._toggle.addEventListener('change', () => {
      this.setMode(this._toggle.checked ? Mode.TOGGLE : Mode.START);
    });
  }

  /** @returns {'start' | 'toggle'} aktuální provozní režim */
  get currentMode() {
    return this._currentMode;
  }

  /**
   * Nastaví provozní režim, aktualizuje UI a zavolá callback.
   * @param {'start' | 'toggle'} mode - nový režim (Mode.START nebo Mode.TOGGLE)
   */
  setMode(mode) {
    this._currentMode = mode;

    // Synchronizovat stav checkboxu s režimem
    this._toggle.checked = (mode === Mode.TOGGLE);

    // Aktualizovat aria-checked pro přístupnost (role="switch")
    this._toggle.setAttribute('aria-checked', mode === Mode.TOGGLE ? 'true' : 'false');

    // Zavolat callback s novým režimem
    this._onModeChange(mode);
  }
}


/* ================================================================
   6. AppController — hlavní orchestrátor
   ================================================================ */

class AppController {
  /**
   * @param {TrafficLight} light       - DOM controller semaforu
   * @param {CountdownTimer} timer     - třísekundový odpočet
   * @param {AudioEngine} audio        - Web Audio API wrapper
   * @param {ModeManager} mode         - správa provozního režimu
   */
  constructor(light, timer, audio, mode) {
    this._light = light;
    this._timer = timer;
    this._audio = audio;
    this._mode  = mode;

    // Výchozí stav — vždy začínáme na červené
    this._state = AppState.RED;
    this._light.setState(AppState.RED, this._mode.currentMode);
  }

  /**
   * Vstupní bod pro interakci uživatele (touch / click na semafor).
   * Větví logiku dle aktuálního provozního režimu.
   */
  handleTouch() {
    // Inicializovat AudioEngine při první interakci (požadavek mobilních prohlížečů)
    this._audio.initialize();

    if (this._mode.currentMode === Mode.START) {
      this._handleTouchStart();
    } else {
      this._handleTouchToggle();
    }
  }

  /**
   * Přechodová logika pro Startovací_Režim.
   * @private
   */
  _handleTouchStart() {
    switch (this._state) {
      case AppState.RED:
        // RED + touch → spustit odpočítávání, přejít do COUNTING_3
        this._timer.start(
          (n) => this._onTick(n),
          ()  => this._onComplete(),
        );
        this._setState(AppState.COUNTING_3);
        this._light.showCountdown(3);
        this._audio.playShortBeep();
        break;

      case AppState.COUNTING_3:
      case AppState.COUNTING_2:
      case AppState.COUNTING_1:
        // Odpočítávání probíhá — ignorovat dotyk (Req 4.4)
        break;

      case AppState.GREEN:
        // GREEN + touch → reset na červenou, zrušit timer, skrýt countdown
        this._timer.cancel();
        this._setState(AppState.RED);
        this._light.showCountdown(null);
        break;

      default:
        break;
    }
  }

  /**
   * Přechodová logika pro Přepínací_Režim.
   * RED → GREEN, GREEN → RED. Bez zvuků, bez timeru.
   * @private
   */
  _handleTouchToggle() {
    switch (this._state) {
      case AppState.RED:
        // RED + touch → okamžitě přepnout na zelenou (bez zvuku, bez timeru)
        this._setState(AppState.GREEN);
        break;

      case AppState.GREEN:
        // GREEN + touch → okamžitě přepnout na červenou (bez zvuku)
        this._setState(AppState.RED);
        break;

      default:
        break;
    }
  }

  /**
   * Callback volaný CountdownTimerem každou sekundu.
   * @param {number} n - zbývající sekundy (3, 2, 1)
   * @private
   */
  _onTick(n) {
    // Aktualizovat stav a zobrazit číslo odpočtu
    switch (n) {
      case 3:
        // Stav COUNTING_3 je nastaven již při spuštění timeru v _handleTouchStart;
        // onTick(3) je volán okamžitě při startu — synchronizujeme pro konzistenci.
        this._setState(AppState.COUNTING_3);
        break;
      case 2:
        this._setState(AppState.COUNTING_2);
        break;
      case 1:
        this._setState(AppState.COUNTING_1);
        break;
      default:
        break;
    }
    this._light.showCountdown(n);
    this._audio.playShortBeep();
  }

  /**
   * Callback volaný CountdownTimerem po uplynutí 3 sekund.
   * @private
   */
  _onComplete() {
    this._setState(AppState.GREEN);
    this._light.showCountdown(null);
    this._audio.playLongBeep();
  }

  /**
   * Přejde do výchozího stavu — RED, zruší timer, skryje odpočet.
   * Voláno např. při přepnutí režimu.
   */
  resetToDefault() {
    this._timer.cancel();
    this._setState(AppState.RED);
    this._light.showCountdown(null);
  }

  /**
   * Interní setter stavu — aktualizuje _state a volá light.setState().
   * @param {string} newState - hodnota z AppState
   * @private
   */
  _setState(newState) {
    this._state = newState;
    this._light.setState(newState, this._mode.currentMode);
  }

  /** @returns {string} aktuální stav stavového automatu (hodnota z AppState) */
  get state() {
    return this._state;
  }
}


/* ================================================================
   7. Inicializace aplikace
   ================================================================ */

/**
 * Pokusí se aktivovat fullscreen režim pro daný element.
 * Obaleno try/catch — při selhání tichý fallback na CSS 100dvh.
 * @param {HTMLElement} element
 */
async function requestFullscreen(element) {
  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      await element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
      await element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
      await element.msRequestFullscreen();
    }
    // If none available, CSS 100dvh fallback is already in place
  } catch (e) {
    // Silent fallback — CSS 100dvh handles the layout
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const semaphoreEl = document.getElementById('semaphore');
  const modeSwitchEl = document.getElementById('mode-switch');

  const light = new TrafficLight(semaphoreEl);
  const timer = new CountdownTimer();
  const audio = new AudioEngine();
  const mode  = new ModeManager(modeSwitchEl, (newMode) => {
    ctrl.resetToDefault();
  });
  const ctrl = new AppController(light, timer, audio, mode);

  // Attach touch/click handler
  // Používáme touchend + preventDefault() aby se nevygeneroval následný click.
  // Na desktopu (žádný touch) funguje click normálně.

  function handleInteraction(e) {
    if (e.target.closest('#mode-toggle-container')) return;
    audio.initialize();
    requestFullscreen(document.documentElement);
    ctrl.handleTouch();
  }

  semaphoreEl.addEventListener('touchend', (e) => {
    if (e.target.closest('#mode-toggle-container')) return;
    e.preventDefault(); // zabrání následnému click eventu
    handleInteraction(e);
  });

  semaphoreEl.addEventListener('click', handleInteraction);

  // Suppress context menu on long press
  semaphoreEl.addEventListener('contextmenu', (e) => e.preventDefault());

  // Suppress touchmove (prevents scroll/pull-to-refresh while touching semaphore)
  semaphoreEl.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // Keyboard accessibility (Enter and Space keys)
  semaphoreEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      ctrl.handleTouch();
    }
  });
});

// Service Worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then((registration) => {
        // Registration successful
      })
      .catch((error) => {
        // Registration failed — app works without offline support
        console.warn('Service Worker registration failed:', error);
      });
  });
}
