import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { AiProvider, useAiSettings, useYourAi } from './ai-context';
import { createAiServices } from './create-ai-services';
import {
  FakeFetch,
  MemoryKv,
  TEST_KEY,
  chatReply,
  stubClassify,
  stubDigest,
  stubSanitizer,
} from './testing';

async function harness() {
  const fake = new FakeFetch();
  fake.jsonBody = chatReply('pong');
  const services = await createAiServices({
    kv: new MemoryKv(),
    sanitizePhoto: stubSanitizer,
    classifyFoodGroup: stubClassify,
    photoDigest: stubDigest,
    fetch: fake.fetch,
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AiProvider services={services}>{children}</AiProvider>
  );
  return { services, wrapper };
}

const form = { endpointUrl: 'https://api.example.com/v1', model: 'vision-1' };

describe('useYourAi / useAiSettings', () => {
  it('saves, shows only the key ending, and publishes the new rung to every reader', async () => {
    const { wrapper } = await harness();
    const { result } = renderHook(() => ({ ai: useYourAi(), settings: useAiSettings() }), {
      wrapper,
    });
    expect(result.current.settings.rung.kind).toBe('noOp');
    let saved = false;
    await act(async () => {
      saved = await result.current.ai.save({ ...form, newKey: TEST_KEY });
    });
    expect(saved).toBe(true);
    expect(result.current.settings.rung.kind).toBe('byok');
    expect(result.current.ai.settings.rung.kind).toBe('byok');
    expect(result.current.ai.keyStatus).toEqual({ hasKey: true, keyEnding: 'abcd' });
    expect(result.current.ai.message).toEqual({ field: 'message', text: 'Saved.' });
    expect(JSON.stringify(result.current.ai.keyStatus)).not.toContain('sk-or');
  });

  it('puts an endpoint problem on the endpoint field and leaves the rung alone', async () => {
    const { wrapper } = await harness();
    const { result } = renderHook(() => useYourAi(), { wrapper });
    await act(async () => {
      await result.current.save({ ...form, endpointUrl: 'http://example.com', newKey: TEST_KEY });
    });
    expect(result.current.message?.field).toBe('endpoint');
    expect(result.current.settings.rung.kind).toBe('noOp');
  });

  it('tests the connection with the typed key and shows calm copy', async () => {
    const { wrapper } = await harness();
    const { result } = renderHook(() => useYourAi(), { wrapper });
    await act(async () => {
      await result.current.test({ ...form, typedKey: TEST_KEY });
    });
    expect(result.current.message?.text).toBe('Connected — the endpoint, model and key work.');
    expect(result.current.testing).toBe(false);
  });

  it('loads the key status on mount, removes the key and flips back', async () => {
    const { wrapper, services } = await harness();
    await services.yourAi.saveByok({ ...form, newKey: TEST_KEY });
    const { result } = renderHook(() => useYourAi(), { wrapper });
    await waitFor(() => expect(result.current.keyStatus.hasKey).toBe(true));
    await act(async () => {
      await result.current.removeKey();
    });
    expect(result.current.keyStatus).toEqual({ hasKey: false, keyEnding: null });
    expect(result.current.settings.rung.kind).toBe('noOp');
  });

  it('consent list and the ask-every-photo switch go through the controller', async () => {
    const { wrapper, services } = await harness();
    await services.settings.grantPhotoConsent('api.example.com');
    const { result } = renderHook(() => useYourAi(), { wrapper });
    expect([...result.current.settings.photoConsentHosts]).toEqual(['api.example.com']);
    await act(async () => {
      await result.current.revokeConsent('api.example.com');
      await result.current.setAskBeforeEveryPhoto(false);
    });
    expect(result.current.settings.photoConsentHosts.size).toBe(0);
    expect(result.current.settings.askBeforeEveryPhoto).toBe(false);
  });

  it('needs a provider', () => {
    expect(() => renderHook(() => useAiSettings())).toThrow('AiProvider');
  });
});
