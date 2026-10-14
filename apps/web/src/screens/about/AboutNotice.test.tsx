import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { AboutNotice } from './AboutNotice';

describe('AboutNotice (the earlier client: the copy is calm and honest)', () => {
  it('says what the app is, what AI does and where the plates stay', () => {
    render(<AboutNotice onDismiss={() => undefined} />);
    expect(screen.getByRole('heading', { level: 1, name: 'About this app' })).toBeVisible();
    expect(screen.getByText('AI Nutrition Coach is designed for adults.')).toBeVisible();
    expect(screen.getByText(/off by default/)).toBeVisible();
    expect(screen.getByText(/only after you say yes/)).toBeVisible();
    expect(screen.getByText(/stay on this device, encrypted/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'What this app stores and sends' })).toHaveAttribute(
      'href',
      '#/privacy',
    );
  });

  it('has one button, no tick box and no countdown', () => {
    render(<AboutNotice onDismiss={() => undefined} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d+\s*(s|sec|seconds)\b/i);
  });

  it('"Got it" dismisses', async () => {
    const onDismiss = vi.fn();
    render(<AboutNotice onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = render(<AboutNotice onDismiss={() => undefined} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
