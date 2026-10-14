// Install help seams (docs/pwa.md, "Install on phones"). Port of the install half of
// packages/integrations/lib/src/pwa/pwa_platform.dart.
//
// Calm by construction: nothing here ever opens a prompt by itself. `beforeinstallprompt` is
// captured early (the browser fires it once, before any screen exists) and only used when the
// person taps the one Install button on the Install screen.

/** Which "how do I install this" instructions apply. */
export type InstallPlatform = 'ios' | 'android' | 'desktop';

/**
 * Classify a browser from its user agent and touch points. iPadOS reports a desktop Mac user
 * agent, so "Macintosh with a touch screen" is iOS-like.
 */
export function detectInstallPlatform(args: {
  readonly userAgent: string;
  readonly maxTouchPoints?: number;
}): InstallPlatform {
  const ua = args.userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
  if (ua.includes('macintosh') && (args.maxTouchPoints ?? 0) > 1) return 'ios';
  if (ua.includes('android')) return 'android';
  return 'desktop';
}

/** What the Install screen needs to know about where it is running. */
export interface InstallContext {
  readonly platform: InstallPlatform;
  /** Already running as an installed app (home-screen icon / app window). */
  readonly standalone: boolean;
}

interface InstallEnv {
  readonly navigator: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { standalone?: boolean };
  readonly matchMedia?: (query: string) => { matches: boolean };
}

export function readInstallContext(
  env: InstallEnv | undefined = typeof window === 'undefined' ? undefined : window,
): InstallContext {
  if (env === undefined) return { platform: 'desktop', standalone: false };
  let standalone = false;
  try {
    standalone =
      env.matchMedia?.('(display-mode: standalone)').matches === true ||
      // iOS Safari's non-standard flag.
      env.navigator.standalone === true;
  } catch {
    standalone = false;
  }
  return {
    platform: detectInstallPlatform({
      userAgent: env.navigator.userAgent,
      maxTouchPoints: env.navigator.maxTouchPoints,
    }),
    standalone,
  };
}

/** The Chromium `BeforeInstallPromptEvent`: not in lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

/**
 * The captured "install this app" prompt, as a `useSyncExternalStore` source. `canPrompt` is true
 * from the moment the browser offers installation until it is used or the app is installed.
 */
export class InstallPromptSource {
  #event: BeforeInstallPromptEvent | null = null;
  #can = false;
  readonly #listeners = new Set<() => void>();

  /** Starts listening. Call once, early (main.tsx); a prompt can only be used once. */
  attach(target: Pick<EventTarget, 'addEventListener'>): void {
    target.addEventListener('beforeinstallprompt', (event) => {
      // Keep the browser from showing its own mini-infobar; the Install screen offers the same
      // thing, on the person's request only.
      event.preventDefault();
      this.#event = event as BeforeInstallPromptEvent;
      this.#set(true);
    });
    target.addEventListener('appinstalled', () => {
      this.#event = null;
      this.#set(false);
    });
  }

  getSnapshot = (): boolean => this.#can;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Open the browser's install dialog. Only call from a tap. */
  async prompt(): Promise<void> {
    const event = this.#event;
    if (event === null) return;
    // A prompt can only be used once.
    this.#event = null;
    this.#set(false);
    try {
      await event.prompt();
    } catch {
      // The browser refused to show it; nothing else to do.
    }
  }

  #set(can: boolean): void {
    if (this.#can === can) return;
    this.#can = can;
    for (const l of [...this.#listeners]) l();
  }
}

/** The page's one prompt source; `main.tsx` attaches it to `window` before React renders. */
export const installPrompt = new InstallPromptSource();
