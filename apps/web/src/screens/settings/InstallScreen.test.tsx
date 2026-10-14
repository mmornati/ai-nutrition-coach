// Port of the earlier client: platform-first steps, the calm
// Install button only when the browser offered one, what installing changes.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { InstallPromptSource, type InstallContext } from '../../pwa/install';
import { renderInSession, unlockedBundle } from '../../app/testing';
import { InstallScreen } from './InstallScreen';

afterEach(() => {
  window.location.hash = '';
});

function offeredPrompt() {
  const target = new EventTarget();
  const source = new InstallPromptSource();
  source.attach(target);
  const prompt = vi.fn(() => Promise.resolve());
  const offer = () =>
    act(() => {
      target.dispatchEvent(
        Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }),
      );
    });
  return { source, prompt, offer };
}

async function open(context: InstallContext, source = offeredPrompt().source) {
  const bundle = await unlockedBundle();
  await renderInSession(<InstallScreen context={context} prompt={source} />, { bundle });
  await screen.findByRole('heading', { level: 1, name: 'Install on your phone' });
}

const order = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('InstallScreen', () => {
  it('shows all three platforms and the detected one FIRST', async () => {
    await open({ platform: 'ios', standalone: false });
    expect(screen.getByText(/Add to Home Screen/)).toBeVisible();
    expect(screen.getByText(/Install app/)).toBeVisible();
    expect(screen.getByText(/install icon/)).toBeVisible();
    expect(order().slice(0, 3)).toEqual(['iPhone or iPad', 'Android', 'Computer']);
  });

  it('Android first on Android; the computer first on a computer', async () => {
    await open({ platform: 'android', standalone: false });
    expect(order().slice(0, 3)).toEqual(['Android', 'iPhone or iPad', 'Computer']);
  });

  it('a computer lists its own steps first', async () => {
    await open({ platform: 'desktop', standalone: false });
    expect(order().slice(0, 3)).toEqual(['Computer', 'iPhone or iPad', 'Android']);
  });

  it('explains what installing changes, incl. the Safari storage treatment and the backup line', async () => {
    await open({ platform: 'desktop', standalone: false });
    expect(
      screen.getByRole('heading', { level: 2, name: 'What installing changes' }),
    ).toBeVisible();
    expect(screen.getByText(/without a connection once it has loaded once/)).toBeVisible();
    expect(screen.getByText(/own icon/)).toBeVisible();
    expect(screen.getByText(/Safari may clear/)).toBeVisible();
    expect(screen.getByText(/export a copy from Your data/)).toBeVisible();
  });

  it('no Install button unless the browser offered one; a tap opens the browser dialog once', async () => {
    const user = userEvent.setup();
    const { source, prompt, offer } = offeredPrompt();
    await open({ platform: 'android', standalone: false }, source);
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    // Offered, but never shown by itself.
    offer();
    const button = await screen.findByRole('button', { name: 'Install' });
    expect(prompt).not.toHaveBeenCalled();
    await user.click(button);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('already installed: says so instead of giving instructions', async () => {
    await open({ platform: 'ios', standalone: true });
    expect(
      screen.getByText('AI Nutrition Coach is already installed on this device.'),
    ).toBeVisible();
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
    expect(
      screen.getByRole('heading', { level: 2, name: 'What installing changes' }),
    ).toBeVisible();
  });

  it('has no axe violations (with the Install button showing)', async () => {
    const { source, offer } = offeredPrompt();
    const bundle = await unlockedBundle();
    await renderInSession(
      <InstallScreen context={{ platform: 'android', standalone: false }} prompt={source} />,
      { bundle },
    );
    await screen.findByRole('heading', { level: 1, name: 'Install on your phone' });
    offer();
    await screen.findByRole('button', { name: 'Install' });
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
