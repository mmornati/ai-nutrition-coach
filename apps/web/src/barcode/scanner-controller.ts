/**
 * The scan session: decoder + camera + scan flow, free of React (the logic of
 * the earlier client's state). `useBarcodeScanner` binds it to a component.
 *
 * Order (the earlier screen's): if no local decoder can start, say so and NEVER ask for the camera;
 * otherwise request the camera once. Three calm camera states:
 *
 *   scanning                         a live preview, a quiet "move closer or steady" hint
 *   denied     "Camera denied"       one tap-to-type path, no retry button
 *   unavailable "Camera unavailable" one tap-to-type path, no retry button
 *   unsupported "Scanning isn't available in this browser, type it instead"
 *
 * One camera, started once per session. Backgrounding the page releases the camera (a camera held
 * while backgrounded is a privacy and battery problem) and returning re-acquires it, but only if
 * this session had started it. After `dispose` every event is ignored.
 */
import type { BarcodeDecoder, DecodeInput } from './decoder';
import { stopStream, type CameraRequest } from './camera';
import { ScanFlow, type LookupState, type ScanFlowDeps } from './scan-flow';

export type ScannerState =
  /** "Checking camera permission…" */
  | { readonly kind: 'checking' }
  | { readonly kind: 'scanning'; readonly lookup: LookupState }
  | { readonly kind: 'denied' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'unsupported' };

/** The preview surface. The view owns the `<video>`; the controller only drives it. */
export interface VideoSurface {
  attach(stream: MediaStream): Promise<void> | void;
  detach(): void;
  /** The current frame to decode, or `null` when the preview is not ready yet. */
  frame(): DecodeInput | null;
}

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface ScannerControllerDeps extends Omit<ScanFlowDeps, 'onChange'> {
  readonly createDecoder: () => Promise<BarcodeDecoder | null>;
  readonly requestCamera: CameraRequest;
  readonly surface: VideoSurface;
  /** Time between decode attempts. */
  readonly intervalMs?: number;
  readonly scheduler?: Scheduler;
  readonly onChange?: (state: ScannerState) => void;
}

export const DECODE_INTERVAL_MS = 200;

export class ScannerController {
  private current: ScannerState = { kind: 'checking' };
  private decoder: BarcodeDecoder | null = null;
  private stream: MediaStream | null = null;
  private flow: ScanFlow;
  private timer: unknown;
  private disposed = false;
  private started = false; // the camera was started in this session
  private cameraActive = false; // and is running right now
  private decoding = false;
  private readonly scheduler: Scheduler;
  private readonly intervalMs: number;

  constructor(private readonly deps: ScannerControllerDeps) {
    this.scheduler = deps.scheduler ?? realScheduler;
    this.intervalMs = deps.intervalMs ?? DECODE_INTERVAL_MS;
    this.flow = new ScanFlow({
      catalog: deps.catalog,
      prefs: deps.prefs ?? null,
      ...(deps.askOffNotice ? { askOffNotice: deps.askOffNotice } : {}),
      onChange: (lookup) => {
        if (this.current.kind === 'scanning') this.set({ kind: 'scanning', lookup });
      },
    });
  }

  get state(): ScannerState {
    return this.current;
  }

  /** Check the decoder, ask for the camera once, start scanning. Call once. */
  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true; // a second start() is a no-op: ONE camera, ONE start per session

    let decoder: BarcodeDecoder | null = null;
    try {
      decoder = await this.deps.createDecoder();
    } catch {
      decoder = null;
    }
    if (this.disposed) {
      decoder?.dispose();
      return;
    }
    if (decoder === null) {
      // Nothing could decode the frames: skip the permission prompt and the camera.
      this.set({ kind: 'unsupported' });
      return;
    }
    this.decoder = decoder;

    const camera = await this.deps.requestCamera();
    if (this.disposed) {
      if (camera.kind === 'granted') stopStream(camera.stream);
      return;
    }
    if (camera.kind === 'denied') {
      this.set({ kind: 'denied' });
      return;
    }
    if (camera.kind === 'unavailable') {
      this.set({ kind: 'unavailable' });
      return;
    }
    await this.activate(camera.stream);
  }

  /** The Dismiss of a result (match sheet closed / "Scan again"): re-arm the scanner. */
  dismissResult(): void {
    this.flow.dismissResult();
  }

  /** The page went to the background: release the camera. */
  pauseCamera(): void {
    if (this.disposed || !this.cameraActive) return;
    this.cameraActive = false;
    this.clearTimer();
    this.deps.surface.detach();
    stopStream(this.stream);
    this.stream = null;
  }

  /** The page is back: re-acquire the camera, only if this session had it. */
  async resumeCamera(): Promise<void> {
    if (this.disposed || this.cameraActive || this.current.kind !== 'scanning') return;
    const camera = await this.deps.requestCamera();
    if (this.disposed) {
      if (camera.kind === 'granted') stopStream(camera.stream);
      return;
    }
    if (camera.kind === 'granted') await this.activate(camera.stream);
    else this.set({ kind: camera.kind });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer();
    this.flow.dispose();
    this.deps.surface.detach();
    stopStream(this.stream);
    this.stream = null;
    this.decoder?.dispose();
    this.decoder = null;
  }

  // ── internals ──

  private async activate(stream: MediaStream): Promise<void> {
    this.stream = stream;
    this.cameraActive = true;
    if (this.current.kind !== 'scanning') this.set({ kind: 'scanning', lookup: this.flow.state });
    try {
      await this.deps.surface.attach(stream);
    } catch {
      // The preview could not start (autoplay policy, a lost device): the calm unavailable copy.
      this.pauseCamera();
      this.set({ kind: 'unavailable' });
      return;
    }
    this.schedule();
  }

  private set(state: ScannerState): void {
    this.current = state;
    if (!this.disposed) this.deps.onChange?.(state);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) this.scheduler.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    this.clearTimer();
    if (this.disposed || !this.cameraActive) return;
    this.timer = this.scheduler.setTimeout(() => void this.tick(), this.intervalMs);
  }

  /** One decode attempt. Idles while a result is up; never overlaps itself. */
  private async tick(): Promise<void> {
    this.timer = undefined;
    if (this.disposed || !this.cameraActive) return;
    const decoder = this.decoder;
    if (decoder !== null && !this.flow.paused && !this.decoding) {
      const frame = this.deps.surface.frame();
      if (frame !== null) {
        this.decoding = true;
        try {
          const codes = await decoder.decode(frame);
          const code = codes.find((c) => c.trim().length > 0);
          if (code !== undefined && !this.disposed) await this.flow.onCode(code);
        } catch {
          // A bad frame is not an error worth showing; the next one may decode.
        } finally {
          this.decoding = false;
        }
      }
    }
    this.schedule();
  }
}
