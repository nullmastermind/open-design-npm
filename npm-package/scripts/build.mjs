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
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
