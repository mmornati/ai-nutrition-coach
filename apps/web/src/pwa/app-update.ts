/**
 * Service-worker registration and the "a new version is ready" signal (ADR-0003, docs/pwa.md).
 *
 * The worker itself is `sw.js` (tools/pwa/sw.template.js, written into the bundle by
 * tools/generate_precache_manifest.mjs). It installs and WAITS; nothing activates until the
 * person taps Reload and `applyUpdate` posts `SKIP_WAITING`. Calm by construction
 * (docs/no-dark-patterns-standard.md): this module only reports that a worker is waiting.
 *
 * Registration happens only in a secure context and only in a release build, from this
 * same-origin module (no inline script). A dev server is never served from a stale cache.
 */

/** The worker script, served from the root so its scope is `/`. */
export const SERVICE_WORKER_URL = '/sw.js';
/** If the browser never reports the takeover, reload anyway: Reload must not be a dead end. */
export const TAKEOVER_FALLBACK_MS = 10_000;

export interface AppUpdateSignal {
  /** `true` once a new version is installed and waiting to take over. */
  getUpdateReady(): boolean;
  subscribe(listener: () => void): () => void;
  /** Activate the waiting version and reload into it; reloads directly if nothing waits. */
  applyUpdate(): Promise<void>;
}

/** Never has an update (dev server, insecure context, no service-worker support). */
export const noAppUpdate: AppUpdateSignal = {
  getUpdateReady: () => false,
  subscribe: () => () => undefined,
  applyUpdate: () => Promise.resolve(),
};

export interface AppUpdateEnv {
  readonly container: ServiceWorkerContainer;
  readonly document: Document;
  readonly reload: () => void;
}

export class AppUpdate implements AppUpdateSignal {
  private readonly listeners = new Set<() => void>();
  private registration: ServiceWorkerRegistration | undefined;
  private ready = false;
  private hadController: boolean;
  private reloading = false;

  constructor(private readonly env: AppUpdateEnv) {
    this.hadController = env.container.controller !== null;
  }

  readonly getUpdateReady = (): boolean => this.ready;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private reloadOnce(): void {
    if (this.reloading) return;
    this.reloading = true;
    this.env.reload();
  }

  /**
   * In EVERY tab, from the start: when a new worker takes control (this tab's Reload, or another
   * tab's), reload once so the page runs the build the worker serves. The first control of a page
   * that had none (first install, `clients.claim()`) is not an update: no reload.
   */
  async start(): Promise<void> {
    const { container, document } = this.env;
    try {
      container.addEventListener('controllerchange', () => {
        if (!this.hadController) {
          this.hadController = true;
          return;
        }
        this.reloadOnce();
      });
      const registration = await container.register(SERVICE_WORKER_URL, {
        scope: '/',
        updateViaCache: 'none',
      });
      this.registration = registration;
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') this.checkWaiting();
        });
      });
      this.checkWaiting();
      // A long-lived installed app is rarely navigated: look for a new version on every load
      // and whenever it comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.checkForUpdate();
      });
      void this.checkForUpdate();
    } catch {
      // No service worker (404 on a plain static host, blocked, private mode): the app simply
      // runs online-only.
    }
  }

  private async checkForUpdate(): Promise<void> {
    try {
      await this.registration?.update();
      this.checkWaiting();
    } catch {
      // Offline or the server is unreachable: try again next time.
    }
  }

  /** A waiting worker next to an ACTIVE controller is an update (not the very first install). */
  private checkWaiting(): void {
    if (this.registration?.waiting && this.env.container.controller && !this.ready) {
      this.ready = true;
      this.listeners.forEach((l) => l());
    }
  }

  readonly applyUpdate = (): Promise<void> => {
    const waiting = this.registration?.waiting;
    if (!waiting) {
      // Nothing waits (it already took over, or never installed): the reload is what the person
      // asked for, and it loads the current build.
      this.reloadOnce();
      return Promise.resolve();
    }
    // The page reloads on `controllerchange`. If the browser never reports it, reload anyway.
    setTimeout(() => this.reloadOnce(), TAKEOVER_FALLBACK_MS);
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return Promise.resolve();
  };
}

/** Secure context + service-worker support + a release build, else the inert signal. */
export function createAppUpdate(
  win: Window = window,
  release: boolean = import.meta.env.PROD,
): AppUpdateSignal & { start(): Promise<void> } {
  if (!release || !win.isSecureContext || !('serviceWorker' in win.navigator)) {
    return { ...noAppUpdate, start: () => Promise.resolve() };
  }
  return new AppUpdate({
    container: win.navigator.serviceWorker,
    document: win.document,
    reload: () => win.location.reload(),
  });
}

// Process-wide singleton: the app tree can remount (lock / unlock) and must never register the
// worker or its listeners twice.
let instance: (AppUpdateSignal & { start(): Promise<void> }) | undefined;

export function appUpdate(): AppUpdateSignal & { start(): Promise<void> } {
  instance ??= createAppUpdate();
  return instance;
}

/** Called once from main.tsx. */
export function startAppUpdate(): void {
  void appUpdate().start();
}
