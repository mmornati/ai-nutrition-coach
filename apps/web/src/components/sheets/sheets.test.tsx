import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import type {
  DatabaseFood,
  FoodEntryDraft,
  FoodMatch,
  QuantityRange,
  RecognitionResult,
} from '@anc/core';
import { BarcodeMatchSheet } from './BarcodeMatchSheet';
import { CaptureSheet } from './CaptureSheet';
import { EntryList } from './EntryList';
import { LineBar } from './LineBar';
import { PortionPresets } from './PortionPresets';
import { RecognizedMatchSheet } from './RecognizedMatchSheet';

const food = (
  displayName: string,
  sourceRef: string,
  foodGroup: DatabaseFood['foodGroup'],
): DatabaseFood => ({
  sourceRef,
  displayName,
  source: 'seed',
  foodGroup,
});
const range = (low: number, high: number, unit: string, displayLabel: string): QuantityRange => ({
  low,
  high,
  unit,
  displayLabel,
});

const APPLE = food('Apple', 'seed:apple', 'vegFruit');
const SALMON = food('Salmon', 'seed:salmon', 'protein');
const RICE = food('Rice', 'seed:rice', 'starch');
const NUTELLA = food('Nutella', '3017620422003', 'other');

/** Opener + sheet, like the app: the parent owns `open`. */
function CaptureHarness(props: {
  onSnapshot?: () => void;
  onBarcode?: () => void;
  onType?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Log a plate
      </button>
      <CaptureSheet
        open={open}
        onClose={() => setOpen(false)}
        onSnapshot={props.onSnapshot ?? (() => undefined)}
        onBarcode={props.onBarcode ?? (() => undefined)}
        onType={props.onType ?? (() => undefined)}
        nextMeal="Dinner"
      />
    </>
  );
}

describe('CaptureSheet', () => {
  it('renders three entries with the spec copy and the next station', async () => {
    render(<CaptureHarness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log a plate' }));
    expect(screen.getByRole('dialog', { name: 'Log a plate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Snapshot/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Barcode/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Type it/ })).toBeInTheDocument();
    expect(screen.getByText('Next station: Dinner')).toBeInTheDocument();
  });

  it('Snapshot is dominant (porcelain, taller, full width); the others are outlined', async () => {
    render(<CaptureHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'Log a plate' }));
    const snapshot = screen.getByRole('button', { name: /^Snapshot/ });
    expect(snapshot).toHaveClass('bg-porcelain', 'col-span-2', 'min-h-33');
    for (const name of [/^Barcode/, /^Type it/]) {
      const tile = screen.getByRole('button', { name });
      expect(tile).not.toHaveClass('bg-porcelain');
      expect(tile).toHaveClass('min-h-24'); // 96px, well over the 48px floor
    }
  });

  it('opens focused on Snapshot', async () => {
    render(<CaptureHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'Log a plate' }));
    expect(screen.getByRole('button', { name: /^Snapshot/ })).toHaveFocus();
  });

  it.each([
    ['Snapshot', /^Snapshot/, 'onSnapshot'],
    ['Barcode', /^Barcode/, 'onBarcode'],
    ['Type it', /^Type it/, 'onType'],
  ] as const)('%s closes the sheet and calls only its callback', async (_label, name, key) => {
    const calls = { onSnapshot: vi.fn(), onBarcode: vi.fn(), onType: vi.fn() };
    render(<CaptureHarness {...calls} />);
    await userEvent.click(screen.getByRole('button', { name: 'Log a plate' }));
    await userEvent.click(screen.getByRole('button', { name }));
    for (const [k, fn] of Object.entries(calls))
      expect(fn).toHaveBeenCalledTimes(k === key ? 1 : 0);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Esc and the scrim close it without calling any callback; focus returns to the opener', async () => {
    const calls = { onSnapshot: vi.fn(), onBarcode: vi.fn(), onType: vi.fn() };
    render(<CaptureHarness {...calls} />);
    const opener = screen.getByRole('button', { name: 'Log a plate' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole('dialog'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    for (const fn of Object.values(calls)) expect(fn).not.toHaveBeenCalled();
  });

  it('has a Close button, no pressure copy and no price or upsell', async () => {
    render(<CaptureHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'Log a plate' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(
      /premium|upgrade|pro\b|\$|€|streak|hurry|don't miss|only \d/i,
    );
  });

  it('has no axe violations when open', async () => {
    const { baseElement } = render(
      <CaptureSheet
        open
        onClose={() => undefined}
        onSnapshot={() => undefined}
        onBarcode={() => undefined}
        onType={() => undefined}
        nextMeal="Dinner"
      />,
    );
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('BarcodeMatchSheet', () => {
  const match: FoodMatch = {
    food: NUTELLA,
    confidence: 1,
    presets: [range(1, 1, 'serving', '~1 serving'), range(2, 2, 'serving', '~2 servings')],
  };

  it('shows the food name and its group line marker', () => {
    render(
      <BarcodeMatchSheet open onClose={() => undefined} match={match} onLog={() => undefined} />,
    );
    expect(screen.getByRole('dialog', { name: 'Nutella' })).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log' })).toBeInTheDocument();
  });

  it('opens focused on the title (read first), not on Close', () => {
    render(
      <BarcodeMatchSheet open onClose={() => undefined} match={match} onLog={() => undefined} />,
    );
    const title = screen.getByRole('heading', { name: 'Nutella' });
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute('tabindex', '-1');
  });

  it('preset chips are >= 48px and the first is the default', () => {
    render(
      <BarcodeMatchSheet open onClose={() => undefined} match={match} onLog={() => undefined} />,
    );
    const first = screen.getByRole('button', { name: '~1 serving' });
    const second = screen.getByRole('button', { name: '~2 servings' });
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(second).toHaveAttribute('aria-pressed', 'false');
    expect(first).toHaveClass('min-h-12', 'min-w-12');
  });

  it('falls back to "~1 serving" when the match has no presets', async () => {
    const onLog = vi.fn();
    render(
      <BarcodeMatchSheet
        open
        onClose={() => undefined}
        match={{ ...match, presets: [] }}
        onLog={onLog}
      />,
    );
    expect(screen.getByRole('button', { name: '~1 serving' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(onLog).toHaveBeenCalledWith({
      databaseFood: NUTELLA,
      quantity: range(1, 1, 'serving', '~1 serving'),
    });
  });

  it('Log commits the food and the chosen preset', async () => {
    const onLog = vi.fn();
    render(<BarcodeMatchSheet open onClose={() => undefined} match={match} onLog={onLog} />);
    await userEvent.click(screen.getByRole('button', { name: '~2 servings' }));
    expect(screen.getByRole('button', { name: '~2 servings' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    const draft = onLog.mock.calls[0]?.[0] as FoodEntryDraft;
    expect(draft.databaseFood.displayName).toBe('Nutella');
    expect(draft.databaseFood.sourceRef).toBe('3017620422003');
    expect(draft.quantity.displayLabel).toBe('~2 servings');
  });

  it('Log is disabled while submitting and commits once', async () => {
    let finish: () => void = () => undefined;
    const onLog = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<BarcodeMatchSheet open onClose={() => undefined} match={match} onLog={onLog} />);
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    const busy = screen.getByRole('button', { name: 'Logging…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).toHaveFocus();
    await userEvent.click(busy);
    expect(onLog).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log' })).toBeEnabled());
  });

  it('shows a failure calmly and stays usable', async () => {
    render(
      <BarcodeMatchSheet
        open
        onClose={() => undefined}
        match={match}
        onLog={() => undefined}
        errorMessage="Couldn’t log it. Try again."
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Couldn’t log it. Try again.');
    expect(screen.getByRole('button', { name: 'Log' })).toBeEnabled();
  });

  it('keeps the status region mounted and only changes its text', () => {
    const props = { open: true, onClose: () => undefined, match, onLog: () => undefined };
    const { rerender } = render(<BarcodeMatchSheet {...props} />);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    rerender(<BarcodeMatchSheet {...props} errorMessage="Couldn’t log it. Try again." />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Couldn’t log it. Try again.');
  });

  it('a rejected log shows a calm inline line and the button comes back', async () => {
    const onLog = vi.fn(() => Promise.reject(new Error('boom')));
    render(<BarcodeMatchSheet open onClose={() => undefined} match={match} onLog={onLog} />);
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/did not save/);
    expect(screen.getByRole('button', { name: 'Log' })).toBeEnabled();
  });

  it('double-clicking Log commits once', async () => {
    let finish: () => void = () => undefined;
    const onLog = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<BarcodeMatchSheet open onClose={() => undefined} match={match} onLog={onLog} />);
    await userEvent.dblClick(screen.getByRole('button', { name: 'Log' }));
    expect(onLog).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log' })).toBeEnabled());
  });

  it('has no axe violations', async () => {
    const { baseElement } = render(
      <BarcodeMatchSheet open onClose={() => undefined} match={match} onLog={() => undefined} />,
    );
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('RecognizedMatchSheet status region', () => {
  it('stays mounted and only changes its text', () => {
    const props = {
      open: true,
      onClose: () => undefined,
      result: { kind: 'recognizedPlate', foods: [] } as RecognitionResult,
      closestMatches: [] as FoodMatch[],
      onLog: () => undefined,
    };
    const { rerender } = render(<RecognizedMatchSheet {...props} />);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    rerender(<RecognizedMatchSheet {...props} errorMessage="Couldn’t log it." />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Couldn’t log it.');
  });
});

describe('RecognizedMatchSheet', () => {
  const recognized: RecognitionResult = {
    kind: 'recognizedPlate',
    foods: [
      { databaseFood: SALMON, confidence: 0.9, quantity: range(1, 1, 'fillet', '~1 fillet') },
      { databaseFood: RICE, confidence: 0.8, quantity: range(1, 2, 'fist', '~1-2 fists') },
    ],
  };
  const closest: FoodMatch[] = [
    { food: APPLE, confidence: 0.4, presets: [range(1, 2, 'piece', '~1-2 pieces')] },
    { food: RICE, confidence: 0.3, presets: [range(3, 4, 'fist', '~3-4 fists')] },
  ];

  it('opens focused on the title (read first), not on Close', () => {
    render(
      <RecognizedMatchSheet
        open
        onClose={() => undefined}
        result={recognized}
        closestMatches={closest}
        onLog={() => undefined}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Looks like 2 foods' })).toHaveFocus();
  });

  it('lists recognized foods, all ticked, with group markers and a portion each', () => {
    render(
      <RecognizedMatchSheet
        open
        onClose={() => undefined}
        result={recognized}
        closestMatches={closest}
        onLog={() => undefined}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Looks like 2 foods' })).toBeInTheDocument();
    const salmon = screen.getByRole('checkbox', { name: /Salmon/ });
    const rice = screen.getByRole('checkbox', { name: /Rice/ });
    expect(salmon).toBeChecked();
    expect(rice).toBeChecked();
    expect(screen.getByText('Protein')).toBeInTheDocument();
    expect(screen.getAllByText('likely')).toHaveLength(2);
    expect(screen.queryByText(/%|sure/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '~1 fillet' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('closest matches are extra, unticked rows and skip foods already recognized', () => {
    render(
      <RecognizedMatchSheet
        open
        onClose={() => undefined}
        result={recognized}
        closestMatches={closest}
        onLog={() => undefined}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Closest matches' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Apple/ })).not.toBeChecked();
    expect(screen.getAllByRole('checkbox', { name: /Rice/ })).toHaveLength(1);
    // The recognized Rice row also offers the catalog presets for the same food.
    expect(screen.getByRole('button', { name: '~3-4 fists' })).toBeInTheDocument();
  });

  it('Log records every ticked food as ONE plate, with each food’s chosen portion', async () => {
    const onLog = vi.fn();
    render(
      <RecognizedMatchSheet
        open
        onClose={() => undefined}
        result={recognized}
        closestMatches={closest}
        onLog={onLog}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '~3-4 fists' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Apple/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(onLog).toHaveBeenCalledTimes(1);
    const drafts = onLog.mock.calls[0]?.[0] as FoodEntryDraft[];
    expect(drafts.map((d) => [d.databaseFood.displayName, d.quantity.displayLabel])).toEqual([
      ['Salmon', '~1 fillet'],
      ['Rice', '~3-4 fists'],
      ['Apple', '~1-2 pieces'],
    ]);
  });

  it('unticking a food leaves it out; with nothing ticked Log is disabled', async () => {
    const onLog = vi.fn();
    render(
      <RecognizedMatchSheet
        open
        onClose={() => undefined}
        result={recognized}
        closestMatches={[]}
        onLog={onLog}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /Salmon/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(
      (onLog.mock.calls[0]?.[0] as FoodEntryDraft[]).map((d) => d.databaseFood.displayName),
    ).toEqual(['Rice']);
  });

  it('with nothing recognized: calm title, first closest match pre-ticked, custom field present', () => {
    render(
      <RecognizedMatchSheet
        open
        onClose={() => undefined}
        result={{ kind: 'recognizedPlate', foods: [] }}
        closestMatches={closest}
        onLog={() => undefined}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Nothing matched' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Apple/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Rice/ })).not.toBeChecked();
    expect(screen.getByLabelText('Custom food name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log custom food' })).toBeInTheDocument();
  });

  it('noMatch, quota and failure each get their own calm title and still offer the no-AI core', () => {
    const results: [RecognitionResult, RegExp][] = [
      [{ kind: 'noMatch' }, /^Nothing on this plate$/],
      [{ kind: 'quotaExhausted' }, /free quota is done/],
      [{ kind: 'recognitionFailure', cause: 'network' }, /Search isn't available right now/],
    ];
    for (const [result, title] of results) {
      const { unmount } = render(
        <RecognizedMatchSheet
          open
          onClose={() => undefined}
          result={result}
          closestMatches={closest}
          onLog={() => undefined}
        />,
      );
      expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /Apple/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Log custom food' })).toBeInTheDocument();
      unmount();
    }
  });

  it('Log custom food needs a name, then logs one custom food as a manual entry', async () => {
    const onLog = vi.fn();
    render(
      <RecognizedMatchSheet
        open
        onClose={() => undefined}
        result={{ kind: 'noMatch' }}
        closestMatches={[]}
        onLog={onLog}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log custom food' }));
    expect(onLog).not.toHaveBeenCalled();
    expect(screen.getByText('Type a name first')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Custom food name'), 'Tofu stir-fry');
    await userEvent.click(screen.getByRole('button', { name: 'Log custom food' }));
    const drafts = onLog.mock.calls[0]?.[0] as FoodEntryDraft[];
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.databaseFood.displayName).toBe('Tofu stir-fry');
    expect(drafts[0]?.databaseFood.source).toBe('manual');
    expect(drafts[0]?.quantity.displayLabel).toBe('~1 serving');
  });

  it('Log is disabled while submitting', async () => {
    let finish: () => void = () => undefined;
    const onLog = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(
      <RecognizedMatchSheet
        open
        onClose={() => undefined}
        result={recognized}
        closestMatches={[]}
        onLog={onLog}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    // Only the clicked button says "Logging…" and keeps focus; the other is merely inert.
    const busy = screen.getByRole('button', { name: 'Logging…' });
    expect(busy).toHaveFocus();
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    const other = screen.getByRole('button', { name: 'Log custom food' });
    expect(other).toHaveAttribute('aria-disabled', 'true');
    expect(other).not.toHaveAttribute('aria-busy');
    await userEvent.click(other);
    await userEvent.click(busy);
    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log' })).toBeEnabled());
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it('double-clicking Log commits once', async () => {
    let finish: () => void = () => undefined;
    const onLog = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(
      <RecognizedMatchSheet
        open
        onClose={() => undefined}
        result={recognized}
        closestMatches={[]}
        onLog={onLog}
      />,
    );
    await userEvent.dblClick(screen.getByRole('button', { name: 'Log' }));
    expect(onLog).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log' })).toBeEnabled());
  });

  it('a failed log shows a calm line and stays usable', async () => {
    const onLog = vi.fn(() => Promise.reject(new Error('boom')));
    render(
      <RecognizedMatchSheet
        open
        onClose={() => undefined}
        result={recognized}
        closestMatches={[]}
        onLog={onLog}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/did not save/);
    expect(screen.getByRole('button', { name: 'Log' })).toBeEnabled();
  });

  it('maps confidence to calm words, never a number', () => {
    const mixed: RecognitionResult = {
      kind: 'recognizedPlate',
      foods: [
        { databaseFood: SALMON, confidence: 0.75, quantity: range(1, 1, 'fillet', '~1 fillet') },
        { databaseFood: RICE, confidence: 0.74, quantity: range(1, 1, 'fist', '~1 fist') },
      ],
    };
    const { baseElement } = render(
      <RecognizedMatchSheet
        open
        onClose={() => undefined}
        result={mixed}
        closestMatches={[]}
        onLog={() => undefined}
      />,
    );
    expect(screen.getAllByText('likely')).toHaveLength(1);
    expect(screen.getAllByText('maybe')).toHaveLength(1);
    expect(baseElement.textContent).not.toMatch(/\d+\s*%/);
  });

  it('picks up matches that arrive late, keeping ticks and adding newcomers unticked', async () => {
    const props = { open: true, onClose: () => undefined, onLog: () => undefined };
    const none: RecognitionResult = { kind: 'noMatch' };
    const { rerender } = render(
      <RecognizedMatchSheet {...props} result={none} closestMatches={[closest[0]!]} />,
    );
    // Nothing recognised: the first match is pre-ticked; the person unticks it and ticks nothing else.
    expect(screen.getByRole('checkbox', { name: /Apple/ })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: /Apple/ }));
    expect(screen.getByRole('checkbox', { name: /Apple/ })).not.toBeChecked();

    rerender(<RecognizedMatchSheet {...props} result={none} closestMatches={closest} />);
    expect(screen.getByRole('checkbox', { name: /Rice/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Apple/ })).not.toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: /Rice/ }));

    rerender(<RecognizedMatchSheet {...props} result={recognized} closestMatches={closest} />);
    expect(screen.getByRole('checkbox', { name: /Salmon/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Rice/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Apple/ })).not.toBeChecked();
  });

  it('has no axe violations (recognized and empty)', async () => {
    const first = render(
      <RecognizedMatchSheet
        open
        onClose={() => undefined}
        result={recognized}
        closestMatches={closest}
        onLog={() => undefined}
      />,
    );
    expect(await axe(first.baseElement)).toHaveNoViolations();
    first.unmount();
    const second = render(
      <RecognizedMatchSheet
        open
        onClose={() => undefined}
        result={{ kind: 'noMatch' }}
        closestMatches={closest}
        onLog={() => undefined}
      />,
    );
    expect(await axe(second.baseElement)).toHaveNoViolations();
  });
});

describe('PortionPresets, LineBar, EntryList', () => {
  it('PortionPresets marks the selected chip with aria-pressed and reports changes', async () => {
    const presets = [range(1, 2, 'piece', '~1-2 pieces'), range(3, 4, 'piece', '~3-4 pieces')];
    const onChange = vi.fn();
    render(
      <PortionPresets presets={presets} value={presets[0] as QuantityRange} onChange={onChange} />,
    );
    expect(screen.getByRole('group', { name: 'Portion' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '~3-4 pieces' }));
    expect(onChange).toHaveBeenCalledWith(presets[1]);
  });

  it('LineBar draws four cells; an absent line is dashed with "passed" in text', () => {
    const { container } = render(<LineBar present={['vegFruit', 'protein']} />);
    const cells = screen.getAllByRole('listitem');
    expect(cells).toHaveLength(4);
    expect(cells[0]).toHaveTextContent('Veg & fruit');
    expect(cells[0]).not.toHaveTextContent('passed');
    expect(cells[2]).toHaveTextContent('Starch · passed');
    expect(cells[3]).toHaveTextContent('Dairy · passed');
    expect(container.querySelectorAll('.border-dashed')).toHaveLength(2);
    expect(container.querySelector('.bg-line-protein')).not.toBeNull();
    expect(container.querySelector('.text-red-500, .bg-red-500')).toBeNull();
  });

  it('EntryList is a ruled list with the quantity flush right in tabular figures', async () => {
    const { container } = render(
      <EntryList
        entries={[
          { id: '1', name: 'Salmon', quantity: '~1 fillet', group: 'protein' },
          { id: '2', name: 'Rice', quantity: '~1-2 fists', group: 'starch' },
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'On the plate' });
    expect(list).toHaveClass('border-t-2', 'border-porcelain');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    const quantity = screen.getByText('~1 fillet');
    expect(quantity).toHaveClass('quantity', 'whitespace-nowrap');
    expect(quantity.parentElement).toHaveClass('justify-between');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('LineBar and PortionPresets have no axe violations', async () => {
    const { container } = render(
      <div>
        <LineBar present={['dairy']} />
        <PortionPresets
          presets={[]}
          value={range(1, 1, 'serving', '~1 serving')}
          onChange={() => undefined}
        />
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
