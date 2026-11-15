// The operator's tool, run against the data directory and never over HTTP:
//
//   docker compose exec sync-relay node /app/relay.mjs admin <command>
//
// It reads and changes the same SQLite file the relay serves. It can say how big a copy is, when it
// was last used and how many devices it has, but nothing from inside one (the relay holds only
// ciphertext). It never deletes anything unless told to (`--yes`); `prune` is a dry run by default
// and no vault ever expires by itself.

import { randomBytes } from 'node:crypto';
import { INVITE_PATTERN } from '@anc/core';
import type { ServerKeys } from './keys';
import type { InviteRow, RelayStore, VaultSummary } from './store';

export interface AdminIo {
  readonly store: RelayStore;
  readonly keys: ServerKeys;
  readonly now: () => number;
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
  /** For tests: the random bytes an invite is made of. */
  readonly random?: (length: number) => Uint8Array;
}

export const ADMIN_USAGE = `usage: node /app/relay.mjs admin <command> [--json]

  list                              the vaults: handle, size, versions, created, last update, devices, recovery key
  stats                             totals
  invites create [--label TEXT] [--count N]   single-use invite codes (printed once, stored hashed)
  invites list                      the invites made here and whether each was used (by which handle)
  invites revoke <id>               an unused invite stops working
  delete <handle> --yes             removes one vault, its envelopes and its devices (cannot be undone)
  prune --idle-days N [--yes]       lists the vaults idle for N days or more; --yes deletes them

Without --yes nothing is deleted. Output is plain text; --json makes it machine-readable.`;

const DAY = 86_400_000;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 20 characters of Crockford base32 (100 bits) in four groups: `K3F9T-0QMZ8-...`. */
export function newInviteCode(random: (n: number) => Uint8Array = randomBytes): string {
  const bytes = random(20);
  let text = '';
  for (let i = 0; i < 20; i++) text += ALPHABET[(bytes[i] ?? 0) & 31];
  return text.match(/.{5}/g)!.join('-');
}

const iso = (ms: number | null): string =>
  ms === null ? '-' : new Date(ms).toISOString().slice(0, 16) + 'Z';
const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;

function parseArgs(args: readonly string[]): {
  words: string[];
  flags: Map<string, string | true>;
  error: string | null;
} {
  const words: string[] = [];
  const flags = new Map<string, string | true>();
  let error: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? '';
    if (!a.startsWith('--')) {
      words.push(a);
      continue;
    }
    const name = a.slice(2);
    const next = args[i + 1];
    if (['label', 'count', 'idle-days'].includes(name)) {
      // A value flag takes the next word as its value; another flag there is a mistake (`--label --yes`
      // must not make "--yes" a label and silently drop the confirmation).
      if (next === undefined || next.startsWith('--')) {
        error ??= `--${name} needs a value`;
      } else {
        flags.set(name, next);
        i++;
      }
    } else {
      flags.set(name, true);
    }
  }
  return { words, flags, error };
}

const summaryJson = (v: VaultSummary) => ({
  handle: v.handle,
  sizeBytes: v.size,
  version: v.version,
  createdAt: new Date(v.createdAt).toISOString(),
  updatedAt: new Date(v.updatedAt).toISOString(),
  lastSeenAt: v.lastSeenAt === null ? null : new Date(v.lastSeenAt).toISOString(),
  devices: v.devices,
  hasRecoveryKey: v.hasRecovery,
});

function table(rows: readonly string[][]): string {
  const widths = rows[0]?.map((_, c) => Math.max(...rows.map((r) => (r[c] ?? '').length))) ?? [];
  return rows
    .map((r) =>
      r
        .map((cell, c) => cell.padEnd(widths[c] ?? 0))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

/** Runs one command; returns the process exit code (0 ok, 1 refused or failed, 2 usage). */
export function runAdmin(args: readonly string[], io: AdminIo): number {
  const { words, flags, error } = parseArgs(args);
  if (error !== null) {
    io.err(`${error}\n${ADMIN_USAGE}`);
    return 2;
  }
  const json = flags.has('json');
  const say = (value: unknown, text: string): void =>
    io.out(json ? JSON.stringify(value, null, 2) : text);
  const [command, sub] = words;

  switch (command) {
    case 'list': {
      const vaults = io.store.listVaults();
      const head = [
        'HANDLE',
        'SIZE',
        'VERSION',
        'CREATED',
        'UPDATED',
        'LAST DEVICE USE',
        'DEVICES',
        'RECOVERY KEY',
      ];
      say(
        vaults.map(summaryJson),
        vaults.length === 0
          ? 'no vaults'
          : table([
              head,
              ...vaults.map((v) => [
                v.handle,
                kb(v.size),
                String(v.version),
                iso(v.createdAt),
                iso(v.updatedAt),
                iso(v.lastSeenAt),
                String(v.devices),
                v.hasRecovery ? 'yes' : 'no',
              ]),
            ]),
      );
      return 0;
    }
    case 'stats': {
      const vaults = io.store.listVaults();
      const invites = io.store.listInvites();
      const stats = {
        vaults: vaults.length,
        totalBytes: vaults.reduce((n, v) => n + v.size, 0),
        devices: vaults.reduce((n, v) => n + v.devices, 0),
        withRecoveryKey: vaults.filter((v) => v.hasRecovery).length,
        invitesUnused: invites.filter((i) => i.usedAt === null && i.revokedAt === null).length,
        invitesUsed: invites.filter((i) => i.usedAt !== null).length,
      };
      say(
        stats,
        `vaults: ${stats.vaults}\nstored: ${kb(stats.totalBytes)}\ndevices: ${stats.devices}\nwith a recovery key: ${stats.withRecoveryKey}\ninvites unused: ${stats.invitesUnused}, used: ${stats.invitesUsed}`,
      );
      return 0;
    }
    case 'invites': {
      if (sub === 'create') {
        const label =
          typeof flags.get('label') === 'string' ? (flags.get('label') as string).slice(0, 80) : '';
        const countFlag = flags.get('count');
        const count =
          countFlag === undefined
            ? 1
            : /^[0-9]{1,3}$/.test(String(countFlag))
              ? Number(countFlag)
              : 0;
        if (count < 1 || count > 100) {
          io.err('--count must be a number from 1 to 100');
          return 2;
        }
        const made: { id: number; code: string; label: string }[] = [];
        for (let i = 0; i < count; i++) {
          const code = newInviteCode(io.random);
          if (!INVITE_PATTERN.test(code)) throw new Error('invite code shape');
          const id = io.store.createInvite(io.keys.inviteDigest(code), label, io.now());
          made.push({ id, code, label });
        }
        say(
          made,
          [
            ...made.map((m) => `${m.code}  (#${m.id}${m.label === '' ? '' : `, ${m.label}`})`),
            '',
            'Shown once: only a hash is kept. Each code works for one signup.',
          ].join('\n'),
        );
        return 0;
      }
      if (sub === 'list') {
        const rows: readonly InviteRow[] = io.store.listInvites();
        const state = (i: InviteRow): string =>
          i.usedAt !== null
            ? `used by ${i.usedBy ?? '?'} ${iso(i.usedAt)}`
            : i.revokedAt !== null
              ? 'revoked'
              : 'unused';
        say(
          rows.map((i) => ({
            id: i.id,
            label: i.label,
            createdAt: new Date(i.createdAt).toISOString(),
            usedAt: i.usedAt === null ? null : new Date(i.usedAt).toISOString(),
            usedBy: i.usedBy,
            revoked: i.revokedAt !== null,
          })),
          rows.length === 0
            ? 'no invites'
            : table([
                ['ID', 'LABEL', 'CREATED', 'STATE'],
                ...rows.map((i) => [String(i.id), i.label, iso(i.createdAt), state(i)]),
              ]),
        );
        return 0;
      }
      if (sub === 'revoke') {
        const id = words[2];
        if (id === undefined || !/^[0-9]{1,9}$/.test(id)) {
          io.err('usage: invites revoke <id>');
          return 2;
        }
        const done = io.store.revokeInvite(Number(id), io.now());
        say(
          { revoked: done },
          done ? `invite #${id} revoked` : `invite #${id} is not an unused invite`,
        );
        return done ? 0 : 1;
      }
      io.err(ADMIN_USAGE);
      return 2;
    }
    case 'delete': {
      const handle = sub;
      if (handle === undefined) {
        io.err('usage: delete <handle> --yes');
        return 2;
      }
      const row = io.store.vaultByHandle(handle);
      if (row === null) {
        io.err('no such vault');
        return 1;
      }
      if (!flags.has('yes')) {
        io.err(
          `this removes the vault "${handle}" (${kb(row.size)}) with its envelopes and devices, and cannot be undone: run again with --yes`,
        );
        return 1;
      }
      io.store.deleteVault(row.rowId);
      say({ deleted: handle }, `deleted ${handle}`);
      return 0;
    }
    case 'prune': {
      const raw = flags.get('idle-days');
      if (typeof raw !== 'string' || !/^[0-9]{1,5}$/.test(raw) || Number(raw) < 1) {
        io.err('usage: prune --idle-days N [--yes]   (N is at least 1)');
        return 2;
      }
      const idle = io.store.idleVaults(io.now(), Number(raw) * DAY);
      const apply = flags.has('yes');
      if (apply) {
        for (const v of idle) {
          const row = io.store.vaultByHandle(v.handle);
          if (row !== null) io.store.deleteVault(row.rowId);
        }
      }
      say(
        { dryRun: !apply, idleDays: Number(raw), vaults: idle.map(summaryJson) },
        idle.length === 0
          ? `no vault has been idle for ${raw} days`
          : `${apply ? 'deleted' : 'would delete (dry run: add --yes to delete)'} ${idle.length} vault(s) idle for ${raw} days or more:\n` +
              table(
                idle.map((v) => [
                  v.handle,
                  kb(v.size),
                  `updated ${iso(v.updatedAt)}`,
                  `device use ${iso(v.lastSeenAt)}`,
                ]),
              ),
      );
      return 0;
    }
    default:
      io.err(ADMIN_USAGE);
      return command === undefined || command === 'help' ? 0 : 2;
  }
}
