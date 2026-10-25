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
    const { container } = render(<StatusChip hasTransport />);
    expect(container).toHaveTextContent('On this device');
    expect(container).not.toHaveTextContent(/pending|synced/i);
  });

  it('without a transport it is "On this device" whatever the status says', () => {
    const { container } = render(
      <>
        <StatusChip hasTransport={false} status="pending" />
        <StatusChip hasTransport={false} status="synced" />
        <StatusChip hasTransport={false} status="failed" />
      </>,
    );
    const chips = Array.from(container.querySelectorAll('[data-chip-state]'));
    expect(chips).toHaveLength(3);
    for (const c of chips) {
      expect(c).toHaveAttribute('data-chip-state', 'onDevice');
      expect(c).toHaveTextContent('On this device');
    }
  });

  it.each([
    ['pending', 'Pending'],
    ['synced', 'Synced'],
    ['failed', 'Retry later'],
  ] as const)('shows %s as "%s"', (status, text) => {
    const { container } = render(<StatusChip hasTransport status={status} />);
    expect(container).toHaveTextContent(text);
  });

  it('a copy from a newer app: the chip says to update this device, calmly, whatever the status', () => {
    const { container } = render(<StatusChip hasTransport status="synced" needsUpdate />);
    const chip = container.querySelector('[data-chip-state]');
    expect(chip).toHaveAttribute('data-chip-state', 'updateNeeded');
    expect(chip).toHaveTextContent('Update the app on this device to keep syncing');
    // Without a transport there is nothing to update for.
    const local = render(<StatusChip hasTransport={false} needsUpdate />);
    expect(local.container).toHaveTextContent('On this device');
  });

  it('is plain static text: no live region of its own', () => {
    const { container } = render(<StatusChip hasTransport status="pending" />);
    expect(container.querySelector('[role="status"], [aria-live]')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('');
  });

  it('pending is a solid hollow ring; only retry later is dashed', () => {
    const { container } = render(
      <>
        <StatusChip hasTransport status="pending" />
        <StatusChip hasTransport status="failed" />
      </>,
    );
    const dots = Array.from(container.querySelectorAll('[aria-hidden="true"]'));
    expect(dots[0]).toHaveClass('border-solid', 'border-ink');
    expect(dots[0]).not.toHaveClass('border-dashed');
    expect(dots[1]).toHaveClass('border-dashed');
  });

  it('is not a button and never red', () => {
    const { container } = render(<StatusChip hasTransport status="failed" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/protein|red/);
  });

  it('has no axe violations in any state', async () => {
    const { container } = render(
      <>
        <StatusChip hasTransport={false} />
        <StatusChip hasTransport status="pending" />
        <StatusChip hasTransport status="synced" />
        <StatusChip hasTransport status="failed" />
        <StatusChip hasTransport status="failed" needsUpdate />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
