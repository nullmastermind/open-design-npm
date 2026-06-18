#!/usr/bin/env node
/**
 * Assembles the npm package for publishing.
 *
 * The package layout mirrors the monorepo structure that the daemon's
 * resolveProjectRoot(__dirname) expects. From dist/cli.js, the daemon
 * resolves PROJECT_ROOT by going up: dist/ → (daemon dir) → ../../
 * In our layout: dist/ is at package root, so we place the bundle at
 * apps/daemon/dist/cli.js to make PROJECT_ROOT resolve to package root.
 *
 * Steps:
 * 1. Build workspace packages (contracts, platform, sidecar-proto, etc.)
 * 2. Build web static export (next build)
 * 3. Bundle daemon CLI with esbuild
 * 4. Copy resource directories to match expected PROJECT_ROOT layout
 *
 * Run from repo root: node npm-package/scripts/build.mjs
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { builtinModules } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = join(__dirname, '..');
const repoRoot = join(packageDir, '..');

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: repoRoot, ...opts });
}

// --- Clean previous build ---
console.log('=== Cleaning previous build ===');
const dirsToClean = [
  'apps', 'skills', 'design-systems', 'design-templates',
  'craft', 'assets', 'prompt-templates', 'plugins',
];
for (const dir of dirsToClean) {
  const target = join(packageDir, dir);
  if (existsSync(target)) rmSync(target, { recursive: true });
}

// --- Step 1: Build workspace packages ---
console.log('\n=== Building workspace packages ===');
run('pnpm --filter @open-design/contracts build');
run('pnpm --filter @open-design/registry-protocol build');
run('pnpm --filter @open-design/sidecar-proto build');
run('pnpm --filter @open-design/platform build');
run('pnpm --filter @open-design/sidecar build');
run('pnpm --filter @open-design/diagnostics build');
run('pnpm --filter @open-design/plugin-runtime build');
run('pnpm --filter @open-design/agui-adapter build');

// --- Step 2: Build web static export ---
console.log('\n=== Building web static export ===');
run('pnpm --filter @open-design/web build');

// --- Step 3: Bundle daemon CLI ---
console.log('\n=== Bundling daemon CLI ===');
run(`node ${join(packageDir, 'esbuild.config.mjs')}`);

// --- Step 3b: Verify externals are resolvable at runtime ---
// Anything esbuild leaves `external` stays a runtime import in cli.js. If such a
// module is neither a Node builtin nor a declared dependency, the published
// bundle throws ERR_MODULE_NOT_FOUND on first import. Fail the build here
// instead of shipping a broken package.
console.log('\n=== Verifying externals are declared dependencies ===');
const { EXTERNAL } = await import(
  pathToFileURL(join(packageDir, 'esbuild.config.mjs')).href
);
const pkg = JSON.parse(
  readFileSync(join(packageDir, 'package.json'), 'utf8'),
);
const declaredDeps = new Set(Object.keys(pkg.dependencies ?? {}));
const builtins = new Set(builtinModules);
const missing = EXTERNAL.filter((name) => {
  const bare = name.startsWith('node:') ? name.slice('node:'.length) : name;
  return !builtins.has(bare) && !declaredDeps.has(name);
});
if (missing.length > 0) {
  console.error(
    `\nERROR: esbuild external(s) not declared in npm-package/package.json dependencies: ${missing.join(', ')}`,
  );
  console.error(
    'Each external must be a Node builtin or a runtime dependency, otherwise the published bundle throws ERR_MODULE_NOT_FOUND.',
  );
  process.exit(1);
}
console.log(`  OK: ${EXTERNAL.length} external(s) all resolvable`);

// --- Step 4: Copy resources to match PROJECT_ROOT layout ---
// The daemon resolves resources relative to PROJECT_ROOT:
//   STATIC_DIR = PROJECT_ROOT/apps/web/out
//   SKILLS_DIR = PROJECT_ROOT/skills  (when OD_RESOURCE_ROOT unset)
//   etc.
// We replicate this structure in the package root.
console.log('\n=== Copying resources ===');

const resourcesToCopy = [
  { src: 'apps/web/out', dest: 'apps/web/out' },
  { src: 'skills', dest: 'skills' },
  { src: 'design-systems', dest: 'design-systems' },
  { src: 'design-templates', dest: 'design-templates' },
  { src: 'craft', dest: 'craft' },
  { src: 'assets/frames', dest: 'assets/frames' },
  { src: 'assets/community-pets', dest: 'assets/community-pets' },
  { src: 'prompt-templates', dest: 'prompt-templates' },
  { src: 'plugins/_official', dest: 'plugins/_official' },
  { src: 'plugins/registry', dest: 'plugins/registry' },
];

for (const { src, dest } of resourcesToCopy) {
  const srcPath = join(repoRoot, src);
  const destPath = join(packageDir, dest);
  if (!existsSync(srcPath)) {
    console.warn(`  WARN: ${src} does not exist, skipping`);
    continue;
  }
  mkdirSync(dirname(destPath), { recursive: true });
  console.log(`  ${src} → ${dest}`);
  cpSync(srcPath, destPath, { recursive: true });
}

console.log('\n=== Build complete ===');
console.log(`Package ready at: ${packageDir}`);
console.log('Run `npm publish` from npm-package/ to publish.');
