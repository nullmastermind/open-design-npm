import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// Resolve esbuild from a workspace package that has it as a devDep
const require = createRequire(join(repoRoot, 'packages', 'contracts', 'package.json'));
const { build } = require('esbuild');

// Output at apps/daemon/dist/cli.js within the package so that the daemon's
// resolveProjectRoot(__dirname) correctly resolves to the package root:
//   __dirname = <pkg>/apps/daemon/dist
//   basename = 'dist' → daemonDir = <pkg>/apps/daemon
//   resolve(daemonDir, '../..') = <pkg>  ✓
const result = await build({
  entryPoints: [join(repoRoot, 'apps/daemon/src/cli.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: join(__dirname, 'apps/daemon/dist/cli.js'),
  external: ['better-sqlite3', 'blake3-wasm', 'playwright-core', 'chromium-bidi'],
  banner: {
    js: [
      'import { createRequire as __bundleCreateRequire } from "node:module";',
      'const require = __bundleCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  sourcemap: false,
  minify: false,
  metafile: true,
  logLevel: 'info',
});

const totalBytes = Object.values(result.metafile.outputs).reduce(
  (sum, output) => sum + output.bytes,
  0,
);
console.log(`Bundle size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
