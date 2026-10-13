import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('renders nothing when no update is waiting', () => {
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers a reload when a new version is ready, and applies it on click', async () => {
    needRefresh = true;
    const { container } = render(<UpdatePrompt />);
    expect(screen.getByText('New version ready')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(update).toHaveBeenCalledWith(true);
    expect(await axe(container)).toHaveNoViolations();
  });
});
