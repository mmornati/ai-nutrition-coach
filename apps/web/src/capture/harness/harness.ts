// DEV / E2E ONLY. The page behind `capture-harness.html`: it wires the REAL capture code (the
// zxing-wasm decoder served from /zxing/<version>/, the camera request, the scan controller, the
// offline-first catalog and the Open Food Facts source) and exposes it on `window.__captureHarness`
// for Playwright (e2e/capture.spec.ts).
//
// It is a build input only when VITE_STORAGE_HARNESS=1 (the e2e server, which also builds the
// storage harness). A release build has no such page and no such code:
// tools/check_no_dev_store_in_build.sh fails `pnpm verify` otherwise.
import { createBarcodeDecoder, type DecoderKind } from '../../barcode/decoder';
import { createCameraRequest } from '../../barcode/camera';
import { ean13Modules, lumaToRgba, renderEan13Luma } from '../../barcode/ean13-fixture';
import { ScannerController, type ScannerState } from '../../barcode/scanner-controller';
import { OfflineFirstFoodCatalog } from '../../catalog/offline-first-catalog';
import { PrivacyPrefs, offLookupGate, type OffLookupChoice } from '../../catalog/privacy-prefs';
import type { KeyValueStore } from '../../storage/key-value-store';

class MemoryKv implements KeyValueStore {
  private readonly map = new Map<string, string>();
  async read(key: string) {
    return this.map.get(key) ?? null;
  }
  async write(key: string, value: string) {
    this.map.set(key, value);
  }
  async delete(key: string) {
    this.map.delete(key);
  }
}

function catalogFor(choice: OffLookupChoice) {
  const prefs = new PrivacyPrefs(new MemoryKv());
  return { prefs, ready: prefs.setOffLookupChoice(choice), gate: offLookupGate(prefs) };
}

export interface DecodeReport {
  readonly decoder: DecoderKind | null;
  readonly codes: string[];
}

export interface ScanReport {
  readonly decoder: DecoderKind | null;
  readonly state: ScannerState;
}

const harness = {
  /** Decode a rendered EAN-13 still with the chosen decoder. */
  async decodeStill(prefer: DecoderKind, code: string): Promise<DecodeReport> {
    const decoder = await createBarcodeDecoder({ prefer });
    if (decoder === null) return { decoder: null, codes: [] };
    const width = 640;
    const height = 480;
    const luma = renderEan13Luma(code, { width, height, moduleWidth: 4 });
    const image = new ImageData(lumaToRgba(luma) as Uint8ClampedArray<ArrayBuffer>, width, height);
    const codes = await decoder.decode(image);
    decoder.dispose();
    return { decoder: decoder.kind, codes };
  },

  /** The real camera (Chromium's fake device) -> decoder -> scan flow -> catalog -> OFF. */
  async scanCamera(
    prefer: DecoderKind,
    choice: OffLookupChoice,
    timeoutMs = 20_000,
  ): Promise<ScanReport> {
    const video = document.getElementById('preview') as HTMLVideoElement;
    const { prefs, ready, gate } = catalogFor(choice);
    await ready;
    const catalog = new OfflineFirstFoodCatalog({ onlineLookupAllowed: gate });
    let kind: DecoderKind | null = null;
    let resolve: (s: ScannerState) => void = () => undefined;
    const done = new Promise<ScannerState>((r) => (resolve = r));
    const controller = new ScannerController({
      catalog,
      prefs,
      askOffNotice: async () => 'allowed',
      createDecoder: async () => {
        const d = await createBarcodeDecoder({ prefer });
        kind = d?.kind ?? null;
        return d;
      },
      requestCamera: createCameraRequest(),
      surface: {
        async attach(stream) {
          video.srcObject = stream;
          await video.play();
        },
        detach() {
          video.srcObject = null;
        },
        frame() {
          return video.readyState >= 2 && video.videoWidth > 0 ? video : null;
        },
      },
      intervalMs: 100,
      onChange: (s) => {
        if (s.kind !== 'scanning' || ['match', 'notFound', 'failure'].includes(s.lookup.kind))
          resolve(s);
      },
    });
    await controller.start();
    const timeout = new Promise<ScannerState>((r) =>
      setTimeout(() => r(controller.state), timeoutMs),
    );
    const state = await Promise.race([done, timeout]);
    controller.dispose();
    return { decoder: kind, state };
  },

  /** Ask the real catalog (and so the real OFF source) for a barcode under a stored choice. */
  async lookup(barcode: string, choice: OffLookupChoice) {
    const { ready, gate } = catalogFor(choice);
    await ready;
    return new OfflineFirstFoodCatalog({ onlineLookupAllowed: gate }).lookupByBarcode(barcode);
  },

  modules: ean13Modules,
};

declare global {
  interface Window {
    __captureHarness: typeof harness;
  }
}

window.__captureHarness = harness;
document.documentElement.dataset['harness'] = 'ready';
