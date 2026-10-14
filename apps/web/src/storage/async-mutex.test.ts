import { describe, expect, it } from 'vitest';
import { AsyncMutex } from './async-mutex';

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('AsyncMutex', () => {
  it('runs actions one at a time, in FIFO order', async () => {
    const mutex = new AsyncMutex();
    const log: string[] = [];
    const run = (name: string, ms: number) =>
      mutex.synchronized(async () => {
        log.push(`${name}:start`);
        await tick(ms);
        log.push(`${name}:end`);
      });
    await Promise.all([run('a', 30), run('b', 5), run('c', 1)]);
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
  });

  it('makes a read-modify-write sequence safe: no lost update', async () => {
    const mutex = new AsyncMutex();
    let value = 0;
    const increment = () =>
      mutex.synchronized(async () => {
        const read = value;
        await tick(2);
        value = read + 1;
      });
    await Promise.all(Array.from({ length: 10 }, increment));
    expect(value).toBe(10);
  });

  it('returns the result, and a failure rejects the caller without blocking the queue', async () => {
    const mutex = new AsyncMutex();
    const failing = mutex.synchronized(() => Promise.reject(new Error('boom')));
    const next = mutex.synchronized(() => Promise.resolve('ok'));
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});
