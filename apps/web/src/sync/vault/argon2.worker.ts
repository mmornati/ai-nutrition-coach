/// <reference lib="webworker" />
// The Argon2id worker (a dedicated module worker, one per derivation). It loads the pinned hash-wasm
// build from its versioned URL (scripts/fetch_web_argon2.sh wrote it; the UMD file defines
// `globalThis.hashwasm` when evaluated), derives the key, answers once and is terminated by its
// caller. The 64 MiB the derivation needs therefore never touches the page's main thread, and the
// wasm heap goes away with the worker.

import { argon2ScriptPath } from './argon2-pin';
import type { Argon2Request, Argon2Response } from './worker-protocol';

interface HashWasm {
  argon2id(options: {
    password: Uint8Array;
    salt: Uint8Array;
    iterations: number;
    memorySize: number;
    parallelism: number;
    hashLength: number;
    outputType: 'binary';
  }): Promise<Uint8Array>;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<Argon2Request>) => {
  const { password, salt, memoryKib, passes, parallelism, keyBytes } = event.data;
  void (async () => {
    let response: Argon2Response;
    try {
      // A runtime URL, deliberately not bundled: the one pinned file the fetch script wrote. The
      // worker builds it itself from its own origin and the pinned path, so nothing a message says
      // can make it load another script.
      const scriptUrl = new URL(argon2ScriptPath(import.meta.env.BASE_URL), self.location.origin);
      await import(/* @vite-ignore */ scriptUrl.href);
      const hashwasm = (globalThis as unknown as { hashwasm?: HashWasm }).hashwasm;
      if (!hashwasm) throw new Error('hash-wasm did not load');
      const derived = await hashwasm.argon2id({
        password,
        salt,
        iterations: passes,
        memorySize: memoryKib,
        parallelism,
        hashLength: keyBytes,
        outputType: 'binary',
      });
      // A copy that owns its buffer, so it can be transferred.
      response = { ok: true, key: new Uint8Array(derived) };
      derived.fill(0);
    } catch {
      response = { ok: false };
    } finally {
      password.fill(0);
    }
    scope.postMessage(response, response.ok ? [response.key.buffer] : []);
  })();
};
