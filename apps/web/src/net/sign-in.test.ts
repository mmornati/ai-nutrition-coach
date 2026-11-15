import { describe, expect, it, vi } from 'vitest';
import { signInAgain, signInUrl, stripSignInParam } from './sign-in';

describe('sign-in navigation', () => {
  it('adds the parameter and keeps the hash route', () => {
    expect(signInUrl({ pathname: '/', search: '', hash: '#/settings/ai' })).toBe(
      '/?signin=1#/settings/ai',
    );
    expect(signInUrl({ pathname: '/app/', search: '?a=b', hash: '' })).toBe('/app/?a=b&signin=1');
  });

  it('assigns the address', () => {
    const assign = vi.fn();
    signInAgain({ pathname: '/', search: '', hash: '#/x', assign });
    expect(assign).toHaveBeenCalledWith('/?signin=1#/x');
  });

  it('strips only its parameter, keeping the rest and the hash', () => {
    const replaceState = vi.fn();
    stripSignInParam(
      { pathname: '/', search: '?signin=1&a=b', hash: '#/settings' },
      { replaceState, state: null },
    );
    expect(replaceState).toHaveBeenCalledWith(null, '', '/?a=b#/settings');
    replaceState.mockClear();
    stripSignInParam(
      { pathname: '/', search: '?signin=1', hash: '#/h' },
      { replaceState, state: null },
    );
    expect(replaceState).toHaveBeenCalledWith(null, '', '/#/h');
  });

  it('does nothing without the parameter', () => {
    const replaceState = vi.fn();
    stripSignInParam({ pathname: '/', search: '?a=b', hash: '' }, { replaceState, state: null });
    expect(replaceState).not.toHaveBeenCalled();
  });
});
