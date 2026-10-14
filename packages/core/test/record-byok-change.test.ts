import { beforeEach, describe, expect, it } from 'vitest';
import {
  aiRungConfigEquals,
  createRecordByokChange,
  type AiRungConfig,
  type AiRungConfigStorePort,
  type ByokKeyStorePort,
  type RecordByokChange,
} from '../src/index';

class FakeKeyStore implements ByokKeyStorePort {
  key: string | null = null;
  writeCount = 0;
  read = () => Promise.resolve(this.key);
  write = (k: string) => {
    this.writeCount++;
    this.key = k;
    return Promise.resolve();
  };
  clear = () => {
    this.key = null;
    return Promise.resolve();
  };
  hasKey = () => Promise.resolve(this.key !== null && this.key !== '');
}

class FakeConfigStore implements AiRungConfigStorePort {
  writeCount = 0;
  constructor(public config: AiRungConfig) {}
  read = () => Promise.resolve(this.config);
  write = (c: AiRungConfig) => {
    this.writeCount++;
    this.config = c;
    return Promise.resolve();
  };
}

describe('RecordByokChange (FR7 / AD-3)', () => {
  let keyStore: FakeKeyStore;
  let configStore: FakeConfigStore;
  let useCase: RecordByokChange;

  beforeEach(() => {
    keyStore = new FakeKeyStore();
    configStore = new FakeConfigStore({ kind: 'hostedQuota' });
    useCase = createRecordByokChange({ keyStore, configStore });
  });

  it('enterByok writes the key AND updates the config in one commit', async () => {
    const newConfig = await useCase.enterByok({
      apiKey: 'sk-test-1234',
      previousKind: 'hostedQuota',
    });
    expect(keyStore.writeCount).toBe(1);
    expect(await keyStore.read()).toBe('sk-test-1234');
    expect(newConfig.kind).toBe('byok');
    expect(newConfig.previousRung?.previousKind).toBe('hostedQuota');
    expect(configStore.writeCount).toBe(1);
    expect(aiRungConfigEquals(await configStore.read(), newConfig)).toBe(true);
  });

  it('removeByok clears the key AND flips back to the recorded previous rung (not always noOp)', async () => {
    await useCase.enterByok({ apiKey: 'sk-test-1234', previousKind: 'hostedQuota' });
    const newConfig = await useCase.removeByok();
    expect(await keyStore.hasKey()).toBe(false);
    expect(newConfig.kind).toBe('hostedQuota');
    expect(newConfig.previousRung).toBeUndefined();
  });

  it('removeByok restores any previous rung exactly, including local', async () => {
    await useCase.enterByok({ apiKey: 'k', previousKind: 'local' });
    expect((await useCase.removeByok()).kind).toBe('local');
  });

  it('removeByok defaults to noOp when no previous rung is recorded (defensive)', async () => {
    configStore = new FakeConfigStore({ kind: 'noOp' });
    useCase = createRecordByokChange({ keyStore, configStore });
    await keyStore.write('sk-test-1234');
    await configStore.write({ kind: 'byok' });
    expect((await useCase.removeByok()).kind).toBe('noOp');
  });

  it('the config never contains the key (FR7 / NFR4)', async () => {
    const newConfig = await useCase.enterByok({
      apiKey: 'sk-secret-must-not-leak',
      previousKind: 'hostedQuota',
    });
    expect(JSON.stringify(newConfig)).not.toContain('secret');
  });
});
