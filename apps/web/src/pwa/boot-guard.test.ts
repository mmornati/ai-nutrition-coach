// public/boot-guard.js: the stuck-boot escape hatch (docs/pwa.md). A classic script, so it is
// executed here as one, with a scripted navigator.serviceWorker and fake timers.
import guardSource from '../../public/boot-guard.js?raw';
import { SUPPORTED_LOCALES } from '../i18n/locale';
import { LOCALE_HINT_KEY } from '../storage/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STUCK_MS = 20_000;
const RECHECK_MS = 8_000;

function setup(opts: { waiting?: boolean; becomesWaiting?: boolean; registered?: boolean } = {}) {
  const container = Object.assign(new EventTarget(), {});
  const postMessage = vi.fn();
  const registration = {
    waiting: opts.waiting ? { postMessage } : null,
    update: vi.fn(() => {
      if (opts.becomesWaiting) registration.waiting = { postMessage };
      return Promise.resolve();
    }),
  };
  Object.assign(container, {
    getRegistration: vi.fn(() =>
      Promise.resolve(opts.registered === false ? undefined : registration),
    ),
  });
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
  return { container, registration, postMessage };
}

const run = () => new Function(guardSource)();
const settle = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('boot guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = '<div id="root"></div>';
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('does nothing when the app has painted', async () => {
    const s = setup({ waiting: true });
    document.getElementById('root')!.innerHTML = '<main></main>';
    run();
    await settle(STUCK_MS + RECHECK_MS + 100);
    expect(s.postMessage).not.toHaveBeenCalled();
  });

  it('does nothing before 20 s', async () => {
    const s = setup({ waiting: true });
    run();
    await settle(STUCK_MS - 1);
    expect(s.postMessage).not.toHaveBeenCalled();
  });

  it('nothing painted after 20 s and a newer worker waiting: activates it, once, and reloads on takeover', async () => {
    const s = setup({ waiting: true });
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    run();
    await settle(STUCK_MS + 1);
    expect(s.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(sessionStorage.getItem('anc.recovery')).toBe('1');
    s.container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('never loops: a second stuck boot in the same session does nothing', async () => {
    const s = setup({ waiting: true });
    sessionStorage.setItem('anc.recovery', '1');
    run();
    await settle(STUCK_MS + RECHECK_MS + 100);
    expect(s.postMessage).not.toHaveBeenCalled();
  });

  it('no worker waiting: asks for an update, waits 8 s, then acts if one arrived', async () => {
    const s = setup({ becomesWaiting: true });
    run();
    await settle(STUCK_MS + 1);
    expect(s.registration.update).toHaveBeenCalled();
    expect(s.postMessage).not.toHaveBeenCalled();
    await settle(RECHECK_MS + 1);
    expect(s.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('no newer worker anywhere: nothing to switch to, nothing done', async () => {
    const s = setup();
    run();
    await settle(STUCK_MS + RECHECK_MS + 100);
    expect(s.postMessage).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('anc.recovery')).toBeNull();
  });

  it('no registration: nothing done', async () => {
    const s = setup({ registered: false });
    run();
    await settle(STUCK_MS + 100);
    expect(s.postMessage).not.toHaveBeenCalled();
  });

  it('is inert without service-worker support', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    expect(() => run()).not.toThrow();
    await settle(STUCK_MS + 100);
  });
});

describe('boot guard: pre-paint <html lang>', () => {
  const langWith = (opts: { hint?: string | null; languages?: unknown; language?: string }) => {
    document.documentElement.lang = 'en';
    localStorage.clear();
    if (opts.hint != null) localStorage.setItem(LOCALE_HINT_KEY, opts.hint);
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(
      (opts.languages ?? []) as readonly string[],
    );
    vi.spyOn(navigator, 'language', 'get').mockReturnValue(opts.language ?? 'en-US');
    new Function(guardSource)();
    return document.documentElement.lang;
  };
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.lang = 'en';
  });

  it('stays in sync with the TypeScript constants (hint key and supported list)', () => {
    expect(guardSource).toContain(`var LOCALE_HINT_KEY = '${LOCALE_HINT_KEY}';`);
    const m = /var SUPPORTED = (\[[^\]]*\]);/.exec(guardSource);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1]!.replace(/'/g, '"'))).toEqual([...SUPPORTED_LOCALES]);
  });

  it('resolves <code>-XX to <code> for every supported locale', () => {
    for (const code of SUPPORTED_LOCALES) {
      expect(langWith({ languages: [`${code}-XX`] }), code).toBe(code);
    }
  });

  it('uses the hint first', () => {
    expect(langWith({ hint: 'fr', languages: ['en-US'] })).toBe('fr');
    expect(langWith({ hint: 'en', languages: ['fr-FR'] })).toBe('en');
  });
  it('ignores an unsupported hint and follows the browser list (first supported wins)', () => {
    expect(langWith({ hint: 'de', languages: ['de-DE', 'fr-FR'] })).toBe('fr');
  });
  it('falls back to navigator.language when the list is empty, then to en', () => {
    expect(langWith({ languages: [], language: 'fr-CA' })).toBe('fr');
    expect(langWith({ languages: ['de'], language: 'fr' })).toBe('en');
    expect(langWith({ languages: [], language: 'zz' })).toBe('en');
  });
  it('never throws on malformed tags or a refusing localStorage', () => {
    expect(langWith({ languages: [null, 42, '', '--', 'fr_CA'] })).toBe('fr');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => langWith({ languages: ['fr'] })).not.toThrow();
  });
});
