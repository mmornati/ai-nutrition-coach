// The page wiring of the auto-lock (the delays and the locking itself are controller tests).
import { describe, expect, it, vi } from 'vitest';
import { attachAutoLock } from '../auto-lock';

const controller = () => ({ touch: vi.fn(), onHidden: vi.fn(), onVisible: vi.fn() });

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('attachAutoLock', () => {
  it.each(['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'])(
    'a %s event resets the idle timer',
    (name) => {
      const c = controller();
      const detach = attachAutoLock(c);
      window.dispatchEvent(new Event(name));
      expect(c.touch).toHaveBeenCalledTimes(1);
      detach();
    },
  );

  it('hidden and visible are forwarded', () => {
    const c = controller();
    const detach = attachAutoLock(c);
    setVisibility('hidden');
    expect(c.onHidden).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    expect(c.onVisible).toHaveBeenCalledTimes(1);
    detach();
  });

  it('detach removes every listener', () => {
    const c = controller();
    attachAutoLock(c)();
    window.dispatchEvent(new Event('keydown'));
    setVisibility('hidden');
    setVisibility('visible');
    expect(c.touch).not.toHaveBeenCalled();
    expect(c.onHidden).not.toHaveBeenCalled();
    expect(c.onVisible).not.toHaveBeenCalled();
  });
});
