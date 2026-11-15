import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReloadNotice } from './ReloadNotice';

const signInAgain = vi.hoisted(() => vi.fn());
vi.mock('../../net/sign-in', () => ({ signInAgain }));

describe('ReloadNotice', () => {
  it('its button opens the sign-in navigation (not a plain reload the service worker would answer)', async () => {
    render(<ReloadNotice text="Sign in again." action="Reload" />);
    expect(screen.getByRole('status')).toHaveTextContent('Sign in again.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload' }));
    expect(signInAgain).toHaveBeenCalledTimes(1);
  });
});
