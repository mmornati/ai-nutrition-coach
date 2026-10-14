// The message protocol between the main thread and the store worker. Everything is plain,
// structured-cloneable data; failures carry a `WireError` (a reason or a numeric SQLite code),
// never message text.

import type { WireError } from '../errors';
import type { KdfParams } from '../kdf';
import type { StoreOpName } from '../ops';

export type WorkerRequest =
  | {
      readonly id: number;
      readonly type: 'open';
      /** Directory URL (trailing slash) the versioned engine is served from. */
      readonly engineUrl: string;
      readonly passphrase: Uint8Array;
      readonly salt: Uint8Array;
      readonly kdf: KdfParams;
      readonly expectExisting: boolean;
    }
  | {
      readonly id: number;
      readonly type: 'call';
      readonly op: StoreOpName;
      readonly args: readonly unknown[];
    }
  | { readonly id: number; readonly type: 'close' };

export type WorkerResponse =
  | { readonly id: number; readonly ok: true; readonly result?: unknown }
  | { readonly id: number; readonly ok: false; readonly error: WireError };
