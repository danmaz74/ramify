import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// The pre-iteration engine is pinned independently of current implementation.
// Replay it on the exact same fixture directory as the candidate engine; no
// report field other than runId is normalized. All git reads use this checkout.
// PLAN5_ENGINE=baseline serves the pinned commit's engine sources;
// PLAN5_ENGINE=worktree serves the working tree's, so neither comparison side
// depends on the staleness of the built `dist/` copies of these files.
export const baselineRevision = 'e0be049658b922ba6606172f1cf5166c01a49f1d';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const engine = process.env.PLAN5_ENGINE ?? 'baseline';
if (engine !== 'baseline' && engine !== 'worktree') throw new Error(`Unknown PLAN5_ENGINE ${engine}`);
export const enginePaths = [
  'subs/analysis/subs/model/src/decisions.ts', 'subs/analysis/subs/model/src/model.ts',
  ...['accesses', 'namespace-uses', 'resolution', 'compiler-helper', 'bridge', 'wire', 'source-analysis']
    .map(name => `subs/analysis/subs/typescript/src/${name}.ts`),
];
const read = path => engine === 'worktree' ? readFileSync(resolve(repo, path), 'utf8')
  : execFileSync('git', ['show', `${baselineRevision}:${path}`], { cwd: repo, encoding: 'utf8', maxBuffer: 4 * 1024 ** 2 });
const sources = new Map(enginePaths.map(path => [resolve(repo, 'dist', path.replace(/\.ts$/, '.js')), read(path)]));
registerHooks({ load(url, context, next) {
  if (url.startsWith('file:')) {
    const source = sources.get(fileURLToPath(url));
    if (source !== undefined) return { format: 'module', source: stripTypeScriptTypes(source, { mode: 'transform', sourceUrl: url }), shortCircuit: true };
  }
  return next(url, context);
} });
