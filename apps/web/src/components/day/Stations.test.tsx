import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenStation, PlateRow } from './Stations';
import { strings } from '../../i18n';
import { makePlate } from './testing';

// jsdom may lack PointerEvent; a MouseEvent subclass carries the coordinates and button.
if (typeof window.PointerEvent === 'undefined') {
  Object.defineProperty(window, 'PointerEvent', { value: class extends MouseEvent {} });
}

const plate = makePlate(7, 12, 55, ['vegFruit', 'protein', 'starch']);

function row(over: Partial<React.ComponentProps<typeof PlateRow>> = {}) {
  const onOpen = vi.fn();
  const onRequestDelete = vi.fn();
  const utils = render(
    <PlateRow
      hasTransport={false}
      plate={plate}
      slot="lunch"
      onOpen={onOpen}
      onRequestDelete={onRequestDelete}
      {...over}
    />,
  );
  return { onOpen, onRequestDelete, ...utils };
}

describe('PlateRow', () => {
  it('shows meal, time, entries and the group that is not on the plate', () => {
    row();
    expect(screen.getByRole('heading', { name: /Lunch/ })).toHaveTextContent('12:55');
    expect(screen.getByText('Food 7-0, Food 7-1, Food 7-2')).toBeInTheDocument();
    expect(screen.getByText('Without dairy')).toBeInTheDocument();
  });

  it('says all four groups are on the plate when they are', () => {
    row({ plate: makePlate(8, 8, 0, ['vegFruit', 'protein', 'starch', 'dairy']) });
    expect(screen.getByText('All four food groups on this plate')).toBeInTheDocument();
  });

  it('tap opens the detail', async () => {
    const { onOpen } = row();
    await userEvent.click(screen.getByRole('button', { name: /Open Lunch/ }));
    expect(onOpen).toHaveBeenCalledWith(7);
  });

  it('renders a status chip from the sync status', () => {
    row({ syncStatus: 'failed', hasTransport: true });
    expect(screen.getByText('Retry later')).toBeInTheDocument();
  });

  it('without a transport there is no per-plate chip: the header tag says where plates live', () => {
    row({ syncStatus: 'failed' });
    expect(screen.queryByText('On this device')).not.toBeInTheDocument();
    expect(screen.queryByText('Retry later')).not.toBeInTheDocument();
  });

  it('the screen-reader action "Remove this plate" requests the delete', async () => {
    const { onRequestDelete, onOpen } = row();
    await userEvent.click(screen.getByRole('button', { name: /Remove this plate/ }));
    expect(onRequestDelete).toHaveBeenCalledWith(7);
    expect(onOpen).not.toHaveBeenCalled();
  });

  describe('press and hold', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const open = () => screen.getByRole('button', { name: /Open Lunch/ });

    it('requests the delete after 500ms and does not open the detail', () => {
      const { onRequestDelete, onOpen } = row();
      fireEvent.pointerDown(open(), { button: 0, clientX: 5, clientY: 5 });
      act(() => vi.advanceTimersByTime(499));
      expect(onRequestDelete).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(onRequestDelete).toHaveBeenCalledExactlyOnceWith(7);
      fireEvent.pointerUp(open());
      fireEvent.click(open());
      expect(onOpen).not.toHaveBeenCalled();
    });

    it('a short press is a tap', () => {
      const { onRequestDelete, onOpen } = row();
      fireEvent.pointerDown(open(), { button: 0 });
      act(() => vi.advanceTimersByTime(200));
      fireEvent.pointerUp(open());
      fireEvent.click(open());
      act(() => vi.advanceTimersByTime(1000));
      expect(onRequestDelete).not.toHaveBeenCalled();
      expect(onOpen).toHaveBeenCalledWith(7);
    });

    it('moving the finger away cancels the hold', () => {
      const { onRequestDelete } = row();
      fireEvent.pointerDown(open(), { button: 0, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(open(), { clientX: 0, clientY: 40 });
      act(() => vi.advanceTimersByTime(800));
      expect(onRequestDelete).not.toHaveBeenCalled();
    });
  });

  it('has no axe violations', async () => {
    const { container } = row({ syncStatus: 'synced' });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('OpenStation', () => {
  it('carries the approved copy verbatim when there is no hint', () => {
    render(<OpenStation slot="dinner" />);
    expect(screen.getByText('Nothing logged yet.')).toBeInTheDocument();
    expect(strings().day.openQuietPlace).toBe('Nothing logged yet.');
  });

  it('shows a hint with no sure / ask-later buttons; tapping dismisses it', async () => {
    const onDismissHint = vi.fn();
    render(
      <OpenStation
        slot="dinner"
        hint="Greens would round this plate out."
        onDismissHint={onDismissHint}
      />,
    );
    expect(screen.queryByText('An open, quiet place.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sure|ask later/i })).not.toBeInTheDocument();
    const hint = screen.getByRole('button', { name: /Greens would round this plate out/ });
    expect(hint.className).toContain('min-h-12');
    await userEvent.click(hint);
    expect(onDismissHint).toHaveBeenCalledTimes(1);
  });

  it('resolving shows static reading text, no hint', () => {
    render(<OpenStation slot="dinner" hint="A hint" resolving />);
    expect(screen.getByText('Reading the plate…')).toBeInTheDocument();
    expect(screen.queryByText('A hint')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <>
        <OpenStation
          slot="dinner"
          hint="Greens would round this plate out."
          onDismissHint={() => {}}
        />
        <OpenStation slot="breakfast" />
        <OpenStation slot="lunch" resolving />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
