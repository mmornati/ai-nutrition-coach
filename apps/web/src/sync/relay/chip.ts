// What the header chip says about the device as a whole (AD-6), from the sync service's status.
// Honest by construction: `synced` needs the device to know what the server holds AND to have
// nothing the server has not acknowledged; a stopped sync never reads as synced; a copy from a newer
// app gets its own calm line instead of a state. Nothing here is red, and none of it nags.

import type { SyncOpStatusValue } from '@anc/core';
import type { SyncStatus } from './sync-service';

export interface HeaderChip {
  /** False: not connected to a server copy, so the chip only says "On this device". */
  readonly hasTransport: boolean;
  readonly status: SyncOpStatusValue | null;
  /** The server's copy comes from a newer app: say so, and nothing else. */
  readonly needsUpdate: boolean;
}

const LOCAL: HeaderChip = Object.freeze({ hasTransport: false, status: null, needsUpdate: false });

export function headerChipOf(status: SyncStatus): HeaderChip {
  if (!status.connected) return LOCAL;
  const chip = (state: SyncOpStatusValue): HeaderChip => ({
    hasTransport: true,
    status: state,
    needsUpdate: false,
  });
  switch (status.phase) {
    case 'needsUpdate':
      return { hasTransport: true, status: 'failed', needsUpdate: true };
    case 'rolledBack':
    case 'signedOut':
    case 'tooLarge':
    case 'paused':
      return chip('failed');
    case 'failed':
      return chip(status.dirty ? 'failed' : status.known ? 'synced' : 'pending');
    default:
      return chip(status.dirty || !status.known ? 'pending' : 'synced');
  }
}
