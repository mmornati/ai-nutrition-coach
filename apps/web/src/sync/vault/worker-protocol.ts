// The messages between the page and the Argon2 worker. Secrets travel as transferred buffers, so
// the sender no longer holds them.

export interface Argon2Request {
  readonly password: Uint8Array;
  readonly salt: Uint8Array;
  readonly memoryKib: number;
  readonly passes: number;
  readonly parallelism: number;
  readonly keyBytes: number;
}

/** No detail on failure: nothing the worker saw may be echoed back. */
export type Argon2Response =
  { readonly ok: true; readonly key: Uint8Array } | { readonly ok: false };
