// Ports of create_passphrase_body_test.dart, lock_screen_body_test.dart and key_lost_screen_test.dart.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { ERASE_SUCCESS, eraseLocalDataFailure } from '@anc/core';
import type { UnlockOutcome } from '../../storage';
import { strings } from '../../i18n';
import { CreatePassphraseScreen } from './CreatePassphraseScreen';
import { LostStoreScreen } from './LostStoreScreen';
import { StoreUnavailableScreen } from './StoreUnavailableScreen';
import { UnlockScreen } from './UnlockScreen';

const s = strings();
const STRONG = 'a long enough passphrase';
const outcome = (o: UnlockOutcome) => () => Promise.resolve(o);

describe('CreatePassphraseScreen', () => {
  async function fill(first: string, second: string) {
    const user = userEvent.setup();
    const a = screen.getByLabelText(s.session.createPassphraseLabel, { selector: 'input' });
    const b = screen.getByLabelText(s.session.createConfirmLabel, { selector: 'input' });
    await user.clear(a);
    await user.clear(b);
    if (first) await user.type(a, first);
    if (second) await user.type(b, second);
    await user.click(screen.getByRole('button', { name: s.session.createAction }));
    return { a, b };
  }

  it('warns that a forgotten passphrase cannot be recovered, before it is set', () => {
    render(<CreatePassphraseScreen onCreate={outcome({ kind: 'unlocked' })} />);
    expect(screen.getByText(s.session.createWarning)).toBeVisible();
    expect(screen.getByText(/cannot be recovered/)).toBeVisible();
  });

  it('too short, mismatched and repetitive passphrases never reach the store', async () => {
    const onCreate = vi.fn(outcome({ kind: 'unlocked' }));
    render(<CreatePassphraseScreen onCreate={onCreate} />);
    await fill('short', 'short');
    expect(screen.getByText(s.session.tooShort)).toBeVisible();
    await fill(STRONG, 'a long enough passphras');
    expect(screen.getByText(s.session.mismatch)).toBeVisible();
    await fill('aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa');
    expect(screen.getByText(s.session.tooRepetitive)).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('a matching strong passphrase is submitted once and both fields are cleared', async () => {
    const received: string[] = [];
    render(
      <CreatePassphraseScreen
        onCreate={(p) => {
          received.push(p);
          return Promise.resolve({ kind: 'unlocked' });
        }}
      />,
    );
    const { a, b } = await fill(STRONG, STRONG);
    expect(received).toEqual([STRONG]);
    await waitFor(() => expect(a).toHaveValue(''));
    expect(b).toHaveValue('');
    expect(screen.getByRole('button', { name: s.session.createAction })).not.toHaveAttribute(
      'aria-busy',
    );
  });

  it.each([
    [
      'an unavailable store is reported honestly',
      { kind: 'storeUnavailable', reason: 'storage' },
      s.session.unavailable,
    ],
    ['another tab holding the store', { kind: 'inUseElsewhere' }, s.session.inOtherTab],
    ['a newer version', { kind: 'newerVersion' }, s.session.newerVersion],
    [
      'a rejected passphrase',
      { kind: 'passphraseRejected', issue: 'tooShort' },
      s.session.tooShort,
    ],
  ] as const)('%s', async (_name, result, line) => {
    render(<CreatePassphraseScreen onCreate={outcome(result)} />);
    await fill(STRONG, STRONG);
    expect(await screen.findByText(line)).toBeVisible();
  });

  it('a thrown error is reported as unavailable and releases busy', async () => {
    render(<CreatePassphraseScreen onCreate={() => Promise.reject(new Error('boom'))} />);
    await fill(STRONG, STRONG);
    expect(await screen.findByText(s.session.unavailable)).toBeVisible();
    expect(screen.getByRole('button', { name: s.session.createAction })).not.toHaveAttribute(
      'aria-busy',
    );
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <CreatePassphraseScreen onCreate={outcome({ kind: 'unlocked' })} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('UnlockScreen', () => {
  async function submit(text: string) {
    const user = userEvent.setup();
    const field = screen.getByLabelText(s.session.placeholder, { selector: 'input' });
    await user.clear(field);
    if (text) await user.type(field, text);
    await user.click(screen.getByRole('button', { name: s.session.unlock }));
    return field;
  }

  it('wrong passphrase: one calm line, field cleared, button usable', async () => {
    render(<UnlockScreen onUnlock={outcome({ kind: 'wrongPassphrase', retryAfterMs: 0 })} />);
    const field = await submit('a passphrase');
    expect(await screen.findByText(s.session.wrongPassphrase)).toBeVisible();
    expect(field).toHaveValue('');
    const button = screen.getByRole('button', { name: s.session.unlock });
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button).not.toBeDisabled();
  });

  it('success releases the busy state too (the stuck spinner of W4)', async () => {
    render(<UnlockScreen onUnlock={outcome({ kind: 'unlocked' })} />);
    const field = await submit('a passphrase');
    await waitFor(() => expect(field).toHaveValue(''));
    expect(screen.getByRole('button', { name: s.session.unlock })).not.toHaveAttribute('aria-busy');
  });

  it('throttled and unavailable have their own honest lines', async () => {
    const { unmount } = render(
      <UnlockScreen onUnlock={outcome({ kind: 'throttled', retryAfterMs: 2000 })} />,
    );
    await submit('x');
    expect(await screen.findByText(s.session.throttled)).toBeVisible();
    expect(screen.queryByText(s.session.wrongPassphrase)).not.toBeInTheDocument();
    unmount();

    render(<UnlockScreen onUnlock={outcome({ kind: 'storeUnavailable', reason: 'storage' })} />);
    await submit('x');
    expect(await screen.findByText(s.session.unavailable)).toBeVisible();
  });

  it('open in another tab has its own line and can be retried', async () => {
    let calls = 0;
    render(
      <UnlockScreen
        onUnlock={() => {
          calls++;
          return Promise.resolve(calls === 1 ? { kind: 'inUseElsewhere' } : { kind: 'unlocked' });
        }}
      />,
    );
    await submit('x');
    expect(await screen.findByText(s.session.inOtherTab)).toBeVisible();
    await submit('x');
    await waitFor(() => expect(screen.queryByText(s.session.inOtherTab)).not.toBeInTheDocument());
    expect(calls).toBe(2);
  });

  it('data written by a newer version says to reload, not "wrong passphrase"', async () => {
    render(<UnlockScreen onUnlock={outcome({ kind: 'newerVersion' })} />);
    await submit('x');
    expect(await screen.findByText(s.session.newerVersion)).toBeVisible();
    expect(screen.getByText(/reload/)).toBeVisible();
    expect(screen.queryByText(s.session.wrongPassphrase)).not.toBeInTheDocument();
  });

  it('a thrown error is "unavailable", not "wrong passphrase", and releases busy', async () => {
    render(<UnlockScreen onUnlock={() => Promise.reject(new Error('boom'))} />);
    await submit('x');
    expect(await screen.findByText(s.session.unavailable)).toBeVisible();
    expect(screen.getByRole('button', { name: s.session.unlock })).not.toHaveAttribute('aria-busy');
  });

  it('an empty field is not submitted', async () => {
    const onUnlock = vi.fn(outcome({ kind: 'unlocked' }));
    render(<UnlockScreen onUnlock={onUnlock} />);
    await userEvent.click(screen.getByRole('button', { name: s.session.unlock }));
    expect(onUnlock).not.toHaveBeenCalled();
    expect(screen.getByText(s.session.wrongPassphrase)).toBeVisible();
  });

  it('"Forgot your passphrase?" states it cannot be recovered and offers a confirmed erase', async () => {
    const user = userEvent.setup();
    const onErase = vi.fn(() => Promise.resolve(eraseLocalDataFailure(['databaseFiles'])));
    render(<UnlockScreen onUnlock={outcome({ kind: 'unlocked' })} onErase={onErase} />);
    expect(screen.queryByText(s.session.forgotBody)).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: s.session.forgot });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/cannot be recovered/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: s.session.forgotAction }));
    // The confirm comes first, and "Keep my data" is the default.
    expect(onErase).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(screen.getByRole('button', { name: s.erase.keep })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: s.erase.confirm }));
    expect(onErase).toHaveBeenCalledTimes(1);
    expect(dialog).toBeDefined();
    expect(await screen.findByText(s.erase.failed)).toBeVisible();
  });

  it('keeping the data erases nothing', async () => {
    const user = userEvent.setup();
    const onErase = vi.fn(() => Promise.resolve(ERASE_SUCCESS));
    render(<UnlockScreen onUnlock={outcome({ kind: 'unlocked' })} onErase={onErase} />);
    await user.click(screen.getByRole('button', { name: s.session.forgot }));
    await user.click(screen.getByRole('button', { name: s.session.forgotAction }));
    await user.click(await screen.findByRole('button', { name: s.erase.keep }));
    expect(onErase).not.toHaveBeenCalled();
  });

  it('has no forgot affordance without a handler', () => {
    render(<UnlockScreen onUnlock={outcome({ kind: 'unlocked' })} />);
    expect(screen.queryByText(s.session.forgot)).not.toBeInTheDocument();
  });

  it('has no axe violations (with the disclosure open)', async () => {
    const { container } = render(
      <UnlockScreen
        onUnlock={outcome({ kind: 'unlocked' })}
        onErase={() => Promise.resolve(ERASE_SUCCESS)}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: s.session.forgot }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('LostStoreScreen', () => {
  it('offers one confirmed erase and nothing else', async () => {
    const user = userEvent.setup();
    const onErase = vi.fn(() => Promise.resolve(ERASE_SUCCESS));
    render(<LostStoreScreen onErase={onErase} />);
    expect(
      screen.getByRole('heading', { level: 1, name: s.keyLost.unreadable.title }),
    ).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: s.keyLost.unreadable.action }));
    expect(onErase).not.toHaveBeenCalled(); // must confirm first
    await user.click(await screen.findByRole('button', { name: s.erase.confirm }));
    expect(onErase).toHaveBeenCalledTimes(1);
  });

  it('is calm and never blames: it says what happened and what is possible', () => {
    render(<LostStoreScreen onErase={() => Promise.resolve(ERASE_SUCCESS)} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('incomplete or unreadable');
    expect(text).not.toMatch(/you (failed|forgot|should have)/i);
    expect(text).not.toMatch(/error|failed|!/i);
  });

  it('uses the other copy variants too (lost key, open failed)', () => {
    const { rerender } = render(
      <LostStoreScreen copy={s.keyLost.lost} onErase={() => Promise.resolve(ERASE_SUCCESS)} />,
    );
    expect(screen.getByRole('heading', { name: "Your history can't be opened" })).toBeVisible();
    rerender(
      <LostStoreScreen
        copy={s.keyLost.openFailed}
        onErase={() => Promise.resolve(ERASE_SUCCESS)}
      />,
    );
    expect(
      screen.getByRole('heading', { name: "Your history can't be opened right now" }),
    ).toBeVisible();
  });

  it('a failed erase says so, without cause text', async () => {
    const user = userEvent.setup();
    render(
      <LostStoreScreen onErase={() => Promise.resolve(eraseLocalDataFailure(['databaseFiles']))} />,
    );
    await user.click(screen.getByRole('button', { name: s.keyLost.unreadable.action }));
    await user.click(await screen.findByRole('button', { name: s.erase.confirm }));
    expect(await screen.findByText(s.erase.failed)).toBeVisible();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <LostStoreScreen onErase={() => Promise.resolve(ERASE_SUCCESS)} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('StoreUnavailableScreen', () => {
  it('names the other-tab case apart and offers only "Try again"', async () => {
    const onRetry = vi.fn(() => Promise.resolve());
    const { rerender } = render(<StoreUnavailableScreen reason="inUse" onRetry={onRetry} />);
    expect(screen.getByText(s.session.inOtherTab)).toBeVisible();
    rerender(<StoreUnavailableScreen reason="noOpfs" onRetry={onRetry} />);
    expect(screen.getByText(s.session.unavailable)).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: s.storeUnavailable.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <StoreUnavailableScreen reason="storage" onRetry={() => Promise.resolve()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
