// Your data, with a relay on this server: back up to it (Case C), connect to the copy that is
// there (Case B: dry run, Combine, the profile question, Start fresh), and the connected state.
// Real store, real crypto (a fast stand-in for Argon2id), a fake relay that behaves like the real one.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type { VaultSnapshot } from '@anc/core';
import { forgetAcknowledgedBeforeStore } from '../../app/about-ack';
import { ServerHandoffContext, type ServerHandoff } from '../../app/server-handoff';
import { at, renderInSession, seedPlate, unlockedBundle } from '../../app/testing';
import { KV_KEYS, type StoreBundle } from '../../storage';
import { createServerVault, readConnection } from '../../sync';
import { FakeRelay } from '../../sync/relay/testing/fake-relay';
import { inertSync, offerOf, OPEN_CONFIG } from '../../sync/relay/testing/ui';
import { fastBackupService, fastKdf } from '../../sync/vault/testing';
import { YourDataScreen } from './YourDataScreen';

const VAULT_PASSPHRASE = 'a vault passphrase';

const snapshotOf = async (bundle: StoreBundle): Promise<VaultSnapshot> => {
  const read = await bundle.vault.readSnapshot();
  if (read.kind !== 'vault') throw new Error('read');
  return read.value;
};
const foods = async (bundle: StoreBundle) =>
  (await snapshotOf(bundle)).plates.flatMap((p) => p.entries.map((e) => e.displayName)).sort();

beforeEach(() => forgetAcknowledgedBeforeStore());
afterEach(() => vi.restoreAllMocks());

/** A device that has these plates and a vault on the relay under `alice`. */
async function remoteWith(relay: FakeRelay, ...names: string[]) {
  const source = await unlockedBundle();
  for (const [i, name] of names.entries())
    await seedPlate(source, at(8 + i, 0), [[name, 'protein']]);
  await source.kv.write(KV_KEYS.uiLocale, 'en');
  const made = await createServerVault({
    client: relay,
    kdf: fastKdf,
    vault: source.vault,
    kv: source.kv,
    handle: 'alice',
    passphrase: VAULT_PASSPHRASE,
    maxVaultBytes: 20 * 1024 * 1024,
  });
  if (made.kind !== 'created') throw new Error('create');
  return source;
}

async function open(
  options: {
    relay?: FakeRelay;
    config?: unknown | null;
    bundle?: StoreBundle;
    seed?: (b: StoreBundle) => Promise<void>;
    handoff?: ServerHandoff;
  } = {},
) {
  const relay = options.relay ?? new FakeRelay();
  const bundle = options.bundle ?? (await unlockedBundle());
  await options.seed?.(bundle);
  const wrapper = options.handoff
    ? ({ children }: { children: ReactNode }) => (
        <ServerHandoffContext.Provider value={options.handoff!}>
          {children}
        </ServerHandoffContext.Provider>
      )
    : undefined;
  const view = await renderInSession(<YourDataScreen backup={fastBackupService()} />, {
    bundle,
    session: {
      sync: {
        client: relay,
        kdf: fastKdf,
        offer: offerOf(options.config === undefined ? OPEN_CONFIG : options.config),
        ...inertSync(),
      },
    },
    ...(wrapper ? { wrapper } : {}),
  });
  await screen.findByRole('heading', { level: 1, name: 'Your data' });
  return { relay, bundle, view };
}

const section = (heading: string) =>
  screen.getByRole('heading', { level: 2, name: heading }).closest('section')!;
const heading2 = (name: string) => screen.queryByRole('heading', { level: 2, name });

async function fillBackup(
  user: ReturnType<typeof userEvent.setup>,
  handle: string | null,
  pass: string,
  confirm = pass,
) {
  const s = within(section('Back up to this server'));
  const type = async (label: string, text: string) => {
    const field = s.getByLabelText(label);
    await user.clear(field);
    if (text !== '') await user.type(field, text);
  };
  if (handle !== null) await type('Handle', handle);
  await type('Passphrase for this copy', pass);
  await type('Confirm passphrase', confirm);
  await user.click(s.getByRole('button', { name: 'Back up to this server' }));
}

async function find(user: ReturnType<typeof userEvent.setup>, handle: string, pass: string) {
  const s = within(section('Connect to this server’s copy'));
  await user.type(s.getByLabelText('Handle'), handle);
  await user.type(s.getByLabelText('Passphrase of the copy'), pass);
  await user.click(s.getByRole('button', { name: 'Find my copy' }));
}

describe('when this server has no relay', () => {
  it('shows nothing about it: the screen is what it was', async () => {
    await open({ config: null });
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Encrypted backup' })).toBeVisible(),
    );
    expect(heading2('Back up to this server')).toBeNull();
    expect(heading2('Connect to this server’s copy')).toBeNull();
    expect(screen.queryByText(/server/i)).toBeNull();
  });

  it('treats an invalid or unknown config as not offered', async () => {
    for (const config of [
      { enabled: true, v: 2 },
      { enabled: false },
      'on',
      { ...OPEN_CONFIG, identity: 'sso' },
    ]) {
      const { view } = await open({ config });
      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 2, name: 'Encrypted backup' })).toBeVisible(),
      );
      expect(heading2('Back up to this server')).toBeNull();
      view.unmount();
    }
  });
});

describe('Case C: back up to this server', () => {
  it('shows both ways in, and passes axe', async () => {
    const { view } = await open();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Back up to this server' }),
    ).toBeVisible();
    expect(heading2('Connect to this server’s copy')).toBeVisible();
    expect(await axe(view.container)).toHaveNoViolations();
  });

  it('creates the vault, connects the device and says so; nothing readable is sent', async () => {
    const user = userEvent.setup();
    const { relay, bundle } = await open({
      seed: async (b) => void (await seedPlate(b, at(12, 0), [['Salmon', 'protein']])),
    });
    await screen.findByRole('heading', { level: 2, name: 'Back up to this server' });
    await fillBackup(user, 'Alice', VAULT_PASSPHRASE);
    expect(await screen.findByText(/^Done\. Your data is backed up to this server/)).toBeVisible();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Backup on this server' }),
    ).toBeVisible();
    expect(screen.getByText('This device backs up to this server as alice.')).toBeVisible();
    expect(screen.getByText(/Everything on this device is backed up/)).toBeVisible();
    expect(heading2('Back up to this server')).toBeNull();
    expect(relay.vaults.get('alice')?.version).toBe(1);
    expect(await readConnection(bundle.kv)).toMatchObject({ handle: 'alice' });
    expect(relay.wire).not.toContain('Salmon');
    expect(relay.wire).not.toContain(VAULT_PASSPHRASE);
  });

  it('checks the form on the screen before any work: handle, strength, match', async () => {
    const user = userEvent.setup();
    const { relay } = await open();
    await screen.findByRole('heading', { level: 2, name: 'Back up to this server' });
    await fillBackup(user, '', VAULT_PASSPHRASE);
    expect(await screen.findByText('Enter a handle.')).toBeVisible();
    await fillBackup(user, 'no spaces!', VAULT_PASSPHRASE);
    expect(await screen.findByText(/A handle has 3 to 32 characters/)).toBeVisible();
    await fillBackup(user, 'alice', 'short');
    expect(await screen.findByText('Use at least 10 characters.')).toBeVisible();
    await fillBackup(user, null, VAULT_PASSPHRASE, 'something else entirely');
    expect(await screen.findByText("The two passphrases don't match.")).toBeVisible();
    expect(relay.requests).toEqual([]);
  });

  it('"handle taken" is named; the fields are emptied and no connection is made', async () => {
    const user = userEvent.setup();
    const relay = new FakeRelay();
    await remoteWith(relay, 'Porridge');
    const { bundle } = await open({ relay });
    await screen.findByRole('heading', { level: 2, name: 'Back up to this server' });
    await fillBackup(user, 'alice', 'another vault passphrase');
    expect(await screen.findByText(/^That handle is already taken on this server\./)).toBeVisible();
    const s = within(section('Back up to this server'));
    expect(s.getByLabelText('Passphrase for this copy')).toHaveValue('');
    expect(await readConnection(bundle.kv)).toBeNull();
  });

  it('says calmly when the server is unreachable, rate limited, or full', async () => {
    const user = userEvent.setup();
    const relay = new FakeRelay();
    await open({ relay });
    await screen.findByRole('heading', { level: 2, name: 'Back up to this server' });
    relay.offline = true;
    await fillBackup(user, 'alice', VAULT_PASSPHRASE);
    expect(await screen.findByText(/could not be reached\. Nothing was changed/)).toBeVisible();
    relay.offline = false;
    relay.rateLimited = true;
    await fillBackup(user, null, VAULT_PASSPHRASE);
    expect(
      await screen.findByText('Too many tries. Wait a few minutes, then try again.'),
    ).toBeVisible();
  });

  it('asks for an invite code only when the server does, and explains a closed server', async () => {
    const invite = await open({ config: { ...OPEN_CONFIG, signup: 'invite' } });
    expect(await screen.findByLabelText('Invite code')).toBeVisible();
    invite.view.unmount();
    await open({ config: { ...OPEN_CONFIG, signup: 'closed' } });
    expect(await screen.findByText(/is not taking new copies at the moment/)).toBeVisible();
    expect(screen.queryByLabelText('Confirm passphrase')).toBeNull();
    // Joining a copy that exists is still possible.
    expect(heading2('Connect to this server’s copy')).toBeVisible();
  });
});

describe('Case B: connect to the copy that is on this server', () => {
  const twoDevices = async (extra: (b: StoreBundle) => Promise<void>) => {
    const relay = new FakeRelay();
    await remoteWith(relay, 'Porridge', 'Salmon');
    return open({ relay, seed: extra });
  };

  it('one ambiguous line when nothing matches; rate limiting has its own', async () => {
    const user = userEvent.setup();
    const { relay } = await twoDevices(async () => undefined);
    await screen.findByRole('heading', { level: 2, name: 'Connect to this server’s copy' });
    await find(user, 'alice', 'not the passphrase');
    const none = 'Nothing on this server matches this handle and passphrase.';
    expect(await screen.findByText(none)).toBeVisible();
    const s = within(section('Connect to this server’s copy'));
    await user.clear(s.getByLabelText('Handle'));
    await find(user, 'nobody', VAULT_PASSPHRASE);
    expect(await screen.findByText(none)).toBeVisible();
    relay.rateLimited = true;
    await user.clear(s.getByLabelText('Handle'));
    await find(user, 'alice', VAULT_PASSPHRASE);
    expect(
      await screen.findByText('Too many tries. Wait a few minutes, then try again.'),
    ).toBeVisible();
    expect(screen.queryByText(none)).toBeNull();
  });

  it('shows the dry-run counts before anything is written, then Combine is the primary action', async () => {
    const user = userEvent.setup();
    const { bundle, relay, view } = await twoDevices(async (b) => {
      await seedPlate(b, at(9, 0), [['Toast', 'starch']]);
    });
    await screen.findByRole('heading', { level: 2, name: 'Connect to this server’s copy' });
    const before = await snapshotOf(bundle);
    await find(user, ' Alice ', VAULT_PASSPHRASE);
    expect(await screen.findByRole('heading', { level: 3, name: 'Found your copy' })).toBeVisible();
    expect(screen.getByText('On this server: 2 plates')).toBeVisible();
    expect(screen.getByText('On this device: 1 plate')).toBeVisible();
    expect(screen.getByText('Together: 3 plates')).toBeVisible();
    expect(await snapshotOf(bundle)).toEqual(before);
    expect(await readConnection(bundle.kv)).toBeNull();
    expect(relay.requests.some((r) => r.method === 'PUT')).toBe(false);
    expect(screen.getByRole('button', { name: 'Combine' })).toBeVisible();
    expect(await axe(view.container)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: 'Combine' }));
    expect(
      await screen.findByText(
        'Done. This device and the copy are combined, and the copy is up to date.',
      ),
    ).toBeVisible();
    expect(await foods(bundle)).toEqual(['Porridge', 'Salmon', 'Toast']);
    // The merged result was pushed on top of the copy.
    expect(relay.vaults.get('alice')?.version).toBe(2);
    expect(await readConnection(bundle.kv)).toMatchObject({ handle: 'alice', lastSeenVersion: 2 });
    expect(relay.wire).not.toContain('Toast');
  });

  it('counts plates that are already on the server', async () => {
    const user = userEvent.setup();
    const relay = new FakeRelay();
    const source = await remoteWith(relay, 'Porridge', 'Salmon');
    // This device already holds the server's plates (it restored earlier), plus one of its own.
    const bundle = await unlockedBundle();
    await bundle.vault.applySnapshot(await snapshotOf(source));
    await seedPlate(bundle, at(20, 0), [['Pasta', 'starch']]);
    await open({ relay, bundle });
    await screen.findByRole('heading', { level: 2, name: 'Connect to this server’s copy' });
    await find(user, 'alice', VAULT_PASSPHRASE);
    expect(
      await screen.findByText('On this device: 3 plates (2 already on the server)'),
    ).toBeVisible();
    expect(screen.getByText('Together: 3 plates')).toBeVisible();
  });

  it('asks which profile to keep when they differ by content, and Combine waits for the answer', async () => {
    const user = userEvent.setup();
    const relay = new FakeRelay();
    const source = await remoteWith(relay, 'Porridge');
    // The server copy's profile.
    await source.kv.write(KV_KEYS.profile, JSON.stringify({ ageBand: '18-29', sex: 'female' }));
    const synced = await snapshotOf(source);
    const vault = relay.vaults.get('alice')!;
    const { sealSnapshot, importVaultKey } = await import('../../sync/relay/crypto');
    const connection = (await readConnection(source.kv))!;
    const { decodeBase64Url } = await import('@anc/core');
    const key = await importVaultKey(decodeBase64Url(connection.vaultKey)!);
    const sealed = await sealSnapshot(key, connection.vaultId, 2, synced, 20 * 1024 * 1024);
    if (sealed.kind !== 'sealed') throw new Error('seal');
    vault.version = 2;
    vault.envelope = sealed.envelope;

    const { bundle } = await open({
      relay,
      seed: async (b) => {
        await b.kv.write(KV_KEYS.profile, JSON.stringify({ ageBand: '30-49', sex: 'female' }));
      },
    });
    await screen.findByRole('heading', { level: 2, name: 'Connect to this server’s copy' });
    await find(user, 'alice', VAULT_PASSPHRASE);
    expect(
      await screen.findByRole('group', { name: 'Which profile should be kept?' }),
    ).toBeVisible();
    expect(screen.getByText('Age range: 30-49 on this device, 18-29 on the server')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Combine' }));
    expect(await screen.findByText('Choose which profile to keep.')).toBeVisible();
    expect(await readConnection(bundle.kv)).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'The profile on the server' }));
    await user.click(screen.getByRole('button', { name: 'Combine' }));
    expect(await screen.findByText(/^Done\. This device and the copy are combined/)).toBeVisible();
    const entry = (await snapshotOf(bundle)).kv.find((e) => e.key === KV_KEYS.profile)!;
    expect(JSON.parse(entry.value)).toMatchObject({ ageBand: '18-29' });
  });

  it('"Cancel" forgets what was found and writes nothing', async () => {
    const user = userEvent.setup();
    const { bundle } = await twoDevices(async (b) => {
      await seedPlate(b, at(9, 0), [['Toast', 'starch']]);
    });
    await screen.findByRole('heading', { level: 2, name: 'Connect to this server’s copy' });
    await find(user, 'alice', VAULT_PASSPHRASE);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { level: 3, name: 'Found your copy' })).toBeNull();
    expect(await foods(bundle)).toEqual(['Toast']);
    expect(await readConnection(bundle.kv)).toBeNull();
  });

  it('refuses a copy from a newer version of the app without touching anything', async () => {
    const user = userEvent.setup();
    const relay = new FakeRelay();
    const source = await remoteWith(relay, 'Porridge');
    const { sealSnapshot, importVaultKey } = await import('../../sync/relay/crypto');
    const { decodeBase64Url } = await import('@anc/core');
    const connection = (await readConnection(source.kv))!;
    const key = await importVaultKey(decodeBase64Url(connection.vaultKey)!);
    const newer = { ...(await snapshotOf(source)), schemaVersion: 99 } as unknown as VaultSnapshot;
    const sealed = await sealSnapshot(key, connection.vaultId, 2, newer, 20 * 1024 * 1024);
    if (sealed.kind !== 'sealed') throw new Error('seal');
    relay.vaults.get('alice')!.version = 2;
    relay.vaults.get('alice')!.envelope = sealed.envelope;
    const { bundle } = await open({ relay });
    await screen.findByRole('heading', { level: 2, name: 'Connect to this server’s copy' });
    await find(user, 'alice', VAULT_PASSPHRASE);
    expect(await screen.findByText(/made by a newer version of AI Nutrition Coach/)).toBeVisible();
    expect(await readConnection(bundle.kv)).toBeNull();
  });

  describe('Start fresh, behind "Other options"', () => {
    const handoff = () => ({ begin: vi.fn(), cancel: vi.fn() });

    it('is not offered outside the app gate, and names what would be removed when it is', async () => {
      const user = userEvent.setup();
      const none = await twoDevices(async (b) => {
        await seedPlate(b, at(9, 0), [['Toast', 'starch']]);
        await seedPlate(b, at(10, 0), [['Rice', 'starch']]);
      });
      await screen.findByRole('heading', { level: 2, name: 'Connect to this server’s copy' });
      await find(user, 'alice', VAULT_PASSPHRASE);
      await screen.findByRole('heading', { level: 3, name: 'Found your copy' });
      expect(screen.queryByText('Other options')).toBeNull();
      none.view.unmount();

      const h = handoff();
      const relay = new FakeRelay();
      await remoteWith(relay, 'Porridge');
      const second = await open({
        relay,
        handoff: h,
        seed: async (b) => {
          await seedPlate(b, at(9, 0), [['Toast', 'starch']]);
          await seedPlate(b, at(10, 0), [['Rice', 'starch']]);
        },
      });
      await screen.findByRole('heading', { level: 2, name: 'Connect to this server’s copy' });
      await find(user, 'alice', VAULT_PASSPHRASE);
      await user.click(await screen.findByText('Other options'));
      expect(
        screen.getAllByText(
          'The 2 plates that are only on this device will be removed from this device.',
        ).length,
      ).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Save an encrypted backup first' })).toBeVisible();
      expect(await axe(second.view.container)).toHaveNoViolations();
    });

    it('asks first (the safe choice has focus), then hands the copy over and erases this device', async () => {
      const user = userEvent.setup();
      const h = handoff();
      const relay = new FakeRelay();
      await remoteWith(relay, 'Porridge');
      const { bundle } = await open({
        relay,
        handoff: h,
        seed: async (b) => void (await seedPlate(b, at(9, 0), [['Toast', 'starch']])),
      });
      await screen.findByRole('heading', { level: 2, name: 'Connect to this server’s copy' });
      await find(user, 'alice', VAULT_PASSPHRASE);
      await user.click(await screen.findByText('Other options'));
      await user.click(
        screen.getByRole('button', { name: 'Erase this device and restore from the server' }),
      );
      const dialog = await screen.findByRole('alertdialog', {
        name: 'Erase this device and restore from the server?',
      });
      // Keeping the device is the default, and changes nothing.
      await user.click(within(dialog).getByRole('button', { name: 'Keep this device as it is' }));
      expect(h.begin).not.toHaveBeenCalled();
      expect(await foods(bundle)).toEqual(['Toast']);

      await user.click(
        screen.getByRole('button', { name: 'Erase this device and restore from the server' }),
      );
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: 'Erase and restore',
        }),
      );
      await waitFor(() => expect(h.begin).toHaveBeenCalledTimes(1));
      expect(h.begin.mock.calls[0]?.[1]).toBe(VAULT_PASSPHRASE);
      await waitFor(() => expect(bundle.controller.getSnapshot().status).not.toBe('unlocked'));
    });

    it('checks the passphrase before erasing: a copy whose passphrase is too weak leaves the device untouched', async () => {
      const user = userEvent.setup();
      const h = handoff();
      const relay = new FakeRelay();
      // A copy made elsewhere under a passphrase this app would not accept for a device.
      const weak = 'short';
      const source = await unlockedBundle();
      await seedPlate(source, at(8, 0), [['Porridge', 'protein']]);
      const { derivePassphraseKeys, newVaultKeyBytes, importVaultKey, sealSnapshot, wrapVaultKey } =
        await import('../../sync/relay/crypto');
      const { encodeBase64Url } = await import('@anc/core');
      const salt = new Uint8Array(16).fill(7);
      const keys = await derivePassphraseKeys(fastKdf, weak, salt);
      const keyBytes = newVaultKeyBytes();
      const vaultId = encodeBase64Url(new Uint8Array(16).fill(9));
      const sealed = await sealSnapshot(
        await importVaultKey(keyBytes),
        vaultId,
        1,
        await snapshotOf(source),
        20 * 1024 * 1024,
      );
      if (sealed.kind !== 'sealed') throw new Error('seal');
      const response = await relay.signup({
        handle: 'weakling',
        salt: encodeBase64Url(salt),
        authKey: encodeBase64Url(keys.authKey),
        wrappedKey: await wrapVaultKey(keys.kek, vaultId, keyBytes),
        envelope: sealed.envelope,
      });
      expect(response.kind).toBe('ok');

      const { bundle } = await open({
        relay,
        handoff: h,
        seed: async (b) => void (await seedPlate(b, at(9, 0), [['Toast', 'starch']])),
      });
      await screen.findByRole('heading', { level: 2, name: 'Connect to this server’s copy' });
      await find(user, 'weakling', weak);
      await user.click(await screen.findByText('Other options'));
      await user.click(
        screen.getByRole('button', { name: 'Erase this device and restore from the server' }),
      );
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: 'Erase and restore',
        }),
      );
      expect(
        await screen.findByText(/^Starting fresh makes the passphrase of this copy/),
      ).toBeVisible();
      expect(h.begin).not.toHaveBeenCalled();
      expect(bundle.controller.getSnapshot().status).toBe('unlocked');
      expect(await foods(bundle)).toEqual(['Toast']);
    });

    it('does not keep the copy’s passphrase once Combine was chosen: Start fresh asks to find the copy again', async () => {
      const user = userEvent.setup();
      const h = handoff();
      const relay = new FakeRelay();
      await remoteWith(relay, 'Porridge');
      const { bundle } = await open({
        relay,
        handoff: h,
        seed: async (b) => void (await seedPlate(b, at(9, 0), [['Toast', 'starch']])),
      });
      await screen.findByRole('heading', { level: 2, name: 'Connect to this server’s copy' });
      await find(user, 'alice', VAULT_PASSPHRASE);
      // Combine fails (the store would not take the copy), so the person is still looking at it.
      vi.spyOn(bundle.vault, 'applySnapshot').mockResolvedValueOnce({
        kind: 'vaultFailed',
        reason: 'locked',
      });
      await user.click(await screen.findByRole('button', { name: 'Combine' }));
      await screen.findByText(/^The copy opened, but it could not be added/);
      await user.click(screen.getByText('Other options'));
      await user.click(
        screen.getByRole('button', { name: 'Erase this device and restore from the server' }),
      );
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: 'Erase and restore',
        }),
      );
      expect(await screen.findByText(/^To start fresh, find your copy again/)).toBeVisible();
      expect(h.begin).not.toHaveBeenCalled();
      expect(await foods(bundle)).toEqual(['Toast']);
    });

    it('the backup button moves to the encrypted-backup field', async () => {
      const user = userEvent.setup();
      const relay = new FakeRelay();
      await remoteWith(relay, 'Porridge');
      await open({ relay, handoff: handoff() });
      await screen.findByRole('heading', { level: 2, name: 'Connect to this server’s copy' });
      await find(user, 'alice', VAULT_PASSPHRASE);
      await user.click(await screen.findByText('Other options'));
      await user.click(screen.getByRole('button', { name: 'Save an encrypted backup first' }));
      expect(within(section('Encrypted backup')).getByLabelText('Backup passphrase')).toHaveFocus();
    });
  });
});

describe('connected', () => {
  async function connected() {
    const relay = new FakeRelay();
    await remoteWith(relay, 'Porridge');
    const bundle = await unlockedBundle();
    const opened = await (
      await import('../../sync')
    ).openServerCopy({
      client: relay,
      kdf: fastKdf,
      handle: 'alice',
      passphrase: VAULT_PASSPHRASE,
    });
    if (opened.kind !== 'opened') throw new Error('open');
    await (
      await import('../../sync')
    ).joinServerCopy({
      vault: bundle.vault,
      kv: bundle.kv,
      copy: opened.copy,
      choice: { profile: null },
    });
    return await open({ relay, bundle });
  }

  it('shows the state of the backup and passes axe', async () => {
    const { view } = await connected();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Backup on this server' }),
    ).toBeVisible();
    expect(screen.getByText('This device backs up to this server as alice.')).toBeVisible();
    expect(screen.getByText('Everything on this device is backed up.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeVisible();
    expect(heading2('Back up to this server')).toBeNull();
    // The shell no longer says "nothing leaves home" while an encrypted copy is kept on the server.
    expect(
      screen.getByText('All plates stored on this device, with an encrypted copy on this server.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nothing leaves home/)).toBeNull();
    expect(await axe(view.container)).toHaveNoViolations();
  });

  it('"Back up now" sends what is waiting and says so', async () => {
    const user = userEvent.setup();
    const { relay, bundle } = await connected();
    await screen.findByRole('heading', { level: 2, name: 'Backup on this server' });
    await seedPlate(bundle, at(12, 0), [['Salmon', 'protein']]);
    expect(await screen.findByText('Changes on this device will be sent shortly.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(await screen.findByText('Done. Everything on this device is backed up.')).toBeVisible();
    expect(relay.vaults.get('alice')?.version).toBe(2);
  });

  it('says when the server cannot be reached, and that nothing is lost', async () => {
    const user = userEvent.setup();
    const { relay, bundle } = await connected();
    await screen.findByRole('heading', { level: 2, name: 'Backup on this server' });
    await seedPlate(bundle, at(12, 0), [['Salmon', 'protein']]);
    relay.offline = true;
    await user.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(await screen.findByText(/This server cannot be reached right now/)).toBeVisible();
  });

  it('stopping makes only this device forget the connection', async () => {
    const user = userEvent.setup();
    const { relay, bundle } = await connected();
    await screen.findByRole('heading', { level: 2, name: 'Backup on this server' });
    await user.click(screen.getByRole('button', { name: 'Stop backing up from this device' }));
    expect(
      await screen.findByText(
        'This device no longer backs up to the server. The copy on the server was not touched.',
      ),
    ).toBeVisible();
    expect(await readConnection(bundle.kv)).toBeNull();
    expect(relay.vaults.has('alice')).toBe(true);
    // The two ways in are back.
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Back up to this server' }),
    ).toBeVisible();
  });
});
