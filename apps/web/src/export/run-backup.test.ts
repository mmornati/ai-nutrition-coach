import { describe, expect, it, vi } from 'vitest';
import { vaultFailed, vaultOk, type VaultSnapshot, type VaultStore } from '@anc/core';
import type { BackupService } from '../sync/vault';
import type { ExportDestination } from './export-destination';
import type { ExportHistory } from './export-history';
import { backupFilename, createRunBackup } from './run-backup';

const SNAPSHOT = { snapshotVersion: 1 } as unknown as VaultSnapshot;
const NOW = new Date(2026, 9, 3, 23, 59).getTime(); // 3 October 2026, local time

function setup(
  options: {
    read?: Awaited<ReturnType<VaultStore['readSnapshot']>>;
    seal?: Awaited<ReturnType<BackupService['seal']>> | 'throw';
    delivery?: 'downloaded' | 'shared' | 'cancelled' | 'throw';
  } = {},
) {
  const vault: VaultStore = {
    readSnapshot: () => Promise.resolve(options.read ?? vaultOk(SNAPSHOT)),
    applySnapshot: () => Promise.reject(new Error('not used')),
  };
  const seal = vi.fn(() =>
    options.seal === 'throw'
      ? Promise.reject(new Error('boom'))
      : Promise.resolve(options.seal ?? { kind: 'sealed' as const, bytes: Uint8Array.of(1, 2, 3) }),
  );
  const service: BackupService = { seal, open: () => Promise.reject(new Error('not used')) };
  const writes: { filename: string; mimeType: string; bytes: Uint8Array }[] = [];
  const destination: ExportDestination = {
    write: (input) => {
      if (options.delivery === 'throw') return Promise.reject(new Error('disk'));
      writes.push(input);
      return Promise.resolve(options.delivery ?? 'downloaded');
    },
  };
  const record = vi.fn(() => Promise.resolve());
  const history = { record } as unknown as ExportHistory;
  const run = createRunBackup({ vault, service, destination, history, clock: () => NOW });
  return { run, writes, record, seal };
}

describe('backupFilename', () => {
  it('is ai-nutrition-coach-YYYY-MM-DD.ancvault, the local date', () => {
    expect(backupFilename(NOW)).toBe('ai-nutrition-coach-2026-10-03.ancvault');
    expect(backupFilename(new Date(2026, 0, 5, 0, 1).getTime())).toBe(
      'ai-nutrition-coach-2026-01-05.ancvault',
    );
  });
});

describe('createRunBackup', () => {
  it('reads, seals with the passphrase, delivers the bytes and counts as an export', async () => {
    const { run, writes, record, seal } = setup();
    expect(await run('a long enough passphrase')).toEqual({
      kind: 'saved',
      filename: 'ai-nutrition-coach-2026-10-03.ancvault',
    });
    expect(seal).toHaveBeenCalledWith(SNAPSHOT, 'a long enough passphrase');
    expect(writes).toEqual([
      {
        filename: 'ai-nutrition-coach-2026-10-03.ancvault',
        mimeType: 'application/octet-stream',
        bytes: Uint8Array.of(1, 2, 3),
      },
    ]);
    expect(record).toHaveBeenCalledWith(NOW);
  });

  it('a dismissed share sheet records nothing', async () => {
    const { run, record } = setup({ delivery: 'cancelled' });
    expect(await run('p')).toEqual({ kind: 'cancelled' });
    expect(record).not.toHaveBeenCalled();
  });

  it.each([
    ['a locked store', { read: vaultFailed('locked') }, 'storeClosed'],
    ['an unreadable store', { read: vaultFailed('storeOperation') }, 'readFailed'],
    ['a vault that is too large', { seal: { kind: 'tooLarge' } }, 'tooLarge'],
    ['a cipher that cannot run', { seal: { kind: 'unavailable' } }, 'sealFailed'],
    ['a sealing that throws', { seal: 'throw' }, 'sealFailed'],
    ['a delivery that throws', { delivery: 'throw' }, 'deliveryFailed'],
  ] as const)(
    '%s: a typed failure, nothing delivered or recorded',
    async (_name, options, reason) => {
      const { run, writes, record } = setup(options as never);
      expect(await run('p')).toEqual({ kind: 'failed', reason });
      expect(writes).toEqual([]);
      expect(record).not.toHaveBeenCalled();
    },
  );
});
