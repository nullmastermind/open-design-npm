// Bundled example pages must not reference EXECUTABLE or STYLESHEET resources
// from external http(s) origins.
//
// The daemon's sandboxed plugin preview route (apps/daemon/src/routes/plugins/
// assets.ts) serves example.html with a strict CSP — `script-src 'self'
// 'unsafe-inline'` and `style-src 'self' 'unsafe-inline'`, `connect-src
// 'none'` — so an external `<script src>` / `<link rel="stylesheet">` is
// blocked at preview time. The asset-cache proxy (plugin-asset-cache.ts) only
// covers media (images/audio/video); HTML, CSS, JS, and fonts are deliberately
// never proxied so that surface stays out of open-proxy territory. The only
// sanctioned shape for shipped example pages is therefore SELF-CONTAINED:
// inline styles, inline scripts, and relative same-origin assets.
//
// data-report broke this by loading Tailwind and Chart.js from CDNs: the
// preview rendered unstyled and threw `Uncaught ReferenceError: Chart is not
// defined` (the DevTools report behind this guard). This test freezes the
// legacy offenders in an allowlist (they render broken but not fatally) and
// fails on any NEW executable/stylesheet external reference — the same shape
// the repo uses for the residual-JS allowlist in scripts/guard.ts.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const EXAMPLE_ROOTS = ['plugins/_official/examples', 'design-templates'];

// Legacy offenders that ship external executable/stylesheet references.
// External Google Fonts stylesheets are intentionally NOT listed: they degrade
// to local font fallback without a console error, and rewriting 35+ designs is
// a separate visual task. A page fixed here leaves this list forever — do not
// add new entries.
const FROZEN_EXTERNAL_RUNTIME_OFFENDERS = new Set([
  path.join('plugins/_official/examples/article-magazine/example.html'),
  path.join('plugins/_official/examples/card-twitter/example.html'),
  path.join('plugins/_official/examples/card-xiaohongshu/example.html'),
  path.join('plugins/_official/examples/doc-kami-parchment/example.html'),
  path.join('plugins/_official/examples/frame-data-chart-nyt/example.html'),
  path.join('plugins/_official/examples/frame-flowchart-sticky/example.html'),
  path.join('plugins/_official/examples/frame-glitch-title/example.html'),
  path.join('plugins/_official/examples/frame-light-leak-cinema/example.html'),
  path.join('plugins/_official/examples/frame-liquid-bg-hero/example.html'),
  path.join('plugins/_official/examples/frame-logo-outro/example.html'),
  path.join('plugins/_official/examples/frame-macos-notification/example.html'),
  path.join('plugins/_official/examples/mockup-device-3d/example.html'),
  path.join('plugins/_official/examples/poster-hero/example.html'),
  path.join('plugins/_official/examples/resume-modern/example.html'),
  path.join('plugins/_official/examples/social-reddit-card/example.html'),
  path.join('plugins/_official/examples/social-spotify-card/example.html'),
  path.join('plugins/_official/examples/social-x-post-card/example.html'),
  path.join('plugins/_official/examples/vfx-text-cursor/example.html'),
  path.join('design-templates/html-ppt-zhangzara-cartesian/example.html'),
  path.join('design-templates/html-ppt-zhangzara-coral/example.html'),
  path.join('design-templates/html-ppt-zhangzara-retro-windows/example.html'),
]);

async function findExamplePages(root: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name, 'example.html');
    try {
      await readFile(candidate);
      out.push(candidate);
    } catch {
      // no example page in this template dir
    }
  }
  return out;
}

/** External executable/stylesheet references the preview CSP blocks outright. */
function externalRuntimeRefs(html: string): string[] {
  const refs: string[] = [];
  const scriptSrc = /<script\b[^>]*\bsrc\s*=\s*(['"])(https?:\/\/[^'"]+)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptSrc.exec(html)) !== null) refs.push(m[2] ?? '');
  const linkHref = /<link\b[^>]*\bhref\s*=\s*(['"])(https?:\/\/[^'"]+)\1/gi;
  while ((m = linkHref.exec(html)) !== null) {
    if (!/fonts\.(googleapis|gstatic)\.com/i.test(m[2] ?? '')) refs.push(m[2] ?? '');
  }
  return refs;
}

describe('bundled example pages stay self-contained under the preview CSP', () => {
  it('no example.html references an external executable or stylesheet outside the frozen legacy list', async () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const rootRel of EXAMPLE_ROOTS) {
      for (const page of await findExamplePages(path.join(repoRoot, rootRel))) {
        scanned += 1;
        const rel = path.relative(repoRoot, page);
        const refs = externalRuntimeRefs(await readFile(page, 'utf8'));
        if (refs.length > 0 && !FROZEN_EXTERNAL_RUNTIME_OFFENDERS.has(rel)) {
          offenders.push(`${rel}: ${refs.join(', ')}`);
        }
      }
    }
    // Sanity: the scan must actually see the corpus, or it has gone blind.
    expect(scanned).toBeGreaterThanOrEqual(20);
    // Sanity: every frozen entry must still exist as an offender. An entry that
    // no longer offends means the page was fixed and this list must shrink.
    for (const frozen of FROZEN_EXTERNAL_RUNTIME_OFFENDERS) {
      const page = path.join(repoRoot, frozen);
      const rel = path.relative(repoRoot, page);
      try {
        await readFile(page);
      } catch {
        throw new Error(
          `FROZEN_EXTERNAL_RUNTIME_OFFENDERS lists ${rel}, which no longer exists. Remove it from the allowlist.`,
        );
      }
      const refs = externalRuntimeRefs(await readFile(page, 'utf8'));
      if (refs.length === 0) {
        throw new Error(
          `FROZEN_EXTERNAL_RUNTIME_OFFENDERS lists ${rel}, which no longer references external executables or stylesheets. Remove it from the allowlist.`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });
});
