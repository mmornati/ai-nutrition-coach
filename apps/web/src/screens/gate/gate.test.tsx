// Ports of the earlier client.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { ERASE_SUCCESS, eraseLocalDataFailure } from '@anc/core';
import type { UnlockOutcome } from '../../storage';
import { strings } from '../../i18n';
import type { RestoreNewStoreResult } from '../../sync/vault';
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

describe('CreatePassphraseScreen: restore from a backup', () => {
  const restored = (result: RestoreNewStoreResult) => vi.fn(() => Promise.resolve(result));
  const create = (onRestore = restored({ kind: 'restored' })) =>
    render(
      <CreatePassphraseScreen onCreate={outcome({ kind: 'unlocked' })} onRestore={onRestore} />,
    );
  const toRestore = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: s.restore.createLink }));
  const file = () => new File(['x'], 'backup.ancvault');

  it('is offered only where the app can restore', () => {
    render(<CreatePassphraseScreen onCreate={outcome({ kind: 'unlocked' })} />);
    expect(screen.queryByRole('button', { name: s.restore.createLink })).toBeNull();
  });

  it('shows the file and passphrase fields, says the passphrase becomes the device’s, and goes back', async () => {
    const user = userEvent.setup();
    create();
    await user.type(
      screen.getByLabelText(s.session.createPassphraseLabel, { selector: 'input' }),
      STRONG,
    );
    await toRestore(user);
    expect(screen.getByRole('heading', { name: s.restore.createTitle })).toBeVisible();
    expect(screen.getByLabelText(s.restore.fileLabel, { selector: 'input' })).toBeVisible();
    expect(screen.getByLabelText(s.restore.passphraseLabel, { selector: 'input' })).toBeVisible();
    expect(screen.getByText(s.restore.createSame)).toBeVisible();
    await user.click(screen.getByRole('button', { name: s.restore.createBack }));
    expect(screen.getByRole('heading', { name: s.session.createTitle })).toBeVisible();
    // What was typed for the new passphrase did not travel into the other path.
    expect(
      screen.getByLabelText(s.session.createPassphraseLabel, { selector: 'input' }),
    ).toHaveValue('');
  });

  it('hands the picked file and the passphrase over once, and empties the passphrase', async () => {
    const user = userEvent.setup();
    const onRestore = restored({ kind: 'restored' });
    create(onRestore);
    await toRestore(user);
    const picked = file();
    await user.upload(screen.getByLabelText(s.restore.fileLabel, { selector: 'input' }), picked);
    const field = screen.getByLabelText(s.restore.passphraseLabel, { selector: 'input' });
    await user.type(field, STRONG);
    await user.click(screen.getByRole('button', { name: s.restore.createAction }));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith(picked, STRONG);
    await waitFor(() => expect(field).toHaveValue(''));
  });

  it('asks for the file and the passphrase first, calling nothing', async () => {
    const user = userEvent.setup();
    const onRestore = restored({ kind: 'restored' });
    create(onRestore);
    await toRestore(user);
    await user.click(screen.getByRole('button', { name: s.restore.createAction }));
    expect(screen.getByText(s.restore.noFile)).toBeVisible();
    await user.upload(screen.getByLabelText(s.restore.fileLabel, { selector: 'input' }), file());
    await user.click(screen.getByRole('button', { name: s.restore.createAction }));
    expect(screen.getByText(s.restore.noPassphrase)).toBeVisible();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a weak backup passphrase',
      { kind: 'passphraseRejected', issue: 'tooShort' },
      s.restore.createWeak,
    ],
    [
      'a wrong passphrase',
      { kind: 'failed', failure: 'wrongPassphraseOrDamaged' },
      s.restore.wrongOrDamaged,
    ],
    ['not a backup', { kind: 'failed', failure: 'notABackup' }, s.restore.notABackup],
    ['too large', { kind: 'failed', failure: 'tooLarge' }, s.restore.tooLarge],
    ['a newer version', { kind: 'failed', failure: 'schemaTooNew' }, s.restore.newerVersion],
    ['unusable content', { kind: 'failed', failure: 'invalidContent' }, s.restore.invalidContent],
    ['an unreadable file', { kind: 'failed', failure: 'unreadable' }, s.restore.unreadable],
    ['a KDF that cannot run', { kind: 'failed', failure: 'unavailable' }, s.restore.unavailable],
    ['a clock ahead', { kind: 'clockAhead' }, s.restore.clockAhead],
    ['a store problem', { kind: 'storeProblem' }, s.restore.storeProblem],
    [
      'a store problem that left an empty store',
      { kind: 'storeProblemNotRemoved' },
      s.restore.storeProblemNotRemoved,
    ],
    [
      'another tab holding the store',
      { kind: 'createFailed', outcome: { kind: 'inUseElsewhere' } },
      s.session.inOtherTab,
    ],
  ] as const)('%s: one calm line', async (_name, result, line) => {
    const user = userEvent.setup();
    create(restored(result as RestoreNewStoreResult));
    await toRestore(user);
    await user.upload(screen.getByLabelText(s.restore.fileLabel, { selector: 'input' }), file());
    await user.type(
      screen.getByLabelText(s.restore.passphraseLabel, { selector: 'input' }),
      STRONG,
    );
    await user.click(screen.getByRole('button', { name: s.restore.createAction }));
    expect(await screen.findByText(line)).toBeVisible();
    expect(screen.getByRole('button', { name: s.restore.createAction })).not.toHaveAttribute(
      'aria-busy',
    );
  });

  it('while a restore runs there is no way out: Back does nothing', async () => {
    const user = userEvent.setup();
    let finish!: (r: RestoreNewStoreResult) => void;
    create(vi.fn(() => new Promise<RestoreNewStoreResult>((resolve) => (finish = resolve))));
    await toRestore(user);
    await user.upload(screen.getByLabelText(s.restore.fileLabel, { selector: 'input' }), file());
    await user.type(
      screen.getByLabelText(s.restore.passphraseLabel, { selector: 'input' }),
      STRONG,
    );
    await user.click(screen.getByRole('button', { name: s.restore.createAction }));
    const back = screen.getByRole('button', { name: s.restore.createBack });
    expect(back).toHaveAttribute('aria-disabled', 'true');
    await user.click(back);
    expect(screen.getByRole('heading', { name: s.restore.createTitle })).toBeVisible();
    finish({ kind: 'failed', failure: 'notABackup' });
    expect(await screen.findByText(s.restore.notABackup)).toBeVisible();
    await user.click(screen.getByRole('button', { name: s.restore.createBack }));
    expect(screen.getByRole('heading', { name: s.session.createTitle })).toBeVisible();
  });

  it('a thrown error is reported as unavailable and releases busy', async () => {
    const user = userEvent.setup();
    create(vi.fn(() => Promise.reject(new Error('boom'))));
    await toRestore(user);
    await user.upload(screen.getByLabelText(s.restore.fileLabel, { selector: 'input' }), file());
    await user.type(
      screen.getByLabelText(s.restore.passphraseLabel, { selector: 'input' }),
      STRONG,
    );
    await user.click(screen.getByRole('button', { name: s.restore.createAction }));
    expect(await screen.findByText(s.restore.unavailable)).toBeVisible();
  });

  it('has no axe violations in the restore view', async () => {
    const user = userEvent.setup();
    const { container } = create();
    await toRestore(user);
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
    cleanup();

    // Plain http:// has its own HTTPS explanation.
    render(
      <UnlockScreen onUnlock={outcome({ kind: 'storeUnavailable', reason: 'insecureContext' })} />,
    );
    await submit('x');
    expect(await screen.findByText(s.session.unavailableInsecure)).toBeVisible();
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

  it('plain http:// gets its own HTTPS explanation, never "wrong passphrase", and no erase', async () => {
    render(<StoreUnavailableScreen reason="insecureContext" onRetry={() => Promise.resolve()} />);
    expect(screen.getByText(s.session.unavailableInsecure)).toBeVisible();
    expect(s.session.unavailableInsecure).toMatch(/https:\/\/ or localhost/);
    expect(screen.queryByText(s.session.wrongPassphrase)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('the general line points at the Try again button, never at a reload', () => {
    expect(s.session.unavailable).not.toMatch(/reload/i);
    expect(s.session.unavailable).toMatch(/try again\.$/);
    render(<StoreUnavailableScreen reason="storage" onRetry={() => Promise.resolve()} />);
    expect(screen.getByText(s.session.unavailable)).toBeVisible();
    expect(screen.getByRole('button', { name: s.storeUnavailable.retry })).toBeVisible();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <StoreUnavailableScreen reason="storage" onRetry={() => Promise.resolve()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
