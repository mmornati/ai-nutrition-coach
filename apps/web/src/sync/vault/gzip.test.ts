import { describe, expect, it } from 'vitest';
import { gunzip, gunzipStream, gzip, INPUT_SLICE_BYTES } from './gzip';

describe('gzip', () => {
  it('round-trips, and compresses repetition', async () => {
    const data = new TextEncoder().encode('plate '.repeat(5_000));
    const packed = await gzip(data);
    expect(packed.length).toBeLessThan(data.length / 10);
    const result = await gunzip(packed, data.length);
    expect(result.kind).toBe('inflated');
    // Compared as text: the array may come from another realm than the test's.
    expect(result.kind === 'inflated' && new TextDecoder().decode(result.bytes)).toBe(
      'plate '.repeat(5_000),
    );
  });

  it('round-trips nothing', async () => {
    const result = await gunzip(await gzip(new Uint8Array(0)), 10);
    expect(result.kind === 'inflated' && result.bytes.length).toBe(0);
  });

  it('stops at the cap: exactly the cap passes, one byte more is "tooLarge"', async () => {
    const data = new Uint8Array(100_000);
    const packed = await gzip(data);
    expect((await gunzip(packed, 100_000)).kind).toBe('inflated');
    expect(await gunzip(packed, 99_999)).toEqual({ kind: 'tooLarge' });
    // A bomb: megabytes out of a few hundred bytes in, refused at a small cap without being built.
    const bomb = await gzip(new Uint8Array(8_000_000));
    expect(bomb.length).toBeLessThan(20_000);
    expect(await gunzip(bomb, 1_000)).toEqual({ kind: 'tooLarge' });
  });

  it('not gzip, or truncated, is "corrupt"', async () => {
    expect(await gunzip(Uint8Array.of(1, 2, 3, 4, 5), 100)).toEqual({ kind: 'corrupt' });
    const packed = await gzip(new TextEncoder().encode('hello hello hello hello'));
    expect(await gunzip(packed.slice(0, packed.length - 6), 100)).toEqual({ kind: 'corrupt' });
    expect(await gunzip(new Uint8Array(0), 100)).toEqual({ kind: 'corrupt' });
  });

  it('streams: a bomb of about a gibibyte is cut off after a bounded amount of input', async () => {
    // Build roughly 1 GiB of zeros' worth of gzip without ever holding the zeros: a pull-based
    // source of zero chunks through the compressor, keeping only the (small) output.
    const chunk = new Uint8Array(1024 * 1024);
    let made = 0;
    const zeros = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull(controller) {
          if (made >= 1024) controller.close();
          else {
            controller.enqueue(chunk);
            made += 1;
          }
        },
      },
      { highWaterMark: 0 },
    );
    const parts: Uint8Array[] = [];
    const packed = zeros.pipeThrough(new CompressionStream('gzip'));
    for (const reader = packed.getReader(); ;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
    const bomb = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const part of parts) {
      bomb.set(part, at);
      at += part.length;
    }
    expect(bomb.length).toBeGreaterThan(INPUT_SLICE_BYTES * 8);

    // The same bytes, fed in slices as they are asked for; count what is asked.
    let pulled = 0;
    let offset = 0;
    const source = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull(controller) {
          if (offset >= bomb.length) return controller.close();
          const end = Math.min(offset + INPUT_SLICE_BYTES, bomb.length);
          controller.enqueue(bomb.subarray(offset, end) as Uint8Array<ArrayBuffer>);
          pulled += end - offset;
          offset = end;
        },
      },
      { highWaterMark: 0 },
    );
    const cap = 1024 * 1024;
    expect(await gunzipStream(source, cap)).toEqual({ kind: 'tooLarge' });
    // A megabyte of output needs about a kilobyte of input: a handful of slices, not the file.
    expect(pulled).toBeLessThanOrEqual(INPUT_SLICE_BYTES * 4);
    expect(pulled).toBeLessThan(bomb.length / 4);
  }, 120_000);
});
