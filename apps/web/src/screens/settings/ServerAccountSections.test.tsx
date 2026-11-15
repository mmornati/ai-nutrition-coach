// Your data, connected to a copy on this server: devices, the passphrase of the copy, the recovery
// key, the previous version and "delete my copy". Real store and crypto (a fast stand-in for
// Argon2id), a fake relay that behaves like the real one (the real one is covered by the relay
// tests and the Playwright specs).
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderInSession, unlockedBundle } from '../../app/testing';
import { createServerVault, readConnection, recoverServerCopy } from '../../sync';
import { FakeRelay } from '../../sync/relay/testing/fake-relay';
import { inertSync, offerOf, OPEN_CONFIG } from '../../sync/relay/testing/ui';
import { fastBackupService, fastKdf } from '../../sync/vault/testing';
import { YourDataScreen } from './YourDataScreen';

const PASS = 'a vault passphrase';

async function connected(otherDevice = false) {
  const relay = new FakeRelay();
  const bundle = await unlockedBundle();
  const made = await createServerVault({
    client: relay,
    kdf: fastKdf,
    vault: bundle.vault,
    kv: bundle.kv,
    handle: 'alice',
    passphrase: PASS,
    maxVaultBytes: 20 * 1024 * 1024,
  });
  if (made.kind !== 'created') throw new Error('create');
  if (otherDevice) await relay.login('alice', relay.vaults.get('alice')!.authKey);
  await renderInSession(<YourDataScreen backup={fastBackupService()} />, {
    bundle,
    session: {
      sync: { client: relay, kdf: fastKdf, offer: offerOf(OPEN_CONFIG), ...inertSync() },
    },
  });
  await screen.findByRole('heading', { level: 2, name: 'Backup on this server' });
  return { relay, bundle, recoveryKey: made.recoveryKey };
}

const group = (name: string) =>
  within(screen.getByRole('heading', { level: 2, name }).closest('section')!);

describe('the server copy, connected', () => {
  it('lists devices and signs out the others; the page passes axe', async () => {
    const user = userEvent.setup();
    await connected(true);
    await user.click(
      await within(
        await screen
          .findByRole('heading', { level: 2, name: 'Devices on this copy' })
          .then((h) => h.closest('section')!),
      ).findByRole('button', { name: 'Sign out' }),
    );
    await screen.findByText('Signed out.');
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('changes the passphrase of the copy: says which one, checks the old, refuses a weak new one', async () => {
    const user = userEvent.setup();
    const { relay } = await connected();
    const s = group('Passphrase of the server copy');
    expect(screen.getByText(/It is not the one that unlocks the app on this device/)).toBeVisible();
    const fill = async (current: string, next: string, again = next) => {
      for (const [label, value] of [
        ['Current passphrase of this copy', current],
        ['New passphrase for this copy', next],
        ['Confirm passphrase', again],
      ] as const) {
        const field = s.getByLabelText(label);
        await user.clear(field);
        await user.type(field, value);
      }
      await user.click(s.getByRole('button', { name: 'Change the passphrase of this copy' }));
    };
    const before = relay.vaults.get('alice')!.authKey;
    await fill('not the passphrase', 'pale harbour mist 7');
    expect(await screen.findByText('That is not the passphrase of this copy.')).toBeVisible();
    await fill(PASS, 'password1234');
    expect(await screen.findByText(/on lists of common passwords/)).toBeVisible();
    expect(relay.vaults.get('alice')!.authKey).toBe(before);
    await fill(PASS, 'pale harbour mist 7');
    expect(await screen.findByText(/The passphrase of the copy is changed/)).toBeVisible();
    expect(relay.vaults.get('alice')!.authKey).not.toBe(before);
  });

  it('adds a recovery key once, and the key recovers the copy and sets a new passphrase', async () => {
    const user = userEvent.setup();
    const { relay } = await connected();
    // A copy made with the app already has one; rotate it.
    const s = group('Recovery key');
    await user.type(s.getByLabelText('Current passphrase of this copy'), PASS);
    await user.click(s.getByRole('button', { name: 'Make a new recovery key' }));
    await screen.findByRole('heading', { level: 2, name: 'Your recovery key' });
    expect(await axe(document.body)).toHaveNoViolations();
    const key = document.querySelector('[data-recovery-key]')!.textContent!;
    await user.click(screen.getByRole('checkbox', { name: 'I have saved my recovery key' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    const recovered = await recoverServerCopy({
      client: relay,
      kdf: fastKdf,
      handle: 'alice',
      recoveryKey: key,
      newPassphrase: 'lamp ocean velvet tractor',
    });
    expect(recovered.kind).toBe('ok');
    expect(
      (
        await recoverServerCopy({
          client: relay,
          kdf: fastKdf,
          handle: 'alice',
          recoveryKey: 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA',
          newPassphrase: 'lamp ocean velvet tractor',
        })
      ).kind,
    ).toBe('failed');
  });

  it('deleting the copy needs the handle typed and the passphrase; this device goes back to "not backed up"', async () => {
    const user = userEvent.setup();
    const { relay, bundle } = await connected();
    const s = group('Delete the copy on this server');
    await user.type(s.getByLabelText(/^Type your handle/), 'someone');
    await user.type(s.getByLabelText('Current passphrase of this copy'), PASS);
    await user.click(s.getByRole('button', { name: 'Delete my copy from the server' }));
    expect(await screen.findByText('That is not your handle.')).toBeVisible();
    expect(relay.vaults.has('alice')).toBe(true);
    await user.clear(s.getByLabelText(/^Type your handle/));
    await user.type(s.getByLabelText(/^Type your handle/), 'alice');
    await user.click(s.getByRole('button', { name: 'Delete my copy from the server' }));
    await screen.findByText(/Your copy is deleted from the server/);
    expect(relay.vaults.has('alice')).toBe(false);
    await waitFor(async () => expect(await readConnection(bundle.kv)).toBeNull());
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Back up to this server' }),
    ).toBeVisible();
  });

  it('shows "previous version" only when the server holds one', async () => {
    await connected();
    expect(screen.queryByRole('heading', { level: 2, name: 'Previous version' })).toBeNull();
  });
});
