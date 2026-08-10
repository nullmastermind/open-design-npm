#!/usr/bin/env node
/**
 * Fails when a sync merge produced source that no longer parses.
 *
 * Why this exists
 * ---------------
 * `sync-fork.yml` merges upstream with `-X ours`, which auto-resolves every
 * conflicting hunk in our favour and exits 0. When upstream rewrites a region
 * that this fork has *deleted* from (the community/social-share removal in
 * c2a4827e7 spans ~24 live files), `-X ours` applies our deletion to their
 * rewritten hunk. The result can drop a closing JSX tag, or strip unrelated
 * lines that merely shared a hunk with a deleted one — producing a file that
 * is syntactically invalid, with no conflict markers and no non-zero exit.
 *
 * That is exactly how the 2026-08-10 sync put three unparseable files on main
 * (EntryNavRail.tsx, EntryShell.tsx, FileViewer.tsx). Nothing caught it,
 * because the fork's only workflows are sync + publish; the breakage surfaced
 * as a `next build` failure inside the npm publish, which had already been
 * silently dead for two months for an unrelated reason.
 *
 * Why parse-only, not typecheck
 * -----------------------------
 * A full `pnpm typecheck` is the stronger check but is NOT a safe gate here:
 * this fork deliberately deletes modules that upstream still references, so
 * its tree is not guaranteed to be typecheck-clean even when a merge is fine.
 * Gating on typecheck could block every future sync for pre-existing reasons.
 *
 * Parse validity is different: it is a property of the merge itself. A healthy
 * tree parses (verified: 2462/2462 files at the pre-sync HEAD), and a spliced
 * one does not. That makes it a high-signal, low-false-positive gate, and it
 * needs no installed dependencies to run.
 *
 * Usage: node --experimental-strip-types .github/scripts/check-merge-parse.ts
 * Exits 1 and lists offending files when any tracked TS/TSX file fails to parse.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

interface BrokenFile {
  file: string;
  count: number;
  where: string;
  message: string;
}

const files = execFileSync(
  'git',
  ['ls-files', 'apps/**/*.ts', 'apps/**/*.tsx', 'packages/**/*.ts', 'packages/**/*.tsx'],
  { encoding: 'utf8', maxBuffer: 1 << 28 },
)
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.endsWith('.d.ts'));

const broken: BrokenFile[] = [];
for (const file of files) {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted by the merge; not a parse problem
  }
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  // `parseDiagnostics` is populated but not part of the public `SourceFile`
  // type; TypeScript itself relies on this internal field for the same
  // purpose (surfacing syntax errors without a full type-check pass).
  const diagnostics = (sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics ?? [];
  const first = diagnostics[0];
  if (first) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(first.start ?? 0);
    broken.push({
      file,
      count: diagnostics.length,
      where: `${line + 1}:${character + 1}`,
      message: ts.flattenDiagnosticMessageText(first.messageText, ' '),
    });
  }
}

if (broken.length === 0) {
  console.log(`Merge parse check OK: ${files.length} file(s) parse cleanly.`);
  process.exit(0);
}

console.error(
  `\nMerge parse check FAILED: ${broken.length} of ${files.length} file(s) do not parse.\n`,
);
for (const { file, count, where, message } of broken) {
  console.error(`  ${file}:${where}  (${count} diagnostic(s))`);
  console.error(`      ${message}`);
}
console.error(
  [
    '',
    'This is the signature of a bad `-X ours` merge: our deletions were spliced',
    "into upstream's rewritten code. Resolve by taking upstream's version of each",
    "file and re-applying this fork's deletions against upstream's current symbol",
    'names, then re-run this check. Do not push the merge as-is.',
    '',
  ].join('\n'),
);
process.exit(1);
