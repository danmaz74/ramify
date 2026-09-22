import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plan2aGroupCapabilities } from './instances.js';
import { executionIdentity } from './artifact.js';
import { verifyPlan1Regression } from './completion-regression.js';
import { object, withSequenceProcess } from './equivalence-process.js';
import { recordObservation } from './observations.js';
import { plan2aInstances } from './plan2a-instances.js';
import { readReviewedPlan2a, repositoryRoot, validateInstancePointers, validateInstanceRecords } from './plan.js';
import { command } from './processes.js';
import { verifyInstances } from './runner.js';
import type { HarnessRuntime, InstanceHandler } from './runner.js';

/**
 * I2A-13: the completion gate itself. Every handler here either runs a real,
 * bounded command (build, type-check, focused tests, a real materialize/check
 * cycle on an isolated copy, the real declaration validator, real Git
 * inspection) or performs an in-memory structural check of the harness's own
 * accounting. None re-runs the heavy I2A-01..12 workloads or the measurement
 * archives a second time (see `plan2a-scale-cases.ts`'s own precedent);
 * `I2A-13:predecessor-regressions` reads the Plan 1/2/5 gate reports this
 * iteration's own verification produces immediately before the unfiltered
 * `--plan 2a` run, on the same coherent source/build identity.
 */

type Identity = Awaited<ReturnType<typeof executionIdentity>>;
// The reviewed eight package entries, and the recorded additions beside them:
// the module-tree canvas entry and its stylesheet, a string export target that
// is resolved and read but never imported. `relocation.ts` holds the same form.
const reviewedEntryMap: readonly string[] = ['.', './analysis', './analysis/inventory', './model', './presentation', './cli', './layout', './client'];
const recordedEntryAdditions: readonly string[] = ['./module-tree'];
const recordedStylesheetAdditions: readonly string[] = ['./module-tree.css'];
// Plan 2A's implementation base, its completion commit, and the changes to
// Plan 3's package that later plans reviewed. Plan 2A has no authority over a
// later plan, so its claim is bounded by its own completion; every commit that
// touched the package afterwards is named here with the decision behind it.
const plan3Directory = 'docs/plans/iteration-3-project-inspection';
const plan3Base = '71643d5';
const plan2aCompletion = 'd5c2498';
const reviewedPlan3Changes: readonly { readonly commit: string; readonly decision: string }[] = [
  { commit: '14c5c2a81962ecd52dbb0f655b21f4948958aaf9',
    decision: 'Measurement sampling is decent rather than exaggerated: the planned inspect heap plateau takes 40 answers instead of 200.' },
];

const identityFields = ['sourceSha256', 'buildSha256', 'packageVersion', 'nodeVersion', 'typescriptVersion'] as const;
const sameInputs = (a: Identity, b: Identity) => identityFields.every(field => a[field] === b[field]);

interface StoredReport {
  readonly summary: { readonly required: number; readonly passed: number; readonly failed: number; readonly notExecuted: number };
  readonly instances: readonly { readonly id: string; readonly status: string }[];
  readonly evidence?: { readonly identity?: Identity };
}

/** The newest persisted report for this plan matching the current source and
 * build bytes exactly. Never re-runs the gate: iteration 10's own
 * verification (`npm run reference:verify -- --plan 1|2|5`) must already
 * have produced it on this same coherent identity. */
async function readLatestReport(prefix: 'plan1' | 'plan2' | 'plan5', identity: Identity): Promise<StoredReport> {
  const directory = join(repositoryRoot, '.reference-work/reports');
  let names: string[];
  try { names = (await readdir(directory)).filter(name => new RegExp(`^${prefix}-full-[\\w-]+\\.json$`).test(name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') names = []; else throw error; }
  const files = await Promise.all(names.map(async name => ({ name, ...(await stat(join(directory, name))) })));
  files.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  for (const file of files) {
    const report = JSON.parse(await readFile(join(directory, file.name), 'utf8')) as StoredReport;
    if (report.evidence?.identity && sameInputs(report.evidence.identity, identity)) return report;
  }
  throw new Error(`No unfiltered ${prefix} gate report for the current source/build. Run `
    + `npm run reference:verify -- --plan ${prefix.replace('plan', '')} on this exact build first.`);
}

// The Plan 2 and Plan 5 closure baselines, captured at commit 71643d5 (before
// Plan 2A) and reproduced in iteration10-results.md's "Predecessor
// regressions" section. Plan 2 = 165/174 required passed, with exactly these
// nine I2-29 measurement rows failing (no measurement report supplied to that
// gate). Plan 5 = 91/103, with exactly these twelve rows failing: the amended
// Plan 2 gate leaf (itself failing because of the same nine I2-29 rows), the
// nine I5-13 fast-measure rows and both I5-14 regression leaves (the same
// cause, one level up). None of these are Plan 2A's to fix; a new failure
// outside these two sets, or one of these disappearing/changing reason,
// would be a real regression this leaf must catch.
const knownPlan2Failures = new Set([
  'I2-29:entry-footprints', 'I2-29:cold-warm-broad-reference', 'I2-29:cold-warm-broad-hundred',
  'I2-29:repeated-edit-plateau', 'I2-29:many-contexts', 'I2-29:slow-consumer',
  'I2-29:synthetic-500', 'I2-29:synthetic-1000', 'I2-29:publication-peak',
]);
const knownPlan5Failures = new Set([
  'I5-10:plan2-gate-amended',
  'I5-13:hook-latency-reference', 'I5-13:hook-latency-s100', 'I5-13:hook-latency-s500', 'I5-13:hook-latency-s1000',
  'I5-13:checked-set-bounded', 'I5-13:repeated-edit-plateau', 'I5-13:hot-warm-memory', 'I5-13:cold-open', 'I5-13:entry-footprints',
  'I5-14:plan1-regression', 'I5-14:plan2-regression',
]);

const focusedTestDirectories = [
  'subs/analysis/subs/model/src/tests', 'subs/analysis/subs/project/src/tests',
  'subs/analysis/subs/typescript/src/tests', 'subs/analysis/subs/descriptions/src/tests',
  'subs/analysis/src/tests', 'subs/daemon/src/tests', 'subs/daemon/subs/contexts/src/tests',
  'src/tests', 'subs/cli/src/tests',
];

/** A minimal isolated copy of R or T for a real materialize/check cycle:
 * `node_modules` is symlinked from the real checkout, never copied, matching
 * `plan2a-workflow-cases.ts`'s own convention. No Git repository is needed
 * here (unlike I2A-11): this leaf checks `check`'s own output, not Git
 * status. */
async function isolatedCopy(kind: 'R' | 'T', scratchRoot: string): Promise<{ readonly root: string; dispose(): Promise<void> }> {
  await mkdir(scratchRoot, { recursive: true });
  const root = await mkdtemp(join(scratchRoot, `${kind.toLowerCase()}-`));
  const source = kind === 'R' ? join(repositoryRoot, 'examples/collection-review') : repositoryRoot;
  const excluded = kind === 'R' ? ['node_modules', 'dist', '.reference-work', '.git', '.vite']
    : ['node_modules', 'dist', '.git', '.reference-work', 'site', 'examples', '.cucumber-viz', '.claude', '.agents', '.devcontainer', '.github', '.vite'];
  const copy = await command(repositoryRoot, 'bash', ['-c',
    `cp -a ${JSON.stringify(source)}/. ${JSON.stringify(root)}/ && `
    + excluded.map(name => `rm -rf ${JSON.stringify(join(root, name))}`).join(' && ')
    + ` && find ${JSON.stringify(root)} -maxdepth 8 \\( -name '.ramify' -o -name '.ramify.tmp-*' -o -name '.ramify.old-*' \\) -exec rm -rf {} +`], 120_000);
  if (copy.code !== 0) throw new Error(`Isolated ${kind} copy failed: ${copy.stderr}`);
  await symlink(join(source, 'node_modules'), join(root, 'node_modules'));
  return { root, dispose: () => rm(root, { recursive: true, force: true }) };
}

export const plan2aCompletionHandlers: ReadonlyMap<string, InstanceHandler> = new Map<string, InstanceHandler>([
  ['I2A-13:all-instances', { kind: 'memory', run: async ({ assertions: a }) => {
    const plan = readReviewedPlan2a();
    a.equal('independent reviewed leaf count', plan.members.length, 104);
    a.equal('all 104 executable records present', plan2aInstances.length, 104);
    a.equal('every reviewed field transcribed', validateInstanceRecords(plan2aInstances, plan), []);
    a.equal('all pointers resolve', validateInstancePointers(plan2aInstances), []);
    const workRoot = join(repositoryRoot, '.reference-work');
    const stub: InstanceHandler = { kind: 'memory', run: ({ assertions: checks }) => { checks.ok('stub leaf runs and passes', true); } };
    const stubbedRuntime: HarnessRuntime = {
      capabilities: new Set(Object.values(plan2aGroupCapabilities)),
      handlers: new Map(plan2aInstances.map(item => [item.id, stub])),
    };
    // Once every group's capability and handler exist (true once iteration 10
    // registers I2A-13's own handlers alongside iterations 1-9's), the
    // harness's own accounting must reach full closure: all ten iterations
    // required, all 104 leaves required and passed, the plan complete.
    const complete = await verifyInstances({ plan, records: plan2aInstances, runtime: stubbedRuntime, workRoot });
    a.equal('every iteration becomes required once every handler exists', complete.requiredIterations, Array.from({ length: 10 }, (_, i) => i + 1));
    a.equal('the harness accounts for and can complete all 104 reviewed leaves', complete.summary, { required: 104, passed: 104, failed: 0, notExecuted: 0 });
    a.equal('the stubbed gate is reported complete', [complete.passed, complete.planComplete], [true, true]);
    // A genuinely failing required leaf (the honest, expected macOS outcome)
    // must stay failed: never silently dropped, waived or reported passed.
    const failing = new Map(stubbedRuntime.handlers);
    failing.set('I2A-12:linux-macos-bytes', {
      kind: 'memory', run: ({ assertions: checks }) => { checks.equal('no macOS artifact on this host', 'darwin-report', 'missing'); },
    });
    const honest = await verifyInstances({ plan, records: plan2aInstances, runtime: { capabilities: stubbedRuntime.capabilities, handlers: failing }, workRoot });
    a.equal('a genuinely failing required leaf keeps the gate honestly incomplete', honest.summary, { required: 104, passed: 103, failed: 1, notExecuted: 0 });
    a.equal('the gate is reported failed and incomplete, never silently passed', [honest.passed, honest.planComplete], [false, false]);
    const macos = honest.instances.find(item => item.id === 'I2A-12:linux-macos-bytes')!;
    a.equal('the failing leaf is reported failed, never waived or not-executed', macos.status, 'failed');
  } }],

  ['I2A-13:build-tests', { kind: 'memory', run: async ({ assertions: a }) => {
    const build = await command(repositoryRoot, 'npm', ['run', 'build'], 300_000);
    a.equal('npm run build succeeds', [build.code, build.error], [0, null]);
    const typeCheck = await command(repositoryRoot, 'npm', ['run', 'type-check'], 300_000);
    a.equal('npm run type-check succeeds', [typeCheck.code, typeCheck.error], [0, null]);
    const vitest = await command(repositoryRoot, 'npx', ['vitest', 'run', ...focusedTestDirectories], 300_000);
    a.equal('every focused owner Vitest directory passes', [vitest.code, vitest.error], [0, null]);
    const harnessFocused = await command(repositoryRoot, 'npx',
      ['vitest', 'run', '-c', 'scripts/reference-harness/vitest.config.ts', 'scripts/reference-harness/plan2a.test.ts', 'scripts/reference-harness/final-contracts.test.ts'], 300_000);
    a.equal('the focused Plan 2A and final-contracts harness tests pass', [harnessFocused.code, harnessFocused.error], [0, null]);
    const referenceCases = await command(repositoryRoot, 'npm', ['run', 'reference:cases'], 900_000);
    a.equal('npm run reference:cases passes', [referenceCases.code, referenceCases.error], [0, null]);
    // The user's standing preference: full-suite verification goes through
    // the cucumber-viz audit, not a bare `npm test` run here. Recorded
    // explicitly rather than silently skipped or falsely claimed passing.
    recordObservation('plan2a-build-tests', {
      build: build.code, typeCheck: typeCheck.code, focusedVitest: vitest.code, harnessFocused: harnessFocused.code,
      referenceCases: referenceCases.code, fullVitestSuite: 'delegated to cucumber-viz audit, not run locally',
    });
  } }],

  ['I2A-13:self-reference-checks', { kind: 'memory', run: async ({ assertions: a }) => {
    const scratch = await mkdtemp(join(tmpdir(), 'plan2a-i13-self-reference-'));
    try {
      await withSequenceProcess(async processes => {
        for (const kind of ['R', 'T'] as const) {
          const project = await isolatedCopy(kind, scratch);
          try {
            const before = await processes.check(project.root, false);
            a.equal(`${kind}: the pre-materialize check has no denial`, before.summary.denied, 0);
            const materialized = await processes.run(project.root, ['materialize', '--all']);
            a.equal(`${kind}: materialize --all succeeds`, materialized.code, 0);
            const after = await processes.check(project.root, false);
            a.equal(`${kind}: generated views leave the checked input identity unchanged`, after.inputId, before.inputId);
            a.equal(`${kind}: check has no denial with generated views present`, after.summary.denied, 0);
            const repeat = await processes.run(project.root, ['materialize', '--all']);
            a.equal(`${kind}: an unchanged repeat exits 0`, repeat.code, 0);
          } finally { await project.dispose(); }
        }
      });
    } finally { await rm(scratch, { recursive: true, force: true }); }
  } }],

  ['I2A-13:predecessor-regressions', { kind: 'memory', run: async ({ assertions: a }) => {
    const identity = await executionIdentity();
    const plan1 = await verifyPlan1Regression();
    a.equal('Plan 1 has no regression: still 308/308 with zero failures', plan1.summary, { required: 308, passed: 308, failed: 0, notExecuted: 0 });
    const plan2 = await readLatestReport('plan2', identity);
    const plan2Failures = plan2.instances.filter(item => item.status === 'failed').map(item => item.id).sort();
    // A subset check, not exact-set equality: a known-baseline row is allowed
    // to newly pass (never a regression), but no failure outside the known
    // set may appear, and required/failed never exceed the baseline.
    a.equal('Plan 2 has no failure outside its recorded closure-baseline measurement rows', plan2Failures.filter(id => !knownPlan2Failures.has(id)), []);
    a.equal('Plan 2 required count matches its recorded closure baseline', plan2.summary.required, 174);
    a.ok('Plan 2 passed count is at least its recorded closure baseline (165)', plan2.summary.passed >= 165);
    const plan5 = await readLatestReport('plan5', identity);
    const plan5Failures = plan5.instances.filter(item => item.status === 'failed').map(item => item.id).sort();
    a.equal('Plan 5 has no failure outside its recorded closure-baseline rows, no old waiver relabelled into a new reason', plan5Failures.filter(id => !knownPlan5Failures.has(id)), []);
    a.equal('Plan 5 required count matches its recorded closure baseline', plan5.summary.required, 103);
    a.ok('Plan 5 passed count is at least its recorded closure baseline (91)', plan5.summary.passed >= 91);
    recordObservation('plan2a-predecessor-regressions', { plan1: plan1.summary, plan2: plan2.summary, plan5: plan5.summary,
      plan2Failures, plan5Failures, knownPlan2Failures: [...knownPlan2Failures], knownPlan5Failures: [...knownPlan5Failures] });
  } }],

  ['I2A-13:declarations-package', { kind: 'memory', run: async ({ assertions: a }) => {
    const result = await command(repositoryRoot, process.execPath, ['--import', 'tsx', 'scripts/validate-final-contracts.ts']);
    recordObservation('plan2a-final-contracts-process', result);
    a.equal('the strict final-contract process accepts the real package', [result.code, result.signal, result.error], [0, null, null]);
    const value = object(JSON.parse(result.stdout));
    // The eleven archived declarations, the four owners Plan 6 added as a named
    // layer, and the eight reviewed package entries the validator returns.
    a.equal('fifteen layered declarations and eight reviewed package entries validated', [value.owners, value.packageEntries], [15, 8]);
    a.ok('real exposures were linked', Number(value.expandedStatements) > 0);
    const pkg = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as
      { readonly dependencies?: Record<string, string>; readonly devDependencies?: Record<string, string>; readonly exports: Record<string, unknown>; readonly bin: unknown };
    const allDependencies = { ...pkg.dependencies, ...pkg.devDependencies };
    a.equal('no MCP dependency appears anywhere in package.json', Object.keys(allDependencies).some(name => /model-context-protocol|modelcontextprotocol/i.test(name)), false);
    const entryKeys = Object.keys(pkg.exports);
    a.equal('the reviewed eight package export entries are unchanged', entryKeys.filter(key => reviewedEntryMap.includes(key)), reviewedEntryMap);
    a.equal('the only other export entries are the recorded additions',
      entryKeys.filter(key => !reviewedEntryMap.includes(key)), [...recordedEntryAdditions, ...recordedStylesheetAdditions]);
    // A stylesheet entry is a string target: one packed file, read and never imported.
    a.equal('every recorded stylesheet addition is a string file target',
      recordedStylesheetAdditions.map(key => typeof pkg.exports[key]), recordedStylesheetAdditions.map(() => 'string'));
    a.equal('the installed launcher target is unchanged', pkg.bin, { ramify: 'dist/src/ramify' });
  } }],

  ['I2A-13:documents-handoff', { kind: 'memory', run: async ({ assertions: a }) => {
    const read = async (path: string) => readFile(join(repositoryRoot, path), 'utf8');
    const spec = await read('docs/architecture/materialized-api-view.spec.md');
    a.ok('the specification records an implemented status', /\bimplemented\b/i.test(spec.split('\n').slice(0, 20).join('\n')));
    const roadmap = await read('docs/roadmap.md');
    a.ok('the roadmap records Plan 2A', /Plan 2A/.test(roadmap));
    const main = await read('docs/plans/iteration-2a-materialized-api-view/main-plan.md');
    a.ok('the main plan status line is revised for completion', /\*\*Status:\*\*[^\n]*implement/i.test(main));
    const testing = await read('docs/development/testing.md');
    a.ok('the testing guide documents the --plan 2a verify command', testing.includes('--plan 2a'));
    recordObservation('plan2a-documents-handoff', { checked: ['materialized-api-view.spec.md', 'roadmap.md', 'main-plan.md', 'testing.md'] });
  } }],

  ['I2A-13:plan3-preserved', { kind: 'memory', run: async ({ assertions: a }) => {
    const status = await command(repositoryRoot, 'git', ['status', '--porcelain', '--', plan3Directory]);
    a.equal('no working-tree change under the Plan 3 directory', status.stdout.trim(), '');
    // Plan 2A's exit criterion 8 asks whether Plan 2A replaced or edited
    // Plan 3's package. That is settled at Plan 2A's own completion and does
    // not change afterwards. Comparing the working tree answered it only while
    // Plan 2A was the tip, which it was when this case was written.
    const diff = await command(repositoryRoot, 'git', ['diff', '--quiet', plan3Base, plan2aCompletion, '--', plan3Directory]);
    a.equal('the Plan 3 tree at Plan 2A completion equals its implementation-base Git tree byte-for-byte', diff.code, 0);
    // Nothing is loosened: a later change to Plan 3's package still fails
    // unless it is one of the recorded approved decisions.
    const later = await command(repositoryRoot, 'git', ['log', '--format=%H', `${plan2aCompletion}..HEAD`, '--', plan3Directory]);
    a.equal('every later change to the Plan 3 tree is a recorded approved decision',
      later.stdout.trim().split('\n').filter(Boolean), reviewedPlan3Changes.map(item => item.commit));
  } }],
]);
