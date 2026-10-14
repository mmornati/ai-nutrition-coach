import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWebExportDestination,
  REVOKE_OBJECT_URL_DELAY_MS,
  type WebExportEnv,
} from './web-export-destination';

const input = {
  filename: '2026-08-16-ai-nutrition-coach.csv',
  mimeType: 'text/csv;charset=utf-8',
  bytes: new TextEncoder().encode('id\n'),
};

function env(nav: WebExportEnv['navigator']): {
  env: WebExportEnv;
  created: Blob[];
  revoked: string[];
  clicks: HTMLAnchorElement[];
} {
  const created: Blob[] = [];
  const revoked: string[] = [];
  const clicks: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push(this);
  });
  return {
    created,
    revoked,
    clicks,
    env: {
      document,
      navigator: nav,
      url: {
        createObjectURL: (b: Blob | MediaSource) => {
          created.push(b as Blob);
          return 'blob:test';
        },
        revokeObjectURL: (u: string) => void revoked.push(u),
      },
    },
  };
}

describe('createWebExportDestination', () => {
  it('downloads through a Blob and an anchor when sharing files is not available', async () => {
    const t = env(undefined);
    expect(await createWebExportDestination(t.env).write(input)).toBe('downloaded');
    expect(t.created).toHaveLength(1);
    expect(t.created[0]?.type).toBe('text/csv;charset=utf-8');
    expect(t.clicks[0]?.download).toBe(input.filename);
    expect(t.clicks[0]?.getAttribute('href')).toBe('blob:test');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  describe('the object URL', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('is revoked only after a delay, never in the same tick as the click', async () => {
      const t = env(undefined);
      await createWebExportDestination(t.env).write(input);
      expect(t.revoked).toEqual([]);
      await vi.advanceTimersByTimeAsync(REVOKE_OBJECT_URL_DELAY_MS - 1);
      expect(t.revoked).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(t.revoked).toEqual(['blob:test']);
    });
  });

  it('uses the Web Share API with a file when the browser can share it', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const t = env({ canShare: () => true, share });
    expect(await createWebExportDestination(t.env).write(input)).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0]?.[0] as { files: File[] };
    expect(arg.files[0]?.name).toBe(input.filename);
    expect(t.clicks).toHaveLength(0);
  });

  it('falls back to download when canShare refuses files', async () => {
    const share = vi.fn();
    const t = env({ canShare: () => false, share });
    expect(await createWebExportDestination(t.env).write(input)).toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
  });

  it('a dismissed share sheet is cancelled and downloads nothing', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('x', 'AbortError'));
    const t = env({ canShare: () => true, share });
    expect(await createWebExportDestination(t.env).write(input)).toBe('cancelled');
    expect(t.clicks).toHaveLength(0);
  });

  it('any other share failure falls back to the download', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('x', 'NotAllowedError'));
    const t = env({ canShare: () => true, share });
    expect(await createWebExportDestination(t.env).write(input)).toBe('downloaded');
    expect(t.clicks).toHaveLength(1);
  });
});
