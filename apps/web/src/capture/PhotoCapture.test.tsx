import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import {
  catalogFailure,
  notFound,
  recognizedPlate,
  type AiRung,
  type FoodCatalog,
} from '@anc/core';
import { CameraNotice } from './CameraNotice';
import { PhotoCapture } from './PhotoCapture';
import { PhotoUploadPermit } from '../ai/photo-upload-permit';
import { photoDigest } from './photo-digest';
import { usePhotoFlow, type UsePhotoFlowDeps } from './usePhotoFlow';
import { jpegWithExif } from './testing';

describe('PhotoCapture', () => {
  it('offers the camera and the file picker, and reports only the chosen source', () => {
    const onSource = vi.fn();
    const { container } = render(<PhotoCapture onSource={onSource} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
    expect(onSource).toHaveBeenLastCalledWith('camera');
    fireEvent.click(screen.getByRole('button', { name: 'Choose a photo' }));
    expect(onSource).toHaveBeenLastCalledWith('files');
    expect(container.querySelector('input[type=file]')).toBeNull(); // the picker is opened on demand
  });

  it('busy ignores clicks and says so', () => {
    const onSource = vi.fn();
    render(<PhotoCapture onSource={onSource} busy />);
    const button = screen.getByRole('button', { name: 'Take a photo' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onSource).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { container } = render(<PhotoCapture onSource={() => undefined} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('CameraNotice', () => {
  it('"Camera denied, type it instead" with a path to manual entry', async () => {
    const onAction = vi.fn();
    const { container } = render(
      <CameraNotice
        title="Camera denied — type it instead"
        body="You can still log a plate from the manual entry screen."
        actionLabel="Type it manually"
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Type it manually' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('usePhotoFlow', () => {
  const photo = jpegWithExif();
  const catalog: FoodCatalog = {
    search: async (q) => notFound(q),
    lookupBySourceRef: async () => null,
    lookupByBarcode: async () => catalogFailure('barcodeUnsupported'),
  };
  function deps(over: Partial<UsePhotoFlowDeps> = {}): UsePhotoFlowDeps {
    const rung: AiRung = { recognize: async () => recognizedPlate([]) };
    return {
      getRung: () => rung,
      uploadHost: () => null,
      askBeforeEveryPhoto: () => true,
      hasHostConsent: () => false,
      askConsent: async () => true,
      grantHostConsent: async () => undefined,
      permit: new PhotoUploadPermit(photoDigest),
      catalog,
      createCapture: () => ({ capture: async () => photo }),
      ...over,
    };
  }

  it('start() runs the flow and publishes the ready state; the state holds no photo bytes', async () => {
    const { result } = renderHook(() => usePhotoFlow(deps()));
    expect(result.current.state).toBeNull();
    act(() => result.current.start('camera'));
    await waitFor(() => expect(result.current.state?.kind).toBe('ready'));
    expect(JSON.stringify(result.current.state)).not.toContain('255');
  });

  it('a cancelled picker is the denied state', async () => {
    const { result } = renderHook(() =>
      usePhotoFlow(deps({ createCapture: () => ({ capture: async () => null }) })),
    );
    act(() => result.current.start('camera'));
    await waitFor(() => expect(result.current.state?.kind).toBe('denied'));
  });

  it('a retake while the first is still resolving: only the LATEST capture publishes', async () => {
    let releaseFirst: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => (releaseFirst = resolve));
    let n = 0;
    const rung: AiRung = {
      recognize: async () => {
        const mine = ++n;
        if (mine === 1) await slow;
        return mine === 1 ? { kind: 'noMatch' } : recognizedPlate([]);
      },
    };
    const { result } = renderHook(() => usePhotoFlow(deps({ getRung: () => rung })));
    act(() => result.current.start('camera'));
    await waitFor(() => expect(result.current.state?.kind).toBe('resolving'));
    act(() => result.current.start('camera'));
    await waitFor(() => expect(result.current.state?.kind).toBe('ready'));
    const latest = result.current.state;
    releaseFirst();
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.state).toBe(latest); // the first, superseded run published nothing
    expect(latest).toMatchObject({ result: { kind: 'recognizedPlate' } });
  });

  it('nothing is published after unmount', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { result, unmount } = renderHook(() =>
      usePhotoFlow(
        deps({
          createCapture: () => ({
            capture: async () => {
              await gate;
              return photo;
            },
          }),
        }),
      ),
    );
    act(() => result.current.start('camera'));
    unmount();
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.state).toMatchObject({ kind: 'capturing' });
  });
});
