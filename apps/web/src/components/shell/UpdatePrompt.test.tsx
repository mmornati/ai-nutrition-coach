import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const update = vi.fn(() => Promise.resolve());
let needRefresh = false;

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [needRefresh, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: update,
  }),
}));

import { UpdatePrompt } from './UpdatePrompt';

describe('UpdatePrompt', () => {
  beforeEach(() => {
    needRefresh = false;
    update.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('shows no line until an update is waiting, but keeps a live region mounted', () => {
    render(<UpdatePrompt />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByText(/new version/i)).not.toBeInTheDocument();
  });

  it('announces the line inside the live region when a new version is ready', () => {
    needRefresh = true;
    render(<UpdatePrompt />);
    expect(
      within(screen.getByRole('status')).getByText(/A new version is ready/),
    ).toBeInTheDocument();
    expect(screen.getByText(/passphrase/)).toBeInTheDocument();
  });

  it('Reload applies the update once, even if pressed twice', async () => {
    needRefresh = true;
    render(<UpdatePrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(true);
  });

  it('Reload is never a dead end: it is re-enabled if the reload does not happen', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    needRefresh = true;
    render(<UpdatePrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(screen.getByRole('button', { name: 'Reload' })).toHaveAttribute('aria-disabled', 'true');
    await act(() => vi.advanceTimersByTimeAsync(13_000));
    expect(screen.getByRole('button', { name: 'Reload' })).not.toHaveAttribute('aria-disabled');
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('Later dismisses the line without applying anything', async () => {
    needRefresh = true;
    render(<UpdatePrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText(/A new version is ready/)).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    needRefresh = true;
    const { container } = render(<UpdatePrompt />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
