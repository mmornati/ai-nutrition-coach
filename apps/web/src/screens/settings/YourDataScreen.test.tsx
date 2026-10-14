// Port of the earlier client: the
// honest protection line, the durable-storage line, export (plaintext note, last export, the one
// quiet suggestion), the lock controls and the confirmed erase.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { CSV_HEADER, type ExportDestination } from '../../export';
import {
  forgetAcknowledgedBeforeStore,
  rememberAcknowledgedBeforeStore,
  wasAcknowledgedBeforeStore,
} from '../../app/about-ack';
import { useDay } from '../../app/day-context';
import { at, renderInSession, seedPlate, unlockedBundle } from '../../app/testing';
import { KV_KEYS, type StoreBundle } from '../../storage';
import { YourDataScreen } from './YourDataScreen';

interface Write {
  readonly filename: string;
  readonly mimeType: string;
  readonly text: string;
}

function fakeDestination(outcome: 'downloaded' | 'cancelled' | 'throw' = 'downloaded') {
  const writes: Write[] = [];
  const destination: ExportDestination = {
    write: ({ filename, mimeType, bytes }) => {
      if (outcome === 'throw') return Promise.reject(new Error('disk'));
      writes.push({ filename, mimeType, text: new TextDecoder().decode(bytes) });
      return Promise.resolve(outcome);
    },
  };
  return { writes, destination };
}

async function open(
  options: {
    outcome?: 'downloaded' | 'cancelled' | 'throw';
    durable?: 'persisted' | 'notPersisted' | 'unsupported';
    seed?: (bundle: StoreBundle) => Promise<void>;
  } = {},
) {
  const bundle = await unlockedBundle(
    options.durable ? { requestDurable: () => Promise.resolve(options.durable!) } : {},
  );
  await options.seed?.(bundle);
  const { writes, destination } = fakeDestination(options.outcome);
  await renderInSession(<YourDataScreen destination={destination} />, { bundle });
  await screen.findByRole('heading', { level: 1, name: 'Your data' });
  return { bundle, writes };
}

const withSalmon = async (bundle: StoreBundle) => {
  await seedPlate(bundle, at(12, 0), [['Salmon', 'protein']]);
};

beforeEach(() => forgetAcknowledgedBeforeStore());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('YourDataScreen: protection', () => {
  it('names the real cipher (not AES), the passphrase key and that it cannot be recovered', async () => {
    await open();
    const text = document.body.textContent ?? '';
    expect(text).toContain('ChaCha20-Poly1305');
    expect(text).not.toContain('AES');
    expect(text).toContain('made from your passphrase');
    expect(text).toContain('cannot be recovered');
    expect(text).toContain('Your AI key and settings are kept inside the same encrypted store');
  });

  it('shows the browser answer to durable storage, in one plain line', async () => {
    await open({ durable: 'persisted' });
    expect(screen.getByText('Storage: protected from automatic clean-up.')).toBeVisible();
  });

  it('not protected: says so and asks for regular exports', async () => {
    await open({ durable: 'notPersisted' });
    expect(screen.getByText(/the browser may clear this data if space runs low/)).toBeVisible();
    expect(screen.getByText(/export regularly/)).toBeVisible();
  });

  it('unsupported: no line at all', async () => {
    await open({ durable: 'unsupported' });
    expect(screen.queryByText(/Storage:/)).toBeNull();
  });
});

describe('YourDataScreen: export', () => {
  it('says exports are plain, unencrypted files and that Erase cannot delete a file already shared', async () => {
    await open();
    expect(
      screen.getByText(/Exports are plain, unencrypted files: keep them somewhere you trust\./),
    ).toBeVisible();
    expect(
      screen.getByText(
        /Erasing your data cannot delete a file you have already downloaded or shared\./,
      ),
    ).toBeVisible();
  });

  it('exports CSV: a header and one row per entry, then one calm line and the last-export date', async () => {
    const user = userEvent.setup();
    const { writes, bundle } = await open({ seed: withSalmon });
    expect(screen.getByRole('radio', { name: 'CSV' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'All history' })).toBeChecked();
    expect(screen.getByText('Last export: never')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Export' }));
    const line = await screen.findByText(/^exported:/);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.filename).toMatch(/^\d{4}-\d{2}-\d{2}-ai-nutrition-coach\.csv$/);
    expect(writes[0]?.mimeType).toBe('text/csv;charset=utf-8');
    const rows = (writes[0]?.text ?? '').trim().split('\n');
    expect(rows[0]).toBe(CSV_HEADER);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('Salmon');
    expect(line).toHaveTextContent(writes[0]?.filename ?? 'x');
    await waitFor(() => expect(screen.queryByText('Last export: never')).toBeNull());
    expect(screen.getByText(/^Last export: /)).toBeVisible();
    expect(await bundle.kv.read(KV_KEYS.exportLastAtUtc)).not.toBeNull();
  });

  it('exports JSON as the {"plates": [...]} envelope', async () => {
    const user = userEvent.setup();
    const { writes } = await open({ seed: withSalmon });
    await user.click(screen.getByRole('radio', { name: 'JSON' }));
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await screen.findByText(/^exported:/);
    expect(writes[0]?.mimeType).toBe('application/json');
    expect(Object.keys(JSON.parse(writes[0]?.text ?? '{}') as object)).toEqual(['plates']);
  });

  it('an empty history exports a header-only file', async () => {
    const user = userEvent.setup();
    const { writes } = await open();
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await screen.findByText(/^exported:/);
    expect((writes[0]?.text ?? '').trim()).toBe(CSV_HEADER);
  });

  it('scope: Today and This week read only their days', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 20, 0) });
    const user = userEvent.setup();
    const { writes } = await open({
      seed: async (bundle) => {
        await seedPlate(bundle, at(12, 0), [['Salmon', 'protein']]);
        await seedPlate(bundle, at(12, 0, -3), [['Oats', 'starch']]);
        await seedPlate(bundle, at(12, 0, -20), [['Old rice', 'starch']]);
      },
    });
    await user.click(screen.getByRole('radio', { name: 'Today' }));
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.text).toContain('Salmon');
    expect(writes[0]?.text).not.toContain('Oats');

    await user.click(screen.getByRole('radio', { name: 'This week' }));
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]?.text).toContain('Salmon');
    expect(writes[1]?.text).toContain('Oats');
    expect(writes[1]?.text).not.toContain('Old rice');
  });

  it('the "Today" scope is the real today even after another day was selected', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 20, 0) });
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await seedPlate(bundle, at(12, 0), [['Salmon', 'protein']]);
    await seedPlate(bundle, at(12, 0, -1), [['Yesterday oats', 'starch']]);
    const { writes, destination } = fakeDestination();
    function Pick() {
      const day = useDay();
      return (
        <button type="button" onClick={() => day.select(at(12, 0, -1))}>
          pick yesterday
        </button>
      );
    }
    await renderInSession(
      <>
        <Pick />
        <YourDataScreen destination={destination} />
      </>,
      { bundle },
    );
    await screen.findByRole('heading', { level: 1, name: 'Your data' });
    await user.click(screen.getByRole('button', { name: 'pick yesterday' }));
    await user.click(screen.getByRole('radio', { name: 'Today' }));
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.text).toContain('Salmon');
    expect(writes[0]?.text).not.toContain('Yesterday oats');
  });

  it('a dismissed share sheet says nothing was exported and records no date', async () => {
    const user = userEvent.setup();
    const { bundle } = await open({ outcome: 'cancelled', seed: withSalmon });
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByText('Nothing was exported.')).toBeVisible();
    expect(await bundle.kv.read(KV_KEYS.exportLastAtUtc)).toBeNull();
  });

  it('a failed delivery is one calm line and the button works again', async () => {
    const user = userEvent.setup();
    await open({ outcome: 'throw', seed: withSalmon });
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByText('export failed — try again')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export' })).not.toHaveAttribute('aria-busy');
  });
});

describe('YourDataScreen: last export and the quiet suggestion', () => {
  it('never exported + data: says never, suggests once, with a Not now', async () => {
    await open({ seed: withSalmon });
    expect(await screen.findByText('Last export: never')).toBeVisible();
    expect(await screen.findByText(/You have not exported yet/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeVisible();
  });

  it('no data: no suggestion', async () => {
    await open();
    expect(await screen.findByText('Last export: never')).toBeVisible();
    expect(screen.queryByText(/not exported yet/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
  });

  it('a recent export shows the date and no suggestion', async () => {
    await open({
      seed: async (bundle) => {
        await withSalmon(bundle);
        await bundle.kv.write(KV_KEYS.exportLastAtUtc, new Date().toISOString());
      },
    });
    expect(await screen.findByText(/^Last export: \d/)).toBeVisible();
    expect(screen.queryByText('Last export: never')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
  });

  it('older than 14 days: the stale wording', async () => {
    await open({
      seed: async (bundle) => {
        await withSalmon(bundle);
        const old = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString();
        await bundle.kv.write(KV_KEYS.exportLastAtUtc, old);
      },
    });
    expect(await screen.findByText(/It has been a while since your last export/)).toBeVisible();
  });

  it('"Not now" hides it and the dismissal is kept', async () => {
    const user = userEvent.setup();
    const { bundle } = await open({ seed: withSalmon });
    await user.click(await screen.findByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull());
    expect(screen.queryByText(/not exported yet/)).toBeNull();
    expect(await bundle.kv.read(KV_KEYS.exportReminderDismissedAtUtc)).not.toBeNull();
  });

  it('a dismissal within 14 days keeps it away on the next visit', async () => {
    await open({
      seed: async (bundle) => {
        await withSalmon(bundle);
        await bundle.kv.write(KV_KEYS.exportReminderDismissedAtUtc, new Date().toISOString());
      },
    });
    expect(await screen.findByText('Last export: never')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
  });
});

describe('YourDataScreen: lock', () => {
  it('offers the idle delay (5, 15, 30, 60); choosing one is applied; Lock locks', async () => {
    const user = userEvent.setup();
    const { bundle } = await open();
    const group = screen.getByRole('group', { name: 'Lock automatically after' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => (r as HTMLInputElement).value),
    ).toEqual(['5', '15', '30', '60']);
    expect(within(group).getByRole('radio', { name: '15 minutes' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: '30 minutes' }));
    expect(bundle.controller.getSnapshot().idleMinutes).toBe(30);
    expect(within(group).getByRole('radio', { name: '30 minutes' })).toBeChecked();

    const lock = screen.getAllByRole('button', { name: 'Lock' }).at(-1) as HTMLElement;
    await user.click(lock);
    await waitFor(() => expect(bundle.controller.getSnapshot().status).toBe('locked'));
  });
});

describe('YourDataScreen: erase', () => {
  it('cancelling the confirmation erases nothing; the safe choice has focus', async () => {
    const user = userEvent.setup();
    const { bundle } = await open();
    const erase = vi.spyOn(bundle.eraser, 'eraseAll');
    await user.click(screen.getByRole('button', { name: 'Erase all local data' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Erase everything on this device?',
    });
    expect(within(dialog).getByRole('button', { name: 'Keep my data' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Keep my data' }));
    expect(erase).not.toHaveBeenCalled();
    expect(bundle.controller.getSnapshot().status).toBe('unlocked');
  });

  it('confirming erases, returns to a first run and shows the About notice again', async () => {
    const user = userEvent.setup();
    const { bundle } = await open({ seed: withSalmon });
    rememberAcknowledgedBeforeStore();
    await user.click(screen.getByRole('button', { name: 'Erase all local data' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Erase' }));
    await waitFor(() =>
      expect(bundle.controller.getSnapshot().status).toBe('needsPassphraseCreation'),
    );
    expect(wasAcknowledgedBeforeStore()).toBe(false);
  });

  it('a failed erase is reported honestly', async () => {
    const user = userEvent.setup();
    const { bundle } = await open();
    vi.spyOn(bundle.eraser, 'eraseAll').mockResolvedValue({
      kind: 'eraseLocalDataFailure',
      failedSteps: ['databaseFiles'],
    });
    await user.click(screen.getByRole('button', { name: 'Erase all local data' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Erase' }));
    expect(await screen.findByText(/Some data could not be erased/)).toBeVisible();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('the explanation says the erase cannot be undone and to export first', async () => {
    await open();
    const text = document.body.textContent ?? '';
    expect(text).toContain('exports still on this device');
    expect(text).toContain('cannot be undone');
    expect(text).toContain('export first');
  });
});

describe('YourDataScreen: accessibility', () => {
  it('has no axe violations (with data, the suggestion showing and the erase dialog open)', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle({ requestDurable: () => Promise.resolve('notPersisted') });
    await withSalmon(bundle);
    await renderInSession(<YourDataScreen destination={fakeDestination().destination} />, {
      bundle,
    });
    await screen.findByRole('heading', { level: 1, name: 'Your data' });
    await screen.findByText(/You have not exported yet/);
    expect(await axe(document.body)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Erase all local data' }));
    await screen.findByRole('alertdialog');
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
