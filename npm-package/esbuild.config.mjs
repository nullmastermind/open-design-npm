import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// Resolve esbuild from a workspace package that has it as a devDep
const require = createRequire(join(repoRoot, 'packages', 'contracts', 'package.json'));
const { build } = require('esbuild');

// Native modules that cannot be bundled by esbuild. Every entry here is left as
// a runtime `import`/`require` in the output, so each MUST be a declared
// dependency in npm-package/package.json — otherwise the published bundle
// throws ERR_MODULE_NOT_FOUND. scripts/build.mjs imports this list and enforces
// that invariant after bundling.
export const EXTERNAL = ['better-sqlite3', 'blake3-wasm'];

// Output at apps/daemon/dist/cli.js within the package so that the daemon's
// resolveProjectRoot(__dirname) correctly resolves to the package root:
//   __dirname = <pkg>/apps/daemon/dist
//   basename = 'dist' → daemonDir = <pkg>/apps/daemon
//   resolve(daemonDir, '../..') = <pkg>  ✓
// Only bundle when run directly (`node esbuild.config.mjs`); when scripts/build.mjs
// imports this file for EXTERNAL we must not trigger a second build. Compare in
// URL form (not path strings) so Windows drive-letter/separator differences
// between import.meta.url and process.argv[1] can never cause a false negative.
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const result = await build({
    entryPoints: [join(repoRoot, 'apps/daemon/src/cli.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: join(__dirname, 'apps/daemon/dist/cli.js'),
    external: EXTERNAL,
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
}
