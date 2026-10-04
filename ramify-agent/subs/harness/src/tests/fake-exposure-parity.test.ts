import { rootDescription } from './helpers/root-description.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { localDecision, registryChange } from './helpers/placement.js';
import { addModule, assign, byRole, completionProposed, installMiniRunner, outline, readDeclaredTree, submit, treeInputs, write } from './helpers/iterations.js';
import { onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { accepted, added, answeredGit, modified, unchanged, type CommitResponse, scenariosCommitted } from './helpers/contracts-git.js';
import { finalCandidate } from './helpers/final-candidate.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));
import type { ArchitectIndex, ModuleEntry, SymbolRecord } from '../../subs/evidence/src/views.js';
import { fakeExposureParity, type StandIn } from '../contracts/parity.js';
import { validateContract } from '../contracts/submission.js';
import { registerContract } from '../contracts/accept.js';
import { runLayout } from '../run/records.js';
import type { GateAttempt } from '../checks/records.js';
import type { RunInputs } from '../run/inputs.js';

/*
 * A fake is exactly as importable as the real export it stands for.
 *
 * The agreement names, for every fake export, the real provider export it
 * stands for and the exposure it declares for it. The gate compares the
 * modules that receive each from the architect view Ramify generates: at the
 * contract gate against the declared exposure while the real export does
 * not exist, and at every later gate against whatever the view records. A
 * retired fake is out of the rule, and a declaration that still exposes it
 * is named.
 *
 * The first shape here is the one a real run produced: the analysis module's
 * fake of import-diagnostic enrichment, which the root re-exposed to its
 * descendants although the real enrichment reaches the command line as
 * report data and never as an import.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0)) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

// The toolkit's shape, as the run's architect view recorded it.

const fakePath = 'subs/analysis/src/fakes/enrich-import-diagnostics.fake.ts';
const realPath = 'subs/analysis/src/enrich-import-diagnostics.ts';

function module(name: string, dir: string, parent: string | null, children: string[] = []): ModuleEntry {
  return { module: name, dir, parent, children, tags: [], areas: ['src', 'src/tests'] };
}

function toolkit(records: readonly SymbolRecord[]): ArchitectIndex {
  const modules = [
    module('ramify', '', null, ['ramify/analysis', 'ramify/cli', 'ramify/daemon']),
    module('ramify/analysis', 'subs/analysis', 'ramify'),
    module('ramify/cli', 'subs/cli', 'ramify'),
    module('ramify/daemon', 'subs/daemon', 'ramify'),
  ];
  return {
    revision: 'view/1',
    input: 'input/1',
    modules: new Map(modules.map(entry => [entry.module, entry])),
    symbols: new Map([['ramify/analysis', [...records]]]),
  };
}

const fakeRecord = (extra: Partial<SymbolRecord> = {}): SymbolRecord => ({
  module: 'ramify/analysis', name: 'enrichImportDiagnosticsFake', file: fakePath, role: 'exposed', to: ['parent'], ...extra,
});
const realRecord = (extra: Partial<SymbolRecord> = {}): SymbolRecord => ({
  module: 'ramify/analysis', name: 'enrichImportDiagnostics', file: realPath, role: 'exposed', to: ['parent'], ...extra,
});
const reexposedByRoot = [{ by: 'ramify', to: ['descendants' as const] }];

function standIn(extra: Partial<StandIn> = {}): StandIn {
  return {
    contract: 'the agreement under this gate',
    fakePath,
    standsFor: { fake: 'enrichImportDiagnosticsFake', path: realPath, export: 'enrichImportDiagnostics', exposure: { to: ['parent'], reexposed: [] } },
    declaredHere: true,
    ...extra,
  };
}

/** The tree the rule reads: each project-relative file's text, and nothing else. */
function tree(files: Readonly<Record<string, string>>) {
  return async (path: string) => files[path] ?? null;
}

const fakeSource = 'export const enrichImportDiagnosticsFake = (report) => report;\n';
const declarations = {
  'module.ramify': rootDescription('"ramify"', "\n// CLI uses the explicitly named analysis stand-in.\nexpose-sub enrichImportDiagnosticsFake from analysis to descendants\n"),
  'subs/analysis/module.ramify': 'ramify 1\nmodule analysis\nexpose-src enrichImportDiagnosticsFake from "fakes/enrich-import-diagnostics.fake.ts" to parent\n',
};

describe('the contract names what each fake stands for', () => {
  const validation = 'collection-review/workspace/reviews/validation';
  const validationDirectory = 'subs/workspace/subs/reviews/subs/validation';

  async function evidence() {
    const fixture = await copyFixture();
    try {
      return { index: await readDeclaredTree(fixture.root), consumer: 'collection-review/workspace/reviews', exists: async () => true };
    } finally {
      await fixture.remove();
    }
  }

  function established(fake: Record<string, unknown>) {
    return {
      kind: 'established',
      mode: 'fake-backed',
      authority: { kind: 'provider', owner: validation, rationale: 'The capability\'s public contract belongs with its implementation.' },
      provider: validation,
      behavior: 'Import denials carry an explanation.',
      artifacts: {
        interface: [{ path: `${validationDirectory}/src/interfaces/enrich.ts`, exports: ['EnrichImportDiagnostics'] }],
        conformance: [{ path: `${validationDirectory}/src/tests/enrich.conformance.test.ts` }],
        fake: [{ path: `${validationDirectory}/src/fakes/enrich.fake.ts`, exports: ['enrichFake', 'EnrichFake'], ...fake }],
        exposure: [],
      },
      fakeInjections: [`${validationDirectory}/src/report.ts`],
      summary: 'The agreement is established.',
    };
  }

  const standsFor = (fake: string, extra: Record<string, unknown> = {}) => ({
    fake, path: `${validationDirectory}/src/enrich.ts`, export: 'enrich', exposure: { to: ['parent'], reexposed: [] }, ...extra,
  });

  test('every fake export names one real provider export, which need not exist yet, and the exposure declared for it', async () => {
    const known = await evidence();
    const accepted = await validateContract(established({ standsFor: [standsFor('enrichFake'), standsFor('EnrichFake', { export: 'Enrich' })] }), known);
    expect(accepted.ok).toBe(true);

    // The submission as the real run made it, with nothing to compare the fake with.
    const unnamed = await validateContract(established({}), known);
    expect(unnamed.ok).toBe(false);
    if (!unnamed.ok) expect(unnamed.errors.map(error => error.path)).toContain('artifacts.fake.0.standsFor');

    const judged = await validateContract(established({
      standsFor: [
        standsFor('enrichFake'),
        // Named twice, and one name the file does not export.
        standsFor('enrichFake'),
        standsFor('otherFake'),
        // A fake stands for the real export, in the provider, re-exposed only by an ancestor.
        standsFor('EnrichFake', {
          path: 'subs/workspace/subs/catalog/src/enrich.ts',
          exposure: { to: ['parent', 'parent'], reexposed: [{ by: 'collection-review/workspace/catalog', to: ['descendants'] }] },
        }),
      ],
    }), known);
    expect(judged.ok).toBe(false);
    if (judged.ok) return;
    const byPath = new Map(judged.errors.map(error => [error.path, error.message]));
    expect(byPath.get('artifacts.fake.0.standsFor')).toContain('"enrichFake" stands for 2 real exports');
    expect(byPath.get('artifacts.fake.0.standsFor.2.fake')).toContain('"otherFake" is not one of this fake file\'s exports');
    expect(byPath.get('artifacts.fake.0.standsFor.3.path')).toContain(`not a file of the provider ${validation}`);
    expect(byPath.get('artifacts.fake.0.standsFor.3.exposure.to')).toContain('named twice');
    expect(byPath.get('artifacts.fake.0.standsFor.3.exposure.reexposed.0.by')).toContain('is not an ancestor of the provider');

    const onAFake = await validateContract(established({
      standsFor: [standsFor('enrichFake', { path: `${validationDirectory}/src/fakes/other.fake.ts` }), standsFor('EnrichFake')],
    }), known);
    expect(onAFake.ok).toBe(false);
    if (!onAFake.ok) expect(onAFake.errors[0]!.message).toContain('is a fake');
  });

  test('the registered contract records what each fake stands for, as submitted', () => {
    const reexposed = { to: ['parent'], reexposed: [{ by: 'collection-review/workspace/reviews', to: ['descendants'] }] };
    const submission = established({ standsFor: [standsFor('enrichFake', { exposure: reexposed }), standsFor('EnrichFake', { export: 'Enrich' })] });
    const hash = 'e'.repeat(64);
    const registration = registerContract({
      contract: 'ct-001',
      revision: 1,
      capability: { ref: { id: 'enrich', revision: 1, hash }, slug: 'enrich', decision: null },
      submission: submission as never,
      hashes: new Map([
        ...submission.artifacts.interface.map(entry => [entry.path, hash] as const),
        ...submission.artifacts.conformance.map(entry => [entry.path, hash] as const),
        ...submission.artifacts.fake.map(entry => [entry.path, hash] as const),
      ]),
      establishedBy: { iteration: 'wi-001.i02', gate: 'ga-0002' },
      consumers: [],
      provider: { kind: 'none' },
    });
    expect(registration.contract.schema).toBe('ramify-agent.contract/2');
    expect(registration.contract.artifacts.fake[0]!.standsFor).toEqual([standsFor('enrichFake', { exposure: reexposed }), standsFor('EnrichFake', { export: 'Enrich' })]);
  });
});

describe('the fake-exposure-parity rule', () => {
  test('at the contract gate, the root\'s re-exposure of the fake to its descendants fails, naming the extra exposure and the real export', async () => {
    const rule = await fakeExposureParity({
      index: toolkit([fakeRecord({ reexposed: reexposedByRoot })]),
      standIns: [standIn()],
      read: tree({ [fakePath]: fakeSource, ...declarations }),
      writeScope: ['subs/cli', 'module.ramify', 'subs/analysis/module.ramify'],
    });
    expect(rule.outcome).toBe('failed');
    expect(rule.violations).toEqual([{
      rule: 'extra-exposure',
      path: 'module.ramify',
      detail: expect.stringContaining('ramify re-exposes the fake `enrichImportDiagnosticsFake`'),
    }]);
    const detail = rule.violations[0]!.detail;
    expect(detail).toContain(`\`enrichImportDiagnostics\` (${realPath})`);
    expect(detail).toContain('as the agreement declares it');
    expect(detail).toContain('ramify/cli, ramify/daemon would receive the fake and not the real export');
    expect(rule.limits).toBeUndefined();
  });

  test('a fake exposed exactly as the declared real export passes, and so does one the real export, once written, matches', async () => {
    const read = tree({ [fakePath]: fakeSource, 'subs/analysis/module.ramify': declarations['subs/analysis/module.ramify'] });
    const declared = await fakeExposureParity({ index: toolkit([fakeRecord()]), standIns: [standIn()], read, writeScope: [] });
    expect(declared).toEqual({ rule: 'fake-exposure-parity', outcome: 'passed', violations: [] });

    // Once the real export exists, the view's record of it is what counts,
    // whatever the agreement declared.
    const recorded = await fakeExposureParity({
      index: toolkit([fakeRecord({ reexposed: reexposedByRoot }), realRecord({ reexposed: reexposedByRoot })]),
      standIns: [standIn()],
      read,
      writeScope: [],
    });
    expect(recorded.outcome).toBe('passed');

    const narrower = await fakeExposureParity({ index: toolkit([fakeRecord(), realRecord({ reexposed: reexposedByRoot })]), standIns: [standIn()], read, writeScope: [] });
    expect(narrower.outcome).toBe('failed');
    expect(narrower.violations).toEqual([expect.objectContaining({ rule: 'missing-exposure', path: 'module.ramify' })]);
    expect(narrower.violations[0]!.detail).toContain('as the architect view records it');
  });

  test('a fake owned elsewhere, or in another source area, is not as importable as its real export', async () => {
    const elsewhere = 'subs/cli/src/fakes/enrich-import-diagnostics.fake.ts';
    const owner = await fakeExposureParity({
      index: toolkit([]),
      standIns: [standIn({ fakePath: elsewhere })],
      read: tree({ [elsewhere]: fakeSource }),
      writeScope: [],
    });
    expect(owner.outcome).toBe('passed');
    expect(owner.limits).toEqual([expect.stringContaining('the architect view records no such original')]);

    const index = toolkit([]);
    const withCli = { ...index, symbols: new Map([['ramify/cli', [{ module: 'ramify/cli', name: 'enrichImportDiagnosticsFake', file: elsewhere, role: 'internal' as const }]]]) };
    const owned = await fakeExposureParity({ index: withCli, standIns: [standIn({ fakePath: elsewhere })], read: tree({ [elsewhere]: fakeSource }), writeScope: [] });
    expect(owned.violations).toEqual([expect.objectContaining({ rule: 'owner', path: elsewhere })]);

    const testing = 'subs/analysis/src/tests/enrich-import-diagnostics.fake.ts';
    const area = await fakeExposureParity({
      index: toolkit([fakeRecord({ file: testing, tags: ['testing'] })]),
      standIns: [standIn({ fakePath: testing })],
      read: tree({ [testing]: fakeSource }),
      writeScope: [],
    });
    expect(area.violations).toEqual([expect.objectContaining({ rule: 'tags', path: testing })]);
  });

  test('at a later gate, a fake-only exposure the iteration could have written fails, and one it could not is a limit', async () => {
    const registered = standIn({ contract: 'ct-001', declaredHere: false });
    const input = {
      index: toolkit([fakeRecord({ reexposed: reexposedByRoot }), realRecord()]),
      standIns: [registered],
      read: tree({ [fakePath]: fakeSource, ...declarations }),
    };
    const introduced = await fakeExposureParity({ ...input, writeScope: ['subs/cli', 'module.ramify'] });
    expect(introduced.outcome).toBe('failed');
    expect(introduced.violations).toEqual([expect.objectContaining({ rule: 'extra-exposure', path: 'module.ramify' })]);

    const elsewhere = await fakeExposureParity({ ...input, writeScope: ['subs/daemon'] });
    expect(elsewhere.outcome).toBe('passed');
    expect(elsewhere.limits).toEqual([expect.stringContaining('not this iteration\'s: no file that decides it lies in its write scope (module.ramify:')]);

    // The provider that has just written the real export is not failed for
    // an ancestor's step outside its scope; its own declaration is its own.
    const provider = await fakeExposureParity({ ...input, writeScope: ['subs/analysis'] });
    expect(provider.outcome).toBe('passed');
    expect(provider.limits).toHaveLength(1);
    const unexposed = await fakeExposureParity({ ...input, index: toolkit([fakeRecord(), realRecord({ role: 'internal', to: undefined })]), writeScope: ['subs/analysis'] });
    expect(unexposed.outcome).toBe('failed');
    expect(unexposed.violations).toEqual([expect.objectContaining({ rule: 'extra-exposure', path: 'subs/analysis/module.ramify' })]);
    expect(unexposed.violations[0]!.detail).toContain('ramify/analysis exposes the fake');
  });

  test('a retired fake is out of the rule, and a declaration that still exposes it is named', async () => {
    const registered = standIn({ contract: 'ct-001', declaredHere: false });
    const retired = await fakeExposureParity({
      index: toolkit([realRecord()]),
      standIns: [registered],
      read: tree({ 'module.ramify': rootDescription('"ramify"'), 'subs/analysis/module.ramify': 'ramify 1\nmodule analysis\n' }),
      writeScope: ['subs/analysis'],
    });
    expect(retired).toEqual({ rule: 'fake-exposure-parity', outcome: 'passed', violations: [] });

    const stale = await fakeExposureParity({
      index: toolkit([realRecord()]),
      standIns: [registered],
      read: tree(declarations),
      writeScope: ['subs/analysis', 'module.ramify'],
    });
    expect(stale.outcome).toBe('failed');
    expect(stale.violations.map(violation => [violation.rule, violation.path])).toEqual([
      ['retired-fake-exposure', 'module.ramify'],
      ['retired-fake-exposure', 'subs/analysis/module.ramify'],
    ]);
    expect(stale.violations[0]!.detail).toContain('"expose-sub enrichImportDiagnosticsFake from analysis to descendants" still exposes it');

    // A file that no longer exports the fake has retired it as well.
    const emptied = await fakeExposureParity({
      index: toolkit([realRecord()]),
      standIns: [registered],
      read: tree({ [fakePath]: 'export const somethingElseFake = 1;\n' }),
      writeScope: [],
    });
    expect(emptied.outcome).toBe('passed');
  });
});

// A run: the contract gate over the fixture, with a view that answers what
// Ramify would record for the fake and the real limit as the tree stands.

const consumer = 'collection-review/workspace/reviews/notes';
const consumerDirectory = 'subs/workspace/subs/reviews/subs/notes';
const provider = 'collection-review/workspace/reviews/limits';
const providerDirectory = 'subs/workspace/subs/reviews/subs/limits';
const reviews = 'collection-review/workspace/reviews';
const reviewsDeclaration = 'subs/workspace/subs/reviews/module.ramify';

const seam = {
  interface: `${providerDirectory}/src/interfaces/note-limit.ts`,
  fake: `${providerDirectory}/src/fakes/note-limit.fake.ts`,
  conformance: `${providerDirectory}/src/tests/note-limit.conformance.test.ts`,
  real: `${providerDirectory}/src/note-limit.ts`,
  consumer: `${consumerDirectory}/src/notes.ts`,
  declaration: `${providerDirectory}/module.ramify`,
};

/**
 * The run's inputs, with a refresh that answers the architect view as
 * Ramify would record it for this scenario: the fake and the real limit,
 * where each file exists, exposed as the two declarations on its path say.
 */
function viewedTree(): RunInputs {
  const inputs = treeInputs();
  const chain = async (root: string, name: string) => {
    const own = await readFile(join(root, seam.declaration), 'utf8').catch(() => '');
    const parent = await readFile(join(root, reviewsDeclaration), 'utf8').catch(() => '');
    const to = new RegExp(`^expose-src [^\\n]*\\b${name}\\b[^\\n]*to parent`, 'm').test(own) ? ['parent' as const] : [];
    const reexposed = new RegExp(`^expose-sub [^\\n]*\\b${name}\\b[^\\n]*to descendants`, 'm').test(parent)
      ? [{ by: reviews, to: ['descendants' as const] }]
      : [];
    return { role: to.length === 0 ? 'internal' as const : 'exposed' as const, to, reexposed };
  };
  const refresh = async (root: string): Promise<ArchitectIndex> => {
    const declared = await readDeclaredTree(root);
    const records: SymbolRecord[] = [];
    for (const [file, name] of [[seam.fake, 'createNoteLimitFake'], [seam.real, 'createNoteLimit']] as const) {
      const text = await readFile(join(root, file), 'utf8').catch(() => null);
      if (text !== null) records.push({ module: provider, name, file, ...await chain(root, name) });
    }
    return { ...declared, symbols: new Map([[provider, records]]) };
  };
  return { ...inputs, refresh };
}

const stub = 'export function addNote(note) {\n  throw new Error(\'not available yet\');\n}\n';
const consumerTest = "import { test, expect } from 'vitest';\nimport { addNote } from '../notes.ts';\n\ntest('a note over the limit is refused', () => {\n  expect(addNote('x'.repeat(501))).toBe('');\n});\n";
const contractFile = "export const noteLimitCases = [{ note: 'x'.repeat(501), within: false }];\n";
const fakeFile = '/** The fake the consumer implements against. */\nexport function createNoteLimitFake() {\n  return { withinLimit: (note) => note.length <= 500 };\n}\n';
const conformanceFile = "import { test, expect } from 'vitest';\ntest('the agreement holds', () => { expect(1).toBe(1); });\n";
const integrated = "import { createNoteLimitFake } from '../../limits/src/fakes/note-limit.fake.ts';\n\nconst limit = createNoteLimitFake();\n\nexport function addNote(note) {\n  return limit.withinLimit(note) ? note : '';\n}\n";

const need = {
  capability: 'note-limit',
  useCases: ['a note over the limit is refused'],
  inputs: ['the note text'],
  outputs: ['whether the note is within the limit'],
  sideEffects: [],
  constraints: ['at most 500 characters'],
  existingEvidence: [`${consumerDirectory}/src/tests/notes.test.ts`],
};

const placeTheLimit = localDecision(
  { question: 'Where does the note limit belong?', outcome: 'reuse', capability: 'note-limit', owner: provider, rationale: 'The limit is a rule of its own.' },
  [registryChange({ capability: 'note-limit', owner: provider, behavior: 'A note of at most 500 characters is within the limit.' })],
);

/** The agreement as the contract sub-session submits it: the real limit is declared exposed to the parent only. */
const establishedContract = {
  kind: 'established' as const,
  mode: 'fake-backed' as const,
  authority: { kind: 'provider' as const, owner: provider, rationale: 'The note limit belongs with its implementation.' },
  provider,
  behavior: 'A note of at most 500 characters is within the limit.',
  artifacts: {
    interface: [{ path: seam.interface, exports: ['noteLimitCases'] }],
    conformance: [{ path: seam.conformance }],
    fake: [{
      path: seam.fake,
      exports: ['createNoteLimitFake'],
      standsFor: [{ fake: 'createNoteLimitFake', path: seam.real, export: 'createNoteLimit', exposure: { to: ['parent' as const], reexposed: [] } }],
    }],
    exposure: [
      { path: seam.declaration, declaration: 'expose-src createNoteLimitFake from "fakes/note-limit.fake.ts" to parent' },
      { path: reviewsDeclaration, declaration: 'expose-sub createNoteLimitFake from limits to descendants' },
    ],
  },
  fakeInjections: [seam.consumer],
  summary: 'The agreement is established and the consumer runs against the fake.',
};

async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, consumerDirectory, 'notes', { 'src/notes.ts': stub, 'src/tests/notes.test.ts': consumerTest });
  await addModule(fixture.root, providerDirectory, 'limits', {});
  await installMiniRunner(fixture.root);
  return fixture.root;
}

async function run(root: string, plan: Parameters<typeof byRole>[0], commits: readonly CommitResponse[], finalHead: string) {
  const final = finalCandidate(root, finalHead);
  const git = answeredGit(root, { head: 'revision-00', commits: [scenariosCommitted('review-notes'), ...commits], previews: final.previews });
  const opened = await openRuns(root, { script: byRole(plan), inputs: viewedTree(), git,
    candidates: final.candidates, readinessExecution: directReadinessExecution() });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('review-notes'));
  await opened.service.settled('review-notes', receipt.jobId);
  return { ...opened, git, runId: receipt.jobId };
}

describe('the rule at a run\'s contract gate', () => {
  test('a contract that re-exposes its fake where the real export will not be fails the gate in scope, and a repair that removes it passes', async () => {
    const root = await target();
    const reviewsText = await readFile(join(root, reviewsDeclaration), 'utf8');
    const providerText = await readFile(join(root, seam.declaration), 'utf8');
    const withFake = `${providerText.trimEnd()}\nexpose-src createNoteLimitFake from "fakes/note-limit.fake.ts" to parent\n`;
    const reexposing = `${reviewsText.trimEnd()}\n// The notes module uses the stand-in until the provider implements the limit.\nexpose-sub createNoteLimitFake from limits to descendants\n`;

    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-notes', consumer)]))],
      'local-architect': [
        submit({ ...assign(consumer, {}, outline()), localDecisions: [placeTheLimit] }),
        submit({ kind: 'yield-for-providers', requirements: ['rq-001'], summary: 'Waiting for the real limit.' }),
        submit(assign(provider, {}, outline({ changes: 'Implement the agreed limit.' }))),
        submit(requestCompletion()),
        submit(assign(consumer, { kind: 'verification', goal: 'Replace the fake with the real note limit.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit({ kind: 'contract-needed', need, summary: 'The limit is owned elsewhere.' }),
        submit(completionProposed('The real limit is implemented, exposed as the agreement declares it.'),
          write(join(root, seam.real), 'export function createNoteLimit() {\n  return { withinLimit: (note) => note.length <= 500 };\n}\n'),
          write(join(root, seam.declaration), `${withFake.trimEnd()}\nexpose-src createNoteLimit from "note-limit.ts" to parent\n`)),
        submit(completionProposed('The consumer uses the real note limit.'),
          write(join(root, seam.consumer), "import { createNoteLimit } from '../../limits/src/note-limit.ts';\n\nconst limit = createNoteLimit();\n\nexport function addNote(note) {\n  return limit.withinLimit(note) ? note : '';\n}\n")),
      ],
      'contract-engineer': [
        submit(establishedContract,
          write(seam.interface, contractFile), write(seam.fake, fakeFile), write(seam.conformance, conformanceFile),
          write(seam.declaration, withFake), write(reviewsDeclaration, reexposing), write(seam.consumer, integrated)),
        // The repair: the fake is exposed exactly as the real limit will be.
        submit({ ...establishedContract, artifacts: { ...establishedContract.artifacts, exposure: [establishedContract.artifacts.exposure[0]!] } },
          write(reviewsDeclaration, reviewsText)),
      ],
    }, [
      accepted('wi-001.i02', 'revision-01', [...added(seam.interface, seam.fake, seam.conformance), ...modified(seam.consumer, seam.declaration, reviewsDeclaration)]),
      accepted('wi-001.i02', 'revision-02', modified(reviewsDeclaration)),
      accepted('wi-002.i01', 'revision-03', [...added(seam.real), ...modified(seam.declaration)]),
      unchanged('wi-002'),
      accepted('wi-001.i03', 'revision-04', modified(seam.consumer)),
      unchanged('wi-001'),
      unchanged('final verification of plan "review-notes"'),
    ], 'revision-04');
    expect(onlyRun(service, 'review-notes').failure).toBeNull();
    expect(onlyRun(service, 'review-notes').state).toBe('completed');

    const log = await runEventsOnDisk(root, 'review-notes', runId);
    const gateIds = [...new Set(log.filter(event => event.type === 'gate-attempted').map(event => event.data.gate))];
    const attempts = await Promise.all(gateIds.map(async id =>
      JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.gate(id)), 'utf8')) as GateAttempt));

    const [first, repaired] = attempts.filter(attempt => attempt.checkpoint === 'contract');
    // Every command passed; the verdict is the rule's, and the repair is the engineer's.
    expect(first!.verdict).toBe('failed');
    expect(first!.commands.every(command => command.outcome === 'passed')).toBe(true);
    expect(first!.cause).toBe('check-failed');
    expect(first!.next).toBe('repair');
    const parity = first!.rules!.find(rule => rule.rule === 'fake-exposure-parity')!;
    expect(parity.outcome).toBe('failed');
    expect(parity.violations).toEqual([{ rule: 'extra-exposure', path: reviewsDeclaration, detail: expect.stringContaining(`${reviews} re-exposes the fake \`createNoteLimitFake\``) }]);
    expect(parity.violations[0]!.detail).toContain(`\`createNoteLimit\` (${seam.real})`);
    expect(parity.violations[0]!.detail).toContain(consumer);

    expect(repaired!.verdict).toBe('passed');
    expect(repaired!.rules).toEqual([
      { rule: 'fake-naming', outcome: 'passed', violations: [] },
      { rule: 'fake-exposure-parity', outcome: 'passed', violations: [] },
      { rule: 'scratch-safety', outcome: 'passed', violations: [] },
    ]);

    // The registered agreement names what the fake stands for.
    const contract = JSON.parse(await readFile(runPath(root, 'review-notes', runId, 'contracts/ct-001/1.json'), 'utf8')) as { schema: string; artifacts: { fake: Array<{ standsFor: unknown[] }> } };
    expect(contract.schema).toBe('ramify-agent.contract/2');
    expect(contract.artifacts.fake[0]!.standsFor).toEqual(establishedContract.artifacts.fake[0]!.standsFor);

    // The provider's gate compared the fake with the real limit as the view
    // recorded it once it existed: both exposed to the parent, so it passed.
    const providerGate = attempts.find(attempt => attempt.subject.iteration === 'wi-002.i01')!;
    expect(providerGate.verdict).toBe('passed');
    expect(providerGate.rules).toEqual([
      { rule: 'fake-exposure-parity', outcome: 'passed', violations: [] },
      { rule: 'scratch-safety', outcome: 'passed', violations: [] },
    ]);
    git.assertAnswered();
  }, 120_000);
});
