// Ports of capture_sheet_test, manual_entry_screen_test, capture_barcode_screen_test and
// capture_photo_screen_test: the three ways to log, as the person meets them.
import { useEffect } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { FakeFetch, TEST_KEY } from '../../ai/testing';
import { FakeDecoder, granted } from '../../barcode/testing';
import { jpegWithExif } from '../../capture/testing';
import { OFF_ORIGIN } from '../../catalog';
import { strings } from '../../i18n';
import { at, renderInSession, seedPlate, unlockedBundle } from '../../app/testing';
import { DayProvider } from '../../app/day-context';
import { SessionBoundary, useSession, type Session } from '../../app/session';
import { StoreProvider } from '../../app/store-context';
import { LogHost } from './LogHost';
import { TodayScreen } from '../today/TodayScreen';

const s = strings();
const NUTELLA = '3017620422003';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 12, 10) });
});
afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

/** The session as the screens see it, so a test can set the AI up the way Your AI would. */
let grabbed: Session | null = null;
function Grab() {
  const session = useSession();
  useEffect(() => {
    grabbed = session;
  });
  return null;
}
const screenWithGrab = (
  <>
    <Grab />
    <TodayScreen />
  </>
);

const openSheet = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getAllByRole('button', { name: s.shell.logAPlate })[0] as HTMLElement);
  return screen.findByRole('dialog', { name: s.capture.title });
};

describe('LogHost: the capture sheet', () => {
  it('opens from the dock and the rail with the three ways to log, Snapshot first', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await renderInSession(screenWithGrab, { bundle });
    await screen.findByText('Breakfast');

    // Both LOG buttons (phone dock, desktop rail) open the same sheet.
    for (const button of screen.getAllByRole('button', { name: s.shell.logAPlate })) {
      await user.click(button);
      const dialog = await screen.findByRole('dialog', { name: s.capture.title });
      const tiles = within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent);
      expect(tiles[1]).toContain('Snapshot');
      expect(tiles.some((t) => t?.includes('Barcode'))).toBe(true);
      expect(tiles.some((t) => t?.includes('Type it'))).toBe(true);
      expect(within(dialog).getByText('Next station: Lunch')).toBeVisible();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      // Esc returns focus to the button that opened it.
      expect(button).toHaveFocus();
    }
  });

  it('has no monetisation and no pressure copy', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await renderInSession(screenWithGrab, { bundle });
    await screen.findByText('Breakfast');
    const dialog = await openSheet(user);
    expect(dialog.textContent).not.toMatch(/tip|donate|buy|upgrade|premium|streak|hurry/i);
  });

  it('has no axe violations while open', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    const { baseElement } = render(
      <StoreProvider bundle={bundle}>
        <SessionBoundary bundle={bundle}>
          <DayProvider>
            <LogHost>{screenWithGrab}</LogHost>
          </DayProvider>
        </SessionBoundary>
      </StoreProvider>,
    );
    await screen.findByText('Breakfast');
    await openSheet(user);
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('Type it', () => {
  async function open() {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await renderInSession(screenWithGrab, { bundle });
    await screen.findByText('Breakfast');
    const dialog = await openSheet(user);
    await user.click(within(dialog).getByRole('button', { name: /Type it/ }));
    const sheet = await screen.findByRole('dialog', { name: s.catalog.title });
    return { user, bundle, sheet };
  }

  it('ranks matches as you type, defaults to the first portion and logs one plate', async () => {
    const { user, bundle, sheet } = await open();
    expect(within(sheet).getByText(s.catalog.typeHint)).toBeVisible();
    await user.type(within(sheet).getByLabelText(s.catalog.searchLabel), 'salm');
    const salmon = await within(sheet).findByRole('button', { name: /^Salmon, Protein/ });
    await user.click(salmon);
    expect(salmon).toHaveAttribute('aria-pressed', 'true');

    const presets = within(sheet).getByRole('group', { name: s.portion.label });
    const first = within(presets).getAllByRole('button')[0] as HTMLElement;
    expect(first).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(sheet).getByRole('button', { name: s.common.log }));

    // The sheet closes, Today shows the plate and offers a quiet "log another".
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Salmon')).toBeVisible();
    expect(screen.getByRole('button', { name: s.today.logAnother })).toBeVisible();
    const read = await bundle.store.readRange();
    expect(read.kind === 'platesRead' && read.plates).toHaveLength(1);
    if (read.kind === 'platesRead') {
      const entry = read.plates[0]?.entries[0];
      expect(entry?.databaseFood.displayName).toBe('Salmon');
      expect(entry?.quantity.displayLabel).toBe(first.textContent);
    }
  });

  it('swapping the portion before Log records the new one', async () => {
    const { user, bundle, sheet } = await open();
    await user.type(within(sheet).getByLabelText(s.catalog.searchLabel), 'salm');
    await user.click(await within(sheet).findByRole('button', { name: /^Salmon/ }));
    const presets = within(
      within(sheet).getByRole('group', { name: s.portion.label }),
    ).getAllByRole('button');
    const other = presets[1] as HTMLElement;
    await user.click(other);
    await user.click(within(sheet).getByRole('button', { name: s.common.log }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const read = await bundle.store.readRange();
    expect(read.kind === 'platesRead' && read.plates[0]?.entries[0]?.quantity.displayLabel).toBe(
      other.textContent,
    );
  });

  it('Log is off until a food is picked', async () => {
    const { user, sheet } = await open();
    await user.type(within(sheet).getByLabelText(s.catalog.searchLabel), 'apple');
    await within(sheet).findByRole('button', { name: /^Apple/ });
    expect(within(sheet).getByRole('button', { name: s.common.log })).toBeDisabled();
  });

  it('a name that matches nothing opens the custom food form (manual, group other, ~1 serving)', async () => {
    const { user, bundle, sheet } = await open();
    await user.type(within(sheet).getByLabelText(s.catalog.searchLabel), 'zzqx mystery stew');
    expect(await within(sheet).findByText(s.catalog.customHint)).toBeVisible();
    const name = within(sheet).getByLabelText(s.catalog.customFoodName);
    await user.clear(name);
    await user.click(within(sheet).getByRole('button', { name: s.catalog.logCustomFood }));
    expect(await within(sheet).findByText(s.catalog.typeNameFirst)).toBeVisible();

    await user.type(name, 'Mystery Stew');
    await user.click(within(sheet).getByRole('button', { name: s.catalog.logCustomFood }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const read = await bundle.store.readRange();
    const entry = read.kind === 'platesRead' ? read.plates[0]?.entries[0] : undefined;
    expect(entry?.databaseFood.displayName).toBe('Mystery Stew');
    expect(entry?.databaseFood.source).toBe('manual');
    expect(entry?.databaseFood.foodGroup).toBe('other');
    expect(entry?.quantity.displayLabel).toBe(s.portion.oneServing);
  });

  it('a log the store refuses says so calmly and keeps the sheet', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    const failing = Object.create(bundle.store, {
      recordPlate: {
        value: () => Promise.resolve({ kind: 'storeFailure', reason: 'storeOperation' }),
      },
    }) as typeof bundle.store;
    await renderInSession(screenWithGrab, { bundle: { ...bundle, store: failing } });
    await screen.findByText('Breakfast');
    const dialog = await openSheet(user);
    await user.click(within(dialog).getByRole('button', { name: /Type it/ }));
    const sheet = await screen.findByRole('dialog', { name: s.catalog.title });
    await user.type(within(sheet).getByLabelText(s.catalog.searchLabel), 'apple');
    await user.click(await within(sheet).findByRole('button', { name: /^Apple/ }));
    await user.click(within(sheet).getByRole('button', { name: s.common.log }));
    expect(await within(sheet).findByText(s.common.logFailed)).toBeVisible();
    expect(within(sheet).getByRole('button', { name: s.common.log })).not.toHaveAttribute(
      'aria-busy',
    );
  });

  it('works with no network at all: the search never fetches', async () => {
    const fetch = new FakeFetch();
    const bundle = await unlockedBundle();
    await renderInSession(screenWithGrab, { bundle, session: { fetch: fetch.fetch } });
    await screen.findByText('Breakfast');
    const user = userEvent.setup();
    const dialog = await openSheet(user);
    await user.click(within(dialog).getByRole('button', { name: /Type it/ }));
    const sheet = await screen.findByRole('dialog', { name: s.catalog.title });
    await user.type(within(sheet).getByLabelText(s.catalog.searchLabel), 'rice');
    await within(sheet).findByRole('button', { name: /^Rice/ });
    expect(fetch.requests).toEqual([]);
  });

  it('has no axe violations (with matches and a picked portion)', async () => {
    const { user, sheet } = await open();
    await user.type(within(sheet).getByLabelText(s.catalog.searchLabel), 'salm');
    await user.click(await within(sheet).findByRole('button', { name: /^Salmon/ }));
    expect(await axe(sheet)).toHaveNoViolations();
  });
});

describe('Barcode', () => {
  beforeAll(() => {
    // jsdom has no media pipeline: give the <video> the readiness the scanner waits for.
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get: () => 4,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      get: () => 640,
    });
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
  afterAll(() => {
    Reflect.deleteProperty(HTMLMediaElement.prototype, 'readyState');
    Reflect.deleteProperty(HTMLVideoElement.prototype, 'videoWidth');
  });

  const offBody = (name: string) => ({
    status: 1,
    product: { product_name: name, categories_tags: ['en:chocolate-spreads'] },
  });

  async function scan(code: string, fetch: FakeFetch, decoder = new FakeDecoder()) {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await renderInSession(screenWithGrab, {
      bundle,
      session: { fetch: fetch.fetch },
      scannerOptions: {
        createDecoder: () => Promise.resolve(decoder),
        requestCamera: () => Promise.resolve(granted()),
        intervalMs: 5,
      },
    });
    await screen.findByText('Breakfast');
    const dialog = await openSheet(user);
    await user.click(within(dialog).getByRole('button', { name: /Barcode/ }));
    const sheet = await screen.findByRole('dialog', { name: s.barcode.title });
    expect(await within(sheet).findByText(s.barcode.aimHint)).toBeVisible();
    act(() => decoder.emit(code));
    return { user, bundle, sheet, decoder };
  }

  it('asks the one-time Open Food Facts notice first; OK sends exactly one lookup and opens the match', async () => {
    const fetch = new FakeFetch();
    fetch.jsonBody = offBody('Nutella');
    const { user, bundle } = await scan(NUTELLA, fetch);

    const notice = await screen.findByRole('dialog', { name: s.offNotice.title });
    // Nothing leaves the device before the answer.
    expect(fetch.requests).toEqual([]);
    expect(within(notice).getByRole('link', { name: s.offNotice.privacyLink })).toHaveAttribute(
      'href',
      '#/privacy',
    );
    await user.click(within(notice).getByRole('button', { name: s.offNotice.ok }));

    const match = await screen.findByRole('dialog', { name: 'Nutella' });
    expect(fetch.requests).toHaveLength(1);
    const request = fetch.requests[0];
    expect(request?.url).toMatch(new RegExp(`^${OFF_ORIGIN}/api/v2/product/${NUTELLA}\\?fields=`));
    // No credentials, referrer or cookies ride along.
    expect(request?.headers).not.toHaveProperty('authorization');
    expect(request?.headers).not.toHaveProperty('cookie');
    expect(request?.init.credentials ?? 'omit').toBe('omit');

    await user.click(within(match).getByRole('button', { name: s.common.log }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const read = await bundle.store.readRange();
    expect(read.kind === 'platesRead' && read.plates[0]?.entries[0]?.databaseFood.displayName).toBe(
      'Nutella',
    );
  });

  it('"Don\'t look up online" sends nothing: not found, then manual entry with the code prefilled', async () => {
    const fetch = new FakeFetch();
    const { user, sheet } = await scan(NUTELLA, fetch);
    const notice = await screen.findByRole('dialog', { name: s.offNotice.title });
    await user.click(within(notice).getByRole('button', { name: s.offNotice.offline }));

    expect(await within(sheet).findByText(s.barcode.notFoundTypeIt)).toBeVisible();
    expect(fetch.requests).toEqual([]);

    await user.click(within(sheet).getByRole('button', { name: s.barcode.typeManually }));
    const typeIt = await screen.findByRole('dialog', { name: s.catalog.title });
    expect(within(typeIt).getByLabelText(s.catalog.searchLabel)).toHaveValue(NUTELLA);
    expect(await within(typeIt).findByLabelText(s.catalog.customFoodName)).toHaveValue(NUTELLA);
  });

  it('the notice is asked once: a later scan goes straight to the lookup', async () => {
    const fetch = new FakeFetch();
    fetch.jsonBody = offBody('Nutella');
    const { user, decoder } = await scan(NUTELLA, fetch);
    await user.click(
      within(await screen.findByRole('dialog', { name: s.offNotice.title })).getByRole('button', {
        name: s.offNotice.ok,
      }),
    );
    const match = await screen.findByRole('dialog', { name: 'Nutella' });
    await user.click(within(match).getByRole('button', { name: s.common.close }));
    // Scanning resumes after the result is dismissed; a second code needs no second notice.
    act(() => decoder.emit('5449000000996'));
    await waitFor(() => expect(fetch.requests).toHaveLength(2));
    expect(screen.queryByRole('dialog', { name: s.offNotice.title })).not.toBeInTheDocument();
  });

  it('an unknown code says so calmly and keeps scanning possible', async () => {
    const fetch = new FakeFetch();
    fetch.status = 404;
    const { user, sheet } = await scan('0000000000000', fetch);
    await user.click(
      within(await screen.findByRole('dialog', { name: s.offNotice.title })).getByRole('button', {
        name: s.offNotice.ok,
      }),
    );
    expect(await within(sheet).findByText(s.barcode.notFoundTypeIt)).toBeVisible();
    await user.click(within(sheet).getByRole('button', { name: s.barcode.scanAgain }));
    await waitFor(() =>
      expect(within(sheet).queryByText(s.barcode.notFoundTypeIt)).not.toBeInTheDocument(),
    );
  });

  it('a denied camera is one calm line with one way forward, and no retry', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await renderInSession(screenWithGrab, {
      bundle,
      scannerOptions: {
        createDecoder: () => Promise.resolve(new FakeDecoder()),
        requestCamera: () => Promise.resolve({ kind: 'denied' }),
      },
    });
    await screen.findByText('Breakfast');
    const dialog = await openSheet(user);
    await user.click(within(dialog).getByRole('button', { name: /Barcode/ }));
    const sheet = await screen.findByRole('dialog', { name: s.barcode.title });
    expect(await within(sheet).findByText(s.camera.deniedTitle)).toBeVisible();
    expect(within(sheet).queryByRole('button', { name: /retry|again|allow/i })).toBeNull();
    await user.click(within(sheet).getByRole('button', { name: s.barcode.typeManually }));
    expect(await screen.findByRole('dialog', { name: s.catalog.title })).toBeVisible();
  });

  it('releases the camera when the sheet closes', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    const camera = granted();
    await renderInSession(screenWithGrab, {
      bundle,
      scannerOptions: {
        createDecoder: () => Promise.resolve(new FakeDecoder()),
        requestCamera: () => Promise.resolve(camera),
        intervalMs: 5,
      },
    });
    await screen.findByText('Breakfast');
    const dialog = await openSheet(user);
    await user.click(within(dialog).getByRole('button', { name: /Barcode/ }));
    await screen.findByRole('dialog', { name: s.barcode.title });
    await waitFor(() => expect(camera.raw.stopped).toBe(0));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(camera.raw.stopped).toBeGreaterThan(0));
  });
});

describe('Snapshot', () => {
  const photo = () => Promise.resolve(jpegWithExif());
  const capture = (bytes: () => Promise<Uint8Array | null>) => () => ({ capture: bytes });

  async function start(options: {
    capture: () => Promise<Uint8Array | null>;
    fetch?: FakeFetch;
    byok?: boolean;
    seed?: boolean;
  }) {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    if (options.seed) await seedPlate(bundle, at(8, 0), [['Porridge', 'starch']]);
    await renderInSession(screenWithGrab, {
      bundle,
      ...(options.fetch ? { session: { fetch: options.fetch.fetch } } : {}),
      createCapture: capture(options.capture),
    });
    await screen.findByText('Lunch');
    if (options.byok) {
      await act(async () => {
        const ai = (grabbed as Session).ai;
        await ai.settings.setByokTarget({
          endpointUrl: 'https://ai.example.test/v1',
          model: 'vision-1',
          keyHost: 'ai.example.test',
        });
        await ai.keyStore.write(TEST_KEY);
        await ai.settings.setRung({ kind: 'byok' });
      });
    }
    const dialog = await openSheet(user);
    await user.click(within(dialog).getByRole('button', { name: /Snapshot/ }));
    const snap = await screen.findByRole('dialog', { name: s.capture.snapTitle });
    return { user, bundle, snap };
  }

  it('never opens a picker by itself: only the Take / Choose buttons do', async () => {
    const pick = vi.fn(photo);
    const { snap } = await start({ capture: pick });
    expect(within(snap).getByRole('button', { name: s.capture.takePhoto })).toBeVisible();
    expect(within(snap).getByRole('button', { name: s.capture.choosePhoto })).toBeVisible();
    expect(pick).not.toHaveBeenCalled();
  });

  it('with no AI the Snap sheet says so before the photo, with a link to Your AI', async () => {
    const { user, snap } = await start({ capture: photo });
    expect(within(snap).getByText(s.capture.noAiNote)).toBeVisible();
    const link = within(snap).getByRole('link', { name: s.recognized.setUpAi });
    expect(link).toHaveAttribute('href', '#/settings/ai');
    await user.click(link);
    expect(window.location.hash).toBe('#/settings/ai');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('with your own key set up, the Snap sheet carries no AI note', async () => {
    const { snap } = await start({ capture: photo, byok: true });
    expect(within(snap).queryByText(s.capture.noAiNote)).not.toBeInTheDocument();
    expect(
      within(snap).queryByRole('link', { name: s.recognized.setUpAi }),
    ).not.toBeInTheDocument();
  });

  it('with no AI: no consent question, the no-AI core offers the closest matches and a custom food', async () => {
    const { user, bundle } = await start({ capture: photo, seed: true });
    await user.click(screen.getByRole('button', { name: s.capture.takePhoto }));

    const sheet = await screen.findByRole('dialog', { name: s.recognized.noAiTitle });
    expect(within(sheet).getByText(s.recognized.noAiHint)).toBeVisible();
    expect(within(sheet).getByRole('link', { name: s.recognized.setUpAi })).toHaveAttribute(
      'href',
      '#/settings/ai',
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    // What was logged this week is offered as a closest match.
    expect(within(sheet).getByText('Porridge')).toBeVisible();
    expect(within(sheet).getByRole('checkbox', { name: /Porridge/ })).toBeInTheDocument();

    await user.type(within(sheet).getByLabelText(s.recognized.customFoodName), 'Mystery Stew');
    await user.click(within(sheet).getByRole('button', { name: s.recognized.logCustomFood }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const read = await bundle.store.readRange();
    expect(
      read.kind === 'platesRead' && read.plates.map((p) => p.entries[0]?.databaseFood.displayName),
    ).toContain('Mystery Stew');
  });

  it('a cancelled or denied picker is one calm path: type it instead', async () => {
    const { user } = await start({ capture: () => Promise.resolve(null) });
    await user.click(screen.getByRole('button', { name: s.capture.choosePhoto }));
    const sheet = await screen.findByRole('dialog', { name: s.capture.snapTitle });
    expect(within(sheet).getByText(s.camera.deniedTitle)).toBeVisible();
    await user.click(within(sheet).getByRole('button', { name: s.capture.typeManually }));
    expect(await screen.findByRole('dialog', { name: s.catalog.title })).toBeVisible();
  });

  it('with your own key: each photo asks first; "Not now" drops it and nothing is sent', async () => {
    const fetch = new FakeFetch();
    const { user } = await start({ capture: photo, byok: true, fetch });
    await user.click(screen.getByRole('button', { name: s.capture.takePhoto }));

    const consent = await screen.findByRole('alertdialog', {
      name: 'Send this photo to ai.example.test?',
    });
    expect(within(consent).getByText(/the address of this site/)).toBeVisible();
    // "Not now" has the focus and is as prominent as the yes.
    const decline = within(consent).getByRole('button', { name: s.consent.decline });
    expect(decline).toHaveFocus();
    await user.click(decline);

    expect(await screen.findByRole('dialog', { name: s.recognized.nothingMatched })).toBeVisible();
    expect(fetch.requests).toEqual([]);
  });

  it('a yes sends this one photo to the named host only, and a failure is a calm line', async () => {
    const fetch = new FakeFetch();
    fetch.status = 500;
    const { user } = await start({ capture: photo, byok: true, fetch });
    await user.click(screen.getByRole('button', { name: s.capture.takePhoto }));
    const consent = await screen.findByRole('alertdialog');
    await user.click(within(consent).getByRole('button', { name: s.consent.allowOnce }));

    const failed = await screen.findByRole('dialog', { name: s.recognized.failureTitle });
    expect(failed).toBeVisible();
    // The specific cause is shown, not just the generic title (a 500 is not a setup problem).
    expect(within(failed).getByText(/^Error 500 from ai\.example\.test$/)).toBeVisible();
    expect(
      within(failed).queryByRole('link', { name: s.recognized.setUpAi }),
    ).not.toBeInTheDocument();
    expect(fetch.requests).toHaveLength(1);
    expect(new URL(fetch.requests[0]?.url ?? '').host).toBe('ai.example.test');
    // The key goes only in the header of that request, never in the address or the body.
    expect(fetch.requests[0]?.url).not.toContain(TEST_KEY);
    expect(fetch.requests[0]?.body).not.toContain(TEST_KEY);
  });

  it('says "Reading the plate…" on the open station while it reads (no spinner), then lands the plate', async () => {
    const fetch = new FakeFetch();
    fetch.hang = true;
    const { user } = await start({ capture: photo, byok: true, fetch });
    await user.click(screen.getByRole('button', { name: s.capture.takePhoto }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: s.consent.allowOnce,
      }),
    );
    expect(await screen.findByText(s.day.reading)).toBeVisible();
    expect(screen.getByText(s.day.reading).closest('li')).toHaveTextContent('Lunch');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('the Snap sheet has no axe violations', async () => {
    const { snap } = await start({ capture: photo });
    expect(await axe(snap)).toHaveNoViolations();
  });
});
