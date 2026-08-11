// Regression test for the Origin: null CORS fix on /api/plugins/:id/asset/*.
//
// The /api origin middleware in server.ts blocked every Origin: null request
// except an explicit allowlist (NULL_ORIGIN_SAFE_GET_RE). Plugin preview
// iframes run with sandbox="allow-scripts" but no allow-same-origin, so every
// sub-resource fetch they make carries Origin: null. This test verifies:
//
//   1. The middleware lets Origin: null GET requests through for plugin assets.
//   2. The asset route replies with Access-Control-Allow-Origin: * so the
//      sandbox-origin iframe can actually read the response bytes.
//   3. Requests without Origin: null do NOT get the ACAO header.
//   4. Origin: null on routes not in the allowlist is still blocked (403).
//
// We mount the /api origin middleware with the *real* exported
// NULL_ORIGIN_SAFE_GET_RE from server.ts (not a copy) + registerPluginAssetRoutes
// on a bare Express app. This avoids the full startServer() overhead and the
// Windows path-validation issue in the install API, while ensuring the test
// tracks the live regex and can't drift silently.

import type http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerPluginAssetRoutes } from '../src/routes/plugins/assets.js';
import { isAllowedBrowserOrigin, allowedBrowserPorts } from '../src/origin-validation.js';
import { NULL_ORIGIN_SAFE_GET_RE } from '../src/server.js';

let server: http.Server;
let baseUrl: string;
let pluginRoot: string;

beforeAll(async () => {
  // Build a small plugin fixture on disk.
  pluginRoot = await mkdtemp(path.join(os.tmpdir(), 'od-cors-null-'));
  await mkdir(path.join(pluginRoot, 'assets'), { recursive: true });
  await writeFile(
    path.join(pluginRoot, 'assets', 'hero.png'),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG magic bytes
  );

  const app = express();

  // /api origin middleware — uses the real NULL_ORIGIN_SAFE_GET_RE exported
  // from server.ts so this test tracks the live regex and won't drift.
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin == null || origin === '') return next(); // non-browser client
    if (origin === 'null') {
      const isSafe = req.method === 'GET' && NULL_ORIGIN_SAFE_GET_RE.test(req.path);
      if (!isSafe) return res.status(403).json({ error: 'Origin: null not allowed for this route' });
      return next();
    }
    // For other browser origins check against the actual server port.
    const port = (server.address() as { port: number }).port;
    const ports = allowedBrowserPorts(port);
    if (!isAllowedBrowserOrigin(origin, req.headers.host, ports, '127.0.0.1', [])) {
      return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
    }
    next();
  });

  registerPluginAssetRoutes(app, {
    db: {} as never,
    pluginAssetCache: { get: async () => { throw new Error('unused'); } },
    AssetCacheError: class AssetCacheError extends Error {
      status = 502;
      constructor(...args: unknown[]) { super(args[0] != null ? String(args[0]) : undefined); }
    },
    assetCacheRewriteUrl: (url) => url,
    isCacheableExternalUrl: () => false,
    assembleExample: (tpl, slides) => tpl.replace('<!-- SLIDES_HERE -->', slides),
    getWorkspacePlugin: async (_db, id) => {
      if (id !== 'cors-test-plugin') return null;
      return { fsPath: pluginRoot, title: 'CORS Test' };
    },
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(pluginRoot, { recursive: true, force: true });
});

describe('Origin: null on /api/plugins/:id/asset/* (sandbox iframe CORS fix)', () => {
  it('middleware passes request and route sets ACAO: *', async () => {
    const resp = await fetch(
      `${baseUrl}/api/plugins/cors-test-plugin/asset/assets/hero.png`,
      { headers: { origin: 'null' } },
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get('access-control-allow-origin')).toBe('*');
    await resp.body?.cancel();
  });

  it('does not set ACAO: * when Origin header is absent', async () => {
    const resp = await fetch(
      `${baseUrl}/api/plugins/cors-test-plugin/asset/assets/hero.png`,
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get('access-control-allow-origin')).toBeNull();
    await resp.body?.cancel();
  });

  it('middleware still blocks Origin: null for routes not in the allowlist', async () => {
    // /api/plugins/:id/preview is a top-level iframe nav (not fetched from within
    // a null-origin context), so it must stay out of the allowlist.
    const resp = await fetch(
      `${baseUrl}/api/plugins/cors-test-plugin/preview`,
      { headers: { origin: 'null' } },
    );
    expect(resp.status).toBe(403);
    await resp.body?.cancel();
  });
});
