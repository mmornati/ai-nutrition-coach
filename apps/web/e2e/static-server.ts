// A tiny static server for a built bundle that can PLAY "a new version was deployed": the build id
// in sw.js and precache-manifest.json is rewritten on the fly (exactly what the container's
// 30-render-sw.sh does at start), so the update flow runs against the real worker, real caches and
// the real app with no second build. Headers mirror the container's: no-cache for the worker, the
// manifests and the document, and the full Appendix A CSP.
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { headerCsp } from '../vite.config';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const NO_CACHE = new Set([
  '/index.html',
  '/sw.js',
  '/precache-manifest.json',
  '/manifest.webmanifest',
]);

export interface TestServer {
  readonly origin: string;
  /** Serve this build id from now on (sw.js and the manifest). */
  setBuildId(id: string): void;
  close(): Promise<void>;
}

export async function serveBundle(dir: string, port: number): Promise<TestServer> {
  let buildId: string | undefined;
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.includes('..')) path = '/index.html';
    const file = join(dir, path);
    const isFile = existsSync(file) && statSync(file).isFile();
    const served = isFile ? path : extname(path) ? undefined : '/index.html';
    const headers: Record<string, string> = {
      'content-security-policy': headerCsp({ dev: false }),
      'x-content-type-options': 'nosniff',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
    };
    // The container's instance AI offer: off (the default). A missing file would be a console
    // error in the browser; the real server answers this too (infra/nginx/ai-proxy).
    if (path === '/ai/config.json') {
      res
        .writeHead(200, {
          ...headers,
          'content-type': 'application/json',
          'cache-control': 'no-store',
        })
        .end('{"enabled":false}');
      return;
    }
    if (!served) {
      res.writeHead(404, headers).end('not found');
      return;
    }
    let body: Buffer | string = readFileSync(join(dir, served));
    if (buildId && served === '/sw.js') {
      body = body
        .toString()
        .replace(/^const BUILD_ID = '[^']*';/m, `const BUILD_ID = '${buildId}';`);
    } else if (buildId && served === '/precache-manifest.json') {
      body = body.toString().replace(/"buildId": "[^"]*"/, `"buildId": "${buildId}"`);
    }
    headers['content-type'] = TYPES[extname(served)] ?? 'application/octet-stream';
    if (NO_CACHE.has(served)) headers['cache-control'] = 'no-cache';
    res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : body);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, resolve);
  });
  return {
    origin: `http://localhost:${port}`,
    setBuildId: (id) => {
      buildId = id;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
