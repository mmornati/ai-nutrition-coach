import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import type { PlateSummary } from '../../sync';
import { RestoreFromServerScreen, ServerRestoringScreen } from './RestoreFromServerScreen';
import type { FindOnServerResult } from './RestoreFromServerScreen';

const SUMMARY: PlateSummary = {
  count: 412,
  first: Date.UTC(2026, 2, 3, 12),
  last: Date.UTC(2026, 4, 3, 12),
};

function setup(find: (h: string, p: string) => Promise<FindOnServerResult>) {
  const onRestore = vi.fn(() => Promise.resolve({ kind: 'storeProblem' } as const));
  const onCancel = vi.fn();
  const onBack = vi.fn();
  const view = render(
    <RestoreFromServerScreen
      onFind={find}
      onRestore={onRestore}
      onCancel={onCancel}
      onBack={onBack}
    />,
  );
  return { view, onRestore, onCancel, onBack };
}

const fill = async (user: ReturnType<typeof userEvent.setup>, handle: string, pass: string) => {
  await user.type(screen.getByLabelText('Handle'), handle);
  await user.type(screen.getByLabelText('Passphrase of the copy'), pass);
  await user.click(screen.getByRole('button', { name: 'Find my copy' }));
};

describe('RestoreFromServerScreen', () => {
  it('asks handle and passphrase together, says the passphrase becomes the device’s, and passes axe', async () => {
    const { container } = render(
      <RestoreFromServerScreen
        onFind={() => Promise.resolve({ kind: 'found', summary: SUMMARY })}
        onRestore={() => Promise.resolve({ kind: 'storeProblem' })}
        onCancel={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Restore from this server' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Handle')).toBeVisible();
    expect(screen.getByLabelText('Passphrase of the copy')).toBeVisible();
    expect(screen.getByText(/will also unlock the app on this device/)).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows what was found before anything is created, and passes axe in that state too', async () => {
    const user = userEvent.setup();
    const find = vi.fn(() =>
      Promise.resolve<FindOnServerResult>({ kind: 'found', summary: SUMMARY }),
    );
    const { view, onRestore } = setup(find);
    await fill(user, 'alice', 'a vault passphrase');
    expect(find).toHaveBeenCalledWith('alice', 'a vault passphrase');
    expect(
      await screen.findByText('Found your data: 412 plates, from March 2026 to May 2026.'),
    ).toBeVisible();
    expect(onRestore).not.toHaveBeenCalled();
    expect(await axe(view.container)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Restore and unlock' }));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/could not be added to this device just now/)).toBeVisible();
  });

  it('one ambiguous line, a separate one for rate limiting, and the passphrase field is emptied', async () => {
    const user = userEvent.setup();
    let answer: FindOnServerResult = { kind: 'failed', failure: 'noMatch' };
    setup(() => Promise.resolve(answer));
    await fill(user, 'alice', 'wrong wrong wrong');
    expect(
      await screen.findByText('Nothing on this server matches this handle and passphrase.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Passphrase of the copy')).toHaveValue('');
    answer = { kind: 'failed', failure: 'rateLimited' };
    await user.type(screen.getByLabelText('Passphrase of the copy'), 'again again again');
    await user.click(screen.getByRole('button', { name: 'Find my copy' }));
    expect(
      await screen.findByText('Too many tries. Wait a few minutes, then try again.'),
    ).toBeVisible();
  });

  it('asks for both fields before looking', async () => {
    const user = userEvent.setup();
    const find = vi.fn(() =>
      Promise.resolve<FindOnServerResult>({ kind: 'failed', failure: 'noMatch' }),
    );
    setup(find);
    await user.click(screen.getByRole('button', { name: 'Find my copy' }));
    expect(await screen.findByText('Enter a handle.')).toBeVisible();
    await user.type(screen.getByLabelText('Handle'), 'alice');
    await user.click(screen.getByRole('button', { name: 'Find my copy' }));
    expect(await screen.findByText('Enter the passphrase.')).toBeVisible();
    expect(find).not.toHaveBeenCalled();
  });

  it('changing the handle or going back drops the copy that was found', async () => {
    const user = userEvent.setup();
    const { onCancel, onBack } = setup(() => Promise.resolve({ kind: 'found', summary: SUMMARY }));
    await fill(user, 'alice', 'a vault passphrase');
    await user.click(await screen.findByRole('button', { name: 'Use another handle' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Find my copy' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Back to creating a passphrase' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('a find that throws is a calm line, not a crash', async () => {
    const user = userEvent.setup();
    setup(() => Promise.reject(new Error('boom')));
    await fill(user, 'alice', 'a vault passphrase');
    expect(await screen.findByText(/This did not work just now/)).toBeVisible();
  });
});

describe('ServerRestoringScreen', () => {
  it('says what is happening and passes axe', async () => {
    const { container } = render(<ServerRestoringScreen />);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: 'Restoring from the server' }),
      ).toBeVisible(),
    );
    expect(screen.getByText(/being put back on this device/)).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });
});
