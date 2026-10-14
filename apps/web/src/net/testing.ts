/** A scriptable `fetch` for tests: records requests, replies canned or streams. Test-only. */
import type { FetchLike } from './capped-fetch';

export interface RecordedRequest {
  readonly url: string;
  readonly init: RequestInit;
}

export class FakeFetch {
  readonly requests: RecordedRequest[] = [];
  status = 200;
  responseHeaders: Record<string, string> = { 'content-type': 'application/json' };
  jsonBody: unknown = {};
  /** Replaces the JSON body: a (possibly endless) chunk generator. */
  chunks: (() => Uint8Array) | undefined;
  /** Throw this instead of answering (a transport error). */
  error: Error | undefined;
  /** Never answer until the request is aborted. */
  hang = false;
  /** Answer the headers, then never send the body until aborted. */
  stallBody = false;
  chunksEmitted = 0;
  aborted = 0;

  get last(): RecordedRequest {
    const r = this.requests.at(-1);
    if (!r) throw new Error('no request was made');
    return r;
  }

  readonly fetch: FetchLike = (url, init = {}) => {
    this.requests.push({ url, init });
    const signal = init.signal ?? undefined;
    const onAbort = (): void => {
      this.aborted++;
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    if (this.error) return Promise.reject(this.error);
    if (this.hang) {
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }
    const headers = new Headers(this.responseHeaders);
    if (this.chunks || this.stallBody) {
      const next = this.chunks;
      const stream = new ReadableStream<Uint8Array>({
        pull: async (controller) => {
          if (signal?.aborted) {
            controller.error(new DOMException('aborted', 'AbortError'));
            return;
          }
          if (this.stallBody || !next) {
            await new Promise<void>((resolve) => {
              signal?.addEventListener('abort', () => resolve());
            });
            controller.error(new DOMException('aborted', 'AbortError'));
            return;
          }
          this.chunksEmitted++;
          controller.enqueue(next());
          await new Promise((resolve) => setTimeout(resolve, 0));
        },
      });
      return Promise.resolve(new Response(stream, { status: this.status, headers }));
    }
    const text = typeof this.jsonBody === 'string' ? this.jsonBody : JSON.stringify(this.jsonBody);
    return Promise.resolve(new Response(text, { status: this.status, headers }));
  };
}
