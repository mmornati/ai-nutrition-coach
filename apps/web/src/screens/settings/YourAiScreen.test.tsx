// Port of the earlier client (and the earlier client's
// Your AI row): the rungs, the key form that never shows the key back, endpoint validation,
// Test connection, Remove key, and the consented hosts.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { AiProvider, AiSettings, KvAiSettingsStore } from '../../ai';
import { useSession } from '../../app/session';
import { chatReply, FakeFetch } from '../../ai/testing';
import { renderInSession, renderUnlockedApp, unlockedBundle } from '../../app/testing';
import { KV_KEYS, type StoreBundle } from '../../storage';
import { YourAiScreen } from './YourAiScreen';

const SECRET = 'sk-or-v1-SECRETMATERIAL-9f3a';

afterEach(() => {
  window.location.hash = '';
});

async function openAi(
  options: { seed?: AiSettings; fake?: FakeFetch; seedKey?: string } = {},
): Promise<{ bundle: StoreBundle; fake: FakeFetch }> {
  const fake = options.fake ?? new FakeFetch();
  const bundle = await unlockedBundle();
  if (options.seed) await new KvAiSettingsStore(bundle.kv).write(options.seed);
  if (options.seedKey) await bundle.kv.write(KV_KEYS.aiByokKey, options.seedKey);
  window.location.hash = '#/settings/ai';
  await renderUnlockedApp(bundle, { session: { fetch: fake.fetch } });
  await screen.findByRole('heading', { level: 1, name: 'Your AI' });
  return { bundle, fake };
}

const storedSettings = async (bundle: StoreBundle) =>
  (await bundle.kv.read(KV_KEYS.aiSettings)) ?? '';

async function chooseOwnKey(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: /My own key/ }));
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  endpoint: string,
  model: string,
  key?: string,
) {
  await user.clear(screen.getByLabelText('Endpoint'));
  await user.type(screen.getByLabelText('Endpoint'), endpoint);
  await user.clear(screen.getByLabelText('Model'));
  await user.type(screen.getByLabelText('Model'), model);
  if (key !== undefined)
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: key } });
}

describe('YourAiScreen', () => {
  it('lists the rungs; hosted and on-device are unavailable and cannot be chosen', async () => {
    const user = userEvent.setup();
    const { bundle } = await openAi();
    const group = screen.getByRole('radiogroup', { name: 'Recognising a photo' });
    expect(within(group).getAllByRole('radio')).toHaveLength(4);
    expect(within(group).getByRole('radio', { name: /No AI/ })).toBeChecked();
    expect(within(group).getByRole('radio', { name: /Free hosted model/ })).toBeDisabled();
    expect(within(group).getByRole('radio', { name: /Model on this device/ })).toBeDisabled();
    expect(within(group).getAllByText('Not available yet')).toHaveLength(2);
    // Only the on-device model carries the version tag; the hosted tier never says "version 2".
    const hosted = within(group)
      .getByRole('radio', { name: /Free hosted model/ })
      .closest('label');
    const local = within(group)
      .getByRole('radio', { name: /Model on this device/ })
      .closest('label');
    expect(local).toHaveTextContent('Not in v1');
    expect(local).toHaveTextContent('not in version 1');
    expect(hosted).not.toHaveTextContent(/v1|v2|version/i);
    expect(within(group).queryByText(/version 2/i)).toBeNull();

    await user.click(within(group).getByText('Free hosted model'));
    expect(within(group).getByRole('radio', { name: /No AI/ })).toBeChecked();
    expect(await storedSettings(bundle)).not.toContain('hostedQuota');
    // The key form stays hidden until "My own key" is chosen.
    expect(screen.queryByLabelText('Endpoint')).toBeNull();
  });

  it('"Ask before every photo upload" is on by default and the switch is stored', async () => {
    const user = userEvent.setup();
    const { bundle } = await openAi();
    const sw = screen.getByRole('switch', { name: 'Ask before every photo upload' });
    expect(sw).toBeChecked();
    await user.click(sw);
    await waitFor(async () => expect(await storedSettings(bundle)).toContain('false'));
    expect(sw).not.toBeChecked();
    await user.click(sw);
    await waitFor(() => expect(sw).toBeChecked());
  });

  it('the help link opens the in-app privacy page, not a URL', async () => {
    await openAi();
    const link = screen.getByRole('link', { name: 'What this app stores and sends' });
    expect(link).toHaveAttribute('href', '#/privacy');
  });

  it('the key field is obscured, never shows the key back and is cleared after Save; only the ending remains', async () => {
    const user = userEvent.setup();
    const { bundle } = await openAi();
    await chooseOwnKey(user);

    const key = screen.getByLabelText('API key');
    expect(key).toHaveAttribute('type', 'password');
    expect(key).toHaveAttribute('autocomplete', 'off');
    expect(key).toHaveAttribute('autocorrect', 'off');
    expect(key).toHaveAttribute('spellcheck', 'false');

    await fillForm(user, 'https://api.example.com/v1', 'vision-1');
    // A paste with whitespace is cleaned by the field itself.
    fireEvent.change(key, { target: { value: ` ${SECRET}\t ` } });
    expect(key).toHaveValue(SECRET);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved.')).toBeVisible();
    expect(await screen.findByText('key saved • ends with ••••9f3a')).toBeVisible();
    expect(document.body.textContent).not.toContain('SECRETMATERIAL');
    expect(screen.getByLabelText('API key')).toHaveValue('');
    expect(await bundle.kv.read(KV_KEYS.aiByokKey)).toBe(SECRET);
    const stored = await storedSettings(bundle);
    expect(stored).toContain('byok');
    expect(stored).toContain('https://api.example.com/v1');
    expect(stored).not.toContain('SECRETMATERIAL');
  });

  it('endpoint validation: http (non-local) is refused with calm copy and nothing is saved; localhost is fine', async () => {
    const user = userEvent.setup();
    const { bundle } = await openAi();
    await chooseOwnKey(user);
    await fillForm(user, 'http://example.com/v1', 'm', 'sk-test-abcdef123456');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Use https:// — plain http:// works only for localhost.'),
    ).toBeVisible();
    expect(await bundle.kv.read(KV_KEYS.aiByokKey)).toBeNull();
    expect(await storedSettings(bundle)).not.toContain('byok');

    await user.clear(screen.getByLabelText('Endpoint'));
    await user.type(screen.getByLabelText('Endpoint'), 'http://localhost:11434/v1');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved.')).toBeVisible();
    expect(await storedSettings(bundle)).toContain('byok');
  });

  it('a missing model is said on the model field', async () => {
    const user = userEvent.setup();
    await openAi();
    await chooseOwnKey(user);
    await user.type(screen.getByLabelText('Endpoint'), 'https://api.example.com/v1');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Add the model name your service offers.')).toBeVisible();
  });

  it('Test connection: uses the form, says a calm line per outcome and saves nothing', async () => {
    const user = userEvent.setup();
    const fake = new FakeFetch();
    const { bundle } = await openAi({ fake });
    await chooseOwnKey(user);
    await fillForm(user, 'https://api.example.com/v1', 'm', 'sk-test-abcdef123456');
    const test = () => user.click(screen.getByRole('button', { name: 'Test connection' }));

    fake.jsonBody = chatReply('pong');
    await test();
    expect(await screen.findByText('Connected — the endpoint, model and key work.')).toBeVisible();
    expect(fake.last.headers['authorization']).toBe('Bearer sk-test-abcdef123456');

    fake.status = 401;
    await test();
    expect(await screen.findByText("The service didn't accept this key.")).toBeVisible();

    fake.status = 429;
    await test();
    expect(
      await screen.findByText('The service asks to slow down. Try again a little later.'),
    ).toBeVisible();

    fake.status = 404;
    await test();
    expect(
      await screen.findByText('The service answered with an unexpected status (404).'),
    ).toBeVisible();

    fake.status = 200;
    fake.error = new TypeError('Failed to fetch');
    await test();
    // An unreachable service says plainly that the browser may have blocked the call.
    expect(await screen.findByText(/Couldn't reach the service\. .*CORS/)).toBeVisible();

    expect(await bundle.kv.read(KV_KEYS.aiByokKey)).toBeNull();
    expect(await storedSettings(bundle)).not.toContain('byok');
    expect(document.body.textContent).not.toContain('sk-test-abcdef123456');
  });

  it('Test connection with nothing filled in asks for the endpoint, model and key', async () => {
    const user = userEvent.setup();
    await openAi();
    await chooseOwnKey(user);
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('Add an endpoint, a model and a key first.')).toBeVisible();
  });

  it('a key saved for another host is not redirected: the endpoint edit is refused', async () => {
    const user = userEvent.setup();
    await openAi({
      seed: new AiSettings({
        rung: { kind: 'byok', previousRung: { previousKind: 'noOp' } },
        byokEndpointUrl: 'https://api.example.com/v1',
        byokModel: 'm',
        byokKeyHost: 'api.example.com',
      }),
      seedKey: 'sk-stored-abcdef123456',
    });
    await fillForm(user, 'https://other.example.org/v1', 'm');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(/The saved key was entered for api\.example\.com/),
    ).toBeVisible();
  });

  it('Remove key clears the key and returns to No AI', async () => {
    const user = userEvent.setup();
    const { bundle } = await openAi({
      seed: new AiSettings({
        rung: { kind: 'byok', previousRung: { previousKind: 'noOp' } },
        byokEndpointUrl: 'https://api.example.com/v1',
        byokModel: 'm',
        byokKeyHost: 'api.example.com',
      }),
      seedKey: 'sk-stored-abcdef123456',
    });
    expect(screen.getByRole('radio', { name: /My own key/ })).toBeChecked();
    expect(await screen.findByText('key saved • ends with ••••3456')).toBeVisible();
    expect(await screen.findByText('removing this key returns to offline (no AI)')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Remove key' }));
    expect(await screen.findByText('Key removed.')).toBeVisible();
    expect(await bundle.kv.read(KV_KEYS.aiByokKey)).toBeNull();
    expect(screen.getByRole('radio', { name: /No AI/ })).toBeChecked();
    expect(document.body.textContent).not.toContain('••••');
  });

  it('consented hosts are listed and each is revocable', async () => {
    const user = userEvent.setup();
    const { bundle } = await openAi({
      seed: new AiSettings({ photoConsentHosts: ['api.example.com', 'b.example.org'] }),
    });
    const list = screen.getByRole('list', { name: 'Services that may receive photos' });
    expect(within(list).getByText('api.example.com')).toBeVisible();
    expect(within(list).getByText('b.example.org')).toBeVisible();
    await user.click(within(list).getByRole('button', { name: 'Revoke api.example.com' }));
    await waitFor(() => expect(screen.queryByText('api.example.com')).toBeNull());
    expect(await storedSettings(bundle)).toContain('b.example.org');
    expect(await storedSettings(bundle)).not.toContain('api.example.com');
  });

  it('nothing consented: says so', async () => {
    await openAi();
    expect(screen.getByText("You haven't allowed any service to receive photos.")).toBeVisible();
  });

  it('has no axe violations (rungs only, and with the key form open)', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    function Hosted() {
      const session = useSession();
      return (
        <AiProvider services={session.ai}>
          <YourAiScreen />
        </AiProvider>
      );
    }
    await renderInSession(<Hosted />, { bundle, session: { fetch: new FakeFetch().fetch } });
    await screen.findByRole('heading', { level: 1, name: 'Your AI' });
    expect(await axe(document.body)).toHaveNoViolations();
    await chooseOwnKey(user);
    await fillForm(user, 'https://api.example.com/v1', 'vision-1');
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('YourAiScreen: the AI this server offers', () => {
  const OFFER = { enabled: true, model: 'vendor/model-x', label: 'Acme AI' };
  const offered = () => {
    const fake = new FakeFetch();
    fake.instanceConfig = OFFER;
    return fake;
  };
  const noAi = () => new AiSettings({ rung: { kind: 'noOp' } });

  it('is not listed while the server offers none (the default)', async () => {
    await openAi();
    expect(screen.queryByRole('radio', { name: /Provided by this server/ })).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Recognising a photo' })).toBeVisible();
  });

  it('is listed after No AI, with an honest line about where photos go', async () => {
    await openAi({ fake: offered(), seed: noAi() });
    const group = screen.getByRole('radiogroup', { name: 'Recognising a photo' });
    const radios = await waitFor(() => {
      const found = within(group).getAllByRole('radio');
      expect(found).toHaveLength(5);
      return found;
    });
    expect(radios.map((r) => r.closest('label')?.textContent ?? '')).toEqual([
      expect.stringContaining('No AI'),
      expect.stringContaining('Provided by this server'),
      expect.stringContaining('My own key'),
      expect.stringContaining('Free hosted model'),
      expect.stringContaining('Model on this device'),
    ]);
    expect(radios[1]?.closest('label')?.textContent).toContain(
      'No key needed. Photos go to this server, which sends them on to Acme AI.',
    );
    expect(radios[1]).toBeEnabled();
  });

  it('a NEW install starts on it (nothing to set up) and the screen explains it', async () => {
    await openAi({ fake: offered() });
    const radio = await screen.findByRole('radio', { name: /Provided by this server/ });
    await waitFor(() => expect(radio).toBeChecked());
    const section = screen.getByRole('heading', { name: 'AI on this server' }).closest('section');
    expect(section).not.toBeNull();
    const text = section?.textContent ?? '';
    expect(text).toContain('localhost');
    expect(text).toContain('Acme AI');
    expect(text).toContain('Model: vendor/model-x');
    // No key form, no key field: the server holds the key.
    expect(screen.queryByLabelText('API key')).toBeNull();
    expect(document.body.textContent).not.toMatch(/sk-|Bearer/);
  });

  it('an existing No AI choice is kept; choosing the server’s AI saves it, and No AI goes back', async () => {
    const user = userEvent.setup();
    const { bundle } = await openAi({ fake: offered(), seed: noAi() });
    const instance = await screen.findByRole('radio', { name: /Provided by this server/ });
    expect(screen.getByRole('radio', { name: /No AI/ })).toBeChecked();
    expect(instance).not.toBeChecked();

    await user.click(instance);
    await waitFor(async () => expect(await storedSettings(bundle)).toContain('"kind":"instance"'));
    expect(instance).toBeChecked();
    expect(await screen.findByRole('heading', { name: 'AI on this server' })).toBeVisible();

    await user.click(screen.getByRole('radio', { name: /No AI/ }));
    await waitFor(async () => expect(await storedSettings(bundle)).toContain('"kind":"noOp"'));
    expect(screen.queryByRole('heading', { name: 'AI on this server' })).toBeNull();
  });

  it('opening My own key from it swaps the explanation for the usual key form', async () => {
    const user = userEvent.setup();
    await openAi({ fake: offered(), seed: new AiSettings({ rung: { kind: 'instance' } }) });
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Provided by this server/ })).toBeChecked(),
    );
    await chooseOwnKey(user);
    expect(screen.getByLabelText('API key')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'AI on this server' })).toBeNull();
  });

  it('when the server stops offering it, nothing is faked as chosen and No AI can still be picked', async () => {
    const user = userEvent.setup();
    const fake = new FakeFetch(); // offers nothing
    const { bundle } = await openAi({
      fake,
      seed: new AiSettings({ rung: { kind: 'instance' } }),
    });
    expect(screen.queryByRole('radio', { name: /Provided by this server/ })).toBeNull();
    const none = screen.getByRole('radio', { name: /No AI/ });
    expect(none).not.toBeChecked();
    await user.click(none);
    await waitFor(async () => expect(await storedSettings(bundle)).toContain('"kind":"noOp"'));
  });

  it('has no axe violations with the offer on screen', async () => {
    const bundle = await unlockedBundle();
    function Hosted() {
      const session = useSession();
      return (
        <AiProvider services={session.ai}>
          <YourAiScreen />
        </AiProvider>
      );
    }
    await renderInSession(<Hosted />, { bundle, session: { fetch: offered().fetch } });
    await screen.findByRole('radio', { name: /Provided by this server/ });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'AI on this server' })).toBeVisible(),
    );
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('YourAiScreen: AI coaching consent', () => {
  const byok = () =>
    new AiSettings({
      rung: { kind: 'byok', previousRung: { previousKind: 'noOp' } },
      byokEndpointUrl: 'https://api.example.com/v1',
      byokModel: 'gpt-test',
      byokKeyHost: 'api.example.com',
    });
  const consentRow = (bundle: StoreBundle) => bundle.kv.read(KV_KEYS.aiCoachingConsent);
  const SWITCH = 'Let the AI write coach notes and answer questions';

  it('on No AI the switch is off and disabled, and says to choose an AI first', async () => {
    await openAi();
    const toggle = screen.getByRole('switch', { name: SWITCH });
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeDisabled();
    expect(screen.getByText(/Choose an AI above first/)).toBeVisible();
  });

  it('lists exactly what is sent and where, defaults to off, and is not the photo consent', async () => {
    const user = userEvent.setup();
    const { bundle } = await openAi({ seed: byok(), seedKey: SECRET });
    const toggle = screen.getByRole('switch', { name: SWITCH });
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeEnabled();
    expect(
      screen.getByText(/the names of your foods, their weights, nutrient totals/),
    ).toBeVisible();
    expect(screen.getByText(/Never your photos, never your passphrase/)).toBeVisible();
    expect(screen.getByText('Destination: api.example.com, the service you chose.')).toBeVisible();
    expect(await consentRow(bundle)).toBeNull();

    await user.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(await consentRow(bundle)).toBe('{"host":"api.example.com"}');
    // The photo consent list is untouched.
    expect(screen.getByText("You haven't allowed any service to receive photos.")).toBeVisible();

    await user.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(await consentRow(bundle)).toBeNull();
  });

  it('names this server and its provider on the instance rung', async () => {
    const fake = new FakeFetch();
    fake.instanceConfig = { enabled: true, model: 'm1', label: 'Acme AI' };
    await openAi({ fake, seed: new AiSettings({ rung: { kind: 'instance' } }) });
    await waitFor(() =>
      expect(
        screen.getByText(/Destination: localhost, this server, which passes it on to Acme AI\./),
      ).toBeVisible(),
    );
  });

  it('has no axe violations', async () => {
    const { bundle } = await openAi({ seed: byok(), seedKey: SECRET });
    expect(bundle).toBeDefined();
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('YourAiScreen: the server’s AI in the consent list', () => {
  it('shows the agreement as "host — provider" and revokes the exact key', async () => {
    const user = userEvent.setup();
    const key = 'instance:plate.example.test|acme ai|vendor/model-x';
    const { bundle } = await openAi({ seed: new AiSettings({ photoConsentHosts: [key] }) });
    const list = screen.getByRole('list', { name: 'Services that may receive photos' });
    expect(within(list).getByText('plate.example.test — acme ai')).toBeVisible();
    await user.click(
      within(list).getByRole('button', { name: 'Revoke plate.example.test — acme ai' }),
    );
    await waitFor(() => expect(screen.queryByText('plate.example.test — acme ai')).toBeNull());
    expect(await storedSettings(bundle)).not.toContain('instance:');
  });
});
