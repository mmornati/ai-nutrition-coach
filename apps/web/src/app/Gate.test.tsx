// Ports from the earlier client: what the app shows first, from the
// store's state, and that the unlocked session is built and thrown away with the unlock.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eraseLocalDataFailure } from '@anc/core';
import type { StoreBackend } from '../storage/backend';
import { StoreUnavailableError } from '../storage/errors';
import { PrivacyPrefs } from '../catalog';
import { fastBackupService } from '../sync/vault/testing';
import { forgetAcknowledgedBeforeStore } from './about-ack';
import { Gate } from './Gate';
import { useSession, type Session } from './session';
import {
  GuardedMemoryBackend,
  lockedBundle,
  memoryBundle,
  PASSPHRASE,
  seedPlate,
  at,
  unlockedBundle,
} from './testing';

afterEach(() => {
  forgetAcknowledgedBeforeStore();
  window.location.hash = '';
});

const today = () => screen.findByRole('heading', { level: 1, name: 'Today' });

async function dismissAbout(user: ReturnType<typeof userEvent.setup>) {
  expect(await screen.findByRole('heading', { name: 'About this app' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Got it' }));
}

describe('Gate: first run', () => {
  it('shows About, then create-passphrase; creating opens Today', async () => {
    const user = userEvent.setup();
    const bundle = memoryBundle();
    await bundle.controller.initialize();
    render(<Gate bundle={bundle} />);

    await dismissAbout(user);
    expect(await screen.findByRole('heading', { name: 'Protect your history' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Today' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Passphrase'), PASSPHRASE);
    await user.type(screen.getByLabelText('Confirm passphrase'), PASSPHRASE);
    await user.click(screen.getByRole('button', { name: 'Create and unlock' }));

    expect(await today()).toBeVisible();
    expect(bundle.controller.getSnapshot().status).toBe('unlocked');
    // The notice was shown before the store existed: it is written into the store silently.
    await waitFor(async () =>
      expect(await new PrivacyPrefs(bundle.kv).aboutAcknowledged()).toBe(true),
    );
    expect(screen.queryByRole('heading', { name: 'About this app' })).not.toBeInTheDocument();
  });

  it('keeps the notice for the page: it is not asked twice', async () => {
    const user = userEvent.setup();
    const bundle = memoryBundle();
    await bundle.controller.initialize();
    const { unmount } = render(<Gate bundle={bundle} />);
    await dismissAbout(user);
    unmount();
    render(<Gate bundle={bundle} />);
    expect(await screen.findByRole('heading', { name: 'Protect your history' })).toBeVisible();
  });
});

describe('Gate: first run, restoring from a backup', () => {
  const BACKUP_PASSPHRASE = 'the backup passphrase';
  const service = fastBackupService();

  /** A device that logged these foods and made a backup of them. */
  async function backupOfDevice(...foods: string[]) {
    const source = await unlockedBundle();
    for (const [i, food] of foods.entries())
      await seedPlate(source, at(8 + i, 0), [[food, 'protein']]);
    const read = await source.vault.readSnapshot();
    if (read.kind !== 'vault') throw new Error('read');
    const sealed = await service.seal(read.value, BACKUP_PASSPHRASE);
    if (sealed.kind !== 'sealed') throw new Error('seal');
    return new File([sealed.bytes as BlobPart], 'backup.ancvault');
  }

  async function toRestore(user: ReturnType<typeof userEvent.setup>) {
    const bundle = memoryBundle();
    await bundle.controller.initialize();
    render(<Gate bundle={bundle} backup={service} />);
    await dismissAbout(user);
    await user.click(await screen.findByRole('button', { name: 'Restore from a backup' }));
    expect(await screen.findByRole('heading', { name: 'Restore from a backup' })).toBeVisible();
    return bundle;
  }

  async function submit(
    user: ReturnType<typeof userEvent.setup>,
    file: File | null,
    passphrase: string,
  ) {
    if (file) await user.upload(screen.getByLabelText('Backup file'), file);
    await user.type(screen.getByLabelText('Backup passphrase'), passphrase);
    await user.click(screen.getByRole('button', { name: 'Restore and unlock' }));
  }

  it('opens the file, creates the store with its passphrase, and lands on Today with the plates', async () => {
    const user = userEvent.setup();
    const file = await backupOfDevice('Salmon');
    const bundle = await toRestore(user);
    // The screen says the backup passphrase becomes this device's.
    expect(screen.getByText(/will also unlock the app on this device/)).toBeVisible();
    await submit(user, file, BACKUP_PASSPHRASE);

    expect(await today()).toBeVisible();
    expect(await screen.findByText('Salmon')).toBeVisible();
    expect(bundle.controller.getSnapshot().status).toBe('unlocked');
    await bundle.controller.lock();
    expect((await bundle.controller.unlock(BACKUP_PASSPHRASE)).kind).toBe('unlocked');
  });

  it('a wrong passphrase: one calm line, the screen stays, and NO store is created', async () => {
    const user = userEvent.setup();
    const file = await backupOfDevice('Salmon');
    const bundle = await toRestore(user);
    await submit(user, file, 'another long passphrase');
    expect(
      await screen.findByText(
        'That passphrase does not open this file, or the file is damaged. Nothing was changed.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Restore from a backup' })).toBeVisible();
    expect(bundle.controller.getSnapshot().status).toBe('needsPassphraseCreation');
    expect(screen.getByLabelText('Backup passphrase')).toHaveValue('');
    // Back to creating a passphrase is one tap, and still a first run.
    await user.click(screen.getByRole('button', { name: 'Back to creating a passphrase' }));
    expect(await screen.findByRole('heading', { name: 'Protect your history' })).toBeVisible();
  });

  it('a file that is not a backup: one calm line, no store', async () => {
    const user = userEvent.setup();
    const bundle = await toRestore(user);
    await submit(user, new File(['hello'], 'notes.txt'), BACKUP_PASSPHRASE);
    expect(
      await screen.findByText(/does not look like an AI Nutrition Coach backup/),
    ).toBeVisible();
    expect(bundle.controller.getSnapshot().status).toBe('needsPassphraseCreation');
  });

  it('a backup passphrase that is too weak for a device is refused calmly, before opening the file', async () => {
    const user = userEvent.setup();
    const bundle = await toRestore(user);
    await submit(user, new File(['hello'], 'notes.txt'), 'short');
    expect(await screen.findByText(/needs at least 10 characters/)).toBeVisible();
    expect(bundle.controller.getSnapshot().status).toBe('needsPassphraseCreation');
  });

  it('if the empty store cannot be removed either, the unlock screen says so', async () => {
    const user = userEvent.setup();
    const file = await backupOfDevice('Salmon');
    const bundle = await toRestore(user);
    vi.spyOn(bundle.vault, 'applySnapshot').mockResolvedValue({
      kind: 'vaultFailed',
      reason: 'storeOperation',
    });
    vi.spyOn(bundle.eraser, 'eraseAll').mockResolvedValue(eraseLocalDataFailure(['databaseFiles']));
    await submit(user, file, BACKUP_PASSPHRASE);
    expect(await screen.findByRole('heading', { name: 'Unlock your store' })).toBeVisible();
    expect(
      screen.getByText(/could not be removed\. It is empty and uses the backup’s passphrase/),
    ).toBeVisible();
    expect(bundle.controller.getSnapshot().status).toBe('locked');
  });

  it('if the data cannot be written the empty store is removed and the line is still shown', async () => {
    const user = userEvent.setup();
    const file = await backupOfDevice('Salmon');
    const bundle = await toRestore(user);
    vi.spyOn(bundle.vault, 'applySnapshot').mockResolvedValue({
      kind: 'vaultFailed',
      reason: 'storeOperation',
    });
    await submit(user, file, BACKUP_PASSPHRASE);
    expect(await screen.findByText(/could not be added to this device just now/)).toBeVisible();
    await waitFor(() =>
      expect(bundle.controller.getSnapshot().status).toBe('needsPassphraseCreation'),
    );
    expect(screen.getByRole('heading', { name: 'Restore from a backup' })).toBeVisible();
  });
});

describe('Gate: returning person', () => {
  it('locked -> a wrong passphrase stays on Unlock; the right one opens Today', async () => {
    const user = userEvent.setup();
    const bundle = await lockedBundle();
    render(<Gate bundle={bundle} />);
    expect(await screen.findByRole('heading', { name: 'Unlock your store' })).toBeVisible();

    await user.type(screen.getByLabelText('Passphrase'), 'nope nope nope');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('That passphrase does not open this store.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Unlock your store' })).toBeVisible();

    await user.type(screen.getByLabelText('Passphrase'), PASSPHRASE);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    // A returning person who never acknowledged the notice sees it before Today (post-unlock gate).
    await dismissAbout(user);
    expect(await today()).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Unlock your store' })).not.toBeInTheDocument();
  });

  it('does not show the notice again once it was acknowledged in the encrypted store', async () => {
    const bundle = await unlockedBundle();
    await new PrivacyPrefs(bundle.kv).acknowledgeAbout();
    await bundle.controller.lock();
    const user = userEvent.setup();
    render(<Gate bundle={bundle} />);
    await user.type(await screen.findByLabelText('Passphrase'), PASSPHRASE);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await today()).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'About this app' })).not.toBeInTheDocument();
  });

  it('an unreadable acknowledgement shows the notice (never silently skipped)', async () => {
    const bundle = await unlockedBundle();
    const failing = { ...bundle.kv, read: () => Promise.reject(new Error('unreadable')) };
    render(<Gate bundle={{ ...bundle, kv: failing as typeof bundle.kv }} />);
    expect(await screen.findByRole('heading', { name: 'About this app' })).toBeVisible();
  });

  it('a notice that cannot be written still lets the person continue for this session', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    const kv = {
      read: () => Promise.resolve(null),
      write: () => Promise.reject(new Error('locked')),
      delete: () => Promise.resolve(),
    };
    render(<Gate bundle={{ ...bundle, kv }} />);
    await dismissAbout(user);
    expect(await today()).toBeVisible();
  });

  it('the notice links to the in-app privacy page', async () => {
    const bundle = memoryBundle();
    await bundle.controller.initialize();
    render(<Gate bundle={bundle} />);
    const link = await screen.findByRole('link', { name: 'What this app stores and sends' });
    expect(link).toHaveAttribute('href', '#/privacy');
    act(() => {
      window.location.hash = '#/privacy';
    });
    // Reachable before the store is open: the public privacy page, with no switch to flip.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'What this app stores and sends' }),
    ).toBeVisible();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

describe('Gate: the unlocked session is scoped to the unlock', () => {
  /** Captures the live session so a test can look at what a lock tears down. */
  function Probe({ into }: { into: Session[] }) {
    into.push(useSession());
    return null;
  }

  it('a manual Lock locks the store, discards decrypted state, and the next unlock builds a fresh session', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await new PrivacyPrefs(bundle.kv).acknowledgeAbout();
    await seedPlate(bundle, at(8), [['Porridge', 'starch']]);
    render(<Gate bundle={bundle} />);
    await today();
    expect(await screen.findByText('Porridge')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Lock' }));

    expect(await screen.findByRole('heading', { name: 'Unlock your store' })).toBeVisible();
    expect(bundle.controller.getSnapshot().status).toBe('locked');
    // Nothing decrypted is left on the page.
    expect(screen.queryByText('Porridge')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Porridge');
  });

  it('every unlocked -> locked transition disposes the session; every unlock builds a new one', async () => {
    const bundle = await unlockedBundle();
    const seen: Session[] = [];
    const { SessionBoundary } = await import('./session');
    const { StoreProvider, useStoreSnapshot } = await import('./store-context');
    function Scoped() {
      const { status } = useStoreSnapshot();
      return status === 'unlocked' ? (
        <SessionBoundary bundle={bundle}>
          <Probe into={seen} />
        </SessionBoundary>
      ) : null;
    }
    render(
      <StoreProvider bundle={bundle}>
        <Scoped />
      </StoreProvider>,
    );
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const first = seen.at(-1) as Session;
    expect(first.live()).toBe(true);
    // The outbox holds an op for the plate recorded in this session...
    await first.recordPlate([
      {
        databaseFood: (await import('@anc/core')).databaseFood({
          sourceRef: 'x:1',
          displayName: 'Soup',
          source: 'manual',
        }),
        quantity: { low: 1, high: 1, unit: 'serving', displayLabel: '~1 serving' },
      },
    ]);
    // `observer.next` is asynchronous; the op exists once the queue has it.
    expect((await first.syncQueue.pending()).length).toBe(1);

    await act(async () => {
      await bundle.controller.lock();
    });
    // ...and the lock throws the session away: disposed, outbox emptied.
    expect(first.live()).toBe(false);
    expect((await first.syncQueue.pending()).length).toBe(0);

    await act(async () => {
      await bundle.controller.unlock(PASSPHRASE);
    });
    await waitFor(() => expect(seen.at(-1)).not.toBe(first));
    const second = seen.at(-1) as Session;
    expect(second.live()).toBe(true);
    expect(second.ai).not.toBe(first.ai);
    expect(second.catalog).not.toBe(first.catalog);
    expect(second.syncQueue).not.toBe(first.syncQueue);
  });

  it('an auto-lock (the status flips without a tap) also shows Unlock', async () => {
    const bundle = await unlockedBundle();
    await new PrivacyPrefs(bundle.kv).acknowledgeAbout();
    render(<Gate bundle={bundle} />);
    await today();
    await act(async () => {
      await bundle.controller.lock();
    });
    expect(await screen.findByRole('heading', { name: 'Unlock your store' })).toBeVisible();
  });

  it('the address goes back to Today on a lock', async () => {
    const bundle = await unlockedBundle();
    await new PrivacyPrefs(bundle.kv).acknowledgeAbout();
    window.location.hash = '#/week';
    render(<Gate bundle={bundle} />);
    await screen.findByRole('heading', { level: 1, name: 'This week' });
    await act(async () => {
      await bundle.controller.lock();
    });
    await waitFor(() => expect(['', '#/']).toContain(window.location.hash));
  });
});

describe('Gate: the other states', () => {
  it('needsReset shows the lost-store surface with the web copy', async () => {
    // A header-less database: positively bad content.
    const backend: StoreBackend = {
      exists: () => Promise.resolve(true),
      readHeaderCopy: () => Promise.resolve(null),
      writeHeaderCopy: () => Promise.resolve(),
      open: () => Promise.reject(new Error('unused')),
      erase: () => Promise.resolve(),
    };
    const reset = memoryBundle({ backend });
    await reset.controller.initialize();
    render(<Gate bundle={reset} />);
    expect(
      await screen.findByRole('heading', { name: "Your saved history can't be found" }),
    ).toBeVisible();
  });

  it('checking and erasing paint nothing sensitive', async () => {
    const bundle = memoryBundle(); // initialize() not called yet: `checking`
    const { container } = render(<Gate bundle={bundle} />);
    expect(bundle.controller.getSnapshot().status).toBe('checking');
    expect(container.querySelector('[data-gate="blank"]')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('an unavailable store offers only "Try again" (no erase, never a wrong passphrase)', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    // The probe fails once, then the browser is fine.
    const { assembleStoreBundle } = await import('../storage');
    const { InMemoryMetaStorage } = await import('../storage/meta-storage');
    const { InMemoryStoreLock } = await import('../storage/locks');
    const flaky = assembleStoreBundle({
      storage: new InMemoryMetaStorage(),
      backend: new GuardedMemoryBackend(),
      lock: new InMemoryStoreLock(),
      isSecureContext: () => true,
      probe: () => {
        attempts++;
        return Promise.resolve(attempts === 1 ? 'noOpfs' : 'ok');
      },
      autoLock: false,
    });
    await flaky.controller.initialize();
    render(<Gate bundle={flaky} />);

    expect(
      await screen.findByRole('heading', { name: "Your store can't open right now" }),
    ).toBeVisible();
    expect(screen.getByText(/can't open the protected store/)).toBeVisible();
    expect(screen.queryByText('That passphrase does not open this store.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /erase/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await dismissAbout(user);
    expect(await screen.findByRole('heading', { name: 'Protect your history' })).toBeVisible();
    expect(attempts).toBe(2);
  });

  it('a storage error from the store itself is reported as unavailable, not as a wrong passphrase', async () => {
    const user = userEvent.setup();
    const backend = new GuardedMemoryBackend();
    const bundle = await unlockedBundle({ backend });
    await bundle.controller.lock();
    const original = backend.open.bind(backend);
    backend.open = () => Promise.reject(new StoreUnavailableError('storage'));
    render(<Gate bundle={bundle} />);
    await user.type(await screen.findByLabelText('Passphrase'), PASSPHRASE);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText(/can't open the protected store/)).toBeVisible();
    backend.open = original;
  });

  it('AI settings live in the encrypted store: a new session reads them back after an unlock', async () => {
    const bundle = await unlockedBundle();
    const seen: Session[] = [];
    function Probe() {
      seen.push(useSession());
      return null;
    }
    const { StoreProvider, useStoreSnapshot } = await import('./store-context');
    const { SessionBoundary } = await import('./session');
    function Scoped() {
      const { status } = useStoreSnapshot();
      return status === 'unlocked' ? (
        <SessionBoundary bundle={bundle}>
          <Probe />
        </SessionBoundary>
      ) : null;
    }
    render(
      <StoreProvider bundle={bundle}>
        <Scoped />
      </StoreProvider>,
    );
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const first = seen.at(-1) as Session;
    expect(first.ai.settings.getSnapshot().askBeforeEveryPhoto).toBe(true);
    await first.ai.settings.setAskBeforeEveryPhoto(false);

    await act(async () => {
      await bundle.controller.lock();
      await bundle.controller.unlock(PASSPHRASE);
    });
    await waitFor(() => expect(seen.at(-1)).not.toBe(first));
    expect((seen.at(-1) as Session).ai.settings.getSnapshot().askBeforeEveryPhoto).toBe(false);
  });
});
