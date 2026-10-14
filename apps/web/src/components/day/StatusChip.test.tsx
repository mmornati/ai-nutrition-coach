import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import { StatusChip, chipStateFor } from './StatusChip';

describe('chipStateFor', () => {
  it('maps core sync status; null is on this device', () => {
    expect(chipStateFor(null)).toBe('onDevice');
    expect(chipStateFor(undefined)).toBe('onDevice');
    expect(chipStateFor('pending')).toBe('pending');
    expect(chipStateFor('synced')).toBe('synced');
    expect(chipStateFor('failed')).toBe('retryLater');
  });
});

describe('StatusChip', () => {
  it('says only "On this device" with no status, never pending or synced', () => {
    const { container } = render(<StatusChip />);
    expect(container).toHaveTextContent('On this device');
    expect(container).not.toHaveTextContent(/pending|synced/i);
  });

  it.each([
    ['pending', 'Pending'],
    ['synced', 'Synced'],
    ['failed', 'Retry later'],
  ] as const)('shows %s as "%s"', (status, text) => {
    render(<StatusChip status={status} />);
    expect(screen.getByRole('status')).toHaveTextContent(`Status: ${text}`);
  });

  it('is not a button and never red', () => {
    const { container } = render(<StatusChip status="failed" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/line-protein|red/);
  });

  it('announces changes politely', () => {
    const { rerender } = render(<StatusChip status="pending" />);
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveClass('sr-only');
    rerender(<StatusChip status="synced" />);
    expect(screen.getByRole('status')).toBe(live);
    expect(live).toHaveTextContent('Status: Synced');
  });

  it('has no axe violations in any state', async () => {
    const { container } = render(
      <>
        <StatusChip />
        <StatusChip status="pending" />
        <StatusChip status="synced" />
        <StatusChip status="failed" />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
