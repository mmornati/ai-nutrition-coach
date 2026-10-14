import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncAnnouncer } from './SyncAnnouncer';

describe('SyncAnnouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const live = () => screen.getByRole('status');
  const settle = (ms = 1000) => act(() => void vi.advanceTimersByTime(ms));

  it('is one polite, visually hidden live region and silent on first render', () => {
    render(<SyncAnnouncer pending={2} retryLater={0} />);
    settle();
    expect(live()).toHaveAttribute('aria-live', 'polite');
    expect(live()).toHaveClass('sr-only');
    expect(live()).toBeEmptyDOMElement();
  });

  it('announces an aggregate change once it settles', () => {
    const { rerender } = render(<SyncAnnouncer pending={2} retryLater={0} />);
    rerender(<SyncAnnouncer pending={0} retryLater={0} />);
    expect(live()).toBeEmptyDOMElement();
    settle();
    expect(live()).toHaveTextContent('All plates synced');
    rerender(<SyncAnnouncer pending={1} retryLater={0} />);
    settle();
    expect(live()).toHaveTextContent('1 plate waiting to sync');
    rerender(<SyncAnnouncer pending={0} retryLater={3} />);
    settle();
    expect(live()).toHaveTextContent('3 plates will retry later');
  });

  it('collapses a burst of changes into one aggregate message', () => {
    const { rerender } = render(<SyncAnnouncer pending={5} retryLater={0} />);
    for (const n of [4, 3, 2, 1]) {
      rerender(<SyncAnnouncer pending={n} retryLater={0} />);
      settle(200);
      expect(live()).toBeEmptyDOMElement();
    }
    rerender(<SyncAnnouncer pending={0} retryLater={0} />);
    settle();
    expect(live()).toHaveTextContent('All plates synced');
  });

  it('says nothing when a burst ends where it started', () => {
    const { rerender } = render(<SyncAnnouncer pending={1} retryLater={0} />);
    rerender(<SyncAnnouncer pending={2} retryLater={0} />);
    rerender(<SyncAnnouncer pending={1} retryLater={0} />);
    settle();
    expect(live()).toBeEmptyDOMElement();
  });
});
