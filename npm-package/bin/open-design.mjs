#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');

// --- Resolve OD_DATA_DIR ---
// Platform-conventional data directory so daemon doesn't write into node_modules.
// The daemon's resolveDataDir defaults to PROJECT_ROOT/.od which would be inside
// the npm package — we redirect to a user-owned location.
if (!process.env.OD_DATA_DIR) {
  process.env.OD_DATA_DIR = resolveDefaultDataDir();
}

// --- Resolve OD_BIN ---
// Self-reference path for spawned agent processes calling back into the CLI.
// Without this, resolveDaemonCliPath() would call require.resolve() which fails
// in a bundled context (no @open-design/daemon in node_modules).
if (!process.env.OD_BIN) {
  process.env.OD_BIN = join(packageRoot, 'apps', 'daemon', 'dist', 'cli.js');
}

// --- Handle --open / --no-open ---
// npm package defaults to NOT opening browser (opposite of dev mode).
// User passes --open to opt in; we strip it and let daemon's default (open=true) work.
//
// Only inject --no-open when the CLI is in "startup mode" (no subcommand).
// Detection: if the first positional arg (non-flag) exists, it's a subcommand.
// This avoids maintaining a hardcoded subcommand list that drifts with daemon updates.
const args = [...process.argv.slice(2)];
const openIdx = args.indexOf('--open');
const firstPositional = args.find(a => !a.startsWith('-'));
const isStartupMode = !firstPositional;

if (openIdx !== -1) {
  args.splice(openIdx, 1);
} else if (isStartupMode && !args.includes('--no-open')) {
  args.push('--no-open');
}

// Replace process.argv so the daemon CLI sees our modified args
process.argv = [process.argv[0], process.argv[1], ...args];

// --- Launch daemon CLI ---
await import('../apps/daemon/dist/cli.js');

// --- Helpers ---

function resolveDefaultDataDir() {
  const platform = process.platform;

  if (platform === 'win32') {
    const base =
      process.env.LOCALAPPDATA ||
      join(process.env.USERPROFILE || homedir(), 'AppData', 'Local');
    return join(base, 'open-design');
  }

  if (platform === 'darwin') {
    return join(homedir(), '.open-design');
  }

  // Linux and other POSIX: follow XDG Base Directory Specification
  const xdg = process.env.XDG_DATA_HOME;
  const base =
    xdg && xdg.length > 0 ? xdg : join(homedir(), '.local', 'share');
  return join(base, 'open-design');
}
