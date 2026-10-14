/**
 * The barcode decoder: the browser's native `BarcodeDetector` where it exists and can read retail
 * codes, otherwise the self-hosted `zxing-wasm` reader; if neither can start the caller shows
 * "Scanning isn't available in this browser, type it instead" (port of
 * `barcode_detector_support_web.dart` and the `mobile_scanner` web reader selection).
 *
 * Everything runs on the device: the camera frame is decoded locally and only the resulting
 * barcode string ever leaves it (and only to Open Food Facts, and only after the person said OK).
 * Pure browser APIs behind small interfaces, so it is unit-tested with fakes.
 */
import { ZXING_READER_PATH } from './zxing-pin';

/** Retail codes only: the same four the Dart scanner was configured with. */
export const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;
export const ZXING_FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE'] as const;

/** Anything a frame can be read from. */
export type DecodeInput = HTMLVideoElement | ImageBitmap | ImageData | Blob;

export type DecoderKind = 'native' | 'zxing';

export interface BarcodeDecoder {
  readonly kind: DecoderKind;
  /** The barcode strings found in one frame, best first. Never throws: a bad frame is `[]`. */
  decode(input: DecodeInput): Promise<string[]>;
  dispose(): void;
}

// ── Native ───────────────────────────────────────────────────────────────────────────────────

interface NativeDetector {
  detect(image: unknown): Promise<readonly { rawValue: string }[]>;
}
interface NativeDetectorCtor {
  new (options?: { formats?: readonly string[] }): NativeDetector;
  getSupportedFormats?(): Promise<readonly string[]>;
}

/** What `detectDecoderSupport` looks at (the global object, injectable for tests). */
export interface DecoderEnv {
  readonly BarcodeDetector?: NativeDetectorCtor;
  readonly WebAssembly?: unknown;
}

/** Synchronous capability probe: is a local decoder plausible at all? */
export function decoderMaybeAvailable(
  env: DecoderEnv = globalThis as unknown as DecoderEnv,
): boolean {
  return env.BarcodeDetector !== undefined || env.WebAssembly !== undefined;
}

async function createNativeDecoder(env: DecoderEnv): Promise<BarcodeDecoder | null> {
  const Ctor = env.BarcodeDetector;
  if (Ctor === undefined) return null;
  try {
    // A native detector that cannot read retail codes (some platforms list only QR) is no use.
    const supported = await Ctor.getSupportedFormats?.();
    if (supported !== undefined && !NATIVE_FORMATS.some((f) => supported.includes(f))) return null;
    const detector = new Ctor({ formats: NATIVE_FORMATS });
    return {
      kind: 'native',
      async decode(input) {
        try {
          const found = await detector.detect(input);
          return found.map((b) => b.rawValue).filter((v) => v.length > 0);
        } catch {
          return [];
        }
      },
      dispose() {},
    };
  } catch {
    return null;
  }
}

// ── zxing-wasm ───────────────────────────────────────────────────────────────────────────────

interface ZXingReadResult {
  readonly text: string;
  readonly isValid?: boolean;
}
interface ZXingApi {
  prepareZXingModule(options: {
    overrides?: { locateFile?: (path: string, prefix: string) => string };
    fireImmediately: true;
  }): Promise<unknown>;
  readBarcodes(
    input: Blob | ImageData,
    options?: { formats?: readonly string[]; tryHarder?: boolean; maxNumberOfSymbols?: number },
  ): Promise<readonly ZXingReadResult[]>;
}

/** Loads the self-hosted reader script once and returns its global API. Rejects if it cannot. */
export type ZXingLoader = () => Promise<ZXingApi>;

let readerScript: Promise<ZXingApi> | undefined;

/** The production loader: a `<script>` tag from OUR origin (allowed by `script-src 'self'`). */
export function loadSelfHostedZxing(
  readerPath: string = ZXING_READER_PATH,
  doc: Document = document,
): Promise<ZXingApi> {
  readerScript ??= new Promise<ZXingApi>((resolve, reject) => {
    const existing = (globalThis as { ZXingWASM?: ZXingApi }).ZXingWASM;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = doc.createElement('script');
    script.src = readerPath;
    script.async = true;
    script.onload = () => {
      const api = (globalThis as { ZXingWASM?: ZXingApi }).ZXingWASM;
      if (api) resolve(api);
      else reject(new Error('zxing reader loaded without its API'));
    };
    script.onerror = () => reject(new Error('zxing reader could not be loaded'));
    doc.head.append(script);
  }).catch((error: unknown) => {
    readerScript = undefined; // a later attempt may succeed (e.g. back online)
    throw error;
  });
  return readerScript;
}

/** Resolve the wasm beside the reader, whatever the document's base path is. */
export function locateZxingFile(readerPath: string, base: string): (path: string) => string {
  return (path) => new URL(path, new URL(readerPath, base)).href;
}

async function createZxingDecoder(
  load: ZXingLoader,
  frame: FrameReader,
): Promise<BarcodeDecoder | null> {
  let api: ZXingApi;
  try {
    api = await load();
    // Compile the wasm now, so "cannot start" is known before the camera is asked for.
    await api.prepareZXingModule({
      overrides: {
        locateFile: locateZxingFile(
          ZXING_READER_PATH,
          globalThis.location?.href ?? 'http://localhost/',
        ),
      },
      fireImmediately: true,
    });
  } catch {
    return null;
  }
  return {
    kind: 'zxing',
    async decode(input) {
      try {
        const readable = input instanceof Blob || isImageData(input) ? input : await frame(input);
        if (readable === null) return [];
        const results = await api.readBarcodes(readable, {
          formats: ZXING_FORMATS,
          tryHarder: true,
          maxNumberOfSymbols: 1,
        });
        return results.filter((r) => r.isValid !== false && r.text.length > 0).map((r) => r.text);
      } catch {
        return [];
      }
    },
    dispose() {},
  };
}

const isImageData = (v: unknown): v is ImageData =>
  typeof ImageData !== 'undefined' && v instanceof ImageData;

/** Turns a video / bitmap into pixels zxing can read (a canvas copy, at most 1280 px wide). */
export type FrameReader = (source: HTMLVideoElement | ImageBitmap) => Promise<ImageData | null>;

export const canvasFrameReader: FrameReader = async (source) => {
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!(width > 0) || !(height > 0)) return null;
  const scale = Math.min(1, 1280 / width);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return null;
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
};

// ── Choice ───────────────────────────────────────────────────────────────────────────────────

export interface CreateDecoderOptions {
  /** Force one decoder (the e2e harness proves the zxing path in a browser that has the native one). */
  readonly prefer?: DecoderKind;
  readonly env?: DecoderEnv;
  readonly loadZxing?: ZXingLoader;
  readonly frameReader?: FrameReader;
}

/**
 * The decoder to use, or `null` when neither can start ("scanning isn't available in this
 * browser"). Native first; the self-hosted zxing-wasm reader otherwise. Never throws.
 */
export async function createBarcodeDecoder(
  options: CreateDecoderOptions = {},
): Promise<BarcodeDecoder | null> {
  const env = options.env ?? (globalThis as unknown as DecoderEnv);
  const loadZxing = options.loadZxing ?? (() => loadSelfHostedZxing());
  const frame = options.frameReader ?? canvasFrameReader;

  if (options.prefer !== 'zxing') {
    const native = await createNativeDecoder(env);
    if (native !== null || options.prefer === 'native') return native;
  }
  if (env.WebAssembly === undefined) return null;
  return createZxingDecoder(loadZxing, frame);
}
