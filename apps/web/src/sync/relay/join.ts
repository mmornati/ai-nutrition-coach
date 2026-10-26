// Joining a vault that already exists from a device that has data of its own (plan §3.6, Case B).
// Everything here is a DRY RUN until `joinServerCopy`: the merge is computed with the same pure
// function the stores use, the person sees the counts, and only then is anything written.
//
// Most "conflicts" are not questions: plates and what is on them are a union and a deletion wins;
// templates and settings are last-writer-wins. One thing the merge cannot know is which PROFILE the
// person means when the two sides differ in content (profiles written before schema v4 carry a
// legacy stamp, so last-writer-wins would pick by device id, i.e. at random). That is asked once.

import {
  AGE_BANDS,
  canonicalizeSnapshot,
  mergeVaultSnapshots,
  MAX_DRIFT_MS,
  sanitizeProfile,
  snapshotBeyond,
  type Profile,
  type VaultSnapshot,
  type VaultStore,
  type VaultFailureReason,
} from '@anc/core';
import { KV_KEYS, type KeyValueStore } from '../../storage/key-value-store';
import { writeConnection, type RelayConnection } from './connection';
import { writeHeld } from './ledger';
import type { OpenedServerCopy } from './server-copy';
import { encodeBase64Url } from '@anc/core';

export interface PlateSummary {
  readonly count: number;
  /** Epoch ms of the earliest and the latest plate; null when there is none. */
  readonly first: number | null;
  readonly last: number | null;
}

export function summarisePlates(snapshot: VaultSnapshot): PlateSummary {
  let first: number | null = null;
  let last: number | null = null;
  for (const plate of snapshot.plates) {
    const at = Date.parse(plate.loggedAtUtc);
    if (!Number.isFinite(at)) continue;
    if (first === null || at < first) first = at;
    if (last === null || at > last) last = at;
  }
  return { count: snapshot.plates.length, first, last };
}

export const PROFILE_FIELDS = ['ageBand', 'sex', 'activity', 'goal', 'diet', 'allergies'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export interface ProfileDifference {
  readonly field: ProfileField;
  /** The value on this device, as text (`null`: not set). Allergies are joined with ", ". */
  readonly device: string | null;
  readonly server: string | null;
}

const fieldText = (profile: Profile | undefined, field: ProfileField): string | null => {
  const value = profile?.[field];
  if (value === undefined) return null;
  return Array.isArray(value) ? value.join(', ') : String(value);
};

const profileOf = (
  snapshot: VaultSnapshot,
): { raw: string; profile: Profile | undefined } | null => {
  const entry = snapshot.kv.find((e) => e.key === KV_KEYS.profile);
  if (entry === undefined) return null;
  try {
    return { raw: entry.value, profile: sanitizeProfile(JSON.parse(entry.value)) };
  } catch {
    return { raw: entry.value, profile: undefined };
  }
};

/**
 * The profile fields that differ by CONTENT, or `null` when there is nothing to ask: one side has
 * no profile (the other simply wins), or both say the same.
 */
export function profileDifferences(
  device: VaultSnapshot,
  server: VaultSnapshot,
): readonly ProfileDifference[] | null {
  const a = profileOf(device);
  const b = profileOf(server);
  if (a === null || b === null) return null;
  const diffs = PROFILE_FIELDS.flatMap((field): ProfileDifference[] => {
    const left = fieldText(a.profile, field);
    const right = fieldText(b.profile, field);
    return left === right ? [] : [{ field, device: left, server: right }];
  });
  return diffs.length > 0 ? diffs : null;
}

export interface JoinPreview {
  readonly server: PlateSummary;
  readonly device: PlateSummary;
  /** Plates of this device that the server copy already has. */
  readonly alreadyOnServer: number;
  /** Plates only on this device (what "Start fresh" would remove from it). */
  readonly onlyOnDevice: number;
  readonly combined: number;
  readonly profile: readonly ProfileDifference[] | null;
}

export type JoinPreviewResult =
  | { readonly kind: 'preview'; readonly preview: JoinPreview }
  | { readonly kind: 'refused'; readonly reason: 'schemaTooNew' | 'invalid' | 'clockAhead' };

export function previewJoin(
  device: VaultSnapshot,
  server: VaultSnapshot,
  now: number,
): JoinPreviewResult {
  if (snapshotBeyond(server, now + MAX_DRIFT_MS)) return { kind: 'refused', reason: 'clockAhead' };
  const merged = mergeVaultSnapshots(device, server);
  if (merged.kind === 'vaultMergeRefused') {
    return {
      kind: 'refused',
      reason: merged.reason === 'remoteSchemaNewer' ? 'schemaTooNew' : 'invalid',
    };
  }
  const onServer = new Set(server.plates.map((p) => p.uid));
  const alreadyOnServer = device.plates.filter((p) => onServer.has(p.uid)).length;
  return {
    kind: 'preview',
    preview: {
      server: summarisePlates(server),
      device: summarisePlates(device),
      alreadyOnServer,
      onlyOnDevice: device.plates.length - alreadyOnServer,
      combined: merged.snapshot.plates.length,
      profile: profileDifferences(device, server),
    },
  };
}

export type JoinChoice =
  /** Keep the profile from this device / from the server. Only asked when they differ. */
  { readonly profile: 'device' | 'server' | null };

export type JoinResult =
  | { readonly kind: 'joined'; readonly connection: RelayConnection; readonly dirty: boolean }
  | { readonly kind: 'failed'; readonly reason: VaultFailureReason | 'storeProblem' | 'invalid' };

/**
 * Combines: applies the server copy to the local store (the same merge as the preview), writes the
 * chosen profile (re-stamped with a fresh clock tick, after the apply, so it wins everywhere), and stores the
 * connection. Returns the connection and whether this device now has something the server lacks.
 * Nothing is deleted from either side.
 */
export async function joinServerCopy(deps: {
  readonly vault: VaultStore;
  readonly kv: KeyValueStore;
  readonly copy: OpenedServerCopy;
  readonly choice: JoinChoice;
}): Promise<JoinResult> {
  const { vault, kv, copy } = deps;
  try {
    const before = await vault.readSnapshot();
    if (before.kind === 'vaultFailed') return { kind: 'failed', reason: before.reason };
    const merged = mergeVaultSnapshots(before.value, copy.snapshot);
    if (merged.kind === 'vaultMergeRefused') return { kind: 'failed', reason: 'invalid' };

    // The server copy goes in FIRST: applying it makes this device's clock observe the other
    // device's newest stamps. A profile written before that would be stamped by a clock that may
    // be behind, and the server's profile would win by last-writer-wins.
    const applied = await vault.applySnapshot(copy.snapshot);
    if (applied.kind === 'vaultFailed') return { kind: 'failed', reason: applied.reason };

    // The profile the person picked is written again as a fresh write: a new stamp that beats both.
    const pick = deps.choice.profile;
    if (pick !== null && profileDifferences(before.value, copy.snapshot) !== null) {
      const source = pick === 'device' ? profileOf(before.value) : profileOf(copy.snapshot);
      if (source !== null) await kv.write(KV_KEYS.profile, source.raw);
    }

    // Does the final state hold anything the server copy does not?
    const after = await vault.readSnapshot();
    if (after.kind === 'vaultFailed') return { kind: 'failed', reason: after.reason };
    const dirty =
      JSON.stringify(canonicalizeSnapshot(after.value)) !==
      JSON.stringify(canonicalizeSnapshot(copy.snapshot));
    const connection: RelayConnection = {
      handle: copy.handle,
      token: copy.token,
      vaultKey: encodeBase64Url(copy.vaultKey),
      vaultId: copy.vaultId,
      lastSeenVersion: copy.version,
    };
    await writeConnection(kv, connection, dirty);
    // The server holds its own copy as it was fetched; what was merged in from this device waits.
    await writeHeld(kv, copy.snapshot);
    return { kind: 'joined', connection, dirty };
  } catch {
    return { kind: 'failed', reason: 'storeProblem' };
  }
}

/** For the profile prompt's labels. */
export const PROFILE_AGE_BANDS = AGE_BANDS;
