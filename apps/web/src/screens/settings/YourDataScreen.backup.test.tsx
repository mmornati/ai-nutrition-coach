// Your data: the encrypted backup and its restore, over the real in-memory store and the real
// envelope code with a fast stand-in for Argon2id (the real KDF has its own tests and the e2e).
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type { VaultSnapshot } from '@anc/core';
import type { ExportDestination } from '../../export';
import { forgetAcknowledgedBeforeStore } from '../../app/about-ack';
import { at, renderInSession, seedPlate, unlockedBundle } from '../../app/testing';
import { KV_KEYS, type StoreBundle } from '../../storage';
import { createBackupService, type BackupService } from '../../sync/vault';
import { fastBackupService, fastKdf } from '../../sync/vault/testing';
import { YourDataScreen } from './YourDataScreen';

const PASSPHRASE = 'a backup passphrase';

interface Write {
  readonly filename: string;
  readonly bytes: Uint8Array;
}
function fakeDestination(outcome: 'downloaded' | 'cancelled' | 'throw' = 'downloaded') {
  const writes: Write[] = [];
  const destination: ExportDestination = {
    write: ({ filename, bytes }) => {
      if (outcome === 'throw') return Promise.reject(new Error('disk'));
      writes.push({ filename, bytes });
      return Promise.resolve(outcome);
    },
  };
  return { writes, destination };
}

async function open(
  options: {
    outcome?: 'downloaded' | 'cancelled' | 'throw';
    backup?: BackupService;
    seed?: (bundle: StoreBundle) => Promise<void>;
    bundle?: StoreBundle;
  } = {},
) {
  const bundle = options.bundle ?? (await unlockedBundle());
  await options.seed?.(bundle);
  const { writes, destination } = fakeDestination(options.outcome);
  await renderInSession(
    <YourDataScreen destination={destination} backup={options.backup ?? fastBackupService()} />,
    { bundle },
  );
  await screen.findByRole('heading', { level: 1, name: 'Your data' });
  return { bundle, writes };
}

const withSalmon = async (bundle: StoreBundle) => {
  await seedPlate(bundle, at(12, 0), [['Salmon', 'protein']]);
};
const snapshotOf = async (bundle: StoreBundle): Promise<VaultSnapshot> => {
  const read = await bundle.vault.readSnapshot();
  if (read.kind !== 'vault') throw new Error('read');
  return read.value;
};
const foods = async (bundle: StoreBundle) =>
  (await snapshotOf(bundle)).plates.flatMap((p) => p.entries.map((e) => e.displayName)).sort();

beforeEach(() => forgetAcknowledgedBeforeStore());
afterEach(() => vi.restoreAllMocks());

const field = (name: string) => screen.getByLabelText(name, { selector: 'input' });
const backupSection = () =>
  screen.getByRole('heading', { level: 2, name: 'Encrypted backup' }).closest('section')!;
const restoreSection = () =>
  screen.getByRole('heading', { level: 2, name: 'Restore from a backup' }).closest('section')!;

async function saveBackup(
  user: ReturnType<typeof userEvent.setup>,
  first = PASSPHRASE,
  second = first,
) {
  const section = within(backupSection());
  const a = section.getByLabelText('Backup passphrase', { selector: 'input' });
  const b = section.getByLabelText('Confirm backup passphrase', { selector: 'input' });
  await user.clear(a);
  await user.clear(b);
  if (first) await user.type(a, first);
  if (second) await user.type(b, second);
  await user.click(section.getByRole('button', { name: 'Save an encrypted backup' }));
  return { a, b };
}

describe('Your data: save an encrypted backup', () => {
  it('says what it holds, recommends the app passphrase and warns it cannot be recovered', async () => {
    await open();
    const section = within(backupSection());
    expect(section.getByText(/never includes your AI key or AI settings/)).toBeVisible();
    expect(section.getByText(/same passphrase as the one that unlocks this app/)).toBeVisible();
    expect(section.getByText(/the file cannot be opened — not by us, not by anyone/)).toBeVisible();
  });

  it('writes ai-nutrition-coach-YYYY-MM-DD.ancvault, clears the fields and says where it went', async () => {
    const user = userEvent.setup();
    const { writes, bundle } = await open({ seed: withSalmon });
    const { a, b } = await saveBackup(user);
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const name = `ai-nutrition-coach-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.ancvault`;
    expect(await within(backupSection()).findByText(name)).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.filename).toBe(name);
    await waitFor(() => expect(a).toHaveValue(''));
    expect(b).toHaveValue('');
    // The file is a backup that opens with that passphrase, and holds the plate.
    const reopened = await fastBackupService().open(writes[0]!.bytes, PASSPHRASE);
    expect(reopened.kind).toBe('opened');
    expect(JSON.stringify(reopened)).toContain('Salmon');
    expect(new TextDecoder().decode(writes[0]!.bytes)).not.toContain('Salmon');
    // It counts as an export: the date is kept and the "last export" line shows it.
    expect(await bundle.kv.read(KV_KEYS.exportLastAtUtc)).not.toBeNull();
    expect(await screen.findByText(/^Last export: \d/)).toBeVisible();
  });

  it('a weak passphrase and a mismatch never reach the file', async () => {
    const user = userEvent.setup();
    const { writes } = await open();
    await saveBackup(user, 'short', 'short');
    expect(within(backupSection()).getByText('Use at least 10 characters.')).toBeVisible();
    await saveBackup(user, PASSPHRASE, 'a backup passphras');
    expect(within(backupSection()).getByText("The two passphrases don't match.")).toBeVisible();
    await saveBackup(user, 'aaaaaaaaaaaaaaaa');
    expect(within(backupSection()).getByText('Use a few different characters.')).toBeVisible();
    expect(writes).toEqual([]);
  });

  it('a dismissed share sheet says nothing was saved and records no date', async () => {
    const user = userEvent.setup();
    const { bundle } = await open({ outcome: 'cancelled', seed: withSalmon });
    const { a } = await saveBackup(user);
    expect(await within(backupSection()).findByText('Nothing was saved.')).toBeVisible();
    expect(await bundle.kv.read(KV_KEYS.exportLastAtUtc)).toBeNull();
    expect(a).toHaveValue('');
  });

  it('a failed delivery is one calm line and the button works again', async () => {
    const user = userEvent.setup();
    await open({ outcome: 'throw', seed: withSalmon });
    await saveBackup(user);
    expect(await screen.findByText('The backup could not be saved. Try again.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save an encrypted backup' })).not.toHaveAttribute(
      'aria-busy',
    );
  });

  it('a cipher that cannot run is one calm line', async () => {
    const user = userEvent.setup();
    const backup = createBackupService({ kdf: () => Promise.reject(new Error('no wasm')) });
    const { writes } = await open({ backup, seed: withSalmon });
    await saveBackup(user);
    expect(await screen.findByText(/could not lock the backup just now/)).toBeVisible();
    expect(writes).toEqual([]);
  });

  it('shows the busy label while the key is derived', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = createBackupService({
      kdf: async (request) => {
        await gate;
        return fastKdf(request);
      },
    });
    await open({ backup: slow, seed: withSalmon });
    await saveBackup(user);
    const button = within(backupSection()).getByRole('button', { name: 'Preparing your backup…' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    release();
    await within(backupSection()).findByText(/ancvault/);
  });

  it('the reminder points at it: its button moves focus to the backup passphrase', async () => {
    const user = userEvent.setup();
    await open({ seed: withSalmon });
    expect(await screen.findByText(/An encrypted backup keeps your history safe/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Set up a backup' }));
    expect(
      within(backupSection()).getByLabelText('Backup passphrase', { selector: 'input' }),
    ).toHaveFocus();
  });
});

describe('Your data: restore from a backup', () => {
  async function backupFile(...names: string[]): Promise<File> {
    const source = await unlockedBundle();
    for (const [i, name] of names.entries()) {
      await seedPlate(source, at(8 + i, 0), [[name, 'protein']]);
    }
    const sealed = await fastBackupService().seal(await snapshotOf(source), PASSPHRASE);
    if (sealed.kind !== 'sealed') throw new Error('seal');
    return new File([sealed.bytes as BlobPart], 'backup.ancvault');
  }

  async function restore(
    user: ReturnType<typeof userEvent.setup>,
    file: File | null,
    passphrase: string,
  ) {
    const section = within(restoreSection());
    if (file) await user.upload(section.getByLabelText('Backup file', { selector: 'input' }), file);
    const input = section.getByLabelText('Backup passphrase', { selector: 'input' });
    if (passphrase) await user.type(input, passphrase);
    await user.click(section.getByRole('button', { name: 'Restore' }));
    return input;
  }

  it('says it is a merge and that nothing is removed for being absent', async () => {
    await open();
    expect(
      within(restoreSection()).getByText(/nothing is removed just because it is not in the backup/),
    ).toBeVisible();
  });

  it('merges the backup into the open store, empties the passphrase and says so', async () => {
    const user = userEvent.setup();
    const file = await backupFile('Rice', 'Egg');
    const { bundle } = await open({ seed: withSalmon });
    const input = await restore(user, file, PASSPHRASE);
    expect(await within(restoreSection()).findByText(/^Restored\./)).toBeVisible();
    expect(await foods(bundle)).toEqual(['Egg', 'Rice', 'Salmon']);
    expect(input).toHaveValue('');
  });

  it('a wrong passphrase: one calm line, nothing written, the file kept for another try', async () => {
    const user = userEvent.setup();
    const file = await backupFile('Rice');
    const { bundle } = await open({ seed: withSalmon });
    const before = await snapshotOf(bundle);
    const input = await restore(user, file, 'not the passphrase');
    expect(
      await within(restoreSection()).findByText(
        'That passphrase does not open this file, or the file is damaged. Nothing was changed.',
      ),
    ).toBeVisible();
    expect(await snapshotOf(bundle)).toEqual(before);
    expect(input).toHaveValue('');
    // Retry with the right one without choosing the file again.
    await user.type(input, PASSPHRASE);
    await user.click(within(restoreSection()).getByRole('button', { name: 'Restore' }));
    expect(await within(restoreSection()).findByText(/^Restored\./)).toBeVisible();
    expect(await foods(bundle)).toEqual(['Rice', 'Salmon']);
  });

  it('a file that is not a backup, and a file that is too large', async () => {
    const user = userEvent.setup();
    const { bundle } = await open({ seed: withSalmon });
    const before = await snapshotOf(bundle);
    await restore(user, new File(['date,kcal\n'], 'export.csv'), PASSPHRASE);
    expect(
      await within(restoreSection()).findByText(
        'That does not look like an AI Nutrition Coach backup. Nothing was changed.',
      ),
    ).toBeVisible();
    const huge = new File(['x'], 'huge.ancvault');
    Object.defineProperty(huge, 'size', { value: 64 * 1024 * 1024 });
    await restore(user, huge, PASSPHRASE);
    expect(
      await within(restoreSection()).findByText(
        'That file is too large to be a backup. Nothing was changed.',
      ),
    ).toBeVisible();
    expect(await snapshotOf(bundle)).toEqual(before);
  });

  it('asks for the file and the passphrase when they are missing', async () => {
    const user = userEvent.setup();
    await open();
    await restore(user, null, PASSPHRASE);
    expect(await within(restoreSection()).findByText('Choose a backup file first.')).toBeVisible();
    await user.clear(
      within(restoreSection()).getByLabelText('Backup passphrase', { selector: 'input' }),
    );
    await restore(user, await backupFile('Rice'), '');
    expect(await within(restoreSection()).findByText('Enter the backup passphrase.')).toBeVisible();
  });

  it('a backup from a newer version says to update, and changes nothing', async () => {
    const user = userEvent.setup();
    const source = await unlockedBundle();
    await seedPlate(source, at(9, 0), [['Rice', 'protein']]);
    const newer = { ...(await snapshotOf(source)), schemaVersion: 99 };
    const sealed = await fastBackupService().seal(newer as VaultSnapshot, PASSPHRASE);
    if (sealed.kind !== 'sealed') throw new Error('seal');
    const { bundle } = await open();
    await restore(user, new File([sealed.bytes as BlobPart], 'n.ancvault'), PASSPHRASE);
    expect(
      await within(restoreSection()).findByText(/newer version of AI Nutrition Coach/),
    ).toBeVisible();
    expect(await foods(bundle)).toEqual([]);
  });

  it('a store that refuses the snapshot is one calm line (clock ahead has its own)', async () => {
    const user = userEvent.setup();
    const file = await backupFile('Rice');
    const { bundle } = await open();
    vi.spyOn(bundle.vault, 'applySnapshot').mockResolvedValueOnce({
      kind: 'vaultFailed',
      reason: 'clockAhead',
    });
    await restore(user, file, PASSPHRASE);
    expect(
      await within(restoreSection()).findByText(/date well ahead of this device’s clock/),
    ).toBeVisible();
    vi.spyOn(bundle.vault, 'applySnapshot').mockResolvedValueOnce({
      kind: 'vaultFailed',
      reason: 'storeOperation',
    });
    await user.type(
      within(restoreSection()).getByLabelText('Backup passphrase', { selector: 'input' }),
      PASSPHRASE,
    );
    await user.click(within(restoreSection()).getByRole('button', { name: 'Restore' }));
    expect(
      await within(restoreSection()).findByText(/could not be added to this device just now/),
    ).toBeVisible();
  });
});

describe('Your data: accessibility', () => {
  it('has no axe violations with the backup and restore sections', async () => {
    const { bundle } = await open({ seed: withSalmon });
    expect(bundle).toBeDefined();
    expect(field('Backup file')).toBeVisible();
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
