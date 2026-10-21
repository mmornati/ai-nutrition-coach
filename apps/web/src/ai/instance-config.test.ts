import { describe, expect, it } from 'vitest';
import { INSTANCE_AI_OFF, InstanceAiSource, parseInstanceAiConfig } from './instance-config';
import { FakeFetch } from './testing';

const ON = { enabled: true, model: 'vendor/model-x', label: 'Acme AI' };

describe('parseInstanceAiConfig', () => {
  it('reads exactly the shape the container renders', () => {
    expect(parseInstanceAiConfig(ON)).toEqual(ON);
    // Extra fields are ignored, never carried (a key or an upstream address must not travel).
    expect(parseInstanceAiConfig({ ...ON, key: 'x', upstream: 'https://p.test' })).toEqual(ON);
  });

  it('anything else is "not offered"', () => {
    const bad: unknown[] = [
      null,
      undefined,
      'x',
      7,
      [],
      {},
      { enabled: false },
      { enabled: 'true', model: 'm', label: 'l' },
      { enabled: true },
      { enabled: true, model: '', label: 'l' },
      { enabled: true, model: 'm', label: '' },
      { enabled: true, model: 'm m', label: 'l' },
      { enabled: true, model: 'm"x', label: 'l' },
      { enabled: true, model: 'm', label: '<b>x</b>' },
      { enabled: true, model: 'a'.repeat(129), label: 'l' },
      { enabled: true, model: 'm', label: 'l'.repeat(61) },
      { enabled: true, model: 42, label: 'l' },
    ];
    for (const value of bad)
      expect(parseInstanceAiConfig(value), String(value)).toEqual(INSTANCE_AI_OFF);
  });
});

describe('InstanceAiSource', () => {
  const origin = () => 'https://plate.example.test';

  it('reads /ai/config.json once (GET, same origin, no credentials) and publishes the offer', async () => {
    const fake = new FakeFetch();
    fake.instanceConfig = ON;
    const source = new InstanceAiSource({ fetch: fake.fetch, origin });
    expect(source.getSnapshot().config).toEqual(INSTANCE_AI_OFF);
    expect(source.loaded).toBe(false);
    let notified = 0;
    source.subscribe(() => (notified += 1));

    await Promise.all([source.refresh(), source.refresh()]);

    expect(fake.configRequests).toHaveLength(1);
    const request = fake.configRequests[0];
    expect(request?.url).toBe('/ai/config.json');
    expect(request?.init.method).toBe('GET');
    expect(request?.init.credentials).toBe('omit');
    expect(request?.headers).not.toHaveProperty('authorization');
    expect(source.loaded).toBe(true);
    expect(notified).toBe(1);
    expect(source.getSnapshot()).toEqual({
      config: ON,
      host: 'plate.example.test',
      endpointUrl: 'https://plate.example.test/ai/v1',
    });
  });

  it('a second read of the same offer does not re-render, a changed one does', async () => {
    const fake = new FakeFetch();
    fake.instanceConfig = ON;
    const source = new InstanceAiSource({ fetch: fake.fetch, origin });
    let notified = 0;
    source.subscribe(() => (notified += 1));
    await source.refresh();
    await source.refresh();
    expect(notified).toBe(1);
    fake.instanceConfig = { ...ON, model: 'vendor/other' };
    await source.refresh();
    expect(notified).toBe(2);
    fake.instanceConfig = { enabled: false };
    await source.refresh();
    expect(source.getSnapshot().config).toEqual(INSTANCE_AI_OFF);
    expect(notified).toBe(3);
  });

  it('a missing file, an error page, a broken body, a huge body and a network failure are all "not offered"', async () => {
    for (const make of [
      (f: FakeFetch) => (f.configStatus = 404),
      (f: FakeFetch) => (f.configStatus = 500),
      (f: FakeFetch) => (f.instanceConfig = '<html>captive portal</html>'),
      (f: FakeFetch) => (f.instanceConfig = { enabled: true, model: 'm', label: 'x'.repeat(5000) }),
    ]) {
      const fake = new FakeFetch();
      fake.instanceConfig = ON;
      make(fake);
      const source = new InstanceAiSource({ fetch: fake.fetch, origin });
      await source.refresh();
      expect(source.getSnapshot().config).toEqual(INSTANCE_AI_OFF);
      expect(source.loaded).toBe(true);
    }
    const throwing = new InstanceAiSource({
      fetch: () => Promise.reject(new TypeError('offline')),
      origin,
    });
    await throwing.refresh();
    expect(throwing.getSnapshot().config).toEqual(INSTANCE_AI_OFF);
  });

  it('a failed read is retried by the next refresh and a lock cancels the request', async () => {
    const fake = new FakeFetch();
    fake.configStatus = 503;
    const source = new InstanceAiSource({ fetch: fake.fetch, origin });
    await source.refresh();
    expect(source.getSnapshot().config.enabled).toBe(false);
    fake.configStatus = 200;
    fake.instanceConfig = ON;
    await source.refresh();
    expect(source.getSnapshot().config.enabled).toBe(true);

    const aborted = new AbortController();
    aborted.abort();
    const locked = new InstanceAiSource({ fetch: fake.fetch, origin, signal: aborted.signal });
    await locked.refresh();
    expect(locked.getSnapshot().config.enabled).toBe(false);
  });

  it('is never printed with its contents', () => {
    expect(String(new InstanceAiSource({ origin }))).toBe('InstanceAiSource()');
  });
});
