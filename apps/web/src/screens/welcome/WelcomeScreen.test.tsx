// The first-run welcome: four steps at most, every one skippable, nothing mandatory; the answers go
// through the same editor as Settings, Profile; resumable; shown once and never replayed.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localDayText } from '@anc/core';
import { axe } from 'vitest-axe';
import { clearFreshStore, markFreshStore } from '../../app/fresh-store';
import { renderInSession, renderUnlockedApp, unlockedBundle } from '../../app/testing';
import { KV_KEYS } from '../../storage';
import { WelcomeScreen } from './WelcomeScreen';

afterEach(() => {
  cleanup();
  clearFreshStore();
  window.location.hash = '';
});

const group = (name: string) => screen.getByRole('group', { name });

describe('WelcomeScreen', () => {
  it('step 1 says what this is and where the data lives, in three plain lines', async () => {
    const onSkip = vi.fn();
    await renderInSession(
      <WelcomeScreen
        step={1}
        onStep={() => undefined}
        onSkip={onSkip}
        onFinish={() => undefined}
      />,
      { bundle: await unlockedBundle() },
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome' })).toBeVisible();
    expect(screen.getByText('Step 1 of 4')).toBeVisible();
    expect(
      screen.getByText('Log what you eat by photo, barcode, typing, or by describing it.'),
    ).toBeVisible();
    expect(
      screen.getByText(/against your own guide, in plain numbers, with no scores/),
    ).toBeVisible();
    expect(screen.getByText(/asks a question rather than passing judgment/)).toBeVisible();
    expect(screen.getByText(/stays on this device, encrypted with your passphrase/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('walks the four steps with Back, keeps the answers and shows the guide live', async () => {
    const bundle = await unlockedBundle();
    const steps: number[] = [];
    const onFinish = vi.fn();
    const { container } = await renderInSession(
      <WelcomeScreen
        step={1}
        onStep={(n) => steps.push(n)}
        onSkip={() => undefined}
        onFinish={onFinish}
      />,
      { bundle },
    );
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // 2: the goal, with the support line the standard requires.
    expect(screen.getByRole('heading', { level: 1, name: 'What you are here for' })).toBeVisible();
    await userEvent.click(within(group('Goal')).getByRole('radio', { name: 'Stay as I am' }));
    expect(
      screen.getByRole('link', { name: /Beat, the UK eating disorder charity/ }),
    ).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // 3: only what the guide needs, the guide live, and where to change it later.
    expect(screen.getByRole('heading', { level: 1, name: 'About you' })).toBeVisible();
    expect(screen.getByText(/change any of them in Settings, Profile/)).toBeVisible();
    expect(screen.queryByLabelText('Waist in cm')).not.toBeInTheDocument();
    await userEvent.click(within(group('Sex')).getByRole('radio', { name: 'Female' }));
    await userEvent.click(within(group('Age range')).getByRole('radio', { name: '30-49' }));
    await userEvent.click(within(group('Activity')).getByRole('radio', { name: 'Some movement' }));
    await userEvent.type(screen.getByLabelText('Height in cm'), '170');
    // A weight typed and left with Next (no Save tap) is kept.
    await userEvent.type(screen.getByLabelText('Weight in kg'), '70,5');
    expect(
      await screen.findByText(/Your daily guide is about \d{4} kcal and \d+ g of protein/),
    ).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(async () => {
      const stored = await bundle.measurements.list('weight');
      expect(stored.kind === 'measurement' && stored.value[0]?.value).toBe(70.5);
    });
    const profile = JSON.parse((await bundle.kv.read(KV_KEYS.profile)) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(profile).toMatchObject({ goal: 'maintain', sex: 'female', heightCm: 170 });

    // 4: the four ways, and the honest state of the AI (none here).
    expect(screen.getByRole('heading', { level: 1, name: 'Your first plate' })).toBeVisible();
    for (const text of [/^Snapshot: /, /^Barcode: /, /^Type it: /, /^Describe: /]) {
      expect(screen.getByText(text)).toBeVisible();
    }
    // The state of the AI is stated as the code works: a photo needs one; a typed description is
    // matched on this device; speaking needs one.
    expect(
      screen.getByText(
        /No AI is connected, so a photo cannot be read and speaking will not work yet/,
      ),
    ).toBeVisible();
    expect(screen.getByText(/matched against the food list on this device\)/)).toBeVisible();
    expect(screen.getByText(/^Snapshot: .*needs an AI/)).toBeVisible();
    expect(screen.getByText(/^Describe: .*speaking needs an AI/)).toBeVisible();
    expect(screen.getByText(/^Barcode: .*looked up on Open Food Facts/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Settings, Your AI' })).toHaveAttribute(
      'href',
      '#/settings/ai',
    );
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { level: 1, name: 'About you' })).toBeVisible();
    // Typed answers are still there after going back.
    expect(within(group('Sex')).getByRole('radio', { name: 'Female' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Log my first plate' }));
    expect(onFinish).toHaveBeenCalledWith(true);
    expect(steps).toEqual([2, 3, 4, 3, 4]);
  });

  it('shows the pace for a weight goal, and no exclamation anywhere', async () => {
    await renderInSession(
      <WelcomeScreen
        step={2}
        onStep={() => undefined}
        onSkip={() => undefined}
        onFinish={() => undefined}
      />,
      { bundle: await unlockedBundle() },
    );
    await userEvent.click(within(group('Goal')).getByRole('radio', { name: 'Lose weight' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(within(group('Pace')).getByRole('radio', { name: /Gentle/ })).toBeVisible();
    expect(document.body.textContent).not.toContain('!');
  });
});

describe('the welcome in the app (shown once, after a store made here)', () => {
  it('is not shown on a later unlock, a restore or a join: no fresh store, no welcome', async () => {
    await renderUnlockedApp(await unlockedBundle());
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
  });

  it('a store made here opens the welcome; "Not now" lands on Today, remembers it and leaves one quiet line', async () => {
    const bundle = await unlockedBundle();
    markFreshStore();
    const view = await renderUnlockedApp(bundle);
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome' })).toBeVisible();
    await waitFor(async () => expect(await bundle.kv.read(KV_KEYS.uiWelcomeStep)).toBe('1'));
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await waitFor(async () => expect(await bundle.kv.read(KV_KEYS.uiWelcome)).toBe('skipped'));
    expect(await bundle.kv.read(KV_KEYS.uiWelcomeStep)).toBeNull();

    // No guide of their own yet and the welcome set aside: one quiet, dismissible line.
    const hint = await screen.findByText(
      'Your day is shown against a general reference. Add a few details for a guide of your own.',
    );
    expect(hint).toBeVisible();
    expect(screen.getByRole('link', { name: 'Add details in Profile' })).toHaveAttribute(
      'href',
      '#/settings/profile',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByText(/general reference/)).not.toBeInTheDocument());
    await waitFor(async () =>
      expect(await bundle.kv.read(KV_KEYS.uiGuideHintDismissed)).toBe('on'),
    );

    // A new session (a reload, another unlock) shows neither the welcome nor the line.
    view.unmount();
    await renderUnlockedApp(bundle);
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(screen.queryByText(/general reference/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
  });

  it('finishing opens the log sheet on Today and remembers "done" (and no line is left)', async () => {
    const bundle = await unlockedBundle();
    markFreshStore();
    await renderUnlockedApp(bundle);
    await screen.findByRole('heading', { level: 1, name: 'Welcome' });
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Log my first plate' }));
    expect(await screen.findByRole('dialog', { name: 'Log a plate' })).toBeVisible();
    await waitFor(async () => expect(await bundle.kv.read(KV_KEYS.uiWelcome)).toBe('done'));
    expect(screen.queryByText(/general reference/)).not.toBeInTheDocument();
  });

  it('resumes where it was after a reload (the step is kept in the encrypted store)', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.uiWelcomeStep, '3');
    await renderUnlockedApp(bundle);
    expect(await screen.findByRole('heading', { level: 1, name: 'About you' })).toBeVisible();
    expect(screen.getByText('Step 3 of 4')).toBeVisible();
  });

  it('is not replayed on a second device of the same person (the answer is a synced key)', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.uiWelcome, 'done');
    markFreshStore();
    await renderUnlockedApp(bundle);
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Welcome' })).not.toBeInTheDocument();
  });
});

describe('the welcome body step settles what is typed', () => {
  async function aboutYou(profile?: Record<string, unknown>) {
    const bundle = await unlockedBundle();
    if (profile !== undefined) await bundle.kv.write(KV_KEYS.profile, JSON.stringify(profile));
    const steps: number[] = [];
    await renderInSession(
      <WelcomeScreen
        step={3}
        onStep={(n) => steps.push(n)}
        onSkip={() => undefined}
        onFinish={() => undefined}
      />,
      { bundle },
    );
    return { bundle, steps };
  }
  const storedProfile = async (bundle: Awaited<ReturnType<typeof unlockedBundle>>) =>
    JSON.parse((await bundle.kv.read(KV_KEYS.profile)) ?? '{}') as Record<string, unknown>;

  it('an invalid weight blocks Next, shows its message on the field and focuses it', async () => {
    const { steps } = await aboutYou();
    await userEvent.type(screen.getByLabelText('Weight in kg'), '500');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByLabelText('Weight in kg')).toHaveFocus());
    expect(screen.getAllByText(/Please type a weight between 20 and 400 kg\./)[0]).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'About you' })).toBeVisible();
    expect(steps).toEqual([]);
    // Corrected, it is kept and Next goes on.
    await userEvent.clear(screen.getByLabelText('Weight in kg'));
    await userEvent.type(screen.getByLabelText('Weight in kg'), '70');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your first plate' }),
    ).toBeVisible();
  });

  it('an invalid height blocks Next the same way, before the weight is looked at', async () => {
    const { steps } = await aboutYou();
    await userEvent.type(screen.getByLabelText('Height in cm'), 'abc');
    await userEvent.type(screen.getByLabelText('Weight in kg'), '70');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByLabelText('Height in cm')).toHaveFocus());
    expect(screen.getAllByText(/Please type a number, for example 170\./)[0]).toBeVisible();
    expect(steps).toEqual([]);
  });

  it('a weight far from the last one is asked about before Next goes on', async () => {
    const bundle = await unlockedBundle();
    const yesterday = Date.now() - 86_400_000;
    await bundle.measurements.record({
      kind: 'weight',
      value: 82,
      measuredAtUtc: yesterday,
      day: localDayText(yesterday),
    });
    await renderInSession(
      <WelcomeScreen
        step={3}
        onStep={() => undefined}
        onSkip={() => undefined}
        onFinish={() => undefined}
      />,
      { bundle },
    );
    await userEvent.type(screen.getByLabelText('Weight in kg'), '182');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      await screen.findByText('That is quite different from your last weigh-in. Save it as typed?'),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'About you' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Change it' })).toHaveFocus();
  });

  it('writes an imperial height only once feet and inches are both settled', async () => {
    const { bundle } = await aboutYou({ units: 'imperial' });
    await userEvent.type(screen.getByLabelText('Feet'), '5');
    await userEvent.tab(); // to the inches field: nothing is written for "5 ft 0 in"
    expect((await storedProfile(bundle))['heightCm']).toBeUndefined();
    await userEvent.type(screen.getByLabelText('Inches'), '11');
    await userEvent.tab();
    await waitFor(async () => expect((await storedProfile(bundle))['heightCm']).toBe(180.3));
  });

  it('does not write a height again when leaving the field with the value it already has', async () => {
    const { bundle } = await aboutYou({ heightCm: 170 });
    const write = vi.spyOn(bundle.kv, 'write');
    const field = screen.getByLabelText('Height in cm');
    await userEvent.clear(field);
    await userEvent.type(field, '170');
    await userEvent.tab();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(write.mock.calls.filter(([key]) => key === KV_KEYS.profile)).toHaveLength(0);
    // The same weight for today, left twice, is recorded once.
    const record = vi.spyOn(bundle.measurements, 'record');
    await userEvent.type(screen.getByLabelText('Weight in kg'), '70');
    await userEvent.tab();
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    await userEvent.type(screen.getByLabelText('Weight in kg'), '70');
    await userEvent.tab();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(record).toHaveBeenCalledTimes(1);
  });
});
