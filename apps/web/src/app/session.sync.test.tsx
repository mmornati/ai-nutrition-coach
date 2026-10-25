// What a pull does to the screens (phase S3): the day board, the chips, the language and the saved
// meals follow a copy pulled from another device with no reload, and a name being typed is not
// lost. Real stores and crypto, a fake relay, time and page events driven by hand.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { at, draft, renderInSession, renderUnlockedApp, seedPlate } from './testing';
import { setCurrentLocale } from '../i18n';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { KV_KEYS } from '../storage/key-value-store';
import type { StoreBundle } from '../storage';
import { SavedScreen } from '../screens/settings/SavedScreen';
import { fastKdf } from '../sync/vault/testing';
import { FakeRelay } from '../sync/relay/testing/fake-relay';
import { attach, connected, manual, secondDevice } from '../sync/relay/testing/devices';
import { offerOf, OPEN_CONFIG } from '../sync/relay/testing/ui';

beforeEach(() => {
  setCurrentLocale('en');
  window.location.hash = '';
});

/** The language lives above the session at the app root; so it does here. */
const English = ({ children }: { children: ReactNode }) => (
  <LocaleProvider initial="en">{children}</LocaleProvider>
);

/** The first device, as the app on screen: its pulls and page events are ours to fire. */
function onScreen(relay: FakeRelay) {
  const clock = manual();
  const session = {
    sync: {
      client: relay,
      kdf: fastKdf,
      offer: offerOf(OPEN_CONFIG),
      timers: clock.timers,
      events: clock.events,
      isOnline: () => true,
      pullIntervalMs: 0,
    },
  };
  return { clock, session };
}

/** A connected first device whose own sync service is stopped, so the screen's session owns it. */
async function firstDevice(relay: FakeRelay): Promise<StoreBundle> {
  const first = await connected(relay);
  first.a.stop();
  return first.a.bundle;
}

const chipsOf = (container: HTMLElement, state: string) =>
  container.querySelectorAll(`[data-chip-state="${state}"]`);

describe('a pull changes what is on screen without a reload', () => {
  it('the day board, the chips and the language follow another device', async () => {
    const relay = new FakeRelay();
    const bundle = await firstDevice(relay);
    const { clock, session } = onScreen(relay);
    const view = await renderUnlockedApp(bundle, { session, wrapper: English });

    // Connected and everything on it acknowledged: the header says so, and so does the plate.
    await screen.findByText(/Porridge/);
    await waitFor(() => expect(chipsOf(view.container, 'synced')).toHaveLength(2));

    // Another device logs a plate, sets the language, and sends it.
    const b = await secondDevice(relay);
    await seedPlate(b.bundle, at(12, 30), [['Salmon', 'protein']]);
    await b.bundle.kv.write(KV_KEYS.uiLocale, 'fr');
    await b.service.syncNow();

    await act(async () => {
      await clock.fire();
    });
    expect(await screen.findByText(/Salmon/)).toBeVisible();
    expect(screen.getByText(/Porridge/)).toBeVisible();
    // The language changed under the person, live: the heading and the chip are French.
    expect(await screen.findByRole('heading', { level: 1, name: 'Aujourd’hui' })).toBeVisible();
    await waitFor(() => expect(chipsOf(view.container, 'synced')).toHaveLength(3));
    expect(chipsOf(view.container, 'synced')[0]).toHaveTextContent('Synchronisé');
    expect(window.location.hash).toBe('');
  });

  it('a plate removed on another device disappears here', async () => {
    const relay = new FakeRelay();
    const bundle = await firstDevice(relay);
    const { clock, session } = onScreen(relay);
    await renderUnlockedApp(bundle, { session, wrapper: English });
    await screen.findByText(/Porridge/);

    const b = await secondDevice(relay);
    const read = await b.bundle.store.readRange({});
    if (read.kind !== 'platesRead') throw new Error('read');
    await b.bundle.store.deletePlate(read.plates[0]!.id);
    await b.service.syncNow();

    await act(async () => {
      await clock.fire();
    });
    await waitFor(() => expect(screen.queryByText(/Porridge/)).not.toBeInTheDocument());
  });

  it('a newer app on the server: the chip says to update this one, in the same place', async () => {
    const relay = new FakeRelay();
    const bundle = await firstDevice(relay);
    const { clock, session } = onScreen(relay);
    const view = await renderUnlockedApp(bundle, { session, wrapper: English });
    await screen.findByText(/Porridge/);
    relay.getVault = () => Promise.resolve({ kind: 'error', error: 'newerFormat' } as const);
    await act(async () => {
      await clock.fire();
    });
    await waitFor(() =>
      expect(chipsOf(view.container, 'updateNeeded')[0]).toHaveTextContent(
        'Update the app on this device to keep syncing',
      ),
    );
  });
});

describe('saved meals', () => {
  it('a meal renamed on another device shows here, and a name being typed is kept', async () => {
    const relay = new FakeRelay();
    const bundle = await firstDevice(relay);
    // Sent from this device (with its own service watching the write) before a second one restores it.
    const sender = await attach(bundle, relay);
    const saved = await bundle.saved.saveMeal({
      name: 'Lunch',
      entries: [draft('Rice', 'starch')],
    });
    expect(saved.kind).toBe('saved');
    expect(await sender.service.syncNow()).toEqual({ kind: 'backedUp' });
    sender.stop();
    const b = await secondDevice(relay);

    const { clock, session } = onScreen(relay);
    const user = userEvent.setup();
    await renderInSession(<SavedScreen />, { bundle, session, wrapper: English });
    expect(await screen.findByText('Lunch')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Rename Lunch/ }));
    const field = screen.getByLabelText(/name/i);
    await user.clear(field);
    await user.type(field, 'Dinn');

    const listed = await b.bundle.saved.listMeals();
    if (listed.kind !== 'saved') throw new Error('list');
    await b.bundle.saved.renameMeal(listed.value[0]!.id, 'Evening bowl');
    await b.service.syncNow();
    await act(async () => {
      await clock.fire();
    });

    // What was typed is still there; the list under it has moved on.
    expect(screen.getByLabelText(/name/i)).toHaveValue('Dinn');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Evening bowl')).toBeVisible();
    expect(within(document.body).queryByText('Lunch')).not.toBeInTheDocument();
  });
});
