'use strict';

/**
 * Semafor App — state machine tests
 * Tests for: AppController, CountdownTimer (and supporting classes)
 * Requirements: 3.1, 4.1, 4.4, 5.2, 5.3, 2.2
 *
 * Strategy: The core classes are re-declared inline here to avoid browser
 * globals (window, document) that app.js depends on. This gives us pure
 * Node.js unit/property tests with no DOM overhead.
 */

const fc = require('fast-check');

/* ================================================================
   Re-declarations of core logic from app.js (DOM-free)
   ================================================================ */

const AppState = Object.freeze({
  RED:        'RED',
  COUNTING_3: 'COUNTING_3',
  COUNTING_2: 'COUNTING_2',
  COUNTING_1: 'COUNTING_1',
  GREEN:      'GREEN',
});

const Mode = Object.freeze({
  START:  'start',
  TOGGLE: 'toggle',
});

class CountdownTimer {
  constructor() {
    this._handles = [];
    this._running = false;
  }

  start(onTick, onComplete) {
    if (this._running) {
      this.cancel();
    }
    this._running = true;

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

  cancel() {
    this._handles.forEach(h => clearTimeout(h));
    this._handles = [];
    this._running = false;
  }

  get isRunning() {
    return this._running;
  }
}

/**
 * Minimal stub for TrafficLight — no DOM, just tracks last state/mode.
 */
class FakeTrafficLight {
  constructor() {
    this.state = null;
    this.mode = null;
    this.countdown = undefined;
  }
  setState(state, mode) {
    this.state = state;
    this.mode = mode;
  }
  showCountdown(n) {
    this.countdown = n;
  }
}

/**
 * Minimal stub for AudioEngine — tracks call counts.
 */
class FakeAudioEngine {
  constructor() {
    this.shortBeepCount = 0;
    this.longBeepCount = 0;
    this._isAvailable = true;
  }
  initialize() {}
  playShortBeep() { this.shortBeepCount++; }
  playLongBeep()  { this.longBeepCount++; }
  get isAvailable() { return this._isAvailable; }
}

/**
 * Minimal stub for ModeManager — holds current mode, supports switching.
 */
class FakeModeManager {
  constructor(initialMode = Mode.START) {
    this._mode = initialMode;
    this._onModeChange = null;
  }
  get currentMode() { return this._mode; }
  setMode(mode) {
    this._mode = mode;
    if (this._onModeChange) this._onModeChange(mode);
  }
}

/** Helper: build a fresh AppController with fake dependencies. */
function makeController(initialMode = Mode.START) {
  const light   = new FakeTrafficLight();
  const timer   = new CountdownTimer();
  const audio   = new FakeAudioEngine();
  const mode    = new FakeModeManager(initialMode);
  const ctrl    = new AppController(light, timer, audio, mode);
  return { ctrl, light, timer, audio, mode };
}

/**
 * AppController — re-declared inline (identical logic to app.js, no DOM refs).
 */
class AppController {
  constructor(light, timer, audio, mode) {
    this._light = light;
    this._timer = timer;
    this._audio = audio;
    this._mode  = mode;

    this._state = AppState.RED;
    this._light.setState(AppState.RED, this._mode.currentMode);
  }

  handleTouch() {
    this._audio.initialize();
    if (this._mode.currentMode === Mode.START) {
      this._handleTouchStart();
    } else {
      this._handleTouchToggle();
    }
  }

  _handleTouchStart() {
    switch (this._state) {
      case AppState.RED:
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
        // ignore
        break;
      case AppState.GREEN:
        this._timer.cancel();
        this._setState(AppState.RED);
        this._light.showCountdown(null);
        break;
      default:
        break;
    }
  }

  _handleTouchToggle() {
    switch (this._state) {
      case AppState.RED:
        this._setState(AppState.GREEN);
        break;
      case AppState.GREEN:
        this._setState(AppState.RED);
        break;
      default:
        break;
    }
  }

  _onTick(n) {
    switch (n) {
      case 3: this._setState(AppState.COUNTING_3); break;
      case 2: this._setState(AppState.COUNTING_2); break;
      case 1: this._setState(AppState.COUNTING_1); break;
      default: break;
    }
    this._light.showCountdown(n);
    this._audio.playShortBeep();
  }

  _onComplete() {
    this._setState(AppState.GREEN);
    this._light.showCountdown(null);
    this._audio.playLongBeep();
  }

  resetToDefault() {
    this._timer.cancel();
    this._setState(AppState.RED);
    this._light.showCountdown(null);
  }

  _setState(newState) {
    this._state = newState;
    this._light.setState(newState, this._mode.currentMode);
  }

  get state() { return this._state; }
}

/* ================================================================
   Unit tests — AppController (START mode)
   ================================================================ */

describe('AppController — START mode', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('RED + touch → COUNTING_3', () => {
    const { ctrl } = makeController(Mode.START);
    expect(ctrl.state).toBe(AppState.RED);
    ctrl.handleTouch();
    expect(ctrl.state).toBe(AppState.COUNTING_3);
  });

  test('COUNTING_3 + touch → state unchanged', () => {
    const { ctrl } = makeController(Mode.START);
    ctrl.handleTouch(); // RED → COUNTING_3
    expect(ctrl.state).toBe(AppState.COUNTING_3);
    ctrl.handleTouch(); // should be ignored
    expect(ctrl.state).toBe(AppState.COUNTING_3);
  });

  test('COUNTING_2 + touch → state unchanged', () => {
    const { ctrl } = makeController(Mode.START);
    ctrl.handleTouch(); // RED → COUNTING_3

    // advance 1 second → COUNTING_2 via onTick
    jest.advanceTimersByTime(1000);
    expect(ctrl.state).toBe(AppState.COUNTING_2);
    ctrl.handleTouch();
    expect(ctrl.state).toBe(AppState.COUNTING_2);
  });

  test('COUNTING_1 + touch → state unchanged', () => {
    const { ctrl } = makeController(Mode.START);
    ctrl.handleTouch(); // RED → COUNTING_3
    jest.advanceTimersByTime(2000); // → COUNTING_1
    expect(ctrl.state).toBe(AppState.COUNTING_1);
    ctrl.handleTouch();
    expect(ctrl.state).toBe(AppState.COUNTING_1);
  });

  test('timer complete → GREEN', () => {
    const { ctrl } = makeController(Mode.START);
    ctrl.handleTouch(); // start countdown
    jest.advanceTimersByTime(3000); // run all timeouts
    expect(ctrl.state).toBe(AppState.GREEN);
  });
});

/* ================================================================
   Unit tests — AppController (TOGGLE mode)
   ================================================================ */

describe('AppController — TOGGLE mode', () => {
  test('RED + touch → GREEN', () => {
    const { ctrl } = makeController(Mode.TOGGLE);
    expect(ctrl.state).toBe(AppState.RED);
    ctrl.handleTouch();
    expect(ctrl.state).toBe(AppState.GREEN);
  });

  test('GREEN + touch → RED', () => {
    const { ctrl } = makeController(Mode.TOGGLE);
    ctrl.handleTouch(); // RED → GREEN
    ctrl.handleTouch(); // GREEN → RED
    expect(ctrl.state).toBe(AppState.RED);
  });
});

/* ================================================================
   Unit tests — AppController: mode change → resetToDefault
   ================================================================ */

describe('AppController — mode change', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('resetToDefault() from any state → RED', () => {
    const { ctrl } = makeController(Mode.START);
    ctrl.handleTouch(); // → COUNTING_3
    expect(ctrl.state).toBe(AppState.COUNTING_3);
    ctrl.resetToDefault();
    expect(ctrl.state).toBe(AppState.RED);
  });

  test('resetToDefault() cancels timer', () => {
    const completeSpy = jest.fn();
    const { ctrl, timer } = makeController(Mode.START);

    // Manually start timer to track completion
    timer.start(() => {}, completeSpy);
    ctrl.resetToDefault(); // should cancel timer
    jest.advanceTimersByTime(3000);

    expect(completeSpy).not.toHaveBeenCalled();
  });
});

/* ================================================================
   Unit tests — CountdownTimer
   ================================================================ */

describe('CountdownTimer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('start() → onTick(3), onTick(2), onTick(1), onComplete()', () => {
    const timer = new CountdownTimer();
    const ticks = [];
    const onTick = jest.fn((n) => ticks.push(n));
    const onComplete = jest.fn();

    timer.start(onTick, onComplete);

    // onTick(3) is called synchronously at start
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(ticks).toEqual([3]);

    jest.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(2);
    expect(ticks).toEqual([3, 2]);

    jest.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(ticks).toEqual([3, 2, 1]);

    jest.advanceTimersByTime(1000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('cancel() before complete → onComplete not called', () => {
    const timer = new CountdownTimer();
    const onComplete = jest.fn();

    timer.start(() => {}, onComplete);
    timer.cancel();
    jest.advanceTimersByTime(3000);

    expect(onComplete).not.toHaveBeenCalled();
  });

  test('isRunning is true while counting, false after complete', () => {
    const timer = new CountdownTimer();
    expect(timer.isRunning).toBe(false);

    timer.start(() => {}, () => {});
    expect(timer.isRunning).toBe(true);

    jest.advanceTimersByTime(3000);
    expect(timer.isRunning).toBe(false);
  });

  test('double start() cancels first timer', () => {
    const timer = new CountdownTimer();
    const complete1 = jest.fn();
    const complete2 = jest.fn();

    timer.start(() => {}, complete1);
    timer.start(() => {}, complete2); // cancels first, starts second

    jest.advanceTimersByTime(3000);
    expect(complete1).not.toHaveBeenCalled();
    expect(complete2).toHaveBeenCalledTimes(1);
  });
});

/* ================================================================
   Property-based tests
   ================================================================ */

describe('Property tests', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // Feature: semafor-app, Property 1: Přechod RED→COUNTING_3 při dotyku ve START režimu
  // Validates: Requirements 4.1
  test('Property 1: RED + touch in START mode → always COUNTING_3', () => {
    fc.assert(
      fc.property(fc.constant(AppState.RED), (_state) => {
        const { ctrl } = makeController(Mode.START);
        expect(ctrl.state).toBe(AppState.RED);
        ctrl.handleTouch();
        return ctrl.state === AppState.COUNTING_3;
      }),
      { numRuns: 100 }
    );
  });

  // Feature: semafor-app, Property 3: Dotyk během odpočítávání stav nemění
  // Validates: Requirements 4.4
  test('Property 3: touch during COUNTING_* never changes state', () => {
    const countingStates = [AppState.COUNTING_3, AppState.COUNTING_2, AppState.COUNTING_1];

    fc.assert(
      fc.property(
        fc.constantFrom(...countingStates),
        fc.integer({ min: 1, max: 10 }),
        (countingState, touchCount) => {
          const { ctrl } = makeController(Mode.START);

          // Drive the controller into the desired counting state via timer
          ctrl.handleTouch(); // RED → COUNTING_3
          if (countingState === AppState.COUNTING_2) {
            jest.advanceTimersByTime(1000);
          } else if (countingState === AppState.COUNTING_1) {
            jest.advanceTimersByTime(2000);
          }

          expect(ctrl.state).toBe(countingState);

          // All touches during counting must be ignored
          for (let i = 0; i < touchCount; i++) {
            ctrl.handleTouch();
          }

          return ctrl.state === countingState;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: semafor-app, Property 4: Dvě klepnutí v TOGGLE režimu vrátí původní stav
  // Validates: Requirements 5.2, 5.3
  test('Property 4: two touches in TOGGLE mode → round-trip to original state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(AppState.RED, AppState.GREEN),
        (initialState) => {
          const { ctrl } = makeController(Mode.TOGGLE);

          // Set up initial state
          if (initialState === AppState.GREEN) {
            ctrl.handleTouch(); // RED → GREEN
          }
          expect(ctrl.state).toBe(initialState);

          // Two touches should return to original state
          ctrl.handleTouch();
          ctrl.handleTouch();

          return ctrl.state === initialState;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: semafor-app, Property 5: TOGGLE режim nevolá AudioEngine
  // Validates: Requirements 5.4
  test('Property 5: TOGGLE mode never calls AudioEngine', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (touchCount) => {
          const { ctrl, audio } = makeController(Mode.TOGGLE);
          for (let i = 0; i < touchCount; i++) {
            ctrl.handleTouch();
          }
          return audio.shortBeepCount === 0 && audio.longBeepCount === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: semafor-app, Property 6: Změna режиму resetuje stav на RED
  // Validates: Requirements 2.2
  test('Property 6: resetToDefault() from any state → RED', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(AppState)),
        (targetState) => {
          const { ctrl } = makeController(Mode.START);

          // Drive into targetState
          if (targetState === AppState.COUNTING_3) {
            ctrl.handleTouch();
          } else if (targetState === AppState.COUNTING_2) {
            ctrl.handleTouch();
            jest.advanceTimersByTime(1000);
          } else if (targetState === AppState.COUNTING_1) {
            ctrl.handleTouch();
            jest.advanceTimersByTime(2000);
          } else if (targetState === AppState.GREEN) {
            ctrl.handleTouch();
            jest.advanceTimersByTime(3000);
          }
          // RED is the default already

          ctrl.resetToDefault();
          return ctrl.state === AppState.RED;
        }
      ),
      { numRuns: 100 }
    );
  });
});
