// gzip through the platform streams (CompressionStream / DecompressionStream), with a hard cap on
// what comes OUT of the decompressor: a gzip bomb is a few kilobytes that inflate to gigabytes, so
// the output is counted as it streams and the stream is cancelled the moment it passes the cap.

/** The size of the slices the input is fed in: small, so an abort is noticed within one. */
export const INPUT_SLICE_BYTES = 32 * 1024;

/**
 * The bytes as a pull-based stream of small slices with no read-ahead (highWaterMark 0): a slice
 * is produced only when the consumer asks for one, so stopping early stops the input too.
 */
export function sliceStream(bytes: Uint8Array): ReadableStream<Uint8Array<ArrayBuffer>> {
  let at = 0;
  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      pull(controller) {
        if (at >= bytes.length) {
          controller.close();
          return;
        }
        const end = Math.min(at + INPUT_SLICE_BYTES, bytes.length);
        controller.enqueue(bytes.subarray(at, end) as Uint8Array<ArrayBuffer>);
        at = end;
      },
    },
    { highWaterMark: 0 },
  );
}

/** Everything the stream yields, or `null` as soon as it yields more than `max` bytes. */
async function collect(
  stream: ReadableStream<Uint8Array>,
  max: number,
): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const out = await collect(
    sliceStream(bytes).pipeThrough(new CompressionStream('gzip')),
    Number.POSITIVE_INFINITY,
  );
  return out as Uint8Array;
}

export type GunzipResult =
  | { readonly kind: 'inflated'; readonly bytes: Uint8Array }
  /** More than `max` bytes came out: stopped, nothing kept. */
  | { readonly kind: 'tooLarge' }
  /** Not gzip, truncated or damaged. */
  | { readonly kind: 'corrupt' };

/**
 * Inflates a stream, stopping (and cancelling the source) once more than `max` bytes came out.
 *
 * The input is fed by hand, one slice per write that has been accepted, instead of piped: a pipe
 * can run ahead of the reader and swallow a whole file before the first output byte is looked at,
 * while here at most a slice or two is ever in flight when the cap is passed. Deflate expands by
 * about 1000 at most, so one slice can produce some tens of megabytes; the cap is checked on every
 * chunk that comes out.
 */
export async function gunzipStream(
  source: ReadableStream<Uint8Array<ArrayBuffer>>,
  max: number,
): Promise<GunzipResult> {
  const inflate = new DecompressionStream('gzip');
  const writer = inflate.writable.getWriter();
  const output = inflate.readable.getReader();
  const input = source.getReader();
  let stopped = false;
  const feed = (async () => {
    try {
      while (!stopped) {
        const { done, value } = await input.read();
        if (done) {
          await writer.close();
          return;
        }
        await writer.write(value);
      }
    } catch {
      // The reading side reports a damaged stream; nothing more to feed.
    }
  })();
  const stop = async (): Promise<void> => {
    stopped = true;
    await Promise.allSettled([output.cancel(), writer.abort(), input.cancel()]);
    await feed;
  };
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await output.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        await stop();
        return { kind: 'tooLarge' };
      }
      chunks.push(value);
    }
  } catch {
    await stop();
    return { kind: 'corrupt' };
  }
  await feed;
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return { kind: 'inflated', bytes };
}

export const gunzip = (bytes: Uint8Array, max: number): Promise<GunzipResult> =>
  gunzipStream(sliceStream(bytes), max);
