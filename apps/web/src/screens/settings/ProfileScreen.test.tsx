// Settings, Profile: optional radio groups, kept in the encrypted store, with the support line.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { renderInSession, renderUnlockedApp, unlockedBundle } from '../../app/testing';
import { KV_KEYS } from '../../storage';
import { ProfileScreen } from './ProfileScreen';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const group = (name: string) => screen.getByRole('group', { name });
const stored = async (bundle: Awaited<ReturnType<typeof unlockedBundle>>) =>
  JSON.parse((await bundle.kv.read(KV_KEYS.profile)) ?? 'null') as Record<string, unknown> | null;

describe('ProfileScreen', () => {
  it('shows the optional line and every group on "Not set"', async () => {
    await renderInSession(<ProfileScreen />, { bundle: await unlockedBundle() });
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
    expect(screen.getByText(/^Optional\. It tunes your daily guide and the coach\./)).toBeVisible();
    for (const heading of ['About you', 'Body', 'Goal', 'Your daily guide', 'Food']) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeVisible();
    }
    for (const name of ['Age range', 'Sex', 'Activity', 'Goal', 'Diet']) {
      expect(within(group(name)).getByRole('radio', { name: 'Not set' })).toBeChecked();
    }
    expect(screen.getByRole('button', { name: 'Clear profile' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove all measurements' })).toBeDisabled();
    expect(screen.getByText(/Until then the EU reference intake is used/)).toBeVisible();
  });

  it('a choice is kept in the encrypted store and personalises the guide', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<ProfileScreen />, { bundle });
    await userEvent.click(within(group('Sex')).getByRole('radio', { name: 'Female' }));
    await userEvent.click(within(group('Age range')).getByRole('radio', { name: '30-49' }));
    await userEvent.click(within(group('Activity')).getByRole('radio', { name: 'Some movement' }));
    await waitFor(async () =>
      expect(await stored(bundle)).toEqual({
        sex: 'female',
        ageBand: '30-49',
        activity: 'moderate',
      }),
    );
    expect(
      await screen.findByText(/Your daily guide is about 2000 kcal and 49 g of protein/),
    ).toBeVisible();
  });

  it('radio targets are at least 48px tall', async () => {
    await renderInSession(<ProfileScreen />, { bundle: await unlockedBundle() });
    const pill = within(group('Sex')).getByRole('radio', { name: 'Male' }).nextElementSibling;
    expect(pill?.className).toContain('min-h-12');
    expect(screen.getByRole('button', { name: 'Clear profile' }).className).toContain('min-h-12');
  });

  it('shows the support line next to the goal and pace choice always, and once in Body for weight, height and waist', async () => {
    await renderInSession(<ProfileScreen />, { bundle: await unlockedBundle() });
    const links = () =>
      screen.queryAllByRole('link', { name: /Beat, the UK eating disorder charity/ });
    // One in Goal, whatever the goal (even none), and exactly one in Body (not one per field).
    expect(links()).toHaveLength(2);
    const body = screen.getByRole('heading', { level: 2, name: 'Body' }).closest('section');
    expect(within(body as HTMLElement).getAllByRole('link', { name: /Beat/ })).toHaveLength(1);
    const goal = screen.getByRole('heading', { level: 2, name: 'Goal' }).closest('section');
    expect(within(goal as HTMLElement).getAllByRole('link', { name: /Beat/ })).toHaveLength(1);
    for (const name of ['Stay as I am', 'Lose weight', 'Gain weight', 'Eat better']) {
      await userEvent.click(within(group('Goal')).getByRole('radio', { name }));
      await waitFor(() => expect(links()).toHaveLength(2));
    }
    for (const link of links()) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('a weight and a height make the guide personal; the weight is a dated weigh-in for today', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(
      KV_KEYS.profile,
      JSON.stringify({ sex: 'female', ageBand: '30-49', activity: 'moderate' }),
    );
    await renderInSession(<ProfileScreen />, { bundle });
    await userEvent.type(screen.getByLabelText('Height in cm'), '165');
    await userEvent.click(screen.getByRole('button', { name: 'Save height' }));
    await userEvent.type(screen.getByLabelText('Weight in kg'), '70,5'); // a decimal comma
    await userEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    await waitFor(async () => expect((await stored(bundle))?.['heightCm']).toBe(165));
    const listed = await bundle.measurements.list('weight');
    expect(listed.kind === 'measurement' && listed.value.map((m) => m.value)).toEqual([70.5]);
    expect(await screen.findByText(/Last: 70\.5 kg on /)).toBeVisible();
    // The field is empty again: the last value is text, never pre-filled.
    expect(screen.getByLabelText('Weight in kg')).toHaveValue('');
    // Weight-and-height Henry: 8.18 x 70.5 + 502 x 1.65 - 11.6 = 1393 x 1.6 = 2229 -> 2250 kcal; 0.83 x 70.5 = 59 g.
    expect(
      await screen.findByText(/Your daily guide is about 2250 kcal and 59 g of protein/),
    ).toBeVisible();
    // A second weigh-in the same day replaces the first.
    const weight = screen.getByLabelText('Weight in kg');
    await userEvent.clear(weight);
    await userEvent.type(weight, '69');
    await userEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    await waitFor(async () => {
      const again = await bundle.measurements.list('weight');
      expect(again.kind === 'measurement' && again.value.map((m) => m.value)).toEqual([69]);
    });
  });

  it('refuses a number that is not one, or out of range, calmly and specifically, and saves nothing', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<ProfileScreen />, { bundle });
    await userEvent.type(screen.getByLabelText('Weight in kg'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    expect(await screen.findByText('Please type a weight between 20 and 400 kg.')).toBeVisible();
    await userEvent.clear(screen.getByLabelText('Weight in kg'));
    await userEvent.type(screen.getByLabelText('Weight in kg'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    expect(await screen.findByText('Please type a number, for example 70.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Height in cm'), '90');
    await userEvent.click(screen.getByRole('button', { name: 'Save height' }));
    expect(await screen.findByText('Please type a height between 100 and 250 cm.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Waist in cm'), '500');
    await userEvent.click(screen.getByRole('button', { name: 'Save waist' }));
    expect(await screen.findByText('Please type a waist between 30 and 250 cm.')).toBeVisible();
    const none = await bundle.measurements.list();
    expect(none.kind === 'measurement' && none.value).toEqual([]);
    expect(await stored(bundle)).toBeNull();
  });

  it('numeric fields use the decimal keyboard and 56px fields', async () => {
    await renderInSession(<ProfileScreen />, { bundle: await unlockedBundle() });
    for (const label of ['Height in cm', 'Weight in kg', 'Waist in cm']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('inputmode', 'decimal');
    }
  });

  it('imperial units: lb and ft/in in, kg and cm stored', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<ProfileScreen />, { bundle });
    await userEvent.click(within(group('Units')).getByRole('radio', { name: 'lb and ft/in' }));
    await userEvent.type(await screen.findByLabelText('Feet'), '5');
    await userEvent.type(screen.getByLabelText('Inches'), '7');
    await userEvent.click(screen.getByRole('button', { name: 'Save height' }));
    await userEvent.type(screen.getByLabelText('Weight in lb'), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    await waitFor(async () => expect((await stored(bundle))?.['heightCm']).toBe(170.2));
    expect((await stored(bundle))?.['units']).toBe('imperial');
    const listed = await bundle.measurements.list('weight');
    // Two decimals in kg, so 150 lb shows 150 lb again.
    expect(listed.kind === 'measurement' && listed.value.map((m) => m.value)).toEqual([68.04]);
    expect(await screen.findByText(/Last: 150 lb on /)).toBeVisible();
    expect(screen.getByLabelText('Weight in lb')).toHaveValue('');
  });

  it('imperial height: 5\'11" typed or pasted in the feet field is split; the range error is in feet and inches and tied to both fields', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.profile, JSON.stringify({ units: 'imperial' }));
    await renderInSession(<ProfileScreen />, { bundle });
    const feet = await screen.findByLabelText('Feet');
    const inches = screen.getByLabelText('Inches');
    await userEvent.type(feet, '5 ft 11');
    await userEvent.click(screen.getByRole('button', { name: 'Save height' }));
    await waitFor(async () => expect((await stored(bundle))?.['heightCm']).toBe(180.3));
    expect(feet).toHaveValue('5');
    expect(inches).toHaveValue('11');
    // Pasted whole.
    await userEvent.clear(feet);
    await userEvent.clear(inches);
    await userEvent.click(feet);
    await userEvent.paste('6\'2"');
    expect(feet).toHaveValue('6');
    expect(inches).toHaveValue('2');
    // Inches go to 11.9 only.
    await userEvent.clear(inches);
    await userEvent.type(inches, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save height' }));
    const message = await screen.findByText('Inches go from 0 to 11.9.');
    expect(feet).toHaveAttribute('aria-describedby', message.id);
    expect(inches).toHaveAttribute('aria-describedby', message.id);
    // The range error is in feet and inches, not decimal feet.
    await userEvent.clear(feet);
    await userEvent.type(feet, '9');
    await userEvent.clear(inches);
    await userEvent.type(inches, '0');
    await userEvent.click(screen.getByRole('button', { name: 'Save height' }));
    expect(
      await screen.findByText('Please type a height between 3 ft 3.4 in and 8 ft 2.4 in.'),
    ).toBeVisible();
  });

  it('a weigh-in field is never pre-filled with the last value, so Save cannot record a stale weight', async () => {
    const bundle = await unlockedBundle();
    await bundle.measurements.record({
      kind: 'weight',
      value: 82.4,
      measuredAtUtc: Date.now() - 3 * 86_400_000,
    });
    await bundle.measurements.record({
      kind: 'waist',
      value: 90,
      measuredAtUtc: Date.now() - 3 * 86_400_000,
    });
    await renderInSession(<ProfileScreen />, { bundle });
    expect(await screen.findByText(/Last: 82\.4 kg on /)).toBeVisible();
    expect(screen.getByLabelText('Weight in kg')).toHaveValue('');
    expect(screen.getByLabelText('Waist in cm')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    expect(await screen.findByText('Please type a number, for example 70.')).toBeVisible();
    const listed = await bundle.measurements.list('weight');
    expect(listed.kind === 'measurement' && listed.value).toHaveLength(1);
  });

  it('a goal to lose or gain offers the pace, with what it means and a realistic expectation; pregnancy only when losing and not male', async () => {
    await renderInSession(<ProfileScreen />, { bundle: await unlockedBundle() });
    expect(screen.queryByRole('group', { name: 'Pace' })).toBeNull();
    await userEvent.click(within(group('Goal')).getByRole('radio', { name: 'Lose weight' }));
    const pace = await screen.findByRole('group', { name: 'Pace' });
    expect(within(pace).getByRole('radio', { name: 'Gentle' })).toBeChecked(); // gentle when none chosen
    expect(screen.getByText(/About 250 kcal a day below/)).toBeVisible();
    await userEvent.click(within(pace).getByRole('radio', { name: 'Standard' }));
    expect(await screen.findByText(/About 500 kcal a day below/)).toBeVisible();
    expect(
      screen.getByText(/5 to 10 % of your weight in six months is a realistic result/),
    ).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /I am pregnant or breastfeeding/ })).toBeVisible();
    await userEvent.click(within(group('Sex')).getByRole('radio', { name: 'Male' }));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: /pregnant/ })).toBeNull());
    await userEvent.click(within(group('Goal')).getByRole('radio', { name: 'Gain weight' }));
    expect(await screen.findByText(/About 250 kcal a day above/)).toBeVisible();
  });

  it('holds the guide at maintenance with the calm line for a low BMI, and for 65 and over', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(
      KV_KEYS.profile,
      JSON.stringify({
        sex: 'female',
        ageBand: '30-49',
        activity: 'moderate',
        goal: 'lose',
        heightCm: 170,
      }),
    );
    await bundle.measurements.record({ kind: 'weight', value: 50, measuredAtUtc: Date.now() });
    await renderInSession(<ProfileScreen />, { bundle });
    expect(
      await screen.findByText(
        /Your daily guide stays at what keeps your weight steady\. If you want to lose weight, talking to a doctor or a dietitian first can help\./,
      ),
    ).toBeVisible();
  });

  it('holds the guide at maintenance with the calm line at 65 and over (BMI under 30)', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(
      KV_KEYS.profile,
      JSON.stringify({
        sex: 'female',
        ageBand: '65+',
        activity: 'moderate',
        goal: 'lose',
        heightCm: 170,
      }),
    );
    await bundle.measurements.record({ kind: 'weight', value: 65, measuredAtUtc: Date.now() });
    await renderInSession(<ProfileScreen />, { bundle });
    expect(
      await screen.findByText(/After 65, weight loss is best decided with a doctor\./),
    ).toBeVisible();
  });

  it('"How this is worked out" gives the steps, the inputs and the accuracy', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(
      KV_KEYS.profile,
      JSON.stringify({
        sex: 'female',
        ageBand: '30-49',
        activity: 'moderate',
        goal: 'lose',
        pace: 'standard',
        heightCm: 165,
      }),
    );
    await bundle.measurements.record({ kind: 'weight', value: 70, measuredAtUtc: Date.now() });
    await renderInSession(<ProfileScreen />, { bundle });
    await userEvent.click(await screen.findByText('How this is worked out'));
    expect(
      screen.getByText(
        /Resting energy: about .* kcal a day, from the Henry \(2005\) equations, using your weight and height\./,
      ),
    ).toBeVisible();
    expect(screen.getByText(/Your goal and pace: 500 kcal a day below that\./)).toBeVisible();
    expect(screen.getByText(/usually within about 10 %/)).toBeVisible();
    expect(screen.queryByText(/thresholds/)).toBeNull();
  });

  it('without a height or a weight a weight-loss goal holds at maintenance and asks for them; the disclosure says so', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(
      KV_KEYS.profile,
      JSON.stringify({ sex: 'female', ageBand: '30-49', activity: 'moderate', goal: 'lose' }),
    );
    await renderInSession(<ProfileScreen />, { bundle });
    expect(
      await screen.findByText(
        'To work out a weight-loss guide, add your height and your weight in Body. Until then your daily guide is the energy that keeps your weight steady.',
      ),
    ).toBeVisible();
    expect(screen.getByText(/Your daily guide is about 2,?000 kcal/)).toBeVisible();
    await userEvent.click(screen.getByText('How this is worked out'));
    expect(screen.getByText(/Your height and weight are needed first/)).toBeVisible();
    expect(screen.getByText(/can change in steps rather than smoothly/)).toBeVisible();
    expect(screen.getByText(/Your goal asks for no change to that\./)).toBeVisible();
  });

  it('the pregnancy line asks for a midwife or a doctor; a stored flag does not outlive switching to male', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(
      KV_KEYS.profile,
      JSON.stringify({ sex: 'female', goal: 'lose', pregnantOrBreastfeeding: true }),
    );
    await renderInSession(<ProfileScreen />, { bundle });
    expect(
      await screen.findByText(
        'The guide does not account for the extra needs of pregnancy or breastfeeding. A midwife or a doctor is the right person to ask.',
      ),
    ).toBeVisible();
    await userEvent.click(within(group('Sex')).getByRole('radio', { name: 'Male' }));
    await waitFor(async () => expect(await stored(bundle)).toEqual({ sex: 'male', goal: 'lose' }));
    await userEvent.click(within(group('Sex')).getByRole('radio', { name: 'Female' }));
    await waitFor(async () => expect((await stored(bundle))?.['sex']).toBe('female'));
    expect((await stored(bundle))?.['pregnantOrBreastfeeding']).toBeUndefined();
  });

  it('while a safeguard holds the guide, an own figure below maintenance is refused in the form; at or above is taken', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(
      KV_KEYS.profile,
      JSON.stringify({
        sex: 'female',
        ageBand: '30-49',
        activity: 'moderate',
        goal: 'lose',
        heightCm: 170,
      }),
    );
    await bundle.measurements.record({ kind: 'weight', value: 50, measuredAtUtc: Date.now() });
    await renderInSession(<ProfileScreen />, { bundle });
    await userEvent.click(await screen.findByText('Set my own guide'));
    await userEvent.type(screen.getByLabelText('Daily energy in kcal'), '1300');
    await userEvent.click(screen.getByRole('button', { name: 'Use this figure' }));
    expect(
      await screen.findByText(
        /lower than what keeps your weight steady, and your daily guide is held there/,
      ),
    ).toBeVisible();
    expect((await stored(bundle))?.['customEnergyKcal']).toBeUndefined();
    const field = screen.getByLabelText('Daily energy in kcal');
    await userEvent.clear(field);
    await userEvent.type(field, '2300');
    await userEvent.click(screen.getByRole('button', { name: 'Use this figure' }));
    await waitFor(async () => expect((await stored(bundle))?.['customEnergyKcal']).toBe(2300));
  });

  it('a stored own figure that a safeguard now overrides is ignored, says so, and the notice stays', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(
      KV_KEYS.profile,
      JSON.stringify({
        sex: 'female',
        ageBand: '30-49',
        activity: 'moderate',
        goal: 'lose',
        heightCm: 170,
        customEnergyKcal: 1300,
      }),
    );
    await bundle.measurements.record({ kind: 'weight', value: 50, measuredAtUtc: Date.now() });
    await renderInSession(<ProfileScreen />, { bundle });
    expect(
      await screen.findByText(/If you want to lose weight, talking to a doctor/),
    ).toBeVisible();
    expect(
      screen.getByText(/so the computed guide is used instead\. A lower figure/),
    ).toBeVisible();
    await userEvent.click(screen.getByText('How this is worked out'));
    expect(
      screen.getByText(/Your own figure was below what keeps your weight steady/),
    ).toBeVisible();
  });

  it('with numbers off, no kcal, protein, BMI or ratio is shown here: the notices stay, with a link to Settings, Nutrition', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.uiShowNumbers, 'off');
    await bundle.kv.write(
      KV_KEYS.profile,
      JSON.stringify({
        sex: 'female',
        ageBand: '30-49',
        activity: 'moderate',
        goal: 'lose',
        heightCm: 170,
      }),
    );
    await bundle.measurements.record({ kind: 'weight', value: 50, measuredAtUtc: Date.now() });
    await bundle.measurements.record({ kind: 'waist', value: 70, measuredAtUtc: Date.now() });
    await renderInSession(<ProfileScreen />, { bundle });
    const section = (
      await screen.findByRole('heading', { level: 2, name: 'Your daily guide' })
    ).closest('section') as HTMLElement;
    expect(
      within(section).getByText(/If you want to lose weight, talking to a doctor/),
    ).toBeVisible();
    const text = section.textContent ?? '';
    expect(text).not.toMatch(/kcal|protein|BMI|[0-9]/);
    expect(within(section).queryByText('How this is worked out')).toBeNull();
    expect(within(section).queryByText('Set my own guide')).toBeNull();
    expect(within(section).queryByText('Body mass index and waist-to-height ratio')).toBeNull();
    expect(
      within(section).getByRole('link', { name: 'Show them in Settings, Nutrition' }),
    ).toHaveAttribute('href', '#/settings/nutrition');
  });

  it('your own guide: a figure is used, one below the floor is refused with a calm explanation, and can be reset', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(
      KV_KEYS.profile,
      JSON.stringify({ sex: 'female', ageBand: '30-49', activity: 'moderate' }),
    );
    await renderInSession(<ProfileScreen />, { bundle });
    await userEvent.click(await screen.findByText('Set my own guide'));
    await userEvent.type(screen.getByLabelText('Daily energy in kcal'), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Use this figure' }));
    expect(
      await screen.findByText(/lower than the lowest figure used for a guide \(1,?200 kcal\)/),
    ).toBeVisible();
    expect((await stored(bundle))?.['customEnergyKcal']).toBeUndefined();
    const field = screen.getByLabelText('Daily energy in kcal');
    await userEvent.clear(field);
    await userEvent.type(field, '1850');
    await userEvent.click(screen.getByRole('button', { name: 'Use this figure' }));
    await waitFor(async () => expect((await stored(bundle))?.['customEnergyKcal']).toBe(1850));
    expect(await screen.findByText(/Your daily guide is about 1,?850 kcal/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Go back to the computed guide' }));
    await waitFor(async () => expect((await stored(bundle))?.['customEnergyKcal']).toBeUndefined());
  });

  it('BMI and the waist-to-height ratio are plain numbers with their reference ranges as text, behind a disclosure, with the caveats', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.profile, JSON.stringify({ heightCm: 170 }));
    await bundle.measurements.record({ kind: 'weight', value: 70, measuredAtUtc: Date.now() });
    await bundle.measurements.record({ kind: 'waist', value: 85, measuredAtUtc: Date.now() });
    const { container } = await renderInSession(<ProfileScreen />, { bundle });
    await userEvent.click(await screen.findByText('Body mass index and waist-to-height ratio'));
    expect(screen.getByText('Body mass index (BMI): 24.2.')).toBeVisible();
    expect(
      screen.getByText(
        /Reference ranges for adults \(WHO\): below 18\.5; 18\.5 to 24\.9; 25 to 29\.9; 30 or more\./,
      ),
    ).toBeVisible();
    expect(screen.getByText('Waist-to-height ratio: 0.50.')).toBeVisible();
    expect(
      screen.getByText(
        /Reference ranges for adults \(NICE\): 0\.4 to 0\.49; 0\.5 to 0\.59; 0\.6 or more\./,
      ),
    ).toBeVisible();
    expect(screen.getByText(/muscular build, at 65 and over, and in pregnancy/)).toBeVisible();
    expect(
      screen.getByText(
        /South Asian, Chinese, other Asian, Middle Eastern, Black African or African-Caribbean/,
      ),
    ).toBeVisible();
    // Never a label attached to the person, and no colour.
    expect(container.textContent).not.toMatch(
      /you are (overweight|underweight|obese|healthy)|\bobese\b/i,
    );
    expect(container.innerHTML).not.toMatch(
      /text-(red|green|amber|rose|orange|yellow)|bg-(red|green|amber|rose|orange|yellow)/,
    );
  });

  it('"Clear profile" clears the answers only; "Remove all measurements" asks first, names what goes and that it syncs, and removes every weigh-in', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.profile, JSON.stringify({ heightCm: 170 }));
    await bundle.measurements.record({ kind: 'weight', value: 70, measuredAtUtc: Date.now() });
    await renderInSession(<ProfileScreen />, { bundle });
    await userEvent.click(await screen.findByRole('button', { name: 'Clear profile' }));
    expect(await screen.findByText('Profile cleared.')).toBeVisible();
    expect(await stored(bundle)).toBeNull();
    const kept = await bundle.measurements.list();
    expect(kept.kind === 'measurement' && kept.value).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Remove all measurements' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove all measurements?' });
    expect(dialog).toHaveTextContent(/every weigh-in and every waist measurement/);
    expect(dialog).toHaveTextContent(
      /every device that syncs with this one, and it cannot be undone/,
    );
    // "Keep them" is the safe, default choice: nothing is removed.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep them' }));
    const still = await bundle.measurements.list();
    expect(still.kind === 'measurement' && still.value).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Remove all measurements' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove them all' }));
    expect(await screen.findByText('Measurements removed.')).toBeVisible();
    const none = await bundle.measurements.list();
    expect(none.kind === 'measurement' && none.value).toEqual([]);
  });

  it('adds and removes allergy tags', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<ProfileScreen />, { bundle });
    await userEvent.type(screen.getByLabelText('Allergies or foods to avoid'), 'Peanut{Enter}');
    await userEvent.type(screen.getByLabelText('Allergies or foods to avoid'), 'Sesame');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(async () =>
      expect((await stored(bundle))?.['allergies']).toEqual(['Peanut', 'Sesame']),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove Peanut' }));
    await waitFor(async () => expect((await stored(bundle))?.['allergies']).toEqual(['Sesame']));
  });

  it('"Clear profile" removes everything and says so', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<ProfileScreen />, { bundle });
    await userEvent.click(within(group('Diet')).getByRole('radio', { name: 'Vegan' }));
    await waitFor(async () => expect(await stored(bundle)).toEqual({ diet: 'vegan' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear profile' }));
    expect(await screen.findByText('Profile cleared.')).toBeVisible();
    expect(await stored(bundle)).toBeNull();
    expect(within(group('Diet')).getByRole('radio', { name: 'Not set' })).toBeChecked();
  });

  it('says so, and changes nothing, when the choice cannot be kept', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<ProfileScreen />, { bundle });
    vi.spyOn(bundle.kv, 'write').mockRejectedValue(new Error('locked'));
    await userEvent.click(within(group('Diet')).getByRole('radio', { name: 'Vegan' }));
    expect(await screen.findByText(/did not save just now/)).toBeVisible();
    expect(within(group('Diet')).getByRole('radio', { name: 'Not set' })).toBeChecked();
  });

  it('is reachable from the Settings board', async () => {
    window.location.hash = '#/settings';
    await renderUnlockedApp(await unlockedBundle());
    await userEvent.click(await screen.findByRole('button', { name: /^Profile/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  });

  it('has no axe violations', async () => {
    await renderInSession(<ProfileScreen />, { bundle: await unlockedBundle() });
    await userEvent.click(within(group('Goal')).getByRole('radio', { name: 'Lose weight' }));
    // Every disclosure open, so the axe pass covers all the text.
    for (const summary of document.querySelectorAll('summary')) await userEvent.click(summary);
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
