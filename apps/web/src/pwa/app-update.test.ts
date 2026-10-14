import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppUpdate, TAKEOVER_FALLBACK_MS, createAppUpdate, noAppUpdate } from './app-update';

/** A scripted ServiceWorkerContainer + registration. */
function fakes(opts: { controller?: boolean } = {}) {
  const container = Object.assign(new EventTarget(), {
    controller: opts.controller === false ? null : ({} as ServiceWorker),
  });
  const installing = Object.assign(new EventTarget(), { state: 'installing' });
  const postMessage = vi.fn();
  const registration = Object.assign(new EventTarget(), {
    installing: null as unknown,
    waiting: null as unknown,
    update: vi.fn(() => Promise.resolve()),
  });
  const register = vi.fn(() => Promise.resolve(registration));
  Object.assign(container, { register });
  const reload = vi.fn();
  const doc = new EventTarget() as unknown as Document;
  Object.assign(doc, { visibilityState: 'visible' });
  const signal = new AppUpdate({
    container: container as unknown as ServiceWorkerContainer,
    document: doc,
    reload,
  });
  /** A newer worker finishes installing next to the active one. */
  const installNewWorker = () => {
    registration.installing = installing;
    registration.dispatchEvent(new Event('updatefound'));
    registration.waiting = { postMessage };
    installing.state = 'installed';
    installing.dispatchEvent(new Event('statechange'));
  };
  return { container, registration, register, reload, doc, signal, postMessage, installNewWorker };
}

describe('AppUpdate', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('registers /sw.js at scope / with updateViaCache none, and checks for an update on load', async () => {
    const f = fakes();
    await f.signal.start();
    expect(f.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
    expect(f.registration.update).toHaveBeenCalledTimes(1);
    expect(f.signal.getUpdateReady()).toBe(false);
  });

  it('reports an update only once a newer worker WAITS next to an active controller', async () => {
    const f = fakes();
    const listener = vi.fn();
    f.signal.subscribe(listener);
    await f.signal.start();
    f.installNewWorker();
    expect(f.signal.getUpdateReady()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('the very first install (no controller yet) is not "a new version"', async () => {
    const f = fakes({ controller: false });
    await f.signal.start();
    f.installNewWorker();
    expect(f.signal.getUpdateReady()).toBe(false);
  });

  it('an already-waiting worker is noticed at start', async () => {
    const f = fakes();
    f.registration.waiting = { postMessage: f.postMessage };
    await f.signal.start();
    expect(f.signal.getUpdateReady()).toBe(true);
  });

  it('checks again whenever the app returns to the foreground', async () => {
    const f = fakes();
    await f.signal.start();
    f.registration.update.mockClear();
    f.doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.registration.update).toHaveBeenCalledTimes(1);
    Object.assign(f.doc, { visibilityState: 'hidden' });
    f.doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.registration.update).toHaveBeenCalledTimes(1);
  });

  it('Reload posts SKIP_WAITING and does not reload by itself; takeover reloads exactly once', async () => {
    const f = fakes();
    await f.signal.start();
    f.installNewWorker();
    await f.signal.applyUpdate();
    expect(f.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(f.reload).not.toHaveBeenCalled();
    f.container.dispatchEvent(new Event('controllerchange'));
    f.container.dispatchEvent(new Event('controllerchange'));
    await vi.advanceTimersByTimeAsync(TAKEOVER_FALLBACK_MS + 1);
    expect(f.reload).toHaveBeenCalledTimes(1);
  });

  it('every tab reloads once on takeover, even one that did not press Reload', async () => {
    const f = fakes();
    await f.signal.start();
    f.container.dispatchEvent(new Event('controllerchange'));
    expect(f.reload).toHaveBeenCalledTimes(1);
  });

  it('the first control of a page that had none (clients.claim) is not an update: no reload', async () => {
    const f = fakes({ controller: false });
    await f.signal.start();
    f.container.dispatchEvent(new Event('controllerchange'));
    expect(f.reload).not.toHaveBeenCalled();
    f.container.dispatchEvent(new Event('controllerchange'));
    expect(f.reload).toHaveBeenCalledTimes(1);
  });

  it('Reload is never a dead end: reloads after 10 s if the takeover is not reported', async () => {
    const f = fakes();
    await f.signal.start();
    f.installNewWorker();
    await f.signal.applyUpdate();
    await vi.advanceTimersByTimeAsync(TAKEOVER_FALLBACK_MS - 1);
    expect(f.reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(f.reload).toHaveBeenCalledTimes(1);
  });

  it('Reload with nothing waiting reloads directly', async () => {
    const f = fakes();
    await f.signal.start();
    await f.signal.applyUpdate();
    expect(f.reload).toHaveBeenCalledTimes(1);
  });

  it('a registration that fails leaves the app online-only, without throwing', async () => {
    const f = fakes();
    f.register.mockRejectedValueOnce(new Error('blocked'));
    await expect(f.signal.start()).resolves.toBeUndefined();
    expect(f.signal.getUpdateReady()).toBe(false);
  });

  it('an update check that fails (offline) is swallowed', async () => {
    const f = fakes();
    f.registration.update.mockRejectedValue(new Error('offline'));
    await expect(f.signal.start()).resolves.toBeUndefined();
  });

  it('unsubscribe stops notifications', async () => {
    const f = fakes();
    const listener = vi.fn();
    f.signal.subscribe(listener)();
    await f.signal.start();
    f.installNewWorker();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createAppUpdate: only a release build in a secure context with service workers', () => {
  const win = (over: { secure?: boolean; sw?: boolean }) =>
    ({
      isSecureContext: over.secure ?? true,
      navigator: over.sw === false ? {} : { serviceWorker: new EventTarget() },
      document: new EventTarget(),
      location: { reload: vi.fn() },
    }) as unknown as Window;

  it('a debug build never registers', () => {
    const w = win({});
    const s = createAppUpdate(w, false);
    void s.start();
    expect(s.getUpdateReady()).toBe(false);
    expect(s).not.toBeInstanceOf(AppUpdate);
  });

  it('an insecure context never registers', () => {
    expect(createAppUpdate(win({ secure: false }), true)).not.toBeInstanceOf(AppUpdate);
  });

  it('a browser without service workers never registers', () => {
    expect(createAppUpdate(win({ sw: false }), true)).not.toBeInstanceOf(AppUpdate);
  });

  it('a release build in a secure context does', () => {
    expect(createAppUpdate(win({}), true)).toBeInstanceOf(AppUpdate);
  });

  it('the inert signal never has an update and applyUpdate is a no-op', async () => {
    expect(noAppUpdate.getUpdateReady()).toBe(false);
    await expect(noAppUpdate.applyUpdate()).resolves.toBeUndefined();
  });
});
