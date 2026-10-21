import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { FoodCatalog } from '@anc/core';
import { createCameraRequest, type CameraRequest } from './camera';
import { createBarcodeDecoder, type BarcodeDecoder, type CreateDecoderOptions } from './decoder';
import {
  NO_EXTRAS,
  ScannerController,
  type ScannerExtras,
  type ScannerState,
  type VideoSurface,
} from './scanner-controller';
import type { ScanFlowDeps } from './scan-flow';

export interface UseBarcodeScannerOptions extends Omit<ScanFlowDeps, 'catalog' | 'onChange'> {
  readonly catalog: FoodCatalog;
  /** Injectable for tests and the e2e harness. */
  readonly createDecoder?: () => Promise<BarcodeDecoder | null>;
  readonly decoderOptions?: CreateDecoderOptions;
  readonly requestCamera?: CameraRequest;
  readonly intervalMs?: number;
}

/**
 * Drives a {@link ScannerController} for a screen. Attach `videoRef` to a `<video muted
 * playsInline>`; render the state with `CameraView`. The camera is released when the component
 * unmounts or the page is backgrounded, and re-acquired when the page returns.
 */
export function useBarcodeScanner(options: UseBarcodeScannerOptions): {
  readonly state: ScannerState;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly extras: ScannerExtras;
  readonly dismissResult: () => void;
  readonly toggleTorch: () => void;
  readonly submitCode: (code: string) => void;
} {
  const [state, setState] = useState<ScannerState>({ kind: 'checking' });
  const [extras, setExtras] = useState<ScannerExtras>(NO_EXTRAS);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controllerRef = useRef<ScannerController | null>(null);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const surface: VideoSurface = {
      async attach(stream) {
        const video = videoRef.current;
        if (video === null) throw new Error('no preview element');
        video.srcObject = stream;
        await video.play();
      },
      detach() {
        const video = videoRef.current;
        if (video !== null) video.srcObject = null;
      },
      frame() {
        const video = videoRef.current;
        return video !== null && video.readyState >= 2 && video.videoWidth > 0 ? video : null;
      },
    };
    const o = optionsRef.current;
    const controller = new ScannerController({
      catalog: o.catalog,
      prefs: o.prefs ?? null,
      ...(o.askOffNotice ? { askOffNotice: o.askOffNotice } : {}),
      createDecoder: o.createDecoder ?? (() => createBarcodeDecoder(o.decoderOptions)),
      requestCamera: o.requestCamera ?? createCameraRequest(),
      surface,
      ...(o.intervalMs !== undefined ? { intervalMs: o.intervalMs } : {}),
      onChange: setState,
      onExtras: setExtras,
    });
    controllerRef.current = controller;

    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') controller.pauseCamera();
      else void controller.resumeCamera();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void controller.start();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  const dismissResult = useCallback(() => controllerRef.current?.dismissResult(), []);
  const toggleTorch = useCallback(() => void controllerRef.current?.toggleTorch(), []);
  const submitCode = useCallback(
    (code: string) => void controllerRef.current?.submitCode(code),
    [],
  );
  return { state, videoRef, extras, dismissResult, toggleTorch, submitCode };
}
