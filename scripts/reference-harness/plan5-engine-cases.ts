import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isIdentifier } from 'typescript/unstable/ast';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import { createAccessInterpreter } from '../../subs/analysis/subs/typescript/src/access-interpreter.js';
import { materializeSynthetic } from '../measurements/materialize.js';
import { createProjectFixture, put } from './fixtures/plan1/project.js';
import { prepareReferenceEdits } from './fixtures/plan2/reference.js';
import { repositoryRoot } from './plan.js';
import { recordObservation } from './observations.js';
import { command } from './processes.js';
import { sessionInputs } from './session-expectations.js';
import { withNativeInterpreter, withSourceInputs } from './plan5-engine-fixture.js';
import type { Assertions, InstanceHandler, ProjectContext } from './runner.js';

const revision = 'e0be049658b922ba6606172f1cf5166c01a49f1d';
// The I5-01 equality instances compare the two builds Plan 5 iteration 2 was
// reviewed against: `revision` before the change and `candidate` (2c4ae04c,
// "iteration 2 — engine changes and the --plan 5 harness", whose parent is
// `revision`) with the lazy namespace index and the indexed decide stage.
// The candidate side used to be the working tree's engine. Later plans changed
// that engine in ways a byte comparison with `revision` cannot absorb (Plan 8
// signature companions, the project boundary's root marker and auxiliary
// source), so the coordinator re-pinned the candidate on 2026-10-04: the case
// keeps proving that those two Plan 5 changes preserved behaviour and no
// longer depends on any later engine.
const candidate = '2c4ae04cc144be190557a75a3b15ff0edeff5d31';
const handlers = new Map<string, InstanceHandler>();
const semantic = (report: AnalysisReport): string => { const { runId: _runId, ...rest } = report; return JSON.stringify(rest); };
const hash = (text: string): string => createHash('sha256').update(text).digest('hex');

/** Extracts `paths` of a pinned tree into `root` through the `archive` file. */
async function extractPinned(treeish: string, paths: readonly string[], root: string, archive: string): Promise<void> {
  await writeFile(archive, execFileSync('git', ['archive', treeish, ...paths], { cwd: repositoryRoot, maxBuffer: 32 * 1024 ** 2 }));
  const result = await command(repositoryRoot, 'tar', ['-xf', archive, '-C', root]);
  assert.equal(result.code, 0, result.stderr);
}

/** The reviewed 229-file toolkit baseline exactly as the pinned engines read it. */
async function pinnedToolkit(root: string): Promise<void> {
  await extractPinned(revision, ['src', 'subs', 'module.ramify', 'README.md', 'package.json', 'package-lock.json', 'tsconfig.json'],
    root, join(root, 'fixture.tar'));
  // The archive is outside the configured src/subs source roots.
  await symlink(join(repositoryRoot, 'node_modules'), join(root, 'node_modules'));
}

/** A pinned input fixture preserves the reviewed 229-file toolkit baseline for the current engine. */
export async function toolkitFixture(root: string): Promise<void> {
  await pinnedToolkit(root);
  // The pinned root predates the root marker; mark the copy's module line
  // before any acquisition, because the current engine rejects an unmarked root.
  const description = join(root, 'module.ramify');
  const pinned = await readFile(description, 'utf8');
  const header = 'ramify 1\nmodule "ramify" tagged [dispatch]\n';
  assert.ok(pinned.startsWith(header), 'Unexpected pinned toolkit root header');
  await writeFile(description, `ramify 1\nroot ${pinned.slice('ramify 1\n'.length)}`);
}

/** The reference example as both pinned builds read it; it is unchanged between them. */
async function pinnedReference(root: string): Promise<void> {
  await extractPinned(`${revision}:examples/collection-review`, [], root, join(dirname(root), 'reference.tar'));
}

/**
 * Each comparison side is the whole pinned analysis owner, run from its own
 * sources, so no current source or stale `dist/` file takes part in either
 * report. Both pinned builds predate the root marker and auxiliary source, so
 * they read the unmarked pinned fixtures as their reviewed runs did.
 */
async function pinnedEngine(pin: string, root: string): Promise<void> {
  await mkdir(root);
  await extractPinned(pin, ['subs/analysis', 'package.json', 'tsconfig.json'], root, join(root, 'engine.tar'));
  await symlink(join(repositoryRoot, 'node_modules'), join(root, 'node_modules'));
}

interface PinnedRun { readonly inputs: unknown; readonly report: AnalysisReport }
async function report(engine: string, root: string, directory: string, before: boolean): Promise<PinnedRun> {
  const input = join(directory, 'inputs.json'), output = join(directory, before ? 'before.json' : 'after.json');
  await writeFile(input, JSON.stringify(sessionInputs(root)));
  const result = await command(engine, process.execPath,
    ['--import', 'tsx', join(repositoryRoot, 'scripts/reference-harness/plan5-report-worker.mjs'), engine, input, output], 180_000);
  assert.deepEqual([result.code, result.error, result.stderr], [0, null, '']);
  return JSON.parse(await readFile(output, 'utf8')) as PinnedRun;
}

async function compare(engines: { readonly before: string; readonly after: string }, root: string, directory: string,
  assertions: Assertions, fixture: string): Promise<void> {
  const { inputs: request, report: before } = await report(engines.before, root, directory, true);
  const { inputs: candidateRequest, report: after } = await report(engines.after, root, directory, false);
  assertions.equal(`${fixture}: both pinned engines receive the same request`, candidateRequest, request);
  // The reviewed baseline of both pinned builds (iteration 2 results).
  const expected = fixture === 'R' ? [15, 294, 2] : [11, 2744, 0];
  assertions.equal(`${fixture}: recorded baseline owners, accesses and warnings`,
    [before.summary.owners, before.summary.accesses, before.summary.warnings], expected);
  assertions.equal(`${fixture}: complete baseline with no findings`, [before.outcome, before.diagnostics, before.coverage],
    [{ execution: 'completed', check: 'passed', coverage: 'complete' }, [], []]);
  if (fixture === 'T') assertions.equal('T: recorded source file count', before.summary.sourceFiles, 229);
  assertions.equal(`${fixture}: complete report bytes except runId`, semantic(after), semantic(before));
  assertions.equal(`${fixture}: decisions and order`, after.snapshot!.results, before.snapshot!.results);
  assertions.equal(`${fixture}: diagnostic identities`, after.diagnostics, before.diagnostics);
  recordObservation('plan5-batch-equality', { fixture, baselineRevision: revision, candidateRevision: candidate,
    beforeSha256: hash(semantic(before)), afterSha256: hash(semantic(after)), inputId: after.inputId, summary: after.summary });
}

for (const id of ['namespace-lazy-equal', 'decide-indexed-equal']) {
  handlers.set(`I5-01:${id}`, {
    kind: 'project', fixture: { kind: 'create', create: async root => { await mkdir(join(root, 'toolkit')); await pinnedToolkit(join(root, 'toolkit')); } },
    // Each comparison also checks independent baseline outcomes before equality.
    baseline: ({ assertions }) => {
      assertions.ok('pinned baseline revision is explicit', /^[a-f0-9]{40}$/.test(revision));
      assertions.ok('pinned candidate revision is explicit', /^[a-f0-9]{40}$/.test(candidate));
    },
    mutate: async () => {},
    run: async ({ root, runDirectory, assertions }) => {
      const engines = { before: join(runDirectory, 'engine-before'), after: join(runDirectory, 'engine-after') };
      await pinnedEngine(revision, engines.before);
      await pinnedEngine(candidate, engines.after);
      const { runIsolatedProject } = await import('./mutation.js');
      const result = await runIsolatedProject({ instanceId: `I5-01:${id}`, workRoot: join(repositoryRoot, '.reference-work'),
        fixture: { kind: 'create', create: pinnedReference } }, async project => {
        await prepareReferenceEdits(project.root);
        await compare(engines, project.root, project.runDirectory, assertions, 'R');
      });
      if (!result.ok) throw result.error;
      await compare(engines, join(root, 'toolkit'), runDirectory, assertions, 'T');
    },
  });
}

const fixture = { kind: 'project' as const, fixture: { kind: 'create' as const, create: createProjectFixture },
  baseline: async ({ root, assertions }: { root: string; assertions: Assertions }) => {
    assertions.ok('F baseline has the recorded named value import', (await readFile(join(root, 'subs/consumer/src/probe.ts'), 'utf8')).includes('import { value }'));
  },
};
handlers.set('I5-01:namespace-shadowing', { ...fixture,
  mutate: ({ root }) => put(root, 'subs/consumer/src/shadow.ts', `import * as api from '../../provider/src/interfaces/api.js';
function shadow() { const api = { value: 2 }; return api.value; }
function outer() { return api.value; }
`),
  run: ({ root, assertions }: ProjectContext) => withSourceInputs(root, async inputs => {
    const interpreter = await createAccessInterpreter(inputs);
    try {
      const result = await interpreter.interpret(['subs/consumer/src/shadow.ts']);
      assertions.equal('shadowed local contributes no access', result.accesses.length, 1);
      assertions.equal('outer read selects the provider value', result.accesses.map(access => [access.selectionForm,
        access.selections[0].exportedName, access.selections[0].original?.owner, access.selections[0].location.line]),
      [['direct-member', 'value', 'fixture/provider', 3]]);
      assertions.equal('no shadowing coverage limit', result.coverage, []);
    } finally { await interpreter.dispose(); }
  }),
});
handlers.set('I5-01:zero-queries-without-namespaces', { ...fixture, mutate: async () => {},
  run: ({ root, assertions }: ProjectContext) => withNativeInterpreter(root, async ({ project, interpreter }) => {
    const checker = project.checker, original = checker.getSymbolAtLocation.bind(checker);
    let identifierQueries = 0;
    checker.getSymbolAtLocation = ((node: Parameters<typeof original>[0]) => {
      identifierQueries += (Array.isArray(node) ? node : [node]).filter(isIdentifier).length;
      return original(node as never);
    }) as unknown as typeof checker.getSymbolAtLocation;
    try {
      const result = interpreter.interpret(['subs/consumer/src/probe.ts']);
      assertions.equal('zero identifier symbol queries without a namespace binding', identifierQueries, 0);
      assertions.equal('named access still selects value', result.accesses.map(access => [access.form, access.selections[0].exportedName]), [['import', 'value']]);
      const whole = interpreter.interpret(interpreter.ordered);
      assertions.equal('same named access as whole pass', result.accesses, whole.accesses.filter(access => access.location.file === 'subs/consumer/src/probe.ts'));
    } finally { checker.getSymbolAtLocation = original; }
  }),
});
handlers.set('I5-01:only-subset-equal', {
  kind: 'project', fixture: { kind: 'create', create: toolkitFixture },
  baseline: ({ assertions }) => { assertions.ok('T baseline revision fixed', revision.length === 40); }, mutate: async () => {},
  run: ({ root, assertions }: ProjectContext) => withSourceInputs(root, async inputs => {
    const interpreter = await createAccessInterpreter(inputs);
    try {
      const all = await interpreter.interpret(inputs.inventory.files.map(file => file.path));
      const paths = ['src/batch.ts', 'subs/analysis/subs/typescript/src/accesses.ts', 'subs/analysis/subs/typescript/src/tests/accesses.test.ts'];
      const subset = await interpreter.interpret(paths);
      assertions.equal('three files, exact accesses, coverage and candidates', subset, {
        accesses: all.accesses.filter(access => paths.includes(access.location.file)),
        coverage: all.coverage.filter(issue => paths.includes(issue.location.file)),
        candidates: all.candidates.filter(item => paths.includes(item.file)),
      });
      assertions.equal('three per-file candidate records', subset.candidates.length, 3);
      assertions.ok('subset contains real accesses', subset.accesses.length > 0);
    } finally { await interpreter.dispose(); }
  }),
});
handlers.set('I5-01:hoisted-setup-bounded', {
  kind: 'project', fixture: { kind: 'create', create: async root => { await materializeSynthetic(join(root, 'synthetic'), 'S1000'); } },
  baseline: async ({ root, assertions }) => {
    assertions.ok('S1000 generated its root declaration', (await readFile(join(root, 'synthetic/module.ramify'), 'utf8')).startsWith('ramify 1'));
  }, mutate: async () => {},
  run: ({ root, assertions }: ProjectContext) => withNativeInterpreter(join(root, 'synthetic'), async ({ inputs, interpreter, traversals }) => {
    assertions.equal('real S1000 owner count', inputs.inventory.modules.length, 1000);
    assertions.equal('catalog map plus runtime-path pass, original map, two inventory indexes constructed once', traversals, { catalog: 2, originals: 1, inventory: 2 });
    const before = { ...traversals };
    const file = inputs.inventory.files.find(file => file.kind === 'source')!.path;
    let first: ReturnType<typeof interpreter.interpret> | undefined;
    for (let index = 0; index < 20; index++) {
      const result = interpreter.interpret([file]);
      first ??= result;
      assertions.equal(`one-file call ${index + 1} equals the first`, result, first);
    }
    assertions.equal('real one-file interpretations select value and Input', first!.accesses.map(access => access.selections[0]?.exportedName), ['value', 'Input']);
    assertions.equal('one-file interpretation has no coverage limit', first!.coverage, []);
    assertions.equal('twenty calls never traverse a project-sized setup input', traversals, before);
    recordObservation('plan5-hoisted-setup', { owners: 1000, calls: 20, target: file, before, after: traversals });
  }),
});
export const plan5EngineHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
