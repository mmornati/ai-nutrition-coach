import type { ExportDeliveryOutcome, ExportDestination } from './export-destination';

/** The browser surface this destination touches; injectable so tests need no real DOM download. */
export interface WebExportEnv {
  readonly document: Document;
  readonly url: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  readonly navigator: Pick<Navigator, 'canShare' | 'share'> | undefined;
}

function defaultEnv(): WebExportEnv {
  return {
    document,
    url: URL,
    navigator: typeof navigator === 'undefined' ? undefined : navigator,
  };
}

function download(env: WebExportEnv, blob: Blob, filename: string): void {
  const href = env.url.createObjectURL(blob);
  const anchor = env.document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.style.display = 'none';
  env.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  env.url.revokeObjectURL(href);
}

/**
 * Browser delivery: the Web Share API with a file when the browser can share one, otherwise a
 * Blob + anchor download. No network call. A dismissed share sheet is `cancelled`; any other
 * share failure falls back to the download so the person is never left without their file.
 */
export function createWebExportDestination(env: WebExportEnv = defaultEnv()): ExportDestination {
  return {
    async write({ filename, mimeType, bytes }): Promise<ExportDeliveryOutcome> {
      const blob = new Blob([bytes as BlobPart], { type: mimeType });
      const nav = env.navigator;
      if (
        nav !== undefined &&
        typeof nav.canShare === 'function' &&
        typeof nav.share === 'function'
      ) {
        const file = new File([blob], filename, { type: mimeType });
        let shareable = false;
        try {
          shareable = nav.canShare({ files: [file] });
        } catch {
          shareable = false;
        }
        if (shareable) {
          try {
            await nav.share({ files: [file], title: filename });
            return 'shared';
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
            // Fall through to the plain download.
          }
        }
      }
      download(env, blob, filename);
      return 'downloaded';
    },
  };
}
