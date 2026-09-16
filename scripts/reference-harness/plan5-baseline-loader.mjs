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
// The retained session of iteration 6 makes the retained adapter reachable
// from the analysis entry. The pinned engine predates it and the batch replay
// never calls it, so the baseline serves an explicit stub instead of a module
// whose imports the pinned engine sources cannot satisfy.
if (engine === 'baseline') {
  sources.set(resolve(repo, 'dist/subs/analysis/subs/typescript/src/retained-source-analysis.js'),
    "export function createRetainedSourceAnalysis() { throw new Error('The pinned baseline engine has no retained adapter'); }\n"
    + "export function retainedCompilerEvidence() { throw new Error('The pinned baseline engine has no retained adapter'); }\n");
  // Plan 2A's `availability.ts` (model owner) is reachable from the model
  // barrel `index.ts`, which this batch replay imports for unrelated engine
  // entries; it is not itself an enginePaths file, so it always loads from
  // the real worktree dist, and its own `decisions.js` import would then hit
  // the pinned, pre-Plan-2A `decisions.ts` intercepted above (which predates
  // the `requirementsFor` export it names) and crash the whole barrel load.
  // The pinned engine predates `listAvailableOriginals` and the batch replay
  // never calls it, so the baseline serves the same kind of explicit stub.
  sources.set(resolve(repo, 'dist/subs/analysis/subs/model/src/availability.js'),
    "export function listAvailableOriginals() { throw new Error('The pinned baseline engine has no availability provider'); }\n");
}
registerHooks({ load(url, context, next) {
  if (url.startsWith('file:')) {
    const source = sources.get(fileURLToPath(url));
    if (source !== undefined) return { format: 'module', source: stripTypeScriptTypes(source, { mode: 'transform', sourceUrl: url }), shortCircuit: true };
  }
  return next(url, context);
} });
