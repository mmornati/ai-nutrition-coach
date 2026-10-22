// Restoring: the file is opened and validated completely before anything is written, and a failure
// at any step leaves the device exactly as it was. Over the real in-memory store and the real
// envelope code (fast KDF).
import { describe, expect, it, vi } from 'vitest';
import {
  eraseLocalDataFailure,
  formatHlc,
  MAX_DRIFT_MS,
  vaultFailed,
  type VaultSnapshot,
} from '@anc/core';
import { memoryBundle, seedPlate, unlockedBundle } from '../../app/testing';
import type { StoreBundle } from '../../storage';
import type { BackupService } from './backup';
import { restoreIntoNewStore, restoreIntoStore } from './restore';
import { fastBackupService } from './testing';

const BACKUP_PASSPHRASE = 'the backup passphrase';
const service = fastBackupService();

const snapshotOf = async (bundle: StoreBundle): Promise<VaultSnapshot> => {
  const read = await bundle.vault.readSnapshot();
  if (read.kind !== 'vault') throw new Error('read');
  return read.value;
};
const platesOf = async (bundle: StoreBundle): Promise<readonly string[]> =>
  (await snapshotOf(bundle)).plates.flatMap((p) => p.entries.map((e) => e.displayName)).sort();

/** A backup file (as a Blob, like a picked file) of a device that logged these foods. */
async function backupOf(...foods: string[]): Promise<{ file: File; source: StoreBundle }> {
  const source = await unlockedBundle();
  let at = Date.now() - 1_000;
  for (const food of foods) await seedPlate(source, (at += 10), [[food, 'protein']]);
  const sealed = await service.seal(await snapshotOf(source), BACKUP_PASSPHRASE);
  if (sealed.kind !== 'sealed') throw new Error('seal');
  return { file: new File([sealed.bytes as BlobPart], 'a.ancvault'), source };
}

describe('restoreIntoStore (Your data: a merge)', () => {
  it('adds what the backup holds and removes nothing already here', async () => {
    const { file } = await backupOf('Salmon', 'Rice');
    const target = await unlockedBundle();
    await seedPlate(target, Date.now() - 500, [['Apple', 'vegFruit']]);
    const result = await restoreIntoStore({
      service,
      vault: target.vault,
      file,
      passphrase: BACKUP_PASSPHRASE,
    });
    expect(result).toEqual({ kind: 'restored' });
    expect(await platesOf(target)).toEqual(['Apple', 'Rice', 'Salmon']);
  });

  it('is idempotent: restoring twice changes nothing more', async () => {
    const { file } = await backupOf('Salmon');
    const target = await unlockedBundle();
    const args = { service, vault: target.vault, file, passphrase: BACKUP_PASSPHRASE };
    await restoreIntoStore(args);
    const once = await snapshotOf(target);
    await restoreIntoStore(args);
    expect(await snapshotOf(target)).toEqual(once);
  });

  it('a wrong passphrase writes nothing', async () => {
    const { file } = await backupOf('Salmon');
    const target = await unlockedBundle();
    await seedPlate(target, Date.now(), [['Apple', 'vegFruit']]);
    const before = await snapshotOf(target);
    const apply = vi.spyOn(target.vault, 'applySnapshot');
    expect(
      await restoreIntoStore({
        service,
        vault: target.vault,
        file,
        passphrase: 'not the passphrase',
      }),
    ).toEqual({ kind: 'failed', failure: 'wrongPassphraseOrDamaged' });
    expect(apply).not.toHaveBeenCalled();
    expect(await snapshotOf(target)).toEqual(before);
  });

  it('a file that is not a backup, and one the browser cannot read, write nothing', async () => {
    const target = await unlockedBundle();
    const apply = vi.spyOn(target.vault, 'applySnapshot');
    const junk = new File(['plates,csv'], 'export.csv');
    expect(
      await restoreIntoStore({
        service,
        vault: target.vault,
        file: junk,
        passphrase: BACKUP_PASSPHRASE,
      }),
    ).toEqual({ kind: 'failed', failure: 'notABackup' });
    const unreadable = {
      size: 1,
      arrayBuffer: () => Promise.reject(new Error('io')),
    } as unknown as Blob;
    expect(
      await restoreIntoStore({ service, vault: target.vault, file: unreadable, passphrase: 'x' }),
    ).toEqual({ kind: 'failed', failure: 'unreadable' });
    expect(apply).not.toHaveBeenCalled();
  });

  it('a service that throws is "unavailable"', async () => {
    const boom: BackupService = { seal: service.seal, open: () => Promise.reject(new Error('x')) };
    const target = await unlockedBundle();
    expect(
      await restoreIntoStore({
        service: boom,
        vault: target.vault,
        file: new File(['{}'], 'a'),
        passphrase: 'x',
      }),
    ).toEqual({ kind: 'failed', failure: 'unavailable' });
  });

  it('reports a store that refuses the snapshot, typed', async () => {
    const { file } = await backupOf('Salmon');
    const vault = {
      readSnapshot: () => Promise.reject(new Error('unused')),
      applySnapshot: () => Promise.resolve(vaultFailed('clockAhead')),
    };
    expect(await restoreIntoStore({ service, vault, file, passphrase: BACKUP_PASSPHRASE })).toEqual(
      {
        kind: 'notApplied',
        reason: 'clockAhead',
      },
    );
  });
});

describe('restoreIntoNewStore (the create-passphrase screen)', () => {
  const emptyDevice = async (): Promise<StoreBundle> => {
    const bundle = memoryBundle();
    await bundle.controller.initialize();
    expect(bundle.controller.getSnapshot().status).toBe('needsPassphraseCreation');
    return bundle;
  };
  const restore = (bundle: StoreBundle, file: File, passphrase: string) =>
    restoreIntoNewStore({
      service,
      file,
      passphrase,
      createStore: (p) => bundle.controller.createStore(p),
      vault: bundle.vault,
      eraser: bundle.eraser,
      now: Date.now,
    });

  it('opens first, then creates the store with the backup passphrase, then fills it', async () => {
    const { file, source } = await backupOf('Salmon', 'Rice');
    const device = await emptyDevice();
    expect(await restore(device, file, BACKUP_PASSPHRASE)).toEqual({ kind: 'restored' });
    expect(device.controller.getSnapshot().status).toBe('unlocked');
    expect(await snapshotOf(device)).toEqual(await snapshotOf(source));
    // The backup's passphrase is now this device's: lock, and it unlocks.
    await device.controller.lock();
    expect((await device.controller.unlock(BACKUP_PASSPHRASE)).kind).toBe('unlocked');
  });

  it('a wrong passphrase creates NO store and leaves the screen as it was', async () => {
    const { file } = await backupOf('Salmon');
    const device = await emptyDevice();
    const create = vi.spyOn(device.controller, 'createStore');
    expect(await restore(device, file, 'another long passphrase')).toEqual({
      kind: 'failed',
      failure: 'wrongPassphraseOrDamaged',
    });
    expect(create).not.toHaveBeenCalled();
    expect(device.controller.getSnapshot().status).toBe('needsPassphraseCreation');
  });

  it('a damaged or foreign file creates no store either', async () => {
    const device = await emptyDevice();
    const create = vi.spyOn(device.controller, 'createStore');
    for (const [contents, failure] of [
      ['name,kcal\nrice,130', 'notABackup'],
      ['', 'notABackup'],
    ] as const) {
      const result = await restore(device, new File([contents], 'x'), BACKUP_PASSPHRASE);
      expect(result).toEqual({ kind: 'failed', failure });
    }
    expect(create).not.toHaveBeenCalled();
    expect(device.controller.getSnapshot().status).toBe('needsPassphraseCreation');
  });

  it('a backup passphrase under the app floor is refused calmly, before the file is even opened', async () => {
    const open = vi.fn(service.open);
    const spying: BackupService = { seal: service.seal, open };
    const device = await emptyDevice();
    const result = await restoreIntoNewStore({
      service: spying,
      file: new File(['x'], 'a'),
      passphrase: 'short',
      createStore: (p) => device.controller.createStore(p),
      vault: device.vault,
      eraser: device.eraser,
      now: Date.now,
    });
    expect(result).toEqual({ kind: 'passphraseRejected', issue: 'tooShort' });
    expect(open).not.toHaveBeenCalled();
    expect(device.controller.getSnapshot().status).toBe('needsPassphraseCreation');
  });

  it('a backup stamped beyond the clock-drift bound creates no store', async () => {
    const { source } = await backupOf('Salmon');
    const base = await snapshotOf(source);
    const ahead = formatHlc({
      wallMs: Date.now() + 3 * MAX_DRIFT_MS,
      counter: 0,
      deviceId: '0123456789abcdef',
    });
    const future: VaultSnapshot = {
      ...base,
      kv: [{ key: 'ui.locale', value: 'fr', updatedAtHlc: ahead }],
    };
    const stub: BackupService = {
      seal: service.seal,
      open: () => Promise.resolve({ kind: 'opened', snapshot: future }),
    };
    const device = await emptyDevice();
    const create = vi.spyOn(device.controller, 'createStore');
    const result = await restoreIntoNewStore({
      service: stub,
      file: new File(['x'], 'a'),
      passphrase: BACKUP_PASSPHRASE,
      createStore: (p) => device.controller.createStore(p),
      vault: device.vault,
      eraser: device.eraser,
      now: Date.now,
    });
    expect(result).toEqual({ kind: 'clockAhead' });
    expect(create).not.toHaveBeenCalled();
    expect(device.controller.getSnapshot().status).toBe('needsPassphraseCreation');
  });

  it('a store that cannot be created reports the controller’s reason and writes nothing', async () => {
    const { file } = await backupOf('Salmon');
    const device = await emptyDevice();
    const apply = vi.spyOn(device.vault, 'applySnapshot');
    const result = await restoreIntoNewStore({
      service,
      file,
      passphrase: BACKUP_PASSPHRASE,
      createStore: () => Promise.resolve({ kind: 'inUseElsewhere' }),
      vault: device.vault,
      eraser: device.eraser,
      now: Date.now,
    });
    expect(result).toEqual({ kind: 'createFailed', outcome: { kind: 'inUseElsewhere' } });
    expect(apply).not.toHaveBeenCalled();
  });

  it('if the empty store cannot be removed either, it says so instead of "nothing changed"', async () => {
    const { file } = await backupOf('Salmon');
    const device = await emptyDevice();
    vi.spyOn(device.vault, 'applySnapshot').mockResolvedValue(vaultFailed('storeOperation'));
    for (const failing of [
      () => Promise.resolve(eraseLocalDataFailure(['databaseFiles'])),
      () => Promise.reject(new Error('io')),
    ]) {
      vi.spyOn(device.eraser, 'eraseAll').mockImplementationOnce(failing);
      const result = await restoreIntoNewStore({
        service,
        file,
        passphrase: BACKUP_PASSPHRASE,
        createStore: (p) => device.controller.createStore(p),
        vault: device.vault,
        eraser: device.eraser,
        now: Date.now,
      });
      expect(result).toEqual({ kind: 'storeProblemNotRemoved' });
      // Reset for the second round.
      if (device.controller.getSnapshot().status !== 'needsPassphraseCreation') {
        await device.eraser.eraseAll();
      }
    }
  });

  it('if the data cannot be written, the empty store is removed again (no half-restore)', async () => {
    const { file } = await backupOf('Salmon');
    const device = await emptyDevice();
    vi.spyOn(device.vault, 'applySnapshot').mockResolvedValue(vaultFailed('storeOperation'));
    expect(await restore(device, file, BACKUP_PASSPHRASE)).toEqual({ kind: 'storeProblem' });
    expect(device.controller.getSnapshot().status).toBe('needsPassphraseCreation');
  });
});
