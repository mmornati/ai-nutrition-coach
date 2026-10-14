import { describe, expect, it, vi } from 'vitest';
import { detectInstallPlatform, InstallPromptSource, readInstallContext } from './install';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';

describe('detectInstallPlatform', () => {
  it('classifies iPhone, iPad, Android and desktop', () => {
    expect(detectInstallPlatform({ userAgent: IPHONE })).toBe('ios');
    expect(detectInstallPlatform({ userAgent: ANDROID })).toBe('android');
    expect(detectInstallPlatform({ userAgent: MAC })).toBe('desktop');
    expect(detectInstallPlatform({ userAgent: 'X11; Linux x86_64' })).toBe('desktop');
  });

  it('treats a Mac with a touch screen (iPadOS) as iOS', () => {
    expect(detectInstallPlatform({ userAgent: MAC, maxTouchPoints: 5 })).toBe('ios');
    expect(detectInstallPlatform({ userAgent: MAC, maxTouchPoints: 0 })).toBe('desktop');
  });
});

describe('readInstallContext', () => {
  it('reads the display mode and the iOS standalone flag', () => {
    const base = { navigator: { userAgent: IPHONE, maxTouchPoints: 5 } };
    expect(readInstallContext({ ...base, matchMedia: () => ({ matches: true }) })).toEqual({
      platform: 'ios',
      standalone: true,
    });
    expect(
      readInstallContext({ navigator: { ...base.navigator, standalone: true } }).standalone,
    ).toBe(true);
    expect(readInstallContext(base).standalone).toBe(false);
  });
});

describe('InstallPromptSource', () => {
  function setup() {
    const target = new EventTarget();
    const source = new InstallPromptSource();
    source.attach(target);
    const prompt = vi.fn(() => Promise.resolve());
    const offer = () => {
      const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt,
      });
      target.dispatchEvent(event);
      return event;
    };
    return { target, source, prompt, offer };
  }

  it('is not offered until the browser offers it, and keeps the browser from showing its own', () => {
    const { source, offer } = setup();
    expect(source.getSnapshot()).toBe(false);
    const event = offer();
    expect(event.defaultPrevented).toBe(true);
    expect(source.getSnapshot()).toBe(true);
  });

  it('never prompts by itself; prompting is one use and then it is used up', async () => {
    const { source, prompt, offer } = setup();
    const changes = vi.fn();
    source.subscribe(changes);
    offer();
    expect(prompt).not.toHaveBeenCalled();
    await source.prompt();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(source.getSnapshot()).toBe(false);
    await source.prompt();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('an installed app is no longer offered', () => {
    const { source, target, offer } = setup();
    offer();
    target.dispatchEvent(new Event('appinstalled'));
    expect(source.getSnapshot()).toBe(false);
  });

  it('a refused prompt does not throw', async () => {
    const { source, target } = setup();
    const refused = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: () => Promise.reject(new Error('no')),
    });
    target.dispatchEvent(refused);
    await expect(source.prompt()).resolves.toBeUndefined();
  });
});
