// Decoder choice: native `BarcodeDetector` where present, otherwise self-hosted zxing-wasm; if
// neither can start, null ("scanning isn't available in this browser").
import { describe, expect, it, vi } from 'vitest';
import {
  createBarcodeDecoder,
  decoderMaybeAvailable,
  locateZxingFile,
  NATIVE_FORMATS,
  ZXING_FORMATS,
  type DecoderEnv,
  type ZXingLoader,
} from './decoder';
import { ZXING_READER_PATH } from './zxing-pin';

class FakeDetector {
  static supported: readonly string[] | undefined = [
    'ean_13',
    'ean_8',
    'upc_a',
    'upc_e',
    'qr_code',
  ];
  static last: FakeDetector | undefined;
  static throwOnConstruct = false;
  static results: { rawValue: string }[] = [];
  static failDetect = false;
  readonly formats: readonly string[] | undefined;
  constructor(options?: { formats?: readonly string[] }) {
    if (FakeDetector.throwOnConstruct) throw new Error('unsupported');
    this.formats = options?.formats;
    FakeDetector.last = this;
  }
  static async getSupportedFormats() {
    return FakeDetector.supported ?? [];
  }
  async detect() {
    if (FakeDetector.failDetect) throw new Error('InvalidStateError');
    return FakeDetector.results;
  }
}

const reset = () => {
  FakeDetector.supported = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'];
  FakeDetector.throwOnConstruct = false;
  FakeDetector.results = [];
  FakeDetector.failDetect = false;
  FakeDetector.last = undefined;
};

function fakeZxing(text = '3017620422003') {
  const prepare = vi.fn<(options: unknown) => Promise<undefined>>(async () => undefined);
  const readBarcodes = vi.fn<
    (input: unknown, options: unknown) => Promise<{ text: string; isValid: boolean }[]>
  >(async () => [{ text, isValid: true }]);
  const load: ZXingLoader = async () => ({ prepareZXingModule: prepare, readBarcodes });
  return { load, prepare, readBarcodes };
}

describe('support probe', () => {
  it('a local decoder is plausible with BarcodeDetector OR WebAssembly', () => {
    expect(decoderMaybeAvailable({ BarcodeDetector: FakeDetector as never })).toBe(true);
    expect(decoderMaybeAvailable({ WebAssembly: {} })).toBe(true);
    expect(decoderMaybeAvailable({})).toBe(false);
  });
});

describe('native BarcodeDetector', () => {
  it('is used where present, asked for the four retail formats only', async () => {
    reset();
    const env: DecoderEnv = { BarcodeDetector: FakeDetector as never, WebAssembly: {} };
    const zx = fakeZxing();
    const decoder = await createBarcodeDecoder({ env, loadZxing: zx.load });
    expect(decoder?.kind).toBe('native');
    expect(FakeDetector.last?.formats).toEqual(NATIVE_FORMATS);
    expect(NATIVE_FORMATS).toEqual(['ean_13', 'ean_8', 'upc_a', 'upc_e']);
    FakeDetector.results = [{ rawValue: '3017620422003' }, { rawValue: '' }];
    expect(await decoder!.decode({} as never)).toEqual(['3017620422003']);
    expect(zx.prepare).not.toHaveBeenCalled(); // zxing never loaded
  });

  it('a detect() that throws is an empty frame, never an exception', async () => {
    reset();
    FakeDetector.failDetect = true;
    const decoder = await createBarcodeDecoder({ env: { BarcodeDetector: FakeDetector as never } });
    expect(await decoder!.decode({} as never)).toEqual([]);
  });

  it('a native detector that cannot read retail codes falls back to zxing', async () => {
    reset();
    FakeDetector.supported = ['qr_code'];
    const zx = fakeZxing();
    const decoder = await createBarcodeDecoder({
      env: { BarcodeDetector: FakeDetector as never, WebAssembly: {} },
      loadZxing: zx.load,
    });
    expect(decoder?.kind).toBe('zxing');
  });

  it('a native constructor that throws falls back to zxing', async () => {
    reset();
    FakeDetector.throwOnConstruct = true;
    const decoder = await createBarcodeDecoder({
      env: { BarcodeDetector: FakeDetector as never, WebAssembly: {} },
      loadZxing: fakeZxing().load,
    });
    expect(decoder?.kind).toBe('zxing');
  });
});

describe('self-hosted zxing-wasm', () => {
  it('is used when there is no BarcodeDetector; reads the retail formats; compiles the wasm up front', async () => {
    const zx = fakeZxing('4006381333931');
    const decoder = await createBarcodeDecoder({ env: { WebAssembly: {} }, loadZxing: zx.load });
    expect(decoder?.kind).toBe('zxing');
    expect(zx.prepare).toHaveBeenCalledTimes(1);
    expect(zx.prepare.mock.calls[0]?.[0]).toMatchObject({ fireImmediately: true });
    const blob = new Blob([new Uint8Array(4)]);
    expect(await decoder!.decode(blob)).toEqual(['4006381333931']);
    const opts = zx.readBarcodes.mock.calls[0]?.[1] as { formats: readonly string[] };
    expect(opts.formats).toEqual(ZXING_FORMATS);
    expect(ZXING_FORMATS).toEqual(['EAN13', 'EAN8', 'UPCA', 'UPCE']);
  });

  it('invalid or empty results are not codes', async () => {
    const readBarcodes = vi.fn(async () => [
      { text: '123', isValid: false },
      { text: '', isValid: true },
    ]);
    const decoder = await createBarcodeDecoder({
      env: { WebAssembly: {} },
      loadZxing: async () => ({ prepareZXingModule: async () => undefined, readBarcodes }),
    });
    expect(await decoder!.decode(new Blob([]))).toEqual([]);
  });

  it('a read that throws is an empty frame', async () => {
    const decoder = await createBarcodeDecoder({
      env: { WebAssembly: {} },
      loadZxing: async () => ({
        prepareZXingModule: async () => undefined,
        readBarcodes: async () => {
          throw new Error('wasm trap');
        },
      }),
    });
    expect(await decoder!.decode(new Blob([]))).toEqual([]);
  });

  it('prefer: zxing skips the native detector even when present', async () => {
    reset();
    const decoder = await createBarcodeDecoder({
      prefer: 'zxing',
      env: { BarcodeDetector: FakeDetector as never, WebAssembly: {} },
      loadZxing: fakeZxing().load,
    });
    expect(decoder?.kind).toBe('zxing');
    expect(FakeDetector.last).toBeUndefined();
  });

  it('the wasm is located beside the self-hosted reader, whatever the document base', () => {
    const locate = locateZxingFile(ZXING_READER_PATH, 'https://app.example/deep/route/');
    expect(locate('zxing_reader.wasm')).toBe('https://app.example/zxing/3.1.1/zxing_reader.wasm');
  });
});

describe('neither can start', () => {
  it('no BarcodeDetector and no WebAssembly -> null', async () => {
    expect(await createBarcodeDecoder({ env: {} })).toBeNull();
  });

  it('the reader script failing to load -> null (never a throw)', async () => {
    const decoder = await createBarcodeDecoder({
      env: { WebAssembly: {} },
      loadZxing: async () => {
        throw new Error('404');
      },
    });
    expect(decoder).toBeNull();
  });

  it('the wasm failing to compile -> null', async () => {
    const decoder = await createBarcodeDecoder({
      env: { WebAssembly: {} },
      loadZxing: async () => ({
        prepareZXingModule: async () => {
          throw new Error('CompileError');
        },
        readBarcodes: async () => [],
      }),
    });
    expect(decoder).toBeNull();
  });

  it('native-only preference with no native -> null', async () => {
    expect(await createBarcodeDecoder({ prefer: 'native', env: { WebAssembly: {} } })).toBeNull();
  });
});
