/**
 * A short voice recording for "Describe a meal", with three calm states like the barcode camera:
 *  - `recording`    the microphone is on;
 *  - `denied`       the person (or the browser policy) said no;
 *  - `unavailable`  no microphone, one in use elsewhere, or no `getUserMedia` / `MediaRecorder`.
 *
 * The microphone is only ever asked for from a tap (the caller starts it), at most 30 s are kept,
 * and the tracks are stopped the moment the recording ends, so the browser's recording indicator
 * goes away with it. The audio exists only as the `Blob` handed back: it is never stored, never
 * given a URL, never played. TRANSCRIPTION ONLY: nothing here (or after it) identifies a speaker.
 *
 * Format: `audio/webm;codecs=opus` where the browser records it, `audio/mp4` (AAC) on Safari. About
 * 32 kbit/s, so 30 s is well under the 1 MiB the instance proxy takes. Injectable for tests.
 */

/** The longest recording, in milliseconds. */
export const MAX_RECORDING_MS = 30_000;
/** A speech-quality bit rate: 30 s stays near 120 KB. */
export const RECORDING_BITS_PER_SECOND = 32_000;

/** In order of preference; the first one the browser says it can record is used. */
export const RECORDER_MIME_CANDIDATES: readonly string[] = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

export type RecorderStart =
  { readonly kind: 'recording' } | { readonly kind: 'denied' } | { readonly kind: 'unavailable' };

export type RecorderStop =
  | { readonly kind: 'audio'; readonly blob: Blob }
  /** Nothing was captured (stopped at once, or the browser produced no data). */
  | { readonly kind: 'empty' };

/** The slice of `MediaRecorder` this module uses. */
export interface RecorderLike {
  readonly mimeType: string;
  ondataavailable: ((event: { readonly data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface RecorderConstructor {
  new (
    stream: MediaStream,
    options?: { readonly mimeType?: string; readonly audioBitsPerSecond?: number },
  ): RecorderLike;
  isTypeSupported?(type: string): boolean;
}

export interface VoiceEnv {
  readonly getUserMedia?:
    ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | undefined;
  readonly Recorder?: RecorderConstructor | undefined;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
}

/** The real browser, resolved at call time (nothing is touched while a module loads). */
export function browserVoiceEnv(): VoiceEnv {
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  return {
    getUserMedia:
      devices && typeof devices.getUserMedia === 'function'
        ? (c) => devices.getUserMedia(c)
        : undefined,
    Recorder:
      typeof MediaRecorder === 'undefined'
        ? undefined
        : (MediaRecorder as unknown as RecorderConstructor),
  };
}

/** The first candidate format the recorder supports; `''` (the browser's own default) when it cannot say. */
export function pickRecorderMime(Recorder: RecorderConstructor): string {
  if (typeof Recorder.isTypeSupported !== 'function') return '';
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    try {
      if (Recorder.isTypeSupported(candidate)) return candidate;
    } catch {
      // Try the next one.
    }
  }
  return '';
}

/** True when this browser can record at all (so the button can be offered). */
export function voiceRecordingSupported(env: VoiceEnv = browserVoiceEnv()): boolean {
  return env.getUserMedia !== undefined && env.Recorder !== undefined;
}

const errorName = (error: unknown): string =>
  error instanceof DOMException || error instanceof Error ? error.name : '';

// NotAllowedError: refused (or blocked by policy); SecurityError: the page may not ask.
const isPermissionError = (error: unknown): boolean =>
  ['NotAllowedError', 'SecurityError', 'PermissionDeniedError'].includes(errorName(error));

export class VoiceRecorder {
  readonly #env: VoiceEnv;
  readonly #maxMs: number;
  #stream: MediaStream | null = null;
  #recorder: RecorderLike | null = null;
  #chunks: Blob[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;
  #finished: Promise<RecorderStop> | null = null;
  #onLimit: ((result: RecorderStop) => void) | undefined;

  constructor(env: VoiceEnv = browserVoiceEnv(), options: { readonly maxMs?: number } = {}) {
    this.#env = env;
    this.#maxMs = options.maxMs ?? MAX_RECORDING_MS;
  }

  get recording(): boolean {
    return this.#recorder !== null;
  }

  /**
   * Asks for the microphone and starts recording. `onLimit` is called with the audio if the
   * maximum length is reached before `stop()`.
   */
  async start(onLimit?: (result: RecorderStop) => void): Promise<RecorderStart> {
    const { getUserMedia, Recorder } = this.#env;
    if (this.#recorder !== null) return { kind: 'recording' };
    if (getUserMedia === undefined || Recorder === undefined) return { kind: 'unavailable' };
    let stream: MediaStream;
    try {
      stream = await getUserMedia({ audio: true, video: false });
    } catch (error) {
      return isPermissionError(error) ? { kind: 'denied' } : { kind: 'unavailable' };
    }
    const mime = pickRecorderMime(Recorder);
    let recorder: RecorderLike;
    try {
      recorder = new Recorder(stream, {
        ...(mime === '' ? {} : { mimeType: mime }),
        audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
      });
    } catch {
      this.#release(stream);
      return { kind: 'unavailable' };
    }
    this.#stream = stream;
    this.#recorder = recorder;
    this.#chunks = [];
    this.#onLimit = onLimit;
    this.#finished = new Promise<RecorderStop>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        const type = recorder.mimeType || mime || 'audio/webm';
        const blob = new Blob(this.#chunks, { type });
        this.#chunks = [];
        this.#reset();
        resolve(blob.size > 0 ? { kind: 'audio', blob } : { kind: 'empty' });
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.#chunks.push(event.data);
      };
      recorder.onstop = finish;
      recorder.onerror = finish;
    });
    try {
      recorder.start();
    } catch {
      this.cancel();
      return { kind: 'unavailable' };
    }
    const set = this.#env.setTimeout ?? globalThis.setTimeout;
    this.#timer = set(() => {
      const pending = this.#finished;
      const callback = this.#onLimit;
      this.#stopRecorder();
      if (pending !== null) void pending.then((result) => callback?.(result));
    }, this.#maxMs);
    return { kind: 'recording' };
  }

  /** Ends the recording and hands back the audio. Safe to call when nothing is recording. */
  async stop(): Promise<RecorderStop> {
    const pending = this.#finished;
    if (pending === null) return { kind: 'empty' };
    this.#onLimit = undefined;
    this.#stopRecorder();
    return pending;
  }

  /** Ends the recording and drops what was captured (the screen went away). */
  cancel(): void {
    this.#onLimit = undefined;
    this.#chunks = [];
    this.#stopRecorder();
    this.#reset();
  }

  #stopRecorder(): void {
    const recorder = this.#recorder;
    if (this.#timer !== undefined) {
      (this.#env.clearTimeout ?? globalThis.clearTimeout)(this.#timer);
      this.#timer = undefined;
    }
    if (recorder === null) return;
    try {
      recorder.stop();
    } catch {
      recorder.onstop?.();
    }
  }

  #release(stream: MediaStream | null): void {
    // The microphone goes off now, not when the page is closed.
    for (const track of stream?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        // Already stopped.
      }
    }
  }

  #reset(): void {
    this.#release(this.#stream);
    this.#stream = null;
    this.#recorder = null;
    this.#finished = null;
  }
}
