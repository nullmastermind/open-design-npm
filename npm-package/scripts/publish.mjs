#!/usr/bin/env node
/**
 * Bump the npm-package patch version, build, and publish @spec-ade/open-design.
 *
 * Run from repo root:
 *   node npm-package/scripts/publish.mjs
 *   node npm-package/scripts/publish.mjs dry-run
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = join(__dirname, '..');
const repoRoot = join(packageDir, '..');
const packageJsonPath = join(packageDir, 'package.json');

const mode = process.argv[2] ?? '';
if (mode !== '' && mode !== 'publish' && mode !== 'dry-run') {
  console.error('usage: node npm-package/scripts/publish.mjs [dry-run]');
  process.exit(1);
}
const dryRun = mode === 'dry-run';

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: repoRoot, ...opts });
}

function readPackageVersion() {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error('npm-package/package.json must define a version');
  }
  return pkg.version;
}

function writePackageVersion(version) {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  pkg.version = version;
  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function compareSemver(a, b) {
  const parse = (value) => value.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function bumpPatch(version) {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.slice(0, 3).join('.');
}

function publishedVersion() {
  try {
    return execSync('npm view @spec-ade/open-design version', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const original = readPackageVersion();
console.log(`Local version: ${original}`);

try {
  const published = publishedVersion();
  let base = original;
  if (published) {
    console.log(`Published version: ${published}`);
    if (compareSemver(published, original) > 0) {
      console.log(`Syncing local version to ${published}`);
      writePackageVersion(published);
      base = published;
    }
  }

  const next = bumpPatch(base);
  console.log(`Bumping to ${next}`);
  writePackageVersion(next);

  run('node npm-package/scripts/build.mjs');

  const publishArgs = ['npm', 'publish', '--access', 'public'];
  if (dryRun) publishArgs.push('--dry-run');
  run(publishArgs.join(' '), { cwd: packageDir });
} finally {
  if (dryRun) {
    writePackageVersion(original);
    console.log(`Restored version to ${original}`);
  }
}
