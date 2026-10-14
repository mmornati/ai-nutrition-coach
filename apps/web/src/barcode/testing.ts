/** Fakes for the barcode tests. Test-only. */
import type { FoodCatalog, CatalogResult } from '@anc/core';
import { notFound } from '@anc/core';
import type { CameraResult } from './camera';
import type { BarcodeDecoder, DecodeInput } from './decoder';
import type { Scheduler, VideoSurface } from './scanner-controller';

/** A decoder you push codes into; `decode` returns the next queued code once per frame. */
export class FakeDecoder implements BarcodeDecoder {
  readonly kind = 'native' as const;
  readonly queue: string[] = [];
  disposed = false;
  frames = 0;
  emit(code: string): void {
    this.queue.push(code);
  }
  async decode(): Promise<string[]> {
    this.frames++;
    const next = this.queue.shift();
    return next === undefined ? [] : [next];
  }
  dispose(): void {
    this.disposed = true;
  }
}

export class FakeStream {
  stopped = 0;
  readonly tracks = [{ stop: () => void this.stopped++ }];
  getTracks(): { stop(): void }[] {
    return this.tracks;
  }
}

export const fakeStream = (): { stream: MediaStream; raw: FakeStream } => {
  const raw = new FakeStream();
  return { stream: raw as unknown as MediaStream, raw };
};

export class FakeSurface implements VideoSurface {
  attached = 0;
  detached = 0;
  ready = true;
  failAttach = false;
  async attach(): Promise<void> {
    this.attached++;
    if (this.failAttach) throw new Error('autoplay blocked');
  }
  detach(): void {
    this.detached++;
  }
  frame(): DecodeInput | null {
    return this.ready ? ({} as DecodeInput) : null;
  }
}

/** A manual clock: `run()` fires the single pending timer. */
export class ManualScheduler implements Scheduler {
  private fn: (() => void) | undefined;
  setTimeout(fn: () => void): unknown {
    this.fn = fn;
    return 1;
  }
  clearTimeout(): void {
    this.fn = undefined;
  }
  get pending(): boolean {
    return this.fn !== undefined;
  }
  async run(): Promise<void> {
    const fn = this.fn;
    this.fn = undefined;
    fn?.();
    // let the async tick settle
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }
}

export class FakeCatalog implements FoodCatalog {
  readonly calls: string[] = [];
  constructor(private readonly byCode: Record<string, CatalogResult | (() => never)> = {}) {}
  async search(query: string): Promise<CatalogResult> {
    return notFound(query);
  }
  async lookupBySourceRef(): Promise<null> {
    return null;
  }
  async lookupByBarcode(code: string): Promise<CatalogResult> {
    this.calls.push(code);
    const r = this.byCode[code];
    if (typeof r === 'function') return r();
    return r ?? notFound(code);
  }
}

export const granted = (): CameraResult & { raw: FakeStream } => {
  const { stream, raw } = fakeStream();
  return { kind: 'granted', stream, raw };
};
