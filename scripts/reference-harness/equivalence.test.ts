import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import { assertEquivalentReports, firstDifference, parseAnalysisDocument } from './equivalence-comparison.js';
import { assertResidentTrace } from './equivalence-process.js';
import type { SequenceProcess } from './equivalence-process.js';
import { applySequenceStep, assertSequenceReport, equivalenceSequences, prepareSequence, sequenceFixture } from './equivalence-sequences.js';
import type { SequenceName } from './equivalence-sequences.js';
import { watchEditTargetMs, watchRevision, withLiveWatch } from './equivalence-watch.js';
import { filesBelow } from './reference-baseline.js';
import { runIsolatedProject } from './mutation.js';
import { repositoryRoot } from './plan.js';
import { sessionReport } from './session-expectations.js';
import { Assertions } from './runner.js';

const document = { schemaVersion: 'ramify.analysis/1', runId: 'a', inputId: 'input/1:one', stages: [], capabilities: [],
  request: {}, scope: null, registry: null, outcome: {}, snapshot: { linked: { selections: [{ name: 'Type' }] } },
  diagnostics: [], warnings: [], coverage: [], summary: {} };
const report = () => structuredClone(document) as unknown as AnalysisReport;

describe('strict equivalence comparison controls', () => {
  it('ignores only top-level runId and JSON object key order', () => {
    const a = report(), b = { ...report(), runId: 'b' };
    expect(() => assertEquivalentReports(a, b)).not.toThrow();
    expect(a.runId).toBe('a');
    expect(firstDifference({ b: 1, a: 2 }, { a: 2, b: 1 })).toBeNull();
    expect(firstDifference({ runId: { runId: 1 } }, { runId: { runId: 2 } })).toBe('$.runId.runId');
    expect(firstDifference([1, 2], [2, 1])).toBe('$[0]');
    expect(firstDifference({ absent: null }, {})).toBe('$.absent');
    expect(firstDifference([], {})).toBe('$');
  });
  it.each(['stages', 'capabilities', 'outcome', 'snapshot', 'diagnostics', 'warnings', 'coverage', 'summary', 'inputId'])
  ('rejects drift in %s with its first differing path', key => {
    const changed = { ...report(), [key]: 'changed' };
    expect(() => assertEquivalentReports(report(), changed)).toThrow(`$.${key}`);
  });
  it('rejects missing/added report fields, coverage loss and wildcard membership loss', () => {
    expect(() => assertEquivalentReports(report(), { ...report(), resident: {} } as AnalysisReport)).toThrow('$.resident');
    const missing = report(); delete (missing as unknown as Record<string, unknown>).warnings;
    expect(() => assertEquivalentReports(report(), missing)).toThrow('$.warnings');
    expect(firstDifference({ coverage: ['unsupported-loader'] }, { coverage: [] })).toBe('$.coverage.length');
    expect(firstDifference(document, { ...document, snapshot: { linked: { selections: [] } } }))
      .toBe('$.snapshot.linked.selections.length');
    expect(() => parseAnalysisDocument(JSON.stringify({ report: document }))).toThrow('bare analysis document');
    expect(() => parseAnalysisDocument(JSON.stringify({ ...document, resident: {} }))).toThrow('exactly the Plan 1 report members');
    expect(() => parseAnalysisDocument(JSON.stringify(document) + '\n' + JSON.stringify(document))).toThrow();
  });
  it('requires the CLI itself to connect and rejects implicit batch execution', () => {
    const connect = { pid: 10, event: 'connect', path: '/owned/daemon.sock' };
    expect(() => assertResidentTrace([connect], 10, '/owned')).not.toThrow();
    expect(() => assertResidentTrace([connect], 11, '/owned')).toThrow('must connect');
    expect(() => assertResidentTrace([connect], 10, '/foreign')).toThrow('must connect');
    for (const url of ['file:///pkg/dist/src/batch.js', 'file:///pkg/dist/subs/analysis/src/index.js']) {
      expect(() => assertResidentTrace([connect, { pid: 10, event: 'load', url }], 10, '/owned')).toThrow('batch/analysis');
    }
  });
  it('keeps timing advisory while rejecting stale, substituted and incorrectly attributed watch revisions', () => {
    const token = { context: 'ctx/1:c', generation: 'gen/1:g' };
    const value = { event: 'revision', revision: { token, revision: 'rev/1:r', sequence: 2, cause: 'watch',
      changed: ['source.ts'], fingerprints: { inputId: document.inputId }, summary: {}, outcome: {} }, report: document };
    const line = { value, arrivedAt: 200 };
    expect(watchRevision(line, token, 1, 100, ['source.ts']).elapsedMs).toBe(100);
    expect(() => watchRevision(line, token, 2, 100, ['source.ts'])).toThrow('advance');
    expect(() => watchRevision(line, {}, 1, 100, ['source.ts'])).toThrow('generation');
    expect(() => watchRevision(line, token, 1, 100, ['other.ts'])).toThrow('Changed paths');
    expect(watchRevision({ ...line, arrivedAt: 101 + watchEditTargetMs }, token, 1, 100, ['source.ts']).elapsedMs).toBe(watchEditTargetMs + 1);
    expect(() => watchRevision({ ...line, arrivedAt: NaN }, token, 1, 100, ['source.ts'])).toThrow('finite');
    expect(() => watchRevision({ ...line, value: { ...value, report: { ...document, inputId: 'stale' } } }, token, 1, 100, ['source.ts']))
      .toThrow('different inputs');
  });
});

describe('watch stdout reader controls without a daemon', () => {
  it.each(['fragmented', 'coalesced', 'exact-boundary', 'oversized', 'malformed', 'partial-exit', 'silent'])
  ('handles %s without confusing chunks with lines', async mode => {
    const work = join(repositoryRoot, '.reference-work');
    await mkdir(work, { recursive: true });
    const owned = await mkdtemp(join(work, 'watch-reader-')), pidFile = join(owned, 'pid');
    const unused = async (): Promise<never> => { throw new Error('Reader controls cannot call daemon operations'); };
    const fixture: SequenceProcess = {
      executable: join(repositoryRoot, 'scripts/reference-harness/fixtures/plan2/watch-stream.mjs'),
      environment: { ...process.env, NODE_OPTIONS: '', RAMIFY_WATCH_CONTROL: mode, RAMIFY_WATCH_CONTROL_PID: pidFile },
      traceFile: '', endpoint: '', run: unused, check: unused, status: unused,
    };
    try {
      const run = withLiveWatch(fixture, owned, async next => {
        const first = await next(30_000);
        expect(first.value.index).toBe(1);
        if (mode === 'silent') await next(100);
        if (mode === 'exact-boundary') expect(Buffer.byteLength(JSON.stringify(first.value))).toBe(32 * 1024 ** 2 + 65536);
        if (mode === 'coalesced' || mode === 'exact-boundary') expect((await next(5000)).value.index).toBe(2);
      });
      if (mode === 'oversized') await expect(run).rejects.toThrow('Watch line exceeds response bound');
      else if (mode === 'malformed') await expect(run).rejects.toBeInstanceOf(SyntaxError);
      else if (mode === 'partial-exit') await expect(run).rejects.toThrow('Watch exited before its next line');
      else if (mode === 'silent') await expect(run).rejects.toThrow('Watch event exceeded 100 ms');
      else await run; // Also requires exit 130, empty stderr and no partial line.
      const pid = Number(await readFile(pidFile, 'utf8'));
      expect(() => process.kill(pid, 0)).toThrowError(expect.objectContaining({ code: 'ESRCH' }));
    } finally { await rm(owned, { recursive: true, force: true }); }
  }, 40_000);
});

// Materialization and batch-oracle coverage only; these tests never credit I2-25/I2-26.
describe('recorded edit sequences', () => {
  it('keeps the reviewed sequence lengths and every explicit anchor', () => {
    expect(Object.keys(equivalenceSequences)).toHaveLength(9);
    expect(equivalenceSequences['reference-sequence'].steps).toHaveLength(10);
    expect(equivalenceSequences['hundred-owner-sequence'].steps).toHaveLength(5);
    expect(Object.values(equivalenceSequences).every(s => s.steps.every(step => step.anchor && step.edits.length))).toBe(true);
  });
  it('rejects both missing and duplicate sequence anchors without changing bytes', async () => {
    const sequence = equivalenceSequences['reference-sequence'];
    const result = await runIsolatedProject({ workRoot: join(repositoryRoot, '.reference-work'), instanceId: 'I2-25:anchor-controls',
      fixture: sequenceFixture('R') }, async ({ root }) => {
      const path = join(root, 'subs/workspace/module.ramify');
      const original = await readFile(path, 'utf8');
      for (const content of ['ramify 1\nmodule workspace\n', original + original]) {
        await writeFile(path, content);
        await expect(applySequenceStep(root, sequence.steps[0])).rejects.toThrow('exactly one mutation anchor');
        expect(await readFile(path, 'utf8')).toBe(content);
      }
    });
    if (!result.ok) throw result.error;
  });
  it.each(Object.keys(equivalenceSequences) as SequenceName[])('%s has independent batch outcomes at every step', async name => {
    const sequence = equivalenceSequences[name];
    const result = await runIsolatedProject({ workRoot: join(repositoryRoot, '.reference-work'), instanceId: `I2-25:oracle-${name}`,
      fixture: sequenceFixture(sequence.fixture) }, async ({ root }) => {
      await prepareSequence(root, sequence.fixture);
      const baseline = await sessionReport(root);
      assertSequenceReport(sequence.fixture, null, baseline, baseline, new Assertions());
      const before = new Map(await Promise.all((await filesBelow(root)).map(async path => [path, await readFile(join(root, path), 'utf8')] as const)));
      let previous = baseline;
      for (const step of sequence.steps) {
        await applySequenceStep(root, step);
        const current = await sessionReport(root);
        assertSequenceReport(sequence.fixture, step, baseline, current, new Assertions());
        expect(current.inputId).not.toBe(previous.inputId);
        if (step.expected !== 'baseline' && step.expected !== 's100-restored') {
          expect(() => assertSequenceReport(sequence.fixture, step, baseline, baseline, new Assertions())).toThrow();
        }
        if (step.expected === 's100-restored') {
          expect(() => assertSequenceReport(sequence.fixture, step, baseline, previous, new Assertions())).toThrow();
        }
        previous = current;
      }
      if (name === 'hundred-owner-sequence') {
        expect(await filesBelow(root)).toEqual([...before.keys()]);
        for (const [path, content] of before) expect(await readFile(join(root, path), 'utf8')).toBe(content);
      }
    });
    if (!result.ok) throw result.error;
  }, 120_000);
});
