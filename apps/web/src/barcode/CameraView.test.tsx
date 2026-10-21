import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { CameraView } from './CameraView';
import { NO_EXTRAS, type ScannerExtras } from './scanner-controller';
import type { ScannerState } from './scanner-controller';
import type { LookupState } from './scan-flow';

function view(state: ScannerState) {
  const onTypeInstead = vi.fn();
  const onScanAgain = vi.fn();
  const utils = render(
    <CameraView
      state={state}
      videoRef={createRef()}
      onTypeInstead={onTypeInstead}
      onScanAgain={onScanAgain}
    />,
  );
  return { onTypeInstead, onScanAgain, ...utils };
}

const scanning = (lookup: LookupState): ScannerState => ({ kind: 'scanning', lookup });

describe('CameraView: the calm camera states', () => {
  it('denied: "Camera denied", one tap-to-type path, no retry', () => {
    const { onTypeInstead } = view({ kind: 'denied' });
    expect(screen.getByText('Camera denied — type it instead')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry|try again/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Type it manually' }));
    expect(onTypeInstead).toHaveBeenCalledWith();
  });

  it('unavailable: "Camera unavailable", one tap-to-type path', () => {
    const { onTypeInstead } = view({ kind: 'unavailable' });
    expect(screen.getByText('Camera unavailable — type it instead')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Type it manually' }));
    expect(onTypeInstead).toHaveBeenCalledTimes(1);
  });

  it('unsupported: "scanning isn\'t available in this browser, type it instead"', () => {
    view({ kind: 'unsupported' });
    expect(screen.getByText(/isn't available in this browser/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Type it manually' })).toBeInTheDocument();
  });

  it('checking: the quiet permission line, nothing to tap yet', () => {
    view({ kind: 'checking' });
    expect(screen.getByRole('status')).toHaveTextContent('Checking camera permission…');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('only the scanning state shows the preview and its quiet hint (the video is always mounted)', () => {
    const { container, rerender } = view({ kind: 'denied' });
    const wrapper = container.querySelector('video')!.parentElement!;
    expect(wrapper).toHaveAttribute('hidden');
    rerender(
      <CameraView
        state={scanning({ kind: 'idle' })}
        videoRef={createRef()}
        onTypeInstead={() => undefined}
        onScanAgain={() => undefined}
      />,
    );
    expect(wrapper).not.toHaveAttribute('hidden');
    expect(
      screen.getByText('Hold about 20 cm away and fit the barcode in the box.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('scan-guide')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Aim at a packaged barcode to log it.')).toBeInTheDocument();
    expect(screen.getByLabelText('Camera preview')).toBeInTheDocument();
  });
});

function scanView(extras: ScannerExtras = NO_EXTRAS) {
  const onToggleTorch = vi.fn();
  const onManualCode = vi.fn();
  const utils = render(
    <CameraView
      state={scanning({ kind: 'idle' })}
      videoRef={createRef()}
      onTypeInstead={vi.fn()}
      onScanAgain={vi.fn()}
      extras={extras}
      onToggleTorch={onToggleTorch}
      onManualCode={onManualCode}
    />,
  );
  return { onToggleTorch, onManualCode, ...utils };
}

describe('CameraView: torch', () => {
  it('no torch button when the camera has none', () => {
    scanView();
    expect(screen.queryByRole('button', { name: 'Torch' })).toBeNull();
  });

  it('a toggle with aria-pressed, a 48px target, that calls back', () => {
    const { onToggleTorch, rerender } = scanView({ ...NO_EXTRAS, torchAvailable: true });
    const button = screen.getByRole('button', { name: 'Torch' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.className).toContain('size-12');
    fireEvent.click(button);
    expect(onToggleTorch).toHaveBeenCalledTimes(1);
    rerender(
      <CameraView
        state={scanning({ kind: 'idle' })}
        videoRef={createRef()}
        onTypeInstead={vi.fn()}
        onScanAgain={vi.fn()}
        extras={{ ...NO_EXTRAS, torchAvailable: true, torchOn: true }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Torch' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('CameraView: type the barcode', () => {
  it('is always there while scanning, and not in the other states', () => {
    scanView();
    expect(screen.getByRole('button', { name: 'Type the barcode' })).toBeInTheDocument();
  });

  it('is absent when the camera is denied', () => {
    view({ kind: 'denied' });
    expect(screen.queryByRole('button', { name: 'Type the barcode' })).toBeNull();
  });

  it('a valid code goes to the same lookup path and closes the field', () => {
    const { onManualCode } = scanView();
    fireEvent.click(screen.getByRole('button', { name: 'Type the barcode' }));
    const input = screen.getByLabelText('Barcode digits');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    fireEvent.change(input, { target: { value: '3017 620422003' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(onManualCode).toHaveBeenCalledWith('3017620422003');
    expect(screen.queryByLabelText('Barcode digits')).toBeNull();
  });

  it('a wrong length or check digit is a calm message, nothing is looked up', () => {
    const { onManualCode } = scanView();
    fireEvent.click(screen.getByRole('button', { name: 'Type the barcode' }));
    const input = screen.getByLabelText('Barcode digits');
    fireEvent.change(input, { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(screen.getByText(/has 8, 12 or 13 digits/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '3017620422004' } });
    expect(screen.queryByText(/has 8, 12 or 13 digits/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(screen.getByText(/don't add up/)).toBeInTheDocument();
    expect(onManualCode).not.toHaveBeenCalled();
  });

  it('after a quiet while a calm line explains it, without a countdown', () => {
    scanView();
    expect(screen.queryByText(/Taking a while/)).toBeNull();
    cleanup();
    scanView({ ...NO_EXTRAS, slow: true });
    expect(screen.getByText(/Taking a while/)).toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*s\b/)).toBeNull();
  });

  it('has no axe violations with the field open and with the torch', async () => {
    const { container } = scanView({ ...NO_EXTRAS, torchAvailable: true, slow: true });
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.click(screen.getByRole('button', { name: 'Type the barcode' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('CameraView: lookup lines', () => {
  it('looking up shows the code, no spinner and no countdown', () => {
    view(scanning({ kind: 'lookingUp', code: '3017620422003' }));
    expect(screen.getByText('Looking up 3017620422003…')).toBeInTheDocument();
  });

  it('not found: "Not found — type it manually"; Type it manually carries the scanned code; Scan again re-arms', () => {
    const { onTypeInstead, onScanAgain } = view(
      scanning({ kind: 'notFound', code: '0000000000000' }),
    );
    expect(screen.getByText('Not found — type it manually')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Type it manually' }));
    expect(onTypeInstead).toHaveBeenCalledWith('0000000000000');
    fireEvent.click(screen.getByRole('button', { name: 'Scan again' }));
    expect(onScanAgain).toHaveBeenCalledTimes(1);
  });

  it('catalog failure: "Search isn\'t available right now." with no retry and a way to type it', () => {
    const { onTypeInstead } = view(scanning({ kind: 'failure', code: '3017620422003' }));
    expect(screen.getByText("Search isn't available right now.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry|try again/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Type it manually' }));
    expect(onTypeInstead).toHaveBeenCalledWith('3017620422003');
  });

  it("a match shows the aim hint (the match sheet is the screen's)", () => {
    view(
      scanning({
        kind: 'match',
        code: '1',
        match: {
          food: { sourceRef: '1', displayName: 'X', source: 'off', foodGroup: 'other' },
          confidence: 1,
          presets: [],
        },
      }),
    );
    expect(screen.getByText('Aim at a packaged barcode to log it.')).toBeInTheDocument();
  });
});

describe('CameraView: accessibility', () => {
  it.each<[string, ScannerState]>([
    ['checking', { kind: 'checking' }],
    ['denied', { kind: 'denied' }],
    ['unavailable', { kind: 'unavailable' }],
    ['unsupported', { kind: 'unsupported' }],
    ['scanning', scanning({ kind: 'idle' })],
    ['not found', scanning({ kind: 'notFound', code: '1' })],
    ['failure', scanning({ kind: 'failure', code: '1' })],
  ])('%s has no axe violations', async (_name, state) => {
    const { container } = view(state);
    expect(await axe(container)).toHaveNoViolations();
  });
});
