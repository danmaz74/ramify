// Modularity baseline probe (docs/architecture/modularity-report.spec.md,
// "Materialized baseline"; project modularity analysis, execution step 4).
//
// Runs one disposable batch analysis with the CLI check capabilities plus
// `dependency-behavior`, projects declared modularity and production change
// affinity from that single report, and writes one `ModularityDocument` as
// JSON with a Markdown rendering. It refuses when the worktree is dirty
// (unless --allow-dirty, recorded as `clean: false`), when HEAD moves during
// the run, or when the history head differs from the analyzed commit.
//
//     npm run build
//     npm run probe:modularity -- [--root <dir>] [--out <dir>] [--name <basename>]
//       [--range <rev-range>] [--first-parent] [--include-merges]
//       [--min-owner-commits <n>] [--min-shared-commits <n>]
//       [--max-owners-per-commit <n|none>] [--exclude-commit <rev>]... [--allow-dirty]

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { AnalysisLimits, Capability, ChangeAffinityThresholds, ModularityDocument } from 'ramify.ts/analysis';
import { git, readGitHistory, repositoryState, utf8Order } from './git-history.js';
import { renderMarkdown } from './markdown.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The shared CLI check capability list, plus the opt-in behavioral evidence. */
const capabilities: readonly Capability[] = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking',
  'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage', 'dependency-behavior'];
/** Batch limits as in `src/batch.ts`, with report capacity well above the toolkit's report size. */
const limits: AnalysisLimits = {
  acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2,
    maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
  source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
  maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 512 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 300_000,
};
/** Bounds of the materialized modularity report (spec: never truncated, unavailable when exceeded). */
const modularityLimits = { maxBoundaryChanges: 1000, maxReportBytes: 4 * 1024 ** 2 };

class Refusal extends Error {}

function count(value: string, name: string): number {
  if (!/^\d+$/.test(value)) throw new Refusal(`--${name} needs a non-negative integer, not ${JSON.stringify(value)}`);
  return Number(value);
}

async function main(): Promise<void> {
  const { values } = parseArgs({ strict: true, options: {
    root: { type: 'string', default: packageRoot },
    out: { type: 'string', default: resolve(packageRoot, 'scripts/probes/results/modularity') },
    name: { type: 'string', default: 'baseline' },
    range: { type: 'string', default: 'HEAD' },
    'first-parent': { type: 'boolean', default: false },
    'include-merges': { type: 'boolean', default: false },
    'min-owner-commits': { type: 'string', default: '5' },
    'min-shared-commits': { type: 'string', default: '3' },
    'max-owners-per-commit': { type: 'string', default: '5' },
    'exclude-commit': { type: 'string', multiple: true, default: [] },
    'allow-dirty': { type: 'boolean', default: false },
  } });
  const root = resolve(values.root);
  if (!/^[A-Za-z0-9._-]+$/.test(values.name)) throw new Refusal(`--name must be a plain file basename: ${values.name}`);

  const before = repositoryState(root);
  if (!before.clean && !values['allow-dirty']) {
    throw new Refusal(`The worktree is not clean (${before.changes.length} changes); commit first or pass --allow-dirty:\n${before.changes.slice(0, 20).join('\n')}`);
  }
  const thresholds: ChangeAffinityThresholds = {
    minOwnerCommits: count(values['min-owner-commits'], 'min-owner-commits'),
    minSharedCommits: count(values['min-shared-commits'], 'min-shared-commits'),
    maxOwnersPerCommit: values['max-owners-per-commit'] === 'none' ? null : count(values['max-owners-per-commit'], 'max-owners-per-commit'),
    excludedCommits: [...new Set(values['exclude-commit'].map(revision => git(root, ['rev-parse', '--verify', `${revision}^{commit}`]).trim()))].sort(utf8Order),
  };

  const { analyzeProject, projectModularity, projectChangeAffinity } = await import('ramify.ts/analysis');
  const { createDefaultTagRegistry } = await import('ramify.ts/model');
  const run = await analyzeProject({ project: { cwd: root, root, configuration: 'discover', scope: 'whole-project' },
    registry: createDefaultTagRegistry(), capabilities, limits });
  if (run.status !== 'reported') throw new Refusal('The analysis was cancelled');
  const { report } = run;
  const after = repositoryState(root);
  if (after.commit !== before.commit || after.clean !== before.clean) {
    throw new Refusal(`The repository changed during analysis (${before.commit} → ${after.commit}); rerun on a quiet worktree`);
  }
  const revision = `batch:${report.inputId}`;
  const modularity = projectModularity({ revision, report, limits: modularityLimits });
  if (modularity.status !== 'projected') throw new Refusal(`Modularity projection ${modularity.status}: ${JSON.stringify(modularity)}`);

  const history = readGitHistory({ root, range: values.range, firstParent: values['first-parent'],
    merges: values['include-merges'] ? 'included' : 'excluded' });
  if (history.provenance.head !== before.commit) {
    throw new Refusal(`The history head ${history.provenance.head} differs from the analyzed commit ${before.commit}`);
  }
  const affinity = projectChangeAffinity({ revision, report, history, thresholds, filter: 'production' });
  if (affinity.status !== 'projected') throw new Refusal(`Change affinity projection ${affinity.status}: ${JSON.stringify(affinity)}`);

  const document: ModularityDocument = {
    schemaVersion: 'ramify.modularity-document/1',
    repository: { commit: before.commit, clean: before.clean },
    declared: { modularity: modularity.report, changeAffinity: affinity.report },
    candidates: [],
  };
  const json = JSON.stringify(document, null, 1) + '\n';
  const markdown = renderMarkdown(document, { title: `Modularity baseline at ${before.commit.slice(0, 12)}` });
  const out = resolve(values.out);
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, `${values.name}.json`), json);
  await writeFile(resolve(out, `${values.name}.md`), markdown);

  const production = modularity.report.views[0]!;
  console.log(JSON.stringify({
    probe: 'modularity-baseline',
    commit: before.commit, clean: before.clean, revision,
    check: report.outcome.check, coverage: modularity.report.coverage.state,
    production: production.summary.all, behavior: production.behavior,
    changeAffinity: affinity.report.commits,
    written: [`${values.name}.json`, `${values.name}.md`].map(file => relative(process.cwd(), resolve(out, file))),
    bytes: { json: Buffer.byteLength(json), markdown: Buffer.byteLength(markdown) },
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Refusal ? `Refused: ${error.message}` : error);
  process.exitCode = error instanceof Refusal ? 2 : 1;
});
